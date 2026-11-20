import { Spot } from '../models/spot.model';

/** Fabrique un Spot conforme à `toPublic()` pour les tests. */
export function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'spot-1',
    title: 'Café Koohi',
    description: 'Café calme pour travailler',
    category: 'cafe',
    moods: ['travail', 'calme'],
    budget: 2,
    address: '12 Rue de France',
    city: 'Nice',
    postalCode: '06000',
    location: { type: 'Point', coordinates: [7.2612, 43.6974] },
    longitude: 7.2612,
    latitude: 43.6974,
    coverPhoto: '',
    photos: [],
    createdBy: 'user-1',
    ratingAverage: 4.5,
    ratingCount: 2,
    favoritesCount: 3,
    affluence: 'moderee',
    ambianceScore: 0,
    tags: [],
    reviews: [],
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}
