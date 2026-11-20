import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { SpotCardComponent } from './spot-card';
import { makeSpot } from '../../shared/testing/spot-fixtures';
import { Spot } from '../../shared/models/spot.model';

describe('SpotCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SpotCardComponent],
      providers: [provideRouter([])],
    });
  });

  function render(spot: Spot, favorited = false) {
    const fixture = TestBed.createComponent(SpotCardComponent);
    fixture.componentRef.setInput('spot', spot);
    fixture.componentRef.setInput('favorited', favorited);
    fixture.detectChanges();
    return fixture;
  }

  it('affiche le titre, le budget et le badge de la première humeur', () => {
    const el: HTMLElement = render(makeSpot({ title: 'La Petite Maison', budget: 3 })).nativeElement;

    expect(el.querySelector('.title')?.textContent).toContain('La Petite Maison');
    expect(el.querySelector('.meta')?.textContent).toContain('€€€');
    expect(el.querySelector('.mood-badge')?.textContent?.trim()).toBe('Travail');
  });

  it('affiche un visuel de remplacement quand il n’y a pas de photo', () => {
    const el: HTMLElement = render(makeSpot({ coverPhoto: '' })).nativeElement;

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.cover-fallback')?.textContent).toContain('Café');
  });

  it('émet favoriteToggled avec le spot au clic sur le cœur', () => {
    const spot = makeSpot();
    const fixture = render(spot);
    let emitted: Spot | undefined;
    fixture.componentInstance.favoriteToggled.subscribe((s) => (emitted = s));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.fav')!.click();

    expect(emitted).toBe(spot);
  });

  it('désactive le cœur pendant la requête (pending)', () => {
    const fixture = render(makeSpot(), true);
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();

    const fav = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.fav')!;
    expect(fav.disabled).toBe(true);
    expect(fav.getAttribute('aria-pressed')).toBe('true');
  });
});
