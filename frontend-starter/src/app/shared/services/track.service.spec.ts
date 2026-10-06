import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrackService } from './track.service';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

declare function describe(description: string, specDefinitions: () => void): void;
declare function beforeEach(action: () => void): void;
declare function afterEach(action: () => void): void;
declare function it(description: string, testFunction: () => void): void;
declare function expect(actual: unknown): any;

describe('TrackService', () => {
  let service: TrackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TrackService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(TrackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Vérifie qu'aucune requête HTTP inattendue n'est restée en suspens
    httpMock.verify();
  });

  // TEST 1 : Vérification des query params de pagination (page & limit)
  it('list() doit transmettre correctement les paramètres page et limit via GET /api/tracks', () => {
    const mockPage: Page<Track> = {
      items: [
        {
          id: '1',
          title: 'Solo Rock',
          originalName: 'solo.mp3',
          size: 2048,
          mimeType: 'audio/mpeg',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      pages: 3,
      limit: 5,
    };

    service.list(2, 5).subscribe((res) => {
      expect(res).toEqual(mockPage);
      expect(res.items.length).toBe(1);
      expect(res.page).toBe(2);
    });

    const req = httpMock.expectOne((request) => {
      return (
        request.url === '/api/tracks' &&
        request.params.get('page') === '2' &&
        request.params.get('limit') === '5'
      );
    });

    expect(req.request.method).toBe('GET');

    // Résolution simulée de la réponse
    req.flush(mockPage);
  });

  // TEST 3 : Exécution de la méthode DELETE sur l'URL ciblée
  it('delete() doit appeler DELETE /api/tracks/:id avec la méthode DELETE', () => {
    const trackId = 'track-123';

    service.delete(trackId).subscribe((res) => {
      expect(res).toBeNull();
    });

    const req = httpMock.expectOne(`/api/tracks/${trackId}`);

    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();

    // Simulation d'une réponse 204 No Content ou 200 OK
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});