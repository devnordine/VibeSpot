import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { ListSpotSummary } from '../../shared/models/custom-list.model';

export type ProfileTab =
  | 'my-spots'
  | 'shared-with-me'
  | 'favorites'
  | 'recommendations';

export interface BadgeInfo {
  code: string;
  label: string;
  description: string;
}

interface SpotPageResponse {
  items: (ListSpotSummary & { createdBy?: string })[];
  total: number;
}

interface ExtendedUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  tastes?: string[];
  favorites?: string[];
  badges?: string[];
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly authService = inject(AuthService);

  readonly availableMoods = [
    'travail',
    'calme',
    'festif',
    'gourmand',
    'sportif',
    'photo',
    'romantique',
    'nature',
  ];

  readonly allBadges: BadgeInfo[] = [
    {
      code: 'pionnier',
      label: 'Pionnier VibeSpot',
      description: 'Membre fondateur de la communauté VibeSpot.',
    },
    {
      code: 'explorateur',
      label: 'Explorateur',
      description: 'A partagé au moins un lieu avec la communauté.',
    },
    {
      code: 'foodie',
      label: 'Foodie',
      description: 'A évalué un restaurant ou un café.',
    },
    {
      code: 'photographe',
      label: 'Photographe',
      description: 'A enrichi la galerie photo d’un lieu.',
    },
  ];

  // État du profil et formulaire d'édition
  readonly userDetails = signal<ExtendedUser | null>(null);
  readonly editName = signal<string>('');
  readonly editBio = signal<string>('');
  readonly editTastes = signal<string[]>([]);
  readonly savingProfile = signal<boolean>(false);
  readonly profileMessage = signal<string | null>(null);
  readonly profileError = signal<string | null>(null);

  // Onglets de découverte personnelle
  readonly activeTab = signal<ProfileTab>('my-spots');
  readonly tabSpots = signal<(ListSpotSummary & { createdBy?: string })[]>([]);
  readonly loadingTab = signal<boolean>(false);

  readonly unlockedBadgeCodes = computed<Set<string>>(() => {
    const badges = this.userDetails()?.badges || ['pionnier'];
    return new Set(badges);
  });

  ngOnInit(): void {
    this.loadFullProfile();
  }

  loadFullProfile(): void {
    this.http.get<ExtendedUser>('/api/users/me').subscribe({
      next: (user) => {
        this.userDetails.set(user);
        this.editName.set(user.name || '');
        this.editBio.set(user.bio || '');
        this.editTastes.set([...(user.tastes || [])]);
        this.loadTabSpots(this.activeTab());
      },
      error: () => {
        this.profileError.set('Impossible de charger les informations du profil.');
      },
    });
  }

  onNameInput(event: Event): void {
    this.editName.set((event.target as HTMLInputElement).value);
  }

  onBioInput(event: Event): void {
    this.editBio.set((event.target as HTMLTextAreaElement).value);
  }

  toggleTaste(mood: string): void {
    this.editTastes.update((current) =>
      current.includes(mood)
        ? current.filter((m) => m !== mood)
        : [...current, mood],
    );
  }

  onSaveProfile(event: Event): void {
    event.preventDefault();
    const trimmedName = this.editName().trim();
    if (!trimmedName || this.savingProfile()) {
      return;
    }

    this.savingProfile.set(true);
    this.profileMessage.set(null);
    this.profileError.set(null);

    this.http
      .put<ExtendedUser>('/api/users/me', {
        name: trimmedName,
        bio: this.editBio().trim(),
        tastes: this.editTastes(),
      })
      .subscribe({
        next: (updated) => {
          this.savingProfile.set(false);
          this.userDetails.set(updated);
          this.profileMessage.set('Profil et préférences enregistrés.');
          // Synchronise le signal global AuthService.currentUser
          this.authService.profile().subscribe();
          if (this.activeTab() === 'recommendations') {
            this.loadTabSpots('recommendations');
          }
        },
        error: (err) => {
          this.savingProfile.set(false);
          this.profileError.set(
            err?.error?.message || 'Erreur lors de la mise à jour du profil.',
          );
        },
      });
  }

  selectTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    this.loadTabSpots(tab);
  }

  loadTabSpots(tab: ProfileTab): void {
    this.loadingTab.set(true);
    const currentUserId = this.userDetails()?.id || this.authService.currentUser()?.id;

    if (tab === 'my-spots') {
      const params = new HttpParams().set('limit', '50');
      this.http.get<SpotPageResponse>('/api/spots', { params }).subscribe({
        next: (page) => {
          const mine = (page.items || []).filter(
            (s) => !currentUserId || s.createdBy === currentUserId,
          );
          this.tabSpots.set(mine);
          this.loadingTab.set(false);
        },
        error: () => {
          this.tabSpots.set([]);
          this.loadingTab.set(false);
        },
      });
      return;
    }

    if (tab === 'shared-with-me') {
      const params = new HttpParams()
        .set('visibility', 'SHARED_WITH_ME')
        .set('limit', '50');
      this.http.get<SpotPageResponse>('/api/spots', { params }).subscribe({
        next: (page) => {
          this.tabSpots.set(page.items || []);
          this.loadingTab.set(false);
        },
        error: () => {
          this.tabSpots.set([]);
          this.loadingTab.set(false);
        },
      });
      return;
    }

    if (tab === 'favorites') {
      this.http.get<ListSpotSummary[]>('/api/users/me/favorites').subscribe({
        next: (spots) => {
          this.tabSpots.set(spots || []);
          this.loadingTab.set(false);
        },
        error: () => {
          this.tabSpots.set([]);
          this.loadingTab.set(false);
        },
      });
      return;
    }

    this.http.get<ListSpotSummary[]>('/api/spots/recommendations').subscribe({
      next: (spots) => {
        this.tabSpots.set(spots || []);
        this.loadingTab.set(false);
      },
      error: () => {
        this.tabSpots.set([]);
        this.loadingTab.set(false);
      },
    });
  }

  getBudgetLabel(budget: number): string {
    return '€'.repeat(Math.max(1, Math.min(3, budget || 1)));
  }
}