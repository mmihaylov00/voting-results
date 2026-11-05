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
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FacebookCommentRow } from './facebook-comments.util';
import { FacebookCommentExcerpt, FacebookCommentReaderReport, validFacebookCommentReaderManifest, validFacebookCommentReaderReport } from './facebook-comment-reader.util';
import { FacebookCandidate } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_COUNTS, FACEBOOK_TONE_LABELS, facebookShortName } from './facebook-research.util';

@Component({
  selector: 'app-facebook-comment-reader',
  imports: [BaseModalComponent, HlmButtonDirective, LoadingBarComponent, MapIconComponent, SelectComponent,
    TableControlsComponent, ViewTabsComponent, VirtualTableDirective],
  templateUrl: './facebook-comment-reader.html',
  styleUrl: './facebook-comment-reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookCommentReaderComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly row = input.required<FacebookCommentRow>();
  readonly collectionSha256 = input.required<string>();
  readonly initialCandidate = input<FacebookCandidate>('gyurov');
  readonly close = output<void>();
  readonly baseUrl = '/data/facebook/2026/comments/';
  readonly report = signal<FacebookCommentReaderReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly candidate = signal<FacebookCandidate>('gyurov');
  readonly toneFilter = signal('');
  readonly threadFilter = signal<number | null>(null);
  readonly table = viewChild<TableControlsComponent<FacebookCommentExcerpt>>('commentSearch');
  readonly candidateTabs = FACEBOOK_CANDIDATES.map(id => ({ id, label: FACEBOOK_CANDIDATE_LABELS[id] }));
  readonly candidateLabel = computed(() => FACEBOOK_CANDIDATE_LABELS[this.candidate()]);
  readonly toneLabels = FACEBOOK_TONE_LABELS;
  readonly shortName = facebookShortName;
  readonly toneOptions = [{ value: '', label: 'Всички тонове' },
    ...FACEBOOK_STANCE_BUCKETS.map(value => ({ value, label: FACEBOOK_TONE_COUNTS[value] }))];
  readonly filteredComments = computed(() => {
    const candidate = this.candidate();
    const tone = this.toneFilter();
    const thread = this.threadFilter();
    return this.report()?.comments.filter(comment => (!tone || comment[candidate] === tone)
      && (thread === null || (comment.parentId ?? comment.id) === thread))
      .sort((left, right) => (left.parentId ?? left.id) - (right.parentId ?? right.id)
        || Number(left.parentId !== null) - Number(right.parentId !== null) || left.id - right.id) ?? [];
  });
  readonly columns: TableColumns<FacebookCommentExcerpt> = {
    text: comment => comment.text,
    tone: comment => FACEBOOK_TONE_COUNTS[comment[this.candidate()]],
    number: comment => comment.id,
  };

  ngOnInit(): void {
    this.candidate.set(this.initialCandidate());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
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

  setCandidate(value: string): void {
    if (value === 'gyurov' || value === 'yotova') this.candidate.set(value);
  }

  showThread(id: number): void {
    this.toneFilter.set('');
    this.table()?.query.set('');
    this.threadFilter.set(id);
  }

  resetFilters(): void {
    this.toneFilter.set('');
    this.threadFilter.set(null);
    this.table()?.query.set('');
  }
}
