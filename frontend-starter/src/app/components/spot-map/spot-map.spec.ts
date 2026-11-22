import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SpotMapComponent } from './spot-map';
import { SpotMarker } from '../../shared/models/spot.model';

/** Teste la vraie carte Leaflet dans jsdom (pas de tuiles affichées, mais le DOM des marqueurs existe). */
function marker(overrides: Partial<SpotMarker> = {}): SpotMarker {
  return {
    id: 'm1', title: 'Café Koohi', category: 'cafe', moods: ['travail'], budget: 1,
    address: '', city: 'Nice', latitude: 43.7, longitude: 7.26, coverPhoto: '', ratingAverage: 4.5,
    ...overrides,
  };
}

describe('SpotMapComponent (Leaflet réel)', () => {
  beforeEach(() => {
    // jsdom ne fournit pas ResizeObserver
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    } as unknown as typeof ResizeObserver;
    TestBed.configureTestingModule({ imports: [SpotMapComponent] });
  });

  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(SpotMapComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await fixture.whenStable(); // afterNextRender → création de la carte
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('affiche un marqueur coloré par spot', async () => {
    const { el } = await render({ markers: [marker(), marker({ id: 'm2', moods: ['festif'], latitude: 43.71 })] });

    const pins = el.querySelectorAll('.vs-pin');
    expect(pins.length).toBe(2);
    expect(pins[0].classList.contains('vs-pin--travail')).toBe(true);
    expect(pins[1].classList.contains('vs-pin--festif')).toBe(true);
  });

  it('n’injecte jamais une humeur inconnue dans le HTML du marqueur', async () => {
    const { el } = await render({ markers: [marker({ moods: ['"><img src=x onerror=alert(1)>' as never] })] });

    expect(el.querySelector('img[src="x"]')).toBeNull();
    expect(el.querySelector('.vs-pin--none')).not.toBeNull();
  });

  it('écrit le titre de la popup en texte (pas de HTML exécuté)', async () => {
    const { el } = await render({ markers: [marker({ title: '<b id="xss">pirate</b>' })] });

    (el.querySelector('.leaflet-marker-icon') as HTMLElement).click();

    const popup = el.querySelector('.vs-popup strong');
    expect(popup?.textContent).toBe('<b id="xss">pirate</b>');
    expect(el.querySelector('#xss')).toBeNull();
  });

  it('émet spotSelected avec l’id au clic sur « Voir la fiche »', async () => {
    const { fixture, el } = await render({ markers: [marker({ id: 'abc' })] });
    let selected: string | undefined;
    fixture.componentInstance.spotSelected.subscribe((id) => (selected = id));

    (el.querySelector('.leaflet-marker-icon') as HTMLElement).click();
    (el.querySelector('.vs-popup button') as HTMLButtonElement).click();

    expect(selected).toBe('abc');
  });

  it('en mode sélection, place le point choisi', async () => {
    const { el } = await render({ pickMode: true, pickedPoint: { lat: 43.7, lng: 7.26 } });
    expect(el.querySelector('.vs-pin--picked')).not.toBeNull();
  });
});
