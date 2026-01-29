import { Component, OnInit, effect, signal, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Region } from '../../models/election.models';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardDescriptionDirective, HlmCardContentDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';

@Component({
  selector: 'app-region-list',
  standalone: true,
  host: {
    '(document:click)': 'closePartyFilter()'
  },
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmInputDirective,
    HlmTypographyDirective,
    HlmTooltipDirective,
    HighchartsChartComponent
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
  notVotedChartOptions: Highcharts.Options = {};

  activeChart = signal<'activity' | 'party' | 'notVoted'>('activity');
  allParties: { id: string, name: string }[] = [];
  selectedPartyIds = signal<Set<string>>(new Set());
  showPartyFilter: boolean = false;
  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

  getCikUrl(): string {
    if (this.date.startsWith('2023.04')) return 'https://results.cik.bg/ns2023/search/index.html#';
    if (this.date.startsWith('2024.06')) return 'https://results.cik.bg/europe2024/search/index.html';
    if (this.date.startsWith('2024.10')) return 'https://results.cik.bg/pe202410/search/index.html';
    return '';
  }

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService,
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
      const defaultIds = new Set<string>();
      this.allParties.forEach(party => {
        const name = party.name.toUpperCase();
        if (this.DEFAULT_KEYWORDS.some(k => name.includes(k))) {
          defaultIds.add(party.id);
        }
      });
      this.selectedPartyIds.set(defaultIds);
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
    this.totalElectors = this.regions.reduce((sum, r) => sum + r.total, 0);
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
        const aggregated: { [date: string]: { value: number, dateName: string } } = {};
        this.regions.forEach(r => {
          r.comparisons?.[key]?.forEach(c => {
            if (!aggregated[c.date]) {
              aggregated[c.date] = { value: 0, dateName: c.dateName };
            }
            aggregated[c.date].value += c.value;
          });
        });
        this.globalComparisons[key] = Object.entries(aggregated).map(([date, data]) => ({
          date,
          dateName: data.dateName,
          value: data.value
        }));
      });

      // Special handling for avg activity percent
      const electorsAggr: { [date: string]: number } = {};
      const votedAggr: { [date: string]: number } = {};
      this.regions.forEach(r => {
        r.comparisons?.['total']?.forEach(c => electorsAggr[c.date] = (electorsAggr[c.date] || 0) + c.value);
        r.comparisons?.['voted']?.forEach(c => votedAggr[c.date] = (votedAggr[c.date] || 0) + c.value);
      });

      this.globalComparisons['activityPercent'] = Object.keys(electorsAggr).map(date => ({
        date,
        dateName: this.regions[0].comparisons?.['total']?.find(c => c.date === date)?.dateName || date,
        value: electorsAggr[date] > 0 ? votedAggr[date] / electorsAggr[date] : 0
      }));
    }
  }

  togglePartyFilter(event: Event) {
    event.stopPropagation();
    this.showPartyFilter = !this.showPartyFilter;
  }

  closePartyFilter() {
    this.showPartyFilter = false;
  }

  togglePartySelection(partyId: string): void {
    const current = new Set(this.selectedPartyIds());
    if (current.has(partyId)) {
      current.delete(partyId);
    } else {
      current.add(partyId);
    }
    this.selectedPartyIds.set(current);
  }

  ngAfterViewInit() {
    // Chart component is now available
  }


  get filteredAllParties(): { id: string, name: string, votes: number }[] {
    // Calculate total votes per party across all regions
    const partyVotesMap = new Map<string, number>();
    this.regions.forEach(region => {
      Object.entries(region.partyVotes).forEach(([partyId, votes]) => {
        const currentVotes = partyVotesMap.get(partyId) || 0;
        partyVotesMap.set(partyId, currentVotes + (votes as number));
      });
    });

    return this.allParties.map(p => ({
      ...p,
      votes: partyVotesMap.get(p.id) || 0
    }));
  }

  updateCharts() {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';
    const categories = this.regions.map(r => this.formatRegionName(r.name));

    // 1. Activity Chart
    const activityData = this.regions.map(r => r.total > 0 ? (r.voted / r.total) * 100 : 0);
    this.activityChartOptions = this.createBaseChartOptions('Активност по райони (%)', categories, activityData, textColor, '{point.y:.2f}%');

    // 2. Party Votes Chart - Multiple series for selected parties
    const selectedIds = this.selectedPartyIds();
    const series: any[] = [];
    
    // Define a color palette for consistent colors
    const colorPalette = [
      '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

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
            name: party.name,
            data: partyData.map(v => v), // New array with new number references
            type: 'column',
            color: colorPalette[partyIndex % colorPalette.length] // Assign color based on party position, not selection order
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

    // 3. Not Voted Chart
    const notVotedData = this.regions.map(r => r.total > 0 ? ((r.total - r.voted) / r.total) * 100 : 0);
    this.notVotedChartOptions = this.createBaseChartOptions('Негласували по райони (%)', categories, notVotedData, textColor, '{point.y:.2f}%');
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

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
  }

  formatRegionName(name: string): string {
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[1].trim().toUpperCase();
    }
    return name.toUpperCase();
  }
}
