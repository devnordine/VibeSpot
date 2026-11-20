import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
