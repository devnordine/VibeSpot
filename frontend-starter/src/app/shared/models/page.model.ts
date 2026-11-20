/** Réponse paginée générique (ex. `GET /api/spots`). */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
