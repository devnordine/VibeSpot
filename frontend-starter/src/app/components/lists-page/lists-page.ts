import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { AuthService } from '../../shared/services/auth.service';
import { ListService } from '../../shared/services/list.service';
import { SocialService } from '../../shared/services/social.service';
import {
  CustomList,
  ListCollaborator,
  ListSpotSummary,
} from '../../shared/models/custom-list.model';
import { FriendUser } from '../../shared/models/friend.model';

@Component({
  selector: 'app-lists-page',
  standalone: true,
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './lists-page.html',
  styleUrl: './lists-page.css',
})
export class ListsPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  readonly listService = inject(ListService);
  readonly socialService = inject(SocialService);

  // Formulaire de création d'une liste
  readonly showCreateForm = signal<boolean>(false);
  readonly newName = signal<string>('');
  readonly newDescription = signal<string>('');
  readonly newIsPublic = signal<boolean>(true);
  readonly newCollaboratorIds = signal<string[]>([]);
  readonly creating = signal<boolean>(false);

  // Gestion de la liste sélectionnée
  readonly selectedCollaboratorToAdd = signal<string>('');
  readonly busyAction = signal<boolean>(false);
  readonly snackbar = signal<{ text: string; type: 'success' | 'error' } | null>(
    null,
  );

  readonly isOwnerOfSelectedList = computed<boolean>(() => {
    const list = this.listService.selectedList();
    const userId = this.authService.currentUser()?.id;
    return Boolean(list && userId && list.ownerId === userId);
  });

  readonly canEditSelectedList = computed<boolean>(() => {
    const list = this.listService.selectedList();
    const userId = this.authService.currentUser()?.id;
    if (!list || !userId) return false;
    if (list.ownerId === userId) return true;
    return (list.collaborators || []).some((c) =>
      typeof c === 'string' ? c === userId : c.id === userId,
    );
  });

  readonly selectedListCollaborators = computed<ListCollaborator[]>(() => {
    const list = this.listService.selectedList();
    if (!list) return [];
    const friends = this.socialService.friends();

    return (list.collaborators || []).map((c) => {
      if (typeof c !== 'string') {
        return c;
      }
      const found = friends.find((f) => f.id === c);
      return (
        found ?? {
          id: c,
          name: `Collaborateur (#${c.slice(-4)})`,
          email: '',
          avatar: '',
        }
      );
    });
  });

  readonly availableFriendsToCollaborate = computed<FriendUser[]>(() => {
    const currentCollabIds = new Set(
      this.selectedListCollaborators().map((c) => c.id),
    );
    return this.socialService
      .friends()
      .filter((f) => !currentCollabIds.has(f.id));
  });

  ngOnInit(): void {
    if (!this.authService.currentUser() && this.authService.token()) {
      this.authService.profile().subscribe();
    }

    this.socialService.loadFriends().subscribe();
    this.listService.loadLists().subscribe({
      next: (lists) => {
        if (lists.length > 0 && !this.listService.selectedList()) {
          this.selectList(lists[0]);
        }
      },
    });
  }

  selectList(list: CustomList): void {
    this.selectedCollaboratorToAdd.set('');
    this.listService.getListById(list.id).subscribe();
  }

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
  }

  onNewNameInput(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  onNewDescriptionInput(event: Event): void {
    this.newDescription.set((event.target as HTMLTextAreaElement).value);
  }

  onNewVisibilityChange(isPublic: boolean): void {
    this.newIsPublic.set(isPublic);
  }

  toggleNewCollaborator(friendId: string): void {
    this.newCollaboratorIds.update((ids) =>
      ids.includes(friendId)
        ? ids.filter((id) => id !== friendId)
        : [...ids, friendId],
    );
  }

  onCreateList(event: Event): void {
    event.preventDefault();
    const name = this.newName().trim();
    if (!name || this.creating()) {
      return;
    }

    this.creating.set(true);
    this.listService
      .createList({
        name,
        description: this.newDescription().trim(),
        isPublic: this.newIsPublic(),
        collaborators: this.newCollaboratorIds(),
      })
      .subscribe({
        next: (created) => {
          this.creating.set(false);
          this.newName.set('');
          this.newDescription.set('');
          this.newIsPublic.set(true);
          this.newCollaboratorIds.set([]);
          this.showCreateForm.set(false);
          this.showToast(`Liste « ${created.name} » créée.`, 'success');
        },
        error: (err) => {
          this.creating.set(false);
          this.showToast(
            err?.error?.message || 'Erreur lors de la création de la liste.',
            'error',
          );
        },
      });
  }

  onToggleSelectedVisibility(): void {
    const list = this.listService.selectedList();
    if (!list || !this.isOwnerOfSelectedList() || this.busyAction()) {
      return;
    }

    this.busyAction.set(true);
    this.listService
      .updateList(list.id, { isPublic: !list.isPublic })
      .subscribe({
        next: (updated) => {
          this.busyAction.set(false);
          this.showToast(
            updated.isPublic
              ? 'La liste est désormais publique.'
              : 'La liste est désormais privée.',
            'success',
          );
        },
        error: (err) => {
          this.busyAction.set(false);
          this.showToast(
            err?.error?.message || 'Impossible de modifier la visibilité.',
            'error',
          );
        },
      });
  }

  onSelectCollaborator(event: Event): void {
    this.selectedCollaboratorToAdd.set(
      (event.target as HTMLSelectElement).value,
    );
  }

  onAddCollaborator(): void {
    const list = this.listService.selectedList();
    const friendId = this.selectedCollaboratorToAdd();
    if (!list || !friendId || !this.isOwnerOfSelectedList() || this.busyAction()) {
      return;
    }

    const updatedIds = [
      ...this.selectedListCollaborators().map((c) => c.id),
      friendId,
    ];

    this.busyAction.set(true);
    this.listService
      .updateList(list.id, { collaborators: updatedIds })
      .subscribe({
        next: () => {
          this.busyAction.set(false);
          this.selectedCollaboratorToAdd.set('');
          this.showToast('Collaborateur ajouté à la liste.', 'success');
        },
        error: (err) => {
          this.busyAction.set(false);
          this.showToast(
            err?.error?.message || 'Impossible d’ajouter ce collaborateur.',
            'error',
          );
        },
      });
  }

  onRemoveCollaborator(collab: ListCollaborator): void {
    const list = this.listService.selectedList();
    if (!list || !this.isOwnerOfSelectedList() || this.busyAction()) {
      return;
    }

    const updatedIds = this.selectedListCollaborators()
      .map((c) => c.id)
      .filter((id) => id !== collab.id);

    this.busyAction.set(true);
    this.listService
      .updateList(list.id, { collaborators: updatedIds })
      .subscribe({
        next: () => {
          this.busyAction.set(false);
          this.showToast(`${collab.name} retiré des collaborateurs.`, 'success');
        },
        error: (err) => {
          this.busyAction.set(false);
          this.showToast(
            err?.error?.message || 'Impossible de retirer ce collaborateur.',
            'error',
          );
        },
      });
  }

  onSpotDrop(event: CdkDragDrop<ListSpotSummary[]>): void {
    const list = this.listService.selectedList();
    if (
      !list ||
      !this.canEditSelectedList() ||
      event.previousIndex === event.currentIndex
    ) {
      return;
    }

    const reordered = [...list.spots];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const spotIds = reordered.map((s) => s.id);

    this.listService.reorderSpots(list.id, spotIds).subscribe({
      next: () => {
        this.showToast('Ordre des lieux enregistré.', 'success');
      },
      error: (err) => {
        this.showToast(
          err?.error?.message || 'Erreur lors du réordonnancement.',
          'error',
        );
      },
    });
  }

  onRemoveSpot(spot: ListSpotSummary): void {
    const list = this.listService.selectedList();
    if (!list || !this.canEditSelectedList() || this.busyAction()) {
      return;
    }

    this.busyAction.set(true);
    this.listService.removeSpotFromList(list.id, spot.id).subscribe({
      next: () => {
        this.busyAction.set(false);
        this.showToast(`« ${spot.title} » retiré de la liste.`, 'success');
      },
      error: (err) => {
        this.busyAction.set(false);
        this.showToast(
          err?.error?.message || 'Erreur lors du retrait du lieu.',
          'error',
        );
      },
    });
  }

  onDeleteList(list: CustomList): void {
    if (!this.isOwnerOfSelectedList() || this.busyAction()) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement la liste « ${list.name} » ?`,
    );
    if (!confirmed) {
      return;
    }

    this.busyAction.set(true);
    this.listService.deleteList(list.id).subscribe({
      next: () => {
        this.busyAction.set(false);
        this.showToast(`Liste « ${list.name} » supprimée.`, 'success');
        const remaining = this.listService.lists();
        if (remaining.length > 0) {
          this.selectList(remaining[0]);
        }
      },
      error: (err) => {
        this.busyAction.set(false);
        this.showToast(
          err?.error?.message || 'Impossible de supprimer la liste.',
          'error',
        );
      },
    });
  }

  getBudgetLabel(budget: number): string {
    return '€'.repeat(Math.max(1, Math.min(3, budget || 1)));
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