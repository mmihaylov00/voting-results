import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SelectComponent } from '../ui/select/select';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FACEBOOK_COMMENT_COVERAGE_LABELS, FacebookCommentRow } from './facebook-comments.util';
import { FacebookCommentExcerpt, FacebookCommentReaderReport, validFacebookCommentReaderManifest, validFacebookCommentReaderReport } from './facebook-comment-reader.util';
import { FacebookStanceLabel } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_COUNTS, FACEBOOK_TONE_LABELS, facebookShortName } from './facebook-research.util';

@Component({
  selector: 'app-facebook-comment-reader',
  imports: [BaseModalComponent, HlmButtonDirective, LoadingBarComponent, MapIconComponent, SelectComponent,
    TableControlsComponent, NgTemplateOutlet, VirtualTableDirective],
  templateUrl: './facebook-comment-reader.html',
  styleUrl: './facebook-comment-reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookCommentReaderComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly row = input.required<FacebookCommentRow>();
  readonly collectionSha256 = input.required<string>();
  readonly close = output<void>();
  readonly baseUrl = '/data/facebook/2026/comments/';
  readonly report = signal<FacebookCommentReaderReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly gyurovToneFilter = signal('');
  readonly yotovaToneFilter = signal('');
  readonly expandedThreads = signal<ReadonlySet<number>>(new Set());
  readonly table = viewChild<TableControlsComponent<FacebookCommentExcerpt>>('commentSearch');
  readonly candidates = FACEBOOK_CANDIDATES;
  readonly candidateLabels = FACEBOOK_CANDIDATE_LABELS;
  readonly coverageLabels = FACEBOOK_COMMENT_COVERAGE_LABELS;
  readonly toneLabel = (tone: FacebookStanceLabel) => FACEBOOK_TONE_LABELS[tone];
  readonly shortName = facebookShortName;
  readonly toneOptions = [{ value: '', label: 'Всички тонове' },
    ...FACEBOOK_STANCE_BUCKETS.map(value => ({ value, label: FACEBOOK_TONE_COUNTS[value] }))];
  readonly filteredComments = computed(() => {
    const gyurov = this.gyurovToneFilter();
    const yotova = this.yotovaToneFilter();
    return this.report()?.comments.filter(comment => (!gyurov || comment.gyurov === gyurov)
      && (!yotova || comment.yotova === yotova)) ?? [];
  });
  readonly visibleThreads = computed(() => {
    const matches = new Set(this.table()?.viewRows().map(comment => comment.id));
    const threads = new Map<number, { root: FacebookCommentExcerpt; replies: FacebookCommentExcerpt[]; rootMatches: boolean }>();
    for (const comment of this.report()?.comments ?? []) {
      if (comment.parentId === null) threads.set(comment.id, {
        root: comment, replies: [], rootMatches: matches.has(comment.id),
      });
    }
    for (const comment of this.table()?.viewRows() ?? []) {
      if (comment.parentId !== null) threads.get(comment.parentId)?.replies.push(comment);
    }
    return Array.from(threads.values()).filter(thread => thread.rootMatches || thread.replies.length);
  });
  readonly columns: TableColumns<FacebookCommentExcerpt> = {
    text: comment => comment.text,
    gyurov: comment => FACEBOOK_TONE_COUNTS[comment.gyurov],
    yotova: comment => FACEBOOK_TONE_COUNTS[comment.yotova],
    number: comment => comment.id,
  };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
    this.expandedThreads.set(new Set());
    const expectedCount = this.row().capturedCount;
    this.http.get<unknown>(`${this.baseUrl}manifest.json`).pipe(
      switchMap(value => {
        if (!validFacebookCommentReaderManifest(value, this.collectionSha256())) throw new Error('Invalid excerpt manifest');
        const entry = value.posts.find(post => post.postId === this.row().postId);
        if (!entry || entry.count !== expectedCount) throw new Error('Excerpt coverage does not match the snapshot');
        return this.http.get<unknown>(`${this.baseUrl}${entry.file}`);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: value => {
        const entry = { postId: this.row().postId, file: '', count: expectedCount };
        if (validFacebookCommentReaderReport(value, entry, this.collectionSha256(), this.row().counts)) this.report.set(value);
        else this.error.set('Откъсите не съвпадат с текущата извадка. Обновете страницата или опитайте отново.');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Откъсите не можаха да бъдат заредени. Обновете страницата или опитайте отново.');
        this.loading.set(false);
      },
    });
  }

  toggleReplies(id: number): void {
    this.expandedThreads.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  resetFilters(): void {
    this.gyurovToneFilter.set('');
    this.yotovaToneFilter.set('');
    this.expandedThreads.set(new Set());
    this.table()?.query.set('');
  }
}
