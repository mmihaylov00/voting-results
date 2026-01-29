import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { PartyResult, Section, SectionDetails, TableColumn, SECTION_COLUMNS, SectionTab, SectionFilters } from '../../models/election.models';
import { filterSections } from '../../utils/election-utils';
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
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { FormsModule } from '@angular/forms';
import { SectionDetailModalComponent } from './modals/section-detail-modal/section-detail-modal';
import { ExportCsvModalComponent } from './modals/export-csv-modal/export-csv-modal';
import { ProtocolErrorModalComponent } from './modals/protocol-error-modal/protocol-error-modal';
import { SectionFiltersComponent } from './section-filters/section-filters';

@Component({
  selector: 'app-election-detail',
  standalone: true,
  host: {
    '(document:keydown.escape)': 'handleEscape()',
    '(document:click)': 'closeColumnFilter()'
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
    HlmTooltipDirective,
    HlmCardHeaderDirective,
    HlmCardContentDirective,
    HlmCardDescriptionDirective,
    SectionDetailModalComponent,
    ExportCsvModalComponent,
    ProtocolErrorModalComponent,
    SectionFiltersComponent,
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
  activeTab = signal<SectionTab>('all');
  activityOperator = signal<'lte' | 'gte'>('lte');
  lowActivityThreshold: number | null = 100;
  avgRegionActivity: number = 0;
  totalElectors: number = 0;
  totalVoted: number = 0;
  totalInvalid: number = 0;
  totalNoVotes: number = 0;
  totalTop3Votes: number = 0;
  totalRegionMachine: number = 0;
  totalRegionPaper: number = 0;
  globalComparisons: { [key: string]: any[] } = {};

  sectionSortColumn: keyof Section = 'sectionId';
  sectionSortDir: 'asc' | 'desc' = 'asc';

  selectedPartyIds: Set<string> = new Set();
  allParties: { id: string, name: string }[] = [];
  isModalOpen = signal<boolean>(false);
  isExportModalOpen = signal<boolean>(false);
  isErrorModalOpen = signal<boolean>(false);
  copiedId = signal<string | null>(null);
  currentSectionData?: Section;
  regionalChartOptions: Highcharts.Options = {};

  availableColumns = SECTION_COLUMNS;
  visibleColumns = signal<Set<string>>(new Set(SECTION_COLUMNS.map(c => c.id)));
  showColumnFilter = false;

  getCikUrl(): string {
    if (this.date.startsWith('2023.04')) return 'https://results.cik.bg/ns2023/search/index.html#';
    if (this.date.startsWith('2024.06')) return 'https://results.cik.bg/europe2024/search/index.html';
    if (this.date.startsWith('2024.10')) return 'https://results.cik.bg/pe202410/search/index.html';
    return '';
  }

  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

  get sectionsWithError(): Section[] {
    return this.sections.filter(s => s.hasProtocolError);
  }

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
    });

    effect(() => {
      const anyModalOpen = this.isModalOpen() || this.isExportModalOpen() || this.isErrorModalOpen();
      if (anyModalOpen) {
        document.body.classList.add('overflow-hidden');
      } else {
        document.body.classList.remove('overflow-hidden');
      }
    });
  }

  openErrorModal(): void {
    this.isErrorModalOpen.set(true);
  }

  closeErrorModal(): void {
    this.isErrorModalOpen.set(false);
  }

  closeExportModal(): void {
    this.isExportModalOpen.set(false);
  }

  openExportModal(): void {
    this.isExportModalOpen.set(true);
  }

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
  }

  copyToClipboard(text: string, event: Event): void {
    event.stopPropagation();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.markAsCopied(text);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.markAsCopied(text);
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  }

  private markAsCopied(text: string): void {
    this.copiedId.set(text);
    setTimeout(() => {
      if (this.copiedId() === text) {
        this.copiedId.set(null);
      }
    }, 2000);
  }

  getGoogleMapsUrl(cityName: string, sectionName: string): string {
    const query = encodeURIComponent(`${cityName} ${sectionName}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  ngOnInit(): void {
    const savedColumns = localStorage.getItem('visible_columns');
    if (savedColumns) {
      try {
        const columnsArray = JSON.parse(savedColumns);
        if (Array.isArray(columnsArray)) {
          this.visibleColumns.set(new Set(columnsArray));
        }
      } catch (e) {
        console.error('Error parsing saved columns', e);
      }
    }

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
    const filters: SectionFilters = {
      searchTerm: this.searchTerm,
      activeTab: this.activeTab(),
      activityOperator: this.activityOperator(),
      lowActivityThreshold: this.lowActivityThreshold
    };

    this.filteredSections = filterSections(this.sections, filters);
    this.sortSections(this.sectionSortColumn, true);
  }

  onFilterChange(filters: SectionFilters): void {
    this.searchTerm = filters.searchTerm;
    this.activeTab.set(filters.activeTab);
    this.activityOperator.set(filters.activityOperator);
    this.lowActivityThreshold = filters.lowActivityThreshold;
    this.applyFilter();
  }

  toggleColumn(columnId: string, event: Event): void {
    event.stopPropagation();
    const newSet = new Set(this.visibleColumns());
    if (newSet.has(columnId)) {
      if (newSet.size > 1) { // Keep at least one column
        newSet.delete(columnId);
      }
    } else {
      newSet.add(columnId);
    }
    this.visibleColumns.set(newSet);
    localStorage.setItem('visible_columns', JSON.stringify(Array.from(newSet)));
  }

  toggleColumnFilter(event: Event): void {
    event.stopPropagation();
    this.showColumnFilter = !this.showColumnFilter;
  }

  closeColumnFilter(): void {
    this.showColumnFilter = false;
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

    // Aggregate comparisons for regional stats
    this.globalComparisons = {};
    if (this.sections.length > 0 && this.sections[0].comparisons) {
      Object.keys(this.sections[0].comparisons).forEach(key => {
        const aggregated: { [date: string]: { value: number, dateName: string } } = {};
        this.sections.forEach(s => {
          s.comparisons?.[key]?.forEach(c => {
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
      this.sections.forEach(s => {
        s.comparisons?.['total']?.forEach(c => electorsAggr[c.date] = (electorsAggr[c.date] || 0) + c.value);
        s.comparisons?.['voted']?.forEach(c => votedAggr[c.date] = (votedAggr[c.date] || 0) + c.value);
      });

      this.globalComparisons['activityPercent'] = Object.keys(electorsAggr).map(date => ({
        date,
        dateName: this.sections[0].comparisons?.['total']?.find(c => c.date === date)?.dateName || date,
        value: electorsAggr[date] > 0 ? votedAggr[date] / electorsAggr[date] : 0
      }));
    }

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
      this.isModalOpen.set(true);
    });
  }

  handleEscape(): void {
    this.closeModal();
    this.closeExportModal();
    this.closeErrorModal();
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

  sortSections(column: keyof Section, preserveDir: boolean = false) {
    if (this.sectionSortColumn === column && !preserveDir) {
      this.sectionSortDir = this.sectionSortDir === 'asc' ? 'desc' : 'asc';
    } else if (!preserveDir) {
      this.sectionSortColumn = column;
      this.sectionSortDir = (column === 'sectionId' || column === 'cityName' || column === 'sectionName') ? 'asc' : 'desc';
    }

    this.filteredSections.sort((a, b) => {
      const valA = a[this.sectionSortColumn];
      const valB = b[this.sectionSortColumn];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.sectionSortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return this.sectionSortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }
}
