import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SocialService } from './social.service';
import {
  FriendsOverview,
  SharedSpotResult,
  UserSearchResult,
} from '../models/friend.model';

describe('SocialService', () => {
  let service: SocialService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SocialService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('charge les amis et invitations et met à jour les Signals et compteurs', () => {
    const mockOverview: FriendsOverview = {
      friends: [
        {
          id: 'u1',
          name: 'Sarah',
          email: 'sarah@example.com',
          avatar: '',
        },
      ],
      incomingRequests: [
        {
          id: 'req1',
          from: {
            id: 'u2',
            name: 'Yanis',
            email: 'yanis@example.com',
            avatar: '',
          },
          status: 'PENDING',
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ],
      outgoingRequests: [],
    };

    service.loadFriends().subscribe((res) => {
      expect(res.friends.length).toBe(1);
    });

    const req = httpMock.expectOne('/api/friends');
    expect(req.request.method).toBe('GET');
    req.flush(mockOverview);

    expect(service.friends().length).toBe(1);
    expect(service.friendsCount()).toBe(1);
    expect(service.pendingRequestsCount()).toBe(1);
    expect(service.loading()).toBe(false);
  });

  it('envoie une invitation d’ami et bascule relationStatus à PENDING_SENT', () => {
    const searchMock: UserSearchResult[] = [
      {
        id: 'u3',
        name: 'Lucas',
        email: 'lucas@example.com',
        avatar: '',
        relationStatus: 'NONE',
      },
    ];

    service.searchUsers('Lucas').subscribe();
    const searchReq = httpMock.expectOne('/api/users/search?q=Lucas');
    searchReq.flush(searchMock);

    expect(service.searchResults()[0].relationStatus).toBe('NONE');

    service.sendFriendRequest('u3').subscribe((res) => {
      expect(res.targetUserId).toBe('u3');
    });

    const inviteReq = httpMock.expectOne('/api/friends/request/u3');
    expect(inviteReq.request.method).toBe('POST');
    inviteReq.flush({ message: 'Invitation envoyée', targetUserId: 'u3' });

    expect(service.searchResults()[0].relationStatus).toBe('PENDING_SENT');
  });

  it('accepte une demande d’ami, retire la requête et ajoute l’ami dans le Signal friends', () => {
    service.loadFriends().subscribe();
    httpMock.expectOne('/api/friends').flush({
      friends: [],
      incomingRequests: [
        {
          id: 'req42',
          from: {
            id: 'u2',
            name: 'Yanis',
            email: 'yanis@example.com',
            avatar: '',
          },
          status: 'PENDING',
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ],
      outgoingRequests: [],
    });

    expect(service.pendingRequestsCount()).toBe(1);
    expect(service.friendsCount()).toBe(0);

    service.respondToRequest('req42', 'ACCEPT').subscribe();

    const patchReq = httpMock.expectOne('/api/friends/respond/req42');
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ action: 'ACCEPT' });
    patchReq.flush({ message: 'Invitation acceptée', status: 'ACCEPTED' });

    expect(service.pendingRequestsCount()).toBe(0);
    expect(service.friendsCount()).toBe(1);
    expect(service.friends()[0].id).toBe('u2');
  });

  it('stoppe le partage d’un spot privé avec un ami via PATCH /api/spots/:id/share', () => {
    const mockSpotResult: SharedSpotResult = {
      id: 'spot1',
      title: 'Toit panoramique secret',
      visibility: 'PRIVATE',
      sharedWith: ['u1'],
      createdBy: 'me',
    };

    service.revokeSpotAccess('spot1', 'u2').subscribe((updated) => {
      expect(updated.sharedWith).toEqual(['u1']);
      expect(updated.sharedWith.includes('u2')).toBe(false);
    });

    const req = httpMock.expectOne('/api/spots/spot1/share');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ removeUserId: 'u2' });
    req.flush(mockSpotResult);
  });
});