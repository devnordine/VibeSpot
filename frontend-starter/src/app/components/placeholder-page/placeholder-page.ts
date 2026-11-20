import { Component, input } from '@angular/core';

/**
 * Page provisoire pour les vues développées par le binôme (social, listes).
 * Le titre est fourni via `data: { title }` de la route (input binding).
 * À remplacer dans routes.ts par le vrai composant lors de sa livraison.
 */
@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  template: `
    <section class="placeholder">
      <h1>{{ title() }}</h1>
      <p>Cette vue arrive bientôt.</p>
    </section>
  `,
  styles: `
    .placeholder { max-width: 900px; margin: 0 auto; padding: 2rem 5vw; color: #5b6b66; }
  `,
})
export class PlaceholderPageComponent {
  readonly title = input('Bientôt disponible');
}
