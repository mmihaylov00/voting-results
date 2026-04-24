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
  stripSettlementPrefix,
  GEOMETRY_CODE_TO_REGION_ID,
  REGION_ID_TO_NAME,
} from '../../../utils/settlement-map.util';
import { ThemeService } from '../../../services/theme.service';
import { MapMetricHelper } from '../../../utils/map-metric.helper';

@Component({
  selector: 'app-settlement-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
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
  @Input() fitKey = '';
  @Input() allowUnresolvedFeatures = true;
  @Input() showWorldButton = false;

  @Output() settlementSelect = new EventEmitter<SettlementAggregate>();
  @Output() worldButtonClick = new EventEmitter<void>();

  private readonly settlementMapData = inject(SettlementMapDataService);
  private readonly themeService = inject(ThemeService);

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private geoJsonLayer?: L.GeoJSON;
  private regionLayer?: L.GeoJSON;
  private municipalityLayer?: L.GeoJSON;
  private geometry?: SettlementGeometryCollection;
  private regionGeometry?: any;
  private municipalityGeometry?: any;
  private settlementLookupMap = new Map<string, SettlementLookup>();
  private municipalityLookupMap = new Map<string, any>();
  private geometrySub?: Subscription;
  private regionGeometrySub?: Subscription;
  private municipalityGeometrySub?: Subscription;
  private lookupSub?: Subscription;
  private municipalitySub?: Subscription;
  private hasFittedForKey = '';
  private renderQueued = false;

  isEmpty = false;

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

    try {
      this.geoJsonLayer?.removeFrom(this.map);
      this.regionLayer?.removeFrom(this.map);
      this.municipalityLayer?.removeFrom(this.map);
    } catch (e) {
      console.warn('Failed to remove layers from map:', e);
    }

    const isDark = this.themeService.darkMode();
    const settlementByGeometryKey = new Map(this.settlements.map((settlement) => [settlement.geometryKey, settlement]));
    const features = this.geometry.features.filter((feature) => {
      if (feature.properties.nuts3 === '32') return false;
      if (this.regionCode && feature.properties.nuts3 !== this.regionCode) return false;
      if (this.allowUnresolvedFeatures) return true;
      return settlementByGeometryKey.has(feature.properties.ekatte);
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
        }
      } catch (e) {
        console.warn('Failed to add geometry layers:', e);
      }
    }

    window.requestAnimationFrame(() => {
      if (!this.map || !this.geoJsonLayer || !this.map.getContainer()) return;
      try {
        if (this.map.getContainer()) {
          this.map.invalidateSize();
          if (this.fitKey && this.hasFittedForKey === this.fitKey) return;
          const bounds = this.geoJsonLayer.getBounds();
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

  private getStyle(
    feature: SettlementGeometryFeature,
    settlementByGeometryKey: Map<string, SettlementAggregate>,
    isDark: boolean
  ): L.PathOptions {
    const settlement = settlementByGeometryKey.get(feature.properties.ekatte);
    return MapMetricHelper.getAggregateStyle(this.metric, settlement, isDark, this.selectedPartyId);
  }

  private getFillColor(settlement: SettlementAggregate | undefined, isDark: boolean): string {
    return MapMetricHelper.getFillColor(this.metric, settlement, isDark, this.selectedPartyId);
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

    return MapMetricHelper.buildMetricTooltip(this.metric, settlement, header);
  }

  private lookupByEkatte(ekatte: string): SettlementLookup | undefined {
    return this.settlementLookupMap.get(ekatte);
  }

  private formatRegionName(name: string): string {
    if (!name) return '';
    return name.replace(/^\d+\.\s*/, '').trim();
  }
}
