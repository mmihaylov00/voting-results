import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SelectComponent } from '../ui/select/select';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FacebookCandidate } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_LABELS, facebookShortName } from './facebook-research.util';
import { FacebookToneReviewService } from './facebook-tone-review.service';
import { FacebookToneReviewItem } from './facebook-tone-review.util';

@Component({
  selector: 'app-facebook-tone-review',
  imports: [RouterLink, HlmButtonDirective, LoadingBarComponent, MapIconComponent, SelectComponent,
    TableControlsComponent, ViewTabsComponent, VirtualTableDirective],
  providers: [FacebookToneReviewService],
  templateUrl: './facebook-tone-review.html',
  styleUrl: './facebook-tone-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookToneReviewComponent implements OnInit, OnDestroy {
  readonly review = inject(FacebookToneReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly originalTitle = this.title.getTitle();
  private readonly originalRobots = this.meta.getTag('name="robots"')?.getAttribute('content') ?? null;
  readonly kind = signal(this.route.snapshot.queryParams['kind'] === 'comment' ? 'comment' : 'post');
  readonly pageFilter = signal('');
  readonly onlyUnreviewed = signal(false);
  readonly onlyChanged = signal(false);
  readonly table = viewChild<TableControlsComponent<FacebookToneReviewItem>>('reviewSearch');
  readonly candidates = FACEBOOK_CANDIDATES;
  readonly candidateLabels = FACEBOOK_CANDIDATE_LABELS;
  readonly toneLabels = FACEBOOK_TONE_LABELS;
  readonly shortName = facebookShortName;
  readonly toneOptions = FACEBOOK_STANCE_BUCKETS.map(value => ({ value, label: FACEBOOK_TONE_LABELS[value] }));
  readonly tabs = computed(() => [
    { id: 'post', label: 'Публикации', count: this.review.report()?.posts.length ?? 0 },
    { id: 'comment', label: 'Коментари', count: this.review.commentsLoaded()
      ? this.review.items().filter(item => item.kind === 'comment').length : undefined },
  ]);
  readonly pageOptions = computed(() => [{ value: '', label: 'Всички страници' },
    ...(this.review.report()?.pages.map(page => ({ value: page.id, label: facebookShortName(page.name) })) ?? [])]);
  readonly filteredItems = computed(() => {
    const kind = this.kind();
    const page = this.pageFilter();
    const onlyUnreviewed = this.onlyUnreviewed();
    const onlyChanged = this.onlyChanged();
    return this.review.items().filter(item => item.kind === kind && (!page || item.pageId === page)
      && (!onlyUnreviewed || item.gyurov === 'unreviewed' || item.yotova === 'unreviewed')
      && (!onlyChanged || this.review.changed(item)));
  });
  readonly batchSize = computed(() => Math.min(100, this.review.pendingCount()));
  readonly columns: TableColumns<FacebookToneReviewItem> = {
    text: item => item.text,
    page: item => item.pageName,
    context: item => `${item.postText} ${item.parentText ?? ''}`,
    comment: item => item.commentId,
  };

  ngOnInit(): void {
    this.title.setTitle('Преглед на тоновете - Facebook и изборите');
    this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow,noarchive' });
    this.review.load();
  }

  ngOnDestroy(): void {
    this.title.setTitle(this.originalTitle);
    if (this.originalRobots === null) this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: this.originalRobots });
  }

  setKind(kind: string): void {
    if (kind !== 'post' && kind !== 'comment') return;
    this.kind.set(kind);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { kind: kind === 'post' ? null : kind },
      queryParamsHandling: 'merge', replaceUrl: true });
  }

  selectLabel(item: FacebookToneReviewItem, candidate: FacebookCandidate, index: number): string {
    return `Тон към ${FACEBOOK_CANDIDATE_LABELS[candidate]} за ${item.kind === 'comment' ? 'коментар #' + item.commentId : 'публикация'} от ${facebookShortName(item.pageName)}, ред ${index + 1}`;
  }

  resetFilters(): void {
    this.pageFilter.set('');
    this.onlyUnreviewed.set(false);
    this.onlyChanged.set(false);
    this.table()?.query.set('');
  }
}
