import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';
import { Page } from '../models/page.model';
import {
  FavoriteToggle,
  Review,
  ReviewPayload,
  Spot,
  SpotFilters,
  SpotMarker,
} from '../models/spot.model';

const API = '/api/spots';
const DEFAULT_LIMIT = 12;

/**
 * Service central du domaine Spot.
 * - Les méthodes HTTP « pures » renvoient des Observables (testables, réutilisables).
 * - `load()` orchestre l'état réactif partagé (signals) consommé par les pages.
 */
@Injectable({ providedIn: 'root' })
export class SpotService {
  private readonly http = inject(HttpClient);
  private loadSubscription?: Subscription;

  // --- État réactif ---------------------------------------------------------
  private readonly _spots = signal<Spot[]>([]);
  private readonly _filters = signal<SpotFilters>({ sort: 'recent' });
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _page = signal(1);
  private readonly _pages = signal(1);
  private readonly _total = signal(0);

  readonly spots = this._spots.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly page = this._page.asReadonly();
  readonly pages = this._pages.asReadonly();
  readonly total = this._total.asReadonly();

  // --- État dérivé -----------------------------------------------------------
  readonly hasResults = computed(() => this._spots().length > 0);
  readonly isEmpty = computed(() => !this._loading() && !this._error() && this._spots().length === 0);
  readonly hasNextPage = computed(() => this._page() < this._pages());
  readonly hasPreviousPage = computed(() => this._page() > 1);
  /** Nombre de filtres actifs (hors tri), utile pour un badge « Filtres (n) ». */
  readonly activeFiltersCount = computed(() => {
    const { sort: _sort, lat: _lat, lng: _lng, ...rest } = this._filters();
    return Object.values(rest).filter((v) => v !== undefined && v !== '').length;
  });

  // --- Requêtes HTTP ---------------------------------------------------------

  /** `GET /api/spots` — recherche paginée multi-critères. */
  list(filters: SpotFilters = {}, page = 1, limit = DEFAULT_LIMIT): Observable<Page<Spot>> {
    const params = this.toParams(filters).set('page', page).set('limit', limit);
    return this.http.get<Page<Spot>>(API, { params });
  }

  /** `GET /api/spots/map` — marqueurs allégés pour la carte. */
  map(filters: Pick<SpotFilters, 'mood' | 'category' | 'city'> = {}): Observable<SpotMarker[]> {
    return this.http.get<SpotMarker[]>(`${API}/map`, { params: this.toParams(filters) });
  }

  /** `GET /api/spots/trending` */
  trending(limit = 6): Observable<Spot[]> {
    return this.http.get<Spot[]>(`${API}/trending`, { params: { limit } });
  }

  /** `GET /api/spots/:id` */
  getById(id: string): Observable<Spot> {
    return this.http.get<Spot>(`${API}/${encodeURIComponent(id)}`);
  }

  /**
   * `POST /api/spots` (multipart/form-data, champ `photo` optionnel).
   * Renvoie le flux d'événements HTTP pour suivre la progression de l'upload.
   */
  create(body: FormData): Observable<HttpEvent<Spot>> {
    return this.http.post<Spot>(API, body, { reportProgress: true, observe: 'events' });
  }

  /** `POST /api/spots/:id/photos` (multipart, champ `photo`). */
  addPhoto(id: string, file: File, caption = ''): Observable<HttpEvent<Spot>> {
    const body = new FormData();
    body.append('photo', file);
    if (caption) body.append('caption', caption);
    return this.http.post<Spot>(`${API}/${encodeURIComponent(id)}/photos`, body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** `POST /api/spots/:id/favorite` (toggle). */
  toggleFavorite(id: string): Observable<FavoriteToggle> {
    return this.http.post<FavoriteToggle>(`${API}/${encodeURIComponent(id)}/favorite`, null);
  }

  /** `POST /api/spots/:id/reviews` — renvoie le spot mis à jour. */
  addReview(id: string, payload: ReviewPayload): Observable<Spot> {
    return this.http.post<Spot>(`${API}/${encodeURIComponent(id)}/reviews`, payload);
  }

  /** `DELETE /api/spots/:id/reviews/:reviewId` — renvoie le spot mis à jour. */
  deleteReview(id: string, reviewId: Review['id']): Observable<Spot> {
    return this.http.delete<Spot>(
      `${API}/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`,
    );
  }

  // --- Orchestration de l'état ----------------------------------------------

  /** Fusionne de nouveaux filtres, revient à la page 1 et recharge. */
  updateFilters(patch: Partial<SpotFilters>): void {
    this._filters.update((current) => ({ ...current, ...patch }));
    this.load(1);
  }

  /** Réinitialise tous les filtres (conserve la position GPS éventuelle). */
  resetFilters(): void {
    const { lat, lng } = this._filters();
    this._filters.set({ sort: 'recent', lat, lng });
    this.load(1);
  }

  /**
   * Charge une page avec les filtres courants et met à jour les signals.
   * Une nouvelle requête annule la précédente pour éviter qu'une réponse
   * tardive n'écrase un résultat plus récent (race condition).
   */
  load(page = this._page()): void {
    this.loadSubscription?.unsubscribe();
    this._loading.set(true);
    this._error.set(null);

    this.loadSubscription = this.list(this._filters(), page).subscribe({
      next: (res) => {
        this._spots.set(res.items);
        this._page.set(res.page);
        this._pages.set(res.pages);
        this._total.set(res.total);
        this._loading.set(false);
      },
      error: (err: unknown) => {
        this._spots.set([]);
        this._error.set(SpotService.errorMessage(err));
        this._loading.set(false);
      },
    });
  }

  /** Remplace localement un spot (après favori, avis, ajout de photo…). */
  patchLocal(updated: Spot): void {
    this._spots.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  /** Construit des `HttpParams` en n'envoyant que les filtres renseignés. */
  private toParams(filters: SpotFilters): HttpParams {
    let params = new HttpParams();
    const { radiusKm, lat, lng, search, ...rest } = filters;

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }

    const term = search?.trim();
    if (term) params = params.set('search', term);

    // Le filtre de distance n'a de sens qu'avec une position connue.
    if (lat !== undefined && lng !== undefined) {
      params = params.set('lat', lat).set('lng', lng);
      if (radiusKm !== undefined) {
        params = params.set('maxDistance', Math.round(radiusKm * 1000));
      }
    }
    return params;
  }

  /** Traduit une erreur HTTP en message lisible pour l'UI. */
  static errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Serveur injoignable. Vérifiez que l’API est démarrée.';
      if (err.status === 404) return 'Spot introuvable.';
      const apiMessage = (err.error as { message?: string } | null)?.message;
      if (apiMessage) return apiMessage;
      return `Erreur serveur (${err.status}).`;
    }
    return 'Une erreur inattendue est survenue.';
  }
}
