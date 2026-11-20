import { Component, computed, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplorePageComponent } from './explore-page';
import { SpotMapComponent } from '../spot-map/spot-map';
import { SpotFormModalComponent } from '../spot-form-modal/spot-form-modal';
import { SpotService } from '../../shared/services/spot.service';
import { AuthService } from '../../shared/services/auth.service';
import { LatLng, Spot, SpotFilters, SpotMarker } from '../../shared/models/spot.model';
import { makeSpot } from '../../shared/testing/spot-fixtures';

/** Remplace la vraie carte : pas de Leaflet dans jsdom. */
@Component({ selector: 'app-spot-map', standalone: true, template: '' })
class SpotMapStub {
  readonly markers = input<SpotMarker[]>([]);
  readonly userPosition = input<LatLng | null>(null);
  readonly radiusKm = input<number | null>(null);
  readonly spotSelected = output<string>();
}

@Component({ selector: 'app-spot-form-modal', standalone: true, template: '' })
class SpotFormModalStub {
  readonly closed = output<void>();
  readonly created = output<{ spot: Spot; failedPhotos: number }>();
}

/** Faux SpotService : mêmes signaux publics que le vrai, méthodes espionnées. */
function createSpotServiceMock(spots: Spot[] = []) {
  const filters = signal<SpotFilters>({ sort: 'recent' });
  const list = signal(spots);
  return {
    spots: list.asReadonly(),
    filters: filters.asReadonly(),
    loading: signal(false).asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    errorStatus: signal<number | null>(null).asReadonly(),
    total: computed(() => list().length),
    page: signal(1).asReadonly(),
    pages: signal(1).asReadonly(),
    hasPreviousPage: signal(false).asReadonly(),
    hasNextPage: signal(false).asReadonly(),
    activeFiltersCount: computed(() => (filters().mood ? 1 : 0)),
    load: vi.fn(),
    updateFilters: vi.fn((patch: Partial<SpotFilters>) => filters.update((f) => ({ ...f, ...patch }))),
    resetFilters: vi.fn(),
    trending: vi.fn(() => of([])),
    list: vi.fn(() => of({ items: [], page: 1, pages: 1, limit: 6, total: 0 })),
    map: vi.fn(() => of([])),
    toggleFavorite: vi.fn(() => of({ favorited: true, favoritesCount: 4 })),
    patchLocal: vi.fn(),
  };
}

describe('ExplorePageComponent', () => {
  let spotService: ReturnType<typeof createSpotServiceMock>;

  async function setup(spots: Spot[] = []) {
    spotService = createSpotServiceMock(spots);
    TestBed.configureTestingModule({
      imports: [ExplorePageComponent],
      providers: [
        provideRouter([]),
        { provide: SpotService, useValue: spotService },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
      ],
    });
    TestBed.overrideComponent(ExplorePageComponent, {
      remove: { imports: [SpotMapComponent, SpotFormModalComponent] },
      add: { imports: [SpotMapStub, SpotFormModalStub] },
    });
    const fixture = TestBed.createComponent(ExplorePageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('charge la première page au démarrage', async () => {
    await setup();
    expect(spotService.load).toHaveBeenCalledWith(1);
    expect(spotService.trending).toHaveBeenCalledWith(6);
  });

  it('un clic sur une humeur appelle updateFilters({ mood })', async () => {
    const fixture = await setup();
    const el: HTMLElement = fixture.nativeElement;

    const calme = [...el.querySelectorAll<HTMLButtonElement>('.chips .chip')].find(
      (b) => b.textContent?.trim() === 'Calme',
    )!;
    calme.click();

    expect(spotService.updateFilters).toHaveBeenCalledWith({ mood: 'calme' });
  });

  it('un second clic sur la même humeur la désélectionne', async () => {
    const fixture = await setup();
    const el: HTMLElement = fixture.nativeElement;
    const festif = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.chips .chip')].find((b) => b.textContent?.trim() === 'Festif')!;

    festif().click();
    fixture.detectChanges();
    festif().click();

    expect(spotService.updateFilters).toHaveBeenLastCalledWith({ mood: undefined });
  });

  it('affiche l’état vide quand il n’y a aucun résultat', async () => {
    const fixture = await setup([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aucun spot ne correspond à votre recherche.',
    );
  });

  it('affiche une carte par spot renvoyé', async () => {
    const fixture = await setup([makeSpot({ id: 'a' }), makeSpot({ id: 'b', title: 'Plage Castel' })]);
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.spot-grid app-spot-card');
    expect(cards.length).toBe(2);
  });
});
