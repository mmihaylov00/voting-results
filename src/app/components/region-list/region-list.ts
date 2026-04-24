import { Component, OnInit, effect, signal, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Region, Section } from '../../models/election.models';
import { getPartyAlias } from '../../utils/party-aliases';
import { getPartyColor } from '../../utils/party-colors';
import { formatActivity, formatRegionName, getDefaultPartyIds, toBp } from '../../utils/common.utils';
import { getCikUrl } from '../../utils/election-links';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardDescriptionDirective, HlmCardContentDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { PartyFilterComponent } from '../election-detail/party-filter/party-filter';
import { StatCardComponent } from '../ui/stat-card/stat-card';
import { SearchFilterComponent } from '../ui/search-filter/search-filter';
import { PartyBadgeComponent } from '../ui/party-badge/party-badge';
import { SettlementMapComponent } from '../ui/settlement-map/settlement-map';
import { AbroadMapComponent } from '../ui/abroad-map/abroad-map';
import { AbroadCityAggregate, AbroadCountryAggregate } from '../../utils/abroad-map.util';
import { SettlementAggregate, aggregateSectionsBySettlement, SettlementMapMetric } from '../../utils/settlement-map.util';

@Component({
  selector: 'app-region-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
    HlmTooltipDirective,
    HighchartsChartComponent,
    PartyFilterComponent,
    StatCardComponent,
    SearchFilterComponent,
    PartyBadgeComponent,
    SettlementMapComponent,
    AbroadMapComponent,
  ],
  templateUrl: './region-list.html'
})
export class RegionListComponent implements OnInit, AfterViewInit {
  @ViewChild('partyChart', { static: false }) partyChartComponent?: HighchartsChartComponent;
  date: string = '';
  dateName: string = '';
  regions: Region[] = [];
  filteredRegions: Region[] = [];
  searchTerm: string = '';
  loading$: Observable<boolean>;

  totalElectors: number = 0;
  totalVoted: number = 0;
  totalInvalid: number = 0;
  totalNoVotes: number = 0;
  avgActivity: number = 0;
  totalMachine: number = 0;
  totalPaper: number = 0;
  globalComparisons: { [key: string]: any[] } = {};

  activityChartOptions: Highcharts.Options = {};
  partyChartOptions: Highcharts.Options = {};

  activeChart = signal<'activity' | 'party'>('activity');
  overviewMode = signal<'cards' | 'map'>('cards');
  mapMode = signal<'bulgaria' | 'world'>('bulgaria');
  allParties: { id: string, name: string }[] = [];
  selectedPartyIds = signal<Set<string>>(new Set());
  settlementMapMetric = signal<SettlementMapMetric>('leading-party');
  mapSelectedPartyId = signal<string | null>(null);
  mapSectionsLoaded = false;
  mapSections: Section[] = [];
  settlementMapData: SettlementAggregate[] = [];
  abroadSections: Section[] = [];
  isWorldMapLoading = signal(false);
  getCikUrl = () => getCikUrl(this.date);

  get regionalStats(): { id: string, name: string, total: number }[] {
    const votesMap = this.partyVotesMap;
    return this.allParties
      .map(p => ({
        id: p.id,
        name: p.name,
        total: votesMap[p.id] || 0
      }))
      .filter(p => p.total > 0 || this.selectedPartyIds().has(p.id))
      .sort((a, b) => b.total - a.total);
  }

  get partiesById(): { [id: string]: string } {
    return this.allParties.reduce((acc, party) => {
      acc[party.id] = party.name;
      return acc;
    }, {} as { [id: string]: string });
  }

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService,
    private router: Router,
    public themeService: ThemeService
  ) {
    this.loading$ = this.electionService.loading$;

    effect(() => {
      // Re-calculate charts options when theme or selected parties change
      this.themeService.darkMode();
      this.selectedPartyIds();
      if (this.regions.length > 0) {
        this.updateCharts();
      }
    });
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.date = params['date'];
      this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;
      if (this.date) {
        this.loadRegions();
        this.loadParties();
      }
    });
  }

  loadParties() {
    this.electionService.getParties(this.date).subscribe(partiesMap => {
      this.allParties = Object.entries(partiesMap)
        .map(([id, name]) => ({ id, name }))
        .filter(p => p.id !== '0')
        .sort((a, b) => {
          const numA = parseInt(a.id);
          const numB = parseInt(b.id);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.id.localeCompare(b.id);
        });

      // Apply default selection based on keywords
      this.selectedPartyIds.set(getDefaultPartyIds(this.allParties));
      this.updateSettlementMapData();
    });
  }

  loadRegions() {
    this.electionService.getRegions(this.date).subscribe(regions => {
      this.regions = regions;
      this.calculateGlobalStats();
      this.applyFilter();
      this.updateCharts();
    });
  }

  private calculateGlobalStats() {
    const officialTotalElectors = this.electionService.getOfficialNationalElectors(this.date);
    const aggregatedTotalElectors = this.regions.reduce((sum, r) => sum + r.total, 0);

    this.totalElectors = officialTotalElectors ?? aggregatedTotalElectors;
    this.totalVoted = this.regions.reduce((sum, r) => sum + r.voted, 0);
    this.totalInvalid = this.regions.reduce((sum, r) => sum + (r.discardedVotes || 0), 0);
    this.totalNoVotes = this.regions.reduce((sum, r) => sum + (r.noVotes || 0), 0);
    this.totalMachine = this.regions.reduce((sum, r) => sum + (r.totalMachine || 0), 0);
    this.totalPaper = this.regions.reduce((sum, r) => sum + (r.totalPaper || 0), 0);
    this.avgActivity = this.totalElectors > 0 ? this.totalVoted / this.totalElectors : 0;

    // Aggregate comparisons for global stats
    this.globalComparisons = {};
    if (this.regions.length > 0 && this.regions[0].comparisons) {
      Object.keys(this.regions[0].comparisons).forEach(key => {
        const aggregated: { [date: string]: { value: number } } = {};
        this.regions.forEach(r => {
          r.comparisons?.[key]?.forEach(c => {
            if (!aggregated[c.d]) {
              aggregated[c.d] = { value: 0 };
            }
            aggregated[c.d].value += c.v;
          });
        });
        this.globalComparisons[key] = Object.entries(aggregated).map(([date, data]) => ({
          d: date,
          v: data.value
        }));
      });

      // Special handling for avg activity percent
      const electorsAggr: { [date: string]: number } = {};
      const votedAggr: { [date: string]: number } = {};
      this.regions.forEach(r => {
        r.comparisons?.['total']?.forEach(c => electorsAggr[c.d] = (electorsAggr[c.d] || 0) + c.v);
        r.comparisons?.['voted']?.forEach(c => votedAggr[c.d] = (votedAggr[c.d] || 0) + c.v);
      });

      for (const date of Object.keys(electorsAggr)) {
        electorsAggr[date] = this.electionService.getOfficialNationalElectors(date) ?? electorsAggr[date];
      }

      if (this.globalComparisons['total']) {
        this.globalComparisons['total'] = this.globalComparisons['total'].map(entry => ({
          ...entry,
          v: this.electionService.getOfficialNationalElectors(entry.d) ?? entry.v,
        }));
      }

      this.globalComparisons['activityPercent'] = Object.keys(electorsAggr).map(date => ({
        d: date,
        v: electorsAggr[date] > 0 ? Math.round((votedAggr[date] / electorsAggr[date]) * 10000) : 0
      }));
    }
  }

  onPartySelectionChange(selectedIds: Set<string>): void {
    this.selectedPartyIds.set(selectedIds);
  }

  setOverviewMode(mode: 'cards' | 'map'): void {
    const wasMapMode = this.overviewMode() === 'map';
    this.overviewMode.set(mode);
    if (mode === 'map') {
      if (!wasMapMode) {
        this.mapMode.set('bulgaria');
      }
      this.loadMapSectionsIfNeeded();
    }
  }

  openWorldMap(): void {
    this.overviewMode.set('map');
    this.mapMode.set('world');
    this.loadMapSectionsIfNeeded();
    this.loadAbroadSectionsIfNeeded();
  }

  showBulgariaMap(): void {
    this.mapMode.set('bulgaria');
  }

  private loadAbroadSectionsIfNeeded(): void {
    if (this.abroadSections.length > 0 || this.isWorldMapLoading()) {
      return;
    }

    this.isWorldMapLoading.set(true);
    this.electionService.getSections(this.date, '32', true).subscribe({
      next: (sections) => {
        this.abroadSections = sections;
        this.isWorldMapLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading abroad sections:', error);
        this.isWorldMapLoading.set(false);
      },
    });
  }

  ngAfterViewInit() {
    // Chart component is now available
  }


  get partyVotesMap(): { [partyId: string]: number } {
    const votesMap: { [partyId: string]: number } = {};
    this.regions.forEach(region => {
      Object.entries(region.partyVotes).forEach(([partyId, votes]) => {
        votesMap[partyId] = (votesMap[partyId] || 0) + (votes as number);
      });
    });
    return votesMap;
  }

  updateCharts() {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';
    const categories = this.regions.map(r => this.formatRegionName(r.name));

    // 1. Combined Activity and Not Voted Chart (100% stacked)
    const activityData = this.regions.map(r => r.total > 0 ? (r.voted / r.total) * 100 : 0);
    const notVotedData = this.regions.map(r => r.total > 0 ? ((r.total - r.voted) / r.total) * 100 : 0);

    this.activityChartOptions = {
      chart: { type: 'column', backgroundColor: 'transparent', height: 300 },
      title: { text: 'Активност и негласували по райони (%)', style: { color: textColor, fontSize: '14px' } },
      xAxis: { categories, labels: { style: { color: textColor, fontSize: '10px' }, rotation: -45 } },
      yAxis: {
        title: { text: 'Процент (%)', style: { color: textColor } },
        labels: { style: { color: textColor }, format: '{value}%' },
        min: 0,
        max: 100
      },
      legend: {
        enabled: true,
        itemStyle: { color: textColor, fontSize: '11px' },
        itemMarginBottom: 4,
        symbolHeight: 10,
        symbolWidth: 10,
        symbolRadius: 2
      },
      tooltip: {
        shared: true,
        pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>{point.y:.2f}%</b><br/>',
        footerFormat: '<b>Общо: 100%</b>'
      },
      plotOptions: {
        column: {
          stacking: 'percent',
          dataLabels: {
            enabled: false
          }
        }
      },
      series: [
        {
          name: 'Негласували',
          data: notVotedData,
          type: 'column',
          color: '#ef4444' // Red for not voted
        },
        {
          name: 'Активност',
          data: activityData,
          type: 'column',
          color: '#10b981' // Green for activity
        },
      ],
      credits: { enabled: false }
    };

    // 2. Party Votes Chart - Multiple series for selected parties
    const selectedIds = this.selectedPartyIds();
    const series: any[] = [];

    if (selectedIds.size > 0) {
      // Sort selected IDs to ensure consistent color assignment
      const sortedIds = Array.from(selectedIds).sort();
      sortedIds.forEach(partyId => {
        const party = this.allParties.find(p => p.id === partyId);
        if (party) {
          // Use party index in allParties for consistent color, not selection order
          const partyIndex = this.allParties.findIndex(p => p.id === partyId);
          const partyData = this.regions.map(r => {
            const votes = r.partyVotes[partyId] || 0;
            return r.voted > 0 ? (votes / r.voted) * 100 : 0;
          });
          // Create completely new objects for each series
          series.push({
            id: `party-${partyId}`, // Unique ID for each series
            name: getPartyAlias(party.name),
            data: partyData.map(v => v), // New array with new number references
            type: 'column',
            color: getPartyColor(party.name, isDark)
          });
        }
      });
    }

    // Create a completely new options object - assign to a new variable first to ensure new reference
    const newOptions: Highcharts.Options = {
      chart: { type: 'column', backgroundColor: 'transparent', height: 600 },
      title: { text: 'Гласове за партии (%)', style: { color: textColor, fontSize: '14px' } },
      xAxis: { categories: [...categories], labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Процент (%)', style: { color: textColor } },
        labels: { style: { color: textColor } },
        min: 0,
        max: 100
      },
      legend: {
        itemStyle: { color: textColor, fontSize: '11px' },
        itemMarginBottom: 4,
        symbolHeight: 10,
        symbolWidth: 10,
        symbolRadius: 2
      },
      tooltip: {
        shared: true,
        pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>{point.y:.2f}%</b><br/>'
      },
      plotOptions: {
        column: {
          dataLabels: {
            enabled: false
          }
        }
      },
      series: series.length > 0 ? series : [{ type: 'column', data: [], name: '', id: 'empty' }], // Always have at least one series to avoid issues
      credits: { enabled: false }
    };

    // Only assign if we have series, otherwise set to empty
    if (series.length > 0) {
      this.partyChartOptions = newOptions;
    } else {
      // Create empty chart options
      this.partyChartOptions = {
        ...newOptions,
        series: []
      };
    }

  }

  private createBaseChartOptions(title: string, categories: string[], data: number[], textColor: string, format: string): Highcharts.Options {
    return {
      chart: { type: 'column', backgroundColor: 'transparent', height: 300 },
      title: { text: title, style: { color: textColor, fontSize: '14px' } },
      xAxis: { categories, labels: { style: { color: textColor, fontSize: '10px' }, rotation: -45 } },
      yAxis: { title: { text: '' }, labels: { style: { color: textColor } } },
      legend: { enabled: false },
      credits: { enabled: false },
      tooltip: { pointFormat: `<b>${format}</b>` },
      series: [{ name: 'Стойност', data, color: '#eab308' }] as any
    };
  }

  applyFilter() {
    if (!this.searchTerm) {
      this.filteredRegions = this.regions;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredRegions = this.regions.filter(r =>
        r.name.toLowerCase().includes(term) || r.id.includes(term)
      );
    }
  }

  formatActivity = formatActivity;
  formatRegionName = formatRegionName;
  getPartyAlias = getPartyAlias;
  toBp = toBp;

  private loadMapSectionsIfNeeded(): void {
    if (this.mapSectionsLoaded || !this.date) return;

    this.electionService.getSections(this.date).subscribe((sections) => {
      this.mapSections = sections;
      this.mapSectionsLoaded = true;
      this.updateSettlementMapData();
    });
  }

  private updateSettlementMapData(): void {
    if (!this.mapSectionsLoaded) return;

    const partiesById = this.allParties.reduce((acc, party) => {
      acc[party.id] = party.name;
      return acc;
    }, {} as { [id: string]: string });

    this.settlementMapData = aggregateSectionsBySettlement(this.mapSections, partiesById);
  }

  onSettlementSelect(settlement: SettlementAggregate): void {
    this.router.navigate(['/election', this.date, 'region', settlement.regionId]);
  }

  onAbroadCitySelect(_city: AbroadCityAggregate): void {
    this.router.navigate(['/election', this.date, 'region', '32']);
  }

  onAbroadCountrySelect(_country: AbroadCountryAggregate): void {
    this.router.navigate(['/election', this.date, 'region', '32']);
  }

  setSettlementMapMetric(metric: SettlementMapMetric): void {
    this.settlementMapMetric.set(metric);
    if (metric === 'party-votes' && !this.mapSelectedPartyId()) {
      // Prefer ПП-ДБ as default, otherwise pick first party
      const stats = this.regionalStats;
      if (stats.length > 0) {
        const ppdb = stats.find(s => s.name.toUpperCase().includes('ПП-ДБ') || s.name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ'));
        this.mapSelectedPartyId.set(ppdb ? ppdb.id : stats[0].id);
      }
    }
  }

  setMapSelectedPartyId(partyId: string): void {
    this.mapSelectedPartyId.set(partyId);
    this.settlementMapMetric.set('party-votes');
  }

  asSet(val: string | null): Set<string> {
    return val ? new Set([val]) : new Set();
  }

  asArray(val: Set<string>): string[] {
    return Array.from(val);
  }
}
