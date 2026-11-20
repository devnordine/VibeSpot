/**
 * Modèles du domaine « Spot » de VibeSpot.
 * Ils reflètent exactement l'objet renvoyé par `spot.toPublic()` côté backend
 * (voir backend/src/models/Spot.js et API_CONTRACT.md).
 */

/** Humeurs acceptées par le backend (filtre `mood`). */
export const MOODS = [
  'travail',
  'calme',
  'festif',
  'gourmand',
  'sportif',
  'photo',
  'romantique',
  'nature',
] as const;
export type Mood = (typeof MOODS)[number];

/** Catégories acceptées par l'enum Mongoose `category`. */
export const CATEGORIES = [
  'restaurant',
  'cafe',
  'bar',
  'parc',
  'skatepark',
  'salle_concert',
  'bibliotheque',
  'coworking',
  'lieu_culturel',
  'terrain_sport',
  'autre',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** 1 = €, 2 = €€, 3 = €€€ */
export type Budget = 1 | 2 | 3;

export type Affluence = 'faible' | 'moderee' | 'elevee' | 'inconnue';

/** Tris supportés par `GET /api/spots?sort=`. */
export type SpotSort = 'recent' | 'popular' | 'rating';

export interface GeoPoint {
  type: 'Point';
  /** [longitude, latitude] — ordre GeoJSON */
  coordinates: [number, number];
}

export interface SpotPhoto {
  id: string;
  url: string;
  caption: string;
  createdAt: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  moodExperienced: string;
  createdAt: string;
}

export interface Spot {
  id: string;
  title: string;
  description: string;
  category: Category;
  moods: Mood[];
  budget: Budget;
  address: string;
  city: string;
  postalCode: string;
  location: GeoPoint;
  longitude: number;
  latitude: number;
  coverPhoto: string;
  photos: SpotPhoto[];
  createdBy: string;
  ratingAverage: number;
  ratingCount: number;
  favoritesCount: number;
  affluence: Affluence;
  ambianceScore: number;
  tags: string[];
  reviews: Review[];
  createdAt: string;
  updatedAt: string;
}

/** Version allégée renvoyée par `GET /api/spots/map` pour les marqueurs. */
export type SpotMarker = Pick<
  Spot,
  'id' | 'title' | 'category' | 'moods' | 'budget' | 'address' | 'city' | 'longitude' | 'latitude' | 'coverPhoto' | 'ratingAverage'
>;

/** Réponse de `POST /api/spots/:id/favorite`. */
export interface FavoriteToggle {
  favorited: boolean;
  favoritesCount: number;
}

/** Corps de `POST /api/spots/:id/reviews`. */
export interface ReviewPayload {
  rating: number;
  comment?: string;
  moodExperienced?: Mood | '';
}

/**
 * Filtres de recherche côté UI.
 * `radiusKm` est exprimé en kilomètres pour l'utilisateur ; le service le
 * convertit en `maxDistance` (mètres) attendu par l'API.
 */
export interface SpotFilters {
  search?: string;
  mood?: Mood;
  category?: Category;
  budget?: Budget;
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: SpotSort;
}
