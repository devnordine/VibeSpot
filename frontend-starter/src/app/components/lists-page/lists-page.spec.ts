import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ListsPageComponent } from './lists-page';
import { AuthService } from '../../shared/services/auth.service';
import { CustomList, ListSpotSummary } from '../../shared/models/custom-list.model';

describe('ListsPageComponent', () => {
  let fixture: ComponentFixture<ListsPageComponent>;
  let component: ListsPageComponent;
  let httpMock: HttpTestingController;

  const mockAuthService = {
    currentUser: signal({
      id: 'owner1',
      name: 'Nordine',
      email: 'nordine@example.com',
    }),
    token: signal('fake-token'),
  };

  const sampleList: CustomList = {
    id: 'list1',
    name: 'Spots Photo Nice',
    description: 'Points de vue coucher de soleil',
    ownerId: 'owner1',
    isPublic: false,
    collaborators: [],
    spots: [
      {
        id: 's1',
        title: 'Colline du Château',
        category: 'parc',
        moods: ['photo'],
        budget: 1,
        address: 'Montée Lesage',
        city: 'Nice',
        coverPhoto: '',
        ratingAverage: 4.9,
      },
      {
        id: 's2',
        title: 'Promenade des Anglais',
        category: 'parc',
        moods: ['calme'],
        budget: 1,
        address: 'Promenade des Anglais',
        city: 'Nice',
        coverPhoto: '',
        ratingAverage: 4.7,
      },
    ],
    spotsCount: 2,
    createdAt: '2026-11-22T12:00:00.000Z',
    updatedAt: '2026-11-22T12:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ListsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Intercepte les appels initiaux de ngOnInit()
    httpMock.expectOne('/api/friends').flush({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    });
    httpMock.expectOne('/api/lists').flush([sampleList]);
    httpMock.expectOne('/api/lists/list1').flush(sampleList);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('charge la liste sélectionnée et reconnaît le propriétaire', () => {
    expect(component).toBeTruthy();
    expect(component.isOwnerOfSelectedList()).toBe(true);
    expect(component.canEditSelectedList()).toBe(true);
    expect(component.listService.selectedList()?.spots.length).toBe(2);
  });

  it('envoie PUT /api/lists/:id/reorder lors d’un glisser-déposer', () => {
    const dropEvent = {
      previousIndex: 0,
      currentIndex: 1,
    } as CdkDragDrop<ListSpotSummary[]>;

    component.onSpotDrop(dropEvent);

    const reorderReq = httpMock.expectOne('/api/lists/list1/reorder');
    expect(reorderReq.request.method).toBe('PUT');
    expect(reorderReq.request.body).toEqual({ spotIds: ['s2', 's1'] });

    reorderReq.flush({
      ...sampleList,
      spots: [sampleList.spots[1], sampleList.spots[0]],
    });

    expect(component.listService.selectedList()?.spots[0].id).toBe('s2');
  });
});