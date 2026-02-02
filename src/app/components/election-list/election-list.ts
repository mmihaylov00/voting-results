import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Region, Section, PartyVotes } from '../../models/election.models';
import { getPartyAlias } from '../../utils/party-aliases';
import { formatActivity, getPartyKeywords, findPartyByKeywords } from '../../utils/common.utils';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardContentDirective,
  HlmCardDirective,
  HlmCardDescriptionDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
} from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';

interface ElectionData {
  date: string;
  name: string;
  totalElectors: number;
  totalVoted: number;
  avgActivity: number;
  topParties: { name: string; total: number; percent: number }[];
}

@Component({
  selector: 'app-election-list',
  host: {
    '(document:click)': 'closeHistoricalPartyFilter()'
  },
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
    HighchartsChartComponent,
  ],
  templateUrl: './election-list.html',
  styleUrl: './election-list.scss',
})
export class ElectionListComponent implements OnInit {
  dates: { date: string; name: string }[] = [];
  electionsData: Map<string, ElectionData> = new Map();
  loading$: any;

  // Historical trends properties
  Highcharts: typeof Highcharts = Highcharts;
  level = signal<'national' | 'region'>('national');
  selectedRegionId = signal<string>('');
  regions: { id: string, name: string }[] = [];
  chartOptions: Highcharts.Options = {};
  percentChartOptions: Highcharts.Options = {};
  allData: { [date: string]: any } = {};
  
  // Historical charts multiselect
  selectedHistoricalPartyIds = signal<Set<string>>(new Set());
  showHistoricalPartyFilter = signal<boolean>(false);
  allParties: { id: string, name: string }[] = [];
  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

  constructor(
    private electionService: ElectionService,
    private themeService: ThemeService
  ) {
    this.loading$ = this.electionService.loading$;
    this.dates = this.electionService.getDates();

    effect(() => {
      this.themeService.darkMode();
      this.level();
      this.selectedRegionId();
      this.selectedHistoricalPartyIds();
      if (Object.keys(this.allData).length > 0) {
        this.updateHistoricalCharts();
      }
    });
  }

  ngOnInit(): void {
    // Load all election data when site opens
    this.loadAllElectionsData();
    
    // Load historical trends data
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      
      // Collect all unique parties across all dates
      const allPartiesMap = new Map<string, string>();
      Object.values(data).forEach((electionData: any) => {
        if (electionData.parties) {
          Object.entries(electionData.parties).forEach(([id, name]) => {
            if (!allPartiesMap.has(id)) {
              allPartiesMap.set(id, name as string);
            }
          });
        }
      });
      this.allParties = Array.from(allPartiesMap.entries()).map(([id, name]) => ({ id, name }));
      
      // Initialize default historical party selection
      const defaultIds = new Set<string>();
      this.allParties.forEach(party => {
        if (this.DEFAULT_KEYWORDS.some(k => party.name.toUpperCase().includes(k))) {
          defaultIds.add(party.id);
        }
      });
      this.selectedHistoricalPartyIds.set(defaultIds);
      
      this.updateHistoricalCharts();
    });

    // Load regions from the latest election to populate the dropdown
    if (this.dates.length > 0) {
      this.electionService.getRegions(this.dates[0].date).subscribe(regions => {
        this.regions = regions.map(r => ({ id: r.id, name: r.name }));
      });
    }
  }

  loadAllElectionsData(): void {
    this.dates.forEach(dateObj => {
      // Load both regions and parties to get party names
      this.electionService.getRegions(dateObj.date).subscribe(regions => {
        this.electionService.getParties(dateObj.date).subscribe(parties => {
          const electionData = this.calculateElectionStats(regions, parties, dateObj.date);
          this.electionsData.set(dateObj.date, electionData);
        });
      });
    });
  }

  calculateElectionStats(regions: Region[], parties: { [id: string]: string }, date: string): ElectionData {
    const totalElectors = regions.reduce((sum, r) => sum + r.total, 0);
    const totalVoted = regions.reduce((sum, r) => sum + r.voted, 0);
    const avgActivity = totalElectors > 0 ? totalVoted / totalElectors : 0;

    // Aggregate party votes across all regions
    const partyVotes: { [partyId: string]: number } = {};
    regions.forEach(region => {
      Object.entries(region.partyVotes).forEach(([partyId, votes]) => {
        partyVotes[partyId] = (partyVotes[partyId] || 0) + (votes as number);
      });
    });

    // Get top 3 parties with names
    const topParties = Object.entries(partyVotes)
      .filter(([pid, _]) => pid !== '0')
      .map(([partyId, total]) => {
        let name = parties[partyId] || partyId;
        // Normalize PP-DB name
        if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
          name = 'ПП-ДБ';
        }
        return {
          name,
          total,
          percent: totalVoted > 0 ? total / totalVoted : 0
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return {
      date,
      name: this.dates.find(d => d.date === date)?.name || date,
      totalElectors,
      totalVoted,
      avgActivity,
      topParties
    };
  }

  getElectionData(date: string): ElectionData | undefined {
    return this.electionsData.get(date);
  }

  formatActivity = formatActivity;
  getPartyAlias = getPartyAlias;
  getPartyKeywords = getPartyKeywords;
  findPartyByKeywords = findPartyByKeywords;

  toggleHistoricalPartyFilter(event: Event) {
    event.stopPropagation();
    this.showHistoricalPartyFilter.set(!this.showHistoricalPartyFilter());
  }

  closeHistoricalPartyFilter() {
    this.showHistoricalPartyFilter.set(false);
  }

  toggleHistoricalPartySelection(partyId: string) {
    const current = new Set(this.selectedHistoricalPartyIds());
    if (current.has(partyId)) {
      current.delete(partyId);
    } else {
      current.add(partyId);
    }
    this.selectedHistoricalPartyIds.set(current);
  }

  updateHistoricalCharts() {
    const level = this.level();
    const regionId = this.selectedRegionId();
    const selectedIds = this.selectedHistoricalPartyIds();

    const categories: string[] = [];
    const colorPalette = [
      '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    // Sort dates ascending for the chart
    const sortedDates = [...this.dates].sort((a, b) => a.date.localeCompare(b.date));

    // Build mapping: selected party ID -> keywords -> party data across elections
    const partyDataMap: { [selectedId: string]: { keywords: string[], name: string, votesData: number[], percentData: number[] } } = {};
    
    // Initialize data structure for each selected party
    selectedIds.forEach(partyId => {
      const party = this.allParties.find(p => p.id === partyId);
      if (party) {
        const keywords = this.getPartyKeywords(party.name);
        partyDataMap[partyId] = {
          keywords,
          name: getPartyAlias(party.name),
          votesData: [],
          percentData: []
        };
      }
    });

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      let totalVoted = 0;
      const datePartyVotes: { [partyId: string]: number } = {};

      if (level === 'national') {
        data.regions.forEach((r: Region) => {
          totalVoted += r.voted;
          Object.entries(r.partyVotes).forEach(([pid, v]) => {
            datePartyVotes[pid] = (datePartyVotes[pid] || 0) + (v as number);
          });
        });
      } else if (level === 'region' && regionId) {
        const region = data.regions.find((r: Region) => r.id === regionId);
        if (region) {
          totalVoted = region.voted;
          Object.entries(region.partyVotes).forEach(([pid, v]) => {
            datePartyVotes[pid] = v as number;
          });
        }
      }

      // Match selected parties by keywords and store data
      selectedIds.forEach(selectedId => {
        const partyInfo = partyDataMap[selectedId];
        if (!partyInfo) return;

        // Find matching party ID in this election by keywords
        const matchingPartyId = this.findPartyByKeywords(partyInfo.keywords, data.parties);
        const votes = matchingPartyId ? (datePartyVotes[matchingPartyId] || 0) : 0;
        
        partyInfo.votesData.push(votes);
        const percent = totalVoted > 0 ? (votes / totalVoted) * 100 : 0;
        partyInfo.percentData.push(Math.round(percent * 100) / 100);
      });
    });

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    // Build series for votes chart
    const votesSeries: any[] = [];
    const sortedPartyIds = Array.from(selectedIds).sort();
    sortedPartyIds.forEach((partyId, idx) => {
      const partyInfo = partyDataMap[partyId];
      if (partyInfo) {
        votesSeries.push({
          id: `historical-votes-${partyId}`,
          name: partyInfo.name,
          data: partyInfo.votesData,
          type: 'line',
          color: colorPalette[idx % colorPalette.length]
        });
      }
    });

    // Build series for percent chart
    const percentSeries: any[] = [];
    sortedPartyIds.forEach((partyId, idx) => {
      const partyInfo = partyDataMap[partyId];
      if (partyInfo) {
        percentSeries.push({
          id: `historical-percent-${partyId}`,
          name: partyInfo.name,
          data: partyInfo.percentData,
          type: 'line',
          color: colorPalette[idx % colorPalette.length]
        });
      }
    });

    this.chartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой гласове', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Гласове', style: { color: textColor } }, labels: { style: { color: textColor } } },
      legend: {
        itemStyle: { color: textColor }
      },
      series: votesSeries,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.percentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процентна подкрепа', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Процент (%)', style: { color: textColor } }, labels: { style: { color: textColor } }, min: 0, max: 100 },
      legend: {
        itemStyle: { color: textColor }
      },
      series: percentSeries,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%', valueDecimals: 2 }
    };
  }
}
