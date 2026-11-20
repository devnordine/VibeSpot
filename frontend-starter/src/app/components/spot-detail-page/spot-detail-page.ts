import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Spot } from '../../shared/models/spot.model';
import { SpotService } from '../../shared/services/spot.service';

/**
 * Fiche /spots/:id.
 * Mission 1 : chargement du spot via l'identifiant de route (input binding).
 * Mission 3 : galerie, indicateurs, avis et panneau de partage.
 */
@Component({
  selector: 'app-spot-detail-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './spot-detail-page.html',
  styleUrl: './spot-detail-page.css',
})
export class SpotDetailPageComponent {
  private readonly spotService = inject(SpotService);

  /** Lié automatiquement au paramètre `:id` grâce à withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly spot = signal<Spot | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Recharge la fiche à chaque changement d'identifiant (navigation spot → spot).
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.error.set(null);

      const sub = this.spotService.getById(id).subscribe({
        next: (spot) => {
          this.spot.set(spot);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.spot.set(null);
          this.error.set(SpotService.errorMessage(err));
          this.loading.set(false);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
