import { Component, EventEmitter, Input, Output, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Section, SectionDetails, PartyResult, ComparativeValue } from '../../../../models/election.models';
import { ThemeService } from '../../../../services/theme.service';
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
export class SectionDetailModalComponent {
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

  getGoogleMapsUrl(cityName: string, sectionName: string): string {
    const query = encodeURIComponent(`${cityName} ${sectionName}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  constructor(public themeService: ThemeService) {
    effect(() => {
      this.themeService.darkMode();
      if (this.section) {
        this.updateChartOptions();
      }
    });
  }

  ngOnChanges() {
    if (this.section) {
       this.updateChartOptions();
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

    const totalVoted = this.currentSectionData?.voted || 0;
    const activity = this.currentSectionData?.activityPercent || 0;

    this.chartOptions = {
      chart: {
        type: 'bar',
        backgroundColor: 'transparent',
      },
      title: {
        text: 'Топ 10 партии в секцията',
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
