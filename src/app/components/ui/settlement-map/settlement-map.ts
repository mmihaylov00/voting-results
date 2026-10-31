import { LoadingBarComponent } from '../loading-bar/loading-bar';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  effect,
  inject,
  untracked,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { SettlementMapDataService } from '../../../services/settlement-map-data.service';
import {
  SettlementAggregate,
  SettlementGeometryCollection,
  SettlementGeometryFeature,
  SettlementLookup,
  SettlementMapMetric,
  SettlementMapView,
  SettlementMapAreaSelect,
  SofiaPrecinctGeometryCollection,
  SofiaPrecinctGeometryFeature,
  SOFIA_REGION_CODES,
  aggregateSectionsBySofiaPrecinct,
  stripSettlementPrefix,
  GEOMETRY_CODE_TO_REGION_ID,
  REGION_ID_TO_NAME,
} from '../../../utils/settlement-map.util';
import { ThemeService } from '../../../services/theme.service';
import { MapAggregate, MapMetricHelper, MapPartyLeader, MapPreferenceLeader } from '../../../utils/map-metric.helper';
import { Section } from '../../../models/election.models';
import { MapLegendComponent } from '../map-legend/map-legend';
import { MapToolsComponent } from '../map-tools/map-tools';
import { MapActionsComponent } from '../map-actions/map-actions';
import { MapIconComponent } from '../map-icon/map-icon';
import { MapExportContext, MapSearchItem, MapSelection, buildMarkerOffsets } from '../../../utils/map-interaction.util';
import { exportMapImage, toggleMapFullscreen } from '../../../utils/map-image-export.util';
import { resizeMapPreservingView } from '../../../utils/map-resize.util';
import { applyMapComparison } from '../../../utils/election-map-comparison.util';
import { NeighborhoodGeometryCollection, aggregateSectionsByNeighborhood } from '../../../utils/neighborhood-map.util';

interface AreaAggregate extends MapAggregate {
  key: string;
  regionId: string;
  regionName: string;
  municipalityCode?: string;
  municipalityName?: string;
  settlements: SettlementAggregate[];
}

export type SettlementMapLevel = SettlementMapView | 'neighborhoods';

@Component({
  selector: 'app-settlement-map',
  standalone: true,
  imports: [LoadingBarComponent, CommonModule, MapLegendComponent, MapToolsComponent, MapActionsComponent, MapIconComponent],
  template: `
    <div #workspace class="map-workspace space-y-3 bg-background p-1">
      <div class="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <app-map-tools class="block min-w-0" [items]="searchItems" [error]="toolError" (searchSelect)="focusSearchItem($event)" />
        <ng-content select="app-map-metric-controls" />
      </div>
      @if (showViewTabs) {
        <div class="app-tabs flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1" role="group" aria-label="Географско ниво">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'regions'"
            [class.text-primary-foreground]="view === 'regions'"
            [class.text-muted-foreground]="view !== 'regions'"
            [attr.aria-pressed]="view === 'regions'"
            (click)="setView('regions')">
            <app-map-icon name="region" /> Райони
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'municipalities'"
            [class.text-primary-foreground]="view === 'municipalities'"
            [class.text-muted-foreground]="view !== 'municipalities'"
            [attr.aria-pressed]="view === 'municipalities'"
            (click)="setView('municipalities')">
            <app-map-icon name="municipality" /> Общини
          </button>
          <button type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'cities'"
            [class.text-primary-foreground]="view === 'cities'"
            [class.text-muted-foreground]="view !== 'cities'"
            [attr.aria-pressed]="view === 'cities'"
            (click)="setView('cities')"><app-map-icon name="settlement" /> Населени места</button>
          @if (hasSectionLocations()) {
            <button type="button"
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              [class.bg-primary]="view === 'neighborhoods'"
              [class.text-primary-foreground]="view === 'neighborhoods'"
              [class.text-muted-foreground]="view !== 'neighborhoods'"
              [attr.aria-pressed]="view === 'neighborhoods'"
              (click)="setView('neighborhoods')"><app-map-icon name="neighborhood" /> Квартали</button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              [class.bg-primary]="view === 'sections'"
              [class.text-primary-foreground]="view === 'sections'"
              [class.text-muted-foreground]="view !== 'sections'"
              [attr.aria-pressed]="view === 'sections'"
              (click)="setView('sections')">
              <app-map-icon name="section" /> Секции
            </button>
          }
        </div>
      }
      <div class="map-frame relative flex min-w-0 flex-col">
      <div class="map-viewport relative isolate min-h-0 flex-1">
        <div class="pointer-events-none absolute right-3 top-3 z-[600] w-[220px] max-w-[50%] space-y-2">
          <app-map-actions class="pointer-events-auto block" [exporting]="exporting"
            (exportClick)="exportImage()" (fullscreenClick)="toggleFullscreen()" />
        </div>
        <div #mapContainer class="map-canvas h-[55dvh] min-h-[320px] max-h-[620px] w-full overflow-hidden rounded-xl border border-primary/20 bg-muted/20 lg:h-[45dvh]"></div>
      @if (view === 'neighborhoods') {
        <div class="absolute bottom-3 left-3 right-20 z-[500] rounded bg-background/95 p-2 text-xs text-muted-foreground">
          <app-loading-bar [loading]="!neighborhoodGeometry" label="Зареждане на кварталите" />
          @if (neighborhoodGeometry) {
            Кварталите са с частично покритие. Показани са само секции с координати в наличните граници.
            © <a class="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>
          }
        </div>
      }
      @if (showWorldButton) {
        <button
          type="button"
          class="absolute bottom-4 right-4 z-[500] inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg transition-colors hover:bg-accent"
          title="Извън страната"
          aria-label="Извън страната"
          (click)="worldButtonClick.emit()">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M2 12h20"></path>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </button>
      }
      @if (isEmpty) {
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-xs">
          <div class="max-w-md px-6 text-center text-sm text-muted-foreground">
            Няма налични географски данни за тази карта.
          </div>
        </div>
      }
      </div>
      <app-map-legend class="mt-3 block shrink-0 lg:absolute lg:right-3 lg:top-[60px] lg:z-[600] lg:mt-0 lg:w-[220px] lg:max-w-[50%]" [metric]="metric" [selectedPartyId]="selectedPartyId" [partiesById]="partiesById" [shareLabel]="shareLabel" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .map-workspace:fullscreen { display: flex; flex-direction: column; height: 100dvh; padding: 16px; overflow: auto; }
    .map-workspace:fullscreen > .map-frame { flex: 1; min-height: 240px; }
    .map-workspace:fullscreen .map-canvas { height: 100%; min-height: 0; max-height: none; }
  `],
})
export class SettlementMapComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) private mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('workspace', { static: true }) private workspace?: ElementRef<HTMLDivElement>;

  @Input() settlements: SettlementAggregate[] = [];
  @Input() regionCode: string | null = null;
  @Input() metric: SettlementMapMetric = 'leading-party';
  @Input() selectedPartyId: string | null = null;
  @Input() votesLabel = 'гласа';
  @Input() shareLabel = 'от гласувалите';
  @Input() partiesById: Record<string, string> = {};
  @Input() belowThresholdPartyIds: ReadonlySet<string> | null = null;
  @Input() fitKey = '';
  @Input() allowUnresolvedFeatures = true;
  @Input() showWorldButton = false;
  @Input() showViewTabs = false;
  @Input() selectedView: SettlementMapLevel = 'cities';
  @Input() focusSectionId: string | null = null;
  @Input() exportContext: MapExportContext | null = null;
  @Input() comparisonSections: Section[] | null = null;
  @Input() comparisonPartyId: string | null = null;
  @Output() selectionChange = new EventEmitter<MapSelection>();
  @Output() viewChange = new EventEmitter<SettlementMapLevel>();

  searchItems: MapSearchItem[] = [];
  exporting = false;
  toolError = '';
  hasOverlappingSections = false;
  neighborhoodGeometry?: NeighborhoodGeometryCollection;
  private neighborhoodGeometrySub?: Subscription;
  private pendingFocusSectionId: string | null = null;
  private selectedPlace = '';
  private sectionMarkers = new Map<string, L.CircleMarker>();
  private sectionPositions: { marker: L.CircleMarker; origin: L.LatLng; offset: L.Point; connector?: L.Polyline }[] = [];
  private focusedSectionId: string | null = null;

  @Output() settlementSelect = new EventEmitter<SettlementAggregate>();
  @Output() sectionSelect = new EventEmitter<Section>();
  @Output() areaSelect = new EventEmitter<SettlementMapAreaSelect>();
  @Output() worldButtonClick = new EventEmitter<void>();

  private readonly settlementMapData = inject(SettlementMapDataService);
  private readonly themeService = inject(ThemeService);
  private readonly cdr = inject(ChangeDetectorRef);

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private geoJsonLayer?: L.GeoJSON;
  private sofiaPrecinctLayer?: L.GeoJSON;
  private sectionLayer?: L.FeatureGroup;
  private regionLayer?: L.GeoJSON;
  private regionLabelLayer?: L.FeatureGroup;
  private municipalityLayer?: L.GeoJSON;
  private geometry?: SettlementGeometryCollection;
  private sofiaPrecinctGeometry?: SofiaPrecinctGeometryCollection;
  private regionGeometry?: any;
  private municipalityGeometry?: any;
  private settlementLookupMap = new Map<string, SettlementLookup>();
  private municipalityLookupMap = new Map<string, any>();
  private geometrySub?: Subscription;
  private sofiaPrecinctGeometrySub?: Subscription;
  private regionGeometrySub?: Subscription;
  private municipalityGeometrySub?: Subscription;
  private lookupSub?: Subscription;
  private municipalitySub?: Subscription;
  private hasFitted = false;
  private renderQueued = false;
  private sectionRenderVersion = 0;
  private resizeObserver?: ResizeObserver;
  private closeTooltipTimer?: number;

  isEmpty = false;
  view: SettlementMapLevel = 'cities';

  constructor() {
    effect(() => {
      this.themeService.darkMode();
      untracked(() => this.renderMap());
    });
  }

  ngOnInit(): void {
    this.lookupSub = this.settlementMapData.getSettlementsLookup().subscribe((lookup) => {
      this.settlementLookupMap.clear();
      lookup.forEach((item) => {
        if (item.ekatte) {
          this.settlementLookupMap.set(item.ekatte, item);
        }
      });
      this.rebuildSearchItems();
      this.renderMap();
    });

    this.municipalitySub = this.settlementMapData.getMunicipalitiesLookup().subscribe((municipalities) => {
      this.municipalityLookupMap.clear();
      municipalities.forEach((item) => {
        if (item.obshtina) {
          this.municipalityLookupMap.set(item.obshtina, item);
        }
      });
      this.rebuildSearchItems();
      this.renderMap();
    });

    this.geometrySub = this.settlementMapData.getSettlementGeometry().subscribe((geometry) => {
      this.geometry = geometry;
      this.renderMap();
    });

    this.sofiaPrecinctGeometrySub = this.settlementMapData.getSofiaPrecinctGeometry().subscribe((geometry) => {
      this.sofiaPrecinctGeometry = geometry;
      this.renderMap();
    });

    this.loadAdditionalGeometries();
  }

  ngAfterViewInit(): void {
    if (!this.mapContainer) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 15,
      scrollWheelZoom: true,
    });

    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: 'anonymous',
    });
    this.tileLayer.addTo(this.map);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => resizeMapPreservingView(this.map));
      this.resizeObserver.observe(this.mapContainer.nativeElement);
    }
    const regionLabelPane = this.map.createPane('region-labels');
    regionLabelPane.style.zIndex = '450';
    regionLabelPane.style.pointerEvents = 'none';

    const closeTooltips = () => {
      const map = this.map;
      if (!map) return;
      window.clearTimeout(this.closeTooltipTimer);
      this.closeTooltipTimer = window.setTimeout(() => {
        this.closeTooltipTimer = undefined;
        if (this.map !== map) return;
        map.eachLayer(layer => layer.closeTooltip());
      }, 100);
    };

    this.map.on('movestart dragstart zoomstart mousedown touchstart move zoom', closeTooltips);
    this.map.on('zoomend', () => this.repositionSectionMarkers());

    this.renderMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['settlements']) this.rebuildSearchItems();
    if (changes['selectedView'] || changes['settlements']) this.setView(this.selectedView, false);
    if (changes['focusSectionId'] && this.focusSectionId) {
      this.pendingFocusSectionId = this.focusSectionId;
    }

    if (changes['regionCode'] || changes['fitKey']) {
      this.hasFitted = false;
    }

    if (['settlements', 'regionCode', 'fitKey', 'metric', 'selectedPartyId', 'partiesById',
      'belowThresholdPartyIds', 'allowUnresolvedFeatures', 'comparisonSections', 'comparisonPartyId', 'votesLabel', 'shareLabel']
      .some(input => changes[input])) {
      this.renderMap();
    }
    if (changes['focusSectionId'] && this.focusSectionId) this.focusPendingSection();
  }

  setView(view: SettlementMapLevel, emitChange = true): void {
    if (this.view === view && !(view === 'neighborhoods' && !this.neighborhoodGeometrySub)) return;
    if (view === 'sections' && !this.hasSectionLocations()) return;

    this.view = view;
    if (emitChange) this.viewChange.emit(view);
    if (view === 'neighborhoods' && !this.neighborhoodGeometrySub) {
      this.neighborhoodGeometrySub = this.settlementMapData.getNeighborhoodGeometry().subscribe({
        next: geometry => {
          this.neighborhoodGeometry = geometry;
          this.rebuildSearchItems();
          this.renderMap();
        },
        error: () => {
          this.toolError = 'Границите на кварталите не можаха да се заредят. Изберете друг изглед.';
          this.neighborhoodGeometrySub = undefined;
          this.cdr.markForCheck();
        },
      });
    }
    this.renderMap();
  }

  hasSectionLocations(): boolean {
    return this.getRenderableSections().length > 0;
  }

  private rebuildSearchItems(): void {
    const items: MapSearchItem[] = [];
    for (const settlement of this.settlements) {
      items.push({ id: `settlement:${settlement.geometryKey}`, kind: 'settlement',
        label: `${settlement.displayName}, ${settlement.municipalityName || settlement.regionName || ''}`,
        sectionIds: settlement.sections.map(section => section.sectionId) });
      for (const section of settlement.sections) {
        items.push({ id: `section:${section.sectionId}`, kind: 'section',
          label: `Секция ${section.sectionId}, ${settlement.displayName}, ${section.sectionName}`,
          sectionIds: [section.sectionId] });
      }
    }
    for (const [code, area] of this.aggregateAreas(settlement => this.getSettlementMunicipalityCode(settlement))) {
      items.push({ id: `municipality:${code}`, kind: 'municipality',
        label: `Община ${this.municipalityLookupMap.get(code)?.name || area.municipalityName || code}, ${area.regionName}`,
        sectionIds: area.settlements.flatMap(item => item.sections.map(section => section.sectionId)) });
    }
    for (const [code, area] of this.aggregateAreas(settlement => settlement.geometryRegionCode)) {
      items.push({ id: `region:${code}`, kind: 'region', label: `Район ${area.regionName}`,
        sectionIds: area.settlements.flatMap(item => item.sections.map(section => section.sectionId)) });
    }
    if (this.neighborhoodGeometry) {
      const sections = this.settlements.flatMap(settlement => settlement.sections);
      for (const neighborhood of aggregateSectionsByNeighborhood(sections, this.partiesById, this.neighborhoodGeometry)) {
        items.push({ id: `neighborhood:${neighborhood.neighborhoodCode}`, kind: 'neighborhood',
          label: `Квартал ${neighborhood.displayName}, ${neighborhood.regionName || ''}`,
          sectionIds: neighborhood.sections.map(section => section.sectionId) });
      }
    }
    this.searchItems = items;
    this.cdr.markForCheck();
  }

  focusSearchItem(item: MapSearchItem, emitSelection = true): void {
    this.toolError = '';
    const ids = new Set(item.sectionIds);
    const sections = this.settlements.flatMap(settlement => settlement.sections).filter(section => ids.has(section.sectionId));
    if (emitSelection) this.emitSelection(item.kind, item.label, sections);
    if (item.kind === 'section') {
      this.pendingFocusSectionId = item.sectionIds[0];
      this.focusPendingSection();
      return;
    }
    const code = item.id.slice(item.id.indexOf(':') + 1);
    this.setView(item.kind === 'municipality' ? 'municipalities' : item.kind === 'region' ? 'regions'
      : item.kind === 'neighborhood' ? 'neighborhoods' : 'cities');
    let feature = item.kind === 'neighborhood'
      ? this.neighborhoodGeometry?.features.find(entry => entry.properties.code === code)
      : item.kind === 'municipality'
      ? this.municipalityGeometry?.features.find((entry: { properties: { nuts4: string } }) => entry.properties.nuts4 === code)
      : item.kind === 'region'
        ? this.regionGeometry?.features.find((entry: { properties: { nuts3: string } }) => entry.properties.nuts3 === code)
        : this.geometry?.features.find(entry => entry.properties.ekatte === code);
    if (!feature && item.kind === 'settlement') {
      const municipality = this.settlements.find(settlement => settlement.geometryKey === code)?.geometryMunicipalityCode;
      feature = this.municipalityGeometry?.features.find((entry: { properties: { nuts4: string } }) => entry.properties.nuts4 === municipality);
    }
    const coordinates = sections.map(section => this.getSectionLatLng(section)).filter((point): point is L.LatLngExpression => !!point);
    const bounds = feature ? L.geoJSON(feature).getBounds() : coordinates.length ? L.latLngBounds(coordinates) : null;
    if (!this.map || !bounds?.isValid()) {
      this.toolError = 'Няма географски координати за това място.';
      return;
    }
    this.hasFitted = true;
    this.renderMap();
    this.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13, animate: false });
  }

  private focusPendingSection(): void {
    if (!this.map || !this.pendingFocusSectionId) return;
    const section = this.settlements.flatMap(settlement => settlement.sections)
      .find(item => item.sectionId === this.pendingFocusSectionId);
    if (!section) return;
    if (this.focusedSectionId !== section.sectionId) {
      const previous = this.sectionMarkers.get(this.focusedSectionId ?? '');
      previous?.setStyle({ color: '#fff', weight: 0.8 });
      previous?.closeTooltip();
    }
    this.focusedSectionId = section.sectionId;
    const coordinate = this.getSectionLatLng(section);
    if (!coordinate) {
      const settlement = this.settlements.find(item => item.sections.includes(section));
      this.pendingFocusSectionId = null;
      const target = settlement && this.searchItems.find(item => item.id === `settlement:${settlement.geometryKey}`);
      if (target) this.focusSearchItem(target, false);
      this.toolError = 'Секцията няма точни координати. Показано е населеното място.';
      return;
    }
    this.hasFitted = true;
    if (this.view !== 'sections') {
      this.setView('sections');
      return;
    }
    this.map.setView(coordinate, Math.max(this.map.getZoom() ?? 0, 13), { animate: false });
    const marker = this.sectionMarkers.get(section.sectionId);
    if (!marker) return;
    this.pendingFocusSectionId = null;
    marker?.setStyle({ color: '#f59e0b', weight: 3 });
    marker?.openTooltip();
  }

  private emitSelection(kind: MapSelection['kind'], label: string, sections: Section[]): void {
    this.selectedPlace = label;
    this.selectionChange.emit({ kind, label, sectionIds: sections.map(section => section.sectionId) });
  }

  async exportImage(): Promise<void> {
    if (!this.mapContainer || this.exporting) return;
    this.exporting = true;
    this.toolError = '';
    try {
      const legend = MapMetricHelper.getLegend(this.metric, this.themeService.darkMode(), this.selectedPartyId, this.partiesById, this.shareLabel);
      if (this.view === 'sections' && this.hasOverlappingSections) {
        legend.description += ' Секциите с еднакви координати са изместени само визуално; линиите сочат оригиналните точки.';
      } else if (this.view === 'neighborhoods') {
        legend.description += ' Кварталите са с частично покритие по OpenStreetMap.';
      }
      await exportMapImage(this.mapContainer.nativeElement, this.exportContext,
        legend,
        this.selectedPlace || this.regionCode || 'България');
    } catch (error) {
      this.toolError = error instanceof Error ? error.message : 'Експортът на картата не е успешен.';
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (!this.workspace) return;
    this.toolError = '';
    try {
      await toggleMapFullscreen(this.workspace.nativeElement);
      resizeMapPreservingView(this.map);
    } catch (error) {
      this.toolError = error instanceof Error ? error.message : 'Режимът на цял екран не е достъпен.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  private withComparison<T extends MapAggregate>(aggregate: T, sections: Section[]): T {
    return applyMapComparison(aggregate, sections, this.comparisonSections, this.selectedPartyId, this.comparisonPartyId);
  }

  private loadAdditionalGeometries(): void {
    if (!this.regionGeometrySub) {
      this.regionGeometrySub = this.settlementMapData.getRegionGeometry().subscribe((geometry) => {
        this.regionGeometry = geometry;
        this.renderMap();
      });
    }
    if (!this.municipalityGeometrySub) {
      this.municipalityGeometrySub = this.settlementMapData.getMunicipalityGeometry().subscribe((geometry) => {
        this.municipalityGeometry = geometry;
        this.renderMap();
      });
    }
  }

  ngOnDestroy(): void {
    this.sectionRenderVersion++;
    window.clearTimeout(this.closeTooltipTimer);
    this.resizeObserver?.disconnect();
    this.neighborhoodGeometrySub?.unsubscribe();
    this.geometrySub?.unsubscribe();
    this.sofiaPrecinctGeometrySub?.unsubscribe();
    this.regionGeometrySub?.unsubscribe();
    this.municipalityGeometrySub?.unsubscribe();
    this.lookupSub?.unsubscribe();
    this.municipalitySub?.unsubscribe();
    if (this.map) {
      try {
        this.map.off();
        this.map.remove();
      } catch (e) {
        console.warn('Error during map removal:', e);
      } finally {
        this.map = undefined;
      }
    }
  }

  private renderMap(): void {
    if (!this.map || !this.geometry || !this.map.getContainer()) return;
    this.sectionRenderVersion++;
    if (this.renderQueued) return;

    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      this.executeRender();
      this.cdr.markForCheck();
    });
  }

  private executeRender(): void {
    if (!this.map || !this.geometry || !this.map.getContainer()) return;
    if (this.view === 'sections' && !this.hasSectionLocations()) {
      this.view = 'cities';
    }

    try {
      this.geoJsonLayer?.removeFrom(this.map);
      this.sofiaPrecinctLayer?.removeFrom(this.map);
      this.sectionLayer?.removeFrom(this.map);
      this.regionLayer?.removeFrom(this.map);
      this.regionLabelLayer?.removeFrom(this.map);
      this.municipalityLayer?.removeFrom(this.map);
    } catch (e) {
      console.warn('Failed to remove layers from map:', e);
    }

    if (this.view === 'regions') {
      this.renderRegionMap();
      return;
    }

    if (this.view === 'municipalities') {
      this.renderMunicipalityMap();
      return;
    }

    if (this.view === 'sections') {
      void this.renderSectionMap().catch(error => console.warn('Failed to render section map:', error));
      return;
    }

    if (this.view === 'neighborhoods') {
      this.renderNeighborhoodMap();
      return;
    }

    this.renderSettlementMap();
  }

  private renderNeighborhoodMap(): void {
    if (!this.map || !this.neighborhoodGeometry) return;
    const sections = this.settlements.flatMap(settlement => settlement.sections);
    const aggregates = aggregateSectionsByNeighborhood(sections, this.partiesById, this.neighborhoodGeometry);
    const byCode = new Map(aggregates.map(aggregate => [aggregate.neighborhoodCode, this.withComparison(aggregate, aggregate.sections)]));
    const features = this.neighborhoodGeometry.features.filter(feature => byCode.has(feature.properties.code));
    this.isEmpty = features.length === 0;
    const collection: NeighborhoodGeometryCollection = { type: 'FeatureCollection', features };
    this.geoJsonLayer = L.geoJSON(collection, {
      style: feature => MapMetricHelper.getAggregateStyle(this.metric, byCode.get(feature?.properties.code),
        this.themeService.darkMode(), this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds),
      onEachFeature: (feature, layer) => {
        const aggregate = byCode.get(feature.properties.code);
        if (!aggregate) return;
        layer.bindTooltip(MapMetricHelper.buildMetricTooltip(this.metric, aggregate,
          `<strong>${this.escapeHtml(aggregate.displayName)}</strong>`, true, this.partiesById, this.selectedPartyId, this.belowThresholdPartyIds, this.votesLabel, this.shareLabel));
        layer.on('click', () => {
          this.emitSelection('neighborhood', aggregate.displayName, aggregate.sections);
          this.settlementSelect.emit(aggregate);
        });
      },
    }).addTo(this.map);
    this.addRegionBorders();
    this.fitToCurrentLayer();
  }

  private renderSettlementMap(): void {
    if (!this.map || !this.geometry || !this.map.getContainer()) return;

    const isDark = this.themeService.darkMode();
    const settlementByGeometryKey = new Map(this.settlements.map((settlement) => [settlement.geometryKey, this.withComparison(settlement, settlement.sections)]));
    const sofiaPrecinctById = this.getSofiaPrecinctAggregates();
    const features = this.geometry.features.filter((feature) => {
      if (feature.properties.nuts3 === '32') return false;
      if (this.shouldRenderSofiaPrecincts() && feature.properties.ekatte === '68134') return false;
      if (this.regionCode && feature.properties.nuts3 !== this.regionCode) return false;
      if (this.allowUnresolvedFeatures) return true;
      return settlementByGeometryKey.has(feature.properties.ekatte);
    });
    const precinctFeatures = this.getSofiaPrecinctFeatures(sofiaPrecinctById);

    this.isEmpty = features.length === 0 && precinctFeatures.length === 0;
    if (this.isEmpty) return;

    if (features.length > 0) {
      try {
        this.geoJsonLayer = L.geoJSON(
          {
            type: 'FeatureCollection',
            features,
          } as any,
          {
            style: (feature: any) => this.getStyle(feature as SettlementGeometryFeature, settlementByGeometryKey, isDark),
            onEachFeature: (feature: any, layer: L.Layer) => {
              const typedFeature = feature as unknown as SettlementGeometryFeature;
              const settlement = settlementByGeometryKey.get(typedFeature.properties.ekatte);
              const tooltip = this.buildTooltip(typedFeature, settlement);
              layer.bindTooltip(tooltip, {
                sticky: false,
                opacity: 0.9,
                offset: L.point(10, 10),
                interactive: false,
              });

              if (settlement) {
                layer.on('click', (e: L.LeafletMouseEvent) => {
                  L.DomEvent.stopPropagation(e);
                  this.emitSelection('settlement', settlement.displayName, settlement.sections);
                  this.settlementSelect.emit(settlement);
                });
              }
            },
          }
        );
        this.geoJsonLayer.addTo(this.map);
      } catch (e) {
        console.warn('Failed to add GeoJSON layer:', e);
      }
    }

    if (precinctFeatures.length > 0) {
      try {
        this.sofiaPrecinctLayer = L.geoJSON(
          {
            type: 'FeatureCollection',
            features: precinctFeatures,
          } as any,
          {
            style: (feature: any) => this.getSofiaPrecinctStyle(feature as SofiaPrecinctGeometryFeature, sofiaPrecinctById, isDark),
            onEachFeature: (feature: any, layer: L.Layer) => {
              const typedFeature = feature as unknown as SofiaPrecinctGeometryFeature;
              const precinct = sofiaPrecinctById.get(String(typedFeature.properties.id));
              const tooltip = this.buildSofiaPrecinctTooltip(typedFeature, precinct);
              layer.bindTooltip(tooltip, {
                sticky: false,
                opacity: 0.9,
                offset: L.point(10, 10),
                interactive: false,
              });

              if (precinct) {
                layer.on('click', (e: L.LeafletMouseEvent) => {
                  L.DomEvent.stopPropagation(e);
                  this.emitSelection('settlement', precinct.displayName, precinct.sections);
                  this.settlementSelect.emit(precinct);
                });
              }
            },
          }
        );
        this.sofiaPrecinctLayer.addTo(this.map);
      } catch (e) {
        console.warn('Failed to add Sofia precinct GeoJSON layer:', e);
      }
    }

    if (this.regionGeometry) {
      try {
        const filteredMunicipalityGeometry = this.regionCode
          ? {
              ...this.municipalityGeometry,
              features: this.municipalityGeometry.features.filter(
                (f: any) => f.properties.nuts3 === this.regionCode
              ),
            }
          : this.municipalityGeometry;

        this.municipalityLayer = L.geoJSON(filteredMunicipalityGeometry, {
          interactive: false,
          style: {
            ...MapMetricHelper.getBackgroundStyle(),
            weight: this.regionCode ? 1.1 : 0.5,
            opacity: 1,
          },
        });
        this.municipalityLayer.addTo(this.map);

        if (!this.regionCode) {
          this.regionLayer = L.geoJSON(this.regionGeometry, {
            interactive: false,
            style: {
              ...MapMetricHelper.getBackgroundStyle(),
              opacity: 1,
            },
          });
          this.regionLayer.addTo(this.map);
          this.addRegionLabels(this.regionGeometry.features);
        }
      } catch (e) {
        console.warn('Failed to add geometry layers:', e);
      }
    }

    window.requestAnimationFrame(() => {
      if (!this.map || (!this.geoJsonLayer && !this.sofiaPrecinctLayer) || !this.map.getContainer()) return;
      try {
        if (this.map.getContainer()) {
          resizeMapPreservingView(this.map);
          if (this.hasFitted) { this.focusPendingSection(); return; }
          const layers = [this.geoJsonLayer, this.sofiaPrecinctLayer].filter(Boolean) as L.Layer[];
          const bounds = L.featureGroup(layers).getBounds();
          if (bounds?.isValid()) {
            this.map.fitBounds(bounds, { padding: [24, 24] });
            this.hasFitted = true;
            this.focusPendingSection();
          }
        }
      } catch (e) {
        console.warn('Map interaction failed in animation frame:', e);
      }
    });
  }

  private renderMunicipalityMap(): void {
    if (!this.map || !this.municipalityGeometry || !this.map.getContainer()) return;

    const isDark = this.themeService.darkMode();
    const aggregatesByCode = this.aggregateAreas((settlement) => this.getSettlementMunicipalityCode(settlement));
    const features = this.municipalityGeometry.features.filter((feature: any) => {
      if (this.regionCode && feature.properties.nuts3 !== this.regionCode) return false;
      return this.allowUnresolvedFeatures || aggregatesByCode.has(feature.properties.nuts4);
    });

    this.isEmpty = features.length === 0;
    if (this.isEmpty) return;

    try {
      this.geoJsonLayer = L.geoJSON(
        {
          type: 'FeatureCollection',
          features,
        } as any,
        {
          style: (feature: any) => {
            const aggregate = aggregatesByCode.get(feature.properties.nuts4);
            return MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds);
          },
          onEachFeature: (feature: any, layer: L.Layer) => {
            const aggregate = aggregatesByCode.get(feature.properties.nuts4);
            layer.bindTooltip(this.buildAreaTooltip(aggregate, this.getMunicipalityFeatureName(feature)), {
              sticky: false,
              opacity: 0.9,
              offset: L.point(10, 10),
              interactive: false,
            });

            if (aggregate) {
              layer.on('click', (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
                this.emitSelection('municipality', aggregate.municipalityName || '', aggregate.settlements.flatMap(item => item.sections));
                this.areaSelect.emit({
                  view: 'municipalities',
                  regionId: aggregate.regionId,
                  regionName: aggregate.regionName,
                  municipalityCode: aggregate.municipalityCode,
                  municipalityName: aggregate.municipalityName,
                  settlements: aggregate.settlements,
                });
              });
            }
          },
        }
      );
      this.geoJsonLayer.addTo(this.map);
    } catch (e) {
      console.warn('Failed to add municipality layer:', e);
    }

    this.addRegionBorders();
    this.addRegionLabels();
    this.fitToCurrentLayer();
  }

  private async renderSectionMap(): Promise<void> {
    if (!this.map || !this.map.getContainer()) return;
    const map = this.map;
    const version = ++this.sectionRenderVersion;

    const isDark = this.themeService.darkMode();
    const sections = this.getRenderableSections();

    this.isEmpty = sections.length === 0;
    if (this.isEmpty) return;

    this.sectionMarkers.clear();
    this.sectionPositions = [];
    if (!this.hasFitted) {
      map.fitBounds(L.latLngBounds(sections.map(section => this.getSectionLatLng(section)!)), { padding: [24, 24], animate: false });
      this.hasFitted = true;
    }
    const layer = this.sectionLayer = L.featureGroup().addTo(map);
    const offsets = buildMarkerOffsets(sections.map(section => {
      const coordinate = L.latLng(this.getSectionLatLng(section)!);
      return { id: section.sectionId, latitude: coordinate.lat, longitude: coordinate.lng };
    }));
    this.hasOverlappingSections = [...offsets.values()].some(offset => offset.x !== 0 || offset.y !== 0);

    let batchStart = performance.now();
    let batchCount = 0;
    for (const section of sections) {
      const latLng = this.getSectionLatLng(section);
      if (!latLng) continue;

      const coordinate = L.latLng(latLng);
      const offset = offsets.get(section.sectionId) || { x: 0, y: 0 };
      const displaced = offset.x !== 0 || offset.y !== 0;
      const pixel = this.map!.latLngToLayerPoint(coordinate).add(L.point(offset.x, offset.y));
      const displayCoordinate = this.map!.layerPointToLatLng(pixel);
      const connector = displaced
        ? L.polyline([coordinate, displayCoordinate], { color: '#64748b', weight: 1, opacity: 0.65, interactive: false }).addTo(layer)
        : undefined;
      const aggregate = this.getSectionAggregate(section);
      const style = MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds);
      const marker = L.circleMarker(displayCoordinate, {
        ...style,
        radius: 4,
        color: section.sectionId === this.focusedSectionId ? '#f59e0b' : '#fff',
        weight: section.sectionId === this.focusedSectionId ? 3 : 0.8,
        opacity: 0.95,
        fillOpacity: Math.max(Number(style.fillOpacity || 0.8), 0.8),
      });

      marker.bindTooltip(() => this.buildSectionTooltip(section, aggregate) + (displaced ? '<br/>Маркерът е изместен само визуално. Линията сочи оригиналните координати.' : ''), {
        sticky: false,
        opacity: 0.9,
        offset: L.point(10, 10),
        interactive: false,
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.emitSelection('section', `Секция ${section.sectionId}`, [section]);
        this.sectionSelect.emit(section);
      });
      this.sectionMarkers.set(section.sectionId, marker);
      this.sectionPositions.push({ marker, origin: coordinate, offset: L.point(offset.x, offset.y), connector });
      marker.on('add', () => {
        const element = marker.getElement();
        if (!element) return;
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Секция ${section.sectionId}, ${section.cityName}${displaced ? ', визуално изместен маркер' : ''}`);
        element.addEventListener('keydown', event => {
          const keyboard = event as KeyboardEvent;
          if (keyboard.key === 'Enter' || keyboard.key === ' ') {
            keyboard.preventDefault();
            marker.fire('click');
          }
        });
      });
      marker.addTo(layer);
      if (++batchCount >= 100 || performance.now() - batchStart >= 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (version !== this.sectionRenderVersion || this.map !== map || this.view !== 'sections') return;
        batchStart = performance.now();
        batchCount = 0;
      }
    }

    this.addRegionBorders();
    this.addRegionLabels();
    this.fitToCurrentLayer();
  }

  private repositionSectionMarkers(): void {
    if (!this.map || this.view !== 'sections') return;
    for (const item of this.sectionPositions) {
      const pixel = this.map.latLngToLayerPoint(item.origin).add(item.offset);
      const coordinate = this.map.layerPointToLatLng(pixel);
      item.marker.setLatLng(coordinate);
      item.connector?.setLatLngs([item.origin, coordinate]);
    }
  }

  private renderRegionMap(): void {
    if (!this.map || !this.regionGeometry || !this.map.getContainer()) return;

    const isDark = this.themeService.darkMode();
    const aggregatesByCode = this.aggregateAreas((settlement) => settlement.geometryRegionCode);
    const features = this.regionGeometry.features.filter((feature: any) => {
      if (feature.properties.nuts3 === '32') return false;
      if (this.regionCode && feature.properties.nuts3 !== this.regionCode) return false;
      return this.allowUnresolvedFeatures || aggregatesByCode.has(feature.properties.nuts3);
    });

    this.isEmpty = features.length === 0;
    if (this.isEmpty) return;

    try {
      this.geoJsonLayer = L.geoJSON(
        {
          type: 'FeatureCollection',
          features,
        } as any,
        {
          style: (feature: any) => {
            const aggregate = aggregatesByCode.get(feature.properties.nuts3);
            return {
              ...MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds),
              weight: 1.1,
              opacity: 1,
            };
          },
          onEachFeature: (feature: any, layer: L.Layer) => {
            const aggregate = aggregatesByCode.get(feature.properties.nuts3);
            layer.bindTooltip(this.buildAreaTooltip(aggregate, this.getRegionFeatureName(feature)), {
              sticky: false,
              opacity: 0.9,
              offset: L.point(10, 10),
              interactive: false,
            });

            if (aggregate) {
              layer.on('click', (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
                this.emitSelection('region', aggregate.regionName, aggregate.settlements.flatMap(item => item.sections));
                this.areaSelect.emit({
                  view: 'regions',
                  regionId: aggregate.regionId,
                  regionName: aggregate.regionName,
                  settlements: aggregate.settlements,
                });
              });
            }
          },
        }
      );
      this.geoJsonLayer.addTo(this.map);
      this.addRegionLabels(features);
    } catch (e) {
      console.warn('Failed to add region layer:', e);
    }

    this.fitToCurrentLayer();
  }

  private addRegionBorders(): void {
    if (!this.map || !this.regionGeometry || this.regionCode) return;

    try {
      this.regionLayer = L.geoJSON(this.regionGeometry, {
        interactive: false,
        style: {
          ...MapMetricHelper.getBackgroundStyle(),
          weight: 1.1,
          opacity: 1,
        },
      });
      this.regionLayer.addTo(this.map);
    } catch (e) {
      console.warn('Failed to add region borders:', e);
    }
  }

  private addRegionLabels(features: any[] = this.regionGeometry?.features || []): void {
    if (!this.map || !this.regionGeometry || this.regionCode || features.length === 0) return;

    this.regionLabelLayer?.removeFrom(this.map);
    this.regionLabelLayer = L.featureGroup();
    const isDark = this.themeService.darkMode();

    features
      .filter((feature) => feature.properties?.nuts3 !== '32')
      .forEach((feature) => {
        const name = this.getRegionFeatureName(feature);
        if (!name) return;

        const labelPosition = this.getFeatureCenter(feature);
        if (!labelPosition) return;

        L.marker(labelPosition, {
          interactive: false,
          keyboard: false,
          pane: 'region-labels',
          icon: L.divIcon({
            className: '',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
            html: this.buildRegionLabelHtml(name, isDark),
          }),
        }).addTo(this.regionLabelLayer!);
      });

    if (this.regionLabelLayer.getLayers().length > 0) {
      this.regionLabelLayer.addTo(this.map);
    }
  }

  private getFeatureCenter(feature: any): L.LatLng | null {
    try {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      return bounds?.isValid() ? bounds.getCenter() : null;
    } catch {
      return null;
    }
  }

  private buildRegionLabelHtml(name: string, isDark: boolean): string {
    const color = isDark ? '#f8fafc' : '#0f172a';
    const shadow = isDark
      ? '0 1px 2px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,.8)'
      : '0 1px 2px rgba(255,255,255,.95), 0 0 4px rgba(255,255,255,.9)';

    const style = [
      'transform: translate(-50%, -50%)',
      `color: ${color}`,
      'font-size: 11px',
      'font-weight: 700',
      'line-height: 1.15',
      'letter-spacing: 0',
      'text-align: center',
      `text-shadow: ${shadow}`,
      'text-transform: uppercase',
      'white-space: normal',
      'width: 86px',
      'user-select: none',
      'pointer-events: none',
    ].join('; ');

    return `<div style="${style}">${this.escapeHtml(name)}</div>`;
  }

  private fitToCurrentLayer(): void {
    const version = this.sectionRenderVersion;
    window.requestAnimationFrame(() => {
      if (version !== this.sectionRenderVersion || !this.map || !this.map.getContainer()) return;
      try {
        resizeMapPreservingView(this.map);
        if (this.hasFitted) { this.focusPendingSection(); return; }
        const layer = this.geoJsonLayer || this.sectionLayer;
        if (!layer) return;
        const bounds = layer.getBounds();
        if (bounds?.isValid()) {
          this.map.fitBounds(bounds, { padding: [24, 24] });
          this.hasFitted = true;
          this.focusPendingSection();
        }
      } catch (e) {
        console.warn('Map interaction failed in animation frame:', e);
      }
    });
  }

  private getStyle(
    feature: SettlementGeometryFeature,
    settlementByGeometryKey: Map<string, SettlementAggregate>,
    isDark: boolean
  ): L.PathOptions {
    const settlement = settlementByGeometryKey.get(feature.properties.ekatte);
    return MapMetricHelper.getAggregateStyle(this.metric, settlement, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds);
  }

  private getFillColor(settlement: SettlementAggregate | undefined, isDark: boolean): string {
    return MapMetricHelper.getFillColor(this.metric, settlement, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds);
  }

  private getSofiaPrecinctStyle(
    feature: SofiaPrecinctGeometryFeature,
    precinctById: Map<string, SettlementAggregate>,
    isDark: boolean
  ): L.PathOptions {
    const precinct = precinctById.get(String(feature.properties.id));
    return MapMetricHelper.getAggregateStyle(this.metric, precinct, isDark, this.selectedPartyId, this.partiesById, this.belowThresholdPartyIds);
  }

  private getSofiaPrecinctAggregates(): Map<string, SettlementAggregate> {
    const sections = this.settlements.flatMap((settlement) => settlement.sections);
    return new Map(
      aggregateSectionsBySofiaPrecinct(sections, this.partiesById)
        .map((precinct) => [precinct.geometryKey, this.withComparison(precinct, precinct.sections)])
    );
  }

  private shouldRenderSofiaPrecincts(): boolean {
    return !this.regionCode || SOFIA_REGION_CODES.has(this.regionCode);
  }

  private getSofiaPrecinctFeatures(
    precinctById: Map<string, SettlementAggregate>
  ): SofiaPrecinctGeometryFeature[] {
    if (!this.sofiaPrecinctGeometry || !this.shouldRenderSofiaPrecincts()) return [];

    const regionId = this.regionCode ? GEOMETRY_CODE_TO_REGION_ID[this.regionCode] : '';
    return this.sofiaPrecinctGeometry.features.filter((feature) => {
      const precinctId = String(feature.properties.id || '');
      if (!precinctId) return false;
      if (regionId && precinctId.slice(0, 2) !== regionId) return false;
      if (this.allowUnresolvedFeatures) return true;
      return precinctById.has(precinctId);
    });
  }

  private getRenderableSections(): Section[] {
    return this.settlements
      .flatMap((settlement) => settlement.sections)
      .filter((section) => {
        if (!this.getSectionLatLng(section)) return false;
        if (!this.regionCode) return section.regionId !== '32';
        return section.regionId === GEOMETRY_CODE_TO_REGION_ID[this.regionCode];
      });
  }

  private getSectionLatLng(section: Section): L.LatLngExpression | null {
    const first = section.longitude;
    const second = section.latitude;
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

    if (this.looksLikeBulgariaLatitude(first) && this.looksLikeBulgariaLongitude(second)) {
      return [first as number, second as number];
    }

    return [second as number, first as number];
  }

  private looksLikeBulgariaLatitude(value: number | undefined): boolean {
    return value !== undefined && value >= 41 && value <= 45;
  }

  private looksLikeBulgariaLongitude(value: number | undefined): boolean {
    return value !== undefined && value >= 22 && value <= 29;
  }

  private getSectionAggregate(section: Section): MapAggregate {
    const partyTotals: Record<string, number> = Object.create(null);
    Object.entries(section.partyVotes || {}).forEach(([partyId, votes]) => {
      partyTotals[partyId] = votes.total || 0;
    });

    const leadingParty = Object.entries(partyTotals)
      .map(([partyId, total]) => ({
        partyId,
        partyName: this.getPartyName(partyId, []),
        total,
      }))
      .sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName, 'bg') || a.partyId.localeCompare(b.partyId, 'bg'))[0];

    const leadingPreference = this.metric === 'leading-preference' ? this.getLeadingPreference([section]) : undefined;

    return this.withComparison({
      total: section.total || 0,
      voted: section.voted || 0,
      discardedVotes: section.discardedVotes || 0,
      noVotes: section.noVotes || 0,
      totalPaper: section.totalPaper || 0,
      totalMachine: section.totalMachine || 0,
      totalElectors: section.total || 0,
      riskScore: section.riskScore || section.riskIndicators?.length || 0,
      partyTotals,
      leadingParty,
      leadingPreference,
    }, [section]);
  }

  private aggregateAreas(getKey: (settlement: SettlementAggregate) => string): Map<string, AreaAggregate> {
    const groups = new Map<string, AreaAggregate>();

    this.settlements.forEach((settlement) => {
      const key = getKey(settlement);
      if (!key) return;

      let aggregate = groups.get(key);
      if (!aggregate) {
        aggregate = {
          key,
          regionId: settlement.regionId,
          regionName: settlement.regionName || REGION_ID_TO_NAME[settlement.regionId] || settlement.regionId,
          municipalityCode: this.getSettlementMunicipalityCode(settlement),
          municipalityName: settlement.municipalityName,
          settlements: [],
          total: 0,
          voted: 0,
          discardedVotes: 0,
          noVotes: 0,
          totalPaper: 0,
          totalMachine: 0,
          totalElectors: 0,
          riskScore: 0,
          partyTotals: Object.create(null),
        };
        groups.set(key, aggregate);
      }

      aggregate.settlements.push(settlement);
      aggregate.total += settlement.total || 0;
      aggregate.voted += settlement.voted || 0;
      aggregate.discardedVotes += settlement.discardedVotes || 0;
      aggregate.noVotes += settlement.noVotes || 0;
      aggregate.totalPaper += settlement.totalPaper || 0;
      aggregate.totalMachine += settlement.totalMachine || 0;
      aggregate.totalElectors += settlement.totalElectors || 0;
      aggregate.riskScore += settlement.riskScore || 0;

      Object.entries(settlement.partyTotals || {}).forEach(([partyId, total]) => {
        aggregate!.partyTotals[partyId] = (aggregate!.partyTotals[partyId] || 0) + total;
      });
    });

    groups.forEach((aggregate) => {
      aggregate.leadingParty = this.getLeadingParty(aggregate);
      aggregate.leadingPreference = this.metric === 'leading-preference'
        ? this.getLeadingPreference(aggregate.settlements.flatMap((settlement) => settlement.sections)) : undefined;
      groups.set(aggregate.key, this.withComparison(aggregate, aggregate.settlements.flatMap(settlement => settlement.sections)));
    });

    return groups;
  }

  private getLeadingParty(aggregate: AreaAggregate): MapPartyLeader | undefined {
    return Object.entries(aggregate.partyTotals)
      .map(([partyId, total]) => ({
        partyId,
        partyName: this.getPartyName(partyId, aggregate.settlements),
        total,
      }))
      .sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName, 'bg') || a.partyId.localeCompare(b.partyId, 'bg'))[0];
  }

  private getLeadingPreference(sections: Section[]): MapPreferenceLeader | undefined {
    const preferenceTotals = new Map<string, MapPreferenceLeader>();

    sections.forEach((section) => {
      Object.values(section.candidateVotes || {}).forEach((candidate) => {
        const key = `${candidate.partyId}_${candidate.candidateId}`;
        const existing = preferenceTotals.get(key);
        if (existing) {
          existing.total += candidate.total || 0;
          return;
        }
        preferenceTotals.set(key, {
          candidateId: candidate.candidateId,
          candidateName: candidate.candidateName,
          partyId: candidate.partyId,
          partyName: candidate.partyName || this.getPartyName(candidate.partyId, []),
          total: candidate.total || 0,
        });
      });
    });

    return Array.from(preferenceTotals.values())
      .sort((a, b) =>
        b.total - a.total
        || a.candidateName.localeCompare(b.candidateName, 'bg')
        || a.partyName.localeCompare(b.partyName, 'bg')
        || a.candidateId.localeCompare(b.candidateId, 'bg')
      )[0];
  }

  private getPartyName(partyId: string, settlements: SettlementAggregate[]): string {
    for (const settlement of settlements) {
      if (settlement.leadingParty?.partyId === partyId) return settlement.leadingParty.partyName;
      if (settlement.leadingPreference?.partyId === partyId) return settlement.leadingPreference.partyName;
    }
    return this.partiesById[partyId] || partyId;
  }

  private getSettlementMunicipalityCode(settlement: SettlementAggregate): string {
    if (settlement.geometryMunicipalityCode) return settlement.geometryMunicipalityCode;

    const lookup = this.lookupByEkatte(settlement.ekatte);
    return lookup?.obshtina || '';
  }

  private getMunicipalityFeatureName(feature: any): string {
    const code = feature.properties.nuts4;
    return this.municipalityLookupMap.get(code)?.name || code;
  }

  private getRegionFeatureName(feature: any): string {
    const regionId = GEOMETRY_CODE_TO_REGION_ID[feature.properties.nuts3] || '';
    return this.formatRegionName(REGION_ID_TO_NAME[regionId] || feature.properties.nuts3);
  }

  private buildAreaTooltip(aggregate: AreaAggregate | undefined, fallbackName: string): string {
    const displayName = this.view === 'municipalities'
      ? fallbackName || aggregate?.municipalityName || aggregate?.regionName
      : aggregate?.regionName || fallbackName;
    const header = `<strong>${this.formatRegionName(displayName || '')}</strong>`;

    if (!aggregate) {
      return `${header}<br/>Няма налични изборни данни за визуализация.`;
    }

    return MapMetricHelper.buildMetricTooltip(this.metric, aggregate, header, true, this.partiesById, this.selectedPartyId, this.belowThresholdPartyIds, this.votesLabel, this.shareLabel);
  }

  private buildTooltip(
    feature: SettlementGeometryFeature,
    settlement: SettlementAggregate | undefined
  ): string {
    const ekatte = feature.properties.ekatte;
    const lookupItem = this.lookupByEkatte(ekatte);
    const displayName = settlement?.displayName || stripSettlementPrefix(settlement?.cityName) || stripSettlementPrefix(lookupItem?.name) || ekatte;

    let header = '';
    if (this.regionCode) {
      header = `<strong>${displayName}</strong>`;
    } else {
      let regionId = settlement?.regionId || '';
      let regionName = settlement?.regionName || '';

      if (!regionId && lookupItem?.oblast) {
        regionId = GEOMETRY_CODE_TO_REGION_ID[lookupItem.oblast] || '';
        regionName = REGION_ID_TO_NAME[regionId] || lookupItem.oblast;
      }

      regionName = this.formatRegionName(regionName);

      const municipalityCode = settlement?.geometryMunicipalityCode || lookupItem?.obshtina || '';
      const municipalityName =
        settlement?.municipalityName ||
        this.municipalityLookupMap.get(municipalityCode)?.name ||
        municipalityCode;
      header = `${regionId ? regionId + '. ' : ''}${regionName}${
        municipalityName ? ', ' + municipalityName : ''
      }, <strong>${displayName}</strong>`;
    }

    if (!settlement) {
      return `${header}<br/>Няма налични изборни данни за визуализация.`;
    }

    return MapMetricHelper.buildMetricTooltip(this.metric, settlement, header, true, this.partiesById, this.selectedPartyId, this.belowThresholdPartyIds, this.votesLabel, this.shareLabel);
  }

  private buildSectionTooltip(section: Section, aggregate: MapAggregate): string {
    const regionName = this.formatRegionName(section.regionName || REGION_ID_TO_NAME[section.regionId] || '');
    const locationParts = [
      section.regionId && regionName ? `${section.regionId}. ${regionName}` : '',
      section.municipalityName,
      stripSettlementPrefix(section.cityName),
    ].filter(Boolean);
    const header = [
      locationParts.join(', '),
      `<strong>Секция ${section.sectionId}</strong>`,
      section.sectionName,
    ].filter(Boolean).join('<br/>');

    return MapMetricHelper.buildMetricTooltip(this.metric, aggregate, header, true, this.partiesById, this.selectedPartyId, this.belowThresholdPartyIds, this.votesLabel, this.shareLabel);
  }

  private buildSofiaPrecinctTooltip(
    feature: SofiaPrecinctGeometryFeature,
    precinct: SettlementAggregate | undefined
  ): string {
    const precinctId = String(feature.properties.id || '');
    const address = feature.properties.address || precinct?.sections[0]?.sectionName || '';
    const regionId = precinct?.regionId || precinctId.slice(0, 2);
    const regionName = this.formatRegionName(precinct?.regionName || REGION_ID_TO_NAME[regionId] || '');
    const headerParts = [
      regionName ? `${regionId}. ${regionName}` : '',
      `<strong>Секция ${precinctId}</strong>`,
      address,
    ].filter(Boolean);
    const header = headerParts.join('<br/>');

    if (!precinct) {
      return `${header}<br/>Няма налични изборни данни за визуализация.`;
    }

    return MapMetricHelper.buildMetricTooltip(this.metric, precinct, header, true, this.partiesById, this.selectedPartyId, this.belowThresholdPartyIds, this.votesLabel, this.shareLabel);
  }

  private lookupByEkatte(ekatte: string): SettlementLookup | undefined {
    return this.settlementLookupMap.get(ekatte);
  }

  private formatRegionName(name: string): string {
    if (!name) return '';
    return name.replace(/^\d+\.\s*/, '').trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
