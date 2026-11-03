import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { ForensicsSection } from './forensics.models';
import { sectionLabel, signed, turnoutColor } from './forensics.util';

@Component({
  selector: 'app-forensics-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #map class="research-map" role="region" aria-label="Карта на промяната в активността между двата тура"></div>
    <div class="map-key" aria-label="Легенда, процентни пункта">
      @for (item of legend; track item.label) {
        <span><i [style.background]="item.color"></i>{{ item.label }}</span>
      }
    </div>
    <p class="map-note">{{ locatedCount }} от {{ rows.length }} секции имат координати. Съвпадащите адреси се застъпват.
      Изберете точка за секционните данни. Цветът е промяна в процентни пункта.</p>`,
  styles: `:host{display:block;min-width:0}.research-map{height:460px;width:100%;background:#e9edef;z-index:0}
    .map-key{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin-top:.8rem;font-size:.78rem}.map-key span{display:flex;align-items:center;gap:.35rem}
    i{display:inline-block;width:14px;height:14px;border-radius:50%}.map-note{font-size:.8rem;opacity:.75;margin:.65rem 0}
    @media(max-width:640px){.research-map{height:350px}}`,
})
export class ForensicsMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: ForensicsSection[] = [];
  @Output() sectionSelect = new EventEmitter<ForensicsSection>();
  @ViewChild('map', { static: true }) container!: ElementRef<HTMLElement>;
  readonly legend = [
    { label: '< -20', color: turnoutColor(-25) }, { label: '-20 до -10', color: turnoutColor(-15) },
    { label: '-10 до -3', color: turnoutColor(-5) }, { label: '-3 до +3', color: turnoutColor(0) },
    { label: '+3 до +10', color: turnoutColor(5) }, { label: '+10 до +20', color: turnoutColor(15) },
    { label: '> +20', color: turnoutColor(25) },
  ];
  locatedCount = 0;
  private map?: L.Map;
  private layer?: L.LayerGroup;
  private observer?: ResizeObserver;
  private frame?: number;
  private generation = 0;

  ngAfterViewInit(): void {
    this.map = L.map(this.container.nativeElement, { preferCanvas: true, scrollWheelZoom: false, zoomControl: false }).setView([43.05, 25.3], 7);
    L.control.zoom({ zoomInTitle: 'Приближи', zoomOutTitle: 'Отдалечи' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.observer = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
    this.observer.observe(this.container.nativeElement);
    this.render();
  }

  ngOnChanges(): void {
    this.locatedCount = this.rows.filter(row => this.coordinates(row) !== null).length;
    this.render();
  }

  ngOnDestroy(): void {
    this.generation++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.map?.remove();
  }

  private coordinates(row: ForensicsSection): L.LatLngTuple | null {
    const lat = row.coordinates?.latitude ?? row.latitude;
    const lng = row.coordinates?.longitude ?? row.longitude;
    return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }

  private render(): void {
    if (!this.map || !this.layer) return;
    const generation = ++this.generation;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.layer.clearLayers();
    const located = this.rows.flatMap(row => {
      const coordinates = this.coordinates(row);
      return coordinates ? [{ row, coordinates }] : [];
    });
    if (located.length) this.map.fitBounds(L.latLngBounds(located.map(item => item.coordinates)), { padding: [24, 24], maxZoom: 11 });
    let index = 0;
    const batch = () => {
      if (generation !== this.generation || !this.layer) return;
      const end = Math.min(index + 100, located.length);
      for (; index < end; index++) {
        const { row, coordinates } = located[index];
        const marker = L.circleMarker(coordinates, {
          radius: row.signal.flags.length ? 6 : 4, fillColor: turnoutColor(row.deltaTurnoutPp),
          color: row.signal.flags.length ? '#172d3d' : '#fff', weight: row.signal.flags.length ? 1.7 : .5, fillOpacity: .82,
        });
        marker.bindTooltip(() => {
          const text = document.createElement('span');
          text.textContent = `${row.sectionId} · ${sectionLabel(row)} · ${signed(row.deltaTurnoutPp)} п.п.`;
          return text;
        });
        marker.on('click', () => this.sectionSelect.emit(row));
        marker.addTo(this.layer);
      }
      if (index < located.length) this.frame = requestAnimationFrame(batch);
    };
    batch();
  }
}
