import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, from, map, mergeMap, toArray } from 'rxjs';
import { FacebookCommentReaderManifest, validFacebookCommentReaderManifest, validFacebookCommentReaderReport } from './facebook-comment-reader.util';
import { validFacebookCommentsReport } from './facebook-comments.util';
import { FacebookCandidate, FacebookCommentsReport, FacebookReport, FacebookStanceLabel } from './facebook-research.models';
import { facebookStanceSummary, validFacebookReport } from './facebook-research.util';
import { FACEBOOK_TONE_REVIEW_BATCH_SIZE, FACEBOOK_TONE_REVIEW_STORAGE, FacebookToneReviewDraft, FacebookToneReviewItem,
  matchingToneReviewDraft, toneReviewDraft, toneReviewSubmission, toneReviewKey, validReviewTone, validToneReviewDrafts, validToneReviewReceipt } from './facebook-tone-review.util';

@Injectable()
export class FacebookToneReviewService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly baseUrl = '/data/facebook/2026/';
  private manifest: FacebookCommentReaderManifest | null = null;
  private coverage: FacebookCommentsReport | null = null;
  private storageWriteFailed = false;
  private retrySubmission: ReturnType<typeof toneReviewSubmission> | null = null;
  private readonly drafts = signal(new Map<string, FacebookToneReviewDraft>());
  private readonly itemMap = computed(() => new Map(this.items().map(item => [item.key, item])));
  readonly report = signal<FacebookReport | null>(null);
  readonly items = signal<FacebookToneReviewItem[]>([]);
  readonly loading = signal(false);
  readonly commentsLoading = signal(false);
  readonly commentsLoaded = signal(false);
  readonly progress = signal(0);
  readonly totalCommentPosts = signal(0);
  readonly error = signal('');
  readonly commentsError = signal('');
  readonly draftError = signal('');
  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly submitted = signal(0);
  readonly pending = computed(() => Array.from(this.drafts().values()).filter(draft => {
    const item = this.itemMap().get(draft.key);
    return item && matchingToneReviewDraft(item, draft);
  }));
  readonly pendingCount = computed(() => this.pending().length);

  constructor() {
    this.drafts.set(this.latestDrafts());
    const sync = (event: StorageEvent) => {
      if (event.key === FACEBOOK_TONE_REVIEW_STORAGE || event.key === null) this.drafts.set(this.latestDrafts());
    };
    window.addEventListener('storage', sync);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', sync));
  }

  private latestDrafts(): Map<string, FacebookToneReviewDraft> {
    if (this.storageWriteFailed) return new Map(this.drafts());
    try {
      const saved = localStorage.getItem(FACEBOOK_TONE_REVIEW_STORAGE);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (!validToneReviewDrafts(value)) throw new Error('Invalid saved tone drafts');
        return new Map(value.drafts.map(draft => [draft.key, draft]));
      }
      return new Map();
    } catch {
      this.draftError.set('Запазените чернови не могат да бъдат възстановени на това устройство.');
      return new Map(this.drafts());
    }
  }

  load(): void {
    if (this.loading() || this.commentsLoading() || this.submitting()) return;
    this.loading.set(true);
    this.error.set('');
    this.commentsError.set('');
    this.commentsLoaded.set(false);
    this.report.set(null);
    this.items.set([]);
    this.manifest = null;
    this.coverage = null;
    forkJoin({
      report: this.http.get<FacebookReport>(`${this.baseUrl}report.json`),
      coverage: this.http.get<unknown>(`${this.baseUrl}comments.json`),
      manifest: this.http.get<unknown>(`${this.baseUrl}comments/manifest.json`),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ report, coverage, manifest }) => {
        if (!validFacebookReport(report) || !/^[a-f0-9]{64}$/.test(report.collectionSha256)
          || !report.posts.every(post => /^[a-f0-9]{64}$/.test(post.sourceTextSha256))
          || !validFacebookCommentsReport(coverage, report.posts)
          || !validFacebookCommentReaderManifest(manifest, coverage.collectionSha256)
          || manifest.posts.length !== coverage.posts.length
          || !manifest.posts.every(entry => coverage.posts.some(post =>
            post.postId === entry.postId && post.capturedCount === entry.count))) {
          this.error.set('Извадката не съвпада. Обновете страницата или опитайте отново.');
        } else {
          this.report.set(report);
          this.coverage = coverage;
          this.manifest = manifest;
          const pages = new Map(report.pages.map(page => [page.id, page]));
          this.items.set(report.posts.map(post => {
            const stance = facebookStanceSummary([post]);
            return {
              key: toneReviewKey('post', post.id, null), kind: 'post', postId: post.id, commentId: null,
              parentId: null, pageId: post.pageId, pageName: pages.get(post.pageId)!.name,
              postUrl: post.url, postText: post.excerpt || post.summary, text: post.excerpt || post.summary,
              parentText: null, truncated: post.captionComplete === false,
              gyurov: stance.gyurov.label, yotova: stance.yotova.label,
              sourceSha256: post.sourceTextSha256, collectionSha256: report.collectionSha256,
            };
          }));
        }
        this.loading.set(false);
        if (!this.error()) this.loadComments();
      },
      error: () => {
        this.error.set('Данните не можаха да бъдат заредени. Опитайте отново.');
        this.loading.set(false);
      },
    });
  }

  loadComments(): void {
    if (!this.manifest || !this.coverage || this.commentsLoading() || this.commentsLoaded()) return;
    this.commentsLoading.set(true);
    this.commentsError.set('');
    this.progress.set(0);
    this.totalCommentPosts.set(this.manifest.posts.length);
    const coverage = new Map(this.coverage.posts.map(post => [post.postId, post]));
    const posts = new Map(this.items().filter(item => item.kind === 'post').map(item => [item.postId, item]));
    const collectionSha256 = this.coverage.collectionSha256;
    from(this.manifest.posts).pipe(
      mergeMap(entry => this.http.get<unknown>(`${this.baseUrl}comments/${entry.file}`).pipe(map(value => {
        if (!validFacebookCommentReaderReport(value, entry, collectionSha256, coverage.get(entry.postId)!.counts)) {
          throw new Error('Comment excerpts do not match the snapshot');
        }
        const post = posts.get(entry.postId)!;
        const comments = new Map(value.comments.map(comment => [comment.id, comment]));
        this.progress.update(count => count + 1);
        return value.comments.map(comment => ({
          ...post, key: toneReviewKey('comment', entry.postId, comment.id), kind: 'comment' as const,
          commentId: comment.id, parentId: comment.parentId, text: comment.text,
          parentText: comment.parentId === null ? null : comments.get(comment.parentId)!.text,
          truncated: comment.truncated, gyurov: comment.gyurov, yotova: comment.yotova,
          sourceSha256: entry.file.slice(0, -5), collectionSha256,
        }));
      })), 6),
      toArray(), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: groups => {
        const comments = groups.flat().sort((a, b) => a.postId.localeCompare(b.postId) || a.commentId! - b.commentId!);
        this.items.update(items => [...items.filter(item => item.kind === 'post'), ...comments]);
        this.commentsLoaded.set(true);
        this.commentsLoading.set(false);
        const current = this.latestDrafts();
        this.drafts.set(current);
        const retained = new Map(this.pending().map(draft => [draft.key, draft]));
        if (current.size !== retained.size) {
          this.drafts.set(retained);
          this.persist();
          this.draftError.set('Част от старите чернови са за променена извадка и не са възстановени.');
        }
      },
      error: () => {
        this.commentsError.set('Не всички коментари са заредени. Черновите са запазени; опитайте отново.');
        this.commentsLoading.set(false);
      },
    });
  }

  tone(item: FacebookToneReviewItem, candidate: FacebookCandidate): FacebookStanceLabel {
    const draft = this.drafts().get(item.key);
    return matchingToneReviewDraft(item, draft) ? draft![candidate] : item[candidate];
  }

  changed(item: FacebookToneReviewItem): boolean {
    return matchingToneReviewDraft(item, this.drafts().get(item.key));
  }

  setTone(selected: FacebookToneReviewItem, candidate: FacebookCandidate, value: string): void {
    const item = this.itemMap().get(selected.key);
    if (this.submitting() || !item || item.text === null || !validReviewTone(value)) return;
    const next = this.latestDrafts();
    const previous = next.get(item.key);
    const tones = matchingToneReviewDraft(item, previous) ? previous! : item;
    const draft = toneReviewDraft(item, { gyurov: tones.gyurov, yotova: tones.yotova, [candidate]: value });
    if (draft.gyurov === item.gyurov && draft.yotova === item.yotova) next.delete(item.key);
    else next.set(item.key, draft);
    this.drafts.set(next);
    this.submitted.set(0);
    this.submitError.set('');
    this.persist();
  }

  undo(item: FacebookToneReviewItem): void {
    if (this.submitting()) return;
    const next = this.latestDrafts();
    next.delete(item.key);
    this.drafts.set(next);
    this.persist();
  }

  submit(): void {
    if (!this.commentsLoaded() || this.submitting()) return;
    this.drafts.set(this.latestDrafts());
    const drafts = this.pending().slice(0, FACEBOOK_TONE_REVIEW_BATCH_SIZE);
    if (!drafts.length) return;
    let body: ReturnType<typeof toneReviewSubmission>;
    try {
      body = this.retrySubmission && JSON.stringify(this.retrySubmission.changes) === JSON.stringify(drafts)
        ? this.retrySubmission : toneReviewSubmission(crypto.randomUUID(), drafts);
      this.retrySubmission = body;
    }
    catch { this.submitError.set('Предложенията не могат да бъдат изпратени. Обновете страницата.'); return; }
    this.submitting.set(true);
    this.submitError.set('');
    this.submitted.set(0);
    this.http.post<unknown>('/api/facebook-tone-suggestions', body)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: response => {
          if (!validToneReviewReceipt(response, body.batchId, drafts.length)) {
            this.submitError.set('Приемането на предложения не е достъпно в момента. Черновите са запазени.');
          } else {
            const next = this.latestDrafts();
            for (const draft of drafts) {
              if (JSON.stringify(next.get(draft.key)) === JSON.stringify(draft)) next.delete(draft.key);
            }
            this.drafts.set(next);
            this.submitted.set(drafts.length);
            this.retrySubmission = null;
            this.persist();
          }
          this.submitting.set(false);
        },
        error: () => {
          this.submitError.set('Изпращането не успя. Черновите са запазени; опитайте отново.');
          this.submitting.set(false);
        },
      });
  }

  private persist(): void {
    try {
      localStorage.setItem(FACEBOOK_TONE_REVIEW_STORAGE, JSON.stringify({ version: 1, drafts: Array.from(this.drafts().values()) }));
      this.storageWriteFailed = false;
    } catch {
      this.storageWriteFailed = true;
      this.draftError.set('Браузърът не запазва черновите. Изпратете предложенията преди да затворите страницата.');
    }
  }
}
