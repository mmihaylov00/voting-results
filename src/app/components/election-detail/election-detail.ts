import {Component, effect, OnInit, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute, RouterModule} from '@angular/router';
import {Observable} from 'rxjs';
import {ElectionService} from '../../services/election';
import {ThemeService} from '../../services/theme.service';
import {
  CandidateVotes,
  ComparativeValue,
  PartyResult,
  Region,
  RegionCandidate,
  Section,
  SECTION_COLUMNS,
  SectionDetails,
  SectionFilters,
  SectionTab,
  TableColumn,
  ViewMode
} from '../../models/election.models';
import {filterSections} from '../../utils/election-utils';
import {getPartyAlias} from '../../utils/party-aliases';
import { getPartyColor } from '../../utils/party-colors';
import {copyToClipboard as copyToClipboardUtil, formatActivity, getGoogleMapsUrl} from '../../utils/common.utils';
import {getDefaultSortDirection, sortArray} from '../../utils/table-sort.util';
import {formatRiskMessage} from '../../utils/risk-message.util';
import {candidateRiskAppliesToSection} from '../../utils/risk-utils';
import {loadVisibleColumns, saveVisibleColumns} from '../../utils/column-visibility';
import * as Highcharts from 'highcharts';
import {HighchartsChartComponent} from 'highcharts-angular';
import {HlmButtonDirective} from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../ui/table-helm/src/lib/hlm-table.directives';
import {HlmTypographyDirective} from '../ui/typography-helm/src/lib/hlm-typography.directive';
import {HlmCardDirective} from '../ui/card-helm/src/lib/hlm-card.directives';
import {HlmTooltipDirective} from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import {FormsModule} from '@angular/forms';
import {SectionDetailModalComponent} from './modals/section-detail-modal/section-detail-modal';
import {ExportCsvModalComponent} from './modals/export-csv-modal/export-csv-modal';
import {ProtocolErrorModalComponent} from './modals/protocol-error-modal/protocol-error-modal';
import {CandidateDetailModalComponent} from './modals/candidate-detail-modal/candidate-detail-modal';
import {SectionFiltersComponent} from './section-filters/section-filters';
import {PartyFilterComponent} from './party-filter/party-filter';
import {ComparisonOperatorInputComponent} from '../ui/comparison-operator-input/comparison-operator-input';
import {StatCardComponent} from '../ui/stat-card/stat-card';
import {RiskCategory, RiskFilterDropdownComponent} from '../ui/risk-filter-dropdown/risk-filter-dropdown';
import {SearchFilterComponent} from '../ui/search-filter/search-filter';
import {ColumnFilterComponent} from '../ui/column-filter/column-filter';
import { PartyBadgeComponent } from '../ui/party-badge/party-badge';

@Component({
  selector: 'app-election-detail',
  standalone: true,
  host: {
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
    HlmTooltipDirective,
    SectionDetailModalComponent,
    ExportCsvModalComponent,
    ProtocolErrorModalComponent,
    CandidateDetailModalComponent,
    SectionFiltersComponent,
    PartyFilterComponent,
    HighchartsChartComponent,
    ComparisonOperatorInputComponent,
    StatCardComponent,
    RiskFilterDropdownComponent,
    SearchFilterComponent,
    ColumnFilterComponent,
    PartyBadgeComponent,
  ],
  templateUrl: './election-detail.html',
  styleUrl: './election-detail.scss',
})
export class ElectionDetailComponent implements OnInit {
  private readonly leaderCandidateId = '101';
  loading$: Observable<boolean>;
  date: string = '';
  regionId: string = '';
  dateName: string = '';
  regionName: string = '';
  sections: Section[] = [];
  filteredSections: Section[] = [];
  selectedSection: SectionDetails | null = null;
  selectedCandidate: RegionCandidate | null = null;
  isCandidateModalOpen = signal<boolean>(false);
  searchTerm: string = '';
  activeTab = signal<SectionTab>('all');
  activityOperator = signal<'lte' | 'gte'>('lte');
  lowActivityThreshold: number | null = 100;
  selectedSectionTypes = signal<Set<string>>(new Set());
  riskFilterType = signal<'any' | 'none' | null>(null);
  selectedRiskCategories = signal<Set<string>>(new Set());
  avgRegionActivity: number = 0;
  totalElectors: number = 0;
  totalVoted: number = 0;
  totalInvalid: number = 0;
  totalNoVotes: number = 0;
  totalTop3Votes: number = 0;
  totalRegionMachine: number = 0;
  totalRegionPaper: number = 0;
  candidateVotesWithoutPreferences: number = 0;
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

  get filteredAvailableColumns(): TableColumn[] {
    if (this.viewMode() === 'candidates') {
      return this.candidateColumns;
    }
    // Hide regionName column when not viewing all sections
    if (this.regionId && this.regionId !== 'all') {
      return this.availableColumns.filter(c => c.id !== 'regionName');
    }
    return this.availableColumns;
  }

  get currentVisibleColumns(): Set<string> {
    if (this.viewMode() === 'candidates') {
      // For candidates, use a separate visible columns set
      return this.visibleCandidateColumns();
    }
    return this.visibleColumns();
  }

  visibleCandidateColumns = signal<Set<string>>(new Set());

  private getPartiesById(): { [id: string]: string } {
    const map: { [id: string]: string } = {};
    this.allParties.forEach(p => {
      map[p.id] = p.name;
    });
    return map;
  }

  private getSectionAllRiskIndicators(section: any): Array<{ code: string; category: string; severity: string; details?: any }> {
    const sectionRisks = section?.riskIndicators || [];
    const candidateRisks = (section?.candidateRiskIndicators || []).filter((risk: any) => candidateRiskAppliesToSection(risk, section));
    return [...sectionRisks, ...candidateRisks].filter(risk => risk.code !== 'R6.2' && risk.code !== 'R2.4');
  }

  getSectionRiskScore(section: any): number {
    if (section?.sections && Array.isArray(section.sections)) {
      return section.sections.reduce((total: number, s: any) => total + this.getSectionAllRiskIndicators(s).length, 0);
    }
    return this.getSectionAllRiskIndicators(section).length || 0;
  }

  getFormattedRisks(section: Section | any): string {
    const riskLines: string[] = [];
    const partiesById = this.getPartiesById();

    const allRiskIndicators = this.getSectionAllRiskIndicators(section);
    allRiskIndicators.forEach((indicator: any) => {
      const message = formatRiskMessage(indicator, {section, partiesById});
      riskLines.push(`${indicator.code}: ${message}`);
    });

    return riskLines.join('\n');
  }

  getFormattedCityRisks(groupedSection: any): string {
    const riskLines: string[] = [];
    const partiesById = this.getPartiesById();

    // Check if this is a grouped city (has sections array)
    if (groupedSection.sections && Array.isArray(groupedSection.sections)) {
      groupedSection.sections.forEach((section: Section) => {
        const allRiskIndicators = this.getSectionAllRiskIndicators(section as any);
        if (allRiskIndicators.length > 0) {
          allRiskIndicators.forEach((indicator: any) => {
            // Prefix each risk with section ID
            const message = formatRiskMessage(indicator, {section, partiesById});
            riskLines.push(`${section.sectionId}: ${indicator.code}: ${message}`);
          });
        }
      });
    }

    return riskLines.join('\n');
  }

  getFormattedCandidateRisks(candidate: RegionCandidate): string {
    const riskLines: string[] = [];
    const partiesById = this.getPartiesById();

    if (candidate.riskIndicators && candidate.riskIndicators.length > 0) {
      candidate.riskIndicators.forEach(indicator => {
        const message = formatRiskMessage(indicator, {candidate, partiesById});
        riskLines.push(`${indicator.code}: ${message}`);
      });
    }

    return riskLines.join('\n');
  }

  isLeaderCandidate(candidateId: string | number | null | undefined): boolean {
    return String(candidateId ?? '') === this.leaderCandidateId;
  }

  getLeaderTooltip(partyName: string): string {
    return `Водач на листата на ${getPartyAlias(partyName)}`;
  }

  viewMode = signal<ViewMode>('sections');
  groupByMode = signal<'none' | 'city' | 'municipality'>('none');
  groupedSections: any[] = [];
  isLoadingAllSections = signal<boolean>(false);
  isProcessingData = signal<boolean>(false);
  private neighborhoodCodeNameOverrides: { [key: string]: string } = {
    // Format: sectionId[2:6], e.g. 4602 => municipality 46, neighborhood 02
    '4601': 'Средец',
    '4602': 'Красно Село',
    '4603': 'Възраждане',
    '4604': 'Оборище',
    '4605': 'Сердика',
    '4606': 'Подуяне',
    '4607': 'Слатина',
    '4608': 'Изгрев',
    '4609': 'Лозенец',
    '4610': 'Триадица',
    '4611': 'Красна Поляна',
    '4612': 'Илинден',
    '4613': 'Надежда',
    '4614': 'Искър',
    '4615': 'Младост',
    '4616': 'Студентски',
    '4617': 'Витоша',
    '4618': 'Овча Купел',
    '4619': 'Люлин',
    '4620': 'Връбница',
    '4621': 'Нови Искър',
    '4622': 'Кремиковци',
    '4623': 'Панчарево',
    '4624': 'Банкя',
  };

  // Candidate data
  regionCandidates: RegionCandidate[] = [];
  filteredCandidates: RegionCandidate[] = [];
  candidateSearchTerm: string = '';
  candidatePreferenceOperator = signal<'lte' | 'gte'>('gte');
  candidatePreferenceThreshold: number | null = 0;
  selectedCandidatePartyIds = signal<Set<string>>(new Set());
  showLeadersOnly = signal<boolean>(false);
  candidateSortColumn: keyof RegionCandidate | 'risks' = 'total';
  candidateSortDir: 'asc' | 'desc' = 'desc';

  // Candidate risk filters
  candidateRiskFilterType = signal<'any' | 'none' | null>(null);
  selectedCandidateRiskCategories = signal<Set<string>>(new Set());

  riskCategories: RiskCategory[] = [
    {code: 'R1', label: 'Аномалии в активността', description: 'R1: Аномалии в активността и улавяне на гласове'},
    {code: 'R2', label: 'Разлика между хартия/машини', description: 'R2: Отклонения в съотношението хартия/машина'},
    {code: 'R3', label: 'Аномалии в невалидни гласове', description: 'R3: Аномалии в невалидните гласове'},
    {code: 'R4', label: 'Волатилност на резултатите', description: 'R4: Волатилност и чувствителност на резултата'},
    {
      code: 'R5',
      label: 'Аномалии в преференциите',
      description: 'R5: Аномалии в участието и активацията на преференции'
    },
    {code: 'R6', label: 'Концентрация на преференции', description: 'R6: Концентрация и ексклузивност на преференции'}
  ];

  get candidateRiskCategories(): RiskCategory[] {
    return this.riskCategories.filter(category => category.code !== 'R1' && category.code !== 'R3');
  }

  onCandidateRiskFilterTypeChange(type: 'any' | 'none' | null): void {
    this.candidateRiskFilterType.set(type);
    this.applyCandidateFilter();
  }

  onCandidateRiskCategoriesChange(categories: Set<string>): void {
    this.selectedCandidateRiskCategories.set(categories);
    this.applyCandidateFilter();
  }


  candidateColumns: TableColumn[] = [
    {id: 'candidateId', label: 'Номер'},
    {id: 'risks', label: 'Рискове'},
    {id: 'candidateName', label: 'Име'},
    {id: 'partyName', label: 'Партия'},
    {id: 'totalInRegion', label: 'Преференции'},
    {id: 'preferencePercentOfPartyVotes', label: '% от гласовете за партията'}
  ];

  getCikUrl(): string {
    if (this.date.startsWith('2023.04')) return 'https://results.cik.bg/ns2023/search/index.html#';
    if (this.date.startsWith('2024.06')) return 'https://results.cik.bg/europe2024/search/index.html';
    if (this.date.startsWith('2024.10')) return 'https://results.cik.bg/pe202410/search/index.html';
    if (this.date.startsWith('2026.04')) return 'https://results.cik.bg/pe202604/search/index.html';
    return '';
  }

  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ПРОГРЕСИВНА", "ПБ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

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

  formatActivity = formatActivity;
  getGoogleMapsUrl = getGoogleMapsUrl;

  toBp(value: number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return Math.round(value * 10000);
  }

  private isNationalView(): boolean {
    return !this.regionId || this.regionId === 'all';
  }

  private getEffectiveTotalElectors(sections: Section[]): number {
    const aggregatedTotal = sections.reduce((sum, s) => sum + s.total, 0);
    if (!this.isNationalView()) {
      return aggregatedTotal;
    }
    return this.electionService.getOfficialNationalElectors(this.date) ?? aggregatedTotal;
  }

  private getEffectiveComparisonTotalElectors(date: string, fallbackTotal: number): number {
    if (!this.isNationalView()) {
      return fallbackTotal;
    }
    return this.electionService.getOfficialNationalElectors(date) ?? fallbackTotal;
  }

  async copyToClipboard(text: string, event: Event): Promise<void> {
    event.stopPropagation();
    const success = await copyToClipboardUtil(text);
    if (success) {
      this.markAsCopied(text);
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

  ngOnInit(): void {
    const visibleColumns = loadVisibleColumns(
      'visible_columns',
      this.availableColumns.map(column => column.id),
      'columns'
    );
    if (visibleColumns) {
      this.visibleColumns.set(visibleColumns);
    }

    // Load candidate columns visibility
    const visibleCandidateColumns = loadVisibleColumns(
      'visible_candidate_columns',
      this.candidateColumns.map(column => column.id),
      'candidate columns'
    );
    this.visibleCandidateColumns.set(
      visibleCandidateColumns ?? new Set(this.candidateColumns.map(column => column.id))
    );

    this.date = this.route.snapshot.paramMap.get('date') || '';
    this.regionId = this.route.snapshot.paramMap.get('regionId') || '';
    this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;

    // Load all election data for comparisons
    this.electionService.getAllFullData().subscribe(data => {
      this.allData = data;
    });

    if (this.date) {
      // Show loading when loading all sections
      if (this.regionId === 'all' || !this.regionId) {
        this.isLoadingAllSections.set(true);
      }
      // Show processing state for all cases
      this.isProcessingData.set(true);

      this.electionService.getSections(this.date, this.regionId, true).subscribe({
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
            }
            this.applyFilter();
            this.sortSections(this.sectionSortColumn, true);
            if (this.viewMode() === 'candidates') {
              this.calculateRegionCandidates();
              this.applyCandidateFilter();
            }
            this.isLoadingAllSections.set(false);
            this.isProcessingData.set(false);
          }, 0);
        },
        error: (err) => {
          console.error('Error loading sections:', err);
          this.isLoadingAllSections.set(false);
          this.isProcessingData.set(false);
        }
      });
      this.electionService.getParties(this.date).subscribe(partiesMap => {
        this.allParties = Object.entries(partiesMap)
          .map(([id, name]) => ({id, name}))
          .filter(p => p.id !== '0')
          .sort((a, b) => {
            const numA = parseInt(a.id);
            const numB = parseInt(b.id);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.id.localeCompare(b.id);
          });

        // Add Others at the end if it exists
        if (partiesMap['0']) {
          this.allParties.push({id: '0', name: partiesMap['0']});
        }

        // Apply default selection
        const defaultCandidateParties = new Set<string>();
        this.allParties.forEach(party => {
          const name = party.name.toUpperCase();
          if (this.DEFAULT_KEYWORDS.some(k => name.includes(k))) {
            this.selectedPartyIds.add(party.id);
            defaultCandidateParties.add(party.id);
          }
        });
        this.selectedCandidatePartyIds.set(defaultCandidateParties);
      });
    }
  }

  applyFilter(): void {
    const regionTotals: { [regionId: string]: { total: number; voted: number } } = {};
    this.sections.forEach(s => {
      if (!regionTotals[s.regionId]) {
        regionTotals[s.regionId] = {total: 0, voted: 0};
      }
      regionTotals[s.regionId].total += s.total;
      regionTotals[s.regionId].voted += s.voted;
    });
    const regionAvgTurnoutById: { [regionId: string]: number } = {};
    Object.entries(regionTotals).forEach(([regionId, totals]) => {
      regionAvgTurnoutById[regionId] = totals.total > 0 ? Math.round((totals.voted / totals.total) * 10000) : 0;
    });

    const filters: SectionFilters = {
      searchTerm: this.searchTerm,
      activeTab: this.activeTab(),
      activityOperator: this.activityOperator(),
      lowActivityThreshold: this.lowActivityThreshold,
      sectionTypes: this.selectedSectionTypes(),
      riskFilterType: this.riskFilterType(),
      selectedRiskCategories: this.selectedRiskCategories(),
      isViewingAllSections: this.regionId === 'all' || !this.regionId
    };

    const municipalityByCode = this.getMunicipalityNameByCode();
    this.sections.forEach(s => {
      if (!s.municipalityName) {
        const code = this.getMunicipalityLookupKey(s.regionId, s.sectionId);
        const name = municipalityByCode.get(code);
        if (name) {
          s.municipalityName = this.stripSettlementPrefix(name);
        }
      }
    });

    const result = filterSections(this.sections, filters, regionAvgTurnoutById);

    if (this.groupByCity()) {
      const groupMode = this.groupByMode();
      const municipalityByCode = this.getMunicipalityNameByCode();
      const groups = new Map<string, any>();
      result.forEach(s => {
        const municipalityCode = this.getMunicipalityCode(s.sectionId);
        const municipalityLookupKey = this.getMunicipalityLookupKey(s.regionId, s.sectionId);
        const neighborhoodCode = this.getNeighborhoodCode(s.sectionId);
        const groupKey = groupMode === 'municipality'
          ? `${s.regionId}-${municipalityCode}-${neighborhoodCode}`
          : s.cityName;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            cityName: groupMode === 'municipality' ? '' : s.cityName,
            mainCityName: groupMode === 'municipality' ? undefined : s.cityName,
            fallbackCityName: groupMode === 'municipality' ? s.cityName : undefined,
            municipalityCode: groupMode === 'municipality' ? municipalityCode : undefined,
            neighborhoodCode: groupMode === 'municipality' ? neighborhoodCode : undefined,
            neighborhoodCounts: groupMode === 'municipality' ? {} : undefined,
            municipalityName: this.stripSettlementPrefix(municipalityByCode.get(municipalityLookupKey) || ''),
            regionId: s.regionId,
            regionName: s.regionName,
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
        const g = groups.get(groupKey);
        if (groupMode === 'municipality' && this.isMunicipalityMainCity(s.sectionId)) {
          g.mainCityName = s.cityName;
        }
        if (groupMode === 'municipality' && !g.fallbackCityName) {
          g.fallbackCityName = s.cityName;
        }
        if (groupMode === 'municipality') {
          const overrideKey = `${g.municipalityCode ?? ''}${g.neighborhoodCode ?? ''}`;
          const neighborhood = this.neighborhoodCodeNameOverrides[overrideKey];
          if (neighborhood) {
            g.neighborhoodCounts[neighborhood] = (g.neighborhoodCounts[neighborhood] || 0) + 1;
          }
        }
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
        if (groupMode === 'municipality') {
          const mainCityName = g.mainCityName || g.fallbackCityName || g.cityName;
          g.mainCityName = mainCityName;
          let baseName = this.formatMunicipalityDisplayName(mainCityName);
          const overrideKey = `${g.municipalityCode ?? ''}${g.neighborhoodCode ?? ''}`;
          if (this.neighborhoodCodeNameOverrides[overrideKey]) {
            baseName = this.neighborhoodCodeNameOverrides[overrideKey];
          }
          let neighborhoodName = '';
          if (g.neighborhoodCounts) {
            let max = 0;
            Object.entries(g.neighborhoodCounts).forEach(([name, count]: any) => {
              if (count > max) {
                max = count;
                neighborhoodName = name;
              }
            });
          }
          if (neighborhoodName) {
            g.cityName = `${neighborhoodName}`;
          } else if (g.neighborhoodCode && g.neighborhoodCode !== '00') {
            g.cityName = `${baseName}`;
          } else {
            g.cityName = baseName;
          }
        }
        const topParties = Object.entries(g.partyVotes)
          .map(([partyId, total]) => {
            const sectionWithParty = g.sections.find((s: any) => s.partyVotes[partyId]);
            const nameFromSections = sectionWithParty?.topParties.find((tp: any) => tp.partyId === partyId)?.name;
            const nameFromAllParties = this.allParties.find(p => p.id === partyId)?.name;
            const name = nameFromSections || nameFromAllParties || partyId;

            // Aggregate comparisons for this party from all sections
            const comparisonsMap: { [date: string]: ComparativeValue } = {};
            g.sections.forEach((s: Section) => {
              const partyVotes = s.partyVotes[partyId];
              if (partyVotes && partyVotes.comparisons) {
                partyVotes.comparisons.forEach((c: ComparativeValue) => {
                  if (!comparisonsMap[c.d]) {
                    comparisonsMap[c.d] = {v: 0, d: c.d};
                  }
                  comparisonsMap[c.d].v += c.v;
                });
              }
            });

            return {
              partyId,
              name,
              total: total as number,
              percentBp: g.voted > 0 ? Math.round(((total as number) / g.voted) * 10000) : 0,
              comparisons: Object.values(comparisonsMap)
            };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 3);

        // Aggregate candidate votes for grouped city
        const candidateVotesMap: {
          [key: string]: { candidateName: string, partyId: string, partyName: string, total: number }
        } = {};
        g.sections.forEach((s: Section) => {
          if (s.candidateVotes) {
            Object.values(s.candidateVotes).forEach(candidate => {
              const key = `${candidate.partyId}_${candidate.candidateName}`;
              if (!candidateVotesMap[key]) {
                candidateVotesMap[key] = {
                  candidateName: candidate.candidateName,
                  partyId: candidate.partyId,
                  partyName: candidate.partyName,
                  total: 0
                };
              }
              candidateVotesMap[key].total += candidate.total;
            });
          }
        });
        const topCandidates = Object.values(candidateVotesMap)
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

        // Aggregate comparisons for city group
        const comparisons: { [key: string]: ComparativeValue[] } = {};
        const comparisonKeys = ['total', 'voted', 'discardedVotes', 'noVotes', 'totalPaper', 'totalMachine', 'activityPercent'];

        comparisonKeys.forEach(key => {
          const aggregated: { [date: string]: { value: number } } = {};
          g.sections.forEach((s: Section) => {
            s.comparisons?.[key]?.forEach((c: any) => {
              if (!aggregated[c.d]) {
                aggregated[c.d] = {value: 0};
              }
              if (key === 'activityPercent') {
                // Activity percent needs to be handled carefully, we'll calculate it later
              } else {
                aggregated[c.d].value += c.v;
              }
            });
          });

          if (key === 'activityPercent') {
            const electorsAggr: { [date: string]: number } = {};
            const votedAggr: { [date: string]: number } = {};
            g.sections.forEach((s: Section) => {
              s.comparisons?.['total']?.forEach((c: any) => electorsAggr[c.d] = (electorsAggr[c.d] || 0) + c.v);
              s.comparisons?.['voted']?.forEach((c: any) => votedAggr[c.d] = (votedAggr[c.d] || 0) + c.v);
            });
            comparisons[key] = Object.keys(electorsAggr).map(date => ({
              d: date,
              v: electorsAggr[date] > 0 ? Math.round((votedAggr[date] / electorsAggr[date]) * 10000) : 0
            }));
          } else {
            comparisons[key] = Object.entries(aggregated).map(([date, data]) => ({
              d: date,
              v: data.value
            }));
          }
        });

        // Count all risks (including candidate risks) from all sections
        let totalRiskCount = 0;
        g.sections.forEach((s: Section) => {
          const sectionRiskIndicators = s.riskIndicators || [];
          const candidateRiskIndicators = (s as any).candidateRiskIndicators || [];
          const allRiskIndicators = [...sectionRiskIndicators, ...candidateRiskIndicators];
          totalRiskCount += allRiskIndicators.length;
        });

        return {
          ...g,
          sectionId: `${g.sections.length}`,
          sectionName: '',
          regionName: g.regionName,
          riskScore: totalRiskCount,
          activityBp: g.total > 0 ? Math.round((g.voted / g.total) * 10000) : 0,
          topParties,
          topCandidates,
          votesToFirst,
          comparisons
        };
      });
      this.filteredSections = this.groupedSections;
    } else {
      this.filteredSections = result;
    }

    this.sortSections(this.sectionSortColumn, true);

    // Update charts and stats based on filtered sections
    const statsSource = this.groupByCity() ? this.filteredSections : result;
    this.calculateAvgActivity(statsSource);
    this.calculateRegionalStats(statsSource);

    // Calculate region candidates if in candidates view
    if (this.viewMode() === 'candidates') {
      this.calculateRegionCandidates();
      this.applyCandidateFilter();
    }
  }

  allData: { [date: string]: { sections: Section[], parties: { [id: string]: string }, regions: Region[] } } = {};

  calculateCandidateComparisons(candidate: RegionCandidate): void {
    // Skip if allData is not loaded yet
    if (Object.keys(this.allData).length === 0) return;

    const dates = this.electionService.getDates();
    const comparisons: ComparativeValue[] = [];
    const paperComparisons: ComparativeValue[] = [];
    const machineComparisons: ComparativeValue[] = [];

    // Normalize candidate name and party for matching
    const candidateNameLower = candidate.candidateName.trim().toLowerCase();
    const candidatePartyLower = candidate.partyName.trim().toLowerCase();

    // Collect comparisons for all other dates
    dates.forEach(dateInfo => {
      if (dateInfo.date === this.date) return; // Skip current date

      const otherDateData = this.allData[dateInfo.date];
      if (!otherDateData || !otherDateData.sections) return;

      // Find candidate in other election by matching name and party
      let foundTotal = 0;
      let foundPaper = 0;
      let foundMachine = 0;

      // Filter sections by region if we have a specific region
      const otherSections = this.regionId && this.regionId !== 'all'
        ? otherDateData.sections.filter(s => s.regionId === this.regionId)
        : otherDateData.sections;

      // Optimize: only process sections that have candidateVotes
      for (const section of otherSections) {
        if (!section.candidateVotes) continue;

        for (const otherCandidate of Object.values(section.candidateVotes)) {
          // Match by candidate name and party name (case-insensitive, trimmed)
          const nameMatches = otherCandidate.candidateName.trim().toLowerCase() === candidateNameLower;
          const partyMatches = otherCandidate.partyName.trim().toLowerCase() === candidatePartyLower;

          if (nameMatches && partyMatches) {
            foundTotal += otherCandidate.total;
            foundPaper += otherCandidate.paper;
            foundMachine += otherCandidate.machine;
            break; // Found match, no need to check other candidates in this section
          }
        }
      }

      if (foundTotal > 0) {
        comparisons.push({v: foundTotal, d: dateInfo.date});
        paperComparisons.push({v: foundPaper, d: dateInfo.date});
        machineComparisons.push({v: foundMachine, d: dateInfo.date});
      }
    });

    // Ensure comparisons are sorted by date (newest first)
    // The `dates` array is already newest first, so they should be in order, but let's be safe
    const sortByDate = (a: ComparativeValue, b: ComparativeValue) => b.d.localeCompare(a.d);
    comparisons.sort(sortByDate);
    paperComparisons.sort(sortByDate);
    machineComparisons.sort(sortByDate);

    candidate.comparisons = comparisons.length > 0 ? comparisons : 'Не е участвал в други избори';
    candidate.paperComparisons = paperComparisons.length > 0 ? paperComparisons : 'Не е участвал в други избори';
    candidate.machineComparisons = machineComparisons.length > 0 ? machineComparisons : 'Не е участвал в други избори';
  }

  calculateRegionCandidates(): void {
    if (!this.sections || this.sections.length === 0) {
      this.regionCandidates = [];
      return;
    }

    // Aggregate candidate votes across all sections in the region
    const candidateMap: { [key: string]: RegionCandidate } = {};
    const regionPartyVotes: { [partyId: string]: number } = {};
    const regionPartyPreferenceVotes: { [partyId: string]: number } = {};
    let regionTotalVoted = 0;

    // First pass: aggregate party votes and total voted
    this.sections.forEach(section => {
      regionTotalVoted += section.voted;
      Object.entries(section.partyVotes).forEach(([partyId, votes]) => {
        regionPartyVotes[partyId] = (regionPartyVotes[partyId] || 0) + votes.total;
      });
    });

    // Second pass: aggregate candidate votes and risks
    this.sections.forEach(section => {
      if (section.candidateVotes) {
        Object.values(section.candidateVotes).forEach(candidate => {
          const key = `${candidate.partyId}_${candidate.candidateId}`;

          if (!candidateMap[key]) {
            const partyName = this.allParties.find(p => p.id === candidate.partyId)?.name || candidate.partyName;
            candidateMap[key] = {
              candidateId: candidate.candidateId,
              candidateName: candidate.candidateName,
              partyId: candidate.partyId,
              partyName: partyName,
              paper: 0,
              machine: 0,
              total: 0,
              totalInRegion: 0,
              partyPercentInRegion: 0,
              preferencePercentOfPartyVotes: 0,
              riskIndicators: []
            };
          }

          candidateMap[key].paper += candidate.paper;
          candidateMap[key].machine += candidate.machine;
          candidateMap[key].total += candidate.total;

          // Aggregate risks for this candidate from this section
          // Only add risks that match both candidateId AND partyId
          // Use candidateRiskIndicators if available (includes R6.2), otherwise use riskIndicators
          const risksToCheck = (section as any).candidateRiskIndicators || section.riskIndicators;
          if (risksToCheck) {
            risksToCheck.forEach((risk: any) => {
              if (risk.details && risk.details.candidateId) {
                // Match by candidateId (convert to string for comparison)
                const riskCandidateId = String(risk.details.candidateId);
                const candidateId = String(candidate.candidateId);

                // If partyId is in details, also match by partyId (for new data)
                // Otherwise, just match by candidateId (for backwards compatibility)
                const partyIdMatches = risk.details.partyId
                  ? risk.details.partyId === candidate.partyId
                  : true;

                if (riskCandidateId === candidateId && partyIdMatches) {
                  if (!candidateMap[key].riskIndicators) {
                    candidateMap[key].riskIndicators = [];
                  }

                  // For R5.1, R6.1, R6.2, R4.4, R2.4, and R5.2 risks, only add once per candidate (deduplicate by code)
                  const isUniqueRisk = risk.code === 'R5.1' || risk.code === 'R6.1' || risk.code === 'R6.2' || risk.code === 'R4.4' || risk.code === 'R2.4' || risk.code === 'R5.2';
                  if (isUniqueRisk) {
                    // Check if this risk code already exists for this candidate
                    const hasRisk = candidateMap[key].riskIndicators!.some(r => r.code === risk.code);
                    if (hasRisk) {
                      return; // Skip this risk, already added
                    }
                  }

                  candidateMap[key].riskIndicators!.push({
                    code: risk.code,
                    category: risk.category,
                    severity: risk.severity,
                    details: {
                      ...risk.details,
                      sectionId: section.sectionId
                    }
                  });
                }
              }
            });
          }
        });
      }
    });

    // Calculate totals and percentages
    Object.values(candidateMap).forEach(candidate => {
      candidate.totalInRegion = candidate.total;

      // Calculate party preference votes in region
      if (!regionPartyPreferenceVotes[candidate.partyId]) {
        regionPartyPreferenceVotes[candidate.partyId] = 0;
        this.sections.forEach(section => {
          if (section.candidateVotes) {
            Object.values(section.candidateVotes).forEach(c => {
              if (c.partyId === candidate.partyId) {
                regionPartyPreferenceVotes[candidate.partyId] += c.total;
              }
            });
          }
        });
      }

      const partyTotalInRegion = regionPartyVotes[candidate.partyId] || 0;
      const partyPreferenceVotesInRegion = regionPartyPreferenceVotes[candidate.partyId] || 0;

      candidate.partyPercentInRegion = regionTotalVoted > 0 ? (partyTotalInRegion / regionTotalVoted) * 100 : 0;
      candidate.preferencePercentOfPartyVotes = partyPreferenceVotesInRegion > 0 ? (candidate.total / partyPreferenceVotesInRegion) * 100 : 0;
    });

    this.regionCandidates = Object.values(candidateMap);
    this.sortCandidates(this.candidateSortColumn, true);

    // Calculate comparisons asynchronously after candidates are displayed
    // This prevents freezing the UI
    if (Object.keys(this.allData).length > 0) {
      setTimeout(() => {
        this.regionCandidates.forEach(candidate => {
          this.calculateCandidateComparisons(candidate);
        });
      }, 0);
    }
  }

  applyCandidateFilter(): void {
    let result = [...this.regionCandidates];

    // Search filter
    if (this.candidateSearchTerm) {
      const searchLower = this.candidateSearchTerm.toLowerCase();
      result = result.filter(c =>
        c.candidateName.toLowerCase().includes(searchLower) ||
        c.candidateId.toLowerCase().includes(searchLower) ||
        getPartyAlias(c.partyName).toLowerCase().includes(searchLower)
      );
    }

    // Party filter
    if (this.selectedCandidatePartyIds().size > 0) {
      result = result.filter(c => this.selectedCandidatePartyIds().has(c.partyId));
    }

    // Leaders filter (preference id 101)
    if (this.showLeadersOnly()) {
      result = result.filter(c => c.candidateId === '101');
    }

    // Preference filter (on totalInRegion, not percentage)
    if (this.candidatePreferenceThreshold !== null) {
      result = result.filter(c => {
        if (this.candidatePreferenceOperator() === 'lte') {
          return c.totalInRegion <= this.candidatePreferenceThreshold!;
        } else {
          return c.totalInRegion >= this.candidatePreferenceThreshold!;
        }
      });
    }

    // Risk filters
    if (this.candidateRiskFilterType() === 'any') {
      result = result.filter(c => {
        const hasRiskIndicators = c.riskIndicators && c.riskIndicators.length > 0;
        return hasRiskIndicators;
      });
    } else if (this.candidateRiskFilterType() === 'none') {
      result = result.filter(c => {
        const hasRiskIndicators = c.riskIndicators && c.riskIndicators.length > 0;
        return !hasRiskIndicators;
      });
    }

    // Filter by risk categories (R1, R2, R3, R4, R5, R6)
    if (this.selectedCandidateRiskCategories().size > 0) {
      result = result.filter(c => {
        if (!c.riskIndicators || c.riskIndicators.length === 0) return false;

        const candidateCategories = new Set(c.riskIndicators.map(ri => ri.category));
        // Check if candidate has at least one of the selected categories
        return Array.from(this.selectedCandidateRiskCategories()).some(cat => candidateCategories.has(cat));
      });
    }

    this.filteredCandidates = result;
    this.sortCandidates(this.candidateSortColumn, true);

    // Update charts and stats for candidates view
    if (this.viewMode() === 'candidates') {
      this.updateCandidateCharts();
      this.updateCandidateStats();
    }
  }

  sortCandidates(column: keyof RegionCandidate | 'risks', preserveDir: boolean = false) {
    if (!preserveDir) {
      if (this.candidateSortColumn === column) {
        this.candidateSortDir = this.candidateSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.candidateSortColumn = column;
        const isStringColumn = column === 'candidateId' || column === 'candidateName' || column === 'partyName';
        this.candidateSortDir = getDefaultSortDirection(column as string, isStringColumn);
      }
    }

    const valGetter = (c: RegionCandidate) => {
      if (this.candidateSortColumn === 'risks') {
        return c.riskIndicators?.length || 0;
      }
      return c[this.candidateSortColumn as keyof RegionCandidate];
    };

    const sorted = sortArray(
      this.filteredCandidates,
      this.candidateSortColumn,
      this.candidateSortDir,
      'bg',
      valGetter
    );

    // Update the array in place
    this.filteredCandidates.length = 0;
    this.filteredCandidates.push(...sorted);
  }

  onCandidatePartySelectionChange(selectedIds: Set<string>): void {
    this.selectedCandidatePartyIds.set(selectedIds);
    this.applyCandidateFilter();
  }

  getTopCandidates(section: Section) {
    const groupedTop = (section as any).topCandidates as Array<{ candidateId?: string; candidateName: string; partyId: string; partyName: string; total: number }> | undefined;
    if (groupedTop && groupedTop.length > 0) {
      return groupedTop.map(c => ({
        candidateId: c.candidateId ?? '',
        candidateName: c.candidateName,
        partyId: c.partyId,
        partyName: c.partyName,
        total: c.total
      }));
    }
    // Calculate top 3 candidates
    if (section.candidateVotes) {
      return Object.values(section.candidateVotes)
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map(c => ({
          candidateId: c.candidateId,
          candidateName: c.candidateName,
          partyId: c.partyId,
          partyName: c.partyName,
          total: c.total
        }));
    }
    return [];
  }

  updateCandidateCharts(): void {
    if (this.viewMode() !== 'candidates' || this.filteredCandidates.length === 0) return;

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    // Aggregate candidate votes by party
    const partyCandidateVotes: { [partyId: string]: { name: string, total: number } } = {};
    this.filteredCandidates.forEach(candidate => {
      if (!partyCandidateVotes[candidate.partyId]) {
        partyCandidateVotes[candidate.partyId] = {
          name: getPartyAlias(candidate.partyName),
          total: 0
        };
      }
      partyCandidateVotes[candidate.partyId].total += candidate.total;
    });

    const pieData = Object.values(partyCandidateVotes)
      .sort((a, b) => b.total - a.total)
      .map(p => ({
        name: p.name,
        y: p.total
      }));

    this.regionalChartOptions = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
      },
      title: {
        text: 'Разпределение на преференциите',
        style: {color: textColor}
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
        name: 'Преференции',
        colorByPoint: true,
        data: pieData
      }] as any
    };

    // Top candidates chart
    const topCandidates = [...this.filteredCandidates]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(c => ({
        name: `${c.candidateName} (${getPartyAlias(c.partyName)})`,
        y: c.total
      }));

    this.ppdbChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Топ 10 кандидати по преференции',
        style: {color: textColor}
      },
      xAxis: {
        categories: topCandidates.map(c => c.name),
        labels: {
          style: {color: textColor},
          rotation: -45,
          align: 'right'
        }
      },
      yAxis: {
        title: {
          text: 'Преференции',
          style: {color: textColor}
        },
        labels: {
          style: {color: textColor}
        }
      },
      tooltip: {
        pointFormat: 'Преференции: <b>{point.y}</b>'
      },
      series: [{
        name: 'Преференции',
        data: topCandidates.map(c => c.y),
        color: '#0ea5e9'
      }] as any
    };

    // Preference percentage by party
    const partyPreferencePercent: { [partyId: string]: { name: string, percent: number } } = {};
    const regionPartyVotes: { [partyId: string]: number } = {};
    const regionPartyPreferenceVotes: { [partyId: string]: number } = {};

    this.sections.forEach(section => {
      Object.entries(section.partyVotes).forEach(([partyId, votes]) => {
        regionPartyVotes[partyId] = (regionPartyVotes[partyId] || 0) + votes.total;
      });
      if (section.candidateVotes) {
        Object.values(section.candidateVotes).forEach(candidate => {
          regionPartyPreferenceVotes[candidate.partyId] = (regionPartyPreferenceVotes[candidate.partyId] || 0) + candidate.total;
        });
      }
    });

    Object.keys(regionPartyVotes).forEach(partyId => {
      const party = this.allParties.find(p => p.id === partyId);
      if (party) {
        const partyTotal = regionPartyVotes[partyId];
        const preferenceTotal = regionPartyPreferenceVotes[partyId] || 0;
        partyPreferencePercent[partyId] = {
          name: getPartyAlias(party.name),
          percent: partyTotal > 0 ? (preferenceTotal / partyTotal) * 100 : 0
        };
      }
    });

    const preferencePercentData = Object.values(partyPreferencePercent)
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 10);

    this.activityChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Процент преференции от гласовете за партията',
        style: {color: textColor}
      },
      xAxis: {
        categories: preferencePercentData.map(p => p.name),
        labels: {
          style: {color: textColor},
          rotation: -45,
          align: 'right'
        }
      },
      yAxis: {
        title: {
          text: 'Процент',
          style: {color: textColor}
        },
        labels: {
          style: {color: textColor},
          format: '{value}%'
        }
      },
      tooltip: {
        pointFormat: 'Преференции: <b>{point.y:.2f}%</b>'
      },
      series: [{
        name: 'Преференции %',
        data: preferencePercentData.map(p => p.percent),
        color: '#10b981'
      }] as any
    };
  }

  updateCandidateStats(): void {
    if (this.viewMode() !== 'candidates') return;

    // Get filtered party IDs from filtered candidates
    const filteredPartyIds = new Set(this.filteredCandidates.map(c => c.partyId));

    // Calculate preference stats from filtered candidates (for display)
    let totalPreferences = 0;
    let totalPreferencesPaper = 0;
    let totalPreferencesMachine = 0;
    this.filteredCandidates.forEach(candidate => {
      totalPreferences += candidate.total;
      totalPreferencesPaper += candidate.paper;
      totalPreferencesMachine += candidate.machine;
    });

    // Calculate ALL party votes and ALL preference votes for filtered parties
    // (not just from filtered candidates, but all preferences for those parties)
    const regionPartyVotes: { [partyId: string]: number } = {};
    const regionPartyPreferenceVotes: { [partyId: string]: number } = {};

    this.sections.forEach(section => {
      Object.entries(section.partyVotes).forEach(([partyId, votes]) => {
        if (filteredPartyIds.has(partyId)) {
          regionPartyVotes[partyId] = (regionPartyVotes[partyId] || 0) + votes.total;

          // Count ALL preference votes for this party (not just filtered candidates)
          if (section.candidateVotes) {
            Object.values(section.candidateVotes).forEach(candidate => {
              if (candidate.partyId === partyId) {
                regionPartyPreferenceVotes[partyId] = (regionPartyPreferenceVotes[partyId] || 0) + candidate.total;
              }
            });
          }
        }
      });
    });

    // Update stats for candidates view
    this.totalVoted = totalPreferences;
    this.totalRegionPaper = totalPreferencesPaper;
    this.totalRegionMachine = totalPreferencesMachine;

    // Calculate totals for filtered parties
    let totalPartyVotes = 0;
    let totalPartyPreferenceVotes = 0;
    filteredPartyIds.forEach(partyId => {
      totalPartyVotes += (regionPartyVotes[partyId] || 0);
      totalPartyPreferenceVotes += (regionPartyPreferenceVotes[partyId] || 0);
    });

    this.avgRegionActivity = totalPartyVotes > 0 ? (totalPartyPreferenceVotes / totalPartyVotes) * 100 : 0;

    // Update total electors to show total party votes for filtered parties
    this.totalElectors = totalPartyVotes;

    // Calculate votes without preferences = total party votes - total preference votes
    // This is already calculated correctly as totalElectors - totalPartyPreferenceVotes
    // But we need to store it separately for the stat card
    const votesWithoutPreferences = totalPartyVotes - totalPartyPreferenceVotes;

    // Store this in a property for the template
    this.candidateVotesWithoutPreferences = votesWithoutPreferences;
  }

  toggleCityGrouping(): void {
    this.groupByMode.set(this.groupByMode() === 'city' ? 'none' : 'city');
    this.applyFilter();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'cities') {
      this.groupByMode.set('city');
      this.applyFilter();
    } else if (mode === 'municipalities') {
      this.groupByMode.set('municipality');
      this.applyFilter();
    } else if (mode === 'sections') {
      this.groupByMode.set('none');
      this.applyFilter();
    } else if (mode === 'candidates') {
      this.groupByMode.set('none');
      this.calculateRegionCandidates();
      this.applyCandidateFilter();
    }
  }

  onFilterChange(filters: SectionFilters): void {
    const prevTab = this.activeTab();
    this.searchTerm = filters.searchTerm;
    this.activeTab.set(filters.activeTab);
    this.activityOperator.set(filters.activityOperator);
    this.lowActivityThreshold = filters.lowActivityThreshold;
    this.selectedSectionTypes.set(filters.sectionTypes);
    this.riskFilterType.set(filters.riskFilterType || null);
    this.selectedRiskCategories.set(filters.selectedRiskCategories || new Set());

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

  onColumnSelectionChange(selectedIds: Set<string>): void {
    if (this.viewMode() === 'candidates') {
      this.visibleCandidateColumns.set(selectedIds);
      saveVisibleColumns('visible_candidate_columns', selectedIds);
    } else {
      this.visibleColumns.set(selectedIds);
      saveVisibleColumns('visible_columns', selectedIds);
    }
  }


  private calculateAvgActivity(sections: Section[] = this.sections): void {
    if (sections.length === 0) {
      this.avgRegionActivity = 0;
      return;
    }
    const totalVoted = sections.reduce((sum, s) => sum + s.voted, 0);
    const totalElectors = this.getEffectiveTotalElectors(sections);
    this.avgRegionActivity = totalElectors > 0 ? totalVoted / totalElectors : 0;
  }

  private calculateRegionalStats(sections: Section[] = this.sections): void {
    if (sections.length === 0) return;

    this.totalElectors = this.getEffectiveTotalElectors(sections);
    this.totalVoted = sections.reduce((sum, s) => sum + s.voted, 0);
    this.totalInvalid = sections.reduce((sum, s) => sum + s.discardedVotes, 0);
    this.totalNoVotes = sections.reduce((sum, s) => sum + s.noVotes, 0);
    this.totalRegionMachine = sections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);
    this.totalRegionPaper = sections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);

    // Aggregate comparisons for regional stats
    this.globalComparisons = {};
    if (sections.length > 0 && sections[0].comparisons) {
      Object.keys(sections[0].comparisons).forEach(key => {
        const aggregated: { [date: string]: { value: number } } = {};
        sections.forEach(s => {
          s.comparisons?.[key]?.forEach(c => {
            if (!aggregated[c.d]) {
              aggregated[c.d] = {value: 0};
            }
            aggregated[c.d].value += c.v;
          });
        });
        this.globalComparisons[key] = Object.entries(aggregated).map(([date, data]) => ({
          d: date,
          v: data.value
        }));
      });

      // Special handling for avg activity percent
      const electorsAggr: { [date: string]: number } = {};
      const votedAggr: { [date: string]: number } = {};
      sections.forEach(s => {
        s.comparisons?.['total']?.forEach(c => electorsAggr[c.d] = (electorsAggr[c.d] || 0) + c.v);
        s.comparisons?.['voted']?.forEach(c => votedAggr[c.d] = (votedAggr[c.d] || 0) + c.v);
      });

      for (const date of Object.keys(electorsAggr)) {
        electorsAggr[date] = this.getEffectiveComparisonTotalElectors(date, electorsAggr[date]);
      }

      if (this.globalComparisons['total']) {
        this.globalComparisons['total'] = this.globalComparisons['total'].map(entry => ({
          ...entry,
          v: this.getEffectiveComparisonTotalElectors(entry.d, entry.v),
        }));
      }

      this.globalComparisons['activityPercent'] = Object.keys(electorsAggr).map(date => ({
        d: date,
        v: electorsAggr[date] > 0 ? Math.round((votedAggr[date] / electorsAggr[date]) * 10000) : 0
      }));
    }

    const regionalPartyVotes: { [partyId: string]: number } = {};
    sections.forEach(s => {
      Object.entries(s.partyVotes).forEach(([partyId, votes]) => {
        const voteTotal = typeof votes === 'number' ? votes : votes.total;
        regionalPartyVotes[partyId] = (regionalPartyVotes[partyId] || 0) + (voteTotal || 0);
      });
    });

    // Fallback for grouped sections if totals/party votes didn't aggregate as expected
    if (this.totalElectors === 0) {
      const nestedSections = sections.flatMap(s => (s as any).sections || []);
      if (nestedSections.length > 0) {
        this.totalElectors = this.getEffectiveTotalElectors(nestedSections);
        this.totalVoted = nestedSections.reduce((sum, s) => sum + s.voted, 0);
        this.totalInvalid = nestedSections.reduce((sum, s) => sum + s.discardedVotes, 0);
        this.totalNoVotes = nestedSections.reduce((sum, s) => sum + s.noVotes, 0);
        this.totalRegionMachine = nestedSections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);
        this.totalRegionPaper = nestedSections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);

        Object.keys(regionalPartyVotes).forEach(k => delete regionalPartyVotes[k]);
        nestedSections.forEach(s => {
          Object.entries(s.partyVotes).forEach(([partyId, votes]) => {
            const voteTotal = typeof votes === 'number' ? votes : (votes as any).total;
            regionalPartyVotes[partyId] = (regionalPartyVotes[partyId] || 0) + (voteTotal || 0);
          });
        });
      }
    }

    this.electionService.getParties(this.date).subscribe(partiesMap => {
      const partyData = Object.entries(regionalPartyVotes)
        .map(([id, total]) => ({
          id,
          name: partiesMap[id] || id,
          total
        }))
        .sort((a, b) => b.total - a.total);

      this.totalTop3Votes = partyData.slice(0, 3).reduce((sum, p) => sum + p.total, 0);

      this.updateChartOptions(partyData, sections);
    });
  }

  private updateChartOptions(partyData: {
    id: string,
    name: string,
    total: number
  }[], sections: Section[] = this.sections): void {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    const nonVoters = Math.max(0, this.totalElectors - this.totalVoted);

    const pieData = partyData.map(p => ({
      name: getPartyAlias(p.name),
      y: p.total,
      color: getPartyColor(p.name, isDark)
    }));

    if (nonVoters > 0) {
      pieData.push({
        name: 'Негласували',
        y: nonVoters,
        color: getPartyColor('Негласували', isDark)
      });
    }

    if (this.totalNoVotes > 0) {
      pieData.push({
        name: 'Не подкрепя никого',
        y: this.totalNoVotes,
        color: getPartyColor('Не подкрепя никого', isDark)
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
        style: {color: textColor}
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
      credits: {enabled: false}
    };

    // ПП-ДБ Strategic Distribution
    let targetCount = 0;
    let swingCount = 0;
    let outsideCount = 0;
    let riskyCount = 0;

    sections.forEach(s => {
      const ppdbInTop = s.topParties.find(tp => tp.name.includes('ПП-ДБ'));
      const isFirst = s.topParties.length > 0 && s.topParties[0].name.includes('ПП-ДБ');

      if (isFirst) {
        targetCount++;
      } else {
        if (ppdbInTop) {
          const firstParty = s.topParties[0];
          if ((firstParty.percentBp || 0) - (ppdbInTop.percentBp || 0) < 500) {
            swingCount++;
          }
        }
        if ((s.activityBp || 0) > 5000) {
          riskyCount++;
        }
      }

      if (!ppdbInTop) {
        outsideCount++;
      }

    });

    const ppdbCategories = ['Целеви', 'Люлеещи се', 'Извън топ 3', 'Рискови'];
    const ppdbData = [targetCount, swingCount, outsideCount, riskyCount];
    const ppdbColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];


    this.ppdbChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Секции по категории (ПП-ДБ)',
        style: {color: textColor}
      },
      xAxis: {
        categories: ppdbCategories,
        labels: {style: {color: textColor}}
      },
      yAxis: {
        title: {text: 'Брой секции', style: {color: textColor}},
        labels: {style: {color: textColor}},
        allowDecimals: false
      },
      legend: {enabled: false},
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
      credits: {enabled: false}
    };

    // Activity distribution
    const activityBins = Array(10).fill(0);
    sections.forEach(s => {
      const bin = Math.min(Math.floor((s.activityBp || 0) / 1000), 9);
      activityBins[bin]++;
    });

    this.activityChartOptions = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent'
      },
      title: {
        text: 'Разпределение на секциите по активност',
        style: {color: textColor}
      },
      xAxis: {
        categories: ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'],
        labels: {style: {color: textColor}}
      },
      yAxis: {
        title: {text: 'Брой секции', style: {color: textColor}},
        labels: {style: {color: textColor}}
      },
      legend: {enabled: false},
      tooltip: {
        pointFormat: 'Секции: <b>{point.y}</b>'
      },
      series: [{
        name: 'Секции',
        data: activityBins,
        color: '#10b981'
      }] as any,
      credits: {enabled: false}
    };
  }

  formatRegionName(name: string): string {
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[1].trim().toUpperCase();
    }
    return name.toUpperCase();
  }

  groupByCity(): boolean {
    return this.groupByMode() !== 'none';
  }

  isMunicipalityGrouping(): boolean {
    return this.groupByMode() === 'municipality';
  }

  getGroupMapCity(section: Section | any): string {
    if (!this.groupByCity()) return section.cityName;
    if (this.isMunicipalityGrouping()) {
      return section.mainCityName || section.cityName;
    }
    return section.cityName;
  }

  private getMunicipalityCode(sectionId: string): string {
    if (!sectionId || sectionId.length < 4) return '';
    return sectionId.slice(2, 4);
  }

  private getNeighborhoodCode(sectionId: string): string {
    if (!sectionId || sectionId.length < 6) return '';
    return sectionId.slice(4, 6);
  }

  private getMunicipalityLookupKey(regionId: string | undefined, sectionId: string): string {
    const municipalityCode = this.getMunicipalityCode(sectionId);
    if (!municipalityCode) return '';
    return `${regionId || ''}-${municipalityCode}`;
  }

  private getMunicipalityNameByCode(): Map<string, string> {
    const map = new Map<string, string>();
    this.sections.forEach(s => {
      const code = this.getMunicipalityLookupKey(s.regionId, s.sectionId);
      if (!code) {
        return;
      }

      if (!map.has(code)) {
        map.set(code, s.cityName);
      }

      if (this.isMunicipalityMainCity(s.sectionId)) {
        map.set(code, s.cityName);
      }
    });
    return map;
  }

  getMunicipalityName(section: Section | any): string {
    if (section?.municipalityName) return section.municipalityName;
    if (section?.sections && Array.isArray(section.sections) && section.sections.length > 0) {
      const first = section.sections[0] as Section;
      return this.getMunicipalityName(first);
    }
    if (!section?.sectionId) return '';
    const code = this.getMunicipalityLookupKey(section.regionId, section.sectionId);
    const municipalityByCode = this.getMunicipalityNameByCode();
    const name = municipalityByCode.get(code) || section.cityName || '';
    return this.stripSettlementPrefix(name);
  }

  private isMunicipalityMainCity(sectionId: string): boolean {
    return /001$/.test(sectionId || '');
  }

  private stripSettlementPrefix(name: string): string {
    if (!name) return name;
    return name.replace(/^(гр\.|с\.|кв\.|жк\.)\s*/i, '').trim();
  }

  private formatMunicipalityDisplayName(mainCityName: string): string {
    if (!mainCityName) return '';
    const municipalityName = this.stripSettlementPrefix(mainCityName);
    if (!municipalityName || municipalityName === mainCityName) return mainCityName;
    return `${municipalityName}`;
  }

  getPartyAlias = getPartyAlias;

  loadSectionDetails(section: Section): void {
    if (this.groupByCity()) {
      const g = section as any;
      // Build a complete parties map from allParties (not just topParties)
      const partiesMap: { [id: string]: string } = {};
      this.allParties.forEach(p => {
        partiesMap[p.id] = p.name;
      });

      // Aggregate voted comparisons for all dates (needed for percent calculations)
      const votedComparisonsMap: { [date: string]: number } = {};
      g.sections.forEach((s: Section) => {
        s.comparisons?.['voted']?.forEach((c: any) => {
          votedComparisonsMap[c.d] = (votedComparisonsMap[c.d] || 0) + c.v;
        });
      });

      const partyResults: PartyResult[] = Object.entries(g.partyVotes as {
        [pid: string]: number
      }).map(([partyId, total]) => {
        // Find paper and machine votes by summing them from all sections in the group
        let paper = 0;
        let machine = 0;

        // Aggregate comparisons for this party
        const comparisonsMap: { [date: string]: ComparativeValue } = {};
        const paperComparisonsMap: { [date: string]: ComparativeValue } = {};
        const machineComparisonsMap: { [date: string]: ComparativeValue } = {};
        const percentComparisonsMap: { [date: string]: ComparativeValue } = {};

        g.sections.forEach((s: Section) => {
          const v = s.partyVotes[partyId];
          if (v) {
            paper += v.paper;
            machine += v.machine;

            // Aggregate comparisons
            v.comparisons?.forEach((c: ComparativeValue) => {
              if (!comparisonsMap[c.d]) {
                comparisonsMap[c.d] = {v: 0, d: c.d};
              }
              comparisonsMap[c.d].v += c.v;
            });

            v.paperComparisons?.forEach((c: ComparativeValue) => {
              if (!paperComparisonsMap[c.d]) {
                paperComparisonsMap[c.d] = {v: 0, d: c.d};
              }
              paperComparisonsMap[c.d].v += c.v;
            });

            v.machineComparisons?.forEach((c: ComparativeValue) => {
              if (!machineComparisonsMap[c.d]) {
                machineComparisonsMap[c.d] = {v: 0, d: c.d};
              }
              machineComparisonsMap[c.d].v += c.v;
            });

            v.percentComparisons?.forEach((c: ComparativeValue) => {
              if (!percentComparisonsMap[c.d]) {
                percentComparisonsMap[c.d] = {v: 0, d: c.d};
              }
              // For percent comparisons, we need to aggregate differently - calculate from aggregated totals
              // We'll recalculate this after aggregating all sections
            });
          }
        });

        // Recalculate percent comparisons from aggregated totals
        // Store as decimal (0-1) since tooltip will multiply by 100
        const percentComparisons: ComparativeValue[] = [];
        Object.keys(comparisonsMap).forEach(date => {
          const totalVotedForDate = votedComparisonsMap[date] || 0;
          const percent = totalVotedForDate > 0 ? (comparisonsMap[date].v / totalVotedForDate) : 0;
          percentComparisons.push({
            d: date,
            v: Math.round(percent * 10000)
          });
        });

        return {
          partyId,
          partyName: partiesMap[partyId] || partyId,
          total,
          paper,
          machine,
          percent: g.voted > 0 ? total / g.voted : 0,
          percentBp: g.voted > 0 ? Math.round((total / g.voted) * 10000) : 0,
          comparisons: Object.values(comparisonsMap),
          paperComparisons: Object.values(paperComparisonsMap),
          machineComparisons: Object.values(machineComparisonsMap),
          percentComparisons: percentComparisons
        };
      }).sort((a, b) => b.total - a.total);

      if (g.noVotes > 0) {
        // Aggregate noVotes comparisons
        const noVotesComparisonsMap: { [date: string]: ComparativeValue } = {};
        const noVotesPaperComparisonsMap: { [date: string]: ComparativeValue } = {};
        const noVotesMachineComparisonsMap: { [date: string]: ComparativeValue } = {};
        const noVotesPercentComparisonsMap: { [date: string]: ComparativeValue } = {};

        g.sections.forEach((s: Section) => {
          s.comparisons?.['noVotes']?.forEach((c: any) => {
            if (!noVotesComparisonsMap[c.d]) {
              noVotesComparisonsMap[c.d] = {v: 0, d: c.d};
            }
            noVotesComparisonsMap[c.d].v += c.v;
          });

          s.comparisons?.['noVotesPaper']?.forEach((c: any) => {
            if (!noVotesPaperComparisonsMap[c.d]) {
              noVotesPaperComparisonsMap[c.d] = {v: 0, d: c.d};
            }
            noVotesPaperComparisonsMap[c.d].v += c.v;
          });

          s.comparisons?.['noVotesMachine']?.forEach((c: any) => {
            if (!noVotesMachineComparisonsMap[c.d]) {
              noVotesMachineComparisonsMap[c.d] = {v: 0, d: c.d};
            }
            noVotesMachineComparisonsMap[c.d].v += c.v;
          });

          s.comparisons?.['noVotesPercent']?.forEach((c: any) => {
            if (!noVotesPercentComparisonsMap[c.d]) {
              noVotesPercentComparisonsMap[c.d] = {v: 0, d: c.d};
            }
            // For percent, we'll recalculate from aggregated values
          });
        });

        // Recalculate noVotesPercent comparisons
        // Store as decimal (0-1) since tooltip will multiply by 100
        const noVotesPercentComparisons: ComparativeValue[] = [];
        Object.keys(noVotesComparisonsMap).forEach(date => {
          const totalVotedForDate = votedComparisonsMap[date] || 0;
          const percent = totalVotedForDate > 0 ? (noVotesComparisonsMap[date].v / totalVotedForDate) : 0;
          noVotesPercentComparisons.push({
            d: date,
            v: Math.round(percent * 10000)
          });
        });

        // Actually, let's just sum paper/machine for noVotes too
        let noVotesPaper = 0;
        let noVotesMachine = 0;
        g.sections.forEach((s: Section) => {
          noVotesPaper += (s.noVotesPaper || 0);
          noVotesMachine += (s.noVotesMachine || 0);
        });

        partyResults.push({
          partyId: 'no_votes',
          partyName: 'Не подкрепя никого',
          total: g.noVotes,
          paper: noVotesPaper,
          machine: noVotesMachine,
          percent: g.voted > 0 ? g.noVotes / g.voted : 0,
          percentBp: g.voted > 0 ? Math.round((g.noVotes / g.voted) * 10000) : 0,
          comparisons: Object.values(noVotesComparisonsMap),
          paperComparisons: Object.values(noVotesPaperComparisonsMap),
          machineComparisons: Object.values(noVotesMachineComparisonsMap),
          percentComparisons: noVotesPercentComparisons
        });
      }

      // Aggregate candidate votes from all sections in the group
      const aggregatedCandidateVotes: { [key: string]: CandidateVotes } = {};
      const votesWithoutPreferencesByParty: {
        [partyId: string]: { total: number, paper: number, machine: number }
      } = {};

      g.sections.forEach((s: Section) => {
        if (s.candidateVotes) {
          Object.values(s.candidateVotes).forEach(candidate => {
            const key = `${candidate.partyId}_${candidate.candidateId}`;
            if (!aggregatedCandidateVotes[key]) {
              aggregatedCandidateVotes[key] = {
                candidateId: candidate.candidateId,
                candidateName: candidate.candidateName,
                partyId: candidate.partyId,
                partyName: candidate.partyName,
                total: 0,
                paper: 0,
                machine: 0
              };
            }
            aggregatedCandidateVotes[key].total += candidate.total;
            aggregatedCandidateVotes[key].paper += candidate.paper;
            aggregatedCandidateVotes[key].machine += candidate.machine;
          });
        }

        // Calculate votes without preferences per party
        Object.entries(s.partyVotes).forEach(([partyId, partyVotes]) => {
          if (!votesWithoutPreferencesByParty[partyId]) {
            votesWithoutPreferencesByParty[partyId] = {total: 0, paper: 0, machine: 0};
          }

          // Get total preference votes for this party in this section
          let partyPreferenceVotes = 0;
          let partyPreferencePaper = 0;
          let partyPreferenceMachine = 0;

          if (s.candidateVotes) {
            Object.values(s.candidateVotes).forEach(candidate => {
              if (candidate.partyId === partyId) {
                partyPreferenceVotes += candidate.total;
                partyPreferencePaper += candidate.paper;
                partyPreferenceMachine += candidate.machine;
              }
            });
          }

          // Votes without preferences = party total - preference votes
          votesWithoutPreferencesByParty[partyId].total += partyVotes.total - partyPreferenceVotes;
          votesWithoutPreferencesByParty[partyId].paper += partyVotes.paper - partyPreferencePaper;
          votesWithoutPreferencesByParty[partyId].machine += partyVotes.machine - partyPreferenceMachine;
        });
      });

      // Calculate total votes without preferences
      const totalVotesWithoutPreferences = Object.values(votesWithoutPreferencesByParty).reduce((sum, v) => sum + v.total, 0);

      const details: SectionDetails = {
        sectionId: g.cityName,
        cityName: g.cityName,
        sectionName: `Общо за ${g.sections.length} секции`,
        partyResults,
        candidateVotes: Object.keys(aggregatedCandidateVotes).length > 0 ? aggregatedCandidateVotes : undefined,
        votesWithoutPreferences: totalVotesWithoutPreferences,
        votesWithoutPreferencesByParty: Object.keys(votesWithoutPreferencesByParty).length > 0 ? votesWithoutPreferencesByParty : undefined
      };

      // Aggregate risks from all sections (section-level + candidate-level)
      const aggregatedRiskIndicators: any[] = [];
      g.sections.forEach((s: Section) => {
        const sectionRisks = s.riskIndicators || [];
        sectionRisks.forEach((risk: any) => {
          aggregatedRiskIndicators.push({
            ...risk,
            details: {
              ...(risk.details || {}),
              sectionId: s.sectionId
            }
          });
        });

        const candidateRisks = (s as any).candidateRiskIndicators || [];
        candidateRisks.forEach((risk: any) => {
          aggregatedRiskIndicators.push({
            ...risk,
            details: {
              ...(risk.details || {}),
              sectionId: s.sectionId
            }
          });
        });
      });

      // Create a virtual Section object for comparisons with aggregated candidate votes
      // Get regionId from the first section in the group
      const firstSection = g.sections[0] as Section;
      const currentSectionData: Section = {
        ...section,
        regionId: firstSection.regionId, // Ensure regionId is set from the first section
        comparisons: {},
        candidateVotes: Object.keys(aggregatedCandidateVotes).length > 0 ? aggregatedCandidateVotes : undefined,
        riskIndicators: aggregatedRiskIndicators,
        riskScore: aggregatedRiskIndicators.length
      };

      // Aggregate comparisons
      const comparisonKeys = ['total', 'voted', 'discardedVotes', 'noVotes', 'totalPaper', 'totalMachine', 'activityPercent', 'noVotesPaper', 'noVotesMachine', 'noVotesPercent'];
      comparisonKeys.forEach(key => {
        const aggregated: { [date: string]: { value: number } } = {};
        g.sections.forEach((s: Section) => {
          s.comparisons?.[key]?.forEach((c: any) => {
            if (!aggregated[c.d]) {
              aggregated[c.d] = {value: 0};
            }
            if (key === 'activityPercent' || key === 'noVotesPercent') {
              // Activity percent and noVotesPercent need to be handled carefully, we'll calculate them later
            } else {
              aggregated[c.d].value += c.v;
            }
          });
        });

        if (key === 'activityPercent') {
          const electorsAggr: { [date: string]: number } = {};
          const votedAggr: { [date: string]: number } = {};
          g.sections.forEach((s: Section) => {
            s.comparisons?.['total']?.forEach((c: any) => electorsAggr[c.d] = (electorsAggr[c.d] || 0) + c.v);
            s.comparisons?.['voted']?.forEach((c: any) => votedAggr[c.d] = (votedAggr[c.d] || 0) + c.v);
          });
          currentSectionData.comparisons![key] = Object.keys(electorsAggr).map(date => ({
            d: date,
            v: electorsAggr[date] > 0 ? Math.round((votedAggr[date] / electorsAggr[date]) * 10000) : 0
          }));
        } else if (key === 'noVotesPercent') {
          const noVotesAggr: { [date: string]: number } = {};
          const votedAggr: { [date: string]: number } = {};
          g.sections.forEach((s: Section) => {
            s.comparisons?.['noVotes']?.forEach((c: any) => noVotesAggr[c.d] = (noVotesAggr[c.d] || 0) + c.v);
            s.comparisons?.['voted']?.forEach((c: any) => votedAggr[c.d] = (votedAggr[c.d] || 0) + c.v);
          });
          // Store as decimal (0-1) since tooltip will multiply by 100
          currentSectionData.comparisons![key] = Object.keys(noVotesAggr).map(date => ({
            d: date,
            v: votedAggr[date] > 0 ? Math.round((noVotesAggr[date] / votedAggr[date]) * 10000) : 0
          }));
        } else {
          currentSectionData.comparisons![key] = Object.entries(aggregated).map(([date, data]) => ({
            d: date,
            v: data.value
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

  openCandidateModal(candidate: RegionCandidate): void {
    this.selectedCandidate = candidate;
    this.isCandidateModalOpen.set(true);
  }

  closeCandidateModal(): void {
    this.isCandidateModalOpen.set(false);
    this.selectedCandidate = null;
  }

  onCandidateSectionClick(section: Section): void {
    this.closeCandidateModal();
    this.loadSectionDetails(section);
  }

  onSectionCandidateClick(candidate: RegionCandidate): void {
    this.closeModal();
    this.selectedCandidate = candidate;
    this.isCandidateModalOpen.set(true);
  }

  handleEscape(): void {
    this.closeModal();
    this.closeExportModal();
    this.closeErrorModal();
    this.closeCandidateModal();
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
    if (!preserveDir) {
      if (this.sectionSortColumn === column) {
        this.sectionSortDir = this.sectionSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sectionSortColumn = column;
        const isStringColumn = column === 'sectionId' || column === 'cityName' || column === 'sectionName' || column === 'regionName';
        this.sectionSortDir = getDefaultSortDirection(column as string, isStringColumn);
      }
    }

    const valGetter = (s: Section) => {
      let val = s[this.sectionSortColumn];
      if (this.sectionSortColumn === 'sectionId' && this.groupByCity()) {
        // Sort by the numeric number of sections in the group
        const match = String(val).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }
      if (this.sectionSortColumn === 'riskScore') {
        return this.getSectionRiskScore(s as any);
      }
      if (this.sectionSortColumn === 'regionName') {
        // Handle undefined regionName
        return val || '';
      }
      if (this.sectionSortColumn === 'municipalityName') {
        return this.getMunicipalityName(s as any) || '';
      }
      return val;
    };

    const sorted = sortArray(
      this.filteredSections,
      this.sectionSortColumn,
      this.sectionSortDir,
      'bg',
      valGetter
    );

    // Update the array in place
    this.filteredSections.length = 0;
    this.filteredSections.push(...sorted);
  }
}
