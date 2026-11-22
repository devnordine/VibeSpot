import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import {
  CreateListPayload,
  CustomList,
  UpdateListPayload,
} from '../models/custom-list.model';

@Injectable({
  providedIn: 'root',
})
export class ListService {
  private readonly http = inject(HttpClient);

  private readonly _lists = signal<CustomList[]>([]);
  private readonly _selectedList = signal<CustomList | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly lists = this._lists.asReadonly();
  readonly selectedList = this._selectedList.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly listsCount = computed(() => this._lists().length);

  /**
   * Charge toutes les listes dont l'utilisateur est propriétaire ou collaborateur.
   */
  loadLists(): Observable<CustomList[]> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.get<CustomList[]>('/api/lists').pipe(
      tap((lists) => this._lists.set(lists || [])),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Impossible de charger les listes',
        );
        return throwError(() => err);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /**
   * Récupère le détail d'une liste par son identifiant.
   */
  getListById(listId: string): Observable<CustomList> {
    this._loading.set(true);
    this._error.set(null);

    return this.http.get<CustomList>(`/api/lists/${listId}`).pipe(
      tap((list) => this._selectedList.set(list)),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Impossible de charger cette liste',
        );
        return throwError(() => err);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /**
   * Crée une nouvelle liste personnalisée ou collaborative.
   */
  createList(payload: CreateListPayload): Observable<CustomList> {
    this._error.set(null);

    return this.http.post<CustomList>('/api/lists', payload).pipe(
      tap((created) => {
        this._lists.update((current) => [created, ...current]);
        this._selectedList.set(created);
      }),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Erreur lors de la création de la liste',
        );
        return throwError(() => err);
      }),
    );
  }

  /**
   * Met à jour les paramètres ou les collaborateurs d'une liste.
   */
  updateList(
    listId: string,
    payload: UpdateListPayload,
  ): Observable<CustomList> {
    this._error.set(null);

    return this.http.put<CustomList>(`/api/lists/${listId}`, payload).pipe(
      tap((updated) => this.syncUpdatedList(updated)),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Erreur lors de la modification de la liste',
        );
        return throwError(() => err);
      }),
    );
  }

  /**
   * Supprime une liste personnalisée.
   */
  deleteList(listId: string): Observable<void> {
    this._error.set(null);

    return this.http.delete<void>(`/api/lists/${listId}`).pipe(
      tap(() => {
        this._lists.update((current) =>
          current.filter((l) => l.id !== listId),
        );
        if (this._selectedList()?.id === listId) {
          this._selectedList.set(null);
        }
      }),
      catchError((err) => {
        this._error.set(
          err?.error?.message || 'Erreur lors de la suppression de la liste',
        );
        return throwError(() => err);
      }),
    );
  }

  /**
   * Ajoute un spot dans une liste.
   */
  addSpotToList(listId: string, spotId: string): Observable<CustomList> {
    this._error.set(null);

    return this.http
      .post<CustomList>(`/api/lists/${listId}/spots/${spotId}`, {})
      .pipe(
        tap((updated) => this.syncUpdatedList(updated)),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Impossible d’ajouter le lieu à la liste',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Retire un spot d'une liste.
   */
  removeSpotFromList(listId: string, spotId: string): Observable<CustomList> {
    this._error.set(null);

    return this.http
      .delete<CustomList>(`/api/lists/${listId}/spots/${spotId}`)
      .pipe(
        tap((updated) => this.syncUpdatedList(updated)),
        catchError((err) => {
          this._error.set(
            err?.error?.message || 'Impossible de retirer le lieu de la liste',
          );
          return throwError(() => err);
        }),
      );
  }

  /**
   * Sauvegarde le nouvel ordre des spots après un Drag & Drop.
   */
  reorderSpots(listId: string, spotIds: string[]): Observable<CustomList> {
    this._error.set(null);

    return this.http
      .put<CustomList>(`/api/lists/${listId}/reorder`, { spotIds })
      .pipe(
        tap((updated) => this.syncUpdatedList(updated)),
        catchError((err) => {
          this._error.set(
            err?.error?.message ||
              'Erreur lors de la sauvegarde du nouvel ordre',
          );
          return throwError(() => err);
        }),
      );
  }

  private syncUpdatedList(updated: CustomList): void {
    this._lists.update((current) =>
      current.map((l) => (l.id === updated.id ? updated : l)),
    );
    if (this._selectedList()?.id === updated.id) {
      this._selectedList.set(updated);
    }
  }
}