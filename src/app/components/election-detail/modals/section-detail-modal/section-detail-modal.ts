import { Component, EventEmitter, Input, Output, effect, signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Section, SectionDetails, PartyResult, ComparativeValue, PartyVotes, CandidateResult, CandidateVotes } from '../../../../models/election.models';
import { ThemeService } from '../../../../services/theme.service';
import { ElectionService } from '../../../../services/election';
import { getPartyAlias } from '../../../../utils/party-aliases';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../../ui/table-helm/src/lib/hlm-table.directives';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardContentDirective
} from '../../../ui/card-helm/src/lib/hlm-card.directives';

@Component({
  selector: 'app-section-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HighchartsChartComponent,
    HlmButtonDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
    HlmTypographyDirective,
    HlmTooltipDirective,
    HlmCardDirective,
  ],
  templateUrl: './section-detail-modal.html',
  host: {
    '(document:click)': 'closePartyFilters()',
    '(document:keydown.escape)': 'close.emit()'
  }
})
export class SectionDetailModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) section!: SectionDetails;
  @Input() currentSectionData?: Section;
  @Input() allParties: { id: string, name: string }[] = [];
  @Input() date: string = '';
  @Output() close = new EventEmitter<void>();

  partySortColumn: keyof PartyResult = 'total';
  partySortDir: 'asc' | 'desc' = 'desc';
  candidateSortColumn: keyof CandidateResult = 'total';
  candidateSortDir: 'asc' | 'desc' = 'desc';
  @Input() selectedPartyIds: Set<string> = new Set();
  showPartyFilter: boolean = false;
  activeTab = signal<'parties' | 'candidates'>('parties');
  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};
  historicalVotesChartOptions: Highcharts.Options = {};
  historicalPercentChartOptions: Highcharts.Options = {};
  historicalActivityChartOptions: Highcharts.Options = {};
  activeHistoricalTab = signal<'votes' | 'percent' | 'activity'>('votes');

  allData: { [date: string]: any } = {};
  dates: { date: string, name: string }[] = [];
  candidateResults: CandidateResult[] = [];
  votesWithoutPreferences: number = 0;
  votesWithoutPreferencesByParty: { [partyId: string]: { total: number, paper: number, machine: number, partyName: string } } = {};

  getGoogleMapsUrl(cityName: string, sectionName: string): string {
    const isCity = this.section.sectionName.startsWith('Общо за');
    const query = encodeURIComponent(isCity ? cityName : `${cityName} ${sectionName}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  get isGroupedByCity(): boolean {
    return this.section.sectionName.startsWith('Общо за');
  }

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
  }

  getPartyAlias = getPartyAlias;

  get uniqueRisks(): string[] {
    if (!this.currentSectionData) return [];
    const indicatorMessages = new Set(
      this.currentSectionData.riskIndicators?.map(r => r.message) || []
    );
    return (this.currentSectionData.risks || []).filter(r => !indicatorMessages.has(r));
  }

  constructor(
    public themeService: ThemeService,
    private electionService: ElectionService
  ) {
    this.dates = this.electionService.getDates();

    effect(() => {
      this.themeService.darkMode();
      if (this.section) {
        this.updateChartOptions();
        if (Object.keys(this.allData).length > 0) {
          this.updateHistoricalCharts();
        }
      }
    });

    effect(() => {
      // Update charts when tab changes
      this.activeTab();
      if (this.section) {
        this.updateChartOptions();
        if (Object.keys(this.allData).length > 0) {
          this.updateHistoricalCharts();
        }
      }
    });
  }

  ngOnInit() {
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      if (this.section) {
        this.calculateCandidateResults();
        this.updateHistoricalCharts();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.section) {
      this.calculateCandidateResults();
      this.updateChartOptions();
      if (Object.keys(this.allData).length > 0) {
        this.updateHistoricalCharts();
      }
    }
  }

  closeModal() {
    this.close.emit();
  }

  togglePartyFilter(event: Event) {
    event.stopPropagation();
    this.showPartyFilter = !this.showPartyFilter;
  }

  closePartyFilter() {
    this.showPartyFilter = false;
  }

  closePartyFilters() {
    this.showPartyFilter = false;
  }

  togglePartySelection(partyId: string) {
    if (this.selectedPartyIds.has(partyId)) {
      this.selectedPartyIds.delete(partyId);
    } else {
      this.selectedPartyIds.add(partyId);
    }
    // Update historical charts when party selection changes
    if (Object.keys(this.allData).length > 0) {
      this.updateHistoricalCharts();
    }
  }

  sortParties(column: keyof PartyResult, preserveDir: boolean = false) {
    if (this.partySortColumn === column && !preserveDir) {
      this.partySortDir = this.partySortDir === 'asc' ? 'desc' : 'asc';
    } else if (!preserveDir) {
      this.partySortColumn = column;
      this.partySortDir = column === 'partyName' ? 'asc' : 'desc';
    }

    this.section.partyResults.sort((a, b) => {
      const valA = a[this.partySortColumn];
      const valB = b[this.partySortColumn];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.partySortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return this.partySortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }

  get filteredPartyResults(): PartyResult[] {
    let results: PartyResult[] = [];

    if (this.selectedPartyIds.size === 0) {
      results = this.section.partyResults.filter(r => r.partyId !== 'no_votes');
    } else {
      results = this.section.partyResults.filter(r => this.selectedPartyIds.has(r.partyId) && r.partyId !== 'no_votes');
      const others = this.othersResult;
      if (others) {
        results.push(others);
      }
    }

    const noVotes = this.noVotesResult;
    if (noVotes) {
      results.push(noVotes);
    }

    return results.sort((a, b) => {
      const valA = a[this.partySortColumn];
      const valB = b[this.partySortColumn];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.partySortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return this.partySortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }

  get filteredAllParties(): { id: string, name: string, votes: number }[] {
    const partyVotesMap = new Map<string, number>();
    this.section.partyResults.forEach(r => partyVotesMap.set(r.partyId, r.total));

    return this.allParties.map(p => ({
      ...p,
      votes: partyVotesMap.get(p.id) || 0
    }));
  }

  get othersResult(): PartyResult | null {
    if (this.selectedPartyIds.size === 0) return null;
    const others = this.section.partyResults.filter(r => !this.selectedPartyIds.has(r.partyId) && r.partyId !== 'no_votes');
    if (others.length === 0) return null;

    const total = others.reduce((sum, r) => sum + r.total, 0);
    const paper = others.reduce((sum, r) => sum + r.paper, 0);
    const machine = others.reduce((sum, r) => sum + r.machine, 0);
    const percent = others.reduce((sum, r) => sum + r.percent, 0);

    // Aggregate comparisons for "Others" row
    const comparisons: { [date: string]: ComparativeValue } = {};
    const paperComparisons: { [date: string]: ComparativeValue } = {};
    const machineComparisons: { [date: string]: ComparativeValue } = {};
    const percentComparisons: { [date: string]: ComparativeValue } = {};

    others.forEach(r => {
      const votes = this.currentSectionData?.partyVotes?.[r.partyId];
      votes?.comparisons?.forEach(c => {
        if (!comparisons[c.date]) comparisons[c.date] = { value: 0, dateName: c.dateName, date: c.date };
        comparisons[c.date].value += c.value;
      });
      votes?.paperComparisons?.forEach(c => {
        if (!paperComparisons[c.date]) paperComparisons[c.date] = { value: 0, dateName: c.dateName, date: c.date };
        paperComparisons[c.date].value += c.value;
      });
      votes?.machineComparisons?.forEach(c => {
        if (!machineComparisons[c.date]) machineComparisons[c.date] = { value: 0, dateName: c.dateName, date: c.date };
        machineComparisons[c.date].value += c.value;
      });
      votes?.percentComparisons?.forEach(c => {
        if (!percentComparisons[c.date]) percentComparisons[c.date] = { value: 0, dateName: c.dateName, date: c.date };
        percentComparisons[c.date].value += c.value;
      });
    });

    return {
      partyId: 'others',
      partyName: 'Други',
      total,
      paper,
      machine,
      percent,
      isOthers: true,
      comparisons: Object.values(comparisons),
      paperComparisons: Object.values(paperComparisons),
      machineComparisons: Object.values(machineComparisons),
      percentComparisons: Object.values(percentComparisons)
    };
  }

  get noVotesResult(): PartyResult | null {
    const res = this.section.partyResults.find(r => r.partyId === 'no_votes');
    if (!res) return null;

    return {
      ...res,
      isNoVotes: true,
      comparisons: this.currentSectionData?.comparisons?.['noVotes'],
      paperComparisons: this.currentSectionData?.comparisons?.['noVotesPaper'],
      machineComparisons: this.currentSectionData?.comparisons?.['noVotesMachine'],
      percentComparisons: this.currentSectionData?.comparisons?.['noVotesPercent']
    };
  }

  calculateCandidateResults() {
    // Check if we have candidate votes from section or from SectionDetails (for grouped cities)
    const candidateVotes = this.currentSectionData?.candidateVotes || this.section.candidateVotes;
    
    if (!this.currentSectionData) {
      this.candidateResults = [];
      this.votesWithoutPreferences = 0;
      this.votesWithoutPreferencesByParty = {};
      return;
    }

    // Use pre-calculated votes without preferences by party if available (for grouped cities)
    if (this.section.votesWithoutPreferencesByParty) {
      this.votesWithoutPreferencesByParty = {};
      Object.entries(this.section.votesWithoutPreferencesByParty).forEach(([partyId, data]) => {
        const party = this.allParties.find(p => p.id === partyId);
        this.votesWithoutPreferencesByParty[partyId] = {
          ...data,
          partyName: party?.name || partyId
        };
      });
      this.votesWithoutPreferences = this.section.votesWithoutPreferences || 0;
    } else if (!candidateVotes) {
      this.candidateResults = [];
      this.votesWithoutPreferences = this.currentSectionData.voted || 0;
      this.votesWithoutPreferencesByParty = {};
      return;
    } else {
      // Calculate votes without preferences per party for single section
      this.votesWithoutPreferencesByParty = {};
      const partiesMap: { [id: string]: string } = {};
      this.allParties.forEach(p => {
        partiesMap[p.id] = p.name;
      });
      
      const section = this.currentSectionData;
      Object.entries(section.partyVotes).forEach(([partyId, partyVotes]) => {
        if (partyId === 'no_votes') return;
        
        // Get total preference votes for this party
        let partyPreferenceVotes = 0;
        let partyPreferencePaper = 0;
        let partyPreferenceMachine = 0;
        
        Object.values(candidateVotes).forEach(candidate => {
          if (candidate.partyId === partyId) {
            partyPreferenceVotes += candidate.total;
            partyPreferencePaper += candidate.paper;
            partyPreferenceMachine += candidate.machine;
          }
        });
        
        // Votes without preferences = party total - preference votes
        const withoutPrefs = partyVotes.total - partyPreferenceVotes;
        if (withoutPrefs > 0) {
          this.votesWithoutPreferencesByParty[partyId] = {
            total: withoutPrefs,
            paper: partyVotes.paper - partyPreferencePaper,
            machine: partyVotes.machine - partyPreferenceMachine,
            partyName: partiesMap[partyId] || partyId
          };
        }
      });
      
      // Calculate total votes without preferences
      const totalPreferenceVotes = Object.values(candidateVotes).reduce((sum, c) => sum + c.total, 0);
      const sectionVoted = section.voted;
      this.votesWithoutPreferences = sectionVoted - totalPreferenceVotes;
    }

    if (!candidateVotes) {
      this.candidateResults = [];
      return;
    }

    const section = this.currentSectionData;
    const regionId = section.regionId;
    const cityName = section.cityName;
    const sectionVoted = section.voted;
    const isCity = this.isGroupedByCity;

    // Get all sections in the region for region-level calculations
    const currentDateData = this.allData[this.date];
    
    // Initialize region totals
    const regionPartyVotes: { [partyId: string]: number } = {};
    const regionPartyPreferenceVotes: { [partyId: string]: number } = {}; // Total preference votes per party in region
    const regionCandidateVotes: { [key: string]: number } = {};
    let regionTotalVoted = 0;

    // Only calculate region totals if we have data loaded
    if (currentDateData && currentDateData.sections && regionId) {
      const regionSections: Section[] = currentDateData.sections.filter((s: Section) => s.regionId === regionId);
      
      regionSections.forEach((s: Section) => {
        regionTotalVoted += s.voted;
        Object.entries(s.partyVotes).forEach(([partyId, votes]) => {
          regionPartyVotes[partyId] = (regionPartyVotes[partyId] || 0) + votes.total;
        });
        if (s.candidateVotes) {
          Object.values(s.candidateVotes).forEach(candidate => {
            const key = `${candidate.partyId}_${candidate.candidateId}`;
            regionCandidateVotes[key] = (regionCandidateVotes[key] || 0) + candidate.total;
            // Sum preference votes per party
            regionPartyPreferenceVotes[candidate.partyId] = (regionPartyPreferenceVotes[candidate.partyId] || 0) + candidate.total;
          });
        }
      });
    }

    // Build candidate results
    const candidateResultsMap: { [key: string]: CandidateResult } = {};
    
    // Get party votes from partyResults (available in both single sections and grouped cities)
    const partyVotesMap: { [partyId: string]: number } = {};
    this.section.partyResults.forEach(pr => {
      if (pr.partyId !== 'no_votes' && pr.partyId !== 'others') {
        partyVotesMap[pr.partyId] = pr.total;
      }
    });
    
    Object.values(candidateVotes).forEach(candidate => {
      const key = `${candidate.partyId}_${candidate.candidateId}`;
      // Get party total from partyResults (works for both single sections and grouped cities)
      const partyTotalInSection = partyVotesMap[candidate.partyId] || 0;
      const partyTotalInRegion = regionPartyVotes[candidate.partyId] || 0;
      const candidateTotalInRegion = regionCandidateVotes[key] || 0;
      const partyPreferenceVotesInRegion = regionPartyPreferenceVotes[candidate.partyId] || 0;

      candidateResultsMap[key] = {
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        partyId: candidate.partyId,
        partyName: candidate.partyName,
        paper: candidate.paper,
        machine: candidate.machine,
        total: candidate.total,
        percentInSection: sectionVoted > 0 ? (candidate.total / sectionVoted) * 100 : 0,
        partyPercentInSection: partyTotalInSection, // Show actual number, not percentage
        totalInRegion: candidateTotalInRegion,
        partyPercentInRegion: partyPreferenceVotesInRegion > 0 ? (candidateTotalInRegion / partyPreferenceVotesInRegion) * 100 : 0
      };
    });

    this.candidateResults = Object.values(candidateResultsMap);
    this.sortCandidates(this.candidateSortColumn, true);
  }

  get votesWithoutPreferencesEntries(): Array<[string, { total: number, paper: number, machine: number, partyName: string }]> {
    return Object.entries(this.votesWithoutPreferencesByParty);
  }

  sortCandidates(column: keyof CandidateResult, preserveDir: boolean = false) {
    if (this.candidateSortColumn === column && !preserveDir) {
      this.candidateSortDir = this.candidateSortDir === 'asc' ? 'desc' : 'asc';
    } else if (!preserveDir) {
      this.candidateSortColumn = column;
      this.candidateSortDir = column === 'candidateName' || column === 'partyName' || column === 'candidateId' ? 'asc' : 'desc';
    }

    this.candidateResults.sort((a, b) => {
      const valA = a[this.candidateSortColumn];
      const valB = b[this.candidateSortColumn];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.candidateSortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return this.candidateSortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }

  updateChartOptions() {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';
    const isCity = this.section.sectionName.startsWith('Общо за');

    if (this.activeTab() === 'candidates') {
      // Show candidate preference votes chart
      const candidates = [...this.candidateResults]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const categories = candidates.map(c => `${c.candidateName} (${getPartyAlias(c.partyName)})`);
      const paperData = candidates.map(c => c.paper);
      const machineData = candidates.map(c => c.machine);

      this.chartOptions = {
        chart: {
          type: 'bar',
          backgroundColor: 'transparent',
        },
        title: {
          text: isCity ? `Топ 10 кандидати в ${this.section.cityName}` : 'Топ 10 кандидати в секцията',
          style: { color: textColor }
        },
        xAxis: {
          categories: categories,
          labels: { style: { color: textColor }, rotation: -45, align: 'right' }
        },
        yAxis: {
          title: {
            text: 'Преференции',
            style: { color: textColor }
          },
          labels: { style: { color: textColor } },
          gridLineColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        },
        legend: {
          itemStyle: { color: textColor }
        },
        plotOptions: {
          series: {
            stacking: 'normal',
            borderWidth: 0
          }
        },
        series: [
          {
            name: 'Хартиени',
            type: 'bar',
            data: paperData,
            color: '#fbbf24'
          },
          {
            name: 'Машинни',
            type: 'bar',
            data: machineData,
            color: '#3b82f6'
          }
        ],
        credits: { enabled: false }
      };
    } else {
      // Show party votes chart
      const results = [...this.section.partyResults]
        .filter(r => r.partyId !== 'no_votes')
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const categories = results.map(r => getPartyAlias(r.partyName));
      const paperData = results.map(r => r.paper);
      const machineData = results.map(r => r.machine);

      this.chartOptions = {
        chart: {
          type: 'bar',
          backgroundColor: 'transparent',
        },
        title: {
          text: isCity ? `Топ 10 партии в ${this.section.cityName}` : 'Топ 10 партии в секцията',
          style: { color: textColor }
        },
        xAxis: {
          categories: categories,
          labels: { style: { color: textColor } }
        },
        yAxis: {
          title: {
            text: 'Гласове',
            style: { color: textColor }
          },
          labels: { style: { color: textColor } },
          gridLineColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        },
        legend: {
          itemStyle: { color: textColor }
        },
        plotOptions: {
          series: {
            stacking: 'normal',
            borderWidth: 0
          }
        },
        series: [
          {
            name: 'Хартиени',
            type: 'bar',
            data: paperData,
            color: '#fbbf24'
          },
          {
            name: 'Машинни',
            type: 'bar',
            data: machineData,
            color: '#3b82f6'
          }
        ],
        credits: { enabled: false }
      };
    }
  }

  // Extract keywords from party name for matching across elections
  private getPartyKeywords(partyName: string): string[] {
    const upperName = partyName.toUpperCase();
    // Normalize common variations
    if (upperName.includes('ПРОДЪЛЖАВАМЕ') || upperName.includes('ПП-ДБ')) {
      return ['ПРОДЪЛЖАВАМЕ', 'ПП-ДБ'];
    }
    // Extract main keywords (first significant words, excluding common prefixes)
    const words = upperName.split(/\s+/).filter(w => w.length > 2);
    return words.slice(0, 3); // Take first 3 significant words
  }

  // Find party ID in election data by matching name keywords
  private findPartyByKeywords(keywords: string[], parties: { [id: string]: string }): string | null {
    for (const [pid, name] of Object.entries(parties)) {
      const upperName = name.toUpperCase();
      // Check if all keywords match
      if (keywords.every(keyword => upperName.includes(keyword))) {
        return pid;
      }
    }
    // Fallback: try matching any keyword
    for (const [pid, name] of Object.entries(parties)) {
      const upperName = name.toUpperCase();
      if (keywords.some(keyword => upperName.includes(keyword))) {
        return pid;
      }
    }
    return null;
  }

  updateHistoricalCharts() {
    if (!this.section) return;

    if (this.activeTab() === 'candidates') {
      // For candidates, show preference votes over time
      this.updateHistoricalCandidateCharts();
      return;
    }

    const isCity = this.section.sectionName.startsWith('Общо за');
    const sectionId = this.section.sectionId;
    const cityName = this.section.cityName;
    const regionId = this.currentSectionData?.regionId;
    const selectedIds = this.selectedPartyIds;

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

    const activityData: number[] = [];

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      let totalVoted = 0;
      let totalElectors = 0;

      // Collect votes for all parties in this date
      const datePartyVotes: { [partyId: string]: number } = {};

      if (isCity) {
        // For city totals, find all sections in that city (and region if available)
        const citySections = data.sections.filter((s: Section) => {
          const matchesCity = s.cityName === cityName;
          const matchesRegion = !regionId || s.regionId === regionId;
          return matchesCity && matchesRegion;
        });
        citySections.forEach((section: Section) => {
          totalVoted += section.voted;
          totalElectors += section.total;
          Object.entries(section.partyVotes).forEach(([pid, v]) => {
            const votesObj = v as PartyVotes;
            datePartyVotes[pid] = (datePartyVotes[pid] || 0) + votesObj.total;
          });
        });
      } else {
        // For individual sections, match by sectionId
        const section = data.sections.find((s: Section) => s.sectionId === sectionId);
        if (section) {
          totalVoted = section.voted;
          totalElectors = section.total;
          Object.entries(section.partyVotes).forEach(([pid, v]) => {
            const votesObj = v as PartyVotes;
            datePartyVotes[pid] = votesObj.total;
          });
        }
      }

      // Calculate activity (turnout) percentage
      const activity = totalElectors > 0 ? (totalVoted / totalElectors) * 100 : 0;
      activityData.push(Math.round(activity * 100) / 100);

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

    this.historicalVotesChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой гласове', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Гласове', style: { color: textColor } },
        labels: { style: { color: textColor } }
      },
      legend: {
        itemStyle: { color: textColor }
      },
      series: votesSeries,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.historicalPercentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процентна подкрепа', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Процент (%)', style: { color: textColor } },
        labels: { style: { color: textColor } },
        min: 0,
        max: 100
      },
      legend: {
        itemStyle: { color: textColor }
      },
      series: percentSeries,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%', valueDecimals: 2 }
    };

    // Build activity chart
    this.historicalActivityChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Активност (избирателна активност)', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Активност (%)', style: { color: textColor } },
        labels: { style: { color: textColor } },
        min: 0,
        max: 100
      },
      legend: {
        enabled: false
      },
      series: [{
        name: 'Активност',
        data: activityData,
        type: 'line',
        color: '#0ea5e9',
        tooltip: {
          valueSuffix: '%',
          valueDecimals: 2
        }
      }],
      credits: { enabled: false },
      tooltip: { valueSuffix: '%', valueDecimals: 2 }
    };
  }

  updateHistoricalCandidateCharts() {
    if (!this.currentSectionData || !this.currentSectionData.candidateVotes) {
      // No candidate data available
      this.historicalVotesChartOptions = { chart: { type: 'line' }, series: [] };
      this.historicalPercentChartOptions = { chart: { type: 'line' }, series: [] };
      this.historicalActivityChartOptions = { chart: { type: 'line' }, series: [] };
      return;
    }

    const isCity = this.section.sectionName.startsWith('Общо за');
    const sectionId = this.section.sectionId;
    const cityName = this.section.cityName;
    const regionId = this.currentSectionData?.regionId;

    const categories: string[] = [];
    const colorPalette = [
      '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    // Get top candidates from current section
    const topCandidates = [...this.candidateResults]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Build mapping: candidate key -> data across elections
    const candidateDataMap: { [key: string]: { name: string, partyName: string, votesData: number[], percentData: number[] } } = {};
    
    topCandidates.forEach((candidate, idx) => {
      const key = `${candidate.partyId}_${candidate.candidateId}`;
      candidateDataMap[key] = {
        name: candidate.candidateName,
        partyName: candidate.partyName,
        votesData: [],
        percentData: []
      };
    });

    // Sort dates ascending for the chart
    const sortedDates = [...this.dates].sort((a, b) => a.date.localeCompare(b.date));

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      let totalVoted = 0;

      if (isCity) {
        const citySections = data.sections.filter((s: Section) => {
          const matchesCity = s.cityName === cityName;
          const matchesRegion = !regionId || s.regionId === regionId;
          return matchesCity && matchesRegion;
        });
        citySections.forEach((section: Section) => {
          totalVoted += section.voted;
        });
      } else {
        const section = data.sections.find((s: Section) => s.sectionId === sectionId);
        if (section) {
          totalVoted = section.voted;
        }
      }

      // Collect candidate preference votes for this date
      topCandidates.forEach(candidate => {
        const key = `${candidate.partyId}_${candidate.candidateId}`;
        const candidateInfo = candidateDataMap[key];
        if (!candidateInfo) return;

        let candidateVotes = 0;

        if (isCity) {
          const citySections = data.sections.filter((s: Section) => {
            const matchesCity = s.cityName === cityName;
            const matchesRegion = !regionId || s.regionId === regionId;
            return matchesCity && matchesRegion;
          });
          citySections.forEach((section: Section) => {
            if (section.candidateVotes) {
              const candidateKey = `${candidate.partyId}_${candidate.candidateId}`;
              const candidateData = section.candidateVotes[candidateKey];
              if (candidateData) {
                candidateVotes += candidateData.total;
              }
            }
          });
        } else {
          const section = data.sections.find((s: Section) => s.sectionId === sectionId);
          if (section?.candidateVotes) {
            const candidateKey = `${candidate.partyId}_${candidate.candidateId}`;
            const candidateData = section.candidateVotes[candidateKey];
            if (candidateData) {
              candidateVotes = candidateData.total;
            }
          }
        }

        candidateInfo.votesData.push(candidateVotes);
        const percent = totalVoted > 0 ? (candidateVotes / totalVoted) * 100 : 0;
        candidateInfo.percentData.push(Math.round(percent * 100) / 100);
      });
    });

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    // Build series for votes chart
    const votesSeries: any[] = [];
    topCandidates.forEach((candidate, idx) => {
      const key = `${candidate.partyId}_${candidate.candidateId}`;
      const candidateInfo = candidateDataMap[key];
      if (candidateInfo) {
        votesSeries.push({
          id: `historical-candidate-votes-${key}`,
          name: `${candidateInfo.name} (${getPartyAlias(candidateInfo.partyName)})`,
          data: candidateInfo.votesData,
          type: 'line',
          color: colorPalette[idx % colorPalette.length]
        });
      }
    });

    // Build series for percent chart
    const percentSeries: any[] = [];
    topCandidates.forEach((candidate, idx) => {
      const key = `${candidate.partyId}_${candidate.candidateId}`;
      const candidateInfo = candidateDataMap[key];
      if (candidateInfo) {
        percentSeries.push({
          id: `historical-candidate-percent-${key}`,
          name: `${candidateInfo.name} (${getPartyAlias(candidateInfo.partyName)})`,
          data: candidateInfo.percentData,
          type: 'line',
          color: colorPalette[idx % colorPalette.length]
        });
      }
    });

    this.historicalVotesChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой преференции', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Преференции', style: { color: textColor } },
        labels: { style: { color: textColor } }
      },
      legend: {
        itemStyle: { color: textColor }
      },
      series: votesSeries,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.historicalPercentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процент преференции', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Процент (%)', style: { color: textColor } },
        labels: { style: { color: textColor } },
        min: 0,
        max: 100
      },
      legend: {
        itemStyle: { color: textColor }
      },
      series: percentSeries,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%', valueDecimals: 2 }
    };

    // Activity chart remains the same for candidates
    this.historicalActivityChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Активност (избирателна активност)', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: {
        title: { text: 'Активност (%)', style: { color: textColor } },
        labels: { style: { color: textColor } },
        min: 0,
        max: 100
      },
      legend: {
        enabled: false
      },
      series: [],
      credits: { enabled: false },
      tooltip: { valueSuffix: '%', valueDecimals: 2 }
    };
  }
}
