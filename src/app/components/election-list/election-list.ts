import { SelectComponent } from '../ui/select/select';
import { partyVoteTotals } from '../../utils/party-order.util';
import { Component, DestroyRef, OnInit, signal, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, finalize } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { Region } from '../../models/election.models';
import { getPartyAlias } from '../../utils/party-aliases';
import { getPresidentialCandidateName } from '../../utils/candidate-label';
import { contestantIdentity, matchContestantId } from '../../utils/contestant-profile.util';
import { formatActivity, getPartyKeywords, findPartyByKeywords, getDefaultPartyIds } from '../../utils/common.utils';
import { getPartyColor, getPartyLegendIndex } from '../../utils/party-colors';
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
import { ContestantDetailModalComponent } from '../contestant-detail-modal/contestant-detail-modal';
import { ContestantPreviewDirective } from '../ui/contestant-preview/contestant-preview.directive';

interface ElectionData {
  date: string;
  name: string;
  totalElectors: number;
  totalVoted: number;
  avgActivity: number;
  topParties: { partyId: string; name: string; total: number; percent: number }[];
}

@Component({
  selector: 'app-election-list',
  imports: [SelectComponent,
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
    ContestantDetailModalComponent,
    ContestantPreviewDirective,
  ],
  templateUrl: './election-list.html',
  styleUrl: './election-list.scss',
})
export class ElectionListComponent implements OnInit {
  readonly modalPages = inject(ModalPageService);
  private readonly destroyRef = inject(DestroyRef);
  get electionType() { return this.electionService.electionType; }

  dates: { date: string; name: string; provisional?: { processedPercent: number } }[] = [];
  electionsData: Map<string, ElectionData> = new Map();
  private readonly pageLoading = new BehaviorSubject(false);
  readonly loading$ = this.pageLoading.asObservable();
  readonly loadError = signal('');
  readonly selectedContestant = signal<{ partyName: string; partyId?: string; date: string } | null>(null);

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
  private readonly topHistoricalCandidateIds = new Map<string, Set<string>>();

  constructor(
    private electionService: ElectionService,
    private themeService: ThemeService
  ) {
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
    this.loadAllElectionsData();
  }

  loadAllElectionsData(): void {
    this.loadError.set('');
    this.pageLoading.next(true);
    this.electionService.getAllData().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.pageLoading.next(false)),
    ).subscribe({ next: data => {
      this.allData = data;
      for (const { date } of this.dates) {
        const summary = data[date];
        if (summary) this.electionsData.set(date, this.calculateElectionStats(summary.regions, summary.parties, date));
      }
      this.regions = (data[this.dates[0]?.date]?.regions ?? []).map(region => ({ id: region.id, name: region.name }));
      
      const presidential = this.electionType === 'presidential';
      this.topHistoricalCandidateIds.clear();
      const allPartiesMap = new Map<string, { id: string; name: string }>();
      Object.entries(data).forEach(([date, electionData]) => {
        let parties = Object.entries(electionData.parties).filter(([id]) => id !== '0');
        if (presidential) {
          const totals = partyVoteTotals(electionData.regions);
          parties = parties.filter(([id]) => (totals[id] ?? 0) > 0)
            .sort(([left], [right]) => (totals[right] ?? 0) - (totals[left] ?? 0))
            .slice(0, 5);
          this.topHistoricalCandidateIds.set(date, new Set(parties.map(([id]) => id)));
        }
        parties.forEach(([, name]) => {
          const id = presidential ? contestantIdentity(name, 'presidential') : getPartyAlias(name);
          if (!allPartiesMap.has(id)) allPartiesMap.set(id, { id, name });
        });
      });
      this.allParties = Array.from(allPartiesMap.values());
      
      this.selectedHistoricalPartyIds.set(presidential
        ? new Set(this.allParties.map(p => p.id))
        : getDefaultPartyIds(this.allParties));
    }, error: () => {
      this.loadError.set('Данните не могат да бъдат заредени. Опитайте отново.');
    } });
  }

  calculateElectionStats(regions: Region[], parties: { [id: string]: string }, date: string): ElectionData {
    const totalElectors = this.electionService.getOfficialNationalElectors(date)
      ?? regions.reduce((sum, r) => sum + r.total, 0);
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
        return {
          partyId,
          name: parties[partyId] || partyId,
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

  openContestant(partyName: string, date: string, partyId?: string): void {
    if (!partyName || partyName === 'Други' || partyId === '0' || partyId === 'no_votes') return;
    this.selectedContestant.set({ partyName, partyId, date });
  }

  get historicalPartyVotes(): Record<string, number> {
    const latest = this.allData[this.dates[0]?.date];
    if (!latest) return {};
    const regions = this.level() === 'region'
      ? latest.regions.filter((region: Region) => region.id === this.selectedRegionId()) : latest.regions;
    const votes: Record<string, number> = {};
    for (const [id, total] of Object.entries(partyVoteTotals(regions))) {
      const name = latest.parties[id];
      if (name) {
        const identity = this.electionType === 'presidential' ? contestantIdentity(name, 'presidential') : getPartyAlias(name);
        votes[identity] = (votes[identity] ?? 0) + total;
      }
    }
    return votes;
  }

  get regionOptions() {
    return [{ value: '', label: 'Избери район' },
      ...this.regions.map(region => ({ value: region.id, label: `${region.name} (${region.id})`, icon: region.id === '32' ? 'globe' as const : 'region' as const }))];
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
    const partyDataMap: { [selectedId: string]: { keywords: string[], name: string, rawName: string, votesData: (number | null)[], percentData: (number | null)[] } } = {};
    
    // Initialize data structure for each selected party
    selectedIds.forEach(partyId => {
      const party = this.allParties.find(p => p.id === partyId);
      if (party) {
        const keywords = this.getPartyKeywords(party.name);
        partyDataMap[partyId] = {
          keywords,
          name: this.electionType === 'presidential' ? getPresidentialCandidateName(party.name) : getPartyAlias(party.name),
          rawName: party.name,
          votesData: [],
          percentData: []
        };
      }
    });

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      const regions: Region[] = level === 'national' ? data.regions
        : data.regions.filter((region: Region) => region.id === regionId);
      const totalVoted = regions.reduce((sum, region) => sum + region.voted, 0);
      const datePartyVotes = partyVoteTotals(regions);

      // Match contestants across election-specific ballot numbers.
      selectedIds.forEach(selectedId => {
        const partyInfo = partyDataMap[selectedId];
        if (!partyInfo) return;

        const matchingPartyId = this.electionType === 'presidential'
          ? matchContestantId(partyInfo.rawName, data.parties, 'presidential')
          : this.findPartyByKeywords(partyInfo.keywords, data.parties);
        if (this.electionType === 'presidential'
          && (!matchingPartyId || !this.topHistoricalCandidateIds.get(d.date)?.has(matchingPartyId) || !regions.length)) {
          partyInfo.votesData.push(null);
          partyInfo.percentData.push(null);
          return;
        }
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
          color: getPartyColor(partyInfo.rawName, isDark),
          legendIndex: getPartyLegendIndex(partyInfo.rawName)
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
          color: getPartyColor(partyInfo.rawName, isDark),
          legendIndex: getPartyLegendIndex(partyInfo.rawName)
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
