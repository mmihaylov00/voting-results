import { SelectComponent, SelectOption, partySelectOptions } from '../select/select';
import { partyVoteTotals, sortPartiesByVotes } from '../../../utils/party-order.util';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, effect, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Region, Section } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { ThemeService } from '../../../services/theme.service';
import { getPartyColor, getPartyDisplayName, getPartyLegendIndex } from '../../../utils/party-colors';
import {
  AnalysisRow, AnalysisSnapshot, analysisCsv, comparisonRow, difference, indexSections,
  matchHistoricalSection, matchPartyId, regionSnapshot, sectionSnapshot,
} from '../../../utils/election-comparison.util';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../map-icon/map-icon';
import { COMPARISON_SIDES, ComparisonCellComponent } from '../comparison-cell/comparison-cell';
import { HlmTableBodyDirective, HlmTableDirective, HlmTableHeadDirective, HlmTableHeaderDirective, HlmTableRowDirective } from '../table-helm/src/lib/hlm-table.directives';

export type AnalysisMetric = 'share' | 'turnout' | 'invalid' | 'machine' | 'margin' | 'topParties';
type Metric = AnalysisMetric;
type SortKey = 'label' | 'voteChange' | 'shareChange' | 'turnoutChange';
type ElectionData = { regions: Region[]; parties: Record<string, string> };
type TimelinePoint = { date: string; name: string; snapshot: AnalysisSnapshot | null; sections: Section[] | null; parties: Record<string, string> };
type Benchmark = { label: string; snapshot: AnalysisSnapshot };

@Component({
  selector: 'app-election-analysis',
  standalone: true,
  imports: [SelectComponent, CommonModule, HighchartsChartComponent, HlmButtonDirective, MapIconComponent,
    ComparisonCellComponent, HlmTableDirective, HlmTableHeaderDirective, HlmTableBodyDirective, HlmTableRowDirective, HlmTableHeadDirective],
  templateUrl: './election-analysis.html',
  styles: ':host { display: block; min-width: 0; }',
})
export class ElectionAnalysisComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() regionId: string | null = null;
  @Input() sections: Section[] | null = null;
  @Input() parentSections: Section[] | null = null;
  @Input() parties: Record<string, string> = {};
  @Input() selectedPartyId: string | null = null;
  @Input() scopeLabel = 'Избрани секции';
  @Input() view: 'history' | 'comparison' = 'history';
  @Input() baselineDate = '';
  @Input() historyMetric: AnalysisMetric = 'share';
  @Output() baselineDateChange = new EventEmitter<string>();
  @Output() historyMetricChange = new EventEmitter<AnalysisMetric>();
  @Output() electionChange = new EventEmitter<string>();
  @Output() sectionSelect = new EventEmitter<Section>();
  @Output() regionSelect = new EventEmitter<string>();
  @Output() partyChange = new EventEmitter<string | null>();
  @Output() comparisonChange = new EventEmitter<{ date: string; sections: Section[]; partyId: string | null } | null>();
  @ViewChild('chartContainer') chartContainer?: ElementRef<HTMLElement>;

  private readonly elections = inject(ElectionService);
  private readonly theme = inject(ThemeService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private summaries: Record<string, ElectionData> = {};
  private partyVotes: Record<string, number> = {};
  private readonly historicalSections = new Map<string, Section[]>();
  private generation = 0;
  private lastParties = '';
  private chart?: Highcharts.Chart;
  private reflowFrame: number | null = null;
  activePartyId: string | null = null;
  comparisonDate = '';
  metric: Metric = 'share';
  loading = false;
  comparisonLoading = false;
  historyVisited = false;
  error = '';
  exportError = '';
  exporting = false;
  missingDates: string[] = [];
  timeline: TimelinePoint[] = [];
  rows: AnalysisRow[] = [];
  current: AnalysisSnapshot | null = null;
  parent: AnalysisSnapshot | null = null;
  national: AnalysisSnapshot | null = null;
  chartOptions: Highcharts.Options = {};
  sortKey: SortKey = 'shareChange';
  sortAscending = false;
  page = 0;
  readonly pageSize = 20;
  readonly comparisonSides = COMPARISON_SIDES;
  readonly comparisonMetrics = [
    { key: 'votes', label: 'Гласове', sort: 'voteChange', rate: false },
    { key: 'share', label: 'Дял', sort: 'shareChange', rate: true },
    { key: 'turnout', label: 'Активност', sort: 'turnoutChange', rate: true },
  ] as const;
  get metrics(): { id: Metric; label: string }[] { return [
    { id: 'share', label: this.isPresidential ? 'Дял на кандидата' : 'Дял на партията' },
    { id: 'topParties', label: this.isPresidential ? 'Водещи кандидати' : 'Водещи партии' },
    { id: 'turnout', label: 'Активност' }, { id: 'margin', label: 'Разлика между първите две' },
    { id: 'invalid', label: 'Невалидни бюлетини' }, { id: 'machine', label: 'Машинен вот' },
  ]; }
  readonly displayPartyName = getPartyDisplayName;
  get partyChoices() { return [{ value: null, label: 'Изберете' }, ...partySelectOptions(this.partyOptions)]; }
  get metricOptions(): SelectOption<Metric>[] {
    return this.metrics.map<SelectOption<Metric>>(item => ({ value: item.id, label: item.label,
      icon: item.id === 'share' ? 'percent' : item.id === 'topParties' ? 'leading-party'
        : item.id === 'turnout' ? 'activity' : item.id === 'margin' ? 'winner-margin'
        : item.id === 'invalid' ? 'invalid-votes' : 'machine-vs-paper' }));
  }
  get comparisonOptions() { return this.comparisonDates.map(election => ({ value: election.date, label: election.name })); }
  get isPresidential() { return this.elections.electionType === 'presidential'; }

  constructor() {
    effect(() => { this.theme.darkMode(); this.updateChart(); });
  }

  get dates() {
    const dates = this.elections.getDates();
    const current = dates.find((election) => election.date === this.date);
    if (!current) return [];
    return dates.filter((election) => election.type === current.type && election.round === current.round)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  get comparisonDates() { return this.dates.filter((election) => election.date !== this.date); }
  get scopedSections() { return this.regionId === null ? null : this.sections; }
  private get wholeParentScope() {
    return this.sections !== null && this.parentSections !== null &&
      this.sections.length > 0 && this.sections.length === this.parentSections.length;
  }
  private get wholeNationalScope() { return this.regionId === 'all' && this.wholeParentScope; }
  get benchmarks(): Benchmark[] {
    if (this.scopedSections === null || this.wholeNationalScope) return [];
    const benchmarks: Benchmark[] = [];
    if (this.parent && this.regionId !== 'all' && !this.wholeParentScope) {
      benchmarks.push({ label: 'Спрямо целия обхват', snapshot: this.parent });
    }
    if (this.national) benchmarks.push({ label: 'Спрямо страната', snapshot: this.national });
    return benchmarks;
  }
  get partyOptions() { return sortPartiesByVotes(Object.entries(this.parties).filter(([id]) => id !== '0')
    .map(([id, name]) => ({ id, name })), this.partyVotes); }
  get partyName() { return this.activePartyId ? this.parties[this.activePartyId] ?? '' : ''; }
  get hasNextPage() { return (this.page + 1) * this.pageSize < this.rows.length; }
  get visibleRows() { return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize); }

  ngOnChanges(changes: SimpleChanges): void {
    const baselineChanged = !!changes['baselineDate'] && this.comparisonDate !== this.baselineDate;
    const metricChanged = !!changes['historyMetric'] && this.metric !== this.historyMetric;
    const previousPartyId = this.activePartyId;
    if (baselineChanged) this.comparisonDate = this.baselineDate;
    if (metricChanged) this.metric = this.historyMetric;
    if (this.view === 'history') {
      this.historyVisited = true;
      if (changes['view']) this.scheduleChartReflow();
    }
    if (changes['selectedPartyId'] || changes['date']) this.activePartyId = this.selectedPartyId;
    if (!this.activePartyId || !this.parties[this.activePartyId]) this.activePartyId = this.partyOptions[0]?.id ?? null;
    const partySignature = JSON.stringify(this.parties);
    const scopeChanged = changes['date'] || changes['regionId'] ||
      (this.regionId !== null && (changes['sections'] || changes['parentSections']));
    if (scopeChanged || partySignature !== this.lastParties) {
      this.lastParties = partySignature;
      void this.load();
    } else if (previousPartyId !== this.activePartyId) {
      void this.refreshParty();
    } else if (baselineChanged || (this.regionId === null && changes['sections'])) {
      if (this.loading) void this.load();
      else void this.refreshComparison();
    }
    if (metricChanged) this.updateChart();
  }

  selectHistoryMetric(): void {
    this.historyMetricChange.emit(this.metric);
    this.updateChart();
  }

  ngOnDestroy(): void {
    this.generation += 1;
    if (this.reflowFrame !== null) cancelAnimationFrame(this.reflowFrame);
  }

  chartReady(chart: Highcharts.Chart): void {
    this.chart = chart;
    this.scheduleChartReflow();
  }

  private scheduleChartReflow(): void {
    if (this.reflowFrame !== null) cancelAnimationFrame(this.reflowFrame);
    this.reflowFrame = requestAnimationFrame(() => {
      this.reflowFrame = null;
      if (this.view === 'history' && this.chart?.container?.isConnected) this.chart.reflow();
    });
  }

  selectParty(id: string | null): void {
    if (id === this.activePartyId) return;
    this.activePartyId = id;
    this.partyChange.emit(id);
    void this.refreshParty();
  }

  private async refreshParty(): Promise<void> {
    if (this.loading || !this.timeline.length) { await this.load(); return; }
    this.timeline = this.timeline.map(point => {
      if (!point.snapshot) return point;
      const id = point.date === this.date ? this.activePartyId : matchPartyId(this.partyName, point.parties);
      const snapshot = point.sections
        ? sectionSnapshot(point.sections, id)
        : regionSnapshot(this.summaries[point.date]?.regions ?? [], id);
      return { ...point, snapshot: { ...point.snapshot, votes: snapshot.votes, share: snapshot.share } };
    });
    this.updateScopeSnapshots();
    if (this.metric === 'share') this.updateChart();
    await this.refreshComparison();
  }

  private updateScopeSnapshots(): void {
    this.current = this.timeline.find((point) => point.date === this.date)?.snapshot ?? null;
    this.national = this.summaries[this.date]
      ? regionSnapshot(this.summaries[this.date].regions, this.activePartyId, this.elections.getOfficialNationalElectors(this.date)) : null;
    this.parent = this.parentSections?.length ? sectionSnapshot(this.parentSections, this.activePartyId,
      this.regionId === 'all' ? this.elections.getOfficialNationalElectors(this.date) : null) : null;
  }

  async load(): Promise<void> {
    if (!this.date) return;
    if (this.view === 'history') this.historyVisited = true;
    const generation = ++this.generation;
    this.comparisonChange.emit(null);
    this.loading = true;
    this.comparisonLoading = false;
    this.error = '';
    this.missingDates = [];
    this.current = null;
    this.parent = null;
    this.national = null;
    this.rows = [];
    this.page = 0;
    try {
      const summaries = await firstValueFrom(this.elections.getAllData());
      if (generation !== this.generation) return;
      this.summaries = summaries;
      this.partyVotes = partyVoteTotals(this.scopedSections ?? summaries[this.date]?.regions ?? []);
      const choices = this.comparisonDates;
      if (!choices.some((election) => election.date === this.comparisonDate)) {
        this.comparisonDate = [...choices].reverse().find((election) => election.date < this.date)?.date ?? choices[0]?.date ?? '';
      }
      const timeline: TimelinePoint[] = [];
      const missingDates: string[] = [];
      for (const election of this.dates) {
        if (generation !== this.generation) return;
        const summary = summaries[election.date];
        let sections: Section[] | null = null;
        let snapshot: AnalysisSnapshot | null = null;
        try {
          const scope = this.scopedSections;
          if (scope !== null) {
            let completeNationalCoverage = this.wholeNationalScope;
            if (election.date === this.date) {
              sections = scope;
            } else {
              const historicalSections = await this.loadSections(election.date);
              const historical = indexSections(historicalSections);
              sections = scope.map((section) => matchHistoricalSection(section, historical)).filter((section): section is Section => !!section);
              completeNationalCoverage = completeNationalCoverage && sections.length === historicalSections.length;
            }
            const partyId = election.date === this.date ? this.activePartyId : matchPartyId(this.partyName, summary?.parties ?? {});
            snapshot = sections.length ? sectionSnapshot(sections, partyId,
              completeNationalCoverage ? this.elections.getOfficialNationalElectors(election.date) : null) : null;
          } else if (summary) {
            snapshot = regionSnapshot(summary.regions, matchPartyId(this.partyName, summary.parties), this.elections.getOfficialNationalElectors(election.date));
          }
        } catch {
          missingDates.push(election.name);
        }
        timeline.push({ date: election.date, name: election.name, snapshot, sections, parties: summary?.parties ?? {} });
      }
      if (generation !== this.generation) return;
      this.missingDates = missingDates;
      this.timeline = timeline;
      this.updateScopeSnapshots();
      await this.buildComparison(generation);
      if (generation !== this.generation) return;
      this.updateChart();
    } catch {
      if (generation === this.generation) this.error = 'Неуспешно зареждане на анализа. Опитайте отново.';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  private async loadSections(date: string): Promise<Section[]> {
    const key = `${this.regionId ?? 'all'}:${date}`;
    const cached = this.historicalSections.get(key);
    if (cached) return cached;
    const sections = await firstValueFrom(this.elections.getSections(date, this.regionId ?? undefined));
    this.historicalSections.set(key, sections);
    return sections;
  }

  async changeComparison(): Promise<void> {
    this.baselineDateChange.emit(this.comparisonDate);
    await this.refreshComparison();
  }

  private async refreshComparison(): Promise<void> {
    const generation = ++this.generation;
    this.comparisonChange.emit(null);
    this.comparisonLoading = true;
    this.error = '';
    this.rows = [];
    this.page = 0;
    try { await this.buildComparison(generation); }
    catch { if (generation === this.generation) this.error = 'Неуспешно зареждане на сравнението. Опитайте отново.'; }
    finally {
      if (generation === this.generation) {
        this.comparisonLoading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  private async buildComparison(generation: number): Promise<void> {
    if (!this.comparisonDates.some((election) => election.date === this.comparisonDate)) { this.rows = []; return; }
    const date = this.comparisonDate;
    const previous = this.summaries[date];
    const previousPartyId = matchPartyId(this.partyName, previous?.parties ?? {});
    const scope = this.scopedSections;
    if (scope !== null) {
      const sections = await this.loadSections(date);
      if (generation !== this.generation || date !== this.comparisonDate) return;
      const historical = indexSections(sections);
      this.rows = scope.map((section) => {
        const matched = matchHistoricalSection(section, historical);
        return { ...comparisonRow(section.sectionId, `${section.cityName} - ${section.sectionName}`, sectionSnapshot([section], this.activePartyId),
          matched ? sectionSnapshot([matched], previousPartyId) : null), section };
      });
      this.comparisonChange.emit({ date, sections, partyId: previousPartyId });
    } else {
      const previousRegions = new Map(previous?.regions.map((region) => [region.id, region]) ?? []);
      this.rows = (this.summaries[this.date]?.regions ?? []).map((region) => {
        const matched = previousRegions.get(region.id);
        return { ...comparisonRow(region.id, region.name, regionSnapshot([region], this.activePartyId),
          matched ? regionSnapshot([matched], previousPartyId) : null), regionId: region.id };
      });
      if (this.sections !== null) {
        const sections = await this.loadSections(date);
        if (generation !== this.generation || date !== this.comparisonDate) return;
        this.comparisonChange.emit({ date, sections, partyId: previousPartyId });
      }
    }
    this.sortRows();
  }

  sort(key: SortKey): void {
    this.sortAscending = key === this.sortKey ? !this.sortAscending : key === 'label';
    this.sortKey = key;
    this.sortRows();
  }

  private sortRows(): void {
    const key = this.sortKey;
    this.rows.sort((a, b) => {
      const left = a[key]; const right = b[key];
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const result = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'bg') : Number(left) - Number(right);
      return this.sortAscending ? result : -result;
    });
    this.page = 0;
  }

  selectRow(row: AnalysisRow): void {
    if (row.section) this.sectionSelect.emit(row.section);
    else if (row.regionId) this.regionSelect.emit(row.regionId);
  }

  deviation(metric: 'share' | 'turnout', reference: AnalysisSnapshot | null): number | null {
    return difference(this.current?.[metric], reference?.[metric]);
  }

  format(value: number | null | undefined, percent = false, signed = false): string {
    if (value == null) return '-';
    const formatted = value.toLocaleString('bg-BG', { maximumFractionDigits: percent ? 2 : 0, minimumFractionDigits: percent ? 2 : 0 });
    return `${signed && value > 0 ? '+' : ''}${formatted}${percent ? signed ? ' п.п.' : '%' : ''}`;
  }

  exportCsv(): void {
    const blob = new Blob([analysisCsv(this.rows, this.date, this.comparisonDate, this.partyName)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparison_${this.date}_${this.comparisonDate}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async exportChart(): Promise<void> {
    const svg = this.chartContainer?.nativeElement.querySelector('svg');
    if (!svg || this.exporting) return;
    this.exporting = true;
    this.exportError = '';
    let source = '';
    try {
      const width = svg.getBoundingClientRect().width;
      const height = svg.getBoundingClientRect().height;
      if (width <= 0 || height <= 0) throw new Error('Графиката не е видима.');
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(() => reject(new Error('Експортът отне твърде дълго.')), 10000);
        image.onload = () => { window.clearTimeout(timeout); resolve(image); };
        image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Графиката не може да бъде експортирана.')); };
        image.src = source;
      });
      const canvas = document.createElement('canvas');
      const scale = Math.min(2, 4096 / Math.max(width, height + 136));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round((height + 136) * scale);
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('Браузърът не поддържа експорт.');
      drawing.scale(scale, scale);
      drawing.fillStyle = this.theme.darkMode() ? '#020817' : '#ffffff';
      drawing.fillRect(0, 0, width, height + 136);
      drawing.fillStyle = this.theme.darkMode() ? '#f8fafc' : '#020817';
      const title = this.metrics.find((metric) => metric.id === this.metric)?.label ?? '';
      const lines = [`История: ${title}`, this.scopedSections === null ? 'Национални резултати' : this.scopeLabel, this.metric === 'share' ? getPartyDisplayName(this.partyName) : 'Избори от същия вид и тур'];
      lines.forEach((line, index) => {
        drawing.font = index === 0 ? '600 17px sans-serif' : '13px sans-serif';
        drawing.fillText(line, 12, 24 + index * 23, width - 24);
      });
      drawing.drawImage(image, 0, 88, width, height);
      drawing.font = '11px sans-serif';
      const denominator = this.metric === 'margin' ? 'Разлика от броя избиратели' : this.metric === 'machine' ? 'Дял от хартиени и машинни гласове' : this.metric === 'turnout' ? 'Дял от избирателите' : 'Дял от гласувалите';
      drawing.fillText(`Източник: ЦИК | ${denominator}.`, 12, height + 113, width - 24);
      if (this.scopedSections !== null) drawing.fillText('Историята включва само съвпадащи секции. Покритието може да е различно.', 12, height + 130, width - 24);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('Изображението не можа да бъде създадено.');
      const url = URL.createObjectURL(png);
      const link = document.createElement('a');
      link.href = url;
      link.download = `election-history_${this.date}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      this.exportError = error instanceof Error ? error.message : 'Неуспешен експорт на графиката.';
    } finally {
      if (source) URL.revokeObjectURL(source);
      this.exporting = false;
    }
  }

  updateChart(): void {
    const color = this.theme.darkMode() ? '#f8fafc' : '#020817';
    const select = (index: number) => this.electionChange.emit(this.timeline[index].date);
    const metric = this.metric;
    const partyTotals: Record<string, number> = {};
    if (metric === 'topParties') {
      const votes = this.scopedSections === null
        ? (this.summaries[this.date]?.regions ?? []).map((region) => region.partyVotes)
        : this.scopedSections.map((section) => Object.fromEntries(Object.entries(section.partyVotes).map(([id, value]) => [id, value.total])));
      for (const row of votes) for (const [id, value] of Object.entries(row)) partyTotals[id] = (partyTotals[id] ?? 0) + value;
    }
    const rankedParties = this.partyOptions.slice().sort((a, b) => (partyTotals[b.id] ?? 0) - (partyTotals[a.id] ?? 0));
    const series: Highcharts.SeriesOptionsType[] = metric === 'topParties'
      ? rankedParties.slice(0, 5).map((party) => ({
        type: 'line', name: getPartyDisplayName(party.name), color: getPartyColor(party.name, this.theme.darkMode()),
        legendIndex: getPartyLegendIndex(party.name),
        data: this.timeline.map((point) => {
          const id = matchPartyId(party.name, point.parties);
          if (point.sections) return point.sections.length ? sectionSnapshot(point.sections, id).share : null;
          const regions = this.summaries[point.date]?.regions;
          return regions ? regionSnapshot(regions, id).share : null;
        }),
      }))
      : [{
        type: 'line', name: metric === 'share' ? getPartyDisplayName(this.partyName) : this.metrics.find((item) => item.id === metric)?.label ?? '',
        data: this.timeline.map((point) => point.snapshot?.[metric] ?? null),
        color: metric === 'share' ? getPartyColor(this.partyName, this.theme.darkMode()) : '#2563eb',
      }];
    this.chartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent', height: 290, reflow: true },
      title: { text: undefined }, credits: { enabled: false },
      xAxis: { categories: this.timeline.map((point) => point.name), labels: { style: { color } } },
      yAxis: { title: { text: '%' }, min: 0, labels: { style: { color } } },
      legend: { enabled: metric === 'topParties', itemStyle: { color } },
      tooltip: { valueDecimals: 2, valueSuffix: '%', shared: true },
      plotOptions: { series: { connectNulls: false, cursor: 'pointer', point: { events: { click() { select(this.index); } } } } },
      series,
    };
  }
}
