import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { forkJoin, Subscription } from 'rxjs';
import { ForensicsFinding, ForensicsGroup, ForensicsReport, ForensicsSection, SectionFilters, SectionSort } from './forensics.models';
import { filterSections, placeValue, safeSourceLinks, sectionLabel, signed } from './forensics.util';
import { ForensicsGroupTableComponent } from './forensics-group-table';
import { ForensicsMapComponent } from './forensics-map';
import { hydrateSectionRecord } from './forensics-record.util';
import { ForensicsHypothesesComponent } from './forensics-hypotheses';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent, MapIconName } from '../ui/map-icon/map-icon';
import { candidateDelta, hasReviewFlag, jointVoteSummary } from './forensics-candidates.util';
import { getPartyColor } from '../../utils/party-colors';
import { ThemeService } from '../../services/theme.service';
import { ForensicsHistoryComponent } from './forensics-history';
import { ForensicsVoteSummaryComponent } from './forensics-vote-summary';
import { ViewTab, ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { SignedChangeDirective } from '../ui/signed-change/signed-change';

const DATA_ROOT = '/data/forensics/2026';
const initialFilters: SectionFilters = {
  focus: false, regionId: '', search: '', size: '', method: '', comparableOnly: true,
  flaggedOnly: false, sort: 'deltaTurnoutPp', descending: true,
};

@Component({
  selector: 'app-electoral-forensics',
  imports: [CommonModule, FormsModule, RouterLink, HighchartsChartComponent, ForensicsGroupTableComponent, ForensicsMapComponent, ForensicsHypothesesComponent, HlmButtonDirective, MapIconComponent, ForensicsHistoryComponent, ForensicsVoteSummaryComponent, ViewTabsComponent, SignedChangeDirective],
  templateUrl: './electoral-forensics.html',
  styleUrls: ['./electoral-forensics.scss', './forensics-workspace.scss', './forensics-tables.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElectoralForensicsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly theme = inject(ThemeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly originalRobots = this.meta.getTag('name="robots"')?.getAttribute('content') ?? null;
  private readonly originalTitle = this.title.getTitle();
  private detailSubscription?: Subscription;
  private sectionObserver?: IntersectionObserver;
  private observationFrame?: number;
  private readonly detailCache = new Map<string, ForensicsSection>();
  readonly focus = this.route.snapshot.data['researchQuery'] === 'query2';
  readonly pagePath = this.focus ? '/research/runoff-mobilization-2026' : '/research/electoral-forensics-2026';
  readonly report = signal<ForensicsReport | null>(null);
  readonly sections = signal<ForensicsSection[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly filters = signal<SectionFilters>({ ...initialFilters, focus: this.focus });
  readonly page = signal(0);
  readonly selected = signal<ForensicsSection | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly pageSize = 30;
  readonly showSectionDetails = signal(false);
  readonly placeLevel = signal('municipalities');
  readonly overviewView = signal('charts');
  readonly explorerView = signal('map');
  readonly reviewView = signal(this.route.snapshot.fragment === 'candidate-review' ? 'candidate' : this.route.snapshot.fragment === 'added-review' ? 'added' : 'turnout');
  readonly statsView = signal(this.route.snapshot.fragment === 'hypotheses' ? 'general' : 'candidates');
  readonly inspectorRound = signal('2026.10.25');
  readonly inspectorHistoryDate = signal('2026.04.19');
  readonly overviewTabs: ViewTab[] = [
    { id: 'charts', label: 'Графики' }, { id: 'regions', label: 'Райони' },
    { id: 'size', label: 'Размер на секцията' }, { id: 'method', label: 'Метод на гласуване' },
    { id: 'controls', label: 'Сходни секции' }, { id: 'observations', label: 'Наблюдения' },
  ];
  readonly explorerTabs: ViewTab[] = [{ id: 'map', label: 'Карта' }, { id: 'table', label: 'Секционна таблица' }];
  readonly placeTabs: ViewTab[] = [{ id: 'municipalities', label: 'Общини' }, { id: 'settlements', label: 'Населени места' }];
  readonly statsTabs: ViewTab[] = [
    { id: 'candidates', label: 'Кандидатски ръст' },
    { id: 'general', label: this.focus ? 'H1-H5 · До 400 избиратели' : 'Активност · H1-H5' },
    ...(this.focus ? [{ id: 'national', label: 'H1-H5 · Всички размери' }] : []),
  ];
  readonly roundTabs: ViewTab[] = [{ id: '2026.10.25', label: 'I тур · 25 октомври' }, { id: '2026.11.01', label: 'II тур · 1 ноември' }];
  readonly reviewTabs = computed<ViewTab[]>(() => [
    { id: 'turnout', label: 'Активност', count: this.findings().length },
    { id: 'candidate', label: 'Кандидатски ръст', count: this.query()?.candidateReview?.length ?? 0 },
    { id: 'added', label: 'Дописани избиратели', count: this.query()?.addedElectorReview?.length ?? 0 },
    { id: 'clusters', label: 'Териториални групи', count: this.clusters().length },
  ]);
  readonly historyTabs = computed<ViewTab[]>(() => Object.keys(this.selected()?.history ?? {}).sort().reverse().map(date => ({ id: date, label: date })));
  readonly selectedHistoryDate = computed(() => this.historyTabs().some(tab => tab.id === this.inspectorHistoryDate()) ? this.inspectorHistoryDate() : this.historyTabs()[0]?.id ?? '');
  readonly activeSection = signal('results');
  readonly navigation: { id: string; label: string; icon: MapIconName }[] = [
    { id: 'results', label: 'Обобщение', icon: 'summary' },
    { id: 'geography', label: 'Карта и секции', icon: 'region' },
    { id: 'places', label: 'По места', icon: 'municipality' },
    { id: 'review', label: 'За преглед', icon: 'risks' },
    { id: 'candidate-checks', label: 'Проверки', icon: 'target' },
    { id: 'historical-runoffs', label: 'Балотажи', icon: 'calendar' },
    { id: 'sources', label: 'Източници', icon: 'history' },
  ];
  readonly dataRoot = DATA_ROOT;
  readonly queryCsvPrefix = this.focus ? 'query2' : 'query1';
  readonly presidentialDates = ['2026.10.25', '2026.11.01'];
  readonly signed = signed;
  readonly placeValue = placeValue;
  readonly sectionLabel = sectionLabel;
  readonly safeSourceLinks = safeSourceLinks;
  readonly candidateDelta = candidateDelta;
  readonly hasReviewFlag = hasReviewFlag;
  readonly jointTotals = computed(() => jointVoteSummary(this.filtered()));
  readonly overviewTotals = computed(() => jointVoteSummary(this.sections().filter(row => !this.focus || row.small400)));
  readonly activeFilterCount = computed(() => {
    const filters = this.filters();
    return [filters.regionId, filters.search.trim(), filters.size, filters.method, filters.flaggedOnly, !filters.comparableOnly].filter(Boolean).length;
  });
  readonly reviewSort = signal<'deltaTurnoutPp' | 'candidate4Delta' | 'candidate25Delta'>('deltaTurnoutPp');
  readonly reviewDescending = signal(true);
  exclusionReasons(row: ForensicsSection): string[] {
    return [...new Set([...row.exclusionReasons, ...(row.analysisExclusions ?? [])])];
  }
  readonly query = computed(() => this.focus ? this.report()?.query2 : this.report()?.query1);
  readonly filtered = computed(() => filterSections(this.sections(), this.filters()));
  readonly visible = computed(() => this.filtered().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly methods = computed(() => [...new Set(this.sections().map(row => row.method2))].sort());
  readonly unverifiedHistorical = computed(() => this.sections().some(row => row.history['2024.10.27']?.verified === false));
  readonly sizes = computed(() => [...new Set(this.sections().filter(row => !this.focus || row.small400).map(row => row.sizeGroup))]);
  readonly regionSummary = computed(() => this.query()?.regions ?? []);
  readonly districts = computed(() => (this.report()?.regions ?? []).filter(row => Number(row.key) <= 31).sort((a, b) => Number(a.key) - Number(b.key)));
  readonly currentGroups = computed(() => this.query()?.municipalities ?? []);
  readonly currentSettlements = computed(() => this.query()?.settlements ?? []);
  readonly regionChart = computed(() => this.jointDistrictChart());
  readonly binChart = computed(() => this.groupChart(this.query()?.binSummary ?? [], 'Промяна по размер на секцията'));
  readonly flagged = computed(() => this.filtered().filter(hasReviewFlag));
  private readonly sectionIndex = computed(() => new Map(this.sections().map(row => [row.sectionId, row])));
  readonly findings = computed(() => {
    const ids = new Set(this.query()?.findings ?? []);
    return (this.report()?.findings ?? []).filter(row => ids.has(row.sectionId));
  });
  readonly sortedFindings = computed(() => {
    const key = this.reviewSort();
    const value = (row: ForensicsFinding) => key === 'candidate4Delta'
      ? candidateDelta(row, '4') : key === 'candidate25Delta' ? candidateDelta(row, '25') : row.deltaTurnoutPp;
    return [...this.findings()].sort((a, b) => {
      const left = value(a); const right = value(b);
      if (left === null) return right === null ? a.sectionId.localeCompare(b.sectionId) : 1;
      if (right === null) return -1;
      return (this.reviewDescending() ? right - left : left - right) || a.sectionId.localeCompare(b.sectionId);
    });
  });
  readonly selectedFinding = computed(() => this.report()?.findings.find(row => row.sectionId === this.selected()?.sectionId));
  readonly sampleCounts = computed(() => {
    const rows = this.sections().filter(row => !this.focus || row.small400);
    return { sections: rows.length, eligible: rows.filter(row => row.eligible !== false && row.comparableRoundPair).length, review: this.findings().length };
  });
  readonly keyResults = computed(() => {
    const query = this.query();
    if (!query) return [];
    const mean = query.summary['meanDeltaPp'];
    const ci = query.summary['meanDeltaCi95'];
    const interval = Array.isArray(ci) && ci.length === 2 ? ` (95% интервал ${signed(ci[0])} до ${signed(ci[1])})` : '';
    return [
      typeof mean === 'number' ? `Средна секционна промяна: ${signed(mean)} п.п.${interval}.` : '',
      typeof query.summary['positiveDeltaN'] === 'number' ? `Ръст на активността в ${this.count(query.summary['positiveDeltaN'])} сравними секции.` : '',
      `${this.count(query.comparison.matchedN)} от ${this.count(query.comparison.targetN)} секции имат съпоставени контроли от друг изборен район.`,
    ].filter(Boolean);
  });
  readonly totals = computed(() => this.filtered().reduce((sum, row) => ({
    registered1: sum.registered1 + (row.registered1 ?? 0), registered2: sum.registered2 + (row.registered2 ?? 0),
    voted1: sum.voted1 + (row.voted1 ?? 0), voted2: sum.voted2 + (row.voted2 ?? 0),
  }), { registered1: 0, registered2: 0, voted1: 0, voted2: 0 }));
  readonly clusters = computed(() => {
    const report = this.report();
    if (!report) return [];
    const scoped = this.query()?.clusters;
    if (scoped) return scoped;
    const ids = this.query()?.clusterIds ?? [];
    return report.clusters.filter(cluster => !this.focus || ids.includes(cluster.id));
  });

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow,noarchive' });
    this.title.setTitle(this.focus ? 'Мобилизация между туровете - изследване 2026' : 'Изборни модели - изследване 2026');
    this.load();
  }

  ngOnDestroy(): void {
    this.detailSubscription?.unsubscribe();
    this.sectionObserver?.disconnect();
    if (this.observationFrame !== undefined) cancelAnimationFrame(this.observationFrame);
    if (this.originalRobots === null) this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: this.originalRobots });
    this.title.setTitle(this.originalTitle);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      report: this.http.get<ForensicsReport>(`${DATA_ROOT}/report.json`),
      sections: this.http.get<ForensicsSection[]>(`${DATA_ROOT}/sections.json`),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ report, sections }) => {
        if (!report.query1 || !report.query2 || !Array.isArray(sections)) {
          this.error.set('Файловете с анализа са непълни. Опитайте отново след обновяване на данните.');
        } else {
          this.report.set(report);
          this.sections.set(sections);
          this.observeNavigation();
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Анализът не можа да бъде зареден. Проверете връзката и опитайте отново.');
        this.loading.set(false);
      },
    });
  }

  setFilter<K extends keyof SectionFilters>(key: K, value: SectionFilters[K]): void {
    this.filters.update(filters => ({ ...filters, [key]: value }));
    this.page.set(0);
  }

  resetFilters(): void {
    this.filters.update(filters => ({ ...initialFilters, focus: this.focus, sort: filters.sort, descending: filters.descending }));
    this.page.set(0);
  }

  navigateSection(id: string): void {
    if (!this.navigation.some(section => section.id === id)) return;
    this.activeSection.set(id);
    window.location.hash = id;
  }

  toggleSectionDetails(): void {
    this.showSectionDetails.update(value => !value);
    if (!this.showSectionDetails() && !['sectionId', 'deltaTurnoutPp', 'deltaVoted', 'candidate4Delta', 'candidate25Delta'].includes(this.filters().sort)) {
      this.filters.update(filters => ({ ...filters, sort: 'deltaTurnoutPp', descending: true }));
      this.page.set(0);
    }
  }

  private observeNavigation(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    if (this.observationFrame !== undefined) cancelAnimationFrame(this.observationFrame);
    this.observationFrame = requestAnimationFrame(() => {
      this.sectionObserver?.disconnect();
      const sections = [...this.element.nativeElement.querySelectorAll<HTMLElement>('.research-page > section[id]')];
      this.sectionObserver = new IntersectionObserver(() => {
        const navigationBottom = this.element.nativeElement.querySelector('.section-nav')?.getBoundingClientRect().bottom ?? 120;
        const current = [...sections].reverse().find(section => section.getBoundingClientRect().top <= navigationBottom + 24) ?? sections[0];
        if (current) this.activeSection.set(current.id === 'hypotheses' ? 'candidate-checks' : current.id);
      }, { rootMargin: '-120px 0px -60% 0px' });
      sections.forEach(section => this.sectionObserver?.observe(section));
    });
  }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }

  sort(key: SectionSort): void {
    this.filters.update(filters => ({ ...filters, sort: key, descending: filters.sort === key ? !filters.descending : key !== 'sectionId' }));
    this.page.set(0);
  }

  ariaSort(key: SectionSort): 'ascending' | 'descending' | 'none' {
    return this.filters().sort !== key ? 'none' : this.filters().descending ? 'descending' : 'ascending';
  }

  sortReview(key: 'deltaTurnoutPp' | 'candidate4Delta' | 'candidate25Delta'): void {
    this.reviewDescending.set(this.reviewSort() === key ? !this.reviewDescending() : true);
    this.reviewSort.set(key);
  }

  reviewAriaSort(key: 'deltaTurnoutPp' | 'candidate4Delta' | 'candidate25Delta'): 'ascending' | 'descending' | 'none' {
    return this.reviewSort() !== key ? 'none' : this.reviewDescending() ? 'descending' : 'ascending';
  }

  selectSection(row: ForensicsSection): void {
    this.detailSubscription?.unsubscribe();
    this.selected.set(row);
    this.detailError.set('');
    const cached = this.detailCache.get(row.sectionId);
    if (cached) {
      this.selected.set(cached);
      this.detailLoading.set(false);
    } else {
      this.detailLoading.set(true);
      this.detailSubscription = this.http.get<ForensicsSection>(`${DATA_ROOT}/section-records/${encodeURIComponent(row.sectionId)}.json`)
        .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: detail => {
            if (detail.sectionId !== row.sectionId) {
              this.detailError.set('Полученият запис е за различна секция. Източниците не са показани.');
            } else {
              const merged = { ...row, ...detail };
              const explanations = merged.signal.alternativeExplanations;
              const finding = explanations?.length ? undefined
                : this.report()?.findings.find(item => item.sectionId === row.sectionId);
              const fullRow = hydrateSectionRecord({ ...merged, signal: { ...merged.signal,
                alternativeExplanations: explanations?.length ? explanations : finding?.alternativeExplanations ?? [],
              } }, this.report()?.registrations);
              this.selected.set(fullRow);
              this.detailCache.set(row.sectionId, fullRow);
              if (this.detailCache.size > 20) this.detailCache.delete(this.detailCache.keys().next().value!);
            }
            this.detailLoading.set(false);
          },
          error: () => {
            this.detailError.set('Пълният секционен запис не можа да бъде зареден. Обобщените показатели остават видими.');
            this.detailLoading.set(false);
          },
        });
    }
    requestAnimationFrame(() => document.getElementById('section-inspector')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  }

  closeSection(): void {
    this.detailSubscription?.unsubscribe();
    this.selected.set(null);
    this.detailLoading.set(false);
    this.detailError.set('');
  }

  openFinding(sectionId: string): void {
    const row = this.sectionIndex().get(sectionId);
    if (row) {
      this.explorerView.set('table');
      this.selectSection(row);
    }
  }

  percent(value: number | null | undefined): string {
    return value === null || value === undefined ? 'няма данни' : `${value.toLocaleString('bg-BG', { maximumFractionDigits: 2 })}%`;
  }

  count(value: number | null | undefined): string {
    return value === null || value === undefined ? 'няма данни' : value.toLocaleString('bg-BG');
  }

  interval(value: [number, number] | null): string {
    return value ? `[${signed(value[0])}; ${signed(value[1])}]` : 'няма оценка';
  }

  methodLabel(method: string): string {
    return ({ paper: 'Хартиено', machine: 'Машинно', machine_stopped: 'Преустановено машинно',
      stopped_machine: 'Преустановено машинно', interrupted: 'Преустановено машинно', special: 'Специална секция', unknown: 'Неустановен метод' } as Record<string, string>)[method] ?? method;
  }

  sizeLabel(size: string): string {
    return ({ '<300': 'Под 300', under300: 'Под 300', '300-400': '300-400', '300to400': '300-400',
      '401-700': '401-700', '401to700': '401-700', '>700': 'Над 700', over700: 'Над 700' } as Record<string, string>)[size] ?? size;
  }

  display(value: unknown): string {
    if (value === null || value === undefined) return 'няма данни';
    if (typeof value === 'number') return value.toLocaleString('bg-BG', { maximumFractionDigits: 4 });
    if (typeof value === 'boolean') return value ? 'да' : 'не';
    if (typeof value === 'string') return this.enumLabel(value);
    if (Array.isArray(value)) {
      const content = value.slice(0, 50).map(item => this.display(item)).join('; ');
      return value.length > 50 ? `${content}; … още ${value.length - 50}. Пълният набор е във файла JSON.` : content;
    }
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${this.fieldLabel(key)}: ${this.display(item)}`).join('; ');
  }

  fieldLabel(key: string): string {
    const labels: Record<string, string> = {
      id: 'Код', title: 'Проверка', name: 'Име', status: 'Статус', interpretation: 'Тълкуване', conclusion: 'Извод',
      estimate: 'Оценка', effect: 'Ефект', effectPp: 'Ефект, п.п.', effectSize: 'Размер на ефекта', coefficient: 'Коефициент',
      ci: 'Доверителен интервал', ci95: '95% доверителен интервал', confidenceInterval: 'Доверителен интервал',
      low: 'Долна граница', high: 'Горна граница', lower: 'Долна граница', upper: 'Горна граница',
      p: 'p-стойност', pValue: 'p-стойност', q: 'Коригирана q-стойност', adjustedP: 'Коригирана p-стойност',
      n: 'Секции', sampleN: 'Размер на извадката', method: 'Метод', controls: 'Контролни променливи',
      reason: 'Причина', reasons: 'Причини', limitations: 'Ограничения', description: 'Описание', result: 'Резултат',
      sectionIds: 'Секционни номера', sections: 'Секции', members: 'Секции в групата', region: 'Изборен район', regionName: 'Изборен район',
      municipality: 'Община', municipalityName: 'Община', settlement: 'Населено място', settlementName: 'Населено място',
      meanDeltaPp: 'Средна промяна, п.п.', medianDeltaPp: 'Медианна промяна, п.п.', deltaTurnoutPp: 'Промяна в активността, п.п.',
      alternativeExplanations: 'Алтернативни обяснения', calculations: 'Изчисления', evidence: 'Данни',
      flags: 'Основания за преглед', notes: 'Бележки', sources: 'Източници', date: 'Дата', generatedAt: 'Изготвен на',
      summary: 'Наблюдение', unit: 'Мерна единица', details: 'Подробности', criteria: 'Критерии',
      siteCount: 'Населени места', sectionCount: 'Секции', definition: 'Критерий за групиране',
      registered: 'Избиратели по списък', turnout: 'Активност', turnoutWithAdded: 'Активност с дописани избиратели',
      share: 'Дял от действителните гласове за кандидати или листи', shareOfValidIncludingNoSupport: 'Дял с включен вот „Не подкрепям никого“',
      sizeGroup: 'Размер на секцията', matching: 'Съпоставяне на секции', votingMethod: 'Метод на гласуване', geography: 'География',
      roundMatches: 'Съответствие между туровете', methodCounts: 'Методи по избори', priorityMunicipalities: 'Обхванати общини',
      historicalMatches: 'Исторически съответствия', dates: 'Изборни дати', parliamentary: 'Парламентарни', round1: 'Първи тур',
      round2: 'Балотаж', historical: 'Историческа база', priorityRegionIds: 'Кодове на приоритетните области',
      percentUnits: 'Единици на процентите', seed: 'Начална стойност за възпроизводимост', permutations: 'Пермутации',
      generatedBy: 'Генерираща програма', inputHashes: 'Контролни суми на входните файлове', eligibleCount: 'Сравними секции',
      metadata: 'Данни за източника', tables: 'Оригинални таблици', sourceUrl: 'Официален източник',
      raw: 'Оригинален запис', sha256: 'Контролна сума SHA-256', path: 'Файл', line: 'Ред', rowCount: 'Брой записи',
      sourceType: 'Вид на източника', sourceSnapshot: 'Момент на извличане',
      provisional: 'Предварителни данни', snapshot: 'Момент на извличане', snapshotAt: 'Момент на извличане',
      comparable: 'Сравнима', matched: 'Съвпадаща', possibleSplitMerge: 'Възможно разделяне или сливане',
      regionId: 'Код на изборен район', municipalityCode: 'Код на община', ekatte: 'ЕКАТТЕ', address: 'Адрес',
      population: 'Обхват', reference: 'Сравнителна група', target: 'Основна група',
    };
    return labels[key] ?? this.enumLabel(key);
  }

  enumLabel(value: string): string {
    const labels: Record<string, string> = {
      paper: 'хартиено', machine: 'машинно', interrupted: 'преустановено машинно', special: 'специална секция', unknown: 'неустановено',
      matched: 'съпоставена', changed: 'променена', unmatched: 'без съответствие', ambiguous: 'нееднозначно съответствие',
      estimated: 'оценено', insufficient_support: 'недостатъчна сравнима извадка', not_identified: 'ефектът не е установим',
      not_identifiable: 'ефектът не е установим', descriptive: 'описателна проверка',
      exploratory: 'изследователско наблюдение', under300: 'под 300', '300to400': '300-400', '401to700': '401-700', over700: 'над 700',
      sectionId_changed_or_missing: 'Променен или липсващ секционен номер', region_changed_or_missing: 'Променен или липсващ изборен район',
      municipality_changed_or_missing: 'Променена или липсваща община', ekatte_changed_or_missing: 'Променен или липсващ ЕКАТТЕ',
      settlement_changed_or_missing: 'Променено или липсващо населено място', address_changed_or_missing: 'Променен или липсващ адрес',
      special_or_institution_section: 'Специална или институционална секция', missing_election_record: 'Липсва запис за изборите',
      possible_address_reorganization_requires_protocol_review: 'Възможно преустройство на секциите на адреса - нужен е преглед на протоколите',
      zero_registered: 'Нулев брой избиратели по списък', voters_exceed_registered_plus_added: 'Гласувалите надвишават списъка с дописаните',
      valid_votes_exceed_voters: 'Действителните гласове надвишават гласувалите',
      ballots_do_not_equal_signed_voters: 'Бюлетините се различават от подписите на гласувалите',
      unknown_voting_method: 'Методът на гласуване не е установен',
      absolute_change_ge10pp_and_abs_robust_z_ge3: 'Промяна поне 10 процентни пункта и устойчив стандартизиран показател с абсолютна стойност поне 3',
      registered_electorate_change_over5pct: 'Броят избиратели по списък се е променил с повече от 5%',
      official_mobile_flag: 'Официално обозначена подвижна секция',
      official_ship_flag: 'Официално обозначена корабна секция',
      unchanged_first_round_official_special_flag: 'Официалният флаг от I тур е пренесен при непроменена идентичност на секцията',
      added_exceed_signed: 'Дописаните избиратели са повече от подписалите се - преглед на протокола',
      joint_turnout_growth_yotova_gain_larger: 'Съвместен ръст; по-голям ръст на гласовете за Йотова',
      joint_turnout_growth_gyurov_gain_larger: 'Съвместен ръст; по-голям ръст на гласовете за Гюров',
      joint_turnout_growth_equal_gains: 'Съвместен ръст; равен ръст на гласовете за двамата',
    };
    if (value.startsWith('candidate_components_disagree:')) return `Несъответствие на компонентите за бюлетина № ${value.split(':')[1]}`;
    const separator = value.indexOf(':');
    if (separator > 0 && /^\d{4}\.\d{2}\.\d{2}$/.test(value.slice(0, separator))) return `${value.slice(0, separator)} · ${this.enumLabel(value.slice(separator + 1))}`;
    return labels[value] ?? value;
  }

  canonicalLinks(row: ForensicsSection): { date: string; url: string }[] {
    return Object.entries(row.elections ?? {}).flatMap(([date, election]) => {
      const url = election?.sourceUrls['canonical'];
      return url && /^\/data\/\d{4}\.\d{2}\.\d{2}\/protocols\.txt(?:\.gz)?$/.test(url) ? [{ date, url }] : [];
    });
  }

  entries(value: unknown): { key: string; value: unknown }[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.entries(value).map(([key, item]) => ({ key, value: item }));
  }

  private jointDistrictChart(): Highcharts.Options {
    const groups = this.regionSummary();
    const candidates = this.report()?.registrations?.['2026.11.01']?.parties ?? {};
    return {
      chart: { type: 'bar', height: Math.max(360, groups.length * 34 + 100), backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: 'Кандидатски прираст и промяна в участието', align: 'left', style: { color: 'var(--research-ink)', fontSize: '15px' } },
      xAxis: { categories: groups.map(row => row.name), labels: { style: { color: 'var(--research-ink)', fontSize: '11px' } } },
      yAxis: { title: { text: 'Гласове / гласували', style: { color: 'var(--research-ink)' } }, labels: { style: { color: 'var(--research-ink)' } }, plotLines: [{ value: 0, width: 1, color: '#89949c' }], gridLineColor: 'var(--research-rule)' },
      legend: { align: 'left', verticalAlign: 'top', itemStyle: { color: 'var(--research-ink)' } }, credits: { enabled: false },
      tooltip: { shared: true, valueDecimals: 0 }, plotOptions: { series: { animation: false }, bar: { borderWidth: 0 } },
      series: [
        ...(['4', '25'] as const).map<Highcharts.SeriesBarOptions>(id => ({ type: 'bar', name: id === '4' ? 'Δ Гюров' : 'Δ Йотова',
          color: getPartyColor(candidates[id] ?? (id === '4' ? 'Андрей Гюров' : 'Илияна Йотова'), this.theme.darkMode()),
          data: groups.map(row => row.candidateTotals?.find(candidate => candidate.id === id)?.deltaVotes ?? null) })),
        { type: 'bar', name: 'Δ гласували', color: '#81909b', data: groups.map(row => row.deltaVoted) },
      ],
    };
  }

  private groupChart(rows: ForensicsGroup[], title: string, districts = false): Highcharts.Options {
    return {
      chart: { type: districts ? 'column' : 'bar', height: 360, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: title, style: { color: 'var(--research-ink)', fontSize: '15px' } },
      xAxis: { categories: rows.map(row => districts ? `${row.key}. ${row.name}` : this.sizeLabel(row.name)), labels: { rotation: districts ? -60 : 0, style: { color: 'var(--research-ink)', fontSize: '10px' } } },
      yAxis: { title: { text: 'Процентни пункта', style: { color: 'var(--research-ink)' } }, labels: { style: { color: 'var(--research-ink)' } }, plotLines: [{ value: 0, color: '#89949c', width: 1 }], gridLineColor: 'var(--research-rule)' },
      legend: { enabled: false }, credits: { enabled: false },
      tooltip: { valueDecimals: 2, valueSuffix: ' п.п.' },
      plotOptions: { series: { animation: false }, bar: { borderWidth: 0, borderRadius: 2 } },
      series: [{ type: districts ? 'column' : 'bar', name: 'Промяна в активността', data: rows.map(row => ({ y: row.deltaTurnoutPp, color: (row.deltaTurnoutPp ?? 0) >= 0 ? '#d18b32' : '#3788b8' })) }],
    };
  }
}
