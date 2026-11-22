import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import { SocialService } from '../../shared/services/social.service';
import {
  FeedItem,
  FriendRequest,
  FriendUser,
  UserSearchResult,
} from '../../shared/models/friend.model';

export type SocialTab = 'feed' | 'friends' | 'discover';

@Component({
  selector: 'app-social-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './social-page.html',
  styleUrl: './social-page.css',
})
export class SocialPageComponent implements OnInit {
  readonly socialService = inject(SocialService);

  readonly activeTab = signal<SocialTab>('feed');
  readonly searchQuery = signal<string>('');
  readonly busyUserId = signal<string | null>(null);
  readonly snackbar = signal<{ text: string; type: 'success' | 'error' } | null>(
    null,
  );

  constructor() {
    toObservable(this.searchQuery)
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) =>
          this.socialService.searchUsers(query).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  ngOnInit(): void {
    this.socialService.loadFriends().subscribe();
    this.socialService.loadFeed().subscribe();
  }

  selectTab(tab: SocialTab): void {
    this.activeTab.set(tab);
    if (tab === 'feed') {
      this.socialService.loadFeed().subscribe();
    } else if (tab === 'friends') {
      this.socialService.loadFriends().subscribe();
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  onSendRequest(user: UserSearchResult): void {
    if (this.busyUserId()) {
      return;
    }

    this.busyUserId.set(user.id);
    this.socialService.sendFriendRequest(user.id).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.showToast(`Invitation envoyée à ${user.name}.`, 'success');
      },
      error: (err) => {
        this.busyUserId.set(null);
        this.showToast(
          err?.error?.message || 'Impossible d’envoyer l’invitation.',
          'error',
        );
      },
    });
  }

  onRespondRequest(request: FriendRequest, action: 'ACCEPT' | 'REJECT'): void {
    if (this.busyUserId()) {
      return;
    }

    this.busyUserId.set(request.id);
    this.socialService.respondToRequest(request.id, action).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.showToast(
          action === 'ACCEPT'
            ? `Vous êtes maintenant ami avec ${request.from.name}.`
            : `Invitation de ${request.from.name} refusée.`,
          'success',
        );
        if (action === 'ACCEPT') {
          this.socialService.loadFeed().subscribe();
        }
      },
      error: (err) => {
        this.busyUserId.set(null);
        this.showToast(
          err?.error?.message || 'Erreur lors du traitement de la demande.',
          'error',
        );
      },
    });
  }

  onAcceptFromSearch(user: UserSearchResult): void {
    if (!user.requestId || this.busyUserId()) {
      return;
    }

    this.busyUserId.set(user.id);
    this.socialService.respondToRequest(user.requestId, 'ACCEPT').subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.socialService.searchUsers(this.searchQuery()).subscribe();
        this.showToast(`Invitation de ${user.name} acceptée.`, 'success');
      },
      error: (err) => {
        this.busyUserId.set(null);
        this.showToast(
          err?.error?.message || 'Erreur lors de l’acceptation.',
          'error',
        );
      },
    });
  }

  onRemoveFriend(friend: FriendUser): void {
    if (this.busyUserId()) {
      return;
    }

    const confirmed = window.confirm(
      `Retirer ${friend.name} de vos amis ?\n\nAttention : tous les partages de spots privés et les accès collaboratifs aux listes entre vous seront automatiquement révoqués.`,
    );
    if (!confirmed) {
      return;
    }

    this.busyUserId.set(friend.id);
    this.socialService.removeFriend(friend.id).subscribe({
      next: (res) => {
        this.busyUserId.set(null);
        const detail =
          res.revokedSpotsCount > 0
            ? ` (${res.revokedSpotsCount} partage(s) privé(s) révoqué(s))`
            : '';
        this.showToast(`${friend.name} retiré de vos amis${detail}.`, 'success');
        this.socialService.loadFeed().subscribe();
      },
      error: (err) => {
        this.busyUserId.set(null);
        this.showToast(
          err?.error?.message || 'Impossible de retirer cet ami.',
          'error',
        );
      },
    });
  }

  getFeedBadgeLabel(item: FeedItem): string {
    switch (item.type) {
      case 'NEW_SPOT':
        return item.target.visibility === 'PRIVATE' ? 'Spot privé partagé' : 'Nouveau Spot';
      case 'NEW_REVIEW':
        return 'Avis';
      case 'NEW_LIST':
        return 'Liste';
    }
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.snackbar.set({ text, type });
    setTimeout(() => {
      if (this.snackbar()?.text === text) {
        this.snackbar.set(null);
      }
    }, 4000);
  }
}