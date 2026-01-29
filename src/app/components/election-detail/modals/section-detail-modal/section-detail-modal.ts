import { Component, EventEmitter, Input, Output, effect, signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Section, SectionDetails, PartyResult, ComparativeValue, PartyVotes } from '../../../../models/election.models';
import { ThemeService } from '../../../../services/theme.service';
import { ElectionService } from '../../../../services/election';
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
    '(document:click)': 'closePartyFilter()',
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
  @Input() selectedPartyIds: Set<string> = new Set();
  showPartyFilter: boolean = false;
  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};
  historicalVotesChartOptions: Highcharts.Options = {};
  historicalPercentChartOptions: Highcharts.Options = {};
  
  allData: { [date: string]: any } = {};
  dates: { date: string, name: string }[] = [];

  getGoogleMapsUrl(cityName: string, sectionName: string): string {
    const isCity = this.section.sectionName.startsWith('Общо за');
    const query = encodeURIComponent(isCity ? cityName : `${cityName} ${sectionName}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
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
  }

  ngOnInit() {
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      if (this.section) {
        this.updateHistoricalCharts();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.section) {
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

  togglePartySelection(partyId: string) {
    if (this.selectedPartyIds.has(partyId)) {
      this.selectedPartyIds.delete(partyId);
    } else {
      this.selectedPartyIds.add(partyId);
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

  updateChartOptions() {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    const results = [...this.section.partyResults]
      .filter(r => r.partyId !== 'no_votes')
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const categories = results.map(r => r.partyName);
    const paperData = results.map(r => r.paper);
    const machineData = results.map(r => r.machine);

    const isCity = this.section.sectionName.startsWith('Общо за');

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

  updateHistoricalCharts() {
    if (!this.section) return;

    const isCity = this.section.sectionName.startsWith('Общо за');
    const sectionId = this.section.sectionId;
    const cityName = this.section.cityName;
    const regionId = this.currentSectionData?.regionId;

    const votesData: number[] = [];
    const percentData: number[] = [];
    const categories: string[] = [];

    // Sort dates ascending for the chart
    const sortedDates = [...this.dates].sort((a, b) => a.date.localeCompare(b.date));

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      let votes = 0;
      let totalVoted = 0;

      if (isCity) {
        // For city totals, find all sections in that city (and region if available)
        const citySections = data.sections.filter((s: Section) => {
          const matchesCity = s.cityName === cityName;
          const matchesRegion = !regionId || s.regionId === regionId;
          return matchesCity && matchesRegion;
        });
        citySections.forEach((section: Section) => {
          totalVoted += section.voted;
          Object.entries(section.partyVotes).forEach(([pid, v]) => {
            const votesObj = v as PartyVotes;
            const name = data.parties[pid] || pid;
            if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
              votes += votesObj.total;
            }
          });
        });
      } else {
        // For individual sections, match by sectionId
        const section = data.sections.find((s: Section) => s.sectionId === sectionId);
        if (section) {
          totalVoted = section.voted;
          Object.entries(section.partyVotes).forEach(([pid, v]) => {
            const votesObj = v as PartyVotes;
            const name = data.parties[pid] || pid;
            if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
              votes += votesObj.total;
            }
          });
        }
      }

      votesData.push(votes);
      const percent = totalVoted > 0 ? (votes / totalVoted) * 100 : 0;
      percentData.push(Math.round(percent * 100) / 100);
    });

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';
    const chartTitle = isCity 
      ? `Исторически тренд за ${cityName}` 
      : `Исторически тренд за секция ${sectionId}`;

    this.historicalVotesChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой гласове за ПП-ДБ', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { 
        title: { text: 'Гласове', style: { color: textColor } }, 
        labels: { style: { color: textColor } } 
      },
      legend: {
        itemStyle: { color: textColor }
      },
      series: [{ name: 'Гласове', data: votesData, color: '#0ea5e9' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.historicalPercentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процентна подкрепа за ПП-ДБ', style: { color: textColor } },
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
      series: [{ name: 'Процент', data: percentData, color: '#10b981' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%', valueDecimals: 2 }
    };
  }
}
