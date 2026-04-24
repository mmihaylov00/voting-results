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
} from '../../../utils/settlement-map.util';
import { getPartyColor } from '../../../utils/party-colors';
import { ThemeService } from '../../../services/theme.service';

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
  private geometry?: SettlementGeometryCollection;
  private regionGeometry?: any;
  private settlementLookupMap = new Map<string, string>();
  private geometrySub?: Subscription;
  private regionGeometrySub?: Subscription;
  private lookupSub?: Subscription;
  private hasFittedForKey = '';

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

    this.lookupSub = this.settlementMapData.getSettlementsLookup().subscribe((lookup) => {
      this.settlementLookupMap.clear();
      lookup.forEach((item) => {
        if (item.ekatte && item.name) {
          this.settlementLookupMap.set(item.ekatte, item.name);
        }
      });
      this.renderMap();
    });

    this.geometrySub = this.settlementMapData.getSettlementGeometry().subscribe((geometry) => {
      this.geometry = geometry;
      this.renderMap();
    });

    if (!this.regionCode) {
      this.regionGeometrySub = this.settlementMapData.getRegionGeometry().subscribe((geometry) => {
        this.regionGeometry = geometry;
        this.renderMap();
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fitKey'] && !changes['fitKey'].firstChange) {
      this.hasFittedForKey = '';
    }

    if (changes['regionCode'] && this.map) {
      if (this.regionCode) {
        this.regionGeometrySub?.unsubscribe();
        this.regionLayer?.removeFrom(this.map);
        this.regionLayer = undefined;
        this.regionGeometry = undefined;
      } else if (!this.regionGeometrySub) {
        this.regionGeometrySub = this.settlementMapData.getRegionGeometry().subscribe((geometry) => {
          this.regionGeometry = geometry;
          this.renderMap();
        });
      }
    }

    if (this.map && this.geometry) {
      this.renderMap();
    }
  }

  ngOnDestroy(): void {
    this.geometrySub?.unsubscribe();
    this.regionGeometrySub?.unsubscribe();
    this.lookupSub?.unsubscribe();
    this.map?.remove();
  }

  private renderMap(): void {
    if (!this.map || !this.geometry) return;

    this.geoJsonLayer?.removeFrom(this.map);
    this.regionLayer?.removeFrom(this.map);

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
          layer.bindTooltip(tooltip, { sticky: true });

          if (settlement) {
            layer.on('click', () => this.settlementSelect.emit(settlement));
          }
        },
      }
    );
    this.geoJsonLayer.addTo(this.map);

    if (this.regionGeometry && !this.regionCode) {
      this.regionLayer = L.geoJSON(this.regionGeometry, {
        style: {
          color: isDark ? '#f8fafc' : '#475569',
          weight: 1.5,
          fillOpacity: 0,
          interactive: false,
        },
      });
      this.regionLayer.addTo(this.map);
    }

    window.requestAnimationFrame(() => {
      this.map?.invalidateSize();
      if (this.fitKey && this.hasFittedForKey === this.fitKey) return;
      const bounds = this.geoJsonLayer?.getBounds();
      if (bounds?.isValid()) {
        this.map?.fitBounds(bounds, { padding: [24, 24] });
        this.hasFittedForKey = this.fitKey;
      }
    });
  }

  private getStyle(
    feature: SettlementGeometryFeature,
    settlementByGeometryKey: Map<string, SettlementAggregate>,
    isDark: boolean
  ): L.PathOptions {
    const settlement = settlementByGeometryKey.get(feature.properties.ekatte);
    const fillColor = this.getFillColor(settlement, isDark);

    return {
      color: isDark ? '#0f172a' : '#cbd5e1',
      weight: this.regionCode ? 1 : 0.5,
      fillColor,
      fillOpacity: settlement ? 0.85 : 0.35,
    };
  }

  private getFillColor(settlement: SettlementAggregate | undefined, isDark: boolean): string {
    if (!settlement) {
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (this.metric === 'leading-preference') {
      return getPartyColor(settlement.leadingPreference?.partyName, isDark);
    }

    return getPartyColor(settlement.leadingParty?.partyName, isDark);
  }

  private buildTooltip(
    feature: SettlementGeometryFeature,
    settlement: SettlementAggregate | undefined
  ): string {
    const ekatte = feature.properties.ekatte;
    const lookupName = this.settlementLookupMap.get(ekatte);
    const name = settlement?.displayName || stripSettlementPrefix(settlement?.cityName) || stripSettlementPrefix(lookupName) || ekatte;

    if (!settlement) {
      return `<strong>${name}</strong><br/>Няма налични изборни данни за визуализация.`;
    }

    if (this.metric === 'leading-preference' && settlement.leadingPreference) {
      return `<strong>${name}</strong><br/>Води преференция: ${settlement.leadingPreference.candidateName}<br/>${settlement.leadingPreference.partyName} • ${settlement.leadingPreference.total.toLocaleString('bg-BG')} гласа`;
    }

    if (settlement.leadingParty) {
      return `<strong>${name}</strong><br/>Води партия: ${settlement.leadingParty.partyName}<br/>${settlement.leadingParty.total.toLocaleString('bg-BG')} гласа`;
    }

    return `<strong>${name}</strong><br/>Няма налични резултати.`;
  }
}
