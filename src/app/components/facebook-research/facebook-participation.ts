import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
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
import { FACEBOOK_COMMENT_COVERAGE_LABELS, validFacebookCommentsReport } from './facebook-comments.util';
import { FacebookAccountActivityComponent } from './facebook-account-activity';
import { FacebookCommentsReport, FacebookPage, FacebookPost } from './facebook-research.models';
import { facebookCount, facebookShortName } from './facebook-research.util';
import { FacebookAccountCell, FacebookParticipationReport, validFacebookParticipationReport } from './facebook-participation.util';

interface ParticipationRow {
  id: string;
  left: string;
  leftPageId: string;
  leftUrl: string;
  right: string;
  rightPageId: string;
  rightUrl: string;
  captured: number;
  matched: number;
  accounts: FacebookAccountCell;
  starters: FacebookAccountCell;
  repeated: FacebookAccountCell;
  shared: number;
  status: string;
  checked: boolean;
}

@Component({
  selector: 'app-facebook-participation',
  imports: [HlmButtonDirective, ChartImageExportComponent, HighchartsChartComponent, LoadingBarComponent,
    FacebookAccountActivityComponent, MapIconComponent, SelectComponent, SortableTableHeaderComponent, TableControlsComponent, ViewTabsComponent, VirtualTableDirective],
  templateUrl: './facebook-participation.html',
  styleUrl: './facebook-participation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookParticipationComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  readonly posts = input.required<readonly FacebookPost[]>();
  readonly pages = input.required<readonly FacebookPage[]>();
  readonly dataUrl = '/data/facebook/2026/participation.json';
  readonly report = signal<FacebookParticipationReport | null>(null);
  readonly comments = signal<FacebookCommentsReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly view = signal('activity');
  readonly overlapScope = signal('pages');
  readonly pageFilter = signal('');
  readonly table = viewChild<TableControlsComponent<ParticipationRow>>('participationTable');
  readonly tabs = [{ id: 'activity', label: 'Коментари и страници' }, { id: 'pages', label: 'По страници' }, { id: 'overlaps', label: 'Съвпадения' },
    { id: 'posts', label: 'По публикации' }];
  readonly overlapOptions = [{ value: 'pages', label: 'Между страници' }, { value: 'posts', label: 'Между публикации' }];
  readonly count = facebookCount;
  readonly accountCount = (value: FacebookAccountCell, checked = true) => !checked ? '-' : value === null ? '<5' : facebookCount(value);
  readonly checkedPostCount = computed(() => this.comments()?.posts.filter(post => post.status !== 'not-checked').length ?? 0);
  readonly pageMap = computed(() => new Map(this.pages().map(page => [page.id, page])));
  readonly postMap = computed(() => new Map(this.posts().map(post => [post.id, post])));
  readonly pageOptions = computed(() => [{ value: '', label: 'Всички страници' },
    ...this.pages().map(page => ({ value: page.id, label: facebookShortName(page.name) }))]);
  readonly activityCells = computed(() => {
    const activity = this.report()?.activity;
    return (this.pageFilter() ? activity?.pages.find(page => page.pageId === this.pageFilter())?.cells : activity?.cells) ?? null;
  });
  readonly activityPageName = computed(() => this.pageMap().get(this.pageFilter())?.name ?? '');
  readonly activityMatchedComments = computed(() => this.pageFilter()
    ? this.report()?.pages.find(page => page.pageId === this.pageFilter())?.matchedIdentityComments ?? 0
    : this.report()?.coverage.matchedIdentityComments ?? 0);
  readonly activityScaleMax = computed(() => Math.max(1, ...(this.report()?.activity?.cells.map(cell => cell.accounts ?? 0) ?? [])));
  readonly collectedDate = computed(() => this.report() ? new Intl.DateTimeFormat('bg-BG', {
    timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(this.report()!.capturedAt)) : '');
  readonly rows = computed((): ParticipationRow[] => {
    const report = this.report();
    if (!report || this.view() === 'activity') return [];
    const base = { right: '', rightPageId: '', rightUrl: '', captured: 0, matched: 0,
      accounts: null, starters: null, repeated: null, shared: 0, status: '', checked: false };
    const coverage = new Map(this.comments()?.posts.map(post => [post.postId, post]) ?? []);
    const pageCoverage = new Map<string, { checked: number; complete: number }>();
    for (const post of report.posts) {
      const sum = pageCoverage.get(post.pageId) ?? { checked: 0, complete: 0 };
      const status = coverage.get(post.postId)!.status;
      sum.checked += Number(status !== 'not-checked');
      sum.complete += Number(status === 'complete');
      pageCoverage.set(post.pageId, sum);
    }
    if (this.view() === 'pages') return report.pages.map(page => {
      const source = this.pageMap().get(page.pageId)!;
      const checked = pageCoverage.get(page.pageId)!;
      return { ...base, id: page.pageId, left: facebookShortName(source.name), leftPageId: source.id,
        leftUrl: source.url, captured: page.capturedComments, matched: page.matchedIdentityComments,
        accounts: page.accounts, status: `${checked.complete} / ${page.postCount}`, checked: checked.checked > 0 };
    }).sort((a, b) => (b.accounts ?? -1) - (a.accounts ?? -1));
    if (this.view() === 'posts') return report.posts.map(post => {
      const source = this.postMap().get(post.postId)!;
      return { ...base, id: post.postId, left: `${facebookShortName(this.pageMap().get(post.pageId)!.name)} · ${source.excerpt || source.summary}`,
        leftPageId: post.pageId, leftUrl: source.url, captured: post.capturedComments,
        matched: post.matchedIdentityComments, accounts: post.accounts, starters: post.accountsStartingThreads,
        repeated: post.accountsWithMultipleComments, status: FACEBOOK_COMMENT_COVERAGE_LABELS[coverage.get(post.postId)!.status],
        checked: coverage.get(post.postId)!.status !== 'not-checked' };
    }).sort((a, b) => (b.accounts ?? -1) - (a.accounts ?? -1));
    if (this.overlapScope() === 'pages') return report.pageOverlaps.map(pair => {
      const left = this.pageMap().get(pair.leftPageId)!;
      const right = this.pageMap().get(pair.rightPageId)!;
      return { ...base, id: JSON.stringify([left.id, right.id]), left: facebookShortName(left.name), leftPageId: left.id,
        leftUrl: left.url, right: facebookShortName(right.name), rightPageId: right.id, rightUrl: right.url, shared: pair.sharedAccounts };
    }).sort((a, b) => b.shared - a.shared);
    return report.postOverlaps.map(pair => {
      const left = this.postMap().get(pair.leftPostId)!;
      const right = this.postMap().get(pair.rightPostId)!;
      const label = (post: FacebookPost) => `${facebookShortName(this.pageMap().get(post.pageId)!.name)} · ${post.excerpt || post.summary}`;
      return { ...base, id: JSON.stringify([left.id, right.id]), left: label(left), leftPageId: left.pageId,
        leftUrl: left.url, right: label(right), rightPageId: right.pageId, rightUrl: right.url, shared: pair.sharedAccounts };
    }).sort((a, b) => b.shared - a.shared);
  });
  readonly filteredRows = computed(() => this.rows().filter(row => !this.pageFilter()
    || row.leftPageId === this.pageFilter() || row.rightPageId === this.pageFilter()));
  readonly visibleRows = computed(() => this.table()?.viewRows() ?? this.filteredRows());
  readonly chartRows = computed(() => this.visibleRows().filter(row => row.accounts !== null));
  readonly columns: TableColumns<ParticipationRow> = {
    left: row => row.left, right: row => row.right, captured: row => row.captured, matched: row => row.matched,
    accounts: row => row.accounts, starters: row => row.starters, repeated: row => row.repeated,
    shared: row => row.shared, status: row => row.status,
  };
  readonly exportTitle = computed(() => `Разпознати акаунти по страници · към ${this.collectedDate()}`);
  readonly chartOptions = computed((): Highcharts.Options => {
    const rows = this.chartRows();
    const ink = this.theme.darkMode() ? '#e5ebf2' : '#18374f';
    return {
      chart: { type: 'bar', height: Math.max(280, rows.length * 32 + 90), animation: false, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: undefined }, credits: { enabled: false }, accessibility: { enabled: false }, legend: { enabled: false },
      xAxis: { categories: rows.map(row => row.left), labels: { style: { color: ink, fontSize: '11px' } }, lineWidth: 0, tickWidth: 0 },
      yAxis: { min: 0, allowDecimals: false, title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: ink } } },
      tooltip: { outside: true, headerFormat: '<b>{point.key}</b><br/>', pointFormat: 'Разпознати акаунти: <b>{point.y}</b>' },
      plotOptions: { series: { animation: false }, bar: { borderWidth: 0, borderRadius: 2, maxPointWidth: 20 } },
      responsive: { rules: [{ condition: { maxWidth: 480 }, chartOptions: { chart: { marginLeft: 112 }, xAxis: {
        labels: { style: { width: 100, textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
      } } }] },
      series: [{ type: 'bar', name: 'Разпознати акаунти', color: this.theme.darkMode() ? '#72c9a6' : '#23805d', data: rows.map(row => row.accounts) }],
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
    this.comments.set(null);
    forkJoin({ participation: this.http.get<unknown>(this.dataUrl),
      comments: this.http.get<unknown>('/data/facebook/2026/comments.json') }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ participation, comments }) => {
        if (validFacebookCommentsReport(comments, this.posts()) && validFacebookParticipationReport(participation, this.posts(), comments)) {
          this.comments.set(comments);
          this.report.set(participation);
        } else this.error.set('Данните за участието не съвпадат с текущата извадка. Обновете страницата или опитайте отново.');
        this.loading.set(false);
      },
      error: () => { this.error.set('Данните за участието не можаха да бъдат заредени. Опитайте отново.'); this.loading.set(false); },
    });
  }

  setView(value: string): void {
    if (this.tabs.some(tab => tab.id === value)) {
      this.view.set(value);
      this.table()?.sortColumn.set('');
    }
  }

  setOverlapScope(value: string): void {
    if (value === 'pages' || value === 'posts') { this.overlapScope.set(value); this.table()?.sortColumn.set(''); }
  }

  resetFilters(): void { this.pageFilter.set(''); this.table()?.query.set(''); }
}
