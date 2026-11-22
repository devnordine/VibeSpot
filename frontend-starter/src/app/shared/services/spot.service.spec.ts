import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpotService } from './spot.service';
import { Page } from '../models/page.model';
import { Spot } from '../models/spot.model';

/** Fabrique un Spot minimal conforme à `toPublic()`. */
function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'spot-1',
    title: 'Café Koohi',
    description: 'Café calme pour travailler',
    category: 'cafe',
    moods: ['travail', 'calme'],
    budget: 1,
    address: '12 Rue de France',
    city: 'Nice',
    postalCode: '06000',
    location: { type: 'Point', coordinates: [7.2612, 43.6974] },
    longitude: 7.2612,
    latitude: 43.6974,
    coverPhoto: '',
    photos: [],
    createdBy: 'user-1',
    ratingAverage: 4.5,
    ratingCount: 2,
    favoritesCount: 3,
    affluence: 'moderee',
    ambianceScore: 0,
    tags: [],
    reviews: [],
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function makePage(items: Spot[], page = 1, pages = 1): Page<Spot> {
  return { items, page, pages, limit: 12, total: items.length };
}

describe('SpotService', () => {
  let service: SpotService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SpotService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SpotService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() ne transmet que les filtres renseignés', () => {
    service
      .list({ mood: 'travail', category: undefined, search: '   ', budget: 2, sort: 'recent' }, 2, 12)
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/spots');
    const params = req.request.params;

    expect(req.request.method).toBe('GET');
    expect(params.get('mood')).toBe('travail');
    expect(params.get('budget')).toBe('2');
    expect(params.get('sort')).toBe('recent');
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('12');
    // Filtres vides ou composés d'espaces : jamais envoyés
    expect(params.has('category')).toBe(false);
    expect(params.has('search')).toBe(false);

    req.flush(makePage([]));
  });

  it('list() convertit le rayon km en maxDistance (mètres) uniquement si lat/lng sont connus', () => {
    service.list({ lat: 43.7, lng: 7.26, radiusKm: 5 }).subscribe();
    const withGps = httpMock.expectOne((r) => r.url === '/api/spots');
    expect(withGps.request.params.get('lat')).toBe('43.7');
    expect(withGps.request.params.get('lng')).toBe('7.26');
    expect(withGps.request.params.get('maxDistance')).toBe('5000');
    withGps.flush(makePage([]));

    service.list({ radiusKm: 5 }).subscribe();
    const withoutGps = httpMock.expectOne((r) => r.url === '/api/spots');
    expect(withoutGps.request.params.has('maxDistance')).toBe(false);
    withoutGps.flush(makePage([]));
  });

  it('getById() appelle GET /api/spots/:id', () => {
    const spot = makeSpot({ id: 'abc123' });
    let received: Spot | undefined;

    service.getById('abc123').subscribe((s) => (received = s));

    const req = httpMock.expectOne('/api/spots/abc123');
    expect(req.request.method).toBe('GET');
    req.flush(spot);
    expect(received?.title).toBe('Café Koohi');
  });

  it('create() envoie un FormData en POST /api/spots et expose la réponse finale', () => {
    const body = new FormData();
    body.append('title', 'Nouveau spot');
    body.append('category', 'parc');
    body.append('photo', new File(['img'], 'photo.png', { type: 'image/png' }));

    let created: Spot | undefined;
    service.create(body).subscribe((event) => {
      if (event.type === HttpEventType.Response) created = event.body ?? undefined;
    });

    const req = httpMock.expectOne('/api/spots');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('title')).toBe('Nouveau spot');
    expect(req.request.reportProgress).toBe(true);

    req.flush(makeSpot({ id: 'new-1', title: 'Nouveau spot' }), { status: 201, statusText: 'Created' });
    expect(created?.id).toBe('new-1');
  });

  it('load() met à jour les signals spots, page, pages et loading en cas de succès', () => {
    service.load(1);
    expect(service.loading()).toBe(true);

    const req = httpMock.expectOne((r) => r.url === '/api/spots');
    req.flush(makePage([makeSpot(), makeSpot({ id: 'spot-2' })], 1, 3));

    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.spots().length).toBe(2);
    expect(service.hasResults()).toBe(true);
    expect(service.pages()).toBe(3);
    expect(service.hasNextPage()).toBe(true);
    expect(service.hasPreviousPage()).toBe(false);
  });

  it('load() renseigne le signal error et vide la liste en cas d’erreur HTTP', () => {
    service.load(1);

    const req = httpMock.expectOne((r) => r.url === '/api/spots');
    req.flush({ message: 'Erreur interne du serveur' }, { status: 500, statusText: 'Server Error' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Erreur interne du serveur');
    expect(service.spots().length).toBe(0);
    expect(service.isEmpty()).toBe(false);
  });

  it('map(), trending() et toggleFavorite() appellent les bonnes routes', () => {
    service.map({ mood: 'calme', category: undefined }).subscribe();
    const map = httpMock.expectOne((r) => r.url === '/api/spots/map');
    expect(map.request.params.get('mood')).toBe('calme');
    expect(map.request.params.has('category')).toBe(false);
    map.flush([]);

    service.trending(3).subscribe();
    httpMock.expectOne('/api/spots/trending?limit=3').flush([]);

    service.toggleFavorite('a b').subscribe();
    const fav = httpMock.expectOne('/api/spots/a%20b/favorite'); // id encodé dans l'URL
    expect(fav.request.method).toBe('POST');
    fav.flush({ favorited: true, favoritesCount: 1 });
  });

  it('addReview() et deleteReview() envoient le bon verbe et le bon corps', () => {
    service.addReview('s1', { rating: 5, comment: 'Top' }).subscribe();
    const add = httpMock.expectOne('/api/spots/s1/reviews');
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ rating: 5, comment: 'Top' });
    add.flush(makeSpot());

    service.deleteReview('s1', 'r9').subscribe();
    const del = httpMock.expectOne('/api/spots/s1/reviews/r9');
    expect(del.request.method).toBe('DELETE');
    del.flush(makeSpot());
  });

  it('addPhoto() envoie le fichier dans le champ « photo »', () => {
    service.addPhoto('s1', new File(['x'], 'a.png', { type: 'image/png' }), 'Vue mer').subscribe();
    const req = httpMock.expectOne('/api/spots/s1/photos');
    const body = req.request.body as FormData;
    expect(body.get('photo') instanceof File).toBe(true);
    expect(body.get('caption')).toBe('Vue mer');
    req.flush(makeSpot());
  });

  it('resetFilters() garde la position et le rayon « Autour de moi »', () => {
    service.updateFilters({ mood: 'festif', lat: 43.7, lng: 7.26, radiusKm: 3 });
    httpMock.expectOne((r) => r.url === '/api/spots').flush(makePage([]));

    service.resetFilters();
    httpMock.expectOne((r) => r.url === '/api/spots').flush(makePage([]));

    expect(service.filters()).toEqual({ sort: 'recent', lat: 43.7, lng: 7.26, radiusKm: 3 });
    expect(service.activeFiltersCount()).toBe(0);
  });

  it('errorMessage() traduit les erreurs HTTP en messages lisibles', () => {
    expect(SpotService.errorMessage(new HttpErrorResponse({ status: 0 }))).toContain('Serveur injoignable');
    expect(SpotService.errorMessage(new HttpErrorResponse({ status: 404 }))).toBe('Spot introuvable.');
    expect(SpotService.errorMessage(new HttpErrorResponse({ status: 502 }))).toBe('Erreur serveur (502).');
    expect(SpotService.errorMessage(new Error('boom'))).toBe('Une erreur inattendue est survenue.');
  });

  it('updateFilters() fusionne les filtres, revient page 1 et annule la requête précédente', () => {
    service.load(2);
    const first = httpMock.expectOne((r) => r.url === '/api/spots');

    service.updateFilters({ mood: 'festif' });
    expect(first.cancelled).toBe(true);
    expect(service.filters().mood).toBe('festif');
    expect(service.filters().sort).toBe('recent');
    expect(service.activeFiltersCount()).toBe(1);

    const second = httpMock.expectOne((r) => r.url === '/api/spots');
    expect(second.request.params.get('page')).toBe('1');
    expect(second.request.params.get('mood')).toBe('festif');
    second.flush(makePage([]));
  });
});
