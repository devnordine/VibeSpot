/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** Identifiants des spots favoris (renvoyés par GET /api/users/me). */
  favorites?: string[];
}
