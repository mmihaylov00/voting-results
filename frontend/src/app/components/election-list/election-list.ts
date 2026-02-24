import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { APP_ROLE } from '@votes/shared';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { ElectionsManageService } from '../../services/elections-manage.service';
import { Region, Section, PartyVotes } from '../../models/election.models';
import { getPartyAlias } from '../../utils/party-aliases';
import { formatActivity, getPartyKeywords, findPartyByKeywords, getDefaultPartyIds } from '../../utils/common.utils';
import { getPartyColor } from '../../utils/party-colors';
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
import { PartyFilterComponent } from '../election-detail/party-filter/party-filter';
import { PartyBadgeComponent } from '../ui/party-badge/party-badge';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';

interface ElectionData {
  date: string;
  name: string;
  hasData: boolean;
  totalElectors: number;
  totalVoted: number;
  avgActivity: number;
  topParties: { name: string; total: number; percent: number }[];
}

@Component({
  selector: 'app-election-list',
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
    PartyFilterComponent,
    PartyBadgeComponent,
    BaseModalComponent,
    HlmInputDirective,
  ],
  templateUrl: './election-list.html',
})
export class ElectionListComponent implements OnInit {
  dates: { id?: string; date: string; name: string }[] = [];
  electionsData: Map<string, ElectionData> = new Map();
  loading$: any;
  createModalOpen = signal(false);
  createError = signal<string | null>(null);
  deletingDate = signal<string | null>(null);
  form = { date: '' };

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
  allParties: { id: string, name: string }[] = [];

  constructor(
    private electionService: ElectionService,
    private themeService: ThemeService,
    private authService: AuthService,
    private electionsManageService: ElectionsManageService,
  ) {
    this.loading$ = this.electionService.loading$;
    this.electionService.dates$.subscribe((dates) => {
      this.dates = dates;
      if (dates.length > 0) {
        this.loadAllElectionsData();
        this.electionService.getRegions(dates[0].date).subscribe(regions => {
          this.regions = regions.map(r => ({ id: r.id, name: r.name }));
        });
      }
    });

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

  isAdmin(): boolean {
    return this.authService.hasRole(APP_ROLE.ADMIN);
  }

  openCreateModal(): void {
    this.form = { date: '' };
    this.createError.set(null);
    this.createModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
  }

  canSubmitCreate(): boolean {
    return !!this.toApiDate(this.form.date);
  }

  createElection(): void {
    const formattedDate = this.toApiDate(this.form.date);
    if (!formattedDate) {
      this.createError.set('Изберете валидна дата.');
      return;
    }
    this.createError.set(null);
    this.electionsManageService.create({ date: formattedDate }).subscribe({
      next: () => {
        this.createModalOpen.set(false);
        this.reloadDates();
      },
      error: (err) => this.createError.set(err?.error?.message || 'Неуспешно създаване.'),
    });
  }

  removeElection(date: { id?: string; date: string }): void {
    if (!this.isAdmin() || !date.id) return;
    if (!confirm('Сигурни ли сте, че искате да изтриете изборите?')) return;
    this.deletingDate.set(date.date);
    this.electionsManageService.remove(date.id).subscribe({
      next: () => {
        this.deletingDate.set(null);
        this.reloadDates();
      },
      error: () => {
        this.deletingDate.set(null);
      },
    });
  }

  private reloadDates(): void {
    this.electionsData.clear();
    this.electionService.refreshDates().subscribe(() => {
      this.loadAllElectionsData();
    });
  }

  private toApiDate(value: string): string | null {
    if (!value) return null;
    const date = value.trim();
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.replaceAll('-', '.');
    return null;
  }

  ngOnInit(): void {
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
      this.selectedHistoricalPartyIds.set(getDefaultPartyIds(this.allParties));

      this.updateHistoricalCharts();
    });

  }

  loadAllElectionsData(): void {
    this.dates.forEach(dateObj => {
      this.electionService.getSummary(dateObj.date).subscribe({
        next: ({ regions, parties }) => {
          const electionData = this.calculateElectionStats(regions, parties, dateObj.date);
          this.electionsData.set(dateObj.date, electionData);
        },
        error: () => {
          this.electionsData.set(dateObj.date, {
            date: dateObj.date,
            name: dateObj.name,
            hasData: false,
            totalElectors: 0,
            totalVoted: 0,
            avgActivity: 0,
            topParties: [],
          });
        },
      });
    });
  }

  calculateElectionStats(regions: Region[], parties: { [id: string]: string }, date: string): ElectionData {
    const hasData = Array.isArray(regions) && regions.length > 0;
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
      hasData,
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

  onHistoricalPartySelectionChange(selectedIds: Set<string>): void {
    this.selectedHistoricalPartyIds.set(selectedIds);
  }

  updateHistoricalCharts() {
    const level = this.level();
    const regionId = this.selectedRegionId();
    const selectedIds = this.selectedHistoricalPartyIds();

    const categories: string[] = [];
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
          color: getPartyColor(partyInfo.name, isDark)
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
          color: getPartyColor(partyInfo.name, isDark)
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
