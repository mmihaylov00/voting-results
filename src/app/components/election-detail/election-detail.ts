import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { PartyResult, Section, SectionDetails } from '../../models/election.models';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../ui/table-helm/src/lib/hlm-table.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import {
  HlmCardContentDirective,
  HlmCardDescriptionDirective,
  HlmCardDirective,
  HlmCardHeaderDirective
} from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-election-detail',
  host: {
    '(document:click)': 'closePartyFilter()',
    '(document:keydown.escape)': 'handleEscape()'
  },
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HlmButtonDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
    HlmTypographyDirective,
    HlmCardDirective,
    HlmInputDirective,
    HighchartsChartComponent,
    HlmCardHeaderDirective,
    HlmCardContentDirective,
    HlmCardDescriptionDirective,
  ],
  templateUrl: './election-detail.html',
  styleUrl: './election-detail.scss',
})
export class ElectionDetailComponent implements OnInit {
  loading$: Observable<boolean>;
  date: string = '';
  regionId: string = '';
  dateName: string = '';
  regionName: string = '';
  sections: Section[] = [];
  filteredSections: Section[] = [];
  selectedSection: SectionDetails | null = null;
  searchTerm: string = '';
  showRiskyOnly: boolean = false;
  lowActivityThreshold: number | null = 100;
  avgRegionActivity: number = 0;
  totalElectors: number = 0;
  totalVoted: number = 0;
  totalInvalid: number = 0;
  totalNoVotes: number = 0;
  totalTop3Votes: number = 0;
  totalRegionMachine: number = 0;
  totalRegionPaper: number = 0;

  sectionSortColumn: keyof Section = 'sectionId';
  sectionSortDir: 'asc' | 'desc' = 'asc';

  partySortColumn: keyof PartyResult = 'total';
  partySortDir: 'asc' | 'desc' = 'desc';

  selectedPartyIds: Set<string> = new Set();
  allParties: { id: string, name: string }[] = [];
  showPartyFilter: boolean = false;
  isModalOpen = signal<boolean>(false);
  isExportModalOpen = signal<boolean>(false);
  exportPartyIds: Set<string> = new Set();
  currentSectionData?: Section;
  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};
  regionalChartOptions: Highcharts.Options = {};

  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService,
    public themeService: ThemeService
  ) {
    this.loading$ = this.electionService.loading$;

    effect(() => {
      // Re-calculate charts options when theme changes
      this.themeService.darkMode();
      if (this.regionalChartOptions.series) {
        this.calculateRegionalStats();
      }
      if (this.isModalOpen() && this.selectedSection) {
        this.updateChartOptions();
      }
    });

    effect(() => {
      const anyModalOpen = this.isModalOpen() || this.isExportModalOpen();
      if (anyModalOpen) {
        document.body.classList.add('overflow-hidden');
      } else {
        document.body.classList.remove('overflow-hidden');
      }
    });
  }

  openExportModal(): void {
    if (!this.date || this.sections.length === 0) return;
    this.exportPartyIds = new Set(this.selectedPartyIds);
    this.isExportModalOpen.set(true);
  }

  closeExportModal(): void {
    this.isExportModalOpen.set(false);
  }

  toggleExportPartySelection(partyId: string): void {
    if (this.exportPartyIds.has(partyId)) {
      this.exportPartyIds.delete(partyId);
    } else {
      this.exportPartyIds.add(partyId);
    }
  }

  downloadCsv(): void {
    if (!this.date || this.sections.length === 0) return;

    this.electionService.getParties(this.date).subscribe(partiesMap => {
      const csvContent = this.generateCsv(partiesMap);
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `election_results_${this.date}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.closeExportModal();
    });
  }

  private generateCsv(partiesMap: { [id: string]: string }): string {
    const selectedPartyIds = Array.from(this.exportPartyIds).filter(id => id !== '0');
    try {
      selectedPartyIds.sort((a, b) => parseInt(a) - parseInt(b));
    } catch (e) {
      selectedPartyIds.sort();
    }

    let header = 'Град;Секция ИД;Секция;По списък;Гласували;Недействителни;Не подкрепя никого;Активност %';
    for (const id of selectedPartyIds) {
      const partyName = partiesMap[id] || id;
      header += `;${partyName} (Общо);${partyName} (Хартиени);${partyName} (Машинни)`;
    }

    // Always add Others if not all parties are selected
    const allPartyIds = Object.keys(partiesMap).filter(id => id !== '0');
    const hasUnselected = allPartyIds.some(id => !this.exportPartyIds.has(id));

    if (hasUnselected) {
      header += ';Други (Общо);Други (Хартиени);Други (Машинни)';
    }

    const rows = this.sections.map(section => {
      let row = `${section.cityName};${section.sectionId};${this.escapeSemi(section.sectionName)};${section.total};${section.voted};${section.discardedVotes};${section.noVotes};${(section.activityPercent * 100).toFixed(2)}%`;

      for (const partyId of selectedPartyIds) {
        const votes = section.partyVotes[partyId] || { total: 0, paper: 0, machine: 0 };
        row += `;${votes.total};${votes.paper};${votes.machine}`;
      }

      if (hasUnselected) {
        let othersTotal = 0;
        let othersPaper = 0;
        let othersMachine = 0;

        for (const partyId of allPartyIds) {
          if (!this.exportPartyIds.has(partyId)) {
            const votes = section.partyVotes[partyId] || { total: 0, paper: 0, machine: 0 };
            othersTotal += votes.total;
            othersPaper += votes.paper;
            othersMachine += votes.machine;
          }
        }
        // Also add the original 'Others' (id '0') if it exists and wasn't selected
        if (partiesMap['0'] && !this.exportPartyIds.has('0')) {
          const votes = section.partyVotes['0'] || { total: 0, paper: 0, machine: 0 };
          othersTotal += votes.total;
          othersPaper += votes.paper;
          othersMachine += votes.machine;
        }

        row += `;${othersTotal};${othersPaper};${othersMachine}`;
      }

      return row;
    });

    return [header, ...rows].join('\n');
  }

  private escapeSemi(v: string): string {
    if (!v) return '';
    if (v.includes(';') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  ngOnInit(): void {
    this.date = this.route.snapshot.paramMap.get('date') || '';
    this.regionId = this.route.snapshot.paramMap.get('regionId') || '';
    this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;
    if (this.date) {
      this.electionService.getSections(this.date, this.regionId).subscribe(sections => {
        this.sections = sections;
        if (this.sections.length > 0) {
          this.regionName = this.formatRegionName((this.sections[0] as any).regionName);
          this.calculateAvgActivity();
          this.calculateRegionalStats();
        }
        this.applyFilter();
        this.sortSections(this.sectionSortColumn, true);
      });
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

        // Add Others at the end if it exists
        if (partiesMap['0']) {
          this.allParties.push({ id: '0', name: partiesMap['0'] });
        }

        // Apply default selection
        this.allParties.forEach(party => {
          const name = party.name.toUpperCase();
          if (this.DEFAULT_KEYWORDS.some(k => name.includes(k))) {
            this.selectedPartyIds.add(party.id);
          }
        });
      });
    }
  }

  applyFilter(): void {
    let result = [...this.sections];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(s =>
        s.sectionId.toLowerCase().includes(term) ||
        s.cityName.toLowerCase().includes(term) ||
        s.sectionName.toLowerCase().includes(term)
      );
    }

    if (this.showRiskyOnly) {
      result = result.filter(s => {
        // "ПП-ДБ" is not in top 3
        return !s.topParties.some(tp => tp.name.includes('ПП-ДБ'));
      });
    }

    if (this.lowActivityThreshold !== null) {
      result = result.filter(s => (s.activityPercent * 100) < (this.lowActivityThreshold as number));
    }

    this.filteredSections = result;
    this.sortSections(this.sectionSortColumn, true);
  }

  toggleRiskyFilter(): void {
    this.showRiskyOnly = !this.showRiskyOnly;
    this.applyFilter();
  }

  private calculateAvgActivity(): void {
    if (this.sections.length === 0) {
      this.avgRegionActivity = 0;
      return;
    }
    const totalVoted = this.sections.reduce((sum, s) => sum + s.voted, 0);
    const totalElectors = this.sections.reduce((sum, s) => sum + s.total, 0);
    this.avgRegionActivity = totalElectors > 0 ? totalVoted / totalElectors : 0;
  }

  private calculateRegionalStats(): void {
    if (this.sections.length === 0) return;

    this.totalElectors = this.sections.reduce((sum, s) => sum + s.total, 0);
    this.totalVoted = this.sections.reduce((sum, s) => sum + s.voted, 0);
    this.totalInvalid = this.sections.reduce((sum, s) => sum + s.discardedVotes, 0);
    this.totalNoVotes = this.sections.reduce((sum, s) => sum + s.noVotes, 0);
    this.totalRegionMachine = this.sections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);
    this.totalRegionPaper = this.sections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);

    const regionalPartyVotes: { [partyId: string]: number } = {};
    this.sections.forEach(s => {
      Object.entries(s.partyVotes).forEach(([partyId, votes]) => {
        regionalPartyVotes[partyId] = (regionalPartyVotes[partyId] || 0) + votes.total;
      });
    });

    this.electionService.getParties(this.date).subscribe(partiesMap => {
      const partyData = Object.entries(regionalPartyVotes)
        .map(([id, total]) => ({
          id,
          name: partiesMap[id] || id,
          total
        }))
        .sort((a, b) => b.total - a.total);

      this.totalTop3Votes = partyData.slice(0, 3).reduce((sum, p) => sum + p.total, 0);

      this.updateRegionalChartOptions(partyData);
    });
  }

  private updateRegionalChartOptions(partyData: { id: string, name: string, total: number }[]): void {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    const nonVoters = Math.max(0, this.totalElectors - this.totalVoted);

    const chartData = partyData.map(p => ({
      name: p.name,
      y: p.total
    }));

    if (nonVoters > 0) {
      chartData.push({
        name: 'Негласували',
        y: nonVoters
      });
    }

    if (this.totalNoVotes > 0) {
      chartData.push({
        name: 'Не подкрепя никого',
        y: this.totalNoVotes
      });
    }

    // Sort chart data to show bigger slices first
    chartData.sort((a, b) => b.y - a.y);

    this.regionalChartOptions = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        spacingTop: 0,
        spacingBottom: 0,
        spacingLeft: 0,
        spacingRight: 0
      },
      title: {
        text: 'Разпределение на гласовете',
        style: { color: textColor }
      },
      tooltip: {
        pointFormat: '{series.name}: <b>{point.y}</b> ({point.percentage:.1f}%)'
      },
      accessibility: {
        point: {
          valueSuffix: '%'
        }
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          size: '85%',
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b>: {point.percentage:.1f} %',
            style: {
              color: textColor,
              textOutline: 'none',
              fontSize: '11px'
            },
            distance: 15,
            filter: {
              property: 'percentage',
              operator: '>',
              value: 2
            }
          }
        }
      },
      series: [{
        name: 'Гласове',
        colorByPoint: true,
        data: chartData
      }] as any,
      credits: { enabled: false }
    };
  }

  sortSections(column: keyof Section | 'totalPaper' | 'totalMachine', preserveDir: boolean = false): void {
    if (!preserveDir) {
      if (this.sectionSortColumn === (column as keyof Section)) {
        this.sectionSortDir = this.sectionSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sectionSortColumn = column as keyof Section;
        this.sectionSortDir = 'asc';
      }
    }

    this.filteredSections.sort((a, b) => {
      const valA = a[column as keyof Section];
      const valB = b[column as keyof Section];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.sectionSortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      const numA = (valA as number) || 0;
      const numB = (valB as number) || 0;
      return this.sectionSortDir === 'asc' ? numA - numB : numB - numA;
    });
  }

  sortParties(column: keyof PartyResult, preserveDir: boolean = false): void {
    if (!this.selectedSection) return;

    if (!preserveDir) {
      if (this.partySortColumn === column) {
        this.partySortDir = this.partySortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.partySortColumn = column;
        this.partySortDir = 'desc';
      }
    }

    this.selectedSection.partyResults.sort((a, b) => {
      const valA = a[column];
      const valB = b[column];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.partySortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      const numA = valA as number;
      const numB = valB as number;
      return this.partySortDir === 'asc' ? numA - numB : numB - numA;
    });
  }

  formatRegionName(name: string): string {
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[1].trim().toUpperCase();
    }
    return name.toUpperCase();
  }

  loadSectionDetails(section: Section): void {
    this.electionService.getSectionDetails(this.date, section.sectionId).subscribe(details => {
      this.selectedSection = details;
      this.currentSectionData = section;
      this.sortParties(this.partySortColumn, true);
      this.updateChartOptions();
      this.isModalOpen.set(true);
    });
  }

  private updateChartOptions(): void {
    if (!this.selectedSection) return;

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    const topResults = [...this.selectedSection.partyResults]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const data = topResults.map(r => ({
      name: r.partyName,
      y: r.total
    }));

    // Add "Others" to the chart if there are more than 10 parties
    if (this.selectedSection.partyResults.length > 10) {
      const othersTotal = this.selectedSection.partyResults
        .sort((a, b) => b.total - a.total)
        .slice(10)
        .reduce((sum, r) => sum + r.total, 0);

      if (othersTotal > 0) {
        data.push({
          name: 'Други',
          y: othersTotal
        });
      }
    }

    if (this.currentSectionData) {
      const nonVoters = Math.max(0, this.currentSectionData.total - this.currentSectionData.voted);
      if (nonVoters > 0) {
        data.push({
          name: 'Негласували',
          y: nonVoters
        });
      }
      if (this.currentSectionData.noVotes > 0) {
        data.push({
          name: 'Не подкрепя никого',
          y: this.currentSectionData.noVotes
        });
      }
    }

    // Sort data to show bigger slices first
    data.sort((a, b) => b.y - a.y);

    this.chartOptions = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        spacingTop: 0,
        spacingBottom: 0,
        spacingLeft: 0,
        spacingRight: 0
      },
      title: {
        text: 'Разпределение на гласовете',
        style: { color: textColor }
      },
      tooltip: {
        pointFormat: '{series.name}: <b>{point.y} ({point.percentage:.1f}%)</b>'
      },
      accessibility: {
        point: {
          valueSuffix: '%'
        }
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          size: '85%',
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b>: {point.percentage:.1f} %',
            style: {
              color: textColor,
              textOutline: 'none',
              fontSize: '11px'
            },
            distance: 15,
            filter: {
              property: 'percentage',
              operator: '>',
              value: 2
            }
          }
        }
      },
      series: [{
        name: 'Гласове',
        type: 'pie',
        data: data
      }],
      credits: {
        enabled: false
      }
    };
  }

  handleEscape(): void {
    this.closeModal();
    this.closeExportModal();
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  togglePartySelection(partyId: string): void {
    if (this.selectedPartyIds.has(partyId)) {
      this.selectedPartyIds.delete(partyId);
    } else {
      this.selectedPartyIds.add(partyId);
    }
  }

  closePartyFilter(): void {
    this.showPartyFilter = false;
  }

  togglePartyFilter(event: Event): void {
    event.stopPropagation();
    this.showPartyFilter = !this.showPartyFilter;
  }

  get filteredPartyResults(): PartyResult[] {
    if (!this.selectedSection) return [];
    return this.selectedSection.partyResults.filter(r => this.selectedPartyIds.has(r.partyId));
  }

  get othersResult(): PartyResult | null {
    if (!this.selectedSection) return null;

    const unselected = this.selectedSection.partyResults.filter(r => !this.selectedPartyIds.has(r.partyId));
    if (unselected.length === 0) return null;

    const total = unselected.reduce((sum, r) => sum + r.total, 0);
    const paper = unselected.reduce((sum, r) => sum + r.paper, 0);
    const machine = unselected.reduce((sum, r) => sum + r.machine, 0);
    const percent = unselected.reduce((sum, r) => sum + r.percent, 0);

    return {
      partyId: 'others',
      partyName: 'Останали',
      total,
      paper,
      machine,
      percent
    };
  }
}
