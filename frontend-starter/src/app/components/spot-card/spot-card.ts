import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AFFLUENCE_LABELS,
  CATEGORY_LABELS,
  MOOD_LABELS,
  Spot,
} from '../../shared/models/spot.model';

/** Carte d'aperçu d'un spot (grille de résultats, carrousels). */
@Component({
  selector: 'app-spot-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './spot-card.html',
  styleUrl: './spot-card.css',
})
export class SpotCardComponent {
  readonly spot = input.required<Spot>();
  readonly favorited = input(false);
  /** true pendant la requête favori : le bouton est bloqué. */
  readonly pending = input(false);
  readonly compact = input(false);

  readonly favoriteToggled = output<Spot>();

  protected readonly mainMood = computed(() => this.spot().moods[0] ?? null);
  protected readonly moodLabels = MOOD_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly affluenceLabels = AFFLUENCE_LABELS;
  protected readonly budgetLabel = computed(() => '€'.repeat(this.spot().budget));
  /** Passe à true si l'image ne charge pas : on affiche alors le visuel de remplacement. */
  protected readonly coverFailed = signal(false);
  protected readonly showCover = computed(() => !!this.spot().coverPhoto && !this.coverFailed());

  protected onFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteToggled.emit(this.spot());
  }
}
