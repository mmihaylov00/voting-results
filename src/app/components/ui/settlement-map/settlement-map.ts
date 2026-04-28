import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
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

interface AreaAggregate extends MapAggregate {
  key: string;
  regionId: string;
  regionName: string;
  municipalityCode?: string;
  municipalityName?: string;
  settlements: SettlementAggregate[];
}

@Component({
  selector: 'app-settlement-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      @if (showViewTabs) {
        <div class="absolute left-14 right-4 top-4 z-[500] inline-flex overflow-x-auto rounded-lg border border-border bg-background/95 p-1 shadow-lg sm:right-auto">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'cities'"
            [class.text-primary-foreground]="view === 'cities'"
            [class.text-muted-foreground]="view !== 'cities'"
            (click)="setView('cities')">
            Населени места
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'municipalities'"
            [class.text-primary-foreground]="view === 'municipalities'"
            [class.text-muted-foreground]="view !== 'municipalities'"
            (click)="setView('municipalities')">
            Общини
          </button>
          @if (hasSectionLocations()) {
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
              [class.bg-primary]="view === 'sections'"
              [class.text-primary-foreground]="view === 'sections'"
              [class.text-muted-foreground]="view !== 'sections'"
              (click)="setView('sections')">
              Секции
            </button>
          }
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            [class.bg-primary]="view === 'regions'"
            [class.text-primary-foreground]="view === 'regions'"
            [class.text-muted-foreground]="view !== 'regions'"
            (click)="setView('regions')">
            Райони
          </button>
        </div>
      }
      <div #mapContainer class="h-[620px] w-full overflow-hidden rounded-xl border border-primary/20 bg-muted/20"></div>
      @if (showWorldButton) {
        <button
          type="button"
          class="absolute bottom-4 right-4 z-[500] inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg transition-colors hover:bg-accent"
          title="Извън страната"
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
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
          <div class="max-w-md px-6 text-center text-sm text-muted-foreground">
            Няма налични географски данни за тази карта.
          </div>
        </div>
      }
    </div>
  `,
})
export class SettlementMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) private mapContainer?: ElementRef<HTMLDivElement>;

  @Input() settlements: SettlementAggregate[] = [];
  @Input() regionCode: string | null = null;
  @Input() metric: SettlementMapMetric = 'leading-party';
  @Input() selectedPartyId: string | null = null;
  @Input() partiesById: Record<string, string> = {};
  @Input() fitKey = '';
  @Input() allowUnresolvedFeatures = true;
  @Input() showWorldButton = false;
  @Input() showViewTabs = false;

  @Output() settlementSelect = new EventEmitter<SettlementAggregate>();
  @Output() sectionSelect = new EventEmitter<Section>();
  @Output() areaSelect = new EventEmitter<SettlementMapAreaSelect>();
  @Output() worldButtonClick = new EventEmitter<void>();

  private readonly settlementMapData = inject(SettlementMapDataService);
  private readonly themeService = inject(ThemeService);

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
  private hasFittedForKey = '';
  private renderQueued = false;

  isEmpty = false;
  view: SettlementMapView = 'cities';

  async ngAfterViewInit(): Promise<void> {
    if (!this.mapContainer) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 15,
      scrollWheelZoom: true,
    });

    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    });
    this.tileLayer.addTo(this.map);
    const regionLabelPane = this.map.createPane('region-labels');
    regionLabelPane.style.zIndex = '450';
    regionLabelPane.style.pointerEvents = 'none';

    const closeTooltips = () => {
      if (this.map && this.map.getContainer()) {
        try {
          setTimeout(() => this.map!.eachLayer((layer) => {
            if ((layer as any).closeTooltip) {
              (layer as any).closeTooltip();
            }
          }), 100)
        } catch (e) {
          // Ignore transient tooltip errors
        }
      }
    }

    this.map.on('movestart dragstart zoomstart mousedown touchstart move zoom', closeTooltips);

    this.lookupSub = this.settlementMapData.getSettlementsLookup().subscribe((lookup) => {
      this.settlementLookupMap.clear();
      lookup.forEach((item) => {
        if (item.ekatte) {
          this.settlementLookupMap.set(item.ekatte, item);
        }
      });
      this.renderMap();
    });

    this.municipalitySub = this.settlementMapData.getMunicipalitiesLookup().subscribe((municipalities) => {
      this.municipalityLookupMap.clear();
      municipalities.forEach((item) => {
        if (item.obshtina) {
          this.municipalityLookupMap.set(item.obshtina, item);
        }
      });
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fitKey'] && !changes['fitKey'].firstChange) {
      this.hasFittedForKey = '';
    }

    if (changes['regionCode'] && this.map) {
      this.renderMap();
    }

    if (this.map && this.geometry) {
      this.renderMap();
    }
  }

  setView(view: SettlementMapView): void {
    if (this.view === view) return;
    if (view === 'sections' && !this.hasSectionLocations()) return;

    this.view = view;
    this.hasFittedForKey = '';
    this.renderMap();
  }

  hasSectionLocations(): boolean {
    return this.getRenderableSections().length > 0;
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
    if (this.renderQueued) return;

    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      this.executeRender();
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

    if (this.showViewTabs && this.view === 'regions') {
      this.renderRegionMap();
      return;
    }

    if (this.showViewTabs && this.view === 'municipalities') {
      this.renderMunicipalityMap();
      return;
    }

    if (this.showViewTabs && this.view === 'sections') {
      this.renderSectionMap();
      return;
    }

    this.renderSettlementMap();
  }

  private renderSettlementMap(): void {
    if (!this.map || !this.geometry || !this.map.getContainer()) return;

    const isDark = this.themeService.darkMode();
    const settlementByGeometryKey = new Map(this.settlements.map((settlement) => [settlement.geometryKey, settlement]));
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
          style: {
            ...MapMetricHelper.getBackgroundStyle(),
            weight: this.regionCode ? 1.1 : 0.5,
            opacity: 1,
          },
        });
        this.municipalityLayer.addTo(this.map);

        if (!this.regionCode) {
          this.regionLayer = L.geoJSON(this.regionGeometry, {
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
          this.map.invalidateSize();
          if (this.fitKey && this.hasFittedForKey === this.fitKey) return;
          const layers = [this.geoJsonLayer, this.sofiaPrecinctLayer].filter(Boolean) as L.Layer[];
          const bounds = L.featureGroup(layers).getBounds();
          if (bounds?.isValid()) {
            this.map.fitBounds(bounds, { padding: [24, 24] });
            this.hasFittedForKey = this.fitKey;
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
            return MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById);
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

  private renderSectionMap(): void {
    if (!this.map || !this.map.getContainer()) return;

    const isDark = this.themeService.darkMode();
    const sections = this.getRenderableSections();

    this.isEmpty = sections.length === 0;
    if (this.isEmpty) return;

    this.sectionLayer = L.featureGroup();

    sections.forEach((section) => {
      const latLng = this.getSectionLatLng(section);
      if (!latLng) return;

      const aggregate = this.getSectionAggregate(section);
      const style = MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById);
      const marker = L.circleMarker(latLng, {
        ...style,
        radius: 4,
        color: '#fff',
        weight: 0.8,
        opacity: 0.95,
        fillOpacity: Math.max(Number(style.fillOpacity || 0.8), 0.8),
      });

      marker.bindTooltip(this.buildSectionTooltip(section, aggregate), {
        sticky: false,
        opacity: 0.9,
        offset: L.point(10, 10),
        interactive: false,
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.sectionSelect.emit(section);
      });
      marker.addTo(this.sectionLayer!);
    });

    this.sectionLayer.addTo(this.map);
    this.addRegionBorders();
    this.addRegionLabels();
    this.fitToCurrentLayer();
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
              ...MapMetricHelper.getAggregateStyle(this.metric, aggregate, isDark, this.selectedPartyId, this.partiesById),
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
    window.requestAnimationFrame(() => {
      if (!this.map || !this.map.getContainer()) return;
      try {
        this.map.invalidateSize();
        const fitKey = `${this.fitKey}-${this.view}`;
        if (fitKey && this.hasFittedForKey === fitKey) return;
        const layer = this.geoJsonLayer || this.sectionLayer;
        if (!layer) return;
        const bounds = layer.getBounds();
        if (bounds?.isValid()) {
          this.map.fitBounds(bounds, { padding: [24, 24] });
          this.hasFittedForKey = fitKey;
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
    return MapMetricHelper.getAggregateStyle(this.metric, settlement, isDark, this.selectedPartyId, this.partiesById);
  }

  private getFillColor(settlement: SettlementAggregate | undefined, isDark: boolean): string {
    return MapMetricHelper.getFillColor(this.metric, settlement, isDark, this.selectedPartyId);
  }

  private getSofiaPrecinctStyle(
    feature: SofiaPrecinctGeometryFeature,
    precinctById: Map<string, SettlementAggregate>,
    isDark: boolean
  ): L.PathOptions {
    const precinct = precinctById.get(String(feature.properties.id));
    return MapMetricHelper.getAggregateStyle(this.metric, precinct, isDark, this.selectedPartyId, this.partiesById);
  }

  private getSofiaPrecinctAggregates(): Map<string, SettlementAggregate> {
    const sections = this.settlements.flatMap((settlement) => settlement.sections);
    return new Map(
      aggregateSectionsBySofiaPrecinct(sections, this.partiesById)
        .map((precinct) => [precinct.geometryKey, precinct])
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

    const leadingPreference = this.getLeadingPreference([section]);

    return {
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
    };
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
      aggregate.leadingPreference = this.getLeadingPreference(aggregate.settlements.flatMap((settlement) => settlement.sections));
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

    return MapMetricHelper.buildMetricTooltip(this.metric, aggregate, header, true, this.partiesById);
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

    return MapMetricHelper.buildMetricTooltip(this.metric, settlement, header, true, this.partiesById);
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

    return MapMetricHelper.buildMetricTooltip(this.metric, aggregate, header, true, this.partiesById);
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

    return MapMetricHelper.buildMetricTooltip(this.metric, precinct, header, true, this.partiesById);
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
