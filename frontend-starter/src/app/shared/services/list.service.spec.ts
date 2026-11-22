import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ListService } from './list.service';
import { CustomList } from '../models/custom-list.model';

describe('ListService', () => {
  let service: ListService;
  let httpMock: HttpTestingController;

  const baseList: CustomList = {
    id: 'list1',
    name: 'Cafés Coworking Nice',
    description: 'Spots calmes avec prises et wifi',
    ownerId: 'me',
    isPublic: false,
    collaborators: [
      {
        id: 'u1',
        name: 'Sarah',
        email: 'sarah@example.com',
        avatar: '',
      },
    ],
    spots: [
      {
        id: 's1',
        title: 'Café Koohi',
        category: 'cafe',
        moods: ['travail'],
        budget: 1,
        address: '12 Rue de France',
        city: 'Nice',
        coverPhoto: '',
        ratingAverage: 4.8,
      },
      {
        id: 's2',
        title: 'Bibliothèque Nucéra',
        category: 'bibliotheque',
        moods: ['calme'],
        budget: 1,
        address: '2 Place Yves Klein',
        city: 'Nice',
        coverPhoto: '',
        ratingAverage: 4.5,
      },
    ],
    spotsCount: 2,
    createdAt: '2026-11-22T11:00:00.000Z',
    updatedAt: '2026-11-22T11:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ListService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('crée une liste collaborative et l’ajoute aux Signals lists et selectedList', () => {
    service
      .createList({
        name: 'Cafés Coworking Nice',
        isPublic: false,
        collaborators: ['u1'],
      })
      .subscribe((created) => {
        expect(created.id).toBe('list1');
      });

    const req = httpMock.expectOne('/api/lists');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.collaborators).toEqual(['u1']);
    req.flush(baseList);

    expect(service.listsCount()).toBe(1);
    expect(service.selectedList()?.id).toBe('list1');
  });

  it('ajoute un spot à une liste via POST /api/lists/:id/spots/:spotId', () => {
    service.createList({ name: 'Cafés Coworking Nice' }).subscribe();
    httpMock.expectOne('/api/lists').flush({ ...baseList, spots: [], spotsCount: 0 });

    service.addSpotToList('list1', 's1').subscribe((updated) => {
      expect(updated.spotsCount).toBe(1);
    });

    const req = httpMock.expectOne('/api/lists/list1/spots/s1');
    expect(req.request.method).toBe('POST');
    req.flush({
      ...baseList,
      spots: [baseList.spots[0]],
      spotsCount: 1,
    });

    expect(service.selectedList()?.spots.length).toBe(1);
    expect(service.lists()[0].spotsCount).toBe(1);
  });

  it('réordonne les spots d’une liste via PUT /api/lists/:id/reorder', () => {
    service.createList({ name: 'Cafés Coworking Nice' }).subscribe();
    httpMock.expectOne('/api/lists').flush(baseList);

    const reorderedSpots = [baseList.spots[1], baseList.spots[0]];

    service.reorderSpots('list1', ['s2', 's1']).subscribe((updated) => {
      expect(updated.spots[0].id).toBe('s2');
      expect(updated.spots[1].id).toBe('s1');
    });

    const req = httpMock.expectOne('/api/lists/list1/reorder');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ spotIds: ['s2', 's1'] });
    req.flush({
      ...baseList,
      spots: reorderedSpots,
    });

    expect(service.selectedList()?.spots[0].id).toBe('s2');
  });
});