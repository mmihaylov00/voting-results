import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { ForensicsSection } from './forensics.models';
import { sectionLabel, signed, turnoutColor } from './forensics.util';
import { candidateDelta, hasReviewFlag } from './forensics-candidates.util';

@Component({
  selector: 'app-forensics-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="map-toolbar">Цвят на картата <select [value]="metric" (change)="changeMetric($event)" aria-label="Показател за цвета на картата"><option value="turnout">Δ активност, п.п.</option><option value="candidate4">Δ Гюров на 100 избиратели I тур</option><option value="candidate25">Δ Йотова на 100 избиратели I тур</option></select></label>
    <div #map class="research-map" role="region" aria-label="Карта на промените между двата тура"></div>
    <div class="map-key" [attr.aria-label]="metric === 'turnout' ? 'Легенда, процентни пункта' : 'Легенда, промяна на 100 избиратели по списъка на първия тур'">
      @for (item of legend; track item.label) {
        <span><i [style.background]="item.color"></i>{{ item.label }}</span>
      }
    </div>
    <p class="map-note">{{ locatedCount }} от {{ rows.length }} секции имат координати. {{ metric === 'turnout' ? 'Цвят: промяна в активността, п.п.' : 'Цвят: промяна в кандидатски гласове на 100 избиратели по списъка на I тур.' }} Съвпадащите адреси се застъпват.</p>`,
  styles: `:host{display:block;min-width:0}.research-map{height:460px;width:100%;background:#e9edef;z-index:0}
    .map-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem;font-size:.8rem;margin-bottom:.7rem}.map-toolbar select{color:inherit;background:hsl(var(--background));border:1px solid hsl(var(--foreground)/.3);padding:.5rem;border-radius:.25rem}
    .map-key{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin-top:.8rem;font-size:.78rem}.map-key span{display:flex;align-items:center;gap:.35rem}
    i{display:inline-block;width:14px;height:14px;border-radius:50%}.map-note{font-size:.8rem;opacity:.75;margin:.65rem 0}
    @media(max-width:640px){.research-map{height:350px}}`,
})
export class ForensicsMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: ForensicsSection[] = [];
  @Output() sectionSelect = new EventEmitter<ForensicsSection>();
  @ViewChild('map', { static: true }) container!: ElementRef<HTMLElement>;
  metric: 'turnout' | 'candidate4' | 'candidate25' = 'turnout';
  readonly legend = [
    { label: '< -20', color: turnoutColor(-25) }, { label: '-20 до -10', color: turnoutColor(-15) },
    { label: '-10 до -3', color: turnoutColor(-5) }, { label: '-3 до +3', color: turnoutColor(0) },
    { label: '+3 до +10', color: turnoutColor(5) }, { label: '+10 до +20', color: turnoutColor(15) },
    { label: '> +20', color: turnoutColor(25) },
    { label: 'Няма данни', color: turnoutColor(null) },
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

  changeMetric(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'turnout' && value !== 'candidate4' && value !== 'candidate25') return;
    this.metric = value;
    this.render(false);
  }

  tooltip(row: ForensicsSection): string {
    const review = [row.signal.flags.length ? 'активност' : '', row.addedReviewFlags?.length ? 'дописани' : '',
      row.candidateReviewFlags?.length ? 'съвместен ръст' : ''].filter(Boolean);
    return `${row.sectionId} · ${sectionLabel(row)} · Δ активност ${signed(row.deltaTurnoutPp)} п.п. · Δ гласували ${signed(row.deltaVoted, 0)} · Δ Гюров ${signed(candidateDelta(row, '4'), 0)} · Δ Йотова ${signed(candidateDelta(row, '25'), 0)}${review.length ? ' · Преглед: ' + review.join(', ') : ''}`;
  }

  markerValue(row: ForensicsSection): number | null {
    if (this.metric === 'turnout') return row.deltaTurnoutPp;
    const delta = candidateDelta(row, this.metric === 'candidate4' ? '4' : '25');
    return delta === null || !row.registered1 || row.registered1 <= 0 ? null : 100 * delta / row.registered1;
  }

  private coordinates(row: ForensicsSection): L.LatLngTuple | null {
    const lat = row.coordinates?.latitude ?? row.latitude;
    const lng = row.coordinates?.longitude ?? row.longitude;
    return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }

  private render(fitBounds = true): void {
    if (!this.map || !this.layer) return;
    const generation = ++this.generation;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.layer.clearLayers();
    const located = this.rows.flatMap(row => {
      const coordinates = this.coordinates(row);
      return coordinates ? [{ row, coordinates }] : [];
    });
    if (fitBounds && located.length) this.map.fitBounds(L.latLngBounds(located.map(item => item.coordinates)), { padding: [24, 24], maxZoom: 11 });
    let index = 0;
    const batch = () => {
      if (generation !== this.generation || !this.layer) return;
      const end = Math.min(index + 100, located.length);
      for (; index < end; index++) {
        const { row, coordinates } = located[index];
        const marker = L.circleMarker(coordinates, {
          radius: hasReviewFlag(row) ? 6 : 4, fillColor: turnoutColor(this.markerValue(row)),
          color: hasReviewFlag(row) ? '#172d3d' : '#fff', weight: hasReviewFlag(row) ? 1.7 : .5, fillOpacity: .82,
        });
        marker.bindTooltip(() => {
          const text = document.createElement('span');
          text.textContent = this.tooltip(row);
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
