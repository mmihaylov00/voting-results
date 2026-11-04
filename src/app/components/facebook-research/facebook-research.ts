import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { CsvExportData } from '../../utils/csv-export.util';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { CsvExportModalComponent } from '../ui/csv-export-modal/csv-export-modal';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SelectComponent } from '../ui/select/select';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FacebookResearchChartsComponent } from './facebook-research-charts';
import { FacebookResearchImageComponent } from './facebook-research-image';
import { FacebookResearchStanceComponent } from './facebook-research-stance';
import { FacebookPageDirectoryComponent } from './facebook-page-directory';
import { FacebookDirectoryEntry, FacebookPageSummary, FacebookPost, FacebookReport, FacebookReview, FacebookTotal } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_METRIC_LABELS, FACEBOOK_METRICS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_COUNTS, FACEBOOK_TONE_LABELS, facebookCount, facebookDate, facebookPageSummaries, facebookShortName, facebookStanceSummary, facebookTime, validFacebookReport } from './facebook-research.util';

type KeywordCoverage = FacebookReport['coverage'][number];
const VIEWS = ['pages', 'directory', 'posts', 'duplicates', 'review', 'coverage'];

@Component({
  selector: 'app-facebook-research',
  imports: [CommonModule, HlmButtonDirective, MapIconComponent, ViewTabsComponent, SelectComponent,
    TableControlsComponent, SortableTableHeaderComponent, VirtualTableDirective, BaseModalComponent,
    CsvExportModalComponent, LoadingBarComponent, HlmTooltipDirective, FacebookResearchChartsComponent, FacebookResearchImageComponent, FacebookResearchStanceComponent, FacebookPageDirectoryComponent],
  templateUrl: './facebook-research.html',
  styleUrl: './facebook-research.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookResearchComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly originalTitle = this.title.getTitle();
  private readonly originalRobots = this.meta.getTag('name="robots"')?.getAttribute('content') ?? null;
  readonly dataUrl = '/data/facebook/2026/report.json';
  readonly report = signal<FacebookReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly view = signal<string>(VIEWS.includes(this.route.snapshot.queryParams['view']) ? this.route.snapshot.queryParams['view'] : 'pages');
  readonly pageFilter = signal('');
  readonly keywordFilter = signal('');
  readonly selectedPostId = signal('');
  readonly selectedReview = signal<FacebookReview | null>(null);
  readonly csvData = signal<CsvExportData | null>(null);
  readonly count = facebookCount;
  readonly postDate = facebookDate;
  readonly postTime = facebookTime;
  readonly shortName = facebookShortName;
  readonly metrics = FACEBOOK_METRICS;
  readonly metricLabels = FACEBOOK_METRIC_LABELS;
  readonly pageTable = viewChild<TableControlsComponent<FacebookPageSummary>>('pageTable');
  readonly postTable = viewChild<TableControlsComponent<FacebookPost>>('postTable');
  readonly pages = computed(() => this.report() ? facebookPageSummaries(this.report()!) : []);
  readonly postMap = computed(() => new Map(this.report()?.posts.map(post => [post.id, post]) ?? []));
  readonly pageMap = computed(() => new Map(this.pages().map(page => [page.id, page])));
  readonly pageDirectory = computed(() => {
    const entries = new Map<string, FacebookDirectoryEntry>();
    for (const entry of this.report()?.directory?.entries ?? []) {
      if (entry.samplePageId) entries.set(entry.samplePageId, entry);
    }
    return entries;
  });
  readonly selectedPost = computed(() => this.postMap().get(this.selectedPostId()) ?? null);
  readonly selectedPostStance = computed(() => facebookStanceSummary(this.selectedPost() ? [this.selectedPost()!] : []));
  readonly selectedPostMatches = computed(() => this.report()?.matches.filter(match =>
    match.sourceId === this.selectedPostId() || match.targetId === this.selectedPostId()) ?? []);
  readonly selectedPostReviews = computed(() => this.report()?.reviews.filter(review => review.postIds.includes(this.selectedPostId())) ?? []);
  readonly filteredPosts = computed(() => this.report()?.posts.filter(post =>
    (!this.pageFilter() || post.pageId === this.pageFilter())
    && (!this.keywordFilter() || post.keywords.some(match => match.keyword === this.keywordFilter()))) ?? []);
  readonly pageOptions = computed(() => [{ value: '', label: 'Всички страници' },
    ...this.pages().map(page => ({ value: page.id, label: facebookShortName(page.name) }))]);
  readonly keywordOptions = computed(() => [{ value: '', label: 'Всички ключови думи' },
    ...(this.report()?.coverage.map(row => ({ value: row.keyword, label: row.keyword })) ?? [])]);
  readonly tabs = computed(() => [
    { id: 'pages', label: 'Страници', count: this.pages().length },
    ...(this.report()?.directory ? [{ id: 'directory', label: 'Каталог', count: this.report()!.directory!.entries.length }] : []),
    { id: 'posts', label: 'Публикации', count: this.report()?.posts.length ?? 0 },
    { id: 'duplicates', label: 'Повторения', count: this.report()?.matches.length ?? 0 },
    { id: 'review', label: 'За проверка', count: this.report()?.reviews.length ?? 0 },
    { id: 'coverage', label: 'Покритие', count: this.report()?.coverage.length ?? 0 },
  ]);
  readonly duplicateGroups = computed(() => {
    const groups = new Map<string, NonNullable<FacebookReport['matches']>>();
    for (const match of this.report()?.matches ?? []) {
      const rows = groups.get(match.sourceId) ?? [];
      rows.push(match);
      groups.set(match.sourceId, rows);
    }
    return [...groups].map(([sourceId, matches]) => ({ source: this.postMap().get(sourceId)!, matches }));
  });
  readonly pageColumns: TableColumns<FacebookPageSummary> = {
    name: row => row.name, followers: row => row.followers, posts: row => row.postCount,
    stance: row => FACEBOOK_CANDIDATES.map(candidate => `${FACEBOOK_CANDIDATE_LABELS[candidate]}: ${FACEBOOK_TONE_LABELS[row.stance[candidate].label]}`).join('; '),
    reactions: row => row.totals.reactions.value, comments: row => row.totals.comments.value,
    shares: row => row.totals.shares.value,
    search: row => {
      const entry = this.pageDirectory().get(row.id);
      return entry ? `${entry.coverage} ${entry.regions.join(' ')}` : '';
    },
  };
  readonly postColumns: TableColumns<FacebookPost> = {
    title: row => row.excerpt, page: row => this.pageName(row), date: row => row.date ?? row.interval?.start,
    reactions: row => row.metrics.reactions.value, comments: row => row.metrics.comments.value,
    shares: row => row.metrics.shares.value, search: row => `${row.summary} ${row.keywords.map(match => match.keyword).join(' ')}`,
  };
  readonly coverageColumns: TableColumns<KeywordCoverage> = {
    keyword: row => row.keyword, count: row => row.count,
    shortfall: row => Math.max(0, (this.report()?.keywordTarget ?? 100) - row.count),
  };

  constructor() {
    effect(() => {
      const controls = this.postTable();
      if (controls && !controls.sortColumn()) {
        controls.sortColumn.set('reactions');
        controls.direction.set('desc');
      }
    });
  }

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow,noarchive' });
    this.title.setTitle('Facebook и изборите - изследване 2026');
    this.load();
  }

  ngOnDestroy(): void {
    this.title.setTitle(this.originalTitle);
    if (this.originalRobots === null) this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: this.originalRobots });
  }

  load(): void {
    this.error.set('');
    this.loading.set(true);
    this.http.get<FacebookReport>(this.dataUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: report => {
        if (validFacebookReport(report)) {
          this.report.set(report);
          if (this.view() === 'directory' && !report.directory) this.setView('pages');
        }
        else this.error.set('Файлът с изследването е непълен. Опитайте отново след обновяване на данните.');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Изследването не можа да бъде заредено. Проверете връзката и опитайте отново.');
        this.loading.set(false);
      },
    });
  }

  setView(value: string): void {
    if (!VIEWS.includes(value) || value === 'directory' && !this.report()?.directory) return;
    this.view.set(value);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view: value === 'pages' ? null : value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  showPagePosts(pageId: string): void {
    if (!this.pageMap().has(pageId)) return;
    this.pageFilter.set(pageId);
    this.keywordFilter.set('');
    this.setView('posts');
  }

  openPost(id: string): void {
    if (!this.postMap().has(id)) return;
    this.selectedReview.set(null);
    this.selectedPostId.set(id);
  }

  openReview(review: FacebookReview): void {
    this.selectedPostId.set('');
    this.selectedReview.set(review);
  }

  pageName(post: FacebookPost): string { return this.pageMap().get(post.pageId)?.name ?? ''; }
  regionalCoverage(pageId: string): string {
    const entry = this.pageDirectory().get(pageId);
    return entry?.regional === true ? entry.coverage : '';
  }
  postById(id: string): FacebookPost | undefined { return this.postMap().get(id); }
  totalLabel(total: FacebookTotal): string { return facebookCount(total.value, total.approximate); }
  totalNote(total: FacebookTotal): string {
    return [total.approximate ? 'Сборът включва закръглени броячи.' : '',
      total.missing ? `Няма видим брояч за ${total.missing} публикации.` : 'Всички събрани публикации имат видим брояч.'].filter(Boolean).join('\n');
  }

  exportPages(rows: readonly FacebookPageSummary[]): void {
    this.csvData.set({ filename: 'facebook-pages-2026.csv',
      headers: ['Страница', 'Регионална страница', 'Обхват', 'Региони', 'Последователи при събиране', 'Последователи, приблизително', 'Публикации в извадката',
        ...FACEBOOK_CANDIDATES.flatMap(candidate => [`${FACEBOOK_CANDIDATE_LABELS[candidate]}, тон в извадката`,
          ...FACEBOOK_STANCE_BUCKETS.map(bucket => `${FACEBOOK_CANDIDATE_LABELS[candidate]}, ${FACEBOOK_TONE_COUNTS[bucket]}`)]),
        ...FACEBOOK_METRICS.flatMap(metric => [`${FACEBOOK_METRIC_LABELS[metric]}, наличен сбор`, `${FACEBOOK_METRIC_LABELS[metric]}, приблизително`, `${FACEBOOK_METRIC_LABELS[metric]}, липсващи броячи`]), 'Сатира', 'Източник'],
      rows: rows.map(page => [page.name,
        this.pageDirectory().get(page.id)?.regional === true ? 'Да' : this.pageDirectory().get(page.id)?.regional === false ? 'Не' : 'Неуточнено',
        this.pageDirectory().get(page.id)?.coverage ?? '', this.pageDirectory().get(page.id)?.regions.join('; ') ?? '',
        page.followers, page.followersApproximate ? 'Да' : '', page.postCount,
        ...FACEBOOK_CANDIDATES.flatMap(candidate => [FACEBOOK_TONE_LABELS[page.stance[candidate].label],
          ...FACEBOOK_STANCE_BUCKETS.map(bucket => page.stance[candidate].counts[bucket])]),
        ...FACEBOOK_METRICS.flatMap(metric => [page.totals[metric].value, page.totals[metric].approximate ? 'Да' : '', page.totals[metric].missing]), page.satire ? 'Да' : '', page.url]),
    });
  }

  exportPosts(rows: readonly FacebookPost[]): void {
    this.csvData.set({ filename: 'facebook-posts-2026.csv',
      headers: ['Страница', 'Дата / период', 'Час (София)', 'Набор', 'Откъс', 'Обобщение', 'Означения във Facebook', 'Заглавие във връзката', 'Ключови думи',
        ...FACEBOOK_CANDIDATES.map(candidate => `${FACEBOOK_CANDIDATE_LABELS[candidate]}, тон в надписа`), 'Основание за тона',
        ...FACEBOOK_METRICS.flatMap(metric => [FACEBOOK_METRIC_LABELS[metric], `${FACEBOOK_METRIC_LABELS[metric]}, приблизително`]), 'Пълен надпис при събиране', 'Събрано на', 'Източник'],
      rows: rows.map(post => [this.pageName(post), facebookDate(post), facebookTime(post), post.origin === 'collection' ? 'Събрана публикация' : 'Намерено при повторения', post.excerpt,
        post.summary, post.platformLabels?.join('; ') ?? '', post.linkHeadline ?? '', post.keywords.map(match => match.keyword).join('; '),
        ...FACEBOOK_CANDIDATES.map(candidate => FACEBOOK_TONE_LABELS[post.stance ? post.stance[candidate] ?? 'not-mentioned' : 'unreviewed']), post.stance?.reason ?? '',
        ...FACEBOOK_METRICS.flatMap(metric => [post.metrics[metric].value, post.metrics[metric].approximate ? 'Да' : '']),
        post.captionComplete === null ? '' : post.captionComplete ? 'Да' : 'Не', post.collectedAt, post.url]),
    });
  }

  exportMatches(): void {
    this.csvData.set({ filename: 'facebook-matches-2026.csv',
      headers: ['Страница в извадката', 'Публикация в извадката', 'Съвпадаща страница', 'Съвпадаща публикация', 'Вид съвпадение', 'Минути по-късно'],
      rows: (this.report()?.matches ?? []).map(match => [this.pageName(this.postMap().get(match.sourceId)!), this.postMap().get(match.sourceId)!.url,
        this.pageName(this.postMap().get(match.targetId)!), this.postMap().get(match.targetId)!.url, match.kind === 'body' ? 'Заглавие и основен текст; различни хаштагове и връзки' : 'Само заглавие', match.delayMinutes]),
    });
  }

  exportCoverage(rows: readonly KeywordCoverage[]): void {
    this.csvData.set({ filename: 'facebook-keyword-coverage-2026.csv', headers: ['Ключова дума', 'Произход на думата', 'Публикации', 'Цел', 'Недостиг'],
      rows: rows.map(row => [row.keyword, row.fromCaptions ? 'От публикациите' : 'Зададена', row.count, this.report()!.keywordTarget, Math.max(0, this.report()!.keywordTarget - row.count)]),
    });
  }
}
