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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { PartyBadgeComponent } from '../party-badge/party-badge';
import { Section } from '../../../models/election.models';
import {
  ABROAD_CONTINENTS,
  AbroadContinentAggregate,
  AbroadContinentId,
  aggregateAbroadSectionsByContinent,
} from '../../../utils/abroad-map.util';
import { getPartyColor } from '../../../utils/party-colors';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-abroad-world-map-modal',
  standalone: true,
  imports: [CommonModule, HlmButtonDirective, PartyBadgeComponent],
  template: `
    <div
      [class]="embedded
        ? 'flex h-[720px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background'
        : 'fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'"
      (click)="onBackdropClick()">
      <div
        [class]="embedded
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex h-[min(90vh,840px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl'"
        (click)="embedded ? null : $event.stopPropagation()">
        <div class="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 class="text-xl font-semibold text-foreground">Извън страната</h2>
            <p class="text-sm text-muted-foreground">
              Световна карта по континенти за избраната дата.
            </p>
          </div>
          @if (!embedded) {
            <button hlmBtn variant="outline" size="sm" (click)="close.emit()">Затвори</button>
          }
        </div>

        @if (loading) {
          <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Зареждане на данните за чужбина...
          </div>
        } @else {
          <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.3fr)_400px]">
            <div class="border-b border-border lg:border-b-0 lg:border-r">
              <div #mapContainer class="h-[360px] w-full lg:h-full"></div>
            </div>

            <div class="flex min-h-0 flex-col">
              <div class="border-b border-border px-5 py-4">
                <div class="flex flex-wrap gap-2">
                  <button
                    hlmBtn
                    size="sm"
                    [variant]="selectedContinentId === 'all' ? 'default' : 'outline'"
                    (click)="selectContinent('all')">
                    Всички
                  </button>
                  @for (continent of continents; track continent.id) {
                    <button
                      hlmBtn
                      size="sm"
                      [variant]="selectedContinentId === continent.id ? 'default' : 'outline'"
                      (click)="selectContinent(continent.id)">
                      {{ continent.label }}
                    </button>
                  }
                </div>
              </div>

              <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
                @if (summary) {
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div class="rounded-xl border border-border bg-muted/20 p-3">
                        <div class="text-xs uppercase tracking-wide text-muted-foreground">Гласували</div>
                        <div class="mt-1 text-2xl font-semibold">{{ summary.voted | number }}</div>
                      </div>
                      <div class="rounded-xl border border-border bg-muted/20 p-3">
                        <div class="text-xs uppercase tracking-wide text-muted-foreground">Секции</div>
                        <div class="mt-1 text-2xl font-semibold">{{ summary.sections.length | number }}</div>
                      </div>
                      <div class="rounded-xl border border-border bg-muted/20 p-3">
                        <div class="text-xs uppercase tracking-wide text-muted-foreground">Държави</div>
                        <div class="mt-1 text-2xl font-semibold">{{ summary.countries.length | number }}</div>
                      </div>
                      <div class="rounded-xl border border-border bg-muted/20 p-3">
                        <div class="text-xs uppercase tracking-wide text-muted-foreground">Градове</div>
                        <div class="mt-1 text-2xl font-semibold">{{ summary.cities.length | number }}</div>
                      </div>
                    </div>

                    <div class="rounded-xl border border-border p-4">
                      <div class="text-sm font-medium text-foreground">Водеща партия</div>
                      @if (summary.leadingParty) {
                        <div class="mt-3 flex items-center justify-between gap-3">
                          <app-party-badge [partyName]="summary.leadingParty.partyName" size="sm"></app-party-badge>
                          <span class="text-sm font-semibold">{{ summary.leadingParty.total | number }}</span>
                        </div>
                      } @else {
                        <p class="mt-2 text-sm text-muted-foreground">Няма налични резултати.</p>
                      }
                    </div>

                    <div class="rounded-xl border border-border p-4">
                      <div class="text-sm font-medium text-foreground">Континенти</div>
                      <div class="mt-3 space-y-2">
                        @for (continent of continents; track continent.id) {
                          <button
                            type="button"
                            class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors"
                            [class.border-primary]="selectedContinentId === continent.id"
                            [class.bg-primary/5]="selectedContinentId === continent.id"
                            [class.border-border]="selectedContinentId !== continent.id"
                            [style.box-shadow]="selectedContinentId === continent.id ? 'inset 3px 0 0 0 ' + getLeadingPartyColor(continent) : null"
                            (click)="selectContinent(continent.id)">
                            <span class="font-medium">{{ continent.label }}</span>
                            <span class="text-sm text-muted-foreground">{{ continent.voted | number }}</span>
                          </button>
                        }
                      </div>
                    </div>

                    <div class="rounded-xl border border-border p-4">
                      <div class="text-sm font-medium text-foreground">Държави</div>
                      <p class="mt-2 text-sm text-muted-foreground">
                        {{ summary.countries.join(', ') || 'Няма налични държави.' }}
                      </p>
                    </div>
                  </div>
                } @else {
                  <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Няма налични данни за чужбина.
                  </div>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class AbroadWorldMapModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  @Input() sections: Section[] = [];
  @Input() partiesById: Record<string, string> = {};
  @Input() loading = false;
  @Input() embedded = false;

  @Output() close = new EventEmitter<void>();

  continents: AbroadContinentAggregate[] = [];
  selectedContinentId: AbroadContinentId | 'all' = 'all';
  summary: AbroadContinentAggregate | null = null;

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private markersLayer?: L.LayerGroup;
  private isDark = false;

  constructor(private themeService: ThemeService) {}

  onBackdropClick(): void {
    if (!this.embedded) {
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
      minZoom: 1.8,
      maxZoom: 6,
      worldCopyJump: false,
    });

    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      noWrap: true,
    });
    this.tileLayer.addTo(this.map);

    this.updateComputedData();
    this.renderMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sections'] || changes['partiesById']) {
      this.updateComputedData();
    }

    if (this.map && (changes['sections'] || changes['partiesById'] || changes['loading'])) {
      this.renderMap();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  selectContinent(continentId: AbroadContinentId | 'all'): void {
    this.selectedContinentId = continentId;
    this.updateSummary();
    this.renderMap();
  }

  getLeadingPartyColor(continent: AbroadContinentAggregate): string {
    return getPartyColor(continent.leadingParty?.partyName, this.isDark);
  }

  private updateComputedData(): void {
    this.continents = aggregateAbroadSectionsByContinent(this.sections, this.partiesById);

    if (
      this.selectedContinentId !== 'all'
      && !this.continents.some((continent) => continent.id === this.selectedContinentId)
    ) {
      this.selectedContinentId = 'all';
    }

    this.updateSummary();
  }

  private updateSummary(): void {
    if (this.selectedContinentId === 'all') {
      this.summary = this.buildAllSummary();
      return;
    }

    this.summary = this.continents.find((continent) => continent.id === this.selectedContinentId) || null;
  }

  private buildAllSummary(): AbroadContinentAggregate | null {
    if (this.continents.every((continent) => continent.sections.length === 0)) {
      return null;
    }

    const partyTotals: Record<string, number> = Object.create(null);
    const countries = new Set<string>();
    const cities = new Set<string>();
    const sections: Section[] = [];
    let total = 0;
    let voted = 0;
    let discardedVotes = 0;
    let noVotes = 0;

    this.continents.forEach((continent) => {
      continent.sections.forEach((section) => sections.push(section));
      continent.countries.forEach((country) => countries.add(country));
      continent.cities.forEach((city) => cities.add(city));
      total += continent.total;
      voted += continent.voted;
      discardedVotes += continent.discardedVotes;
      noVotes += continent.noVotes;
      Object.entries(continent.partyTotals).forEach(([partyId, votes]) => {
        partyTotals[partyId] = (partyTotals[partyId] || 0) + votes;
      });
    });

    const leadingParty = Object.entries(partyTotals)
      .map(([partyId, votes]) => ({
        partyId,
        partyName: this.partiesById[partyId] || partyId,
        total: votes,
      }))
      .sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName, 'bg'))[0];

    return {
      id: 'europe',
      label: 'Всички континенти',
      center: [20, 10],
      sections,
      countries: [...countries].sort((a, b) => a.localeCompare(b, 'bg')),
      cities: [...cities].sort((a, b) => a.localeCompare(b, 'bg')),
      total,
      voted,
      discardedVotes,
      noVotes,
      partyTotals,
      leadingParty,
    };
  }

  private renderMap(): void {
    if (!this.map || this.loading) {
      return;
    }

    this.markersLayer?.removeFrom(this.map);
    this.markersLayer = L.layerGroup();

    const visibleContinents =
      this.selectedContinentId === 'all'
        ? this.continents.filter((continent) => continent.sections.length > 0)
        : this.continents.filter((continent) => continent.id === this.selectedContinentId && continent.sections.length > 0);

    visibleContinents.forEach((continent) => {
      const marker = L.circleMarker(continent.center, {
        radius: this.getMarkerRadius(continent.voted),
        color: this.isDark ? '#0f172a' : '#ffffff',
        weight: 2,
        fillColor: this.getLeadingPartyColor(continent),
        fillOpacity: 0.88,
      });

      marker.bindTooltip(
        `<strong>${continent.label}</strong><br/>Гласували: ${continent.voted.toLocaleString('bg-BG')}<br/>Водеща партия: ${continent.leadingParty?.partyName || 'Няма данни'}`,
        { sticky: true }
      );
      marker.on('click', () => this.selectContinent(continent.id));
      marker.addTo(this.markersLayer!);
    });

    this.markersLayer.addTo(this.map);

    requestAnimationFrame(() => {
      this.map?.invalidateSize();
      if (visibleContinents.length === 1) {
        this.map?.setView(visibleContinents[0].center, 3);
      } else {
        this.map?.setView([24, 12], 2);
      }
    });
  }

  private getMarkerRadius(voted: number): number {
    if (voted <= 0) {
      return 10;
    }

    return Math.max(10, Math.min(28, 8 + Math.sqrt(voted) / 4));
  }
}
