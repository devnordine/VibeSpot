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

  // --- Partie B (binôme) : emplacements provisoires -------------------------
  {
    path: 'social',
    canActivate: [authGuard],
    title: 'Social · VibeSpot',
    data: { title: 'Réseau d’amis & fil d’activité' },
    loadComponent: () =>
      import('./components/placeholder-page/placeholder-page').then((m) => m.PlaceholderPageComponent),
  },
  {
    path: 'lists',
    canActivate: [authGuard],
    title: 'Mes listes · VibeSpot',
    data: { title: 'Mes listes & carnets collaboratifs' },
    loadComponent: () =>
      import('./components/placeholder-page/placeholder-page').then((m) => m.PlaceholderPageComponent),
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
