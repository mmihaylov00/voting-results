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
  private geometry?: SettlementGeometryCollection;
  private regionGeometry?: any;
  private settlementLookupMap = new Map<string, SettlementLookup>();
  private municipalityLookupMap = new Map<string, any>();
  private geometrySub?: Subscription;
  private regionGeometrySub?: Subscription;
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

    if (this.regionGeometry && !this.regionCode) {
      try {
        this.regionLayer = L.geoJSON(this.regionGeometry, {
          style: {
            color: isDark ? '#f8fafc' : '#475569',
            weight: 1.5,
            fillOpacity: 0,
            interactive: false,
          },
        });
        this.regionLayer.addTo(this.map);
      } catch (e) {
        console.warn('Failed to add region layer:', e);
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
    const fillColor = this.getFillColor(settlement, isDark);

    let fillOpacity = settlement ? 0.9 : 0.45;
    if (settlement && this.metric === 'party-votes') {
      const votes = this.selectedPartyId ? (settlement.partyTotals[this.selectedPartyId] || 0) : 0;
      const total = settlement.total || 0;
      const share = total > 0 ? votes / total : 0;
      fillOpacity = 0.6 + share * 0.4;
    }

    return {
      color: isDark ? '#0f172a' : '#cbd5e1',
      weight: this.regionCode ? 1 : 0.5,
      fillColor,
      fillOpacity,
    };
  }

  private getFillColor(settlement: SettlementAggregate | undefined, isDark: boolean): string {
    if (!settlement) {
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (this.metric === 'leading-preference') {
      return getPartyColor(settlement.leadingPreference?.partyName, isDark);
    }

    if (this.metric === 'activity') {
      const activity = settlement.totalElectors > 0 ? (settlement.voted / settlement.totalElectors) : 0;
      // Increasingly green where more activity
      if (activity > 0.6) return '#166534'; // green-800
      if (activity > 0.5) return '#15803d'; // green-700
      if (activity > 0.4) return '#16a34a'; // green-600
      if (activity > 0.3) return '#22c55e'; // green-500
      if (activity > 0.2) return '#4ade80'; // green-400
      if (activity > 0.1) return '#86efac'; // green-300
      return '#bbf7d0'; // green-200
    }

    if (this.metric === 'risks') {
      const riskScore = settlement.riskScore || 0;
      // Increasingly red where more risks
      if (riskScore > 20) return '#991b1b'; // red-800
      if (riskScore > 15) return '#b91c1c'; // red-700
      if (riskScore > 10) return '#dc2626'; // red-600
      if (riskScore > 5) return '#ef4444'; // red-500
      if (riskScore > 2) return '#f87171'; // red-400
      if (riskScore > 0) return '#fca5a5'; // red-300
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (this.metric === 'invalid-votes') {
      const invalidShare = settlement.total > 0 ? (settlement.discardedVotes / settlement.total) : 0;
      // Increasingly red where more invalid
      if (invalidShare > 0.15) return '#991b1b'; // red-800
      if (invalidShare > 0.10) return '#b91c1c'; // red-700
      if (invalidShare > 0.07) return '#dc2626'; // red-600
      if (invalidShare > 0.05) return '#ef4444'; // red-500
      if (invalidShare > 0.03) return '#f87171'; // red-400
      if (invalidShare > 0.01) return '#fca5a5'; // red-300
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (this.metric === 'no-votes') {
      const noVotesShare = settlement.total > 0 ? (settlement.noVotes / settlement.total) : 0;
      // Increasingly purple where more "No support for anyone"
      if (noVotesShare > 0.10) return '#6b21a8'; // purple-800
      if (noVotesShare > 0.07) return '#86198f'; // fuchsia-800
      if (noVotesShare > 0.05) return '#a21caf'; // fuchsia-700
      if (noVotesShare > 0.03) return '#c026d3'; // fuchsia-600
      if (noVotesShare > 0.02) return '#d946ef'; // fuchsia-500
      if (noVotesShare > 0.01) return '#e879f9'; // fuchsia-400
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (this.metric === 'machine-vs-paper') {
      const machine = settlement.totalMachine || 0;
      const paper = settlement.totalPaper || 0;
      const total = machine + paper;
      if (total === 0) return isDark ? '#334155' : '#cbd5e1';

      const machineShare = machine / total;
      // Blue for machine dominance, Orange for paper dominance
      if (machineShare > 0.9) return '#1e3a8a'; // blue-900
      if (machineShare > 0.7) return '#1d4ed8'; // blue-700
      if (machineShare > 0.55) return '#3b82f6'; // blue-500
      if (machineShare > 0.45) return '#94a3b8'; // slate-400 (balanced)
      if (machineShare > 0.3) return '#f97316'; // orange-500
      if (machineShare > 0.1) return '#c2410c'; // orange-700
      return '#7c2d12'; // orange-900
    }

    if (this.metric === 'winner-margin') {
      const parties = Object.entries(settlement.partyTotals)
        .sort((a, b) => b[1] - a[1]);
      if (parties.length < 2 || settlement.total === 0) return isDark ? '#334155' : '#cbd5e1';

      const margin = (parties[0][1] - parties[1][1]) / settlement.total;
      const winnerColor = getPartyColor(settlement.leadingParty?.partyName, isDark);

      // We can't easily do a gradient of ANY party color here without complex logic,
      // so let's use a neutral "Competition Intensity" scale (Indigo)
      // High margin = dark indigo, Low margin = light indigo
      if (margin > 0.4) return '#312e81'; // indigo-900
      if (margin > 0.3) return '#3730a3'; // indigo-800
      if (margin > 0.2) return '#4338ca'; // indigo-700
      if (margin > 0.1) return '#4f46e5'; // indigo-600
      if (margin > 0.05) return '#6366f1'; // indigo-500
      return '#818cf8'; // indigo-400
    }

    if (this.metric === 'party-votes' && this.selectedPartyId) {
      const party = settlement.leadingParty?.partyId === this.selectedPartyId
        ? settlement.leadingParty
        : { partyName: this.selectedPartyId }; // Fallback to id if name not available, getPartyColor handles it
      return getPartyColor(party.partyName, isDark);
    }

    return getPartyColor(settlement.leadingParty?.partyName, isDark);
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

    if (this.metric === 'leading-preference' && settlement.leadingPreference) {
      return `${header}<br/>Води преференция: ${settlement.leadingPreference.candidateName}<br/>${settlement.leadingPreference.partyName} • ${settlement.leadingPreference.total.toLocaleString('bg-BG')} гласа`;
    }

    if (this.metric === 'activity') {
      const activity = settlement.totalElectors > 0 ? (settlement.voted / settlement.totalElectors * 100) : 0;
      return `${header}<br/>Активност: ${activity.toFixed(2)}%<br/>${settlement.voted.toLocaleString('bg-BG')} от ${settlement.totalElectors.toLocaleString('bg-BG')} избиратели`;
    }

    if (this.metric === 'risks') {
      return `${header}<br/>Рисков рейтинг: ${settlement.riskScore}<br/>${settlement.sections.length} секции`;
    }

    if (this.metric === 'invalid-votes') {
      const invalidShare = settlement.total > 0 ? (settlement.discardedVotes / settlement.total * 100) : 0;
      return `${header}<br/>Недействителни гласове: ${invalidShare.toFixed(2)}%<br/>${settlement.discardedVotes.toLocaleString('bg-BG')} от ${settlement.total.toLocaleString('bg-BG')} гласа`;
    }

    if (this.metric === 'no-votes') {
      const noVotesShare = settlement.total > 0 ? (settlement.noVotes / settlement.total * 100) : 0;
      return `${header}<br/>Не подкрепям никого: ${noVotesShare.toFixed(2)}%<br/>${settlement.noVotes.toLocaleString('bg-BG')} от ${settlement.total.toLocaleString('bg-BG')} гласа`;
    }

    if (this.metric === 'machine-vs-paper') {
      const machine = settlement.totalMachine || 0;
      const paper = settlement.totalPaper || 0;
      const total = machine + paper;
      const machineShare = total > 0 ? (machine / total * 100) : 0;
      const paperShare = total > 0 ? (paper / total * 100) : 0;
      return `${header}<br/>Машинно: ${machineShare.toFixed(1)}% (${machine.toLocaleString('bg-BG')})<br/>Хартиено: ${paperShare.toFixed(1)}% (${paper.toLocaleString('bg-BG')})`;
    }

    if (this.metric === 'winner-margin') {
      const parties = Object.entries(settlement.partyTotals)
        .sort((a, b) => b[1] - a[1]);
      if (parties.length >= 2) {
        const margin = settlement.total > 0 ? ((parties[0][1] - parties[1][1]) / settlement.total * 100) : 0;
        const winner = settlement.leadingParty?.partyName || parties[0][0];
        return `${header}<br/>Победител: ${winner}<br/>Разлика спрямо втория: ${margin.toFixed(2)}%`;
      }
    }

    if (this.metric === 'party-votes' && this.selectedPartyId) {
      const votes = settlement.partyTotals[this.selectedPartyId] || 0;
      const share = settlement.total > 0 ? (votes / settlement.total * 100) : 0;
      return `${header}<br/>Гласове за избраната партия: ${share.toFixed(2)}%<br/>${votes.toLocaleString('bg-BG')} от ${settlement.total.toLocaleString('bg-BG')} гласа`;
    }

    if (settlement.leadingParty) {
      return `${header}<br/>Води партия: ${settlement.leadingParty.partyName}<br/>${settlement.leadingParty.total.toLocaleString('bg-BG')} гласа`;
    }

    return `${header}<br/>Няма налични резултати.`;
  }

  private lookupByEkatte(ekatte: string): SettlementLookup | undefined {
    return this.settlementLookupMap.get(ekatte);
  }

  private formatRegionName(name: string): string {
    if (!name) return '';
    return name.replace(/^\d+\.\s*/, '').trim();
  }
}
