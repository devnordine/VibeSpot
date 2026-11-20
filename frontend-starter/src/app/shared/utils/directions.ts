import { LatLng } from '../models/spot.model';

/**
 * Lien Google Maps en mode itinéraire vers une destination.
 * Si l'origine est connue (géolocalisation), l'itinéraire part de là ;
 * sinon Google Maps utilise la position de l'appareil.
 */
export function directionsUrl(destination: LatLng, origin?: LatLng | null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'walking',
  });
  if (origin) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
