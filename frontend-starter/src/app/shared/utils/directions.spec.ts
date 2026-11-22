import { describe, expect, it } from 'vitest';
import { directionsUrl } from './directions';

describe('directionsUrl', () => {
  it('construit un lien Google Maps vers la destination, à pied', () => {
    const url = new URL(directionsUrl({ lat: 43.7, lng: 7.27 }));

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('destination')).toBe('43.7,7.27');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    expect(url.searchParams.has('origin')).toBe(false);
  });

  it('ajoute le point de départ quand la position est connue', () => {
    const url = new URL(directionsUrl({ lat: 43.7, lng: 7.27 }, { lat: 43.69, lng: 7.25 }));
    expect(url.searchParams.get('origin')).toBe('43.69,7.25');
  });
});
