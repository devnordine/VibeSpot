import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Spot } from '../../shared/models/spot.model';
import { makeSpot } from '../../shared/testing/spot-fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_SIZE, SpotFormModalComponent, validatePhoto } from './spot-form-modal';
import { SpotMapComponent } from '../spot-map/spot-map';
import { SpotService } from '../../shared/services/spot.service';
import { LatLng } from '../../shared/models/spot.model';

@Component({ selector: 'app-spot-map', standalone: true, template: '' })
class SpotMapStub {
  readonly pickMode = input(false);
  readonly pickedPoint = input<LatLng | null>(null);
  readonly pointPicked = output<LatLng>();
}

/** Fichier factice d'une taille donnée (sans allouer réellement les octets). */
function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validatePhoto', () => {
  it('refuse un fichier qui n’est pas une image', () => {
    expect(validatePhoto(fakeFile('menu.pdf', 'application/pdf'))).toContain('n\'est pas une image');
  });

  it('refuse une image de 5 Mo ou plus', () => {
    expect(validatePhoto(fakeFile('big.jpg', 'image/jpeg', MAX_PHOTO_SIZE))).toContain('dépasse 5 Mo');
  });

  it('refuse un format image que le backend n’accepte pas (SVG)', () => {
    expect(validatePhoto(fakeFile('logo.svg', 'image/svg+xml'))).not.toBeNull();
  });

  it('accepte une image JPEG légère', () => {
    expect(validatePhoto(fakeFile('ok.jpg', 'image/jpeg', 200_000))).toBeNull();
  });
});

describe('SpotFormModalComponent', () => {
  beforeEach(() => {
    // jsdom ne fournit pas createObjectURL : comme le navigateur, chaque appel donne une URL unique
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${n++}`);
    URL.revokeObjectURL = vi.fn();

    TestBed.configureTestingModule({
      imports: [SpotFormModalComponent],
      providers: [{ provide: SpotService, useValue: { create: vi.fn(), addPhoto: vi.fn() } }],
    });
    TestBed.overrideComponent(SpotFormModalComponent, {
      remove: { imports: [SpotMapComponent] },
      add: { imports: [SpotMapStub] },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const fixture = TestBed.createComponent(SpotFormModalComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const submit = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    return { fixture, el, submit };
  }

  async function type(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, input: HTMLInputElement | HTMLSelectElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('garde le bouton désactivé tant que le titre, la catégorie et le point manquent', async () => {
    const { fixture, el, submit } = await setup();
    expect(submit().disabled).toBe(true);

    await type(fixture, el.querySelector<HTMLInputElement>('#spot-title')!, 'Rooftop du Port');
    expect(submit().disabled).toBe(true);

    await type(fixture, el.querySelector<HTMLSelectElement>('#spot-category')!, 'bar');
    expect(submit().disabled).toBe(true); // pas encore de point sur la carte

    const map = fixture.debugElement.query((d) => d.componentInstance instanceof SpotMapStub);
    (map.componentInstance as SpotMapStub).pointPicked.emit({ lat: 43.7, lng: 7.27 });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(submit().disabled).toBe(false);
  });

  it('ajoute les images valides en aperçu et liste les erreurs des autres', async () => {
    const { fixture, el } = await setup();

    fixture.componentInstance.onFilesSelected([
      fakeFile('a.jpg', 'image/jpeg'),
      fakeFile('notes.txt', 'text/plain'),
      fakeFile('huge.png', 'image/png', MAX_PHOTO_SIZE + 1),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.querySelectorAll('.previews li').length).toBe(1);
    expect(el.querySelectorAll('.field-error').length).toBe(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  /** Remplit les champs obligatoires et place le point sur la carte. */
  async function fillRequired(fixture: Awaited<ReturnType<typeof setup>>['fixture'], el: HTMLElement) {
    await type(fixture, el.querySelector<HTMLInputElement>('#spot-title')!, 'Rooftop du Port');
    await type(fixture, el.querySelector<HTMLSelectElement>('#spot-category')!, 'bar');
    const map = fixture.debugElement.query((d) => d.componentInstance instanceof SpotMapStub);
    (map.componentInstance as SpotMapStub).pointPicked.emit({ lat: 43.7, lng: 7.27 });
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('envoie le spot avec la 1re photo, puis les suivantes une par une', async () => {
    const spotService = TestBed.inject(SpotService) as unknown as { create: ReturnType<typeof vi.fn>; addPhoto: ReturnType<typeof vi.fn> };
    const created = makeSpot({ id: 'new1', title: 'Rooftop du Port' });
    spotService.create.mockReturnValue(of({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 }, new HttpResponse({ body: created })));
    spotService.addPhoto.mockReturnValue(of(new HttpResponse({ body: created })));

    const { fixture, el, submit } = await setup();
    await fillRequired(fixture, el);
    fixture.componentInstance.onFilesSelected([fakeFile('1.jpg', 'image/jpeg'), fakeFile('2.jpg', 'image/jpeg'), fakeFile('3.jpg', 'image/jpeg')]);
    fixture.detectChanges();

    let result: { spot: Spot; failedPhotos: number } | undefined;
    fixture.componentInstance.created.subscribe((r) => (result = r));
    submit().click();

    const body = spotService.create.mock.calls[0][0] as FormData;
    expect(body.get('title')).toBe('Rooftop du Port');
    expect(body.get('category')).toBe('bar');
    expect(body.get('latitude')).toBe('43.7');
    expect((body.get('photo') as File).name).toBe('1.jpg');
    // les 2 autres photos partent ensuite vers /photos du spot créé
    expect(spotService.addPhoto).toHaveBeenCalledTimes(2);
    expect(spotService.addPhoto.mock.calls[1][0]).toBe('new1');
    expect(result).toEqual({ spot: created, failedPhotos: 0 });
  });

  it('garde le spot créé même si une photo supplémentaire échoue', async () => {
    const spotService = TestBed.inject(SpotService) as unknown as { create: ReturnType<typeof vi.fn>; addPhoto: ReturnType<typeof vi.fn> };
    const created = makeSpot({ id: 'new1' });
    spotService.create.mockReturnValue(of(new HttpResponse({ body: created })));
    spotService.addPhoto.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 413 })));

    const { fixture, el, submit } = await setup();
    await fillRequired(fixture, el);
    fixture.componentInstance.onFilesSelected([fakeFile('1.jpg', 'image/jpeg'), fakeFile('2.jpg', 'image/jpeg')]);
    fixture.detectChanges();

    let result: { spot: Spot; failedPhotos: number } | undefined;
    fixture.componentInstance.created.subscribe((r) => (result = r));
    submit().click();

    expect(result).toEqual({ spot: created, failedPhotos: 1 });
  });

  it('affiche l’erreur du serveur et réactive le bouton si la création échoue', async () => {
    const spotService = TestBed.inject(SpotService) as unknown as { create: ReturnType<typeof vi.fn> };
    spotService.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Titre et catégorie requis' } })));

    const { fixture, el, submit } = await setup();
    await fillRequired(fixture, el);
    submit().click();
    fixture.detectChanges();

    expect(el.querySelector('.error')?.textContent).toContain('Titre et catégorie requis');
    expect(submit().disabled).toBe(false);
  });

  it('limite à 5 photos', async () => {
    const { fixture, el } = await setup();
    const files = Array.from({ length: 7 }, (_, i) => fakeFile(`p${i}.jpg`, 'image/jpeg'));

    fixture.componentInstance.onFilesSelected(files);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.querySelectorAll('.previews li').length).toBe(5);
    expect(el.textContent).toContain('Maximum 5 photos');
  });
});
