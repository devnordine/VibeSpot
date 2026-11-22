import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SharePanelComponent } from './share-panel';
import { AuthService } from '../../shared/services/auth.service';

describe('SharePanelComponent', () => {
  let fixture: ComponentFixture<SharePanelComponent>;
  let component: SharePanelComponent;
  let httpMock: HttpTestingController;

  const mockAuthService = {
    currentUser: signal({
      id: 'owner1',
      name: 'Nordine',
      email: 'nordine@example.com',
    }),
    token: signal('fake-jwt-token'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharePanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SharePanelComponent);
    component = fixture.componentInstance;

    // Fourniture des input.required()
    fixture.componentRef.setInput('spotId', 'spot123');
    fixture.componentRef.setInput('title', 'Spot photo secret');
    fixture.componentRef.setInput('ownerId', 'owner1');
    fixture.componentRef.setInput('visibility', 'PRIVATE');
    fixture.componentRef.setInput('sharedWith', ['friend1']);

    fixture.detectChanges();

    // Intercepte le chargement initial des amis déclenché par ngOnInit()
    const friendsReq = httpMock.expectOne('/api/friends');
    friendsReq.flush({
      friends: [
        {
          id: 'friend1',
          name: 'Sarah',
          email: 'sarah@example.com',
          avatar: '',
        },
      ],
      incomingRequests: [],
      outgoingRequests: [],
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('affiche le panneau propriétaire et la liste des amis autorisés', () => {
    expect(component).toBeTruthy();
    expect(component.isOwner()).toBe(true);
    expect(component.sharedFriendsDetails().length).toBe(1);
    expect(component.sharedFriendsDetails()[0].name).toBe('Sarah');
  });

  it('envoie une requête PATCH /api/spots/:id/share lors du clic sur Stopper le partage', () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    try {
      let emittedResult: unknown = null;
      component.shareUpdated.subscribe((res) => {
        emittedResult = res;
      });

      const revokeBtn: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.btn-revoke');
      expect(revokeBtn).not.toBeNull();
      revokeBtn?.click();

      const patchReq = httpMock.expectOne('/api/spots/spot123/share');
      expect(patchReq.request.method).toBe('PATCH');
      expect(patchReq.request.body).toEqual({ removeUserId: 'friend1' });

      patchReq.flush({
        id: 'spot123',
        title: 'Spot photo secret',
        visibility: 'PRIVATE',
        sharedWith: [],
        createdBy: 'owner1',
      });

      expect(emittedResult).toBeTruthy();
    } finally {
      window.confirm = originalConfirm;
    }
  });
});