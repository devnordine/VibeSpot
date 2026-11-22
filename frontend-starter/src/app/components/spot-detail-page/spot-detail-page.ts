import { Component, computed, DestroyRef, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AFFLUENCE_LABELS,
  CATEGORY_LABELS,
  MOOD_LABELS,
  MOODS,
  Mood,
  Review,
  Spot,
  SpotMarker,
} from '../../shared/models/spot.model';
import { CustomList } from '../../shared/models/custom-list.model';
import { SharedSpotResult } from '../../shared/models/friend.model';
import { SpotService } from '../../shared/services/spot.service';
import { AuthService } from '../../shared/services/auth.service';
import { ListService } from '../../shared/services/list.service';
import { directionsUrl } from '../../shared/utils/directions';
import { SpotMapComponent } from '../spot-map/spot-map';
import { validatePhoto } from '../spot-form-modal/spot-form-modal';
import { SharePanelComponent } from '../share-panel/share-panel';

/** Niveau de la jauge d'affluence (0 = inconnue). */
const AFFLUENCE_LEVEL = { inconnue: 0, faible: 1, moderee: 2, elevee: 3 } as const;

/**
 * Fiche /spots/:id : galerie, indicateurs, mini-carte.
 * L'id vient de la route grâce à withComponentInputBinding().
 */
@Component({
  selector: 'app-spot-detail-page',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, SpotMapComponent, SharePanelComponent],
  templateUrl: './spot-detail-page.html',
  styleUrl: './spot-detail-page.css',
})
export class SpotDetailPageComponent {
  private readonly spotService = inject(SpotService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly id = input.required<string>();

  protected readonly spot = signal<Spot | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorStatus = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly moodLabels = MOOD_LABELS;
  protected readonly affluenceLabels = AFFLUENCE_LABELS;

  // --- Galerie ---
  /** Photos à afficher (la couverture seule si le tableau est vide). */
  protected readonly photos = computed(() => {
    const s = this.spot();
    if (!s) return [];
    if (s.photos.length) return s.photos.map((p) => p.url);
    return s.coverPhoto ? [s.coverPhoto] : [];
  });
  /** Revient à la 1re photo à chaque nouveau spot. */
  protected readonly activeIndex = linkedSignal({ source: () => this.spot()?.id, computation: () => 0 });
  protected readonly activePhoto = computed(() => this.photos()[this.activeIndex()] ?? null);

  // --- Indicateurs ---
  /** 5 étoiles : 'full' | 'half' | 'empty' selon la note moyenne. */
  protected readonly stars = computed(() => {
    const rating = this.spot()?.ratingAverage ?? 0;
    return [1, 2, 3, 4, 5].map((i) => (rating >= i ? 'full' : rating >= i - 0.5 ? 'half' : 'empty'));
  });
  protected readonly affluenceLevel = computed(() => AFFLUENCE_LEVEL[this.spot()?.affluence ?? 'inconnue']);
  protected readonly budgetLabel = computed(() => '€'.repeat(this.spot()?.budget ?? 1));
  protected readonly knownMoods = computed(() =>
    (this.spot()?.moods ?? []).filter((m): m is Mood => m in MOOD_LABELS),
  );
  protected readonly routeUrl = computed(() => {
    const s = this.spot();
    return s ? directionsUrl({ lat: s.latitude, lng: s.longitude }) : '';
  });
  /** Un seul marqueur pour la mini-carte. */
  protected readonly marker = computed<SpotMarker[]>(() => {
    const s = this.spot();
    return s
      ? [{ id: s.id, title: s.title, category: s.category, moods: s.moods, budget: s.budget, address: s.address, city: s.city, latitude: s.latitude, longitude: s.longitude, coverPhoto: s.coverPhoto, ratingAverage: s.ratingAverage }]
      : [];
  });

  // --- Favori ---
  protected readonly favorited = linkedSignal(() =>
    (this.authService.currentUser()?.favorites ?? []).includes(this.spot()?.id ?? ''),
  );
  protected readonly favoritePending = signal(false);

  // --- Droits ---
  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);
  protected readonly isOwner = computed(() => {
    const s = this.spot();
    return !!s && s.createdBy === this.currentUserId();
  });

  // --- Message de retour (succès / erreur), effacé après 4 s ---
  protected readonly notice = signal<{ kind: 'success' | 'error'; text: string } | null>(null);
  private noticeTimer?: ReturnType<typeof setTimeout>;

  // --- Avis ---
  protected readonly moods = MOODS;
  protected readonly reviewForm = this.fb.nonNullable.group({
    rating: [0, [Validators.min(1), Validators.max(5)]],
    comment: ['', Validators.maxLength(500)],
    moodExperienced: this.fb.nonNullable.control<Mood | ''>(''),
  });
  protected readonly reviewSubmitting = signal(false);
  protected readonly deletingReviewId = signal<string | null>(null);
  /** Avis du plus récent au plus ancien. */
  protected readonly sortedReviews = computed(() =>
    [...(this.spot()?.reviews ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  // --- Ajout de photo ---
  protected readonly photoUploading = signal(false);
  protected readonly photoProgress = signal(0);

  // --- Ajout à une liste ---
  protected readonly listService = inject(ListService);
  protected readonly listsOpen = signal(false);
  protected readonly addingToList = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));

    // Recharge la fiche à chaque changement d'id (navigation d'un spot à un autre).
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.errorStatus.set(null);
      this.errorMessage.set(null);

      const sub = this.spotService.getById(id).subscribe({
        next: (spot) => {
          this.spot.set(spot);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.spot.set(null);
          this.loading.set(false);
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          this.errorStatus.set(status);
          this.errorMessage.set(
            status === 403
              ? 'Ce spot est privé ou réservé aux amis de son créateur.'
              : status === 404 || status === 400
                ? 'Ce spot n’existe pas ou a été supprimé.'
                : SpotService.errorMessage(err),
          );
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Libellé d'une humeur venant d'un avis (texte libre côté backend). */
  protected moodLabel(value: string): string {
    return value in MOOD_LABELS ? MOOD_LABELS[value as Mood] : value;
  }

  protected selectPhoto(index: number): void {
    this.activeIndex.set(index);
  }

  /** Navigation clavier dans la galerie (← / →), en boucle. */
  protected onGalleryKey(event: KeyboardEvent): void {
    const count = this.photos().length;
    if (count < 2) return;
    if (event.key === 'ArrowRight') {
      this.activeIndex.update((i) => (i + 1) % count);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      this.activeIndex.update((i) => (i - 1 + count) % count);
      event.preventDefault();
    }
  }

  protected toggleFavorite(): void {
    const s = this.spot();
    if (!s || this.favoritePending()) return;
    this.favoritePending.set(true);
    this.spotService.toggleFavorite(s.id).subscribe({
      next: ({ favorited, favoritesCount }) => {
        this.favorited.set(favorited);
        this.spot.update((current) => (current ? { ...current, favoritesCount } : current));
        this.favoritePending.set(false);
      },
      error: () => this.favoritePending.set(false),
    });
  }

  // ---------------------------------------------------------------- Avis

  protected setRating(value: number): void {
    this.reviewForm.controls.rating.setValue(value);
  }

  protected submitReview(): void {
    const s = this.spot();
    if (!s || this.reviewSubmitting() || this.reviewForm.invalid) return;
    const { rating, comment, moodExperienced } = this.reviewForm.getRawValue();

    this.reviewSubmitting.set(true);
    this.spotService.addReview(s.id, { rating, comment: comment.trim(), moodExperienced }).subscribe({
      next: (updated) => {
        this.spot.set(updated);
        this.reviewForm.reset();
        this.reviewSubmitting.set(false);
        this.showNotice('success', 'Merci, votre avis a été publié.');
      },
      error: (err: unknown) => {
        this.reviewSubmitting.set(false);
        this.showNotice('error', SpotService.errorMessage(err));
      },
    });
  }

  protected deleteReview(review: Review): void {
    const s = this.spot();
    if (!s || this.deletingReviewId()) return;
    if (!window.confirm('Supprimer votre avis ?')) return;

    this.deletingReviewId.set(review.id);
    this.spotService.deleteReview(s.id, review.id).subscribe({
      next: (updated) => {
        this.spot.set(updated);
        this.deletingReviewId.set(null);
        this.showNotice('success', 'Avis supprimé.');
      },
      error: (err: unknown) => {
        this.deletingReviewId.set(null);
        this.showNotice('error', SpotService.errorMessage(err));
      },
    });
  }

  // ---------------------------------------------------------------- Photo

  /** Vérifie puis envoie une photo (même règles que la modale de création). */
  protected onPhotoSelected(files: FileList | null): void {
    const s = this.spot();
    const file = files?.[0];
    if (!s || !file || this.photoUploading()) return;

    const error = validatePhoto(file);
    if (error) {
      this.showNotice('error', error);
      return;
    }

    this.photoUploading.set(true);
    this.photoProgress.set(0);
    this.spotService.addPhoto(s.id, file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.photoProgress.set(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response && event.body) {
          this.spot.set(event.body);
          this.activeIndex.set(event.body.photos.length - 1); // affiche la nouvelle photo
          this.photoUploading.set(false);
          this.showNotice('success', 'Photo ajoutée !');
        }
      },
      error: (err: unknown) => {
        this.photoUploading.set(false);
        this.showNotice('error', SpotService.errorMessage(err));
      },
    });
  }

  // ---------------------------------------------------------------- Listes

  protected toggleLists(): void {
    const open = !this.listsOpen();
    this.listsOpen.set(open);
    if (open) {
      this.listService.loadLists().subscribe({ error: () => this.showNotice('error', 'Impossible de charger vos listes.') });
    }
  }

  protected addToList(list: CustomList): void {
    const s = this.spot();
    if (!s || this.addingToList()) return;
    this.addingToList.set(list.id);
    this.listService.addSpotToList(list.id, s.id).subscribe({
      next: () => {
        this.addingToList.set(null);
        this.listsOpen.set(false);
        this.showNotice('success', `Ajouté à « ${list.name} ».`);
      },
      error: (err: unknown) => {
        this.addingToList.set(null);
        this.showNotice('error', SpotService.errorMessage(err));
      },
    });
  }

  protected isInList(list: CustomList): boolean {
    const id = this.spot()?.id;
    // Selon la route, le backend renvoie des spots complets ou seulement leurs ids.
    return (list.spots as unknown[]).some((spot) =>
      (typeof spot === 'string' ? spot : (spot as { id: string }).id) === id,
    );
  }

  // ---------------------------------------------------------------- Partage (partie B)

  /** Le SharePanel du binôme renvoie la nouvelle visibilité : on met à jour la fiche. */
  protected onShareUpdated(result: SharedSpotResult): void {
    this.spot.update((s) => (s ? { ...s, visibility: result.visibility, sharedWith: result.sharedWith } : s));
  }

  private showNotice(kind: 'success' | 'error', text: string): void {
    clearTimeout(this.noticeTimer);
    this.notice.set({ kind, text });
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4000);
  }
}
