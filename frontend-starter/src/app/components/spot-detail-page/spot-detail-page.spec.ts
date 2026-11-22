import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotDetailPageComponent } from './spot-detail-page';
import { SpotMapComponent } from '../spot-map/spot-map';
import { SharePanelComponent } from '../share-panel/share-panel';
import { SpotService } from '../../shared/services/spot.service';
import { AuthService } from '../../shared/services/auth.service';
import { ListService } from '../../shared/services/list.service';
import { Spot, SpotMarker } from '../../shared/models/spot.model';
import { SharedSpotResult } from '../../shared/models/friend.model';
import { User } from '../../shared/models/user.model';
import { makeSpot } from '../../shared/testing/spot-fixtures';

@Component({ selector: 'app-spot-map', standalone: true, template: '' })
class SpotMapStub {
  readonly markers = input<SpotMarker[]>([]);
}

@Component({ selector: 'app-share-panel', standalone: true, template: '' })
class SharePanelStub {
  readonly spotId = input<string>('');
  readonly title = input<string>('');
  readonly ownerId = input<string>('');
  readonly visibility = input<string>('PUBLIC');
  readonly sharedWith = input<string[]>([]);
  readonly shareUpdated = output<SharedSpotResult>();
}

const ME = 'user-me';

const spotWithReviews = makeSpot({
  id: 's1',
  title: 'Colline du Château',
  createdBy: ME,
  photos: [
    { id: 'p1', url: '/uploads/1.jpg', caption: '', createdAt: '' },
    { id: 'p2', url: '/uploads/2.jpg', caption: '', createdAt: '' },
    { id: 'p3', url: '/uploads/3.jpg', caption: '', createdAt: '' },
  ],
  reviews: [
    { id: 'r1', userId: ME, userName: 'Moi', rating: 4, comment: 'Top', moodExperienced: 'calme', createdAt: '2026-11-20T10:00:00Z' },
    { id: 'r2', userId: 'other', userName: 'Alex', rating: 5, comment: 'Super', moodExperienced: '', createdAt: '2026-11-21T10:00:00Z' },
  ],
});

describe('SpotDetailPageComponent', () => {
  let spotService: {
    getById: ReturnType<typeof vi.fn>;
    addReview: ReturnType<typeof vi.fn>;
    deleteReview: ReturnType<typeof vi.fn>;
    toggleFavorite: ReturnType<typeof vi.fn>;
    addPhoto: ReturnType<typeof vi.fn>;
  };

  async function setup(getById: () => unknown, currentUserId = ME) {
    spotService = {
      getById: vi.fn(getById),
      addReview: vi.fn(() => of(spotWithReviews)),
      deleteReview: vi.fn(() => of(spotWithReviews)),
      toggleFavorite: vi.fn(() => of({ favorited: true, favoritesCount: 4 })),
      addPhoto: vi.fn(),
    };
    const user: User = { id: currentUserId, name: 'Moi', email: 'me@example.com', createdAt: '' };

    TestBed.configureTestingModule({
      imports: [SpotDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: SpotService, useValue: spotService },
        { provide: AuthService, useValue: { currentUser: signal(user) } },
        { provide: ListService, useValue: { lists: signal([]), loading: signal(false), loadLists: vi.fn(() => of([])), addSpotToList: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(SpotDetailPageComponent, {
      remove: { imports: [SpotMapComponent, SharePanelComponent] },
      add: { imports: [SpotMapStub, SharePanelStub] },
    });

    const fixture = TestBed.createComponent(SpotDetailPageComponent);
    fixture.componentRef.setInput('id', 's1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('affiche le titre et une miniature par photo', async () => {
    const { el } = await setup(() => of(spotWithReviews));

    expect(spotService.getById).toHaveBeenCalledWith('s1');
    expect(el.querySelector('h1')?.textContent).toContain('Colline du Château');
    expect(el.querySelectorAll('.thumbs button').length).toBe(3);
  });

  it('la flèche droite affiche la photo suivante', async () => {
    const { fixture, el } = await setup(() => of(spotWithReviews));

    el.querySelector('.gallery')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(el.querySelector('.main-photo img')?.getAttribute('src')).toBe('/uploads/2.jpg');
  });

  it('affiche « Spot introuvable » si l’API renvoie 404', async () => {
    const { el } = await setup(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(el.querySelector('.error-box')?.textContent).toContain('Spot introuvable');
  });

  it('affiche « Accès refusé » si le spot est privé (403)', async () => {
    const { el } = await setup(() => throwError(() => new HttpErrorResponse({ status: 403 })));
    expect(el.querySelector('.error-box')?.textContent).toContain('Accès refusé');
  });

  it('envoie un avis avec la note choisie', async () => {
    const { fixture, el } = await setup(() => of(spotWithReviews));
    const submit = () => el.querySelector<HTMLButtonElement>('.review-form button[type=submit]')!;

    expect(submit().disabled).toBe(true); // pas de note = pas d'envoi

    el.querySelectorAll<HTMLButtonElement>('.star-btn')[3].click();
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);

    submit().click();
    expect(spotService.addReview).toHaveBeenCalledWith('s1', { rating: 4, comment: '', moodExperienced: '' });
  });

  it('n’affiche « Supprimer » que sur mes propres avis', async () => {
    const { el } = await setup(() => of(spotWithReviews));
    const reviews = [...el.querySelectorAll('.review')];

    expect(reviews.length).toBe(2);
    const mine = reviews.find((r) => r.textContent?.includes('Moi'))!;
    const other = reviews.find((r) => r.textContent?.includes('Alex'))!;
    expect(mine.querySelector('.delete')).not.toBeNull();
    expect(other.querySelector('.delete')).toBeNull();
  });

  it('supprime mon avis après confirmation', async () => {
    const { fixture, el } = await setup(() => of(spotWithReviews));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    el.querySelector<HTMLButtonElement>('.review .delete')!.click();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(spotService.deleteReview).toHaveBeenCalledWith('s1', 'r1');
    confirmSpy.mockRestore();
  });

  it('refuse une photo invalide sans appeler l’API', async () => {
    const { fixture, el } = await setup(() => of(spotWithReviews));
    const input = el.querySelector<HTMLInputElement>('.actions input[type=file]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] });

    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(spotService.addPhoto).not.toHaveBeenCalled();
    expect(el.querySelector('.notice-error')?.textContent).toContain('n\'est pas une image');
  });

  it('ajoute le spot à une liste choisie dans le menu', async () => {
    const list = { id: 'l1', name: 'Couchers de soleil', description: '', ownerId: ME, isPublic: true, collaborators: [], spots: [], spotsCount: 0, createdAt: '', updatedAt: '' };
    const { fixture, el } = await setup(() => of(spotWithReviews));
    const listService = TestBed.inject(ListService) as unknown as { lists: ReturnType<typeof signal>; addSpotToList: ReturnType<typeof vi.fn> };
    listService.lists.set([list]);
    listService.addSpotToList.mockReturnValue(of(list));

    [...el.querySelectorAll<HTMLButtonElement>('.action-btn')].find((b) => b.textContent?.includes('Ajouter à une liste'))!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.lists-dropdown button')!.click();
    fixture.detectChanges();

    expect(listService.addSpotToList).toHaveBeenCalledWith('l1', 's1');
    expect(el.querySelector('.notice-success')?.textContent).toContain('Couchers de soleil');
  });

  it('affiche le panneau de partage seulement pour le créateur', async () => {
    const owner = await setup(() => of(spotWithReviews), ME);
    expect(owner.el.querySelector('app-share-panel')).not.toBeNull();

    TestBed.resetTestingModule();
    const visitor = await setup(() => of(spotWithReviews), 'someone-else');
    expect(visitor.el.querySelector('app-share-panel')).toBeNull();
  });

  it('met à jour la visibilité quand le panneau de partage émet shareUpdated', async () => {
    const { fixture } = await setup(() => of(spotWithReviews));
    const panel = fixture.debugElement.query((d) => d.componentInstance instanceof SharePanelStub);

    (panel.componentInstance as SharePanelStub).shareUpdated.emit({
      id: 's1', title: 'Colline du Château', visibility: 'FRIENDS', sharedWith: [], createdBy: ME,
    });
    fixture.detectChanges();

    expect((panel.componentInstance as SharePanelStub).visibility()).toBe('FRIENDS');
  });
});
