import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { CATEGORY_LABELS, LatLng, MOODS, SpotMarker } from '../../shared/models/spot.model';
import { directionsUrl } from '../../shared/utils/directions';

const NICE: L.LatLngExpression = [43.7031, 7.2661];

/**
 * Carte Leaflet réutilisable.
 * - mode « exploration » : marqueurs colorés par humeur + popup + itinéraire ;
 * - mode « sélection » (pickMode) : un clic place un point (formulaire de création).
 */
@Component({
  selector: 'app-spot-map',
  standalone: true,
  template: `<div #mapEl class="map" role="region" aria-label="Carte des spots"></div>`,
  styles: `
    :host { display: block; height: 100%; }
    .map { width: 100%; height: 100%; min-height: 220px; }
  `,
})
export class SpotMapComponent {
  readonly markers = input<SpotMarker[]>([]);
  readonly userPosition = input<LatLng | null>(null);
  /** Rayon affiché autour de l'utilisateur (km), null = pas de cercle. */
  readonly radiusKm = input<number | null>(null);
  readonly pickMode = input(false);
  readonly pickedPoint = input<LatLng | null>(null);

  readonly spotSelected = output<string>();
  readonly pointPicked = output<LatLng>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly destroyRef = inject(DestroyRef);

  private map?: L.Map;
  private readonly markerLayer = L.layerGroup();
  private readonly userLayer = L.layerGroup();
  private readonly pickLayer = L.layerGroup();
  /** Passe à true une fois Leaflet initialisé : relance les effects de rendu. */
  private readonly ready = signal(false);
  private fittedOnce = false;

  constructor() {
    // Leaflet a besoin d'un vrai élément DOM avec une taille : on attend le premier rendu.
    afterNextRender(() => this.initMap());

    effect(() => {
      const markers = this.markers();
      if (this.ready()) this.renderMarkers(markers);
    });

    effect(() => {
      const position = this.userPosition();
      const radius = this.radiusKm();
      if (this.ready()) this.renderUser(position, radius);
    });

    effect(() => {
      const point = this.pickedPoint();
      if (this.ready()) this.renderPicked(point);
    });

    this.destroyRef.onDestroy(() => this.map?.remove());
  }

  private initMap(): void {
    const el = this.mapEl().nativeElement;
    this.map = L.map(el, { zoomControl: true }).setView(NICE, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.markerLayer.addTo(this.map);
    this.userLayer.addTo(this.map);
    this.pickLayer.addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.pickMode()) {
        this.pointPicked.emit({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    });

    // Si le conteneur change de taille (responsive, modale), Leaflet doit recalculer.
    const observer = new ResizeObserver(() => this.map?.invalidateSize());
    observer.observe(el);
    this.destroyRef.onDestroy(() => observer.disconnect());

    this.ready.set(true);
  }

  private renderMarkers(markers: SpotMarker[]): void {
    this.markerLayer.clearLayers();
    const points: L.LatLngExpression[] = [];

    for (const spot of markers) {
      if (spot.latitude == null || spot.longitude == null) continue;
      // `moods` n'est pas une enum côté Mongoose : on n'injecte dans le HTML qu'une humeur connue.
      const first = spot.moods[0];
      const mood = first && (MOODS as readonly string[]).includes(first) ? first : 'none';
      const icon = L.divIcon({
        className: '',
        html: `<span class="vs-pin vs-pin--${mood}"></span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -24],
      });
      const marker = L.marker([spot.latitude, spot.longitude], { icon, title: spot.title });
      // Popup construite avec le DOM (textContent) : pas d'injection HTML possible via le titre.
      marker.bindPopup(() => this.buildPopup(spot));
      marker.addTo(this.markerLayer);
      points.push([spot.latitude, spot.longitude]);
    }

    // Cadre la carte sur les spots au premier affichage seulement (pas à chaque filtre).
    if (!this.fittedOnce && points.length && !this.userPosition() && !this.pickMode()) {
      this.map?.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
      this.fittedOnce = true;
    }
  }

  private buildPopup(spot: SpotMarker): HTMLElement {
    const box = document.createElement('div');
    box.className = 'vs-popup';

    const title = document.createElement('strong');
    title.textContent = spot.title;

    const meta = document.createElement('span');
    meta.className = 'vs-popup__meta';
    meta.textContent = `${CATEGORY_LABELS[spot.category]} · ★ ${spot.ratingAverage ?? 0} · ${'€'.repeat(spot.budget)}`;

    const actions = document.createElement('div');
    actions.className = 'vs-popup__actions';

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Voir la fiche';
    open.addEventListener('click', () => this.spotSelected.emit(spot.id));

    const route = document.createElement('a');
    route.textContent = 'Tracer l’itinéraire';
    route.href = directionsUrl({ lat: spot.latitude, lng: spot.longitude }, this.userPosition());
    route.target = '_blank';
    route.rel = 'noopener';

    actions.append(open, route);
    box.append(title, meta, actions);
    return box;
  }

  private renderUser(position: LatLng | null, radiusKm: number | null): void {
    this.userLayer.clearLayers();
    if (!position || !this.map) return;

    L.marker([position.lat, position.lng], {
      icon: L.divIcon({ className: '', html: '<span class="vs-me"></span>', iconSize: [18, 18] }),
      title: 'Vous êtes ici',
    }).addTo(this.userLayer);

    if (radiusKm) {
      const circle = L.circle([position.lat, position.lng], {
        radius: radiusKm * 1000,
        color: '#1d755e',
        weight: 1.5,
        fillOpacity: 0.08,
      }).addTo(this.userLayer);
      this.map.fitBounds(circle.getBounds(), { padding: [20, 20] });
    } else {
      this.map.setView([position.lat, position.lng], 14);
    }
  }

  private renderPicked(point: LatLng | null): void {
    this.pickLayer.clearLayers();
    if (!point) return;
    L.marker([point.lat, point.lng], {
      icon: L.divIcon({ className: '', html: '<span class="vs-pin vs-pin--picked"></span>', iconSize: [26, 26], iconAnchor: [13, 26] }),
      title: 'Position du spot',
    }).addTo(this.pickLayer);
  }
}
