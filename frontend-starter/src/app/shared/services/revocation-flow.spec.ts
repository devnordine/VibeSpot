import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SocialService } from './social.service';
import { SharedSpotResult } from '../models/friend.model';

describe('Parcours critique de révocation ACL & gestion d’amitié (E2E Service Flow)', () => {
  let socialService: SocialService;
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    socialService = TestBed.inject(SocialService);
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('partage un spot privé, révoque l’accès via PATCH /api/spots/:id/share et vérifie le rejet 403 Forbidden', () => {
    // 1. Le propriétaire passe le spot en PRIVATE et le partage avec Sarah ('sarah-id')
    const sharedResponse: SharedSpotResult = {
      id: 'spot-secret-1',
      title: 'Belvédère secret du Mont Boron',
      visibility: 'PRIVATE',
      sharedWith: ['sarah-id'],
      createdBy: 'nordine-id',
    };

    socialService
      .updateSpotShare('spot-secret-1', {
        visibility: 'PRIVATE',
        addUserId: 'sarah-id',
      })
      .subscribe((res) => {
        expect(res.visibility).toBe('PRIVATE');
        expect(res.sharedWith.includes('sarah-id')).toBe(true);
      });

    const shareReq = httpMock.expectOne('/api/spots/spot-secret-1/share');
    expect(shareReq.request.method).toBe('PATCH');
    expect(shareReq.request.body).toEqual({
      visibility: 'PRIVATE',
      addUserId: 'sarah-id',
    });
    shareReq.flush(sharedResponse);

    // 2. Le propriétaire clique sur « Stopper le partage » pour Sarah
    const revokedResponse: SharedSpotResult = {
      ...sharedResponse,
      sharedWith: [],
    };

    socialService
      .revokeSpotAccess('spot-secret-1', 'sarah-id')
      .subscribe((res) => {
        expect(res.sharedWith.includes('sarah-id')).toBe(false);
        expect(res.sharedWith.length).toBe(0);
      });

    const revokeReq = httpMock.expectOne('/api/spots/spot-secret-1/share');
    expect(revokeReq.request.method).toBe('PATCH');
    expect(revokeReq.request.body).toEqual({ removeUserId: 'sarah-id' });
    revokeReq.flush(revokedResponse);

    // 3. Tentative d'accès ultérieure au détail du spot par l'ami révoqué -> 403 Forbidden
    let capturedStatus = 0;
    httpClient.get('/api/spots/spot-secret-1').subscribe({
      next: () => {
        throw new Error('La requête aurait dû échouer avec un code 403');
      },
      error: (err: HttpErrorResponse) => {
        capturedStatus = err.status;
      },
    });

    const forbiddenReq = httpMock.expectOne('/api/spots/spot-secret-1');
    expect(forbiddenReq.request.method).toBe('GET');
    forbiddenReq.flush(
      { message: 'Accès refusé : vous n’êtes plus autorisé à voir ce lieu.' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(capturedStatus).toBe(403);
  });

  it('supprime un ami via DELETE /api/friends/:friendId, révoque en cascade et met à jour les Signals', () => {
    // Préparation de l'état initial : Sarah est dans la liste d'amis et dans les résultats de recherche
    socialService.loadFriends().subscribe();
    httpMock.expectOne('/api/friends').flush({
      friends: [
        {
          id: 'sarah-id',
          name: 'Sarah',
          email: 'sarah@vibespot.fr',
          avatar: '',
        },
      ],
      incomingRequests: [],
      outgoingRequests: [],
    });

    socialService.searchUsers('Sarah').subscribe();
    httpMock.expectOne('/api/users/search?q=Sarah').flush([
      {
        id: 'sarah-id',
        name: 'Sarah',
        email: 'sarah@vibespot.fr',
        avatar: '',
        relationStatus: 'FRIEND',
      },
    ]);

    expect(socialService.friendsCount()).toBe(1);
    expect(socialService.searchResults()[0].relationStatus).toBe('FRIEND');

    // Suppression de l'ami
    let revokedCount = 0;
    socialService.removeFriend('sarah-id').subscribe((res) => {
      revokedCount = res.revokedSpotsCount;
    });

    const deleteReq = httpMock.expectOne('/api/friends/sarah-id');
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush({
      message: 'Ami retiré et partages privés révoqués',
      revokedSpotsCount: 2,
    });

    expect(revokedCount).toBe(2);
    expect(socialService.friendsCount()).toBe(0);
    expect(
      socialService.friends().some((f) => f.id === 'sarah-id'),
    ).toBe(false);
    expect(socialService.searchResults()[0].relationStatus).toBe('NONE');
  });
});