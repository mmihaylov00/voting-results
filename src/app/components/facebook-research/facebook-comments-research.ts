import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { ThemeService } from '../../services/theme.service';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { ChartImageExportComponent } from '../ui/chart-image-export/chart-image-export';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SelectComponent } from '../ui/select/select';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FACEBOOK_COMMENT_COVERAGE_LABELS, FacebookCommentRow, facebookCommentPageCounts, facebookCommentTotals, validFacebookCommentsReport } from './facebook-comments.util';
import { FacebookCandidate, FacebookCommentsReport, FacebookPage, FacebookPost } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_COUNTS, facebookCount, facebookShortName } from './facebook-research.util';
import { FacebookCommentReaderComponent } from './facebook-comment-reader';

@Component({
  selector: 'app-facebook-comments-research',
  imports: [HlmButtonDirective, HighchartsChartComponent, ChartImageExportComponent, LoadingBarComponent,
    MapIconComponent, SelectComponent, SortableTableHeaderComponent, TableControlsComponent, ViewTabsComponent, VirtualTableDirective,
    FacebookCommentReaderComponent],
  templateUrl: './facebook-comments-research.html',
  styleUrl: './facebook-comments-research.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookCommentsResearchComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  readonly posts = input.required<readonly FacebookPost[]>();
  readonly pages = input.required<readonly FacebookPage[]>();
  readonly dataUrl = '/data/facebook/2026/comments.json';
  readonly report = signal<FacebookCommentsReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly candidate = signal<FacebookCandidate>('gyurov');
  readonly pageFilter = signal('');
  readonly selectedReaderRow = signal<FacebookCommentRow | null>(null);
  readonly table = viewChild<TableControlsComponent<FacebookCommentRow>>('commentTable');
  readonly candidateTabs = FACEBOOK_CANDIDATES.map(id => ({ id, label: FACEBOOK_CANDIDATE_LABELS[id] }));
  readonly candidateLabel = computed(() => FACEBOOK_CANDIDATE_LABELS[this.candidate()]);
  readonly collectedDate = computed(() => this.report() ? new Intl.DateTimeFormat('bg-BG', {
    timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(this.report()!.capturedAt)) : '');
  readonly buckets = FACEBOOK_STANCE_BUCKETS;
  readonly bucketLabels = FACEBOOK_TONE_COUNTS;
  readonly coverageLabels = FACEBOOK_COMMENT_COVERAGE_LABELS;
  readonly count = facebookCount;
  readonly shortName = facebookShortName;
  readonly pageOptions = computed(() => [{ value: '', label: 'Всички страници' },
    ...this.pages().map(page => ({ value: page.id, label: facebookShortName(page.name) }))]);
  readonly rows = computed(() => {
    const posts = new Map(this.posts().map(post => [post.id, post]));
    const pages = new Map(this.pages().map(page => [page.id, page]));
    return this.report()?.posts.map(row => ({ ...row, post: posts.get(row.postId)!, page: pages.get(posts.get(row.postId)!.pageId)! })) ?? [];
  });
  readonly filteredRows = computed(() => this.rows().filter(row => !this.pageFilter() || row.page.id === this.pageFilter()));
  readonly visibleRows = computed(() => this.table()?.viewRows() ?? this.filteredRows());
  readonly totals = computed(() => facebookCommentTotals(this.visibleRows()));
  readonly pageCounts = computed(() => facebookCommentPageCounts(this.visibleRows(), this.candidate()));
  readonly directionalTotals = computed(() => this.pageCounts().reduce((sum, page) => ({
    supportive: sum.supportive + page.supportive, critical: sum.critical + page.critical,
  }), { supportive: 0, critical: 0 }));
  readonly exportTitle = computed(() => `Коментари · ${this.candidateLabel()} · публикации от октомври 2026 · към ${this.collectedDate()}`);
  readonly columns: TableColumns<FacebookCommentRow> = {
    title: row => `${row.post.excerpt} ${row.post.summary}`, page: row => row.page.name,
    status: row => FACEBOOK_COMMENT_COVERAGE_LABELS[row.status],
    captured: row => this.available(row) ? row.capturedCount : null,
    assessed: row => this.available(row) ? row.assessedCount : null,
    ...Object.fromEntries(FACEBOOK_STANCE_BUCKETS.map(bucket => [bucket,
      (row: FacebookCommentRow) => this.available(row) ? row.counts[this.candidate()][bucket] : null])),
  };

  constructor() {
    effect(() => {
      const table = this.table();
      if (table && !table.sortColumn()) {
        table.sortColumn.set('captured');
        table.direction.set('desc');
      }
    });
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<unknown>(this.dataUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: value => {
        if (validFacebookCommentsReport(value, this.posts())) this.report.set(value);
        else this.error.set('Данните за коментарите са непълни. Опитайте отново след обновяване.');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Коментарите не можаха да бъдат заредени. Опитайте отново.');
        this.loading.set(false);
      },
    });
  }

  setCandidate(value: string): void {
    if (value === 'gyurov' || value === 'yotova') this.candidate.set(value);
  }

  available(row: FacebookCommentRow): boolean { return row.status === 'complete' || row.capturedCount > 0; }

  resetFilters(): void {
    this.pageFilter.set('');
    this.table()?.query.set('');
  }

  readonly chartOptions = computed((): Highcharts.Options => {
    const rows = this.pageCounts();
    const ink = this.theme.darkMode() ? '#e5ebf2' : '#18374f';
    const extent = Math.max(1, ...rows.flatMap(row => [row.supportive, row.critical]));
    return {
      chart: { type: 'bar', height: Math.max(320, rows.length * 37 + 110), animation: false, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: undefined }, credits: { enabled: false }, accessibility: { enabled: false },
      responsive: { rules: [{ condition: { maxWidth: 480 }, chartOptions: {
        chart: { marginLeft: 112 }, xAxis: { labels: { distance: 8, style: { width: 100, textOverflow: 'ellipsis', whiteSpace: 'nowrap' } } },
      } }] },
      subtitle: { text: `${this.totals().captured} събрани · ${this.totals().assessed} оценени · ${this.totals().checked}/${this.visibleRows().length} проверени публикации`, style: { color: ink, fontSize: '10px' } },
      xAxis: { categories: rows.map(row => facebookShortName(row.name)), lineWidth: 0, tickWidth: 0, labels: { style: { color: ink, fontSize: '11px' } } },
      yAxis: { min: -extent, max: extent, tickPositions: [-extent, 0, extent], startOnTick: false, endOnTick: false, allowDecimals: false,
        title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: ink }, formatter() { return facebookCount(Math.abs(Number(this.value))); } },
        plotLines: [{ value: 0, width: 1, color: ink, zIndex: 3 }] },
      legend: { enabled: true, itemStyle: { color: ink, fontSize: '11px' } },
      tooltip: { outside: true, headerFormat: '<b>{point.key}</b><br/>', pointFormat: `{series.name} към ${this.candidateLabel()}<br/>Коментари: <b>{point.custom.display}</b>` },
      plotOptions: { series: { animation: false, stacking: 'normal' }, bar: { borderWidth: 0, borderRadius: 2, maxPointWidth: 20 } },
      series: (['supportive', 'critical'] as const).map(tone => ({
        type: 'bar', name: tone === 'supportive' ? 'В подкрепа' : 'Критични',
        color: tone === 'supportive' ? (this.theme.darkMode() ? '#72c9a6' : '#23805d') : (this.theme.darkMode() ? '#ed9b96' : '#b84b47'),
        data: rows.map(row => ({ y: tone === 'critical' && row[tone] ? -row[tone] : row[tone], custom: { display: facebookCount(row[tone]) } })),
      })),
    };
  });
}
