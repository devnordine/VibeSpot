import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { LoginPageComponent } from './components/login-page/login-page';
import { RegisterPageComponent } from './components/register-page/register-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'explore' },
  { path: 'login', component: LoginPageComponent, title: 'Connexion · VibeSpot' },
  { path: 'register', component: RegisterPageComponent, title: 'Inscription · VibeSpot' },

  // --- Partie A : Spots & Carte -------------------------------------------
  {
    path: 'explore',
    canActivate: [authGuard],
    title: 'Explorer · VibeSpot',
    loadComponent: () =>
      import('./components/explore-page/explore-page').then((m) => m.ExplorePageComponent),
  },
  {
    path: 'spots/:id',
    canActivate: [authGuard],
    title: 'Spot · VibeSpot',
    loadComponent: () =>
      import('./components/spot-detail-page/spot-detail-page').then((m) => m.SpotDetailPageComponent),
  },

  // --- Partie B : Social, Partage & Listes -----------------------------------
  {
    path: 'social',
    canActivate: [authGuard],
    title: 'Social · VibeSpot',
    loadComponent: () =>
      import('./components/social-page/social-page').then((m) => m.SocialPageComponent),
  },
  {
    path: 'lists',
    canActivate: [authGuard],
    title: 'Mes listes · VibeSpot',
    loadComponent: () =>
      import('./components/lists-page/lists-page').then((m) => m.ListsPageComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    title: 'Profil · VibeSpot',
    loadComponent: () =>
      import('./components/profile-page/profile-page').then((m) => m.ProfilePageComponent),
  },

  { path: '**', redirectTo: 'explore' },
];
