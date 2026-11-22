import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';

describe('ProfilePageComponent', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;
  let httpMock: HttpTestingController;

  const mockUser = {
    id: 'u1',
    name: 'Nordine',
    email: 'nordine@example.com',
    bio: 'Explorateur de cafés calmes',
    tastes: ['travail', 'photo'],
    badges: ['pionnier', 'explorateur'],
  };

  const mockAuthService = {
    currentUser: signal(mockUser),
    token: signal('fake-token'),
    profile: () => of(mockUser),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Intercepte GET /api/users/me puis GET /api/spots?limit=50 (onglet 'my-spots')
    httpMock.expectOne('/api/users/me').flush(mockUser);
    httpMock.expectOne('/api/spots?limit=50').flush({
      items: [
        {
          id: 's1',
          title: 'Mon café favori',
          category: 'cafe',
          moods: ['travail'],
          budget: 1,
          address: '10 Rue Masséna',
          city: 'Nice',
          coverPhoto: '',
          ratingAverage: 4.8,
          createdBy: 'u1',
        },
      ],
      total: 1,
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('affiche les badges débloqués et charge les spots de l’utilisateur', () => {
    expect(component).toBeTruthy();
    expect(component.unlockedBadgeCodes().has('explorateur')).toBe(true);
    expect(component.unlockedBadgeCodes().has('foodie')).toBe(false);
    expect(component.tabSpots().length).toBe(1);
  });

  it('charge les spots partagés avec moi lors du basculement sur l’onglet shared-with-me', () => {
    component.selectTab('shared-with-me');

    const req = httpMock.expectOne(
      '/api/spots?visibility=SHARED_WITH_ME&limit=50',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 's99',
          title: 'Toit secret partagé',
          category: 'lieu_culturel',
          moods: ['photo'],
          budget: 1,
          address: 'Vieux Nice',
          city: 'Nice',
          coverPhoto: '',
          ratingAverage: 5,
          visibility: 'PRIVATE',
        },
      ],
      total: 1,
    });

    expect(component.activeTab()).toBe('shared-with-me');
    expect(component.tabSpots()[0].id).toBe('s99');
  });
});