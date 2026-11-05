import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookCommentReaderManifest, FacebookCommentReaderReport } from './facebook-comment-reader.util';
import { FacebookCommentCounts, FacebookCommentsReport, FacebookReport } from './facebook-research.models';
import { FacebookToneReviewService } from './facebook-tone-review.service';
import { FACEBOOK_TONE_REVIEW_BATCH_SIZE, FACEBOOK_TONE_REVIEW_STORAGE, FacebookToneReviewDraft } from './facebook-tone-review.util';

const baseUrl = '/data/facebook/2026/';
const endpoint = '/api/facebook-tone-suggestions';
const source = snapshot as FacebookReport;
const hash = 'a'.repeat(64);
const sha = (index: number) => index.toString(16).padStart(64, '0');
const counts = (patch: Partial<FacebookCommentCounts> = {}): FacebookCommentCounts => ({
  supportive: 0, critical: 0, mixed: 0, neutral: 0, unclear: 0, 'not-mentioned': 0, unreviewed: 0, ...patch,
});

function dataFixture(postCount = 2, withComments = true) {
  const posts = Array.from({ length: postCount }, (_, index) => ({
    ...source.posts[0], id: `post:${index}`, pageId: source.pages[0].id,
    url: `https://www.facebook.com/research/posts/${index + 1}/`, excerpt: `Публикация ${index}`,
    summary: `Контекст ${index}`, keywords: [], images: undefined, sourceTextSha256: sha(index + 1000),
    origin: 'collection' as const, stance: { gyurov: 'supportive' as const, yotova: 'critical' as const,
      reason: 'Основание.', sourceTextSha256: sha(index + 1000) },
  }));
  const report: FacebookReport = { ...source, collectionSha256: hash, pages: [source.pages[0]], posts,
    collectionPostCount: postCount, coverage: [], matches: [], reviews: [], directory: undefined };
  const coverage: FacebookCommentsReport = { version: 1, capturedAt: '2026-11-05T10:00:00Z', collectionSha256: hash,
    posts: posts.map(post => ({ postId: post.id, checkedAt: '2026-11-05T10:00:00Z', status: 'complete', ordering: 'all',
      reportedCount: withComments ? 3 : 0, capturedCount: withComments ? 3 : 0, assessedCount: withComments ? 2 : 0,
      topLevelCount: withComments ? 2 : 0, replyCount: withComments ? 1 : 0,
      counts: withComments ? { gyurov: counts({ neutral: 1, critical: 1, unreviewed: 1 }),
        yotova: counts({ critical: 1, 'not-mentioned': 1, unreviewed: 1 }) } : { gyurov: counts(), yotova: counts() }, notes: [],
    })) };
  const manifest: FacebookCommentReaderManifest = { version: 1, collectionSha256: hash,
    posts: posts.map((post, index) => ({ postId: post.id, file: `${sha(index + 1)}.json`, count: withComments ? 3 : 0 })) };
  const readers = new Map(manifest.posts.map(entry => [entry.file, {
    version: 1, collectionSha256: hash, postId: entry.postId, comments: withComments ? [
      { id: 1, parentId: null, text: `Основен коментар ${entry.postId}`, truncated: false, gyurov: 'neutral', yotova: 'critical' },
      { id: 2, parentId: 1, text: `Отговор ${entry.postId}`, truncated: false, gyurov: 'critical', yotova: 'not-mentioned' },
      { id: 3, parentId: null, text: null, truncated: false, gyurov: 'unreviewed', yotova: 'unreviewed' },
    ] : [],
  } as FacebookCommentReaderReport]));
  return { report, coverage, manifest, readers };
}

function service() { return TestBed.inject(FacebookToneReviewService); }
function headers(data: ReturnType<typeof dataFixture>) {
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${baseUrl}report.json`).flush(data.report);
  http.expectOne(`${baseUrl}comments.json`).flush(data.coverage);
  http.expectOne(`${baseUrl}comments/manifest.json`).flush(data.manifest);
}
function readers(data: ReturnType<typeof dataFixture>) {
  const http = TestBed.inject(HttpTestingController);
  for (let batch = 0; batch <= data.manifest.posts.length; batch++) {
    const requests = http.match(request => request.url.startsWith(`${baseUrl}comments/`) && !request.url.endsWith('manifest.json'));
    if (!requests.length) break;
    for (const request of requests) request.flush(data.readers.get(request.request.url.split('/').at(-1)!)!);
  }
}
function load(data = dataFixture(), current = service()) {
  current.load(); headers(data); readers(data);
  return current;
}
function savedDrafts(): FacebookToneReviewDraft[] {
  return JSON.parse(localStorage.getItem(FACEBOOK_TONE_REVIEW_STORAGE)!).drafts;
}

describe('Facebook tone review service', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [FacebookToneReviewService, provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => {
    try { TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }); }
    finally { TestBed.resetTestingModule(); vi.restoreAllMocks(); localStorage.clear(); }
  });

  it('loads source-pinned posts and comment context with at most six reader requests in flight', () => {
    const data = dataFixture(8);
    const current = service();
    const http = TestBed.inject(HttpTestingController);
    current.load(); headers(data);
    const initial = http.match(request => request.url.startsWith(`${baseUrl}comments/`));
    expect(initial).toHaveLength(6);
    expect(current.items()).toHaveLength(8);
    expect(current.commentsLoaded()).toBe(false);
    initial[0].flush(data.readers.get(data.manifest.posts[0].file)!);
    expect(current.progress()).toBe(1);
    expect(current.items()).toHaveLength(8);
    const seventh = http.expectOne(`${baseUrl}comments/${data.manifest.posts[6].file}`);
    seventh.flush(data.readers.get(data.manifest.posts[6].file)!);
    const eighth = http.expectOne(`${baseUrl}comments/${data.manifest.posts[7].file}`);
    eighth.flush(data.readers.get(data.manifest.posts[7].file)!);
    for (const request of initial.slice(1)) request.flush(data.readers.get(request.request.url.split('/').at(-1)!)!);
    expect(current.commentsLoaded()).toBe(true);
    expect(current.progress()).toBe(8);
    expect(current.items()).toHaveLength(32);
    const reply = current.items().find(item => item.kind === 'comment' && item.postId === 'post:0' && item.commentId === 2)!;
    expect(reply.parentText).toBe('Основен коментар post:0');
    expect(reply.sourceSha256).toBe(sha(1));
    expect(reply.collectionSha256).toBe(hash);
  });

  it('edits both independent tones, persists drafts and removes an edit restored to its baseline', () => {
    const current = load();
    const item = current.items()[0];
    current.setTone(item, 'gyurov', 'critical');
    current.setTone(item, 'yotova', 'neutral');
    expect(current.pendingCount()).toBe(1);
    expect(current.tone(item, 'gyurov')).toBe('critical');
    expect(current.tone(item, 'yotova')).toBe('neutral');
    expect(savedDrafts()[0]).toMatchObject({ originalGyurov: 'supportive', originalYotova: 'critical', gyurov: 'critical', yotova: 'neutral' });
    current.setTone(item, 'gyurov', item.gyurov);
    expect(current.pendingCount()).toBe(1);
    current.setTone(item, 'yotova', item.yotova);
    expect(current.pendingCount()).toBe(0);
    current.setTone(item, 'gyurov', 'mixed');
    current.undo(item);
    expect(current.changed(item)).toBe(false);
    expect(savedDrafts()).toEqual([]);
  });

  it('restores drafts only against loaded current rows and blocks submit until all comments validate', () => {
    const data = dataFixture();
    const first = load(data);
    const post = first.items()[0];
    const comment = first.items().find(item => item.kind === 'comment' && item.commentId === 2)!;
    first.setTone(post, 'gyurov', 'critical');
    first.setTone(comment, 'yotova', 'supportive');
    const restored = TestBed.runInInjectionContext(() => new FacebookToneReviewService());
    expect(restored.pendingCount()).toBe(0);
    restored.load(); headers(data);
    expect(restored.pendingCount()).toBe(1);
    restored.submit();
    TestBed.inject(HttpTestingController).expectNone(request => request.method === 'POST');
    readers(data);
    expect(restored.pendingCount()).toBe(2);
    expect(restored.tone(restored.items().find(item => item.key === comment.key)!, 'yotova')).toBe('supportive');
  });

  it('discards obsolete content-hash drafts after complete load and refuses unpublished or invalid edits', () => {
    const data = dataFixture();
    const first = load(data);
    const comment = first.items().find(item => item.kind === 'comment' && item.commentId === 2)!;
    first.setTone(comment, 'gyurov', 'supportive');
    const drafts = savedDrafts();
    drafts[0].sourceSha256 = 'f'.repeat(64);
    localStorage.setItem(FACEBOOK_TONE_REVIEW_STORAGE, JSON.stringify({ version: 1, drafts }));
    const restored = load(data, TestBed.runInInjectionContext(() => new FacebookToneReviewService()));
    expect(restored.pendingCount()).toBe(0);
    expect(savedDrafts()).toEqual([]);
    expect(restored.draftError()).not.toBe('');
    restored.setTone(restored.items().find(item => item.text === null)!, 'gyurov', 'critical');
    restored.setTone(restored.items()[0], 'gyurov', 'unexpected');
    expect(restored.pendingCount()).toBe(0);
  });

  it('reports damaged local storage and a storage write failure without losing the in-memory edit', () => {
    localStorage.setItem(FACEBOOK_TONE_REVIEW_STORAGE, '{invalid-json');
    const current = load();
    expect(current.draftError()).not.toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    current.setTone(current.items()[0], 'gyurov', 'critical');
    expect(current.pendingCount()).toBe(1);
    expect(current.draftError()).toContain('Браузърът не запазва');
  });

  it('keeps all in-memory edits when writing storage fails but reading still returns older saved data', () => {
    const current = load();
    current.setTone(current.items()[0], 'gyurov', 'critical');
    const saved = localStorage.getItem(FACEBOOK_TONE_REVIEW_STORAGE);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    current.setTone(current.items()[1], 'gyurov', 'critical');
    current.setTone(current.items()[0], 'yotova', 'neutral');
    expect(current.pendingCount()).toBe(2);
    expect(current.tone(current.items()[0], 'gyurov')).toBe('critical');
    expect(current.tone(current.items()[0], 'yotova')).toBe('neutral');
    expect(localStorage.getItem(FACEBOOK_TONE_REVIEW_STORAGE)).toBe(saved);
    current.submit();
    const request = TestBed.inject(HttpTestingController).expectOne(endpoint);
    expect(request.request.body.changes).toHaveLength(2);
    request.flush({ version: 1, batchId: request.request.body.batchId, accepted: 2 });
    expect(current.pendingCount()).toBe(0);
    expect(current.submitted()).toBe(2);
  });

  it('merges edits from two tabs by key and updates existing views through storage events', () => {
    const data = dataFixture();
    const first = load(data);
    const second = load(data, TestBed.runInInjectionContext(() => new FacebookToneReviewService()));
    first.setTone(first.items()[0], 'gyurov', 'critical');
    second.setTone(second.items()[1], 'yotova', 'neutral');
    expect(savedDrafts()).toHaveLength(2);
    expect(second.pendingCount()).toBe(2);
    window.dispatchEvent(new StorageEvent('storage', { key: FACEBOOK_TONE_REVIEW_STORAGE }));
    expect(first.pendingCount()).toBe(2);
    expect(first.tone(first.items()[1], 'yotova')).toBe('neutral');
    first.undo(first.items()[0]);
    window.dispatchEvent(new StorageEvent('storage', { key: FACEBOOK_TONE_REVIEW_STORAGE }));
    expect(second.pendingCount()).toBe(1);
    expect(second.changed(second.items()[0])).toBe(false);
    expect(second.changed(second.items()[1])).toBe(true);
  });

  it('keeps another tab\'s changes to submitted and unrelated keys when the earlier batch is acknowledged', () => {
    const data = dataFixture();
    const first = load(data);
    const second = load(data, TestBed.runInInjectionContext(() => new FacebookToneReviewService()));
    first.setTone(first.items()[0], 'gyurov', 'critical');
    first.submit();
    const request = TestBed.inject(HttpTestingController).expectOne(endpoint);
    second.setTone(second.items()[0], 'yotova', 'neutral');
    second.setTone(second.items()[1], 'gyurov', 'critical');
    window.dispatchEvent(new StorageEvent('storage', { key: FACEBOOK_TONE_REVIEW_STORAGE }));
    expect(first.pendingCount()).toBe(2);
    request.flush({ version: 1, batchId: request.request.body.batchId, accepted: 1 });
    expect(first.submitted()).toBe(1);
    expect(first.pendingCount()).toBe(2);
    expect(first.tone(first.items()[0], 'gyurov')).toBe('critical');
    expect(first.tone(first.items()[0], 'yotova')).toBe('neutral');
    expect(savedDrafts()).toHaveLength(2);
  });

  it('edits using the current canonical item instead of caller-provided source pins or labels', () => {
    const current = load();
    const item = current.items()[0];
    current.setTone({ ...item, sourceSha256: 'f'.repeat(64), gyurov: 'neutral' }, 'yotova', 'supportive');
    expect(current.pendingCount()).toBe(1);
    expect(current.pending()[0]).toMatchObject({ sourceSha256: item.sourceSha256,
      originalGyurov: item.gyurov, originalYotova: item.yotova, yotova: 'supportive' });
    current.setTone({ ...item, key: 'unknown' }, 'gyurov', 'critical');
    expect(current.pendingCount()).toBe(1);
  });

  it('rejects missing source pins even for a post without an existing assessment', () => {
    const current = service();
    const invalidCollection = dataFixture();
    invalidCollection.report.collectionSha256 = 'invalid';
    current.load(); headers(invalidCollection);
    expect(current.error()).not.toBe('');
    expect(current.items()).toEqual([]);
    const invalidPost = dataFixture();
    invalidPost.report.posts[0].stance = undefined;
    invalidPost.report.posts[0].sourceTextSha256 = 'invalid';
    current.load(); headers(invalidPost);
    expect(current.error()).not.toBe('');
    expect(current.items()).toEqual([]);
  });

  it('rejects mismatched headers and reports a network failure with retry', () => {
    const current = service();
    const data = dataFixture();
    data.manifest.collectionSha256 = 'c'.repeat(64);
    current.load(); headers(data);
    expect(current.error()).not.toBe('');
    expect(current.items()).toEqual([]);
    current.load();
    const requests = TestBed.inject(HttpTestingController).match(request => request.url.startsWith(baseUrl));
    requests.find(request => request.request.url.endsWith('report.json'))!.flush('offline', { status: 503, statusText: 'Unavailable' });
    expect(current.loading()).toBe(false);
    expect(current.error()).toContain('не можаха');
    load(dataFixture(), current);
    expect(current.commentsLoaded()).toBe(true);
    expect(current.error()).toBe('');
  });

  it('preserves restored comment drafts on a partial reader failure and allows retry', () => {
    const data = dataFixture();
    const first = load(data);
    first.setTone(first.items().find(item => item.kind === 'comment' && item.commentId === 2)!, 'gyurov', 'supportive');
    const current = TestBed.runInInjectionContext(() => new FacebookToneReviewService());
    current.load(); headers(data);
    const http = TestBed.inject(HttpTestingController);
    const requests = http.match(request => request.url.startsWith(`${baseUrl}comments/`));
    requests[0].flush({ ...data.readers.get(data.manifest.posts[0].file)!, collectionSha256: 'c'.repeat(64) });
    expect(current.commentsLoaded()).toBe(false);
    expect(current.commentsError()).not.toBe('');
    expect(savedDrafts()).toHaveLength(1);
    current.loadComments(); readers(data);
    expect(current.commentsLoaded()).toBe(true);
    expect(current.pendingCount()).toBe(1);
  });

  it('posts source-pinned JSON suggestions and retains drafts on network or wrong acknowledgement failures', () => {
    const current = load();
    const comment = current.items().find(item => item.kind === 'comment' && item.commentId === 2)!;
    current.setTone(comment, 'gyurov', 'supportive');
    const http = TestBed.inject(HttpTestingController);
    current.submit(); current.submit();
    const request = http.expectOne(endpoint);
    expect(request.request.method).toBe('POST');
    expect(request.request.detectContentTypeHeader()).toBe('application/json');
    expect(request.request.body.version).toBe(1);
    expect(request.request.body.changes).toEqual(current.pending());
    expect(Object.keys(request.request.body).sort()).toEqual(['version', 'batchId', 'changes'].sort());
    expect(JSON.stringify(request.request.body)).not.toContain(comment.text!);
    current.undo(comment); current.setTone(comment, 'yotova', 'critical');
    expect(current.pendingCount()).toBe(1);
    request.flush('offline', { status: 503, statusText: 'Unavailable' });
    expect(current.submitting()).toBe(false);
    expect(current.pendingCount()).toBe(1);
    expect(current.submitError()).not.toBe('');
    current.submit();
    const retry = http.expectOne(endpoint);
    expect(retry.request.body.batchId).toBe(request.request.body.batchId);
    retry.flush('<!doctype html><html><app-root></app-root></html>');
    expect(current.pendingCount()).toBe(1);
    expect(current.submitted()).toBe(0);
    expect(current.submitError()).toContain('Черновите са запазени');
    for (const patch of [{ batchId: 'wrong-batch' }, { accepted: 2 }, { version: 2 }, { extra: true }]) {
      current.submit();
      const invalid = http.expectOne(endpoint);
      invalid.flush({ version: 1, batchId: invalid.request.body.batchId, accepted: 1, ...patch });
      expect(current.pendingCount()).toBe(1);
      expect(current.submitted()).toBe(0);
    }
  });

  it('clears only the successfully sent bounded batch and keeps remaining drafts for another send', () => {
    const current = load(dataFixture(FACEBOOK_TONE_REVIEW_BATCH_SIZE + 2, false));
    for (const item of current.items()) current.setTone(item, 'gyurov', 'critical');
    current.submit();
    const request = TestBed.inject(HttpTestingController).expectOne(endpoint);
    const submitted = request.request.body.changes;
    expect(submitted).toHaveLength(FACEBOOK_TONE_REVIEW_BATCH_SIZE);
    request.flush({ version: 1, batchId: request.request.body.batchId, accepted: FACEBOOK_TONE_REVIEW_BATCH_SIZE });
    expect(current.pendingCount()).toBe(2);
    expect(current.submitted()).toBe(FACEBOOK_TONE_REVIEW_BATCH_SIZE);
    expect(savedDrafts()).toHaveLength(2);
    expect(current.submitting()).toBe(false);
    expect(current.submitError()).toBe('');
  });
});
