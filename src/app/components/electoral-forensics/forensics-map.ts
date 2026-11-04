import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { ForensicsSection } from './forensics.models';
import { sectionLabel, signed, turnoutColor } from './forensics.util';
import { candidateDelta, hasReviewFlag } from './forensics-candidates.util';
import { ImageExportComponent } from '../ui/image-export/image-export';
import { createMapImage } from '../../utils/map-image-export.util';

@Component({
  selector: 'app-forensics-map',
  imports: [ImageExportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="map-toolbar"><label>Цвят на картата <select [value]="metric" (change)="changeMetric($event)" aria-label="Показател за цвета на картата"><option value="turnout">Δ активност, п.п.</option><option value="candidate4">Δ Гюров на 100 избиратели I тур</option><option value="candidate25">Δ Йотова на 100 избиратели I тур</option></select></label><app-image-export [createImage]="createImage" [title]="'Карта на промените между двата тура · ' + exportTitle" filename="presidential-2026-section-map.png" /></div>
    <div #map class="research-map" role="region" aria-label="Карта на промените между двата тура"></div>
    <div class="map-key" [attr.aria-label]="metric === 'turnout' ? 'Легенда, процентни пункта' : 'Легенда, промяна на 100 избиратели по списъка на първия тур'">
      @for (item of legend; track item.label) {
        <span><i [style.background]="item.color"></i>{{ item.label }}</span>
      }
    </div>`,
  styles: `:host{display:block;min-width:0}.research-map{height:460px;width:100%;background:#e9edef;z-index:0}
    .map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:.7rem;font-size:.8rem;margin-bottom:.7rem}.map-toolbar label{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem;min-width:0}.map-toolbar app-image-export{flex-shrink:0}.map-toolbar select{color:inherit;background:hsl(var(--background));border:1px solid hsl(var(--foreground)/.3);padding:.5rem;border-radius:.25rem}
    .map-key{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin-top:.8rem;font-size:.78rem}.map-key span{display:flex;align-items:center;gap:.35rem}
    i{display:inline-block;width:14px;height:14px;border-radius:50%}
    @media(max-width:640px){.research-map{height:350px}.map-toolbar select{width:100%;max-width:100%;min-width:0;min-height:44px;font-size:1rem}}`,
})
export class ForensicsMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: ForensicsSection[] = [];
  @Input() exportTitle = 'Всички секции';
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
  private refitOnReveal = false;
  private rendering = false;
  readonly createImage = async (): Promise<Blob> => {
    if (this.rendering) throw new Error('Изчакайте секциите на картата да се заредят преди експорт.');
    const generation = this.generation;
    // Leaflet paints Canvas markers on the frame after the last marker batch.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (this.rendering || generation !== this.generation) throw new Error('Картата се промени по време на експорта. Опитайте отново.');
    return createMapImage(this.container.nativeElement, {
      election: 'Президентски избори 2026 · 25 октомври → 1 ноември',
      metricLabel: this.metric === 'turnout' ? 'Δ активност, п.п.'
        : this.metric === 'candidate4' ? 'Δ Гюров на 100 избиратели I тур' : 'Δ Йотова на 100 избиратели I тур',
      place: `${this.exportTitle} · ${this.locatedCount} от ${this.rows.length} секции с координати`,
    }, {
      title: 'Промяна между двата тура',
      description: 'Контур: основание за преглед на протокола. Съвпадащите адреси се застъпват.',
      items: this.legend.slice(0, -1), noDataColor: turnoutColor(null),
    }, 'България');
  };

  ngAfterViewInit(): void {
    this.map = L.map(this.container.nativeElement, { preferCanvas: true, scrollWheelZoom: false, zoomControl: false }).setView([43.05, 25.3], 7);
    L.control.zoom({ zoomInTitle: 'Приближи', zoomOutTitle: 'Отдалечи' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
      crossOrigin: 'anonymous',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.observer = new ResizeObserver(() => {
      if (!this.container.nativeElement.clientWidth || !this.container.nativeElement.clientHeight) return;
      this.map?.invalidateSize({ pan: false });
      if (this.refitOnReveal) this.render();
    });
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
    return [
      row.sectionId, sectionLabel(row),
      `Δ активност ${signed(row.deltaTurnoutPp)} п.п.`,
      `Δ гласували ${signed(row.deltaVoted, 0)}`,
      `Δ Гюров ${signed(candidateDelta(row, '4'), 0)}`,
      `Δ Йотова ${signed(candidateDelta(row, '25'), 0)}`,
      ...(review.length ? [`Преглед: ${review.join(', ')}`] : []),
    ].join('\n');
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
    this.rendering = false;
    if (!this.container.nativeElement.clientWidth || !this.container.nativeElement.clientHeight) {
      this.refitOnReveal ||= fitBounds;
      return;
    }
    this.layer.clearLayers();
    const located = this.rows.flatMap(row => {
      const coordinates = this.coordinates(row);
      return coordinates ? [{ row, coordinates }] : [];
    });
    if ((fitBounds || this.refitOnReveal) && located.length) this.map.fitBounds(L.latLngBounds(located.map(item => item.coordinates)), { padding: [24, 24], maxZoom: 11 });
    this.refitOnReveal = false;
    this.rendering = true;
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
          text.style.display = 'block';
          text.style.width = 'max-content';
          text.style.whiteSpace = 'pre-line';
          text.style.maxWidth = 'min(22rem, calc(100vw - 3rem))';
          text.style.overflowWrap = 'anywhere';
          return text;
        });
        marker.on('click', () => this.sectionSelect.emit(row));
        marker.addTo(this.layer);
      }
      if (index < located.length) this.frame = requestAnimationFrame(batch);
      else this.rendering = false;
    };
    batch();
  }
}
