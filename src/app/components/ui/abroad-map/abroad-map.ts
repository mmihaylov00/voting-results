import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  input,
  effect,
  untracked,
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

export type AbroadMetricAggregate = MapAggregate;

@Component({
  selector: 'app-abroad-map',
  standalone: true,
  imports: [CommonModule, HlmButtonDirective],
  template: `
    <div
      [class]="embedded()
        ? 'flex h-[720px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background'
        : 'fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'"
      (click)="onBackdropClick()">
      <div
        [class]="embedded()
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex h-[min(90vh,840px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl'"
        (click)="embedded() ? null : $event.stopPropagation()">
        <div class="flex items-center justify-between border-b border-border px-6 py-4">
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

        <div class="relative min-h-0 flex-1">
          @if (loading() || !dataLoaded) {
            <div class="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground backdrop-blur-sm">
              Зареждане на географските данни за чужбина...
            </div>
          }
          <div #mapContainer class="h-full w-full"></div>
        </div>
      </div>
    </div>
  `,
})
export class AbroadMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  sections = input<Section[]>([]);
  partiesById = input<Record<string, string>>({});
  loading = input(false);
  embedded = input(false);
  metric = input<SettlementMapMetric>('leading-party');
  selectedPartyId = input<string | null>(null);

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
  private isDark = false;
  private lastViewportKey = '';

  onBackdropClick(): void {
    if (!this.embedded()) {
      this.close.emit();
    }
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
    });
    this.tileLayer.addTo(this.map);

    this.countryManifestSub = this.settlementMapData.getAbroadCountryManifest().subscribe((manifest) => {
      this.countryManifest = manifest;
      this.updateComputedData();
      this.dataLoaded = !!this.countryGeometry;
      this.renderMap();
      this.cdr.detectChanges();
    });

    this.countryGeometrySub = this.settlementMapData.getAbroadCountryGeometry().subscribe((geometry) => {
      this.countryGeometry = geometry;
      this.dataLoaded = this.countryManifest.length > 0;
      this.renderMap();
      this.cdr.detectChanges();
    });

    this.updateComputedData();
  }

  constructor() {
    effect(() => {
      this.sections();
      this.partiesById();
      untracked(() => {
        this.updateComputedData();
        this.cdr.detectChanges();
      });
    });

    effect(() => {
      this.sections();
      this.partiesById();
      this.metric();
      this.selectedPartyId();
      if (this.map) {
        untracked(() => {
          this.renderMap();
          this.cdr.detectChanges();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.countryGeometrySub?.unsubscribe();
    this.countryManifestSub?.unsubscribe();
    this.map?.remove();
  }

  showWorldView(): void {
    this.selectedCountryCode = null;
    this.selectedCountryName = '';
    this.updateSummary();
    this.renderMap();
  }

  private updateComputedData(): void {
    this.cities = aggregateAbroadSectionsByCity(this.sections(), this.partiesById(), this.countryManifest);
    this.countries = this.buildCountryAggregates(this.sections());

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
          marker.options.onEachFeature = (_feature, layer) => {
            layer.bindTooltip(this.buildTooltip(city), {
              sticky: true,
              opacity: 0.94,
              offset: L.point(10, 10),
              interactive: false,
            });
          };
        } else {
          marker.bindTooltip(this.buildTooltip(city), {
            sticky: true,
            opacity: 0.94,
            offset: L.point(10, 10),
            interactive: false,
          });
        }

        marker.on('click', () => {
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

      this.map.invalidateSize();

      const viewportKey = this.selectedCountryCode || 'world';
      if (this.lastViewportKey === viewportKey) {
        return;
      }

      if (this.selectedCountryCode) {
        const bounds = this.getSelectedFitBounds();
        if (bounds?.isValid()) {
          this.map.fitBounds(bounds, { padding: [20, 20] });
          this.lastViewportKey = viewportKey;
          return;
        }
      }

      this.map.setView([24, 12], 2);
      this.lastViewportKey = viewportKey;
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
          style: MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById()),
        });
      }
    }

    if (!Number.isFinite(city.longitude) || !Number.isFinite(city.latitude)) {
      return null;
    }

    const radius = this.selectedCountryCode ? 6 : 4;
    return L.circleMarker([city.latitude as number, city.longitude as number], {
      ...MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById()),
      radius,
    });
  }

  private buildWorldCityMarker(city: AbroadCityAggregate): L.CircleMarker | null {
    if (!this.canRenderWorldCityPolygon(city)) {
      return null;
    }

    return L.circleMarker([city.latitude as number, city.longitude as number], {
      ...MapMetricHelper.getAggregateStyle(this.metric(), city, this.isDark, this.selectedPartyId(), this.partiesById()),
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
    const baseStyle = MapMetricHelper.getAggregateStyle(this.metric(), country, this.isDark, this.selectedPartyId(), this.partiesById());
    if (!hasCityOverlay) {
      return baseStyle;
    }

    return {
      ...baseStyle,
      fillOpacity: 0.45,
    };
  }

  private buildMetricTooltip(aggregate: AbroadMetricAggregate, header: string): string {
    return MapMetricHelper.buildMetricTooltip(this.metric(), aggregate, header, true, this.partiesById());
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
