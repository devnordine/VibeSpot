import { Component, computed, DestroyRef, effect, inject, linkedSignal, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SpotMapComponent } from '../spot-map/spot-map';
import { SpotFormModalComponent } from '../spot-form-modal/spot-form-modal';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { SpotCardComponent } from '../spot-card/spot-card';
import {
  Budget,
  BUDGETS,
  CATEGORIES,
  CATEGORY_LABELS,
  Category,
  LatLng,
  Mood,
  MOOD_LABELS,
  MOODS,
  Spot,
  SpotMarker,
} from '../../shared/models/spot.model';
import { SpotService } from '../../shared/services/spot.service';

/**
 * Vue d'accueil /explore : écran partagé recherche (gauche) / carte (droite).
 */
@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [ReactiveFormsModule, SpotCardComponent, SpotMapComponent, SpotFormModalComponent],
  templateUrl: './explore-page.html',
  styleUrl: './explore-page.css',
})
export class ExplorePageComponent implements OnInit {
  protected readonly spotService = inject(SpotService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly moods = MOODS;
  protected readonly moodLabels = MOOD_LABELS;
  protected readonly categories = CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly budgets = BUDGETS;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly radiusKm = new FormControl(10, { nonNullable: true });

  // --- Sections « Tendance » et « Récemment ajoutés » ---
  protected readonly trending = signal<Spot[]>([]);
  protected readonly recent = signal<Spot[]>([]);

  // --- Favoris ---
  /** Ids des favoris : initialisés depuis le profil, puis mis à jour localement. */
  protected readonly favoriteIds = linkedSignal(
    () => new Set(this.authService.currentUser()?.favorites ?? []),
  );
  /** Id du spot dont la requête favori est en cours (anti double-clic). */
  protected readonly favoritePending = signal<string | null>(null);

  // --- Carte ---
  protected readonly markers = signal<SpotMarker[]>([]);
  /** Seuls l'humeur et la catégorie influencent les marqueurs (equal évite les rechargements inutiles). */
  private readonly mapFilters = computed(
    () => ({ mood: this.spotService.filters().mood, category: this.spotService.filters().category }),
    { equal: (a, b) => a.mood === b.mood && a.category === b.category },
  );

  /** Incrémenté pour forcer le rechargement des marqueurs. */
  private readonly markersVersion = signal(0);

  // --- Création de spot ---
  protected readonly formOpen = signal(false);
  protected readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  // --- Géolocalisation « Autour de moi » ---
  protected readonly userPosition = signal<LatLng | null>(null);
  protected readonly locating = signal(false);
  protected readonly geoMessage = signal<string | null>(null);
  /** Valeur du curseur en direct (pour le cercle), même avant l'envoi au serveur. */
  protected readonly radiusValue = toSignal(this.radiusKm.valueChanges, { initialValue: this.radiusKm.value });

  /** Message d'erreur adapté : le filtre de distance peut échouer côté serveur (bug connu). */
  protected readonly errorMessage = computed(() => {
    const error = this.spotService.error();
    if (!error) return null;
    const status = this.spotService.errorStatus() ?? 0;
    if (status >= 500 && this.spotService.filters().lat !== undefined) {
      return 'La recherche par distance est momentanément indisponible. Désactivez « Autour de moi » pour voir tous les spots.';
    }
    return error;
  });

  constructor() {
    // Le rayon n'est envoyé au serveur que si la position est connue, et pas à chaque cran du curseur.
    this.radiusKm.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((radiusKm) => {
        if (this.userPosition()) this.spotService.updateFilters({ radiusKm });
      });

    // Recherche texte : on attend 300 ms après la dernière frappe avant d'appeler l'API.
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => this.spotService.updateFilters({ search }));

    // Recharge les marqueurs quand l'humeur ou la catégorie change (ou après une création).
    effect((onCleanup) => {
      const filters = this.mapFilters();
      this.markersVersion();
      const sub = this.spotService.map(filters).subscribe({
        next: (markers) => this.markers.set(markers),
        error: () => this.markers.set([]),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Demande la position GPS et active le filtre de rayon. */
  protected locate(): void {
    if (!('geolocation' in navigator)) {
      this.geoMessage.set('La géolocalisation n’est pas disponible sur ce navigateur.');
      return;
    }
    this.locating.set(true);
    this.geoMessage.set(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        this.userPosition.set(position);
        this.locating.set(false);
        this.spotService.updateFilters({ ...position, radiusKm: this.radiusKm.value });
      },
      (error) => {
        this.locating.set(false);
        this.geoMessage.set(
          error.code === error.PERMISSION_DENIED
            ? 'Position refusée : les spots sont affichés sans filtre de distance.'
            : 'Impossible de récupérer votre position pour le moment.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  /** Désactive « Autour de moi » : plus de lat/lng envoyés à l'API. */
  protected stopLocate(): void {
    this.userPosition.set(null);
    this.geoMessage.set(null);
    this.spotService.updateFilters({ lat: undefined, lng: undefined, radiusKm: undefined });
  }

  /** Après création : fermeture, message, et rechargement liste + carte + récents. */
  protected onSpotCreated({ spot, failedPhotos }: { spot: Spot; failedPhotos: number }): void {
    this.formOpen.set(false);
    this.showToast(
      failedPhotos
        ? `« ${spot.title} » a été publié, mais ${failedPhotos} photo(s) n'ont pas pu être envoyées.`
        : `« ${spot.title} » a été publié !`,
    );
    this.spotService.load(1);
    this.markersVersion.update((v) => v + 1);
    this.loadHighlights();
  }

  private showToast(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

  protected openSpot(id: string): void {
    void this.router.navigate(['/spots', id]);
  }

  ngOnInit(): void {
    this.spotService.load(1);
    this.loadHighlights();
  }

  /** Charge les carrousels (indépendants des filtres). */
  protected loadHighlights(): void {
    this.spotService
      .trending(6)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (spots) => this.trending.set(spots), error: () => this.trending.set([]) });
    this.spotService
      .list({ sort: 'recent' }, 1, 6)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (page) => this.recent.set(page.items), error: () => this.recent.set([]) });
  }

  protected toggleFavorite(spot: Spot): void {
    if (this.favoritePending()) return;
    this.favoritePending.set(spot.id);

    this.spotService.toggleFavorite(spot.id).subscribe({
      next: ({ favorited, favoritesCount }) => {
        this.favoriteIds.update((ids) => {
          const next = new Set(ids);
          if (favorited) next.add(spot.id);
          else next.delete(spot.id);
          return next;
        });
        // Mise à jour du compteur partout où le spot est affiché, sans recharger.
        const patch = (s: Spot): Spot => (s.id === spot.id ? { ...s, favoritesCount } : s);
        this.spotService.patchLocal({ ...spot, favoritesCount });
        this.trending.update((list) => list.map(patch));
        this.recent.update((list) => list.map(patch));
        this.favoritePending.set(null);
      },
      error: () => this.favoritePending.set(null),
    });
  }

  protected toggleMood(mood: Mood): void {
    const current = this.spotService.filters().mood;
    this.spotService.updateFilters({ mood: current === mood ? undefined : mood });
  }

  protected selectCategory(value: string): void {
    this.spotService.updateFilters({ category: (value || undefined) as Category | undefined });
  }

  protected toggleBudget(budget: Budget): void {
    const current = this.spotService.filters().budget;
    this.spotService.updateFilters({ budget: current === budget ? undefined : budget });
  }

  protected resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.spotService.resetFilters();
  }

  protected budgetLabel(budget: number): string {
    return '€'.repeat(budget);
  }
}
