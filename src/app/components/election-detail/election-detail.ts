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
    HighchartsChartComponent,
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
  selectedSectionTypes = signal<Set<string>>(new Set());
  highRiskOnly = signal<boolean>(false);
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
  activityChartOptions: Highcharts.Options = {};
  ppdbChartOptions: Highcharts.Options = {};

  availableColumns = SECTION_COLUMNS;
  visibleColumns = signal<Set<string>>(new Set(SECTION_COLUMNS.map(c => c.id)));
  showColumnFilter = false;
  groupByCity = signal<boolean>(false);
  groupedSections: any[] = [];
  isLoadingAllSections = signal<boolean>(false);

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
      // Show loading when loading all sections
      if (this.regionId === 'all' || !this.regionId) {
        this.isLoadingAllSections.set(true);
      }

      this.electionService.getSections(this.date, this.regionId).subscribe({
        next: (sections) => {
          // Use setTimeout to allow UI to update and show loading state
          setTimeout(() => {
            this.sections = sections;
            if (this.sections.length > 0) {
              if (this.regionId && this.regionId !== 'all') {
                this.regionName = this.formatRegionName((this.sections[0] as any).regionName);
              } else {
                this.regionName = 'Всички райони';
              }
              this.calculateAvgActivity();
              this.calculateRegionalStats();
            }
            this.applyFilter();
            this.sortSections(this.sectionSortColumn, true);
            this.isLoadingAllSections.set(false);
          }, 0);
        },
        error: (err) => {
          console.error('Error loading sections:', err);
          this.isLoadingAllSections.set(false);
        }
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
      lowActivityThreshold: this.lowActivityThreshold,
      sectionTypes: this.selectedSectionTypes(),
      highRiskOnly: this.highRiskOnly()
    };

    const result = filterSections(this.sections, filters);

    if (this.groupByCity()) {
      const groups = new Map<string, any>();
      result.forEach(s => {
        if (!groups.has(s.cityName)) {
          groups.set(s.cityName, {
            cityName: s.cityName,
            total: 0,
            voted: 0,
            discardedVotes: 0,
            noVotes: 0,
            totalMachine: 0,
            totalPaper: 0,
            riskySectionsCount: 0,
            riskySectionsList: [] as string[],
            partyVotes: {},
            sections: []
          });
        }
        const g = groups.get(s.cityName);
        g.total += s.total;
        g.voted += s.voted;
        g.discardedVotes += s.discardedVotes;
        g.noVotes += s.noVotes;
        g.totalMachine += (s.totalMachine || 0);
        g.totalPaper += (s.totalPaper || 0);
        if ((s.riskScore || 0) > 0) {
          g.riskySectionsCount++;
          g.riskySectionsList.push(s.sectionId);
        }
        g.sections.push(s);

        Object.entries(s.partyVotes).forEach(([pid, v]) => {
          if (!g.partyVotes[pid]) g.partyVotes[pid] = 0;
          g.partyVotes[pid] += v.total;
        });
      });

      this.groupedSections = Array.from(groups.values()).map(g => {
        const topParties = Object.entries(g.partyVotes)
          .map(([partyId, total]) => {
            const sectionWithParty = g.sections.find((s: any) => s.partyVotes[partyId]);
            const name = sectionWithParty?.topParties.find((tp: any) => tp.partyId === partyId)?.name || partyId;
            return {
              partyId,
              name,
              total: total as number,
              percent: g.voted > 0 ? (total as number) / g.voted : 0
            };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 3);

        // Calculate votesToFirst for grouped city
        let votesToFirst: number | undefined = undefined;
        if (topParties.length > 0) {
          // Find PP-DB partyId from allParties
          const ppdbParty = this.allParties.find(p => p.name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ'));
          const ppdbId = ppdbParty?.id;
          
          // Get PP-DB total votes from aggregated partyVotes
          const ppdbTotal = ppdbId && g.partyVotes[ppdbId] ? (g.partyVotes[ppdbId] as number) : 0;
          
          const isFirst = topParties[0].name.includes('ПП-ДБ');
          const ppdbInTop3 = topParties.find((tp: any) => tp.name.includes('ПП-ДБ'));

          if (isFirst) {
            votesToFirst = 0;
          } else if (ppdbInTop3) {
            votesToFirst = (topParties[0].total - ppdbInTop3.total) + 1;
          } else if (ppdbTotal > 0) {
            // PP-DB not in top 3, but we found it in partyVotes
            votesToFirst = (topParties[0].total - ppdbTotal) + 1;
          }
        }

        return {
          ...g,
          sectionId: `${g.sections.length} секции`,
          sectionName: '',
          riskScore: g.riskySectionsCount,
          risks: g.riskySectionsList.length > 0 ? g.riskySectionsList : [],
          activityPercent: g.total > 0 ? g.voted / g.total : 0,
          topParties,
          votesToFirst
        };
      });
      this.filteredSections = this.groupedSections;
    } else {
      this.filteredSections = result;
    }

    this.sortSections(this.sectionSortColumn, true);
  }

  toggleCityGrouping(): void {
    this.groupByCity.set(!this.groupByCity());
    this.applyFilter();
  }

  onFilterChange(filters: SectionFilters): void {
    const prevTab = this.activeTab();
    this.searchTerm = filters.searchTerm;
    this.activeTab.set(filters.activeTab);
    this.activityOperator.set(filters.activityOperator);
    this.lowActivityThreshold = filters.lowActivityThreshold;
    this.selectedSectionTypes.set(filters.sectionTypes);
    this.highRiskOnly.set(filters.highRiskOnly);

    if (prevTab !== filters.activeTab) {
      if (filters.activeTab === 'flip') {
        this.sectionSortColumn = 'votesToFirst';
        this.sectionSortDir = 'asc';
        // Ensure votesToFirst is visible
        const cols = new Set(this.visibleColumns());
        cols.add('votesToFirst');
        this.visibleColumns.set(cols);
      } else if (prevTab === 'flip') {
        this.sectionSortColumn = 'sectionId';
        this.sectionSortDir = 'asc';
      }
    }

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

      this.updateChartOptions(partyData);
    });
  }

  private updateChartOptions(partyData: { id: string, name: string, total: number }[]): void {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    const nonVoters = Math.max(0, this.totalElectors - this.totalVoted);

    const pieData = partyData.map(p => ({
      name: p.name,
      y: p.total
    }));

    if (nonVoters > 0) {
      pieData.push({
        name: 'Негласували',
        y: nonVoters
      });
    }

    if (this.totalNoVotes > 0) {
      pieData.push({
        name: 'Не подкрепя никого',
        y: this.totalNoVotes
      });
    }

    // Sort pie data to show bigger slices first
    pieData.sort((a, b) => b.y - a.y);

    this.regionalChartOptions = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
      },
      title: {
        text: 'Разпределение на гласовете',
        style: { color: textColor }
      },
      tooltip: {
        pointFormat: '{series.name}: <b>{point.y}</b> ({point.percentage:.1f}%)'
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b>: {point.percentage:.1f} %',
            style: {
              color: textColor,
              textOutline: 'none',
              fontSize: '11px'
            },
            filter: {
              property: 'percentage',
              operator: '>',
              value: 3
            }
          }
        }
      },
      series: [{
        name: 'Гласове',
        colorByPoint: true,
        data: pieData
      }] as any,
      credits: { enabled: false }
    };

    // ПП-ДБ Strategic Distribution
    let targetCount = 0;
    let swingCount = 0;
    let outsideCount = 0;
    let riskyCount = 0;
    let decliningCount = 0;

    this.sections.forEach(s => {
      const ppdbInTop = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));
      const isFirst = s.topParties.length > 0 && s.topParties[0].name.includes('ПП-ДБ');

      if (isFirst) {
        targetCount++;
      } else {
        if (ppdbInTop) {
          const firstParty = s.topParties[0];
          if (firstParty.percent - ppdbInTop.percent < 0.05) {
            swingCount++;
          }
        }
        if (s.activityPercent > 0.5) {
          riskyCount++;
        }
      }

      if (!ppdbInTop) {
        outsideCount++;
      }

      if (this.date !== '2023.04.02') {
        const ppdb = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));
        if (ppdb && ppdb.comparisons && ppdb.comparisons.length > 0) {
          if (ppdb.total < ppdb.comparisons[0].value) {
            decliningCount++;
          }
        }
      }
    });

    const ppdbCategories = ['Целеви', 'Люлеещи се', 'Извън топ 3', 'Рискови'];
    const ppdbData = [targetCount, swingCount, outsideCount, riskyCount];
    const ppdbColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

    if (this.date !== '2023.04.02') {
      ppdbCategories.push('Намаляващи');
      ppdbData.push(decliningCount);
      ppdbColors.push('#6366f1');
    }

    this.ppdbChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Секции по категории (ПП-ДБ)',
        style: { color: textColor }
      },
      xAxis: {
        categories: ppdbCategories,
        labels: { style: { color: textColor } }
      },
      yAxis: {
        title: { text: 'Брой секции', style: { color: textColor } },
        labels: { style: { color: textColor } },
        allowDecimals: false
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: 'Секции: <b>{point.y}</b>'
      },
      plotOptions: {
        column: {
          colorByPoint: true,
          colors: ppdbColors
        }
      },
      series: [{
        name: 'Секции',
        data: ppdbData
      }] as any,
      credits: { enabled: false }
    };

    // Activity distribution
    const activityBins = Array(10).fill(0);
    this.sections.forEach(s => {
      const bin = Math.min(Math.floor(s.activityPercent * 10), 9);
      activityBins[bin]++;
    });

    this.activityChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Разпределение на секциите по активност',
        style: { color: textColor }
      },
      xAxis: {
        categories: ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'],
        labels: { style: { color: textColor } }
      },
      yAxis: {
        title: { text: 'Брой секции', style: { color: textColor } },
        labels: { style: { color: textColor } }
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: 'Секции: <b>{point.y}</b>'
      },
      series: [{
        name: 'Секции',
        data: activityBins,
        color: '#10b981'
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
    if (this.groupByCity()) {
      const g = section as any;
      // Build a complete parties map from allParties (not just topParties)
      const partiesMap: { [id: string]: string } = {};
      this.allParties.forEach(p => {
        partiesMap[p.id] = p.name;
      });

      const partyResults: PartyResult[] = Object.entries(g.partyVotes as { [pid: string]: number }).map(([partyId, total]) => {
        // Find paper and machine votes by summing them from all sections in the group
        let paper = 0;
        let machine = 0;
        g.sections.forEach((s: Section) => {
          const v = s.partyVotes[partyId];
          if (v) {
            paper += v.paper;
            machine += v.machine;
          }
        });

        return {
          partyId,
          partyName: partiesMap[partyId] || partyId,
          total,
          paper,
          machine,
          percent: g.voted > 0 ? total / g.voted : 0
        };
      }).sort((a, b) => b.total - a.total);

      if (g.noVotes > 0) {
        partyResults.push({
          partyId: 'no_votes',
          partyName: 'Не подкрепя никого',
          total: g.noVotes,
          paper: g.totalPaper - partyResults.reduce((sum, r) => sum + r.paper, 0) - g.discardedVotes, // This might be wrong, better sum it
          machine: g.totalMachine - partyResults.reduce((sum, r) => sum + r.machine, 0), // Also potentially wrong
          percent: g.voted > 0 ? g.noVotes / g.voted : 0
        });
        // Actually, let's just sum paper/machine for noVotes too
        let noVotesPaper = 0;
        let noVotesMachine = 0;
        g.sections.forEach((s: Section) => {
          noVotesPaper += (s.noVotesPaper || 0);
          noVotesMachine += (s.noVotesMachine || 0);
        });
        const noVotesRes = partyResults.find(r => r.partyId === 'no_votes');
        if (noVotesRes) {
          noVotesRes.paper = noVotesPaper;
          noVotesRes.machine = noVotesMachine;
        }
      }

      const details: SectionDetails = {
        sectionId: g.cityName,
        cityName: g.cityName,
        sectionName: `Общо за ${g.sections.length} секции`,
        partyResults
      };

      // Create a virtual Section object for comparisons
      const currentSectionData: Section = {
        ...section,
        comparisons: {}
      };

      // Aggregate comparisons
      const comparisonKeys = ['total', 'voted', 'discardedVotes', 'noVotes', 'totalPaper', 'totalMachine', 'activityPercent'];
      comparisonKeys.forEach(key => {
        const aggregated: { [date: string]: { value: number, dateName: string } } = {};
        g.sections.forEach((s: Section) => {
          s.comparisons?.[key]?.forEach((c: any) => {
            if (!aggregated[c.date]) {
              aggregated[c.date] = { value: 0, dateName: c.dateName };
            }
            if (key === 'activityPercent') {
              // Activity percent needs to be handled carefully, we'll calculate it later
            } else {
              aggregated[c.date].value += c.value;
            }
          });
        });

        if (key === 'activityPercent') {
          const electorsAggr: { [date: string]: number } = {};
          const votedAggr: { [date: string]: number } = {};
          g.sections.forEach((s: Section) => {
            s.comparisons?.['total']?.forEach((c: any) => electorsAggr[c.date] = (electorsAggr[c.date] || 0) + c.value);
            s.comparisons?.['voted']?.forEach((c: any) => votedAggr[c.date] = (votedAggr[c.date] || 0) + c.value);
          });
          currentSectionData.comparisons![key] = Object.keys(electorsAggr).map(date => ({
            date,
            dateName: aggregated[date]?.dateName || date,
            value: electorsAggr[date] > 0 ? votedAggr[date] / electorsAggr[date] : 0
          }));
        } else {
          currentSectionData.comparisons![key] = Object.entries(aggregated).map(([date, data]) => ({
            date,
            dateName: data.dateName,
            value: data.value
          }));
        }
      });

      this.selectedSection = details;
      this.currentSectionData = currentSectionData;
      this.isModalOpen.set(true);
      return;
    }
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

    const valGetter = (s: any) => {
      let val = s[this.sectionSortColumn];
      if (this.sectionSortColumn === 'sectionId' && this.groupByCity()) {
        // Sort by the numeric number of sections in the group
        const match = val.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }
      return val;
    };

    this.filteredSections.sort((a, b) => {
      const valA = valGetter(a);
      const valB = valGetter(b);

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
