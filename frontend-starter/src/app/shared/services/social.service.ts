import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, finalize, of, tap, throwError } from 'rxjs';
import {
  FeedItem,
  FriendRequest,
  FriendUser,
  FriendsOverview,
  OutgoingRequest,
  SharedSpotResult,
  SpotSharePayload,
  UserSearchResult,
} from '../models/friend.model';

@Injectable({
  providedIn: 'root',
})
export class SocialService {
  private readonly http = inject(HttpClient);

  private readonly _friends = signal<FriendUser[]>([]);
  private readonly _incomingRequests = signal<FriendRequest[]>([]);
  private readonly _outgoingRequests = signal<OutgoingRequest[]>([]);
  private readonly _searchResults = signal<UserSearchResult[]>([]);
  private readonly _feed = signal<FeedItem[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly friends = this._friends.asReadonly();
  readonly incomingRequests = this._incomingRequests.asReadonly();
  readonly outgoingRequests = this._outgoingRequests.asReadonly();
  readonly searchResults = this._searchResults.asReadonly();
  readonly feed = this._feed.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly pendingRequestsCount = computed(
    () => this._incomingRequests().length,
  );
  readonly friendsCount = computed(() => this._friends().length);

  /**
   * Recherche des utilisateurs par nom ou email.
   */
  searchUsers(query: string): Observable<UserSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      this._searchResults.set([]);
      return of([]);
    }

    this._loading.set(true);
    this._error.set(null);

    const params = new HttpParams().set('q', trimmed);
    return this.http
      .get<UserSearchResult[]>('/api/users/search', { params })
      .pipe(
        tap((results) => this._searchResults.set(results)),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Erreur lors de la recherche d’utilisateurs',
          );
          return throwError(() => err);
        }),
        finalize(() => this._loading.set(false)),
      );
  }

  /**
   * Charge les amis acceptés ainsi que les demandes reçues et envoyées.
   */
  loadFriends(): Observable<FriendsOverview> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.get<FriendsOverview>('/api/friends').pipe(
      tap((overview) => {
        this._friends.set(overview.friends || []);
        this._incomingRequests.set(overview.incomingRequests || []);
        this._outgoingRequests.set(overview.outgoingRequests || []);
      }),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Impossible de charger la liste d’amis',
        );
        return throwError(() => err);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /**
   * Envoie une demande d'ami à un utilisateur cible et met à jour les résultats de recherche.
   */
  sendFriendRequest(
    userId: string,
  ): Observable<{ message: string; targetUserId: string }> {
    this._error.set(null);

    return this.http
      .post<{ message: string; targetUserId: string }>(
        `/api/friends/request/${userId}`,
        {},
      )
      .pipe(
        tap(() => {
          this._searchResults.update((list) =>
            list.map((u) =>
              u.id === userId ? { ...u, relationStatus: 'PENDING_SENT' } : u,
            ),
          );
        }),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Impossible d’envoyer l’invitation',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Accepte ou refuse une demande d'ami reçue et synchronise les Signals.
   */
  respondToRequest(
    requestId: string,
    action: 'ACCEPT' | 'REJECT',
  ): Observable<{ message: string; status: string }> {
    this._error.set(null);

    return this.http
      .patch<{ message: string; status: string }>(
        `/api/friends/respond/${requestId}`,
        { action },
      )
      .pipe(
        tap(() => {
          const acceptedReq = this._incomingRequests().find(
            (r) => r.id === requestId,
          );
          this._incomingRequests.update((reqs) =>
            reqs.filter((r) => r.id !== requestId),
          );

          if (action === 'ACCEPT' && acceptedReq?.from) {
            this._friends.update((current) =>
              current.some((f) => f.id === acceptedReq.from.id)
                ? current
                : [...current, acceptedReq.from],
            );
          }
        }),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Erreur lors du traitement de l’invitation',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Retire un ami (le backend purge automatiquement les partages privés associés).
   */
  removeFriend(
    friendId: string,
  ): Observable<{ message: string; revokedSpotsCount: number }> {
    this._error.set(null);

    return this.http
      .delete<{ message: string; revokedSpotsCount: number }>(
        `/api/friends/${friendId}`,
      )
      .pipe(
        tap(() => {
          this._friends.update((current) =>
            current.filter((f) => f.id !== friendId),
          );
          this._searchResults.update((list) =>
            list.map((u) =>
              u.id === friendId ? { ...u, relationStatus: 'NONE' } : u,
            ),
          );
        }),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Impossible de retirer cet ami',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Charge le fil d'activité chronologique des amis.
   */
  loadFeed(): Observable<FeedItem[]> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.get<FeedItem[]>('/api/feed').pipe(
      tap((items) => this._feed.set(items || [])),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Impossible de charger le fil d’activité',
        );
        return throwError(() => err);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /**
   * Met à jour la visibilité ou la liste des amis autorisés sur un spot.
   */
  updateSpotShare(
    spotId: string,
    payload: SpotSharePayload,
  ): Observable<SharedSpotResult> {
    this._error.set(null);

    return this.http
      .patch<SharedSpotResult>(`/api/spots/${spotId}/share`, payload)
      .pipe(
        catchError((err) => {
          this._error.set(
            err?.error?.message ||
              'Erreur lors de la mise à jour du partage du lieu',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Stoppe immédiatement le partage d'un spot privé avec un ami précis.
   */
  revokeSpotAccess(
    spotId: string,
    friendId: string,
  ): Observable<SharedSpotResult> {
    return this.updateSpotShare(spotId, { removeUserId: friendId });
  }
}