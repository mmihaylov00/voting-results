import { Component, EventEmitter, Input, Output, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Section, SectionDetails, PartyResult } from '../../../../models/election.models';
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
  @Output() close = new EventEmitter<void>();

  partySortColumn: keyof PartyResult = 'total';
  partySortDir: 'asc' | 'desc' = 'desc';
  @Input() selectedPartyIds: Set<string> = new Set();
  showPartyFilter: boolean = false;
  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};

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
    if (this.selectedPartyIds.size === 0) return this.section.partyResults.filter(r => r.partyId !== 'no_votes');
    return this.section.partyResults.filter(r => this.selectedPartyIds.has(r.partyId) && r.partyId !== 'no_votes');
  }

  get othersResult(): any | null {
    if (this.selectedPartyIds.size === 0) return null;
    const others = this.section.partyResults.filter(r => !this.selectedPartyIds.has(r.partyId) && r.partyId !== 'no_votes');
    if (others.length === 0) return null;

    const total = others.reduce((sum, r) => sum + r.total, 0);
    const paper = others.reduce((sum, r) => sum + r.paper, 0);
    const machine = others.reduce((sum, r) => sum + r.machine, 0);
    const percent = others.reduce((sum, r) => sum + r.percent, 0);

    // Aggregate comparisons for "Others" row
    const comparisons: { [date: string]: { value: number, dateName: string } } = {};
    const paperComparisons: { [date: string]: { value: number, dateName: string } } = {};
    const machineComparisons: { [date: string]: { value: number, dateName: string } } = {};
    const percentComparisons: { [date: string]: { value: number, dateName: string } } = {};

    others.forEach(r => {
      const votes = this.currentSectionData?.partyVotes?.[r.partyId];
      votes?.comparisons?.forEach(c => {
        if (!comparisons[c.date]) comparisons[c.date] = { value: 0, dateName: c.dateName };
        comparisons[c.date].value += c.value;
      });
      votes?.paperComparisons?.forEach(c => {
        if (!paperComparisons[c.date]) paperComparisons[c.date] = { value: 0, dateName: c.dateName };
        paperComparisons[c.date].value += c.value;
      });
      votes?.machineComparisons?.forEach(c => {
        if (!machineComparisons[c.date]) machineComparisons[c.date] = { value: 0, dateName: c.dateName };
        machineComparisons[c.date].value += c.value;
      });
      votes?.percentComparisons?.forEach(c => {
        if (!percentComparisons[c.date]) percentComparisons[c.date] = { value: 0, dateName: c.dateName };
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
      comparisons: Object.values(comparisons),
      paperComparisons: Object.values(paperComparisons),
      machineComparisons: Object.values(machineComparisons),
      percentComparisons: Object.values(percentComparisons)
    };
  }

  get noVotesResult(): PartyResult | null {
    return this.section.partyResults.find(r => r.partyId === 'no_votes') || null;
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
