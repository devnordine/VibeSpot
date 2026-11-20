import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SpotService } from '../../shared/services/spot.service';

/**
 * Vue d'accueil /explore.
 * Mission 1 : socle branché sur SpotService (liste + pagination + états).
 * Mission 2 : ajout du split-screen, des filtres et de la carte Leaflet.
 */
@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './explore-page.html',
  styleUrl: './explore-page.css',
})
export class ExplorePageComponent implements OnInit {
  protected readonly spotService = inject(SpotService);

  ngOnInit(): void {
    this.spotService.load(1);
  }

  protected budgetLabel(budget: number): string {
    return '€'.repeat(budget);
  }
}
