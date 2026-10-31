import { LoadingBarComponent } from '../loading-bar/loading-bar';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  input,
  effect,
  untracked,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { Section } from '../../../models/election.models';
import {
  AbroadCityAggregate,
  AbroadCountryAggregate,
  AbroadCountryGeometryCollection,
  AbroadCountryGeometryFeature,
  AbroadCountryManifestItem,
  AbroadMapSummary,
  GEOMETRY_ISO_ALIASES,
  aggregateAbroadSectionsByCity,
  buildAbroadSummary,
  resolveAbroadSectionLocation,
} from '../../../utils/abroad-map.util';
import { SettlementMapMetric } from '../../../utils/settlement-map.util';
import { ThemeService } from '../../../services/theme.service';
import { SettlementMapDataService } from '../../../services/settlement-map-data.service';
import { MapAggregate, MapMetricHelper } from '../../../utils/map-metric.helper';
import { MapLegendComponent } from '../map-legend/map-legend';
import { MapToolsComponent } from '../map-tools/map-tools';
import { MapActionsComponent } from '../map-actions/map-actions';
import { MapExportContext, MapSearchItem, MapSelection } from '../../../utils/map-interaction.util';
import { exportMapImage, toggleMapFullscreen } from '../../../utils/map-image-export.util';
import { resizeMapPreservingView } from '../../../utils/map-resize.util';
import { applyMapComparison } from '../../../utils/election-map-comparison.util';

export type AbroadMetricAggregate = MapAggregate;

@Component({
  selector: 'app-abroad-map',
  standalone: true,
  imports: [LoadingBarComponent, CommonModule, HlmButtonDirective, MapLegendComponent, MapToolsComponent, MapActionsComponent],
  template: `
    <div
      [class]="embedded()
        ? 'flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-background lg:h-[65dvh] lg:min-h-[360px] lg:max-h-[780px]'
        : 'fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs'"
      (click)="onBackdropClick()">
      <div #workspace class="map-workspace"
        [class]="embedded()
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex max-h-[90dvh] w-full max-w-7xl flex-col overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl lg:h-[min(90vh,840px)] lg:overflow-hidden'"
        (click)="embedded() ? null : $event.stopPropagation()">
        <div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 class="text-xl font-semibold text-foreground">Извън страната</h2>
            <p class="text-sm text-muted-foreground">
              @if (selectedCountryCode) {
                {{ selectedCountryName || 'Избрана държава' }}: карта по градове.
              } @else {
                Световна карта по градове за избраната дата.
              }
            </p>
          </div>
          <div class="flex items-center gap-2">
            @if (selectedCountryCode) {
              <button hlmBtn variant="outline" size="sm" (click)="showWorldView()">Светът</button>
            }
            @if (!embedded()) {
              <button hlmBtn variant="outline" size="sm" (click)="close.emit()">Затвори</button>
            }
          </div>
        </div>

        <div class="grid shrink-0 gap-2 border-b border-border bg-background px-4 py-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <app-map-tools class="block min-w-0" [items]="searchItems" [error]="toolError" (searchSelect)="focusSearchItem($event)" />
          <ng-content select="app-map-metric-controls" />
        </div>
        <div class="relative flex shrink-0 flex-col lg:min-h-0 lg:flex-1">
        <div class="map-viewport relative isolate h-[55dvh] min-h-[320px] max-h-[620px] lg:h-auto lg:min-h-0 lg:max-h-none lg:flex-1">
          <div class="pointer-events-none absolute right-3 top-3 z-[600] w-[220px] max-w-[50%] space-y-2">
            <app-map-actions class="pointer-events-auto block" [exporting]="exporting"
              (exportClick)="exportImage()" (fullscreenClick)="toggleFullscreen()" />
          </div>
          <app-loading-bar [loading]="loading() || !dataLoaded" appearance="contained" label="Зареждане на картата на чужбина" />
          <div #mapContainer class="h-full w-full"></div>
        </div>
        <app-map-legend class="m-3 block shrink-0 lg:absolute lg:right-3 lg:top-[60px] lg:z-[600] lg:m-0 lg:w-[220px] lg:max-w-[50%]" [metric]="metric()" [selectedPartyId]="selectedPartyId()" [partiesById]="partiesById()" [shareLabel]="shareLabel()" />
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .map-workspace:fullscreen { width: 100vw; max-width: none; height: 100dvh; max-height: none; border-radius: 0; overflow: auto; }
  `],
})
export class AbroadMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('workspace') private workspace?: ElementRef<HTMLDivElement>;

  sections = input<Section[]>([]);
  partiesById = input<Record<string, string>>({});
  belowThresholdPartyIds = input<ReadonlySet<string> | null>(null);
  loading = input(false);
  embedded = input(false);
  metric = input<SettlementMapMetric>('leading-party');
  selectedPartyId = input<string | null>(null);
  votesLabel = input('гласа');
  shareLabel = input('от гласувалите');
  focusSectionId = input<string | null>(null);
  exportContext = input<MapExportContext | null>(null);
  comparisonSections = input<Section[] | null>(null);
  comparisonPartyId = input<string | null>(null);
  @Output() selectionChange = new EventEmitter<MapSelection>();
  searchItems: MapSearchItem[] = [];
  exporting = false;
  toolError = '';
  private pendingFocusSectionId: string | null = null;
  private selectedPlace = '';

  @Output() close = new EventEmitter<void>();
  @Output() citySelect = new EventEmitter<AbroadCityAggregate>();
  @Output() countrySelect = new EventEmitter<AbroadCountryAggregate>();

  cities: AbroadCityAggregate[] = [];
  countries: AbroadCountryAggregate[] = [];
  summary: AbroadMapSummary | null = null;
  selectedCountryCode: string | null = null;
  selectedCountryName = '';
  dataLoaded = false;

  private readonly themeService = inject(ThemeService);
  private readonly settlementMapData = inject(SettlementMapDataService);
  private readonly cdr = inject(ChangeDetectorRef);

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private countryLayer?: L.GeoJSON;
  private selectedCountryLayer?: L.GeoJSON;
  private cityLayer?: L.FeatureGroup;
  private countryGeometry?: AbroadCountryGeometryCollection;
  private countryManifest: AbroadCountryManifestItem[] = [];
  private countryGeometrySub?: Subscription;
  private countryManifestSub?: Subscription;
  private renderQueued = false;
  private resizeObserver?: ResizeObserver;
  private isDark = false;
  private lastViewportKey = '';

  onBackdropClick(): void {
    if (!this.embedded()) {
      this.close.emit();
    }
  }

  ngOnInit(): void {
    this.countryManifestSub = this.settlementMapData.getAbroadCountryManifest().subscribe((manifest) => {
      this.countryManifest = manifest;
      this.updateComputedData();
      this.dataLoaded = !!this.countryGeometry;
      this.renderMap();
      this.cdr.markForCheck();
    });

    this.countryGeometrySub = this.settlementMapData.getAbroadCountryGeometry().subscribe((geometry) => {
      this.countryGeometry = geometry;
      this.dataLoaded = this.countryManifest.length > 0;
      this.renderMap();
      this.cdr.markForCheck();
    });

    this.updateComputedData();
  }

  ngAfterViewInit(): void {
    if (!this.mapContainer) {
      return;
    }

    this.isDark = this.themeService.darkMode();
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: false,
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

    this.renderMap();
  }

  constructor() {
    effect(() => {
      const sectionId = this.focusSectionId();
      if (sectionId) {
        untracked(() => {
          this.pendingFocusSectionId = sectionId;
          this.focusPendingSection();
        });
      }
    });
    effect(() => {
      this.sections();
      this.partiesById();
      if (this.comparisonSections()) {
        this.comparisonPartyId();
        this.selectedPartyId();
      }
      untracked(() => {
        this.updateComputedData();
        this.renderMap();
        this.cdr.markForCheck();
      });
    });

    effect(() => {
      this.metric();
      this.belowThresholdPartyIds();
      this.selectedPartyId();
      this.votesLabel();
      this.shareLabel();
      this.loading();
      this.themeService.darkMode();
      if (this.map) {
        untracked(() => {
          this.renderMap();
          this.cdr.markForCheck();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.countryGeometrySub?.unsubscribe();
    this.countryManifestSub?.unsubscribe();
    this.map?.remove();
    this.map = undefined;
  }

  showWorldView(): void {
    this.selectedCountryCode = null;
    this.selectedCountryName = '';
    this.updateSummary();
    this.renderMap();
  }

  focusSearchItem(item: MapSearchItem): void {
    this.toolError = '';
    if (item.kind === 'section') {
      this.pendingFocusSectionId = item.sectionIds[0];
      this.focusPendingSection();
      const section = this.sections().find(entry => entry.sectionId === item.sectionIds[0]);
      if (section) this.emitSelection('section', item.label, [section]);
      return;
    }
    if (item.kind === 'country') {
      const country = this.countries.find(entry => `country:${entry.id}` === item.id);
      if (!country) return;
      this.selectedCountryCode = country.countryCode;
      this.selectedCountryName = country.countryName;
      this.emitSelection('country', country.countryName, country.sections);
      const feature = this.getCountryFeatureForCode(country.countryCode);
      if (this.map && feature) {
        this.lastViewportKey = this.selectedCountryCode || 'world';
        this.map.fitBounds(L.geoJSON(feature as any).getBounds(), { padding: [24, 24], animate: false });
      }
    } else {
      const city = this.cities.find(entry => `city:${entry.id}` === item.id);
      if (!city) return;
      this.selectedCountryCode = city.countryCode;
      this.selectedCountryName = city.countryName;
      this.emitSelection('city', city.displayName, city.sections);
      if (this.map && Number.isFinite(city.latitude) && Number.isFinite(city.longitude)) {
        this.lastViewportKey = this.selectedCountryCode || 'world';
        this.map.setView([city.latitude!, city.longitude!], 10, { animate: false });
      } else {
        this.toolError = 'Градът няма точни координати. Показана е държавата.';
      }
    }
    this.updateSummary();
    this.renderMap();
  }

  private focusPendingSection(): void {
    if (!this.map || !this.pendingFocusSectionId) return;
    const city = this.cities.find(entry => entry.sections.some(section => section.sectionId === this.pendingFocusSectionId));
    if (!city) return;
    this.pendingFocusSectionId = null;
    this.selectedCountryCode = city.countryCode;
    this.selectedCountryName = city.countryName;
    if (Number.isFinite(city.latitude) && Number.isFinite(city.longitude)) {
      this.lastViewportKey = this.selectedCountryCode || 'world';
      this.map.setView([city.latitude!, city.longitude!], 11, { animate: false });
      this.toolError = 'Показан е градът на секцията. Координатите в чужбина са обобщени по град.';
    } else {
      this.lastViewportKey = '';
      this.toolError = 'Секцията няма точни координати. Показана е държавата.';
    }
    this.updateSummary();
    this.renderMap();
  }

  private emitSelection(kind: MapSelection['kind'], label: string, sections: Section[]): void {
    this.selectedPlace = label;
    this.selectionChange.emit({ kind, label, sectionIds: sections.map(section => section.sectionId) });
  }

  private withComparison<T extends MapAggregate>(aggregate: T, sections: Section[]): T {
    return applyMapComparison(aggregate, sections, this.comparisonSections(), this.selectedPartyId(), this.comparisonPartyId());
  }

  async exportImage(): Promise<void> {
    if (!this.mapContainer || this.exporting) return;
    this.exporting = true;
    this.toolError = '';
    try {
      await exportMapImage(this.mapContainer.nativeElement, this.exportContext(),
        MapMetricHelper.getLegend(this.metric(), this.themeService.darkMode(), this.selectedPartyId(), this.partiesById(), this.shareLabel()),
        this.selectedPlace || this.selectedCountryName || 'Извън страната');
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

  private updateComputedData(): void {
    this.cities = aggregateAbroadSectionsByCity(this.sections(), this.partiesById(), this.countryManifest)
      .map(city => this.withComparison(city, city.sections));
    this.countries = this.buildCountryAggregates(this.sections())
      .map(country => this.withComparison(country, country.sections));
    this.searchItems = [
      ...this.countries.map(country => ({ id: `country:${country.id}`, kind: 'country' as const,
        label: country.countryName, sectionIds: country.sections.map(section => section.sectionId) })),
      ...this.cities.flatMap(city => [
        { id: `city:${city.id}`, kind: 'city' as const, label: city.displayName,
          sectionIds: city.sections.map(section => section.sectionId) },
        ...city.sections.map(section => ({ id: `section:${section.sectionId}`, kind: 'section' as const,
          label: `Секция ${section.sectionId}, ${city.displayName}, ${section.sectionName}`, sectionIds: [section.sectionId] })),
      ]),
    ];

    if (this.selectedCountryCode && !this.cities.some((city) => city.countryCode === this.selectedCountryCode)) {
      this.selectedCountryCode = null;
      this.selectedCountryName = '';
    }

    this.updateSummary();
  }

  private updateSummary(): void {
    const visibleCountries = this.selectedCountryCode ? this.cities.filter((city) => city.countryCode === this.selectedCountryCode) : this.countries;
    if (visibleCountries.length === 0) {
      this.summary = null;
      return;
    }

    const label = this.selectedCountryCode
      ? (this.selectedCountryName || 'Избрана държава')
      : 'Светът';

    this.summary = buildAbroadSummary(this.cities.filter((city) => !this.selectedCountryCode || city.countryCode === this.selectedCountryCode), label);
  }

  private getVisibleCities(requireCoordinates = true): AbroadCityAggregate[] {
    return this.cities.filter((city) => {
      if (this.selectedCountryCode && city.countryCode !== this.selectedCountryCode) {
        return false;
      }

      if (!requireCoordinates) {
        return true;
      }

      return Number.isFinite(city.longitude) && Number.isFinite(city.latitude);
    });
  }

  private renderMap(): void {
    if (!this.map || !this.countryGeometry || this.loading()) {
      return;
    }

    if (this.renderQueued) {
      return;
    }

    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      this.executeRender();
    });
  }

  private executeRender(): void {
    if (!this.map || !this.countryGeometry) {
      return;
    }

    this.isDark = this.themeService.darkMode();

    this.countryLayer?.removeFrom(this.map);
    this.selectedCountryLayer?.removeFrom(this.map);
    this.cityLayer?.removeFrom(this.map);

    this.countryLayer = L.geoJSON(this.countryGeometry as any, {
      style: MapMetricHelper.getBackgroundStyle(),
    }).addTo(this.map);

    if (this.selectedCountryCode) {
      const selectedCountryFeature = this.getSelectedCountryFeature();
      if (selectedCountryFeature) {
        this.selectedCountryLayer = L.geoJSON(selectedCountryFeature as any, {
          style: {
            ...MapMetricHelper.getBackgroundStyle(),
            fillOpacity: 0.05,
            fillColor: this.isDark ? '#1e293b' : '#e2e8f0',
          },
        }).addTo(this.map);
      }
    }

    this.cityLayer = L.featureGroup();

    if (this.selectedCountryCode) {
      const visibleCities = this.getVisibleCities(false);
      const countrySectionCounts = this.buildCountrySectionCounts(visibleCities);
      let renderedCityPolygonCount = 0;

      visibleCities.forEach((city) => {
        const marker = this.buildRenderableMarker(
          city,
          countrySectionCounts
        );
        if (!marker) {
          return;
        }

        if (marker instanceof L.GeoJSON) {
          marker.eachLayer(layer => {
            layer.bindTooltip(this.buildTooltip(city), {
              sticky: true,
              opacity: 0.94,
              offset: L.point(10, 10),
              interactive: false,
            });
          });
        } else {
          marker.bindTooltip(this.buildTooltip(city), {
            sticky: true,
            opacity: 0.94,
            offset: L.point(10, 10),
            interactive: false,
          });
        }

        marker.on('click', () => {
          this.emitSelection('city', city.displayName, city.sections);
          this.citySelect.emit(city);
        });

        marker.addTo(this.cityLayer!);
        renderedCityPolygonCount += 1;
      });

    } else {
      let renderedCountryPolygonCount = 0;
      let renderedWorldCityPolygonCount = 0;
      const worldCities = this.getVisibleCities(false);
      const countrySectionCounts = this.buildCountrySectionCounts(worldCities);

      this.countries.forEach((country) => {
        const feature = this.getCountryFeatureForCode(country.countryCode);
        const countrySectionCount = countrySectionCounts.get(country.id) || 0;
        const countryCities = worldCities.filter((city) => this.getCountryKey(city) === country.id);
        const hasRenderableWorldCities = countryCities.some((city) => this.canRenderWorldCityPolygon(city));
        if (!feature) {
          return;
        }

        const layer = L.geoJSON(feature as any, {
          style: this.getWorldCountryStyle(country, countrySectionCount > 1),
          onEachFeature: (_feature, layer) => {
            layer.bindTooltip(this.buildCountryTooltip(country), {
              sticky: true,
              opacity: 0.94,
              offset: L.point(10, 10),
              interactive: false,
            });

            layer.on('click', () => {
              this.emitSelection('country', country.countryName, country.sections);
              this.countrySelect.emit(country);
              if (!hasRenderableWorldCities) {
                this.citySelect.emit(this.buildCountryFallbackSelection(country, countryCities));
              }
            });
          }
        });

        layer.addTo(this.cityLayer!);
        renderedCountryPolygonCount += 1;
      });

      worldCities
        .filter((city) => (countrySectionCounts.get(this.getCountryKey(city)) || 0) > 1)
        .forEach((city) => {
          const marker = this.buildWorldCityMarker(city);
          if (!marker) {
            return;
          }

          marker.bindTooltip(this.buildTooltip(city), {
            sticky: false,
            opacity: 0.94,
            offset: L.point(10, 10),
            interactive: false,
          });

          marker.on('click', () => {
            // Find the country for this city
            const country = this.countries.find(c => c.id === this.getCountryKey(city));
            if (country) {
              this.emitSelection('country', country.countryName, country.sections);
              this.countrySelect.emit(country);
            }
          });

          marker.addTo(this.cityLayer!);
          marker.bringToFront();
          renderedWorldCityPolygonCount += 1;
        });
    }

    this.cityLayer.addTo(this.map);

    window.requestAnimationFrame(() => {
      if (!this.map) {
        return;
      }

      resizeMapPreservingView(this.map);

      const viewportKey = this.selectedCountryCode || 'world';
      if (this.lastViewportKey === viewportKey) {
        this.focusPendingSection();
        return;
      }

      if (this.selectedCountryCode) {
        const bounds = this.getSelectedFitBounds();
        if (bounds?.isValid()) {
          this.map.fitBounds(bounds, { padding: [20, 20] });
          this.lastViewportKey = viewportKey;
          this.focusPendingSection();
          return;
        }
      }

      this.map.setView([24, 12], 2);
      this.lastViewportKey = viewportKey;
      this.focusPendingSection();
    });
  }

  private buildRenderableMarker(
    city: AbroadCityAggregate,
    countrySectionCounts: Map<string, number>
  ): L.Layer | null {
    const countryKey = this.getCountryKey(city);
    const shouldUseCountryPolygon = (countrySectionCounts.get(countryKey) || 0) === 1;

    if (shouldUseCountryPolygon) {
      const feature = this.getCountryFeatureForCity(city);
      if (feature) {
        return L.geoJSON(feature as any, {
          style: MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById(), this.belowThresholdPartyIds()),
        });
      }
    }

    if (!Number.isFinite(city.longitude) || !Number.isFinite(city.latitude)) {
      return null;
    }

    const radius = this.selectedCountryCode ? 6 : 4;
    return L.circleMarker([city.latitude as number, city.longitude as number], {
      ...MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById(), this.belowThresholdPartyIds()),
      radius,
    });
  }

  private buildWorldCityMarker(city: AbroadCityAggregate): L.CircleMarker | null {
    if (!this.canRenderWorldCityPolygon(city)) {
      return null;
    }

    return L.circleMarker([city.latitude as number, city.longitude as number], {
      ...MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById(), this.belowThresholdPartyIds()),
      radius: 5,
      weight: 1.1,
      fillOpacity: 0.96,
    });
  }

  private canRenderWorldCityPolygon(city: AbroadCityAggregate): boolean {
    return Number.isFinite(city.longitude) && Number.isFinite(city.latitude);
  }

  private buildCountryFallbackSelection(
    country: AbroadCountryAggregate,
    countryCities: AbroadCityAggregate[]
  ): AbroadCityAggregate {
    const fallbackCity = countryCities[0];
    return {
      id: `country::${country.id}`,
      countryName: country.countryName,
      countryCode: country.countryCode,
      cityName: country.countryName,
      displayName: country.countryName,
      normalizedCountryName: country.normalizedCountryName,
      normalizedCityName: country.normalizedCountryName,
      longitude: fallbackCity?.longitude ?? null,
      latitude: fallbackCity?.latitude ?? null,
      sections: country.sections,
      total: country.total,
      voted: country.voted,
      discardedVotes: country.discardedVotes,
      noVotes: country.noVotes,
      totalPaper: country.totalPaper,
      totalMachine: country.totalMachine,
      totalElectors: country.totalElectors,
      riskScore: country.riskScore,
      partyTotals: { ...country.partyTotals },
      leadingParty: country.leadingParty,
      leadingPreference: country.leadingPreference,
    };
  }

  private getWorldCountryStyle(country: AbroadCountryAggregate, hasCityOverlay: boolean): L.PathOptions {
    const baseStyle = MapMetricHelper.getAggregateStyle(this.metric(), country, this.isDark, this.selectedPartyId(), this.partiesById(), this.belowThresholdPartyIds());
    if (!hasCityOverlay) {
      return baseStyle;
    }

    return {
      ...baseStyle,
      fillOpacity: 0.45,
    };
  }

  private buildMetricTooltip(aggregate: AbroadMetricAggregate, header: string): string {
    return MapMetricHelper.buildMetricTooltip(this.metric(), aggregate, header, true, this.partiesById(), this.selectedPartyId(), this.belowThresholdPartyIds(), this.votesLabel(), this.shareLabel());
  }

  private buildTooltip(city: AbroadCityAggregate): string {
    const header = this.selectedCountryCode
      ? `<strong>${city.cityName}</strong>`
      : `${city.countryName}, <strong>${city.cityName}</strong>`;

    return this.buildMetricTooltip(city, header);
  }

  private getSelectedCountryFeature(): AbroadCountryGeometryFeature | null {
    return this.getCountryFeatureForCode(this.selectedCountryCode);
  }

  private getCountryFeatureForCity(city: AbroadCityAggregate): AbroadCountryGeometryFeature | null {
    if (!this.countryGeometry || !city.countryCode) {
      return null;
    }

    return this.getCountryFeatureForCode(city.countryCode);
  }

  private getCountryFeatureForCode(countryCode: string | null): AbroadCountryGeometryFeature | null {
    if (!this.countryGeometry || !countryCode) {
      return null;
    }

    const feature = this.countryGeometry.features.find((feature) => feature.properties.iso2 === countryCode);
    if (feature) {
      return feature;
    }

    const alias = GEOMETRY_ISO_ALIASES[countryCode];
    if (alias) {
      return this.countryGeometry.features.find((feature) => feature.properties.name === alias) || null;
    }

    return null;
  }

  private buildCountrySectionCounts(cities: AbroadCityAggregate[]): Map<string, number> {
    const counts = new Map<string, number>();

    cities.forEach((city) => {
      const key = this.getCountryKey(city);
      counts.set(key, (counts.get(key) || 0) + city.sections.length);
    });

    return counts;
  }

  private getCountryKey(city: AbroadCityAggregate): string {
    return city.countryCode || city.normalizedCountryName;
  }

  private buildCountryAggregates(sections: Section[]): AbroadCountryAggregate[] {
    const groups = new Map<string, AbroadCountryAggregate>();

    sections.forEach((section) => {
      if (section.regionId !== '32') {
        return;
      }

      const resolved = resolveAbroadSectionLocation(section, this.countryManifest);
      const countryKey = resolved.countryCode || resolved.normalizedCountryName;
      let aggregate = groups.get(countryKey);
      if (!aggregate) {
        aggregate = {
          id: countryKey,
          countryName: resolved.countryName,
          countryCode: resolved.countryCode,
          normalizedCountryName: resolved.normalizedCountryName,
          sections: [],
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
        groups.set(countryKey, aggregate);
      }

      aggregate.sections.push(section);
      aggregate.total += section.total || 0;
      aggregate.voted += section.voted || 0;
      aggregate.discardedVotes += section.discardedVotes || 0;
      aggregate.noVotes += section.noVotes || 0;
      aggregate.totalPaper += section.totalPaper || 0;
      aggregate.totalMachine += section.totalMachine || 0;
      aggregate.totalElectors += section.total || 0;
      aggregate.riskScore += section.riskScore || section.riskIndicators?.length || 0;

      Object.entries(section.partyVotes || {}).forEach(([partyId, votes]) => {
        aggregate!.partyTotals[partyId] = (aggregate!.partyTotals[partyId] || 0) + (votes.total || 0);
      });
    });

    return Array.from(groups.values())
      .map((aggregate) => {
        const leadingParty = Object.entries(aggregate.partyTotals)
          .map(([partyId, total]) => ({
            partyId,
            partyName: this.partiesById()[partyId] || partyId,
            total,
          }))
          .sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName, 'bg'))[0];

        const preferenceTotals = new Map<string, NonNullable<AbroadCountryAggregate['leadingPreference']>>();
        aggregate.sections.forEach((section) => {
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
              partyName: candidate.partyName || this.partiesById()[candidate.partyId] || candidate.partyId,
              total: candidate.total || 0,
            });
          });
        });

        return {
          ...aggregate,
          leadingParty,
          leadingPreference: Array.from(preferenceTotals.values()).sort((a, b) =>
            b.total - a.total
            || a.candidateName.localeCompare(b.candidateName, 'bg')
            || a.partyName.localeCompare(b.partyName, 'bg')
            || a.candidateId.localeCompare(b.candidateId, 'bg')
          )[0],
        };
      })
      .sort((a, b) => b.voted - a.voted || a.countryName.localeCompare(b.countryName, 'bg'));
  }

  private buildCountryTooltip(country: AbroadCountryAggregate): string {
    const header = `<strong>${country.countryName}</strong>`;
    return this.buildMetricTooltip(country, header);
  }

  private getSelectedFitBounds(): L.LatLngBounds | null {
    const selectedCountryFeature = this.getSelectedCountryFeature();
    if (selectedCountryFeature) {
      const bounds = L.geoJSON(selectedCountryFeature as any).getBounds();
      if (bounds.isValid()) {
        return bounds;
      }
    }

    if (this.cityLayer) {
      const groupBounds = this.cityLayer.getBounds?.();
      if (groupBounds?.isValid()) {
        return groupBounds;
      }
    }

    return null;
  }
}
