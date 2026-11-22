import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { SocialService } from '../../shared/services/social.service';
import {
  FriendUser,
  SharedSpotResult,
  SpotVisibility,
} from '../../shared/models/friend.model';

@Component({
  selector: 'app-share-panel',
  standalone: true,
  imports: [],
  templateUrl: './share-panel.html',
  styleUrl: './share-panel.css',
})
export class SharePanelComponent implements OnInit {
  private readonly authService = inject(AuthService);
  readonly socialService = inject(SocialService);

  readonly spotId = input.required<string>();
  readonly title = input.required<string>();
  readonly ownerId = input.required<string>();
  readonly visibility = input.required<SpotVisibility>();
  readonly sharedWith = input.required<string[]>();

  readonly shareUpdated = output<SharedSpotResult>();

  readonly selectedFriendId = signal<string>('');
  readonly saving = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly isOwner = computed(() => {
    const currentUserId = this.authService.currentUser()?.id;
    return Boolean(currentUserId && currentUserId === this.ownerId());
  });

  readonly sharedFriendsDetails = computed<FriendUser[]>(() => {
    const allFriends = this.socialService.friends();
    const sharedIds = this.sharedWith() || [];

    return sharedIds.map((id) => {
      const found = allFriends.find((f) => f.id === id);
      return (
        found ?? {
          id,
          name: `Ami (#${id.slice(-4)})`,
          email: '',
          avatar: '',
        }
      );
    });
  });

  readonly availableFriendsToAdd = computed<FriendUser[]>(() => {
    const sharedSet = new Set(this.sharedWith() || []);
    return this.socialService.friends().filter((f) => !sharedSet.has(f.id));
  });

  ngOnInit(): void {
    if (!this.authService.currentUser() && this.authService.token()) {
      this.authService.profile().subscribe({
        next: () => {
          if (this.isOwner()) {
            this.socialService.loadFriends().subscribe();
          }
        },
      });
      return;
    }

    if (this.isOwner()) {
      this.socialService.loadFriends().subscribe();
    }
  }

  onVisibilityChange(newVisibility: SpotVisibility): void {
    if (this.saving() || newVisibility === this.visibility()) {
      return;
    }

    this.saving.set(true);
    this.clearMessages();

    this.socialService
      .updateSpotShare(this.spotId(), { visibility: newVisibility })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.feedbackMessage.set(
            `Visibilité mise à jour : ${this.getVisibilityLabel(updated.visibility)}.`,
          );
          this.shareUpdated.emit(updated);
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Impossible de modifier la visibilité.',
          );
        },
      });
  }

  onSelectFriend(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedFriendId.set(select.value);
  }

  onAddFriendShare(): void {
    const friendId = this.selectedFriendId();
    if (!friendId || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.clearMessages();

    this.socialService
      .updateSpotShare(this.spotId(), { addUserId: friendId })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.selectedFriendId.set('');
          this.feedbackMessage.set('Lieu partagé avec cet ami.');
          this.shareUpdated.emit(updated);
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Erreur lors du partage avec cet ami.',
          );
        },
      });
  }

  onRevokeAccess(friend: FriendUser): void {
    if (this.saving()) {
      return;
    }

    const confirmed = window.confirm(
      `Stopper le partage de « ${this.title()} » avec ${friend.name} ? Il n'y aura plus accès immédiatement.`,
    );
    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.clearMessages();

    this.socialService.revokeSpotAccess(this.spotId(), friend.id).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.feedbackMessage.set(`Partage stoppé pour ${friend.name}.`);
        this.shareUpdated.emit(updated);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Impossible de stopper le partage.',
        );
      },
    });
  }

  getVisibilityLabel(vis: SpotVisibility): string {
    switch (vis) {
      case 'PUBLIC':
        return 'Public (tout le monde)';
      case 'FRIENDS':
        return 'Amis uniquement';
      case 'PRIVATE':
        return 'Privé (partage sélectif)';
    }
  }

  private clearMessages(): void {
    this.feedbackMessage.set(null);
    this.errorMessage.set(null);
  }
}