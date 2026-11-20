import { Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, defaultIfEmpty, EMPTY, filter, from, last, map, Observable, switchMap, tap } from 'rxjs';
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
} from '../../shared/models/spot.model';
import { SpotService } from '../../shared/services/spot.service';
import { SpotMapComponent } from '../spot-map/spot-map';

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 Mo
/** Types acceptés par le backend (allowedMimeTypes dans app.js). */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface PhotoPreview {
  file: File;
  url: string;
}

/** Vérifie un fichier avant l'envoi. Renvoie un message d'erreur ou null. */
export function validatePhoto(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `« ${file.name} » n'est pas une image acceptée (JPEG, PNG, WebP ou GIF).`;
  }
  if (file.size >= MAX_PHOTO_SIZE) {
    return `« ${file.name} » dépasse 5 Mo.`;
  }
  return null;
}

/** Modale de création d'un spot : formulaire + choix du point sur la carte + photos. */
@Component({
  selector: 'app-spot-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SpotMapComponent],
  templateUrl: './spot-form-modal.html',
  styleUrl: './spot-form-modal.css',
  host: { '(document:keydown.escape)': 'close()' },
})
export class SpotFormModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly spotService = inject(SpotService);

  readonly closed = output<void>();
  /** Spot créé + nombre de photos supplémentaires qui n'ont pas pu être envoyées. */
  readonly created = output<{ spot: Spot; failedPhotos: number }>();

  protected readonly moods = MOODS;
  protected readonly moodLabels = MOOD_LABELS;
  protected readonly categories = CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly budgets = BUDGETS;
  protected readonly maxPhotos = MAX_PHOTOS;

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', Validators.maxLength(500)],
    category: this.fb.nonNullable.control<Category | ''>('', Validators.required),
    moods: this.fb.nonNullable.control<Mood[]>([]),
    budget: this.fb.nonNullable.control<Budget>(1),
    address: [''],
    city: ['Nice'],
    latitude: this.fb.control<number | null>(null, Validators.required),
    longitude: this.fb.control<number | null>(null, Validators.required),
  });

  protected readonly photos = signal<PhotoPreview[]>([]);
  protected readonly photoErrors = signal<string[]>([]);
  protected readonly submitting = signal(false);
  protected readonly progress = signal(0);
  protected readonly submitError = signal<string | null>(null);
  protected readonly pickedPoint = signal<LatLng | null>(null);
  /** Statut du formulaire en signal (pour le désactiver dans le template sans souscription). */
  private readonly formStatus = signal(this.form.status);
  protected readonly canSubmit = computed(() => this.formStatus() === 'VALID' && !this.submitting());

  constructor() {
    this.form.statusChanges.pipe(takeUntilDestroyed()).subscribe((status) => this.formStatus.set(status));
    // Libère les aperçus restants si la modale est détruite.
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  protected toggleMood(mood: Mood): void {
    const current = this.form.controls.moods.value;
    this.form.controls.moods.setValue(
      current.includes(mood) ? current.filter((m) => m !== mood) : [...current, mood],
    );
  }

  protected pickPoint(point: LatLng): void {
    this.pickedPoint.set(point);
    this.form.patchValue({ latitude: point.lat, longitude: point.lng });
  }

  /** Ajoute les fichiers valides (5 max) et liste les erreurs des autres. */
  onFilesSelected(files: FileList | File[] | null): void {
    if (!files) return;
    const errors: string[] = [];
    const accepted: PhotoPreview[] = [];

    for (const file of Array.from(files)) {
      if (this.photos().length + accepted.length >= MAX_PHOTOS) {
        errors.push(`Maximum ${MAX_PHOTOS} photos : « ${file.name} » ignorée.`);
        continue;
      }
      const error = validatePhoto(file);
      if (error) errors.push(error);
      else accepted.push({ file, url: URL.createObjectURL(file) });
    }

    this.photos.update((list) => [...list, ...accepted]);
    this.photoErrors.set(errors);
  }

  protected removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  /**
   * Envoie le spot avec la 1re photo, puis les suivantes une par une.
   * La progression couvre toutes les étapes (1 étape par photo).
   */
  protected submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const [first, ...rest] = this.photos();
    const steps = Math.max(1, this.photos().length);
    let failedPhotos = 0;

    const body = new FormData();
    body.append('title', value.title.trim());
    body.append('description', value.description.trim());
    body.append('category', value.category);
    body.append('moods', JSON.stringify(value.moods));
    body.append('budget', String(value.budget));
    body.append('address', value.address.trim());
    body.append('city', value.city.trim() || 'Nice');
    body.append('latitude', String(value.latitude));
    body.append('longitude', String(value.longitude));
    if (first) body.append('photo', first.file);

    this.submitting.set(true);
    this.submitError.set(null);
    this.progress.set(0);

    this.spotService
      .create(body)
      .pipe(
        this.trackStep(0, steps),
        switchMap((spot) =>
          from(rest).pipe(
            concatMap((photo, i) =>
              this.spotService.addPhoto(spot.id, photo.file).pipe(
                this.trackStep(i + 1, steps),
                // Une photo en échec ne doit pas annuler le spot déjà créé.
                catchError(() => {
                  failedPhotos++;
                  return EMPTY;
                }),
              ),
            ),
            defaultIfEmpty(spot),
            last(),
          ),
        ),
      )
      .subscribe({
        next: (spot) => {
          this.submitting.set(false);
          this.progress.set(100);
          this.created.emit({ spot, failedPhotos });
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.progress.set(0);
          this.submitError.set(SpotService.errorMessage(err));
        },
      });
  }

  /** Met à jour la progression globale et ne laisse passer que le Spot final de chaque requête. */
  private trackStep(index: number, steps: number) {
    return (source: Observable<HttpEvent<Spot>>): Observable<Spot> =>
      source.pipe(
        tap((event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const part = event.loaded / event.total;
            this.progress.set(Math.round(((index + part) / steps) * 100));
          } else if (event.type === HttpEventType.Response) {
            // Étape terminée : utile quand le navigateur n'émet pas d'événement de progression
            // (fichier très petit ou serveur local).
            this.progress.set(Math.round(((index + 1) / steps) * 100));
          }
        }),
        filter((event): event is HttpResponse<Spot> => event.type === HttpEventType.Response),
        map((response) => response.body as Spot),
      );
  }
}
