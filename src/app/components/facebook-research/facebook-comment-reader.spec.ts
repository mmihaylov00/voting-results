import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookCommentReaderComponent } from './facebook-comment-reader';
import { FacebookCommentReaderManifest, FacebookCommentReaderReport, validFacebookCommentReaderManifest, validFacebookCommentReaderReport } from './facebook-comment-reader.util';
import { FacebookCommentRow } from './facebook-comments.util';
import { FacebookCommentCounts, FacebookReport } from './facebook-research.models';

const hash = 'a'.repeat(64);
const file = `${'b'.repeat(64)}.json`;
const source = snapshot as FacebookReport;
const post = source.posts[0];
const page = source.pages.find(page => page.id === post.pageId)!;
const counts: FacebookCommentCounts = { supportive: 0, critical: 1, mixed: 0, neutral: 1, unclear: 0, 'not-mentioned': 1, unreviewed: 1 };
const row: FacebookCommentRow = { post, page, postId: post.id, checkedAt: '2026-11-05T12:00:00Z', status: 'complete',
  ordering: 'all', reportedCount: 4, capturedCount: 4, assessedCount: 3, topLevelCount: 2, replyCount: 2,
  counts: { gyurov: counts, yotova: { ...counts, supportive: 1, critical: 0 } }, notes: [] };
const manifest = (): FacebookCommentReaderManifest => ({ version: 1, collectionSha256: hash,
  posts: [{ postId: post.id, file, count: 4 }] });
const excerpts = (): FacebookCommentReaderReport => ({ version: 1, collectionSha256: hash, postId: post.id, comments: [
  { id: 1, parentId: 3, text: 'Критичен откъс.', truncated: false, gyurov: 'critical', yotova: 'not-mentioned' },
  { id: 2, parentId: null, text: '<img src=x onerror=alert(1)>', truncated: true, gyurov: 'not-mentioned', yotova: 'supportive' },
  { id: 3, parentId: null, text: 'Контекст за пълния коментар.', truncated: false, gyurov: 'neutral', yotova: 'neutral' },
  { id: 4, parentId: 3, text: null, truncated: false, gyurov: 'unreviewed', yotova: 'unreviewed' },
] });

function setup() {
  TestBed.configureTestingModule({ imports: [FacebookCommentReaderComponent], providers: [
    provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
  ] });
  const fixture = TestBed.createComponent(FacebookCommentReaderComponent);
  fixture.componentRef.setInput('row', row);
  fixture.componentRef.setInput('collectionSha256', hash);
  fixture.componentRef.setInput('initialCandidate', 'yotova');
  fixture.detectChanges();
  return fixture;
}

function flushReader(data = excerpts()) {
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/data/facebook/2026/comments/manifest.json').flush(manifest());
  http.expectOne(`/data/facebook/2026/comments/${file}`).flush(data);
}

describe('Facebook comment reader validation', () => {
  it('accepts snapshot-local numbers and forward references to thread roots', () => {
    expect(validFacebookCommentReaderManifest(manifest(), hash)).toBe(true);
    expect(validFacebookCommentReaderReport(excerpts(), manifest().posts[0], hash, row.counts)).toBe(true);
    const unpublished = excerpts();
    unpublished.comments[3].truncated = true;
    expect(validFacebookCommentReaderReport(unpublished, manifest().posts[0], hash, row.counts)).toBe(true);
  });

  it('rejects unsafe paths, duplicate entries, mismatched snapshots and unexpected author fields', () => {
    const path = manifest();
    path.posts[0].file = '../../captures.json';
    expect(validFacebookCommentReaderManifest(path, hash)).toBe(false);
    const duplicate = manifest();
    duplicate.posts.push({ ...duplicate.posts[0] });
    expect(validFacebookCommentReaderManifest(duplicate, hash)).toBe(false);
    expect(validFacebookCommentReaderManifest(manifest(), 'c'.repeat(64))).toBe(false);
    const identity = { ...excerpts(), author: 'unexpected' };
    expect(validFacebookCommentReaderReport(identity, manifest().posts[0], hash, row.counts)).toBe(false);
    const comments = excerpts();
    Object.assign(comments.comments[0], { profileUrl: 'https://www.facebook.com/profile' });
    expect(validFacebookCommentReaderReport(comments, manifest().posts[0], hash, row.counts)).toBe(false);
  });

  it('rejects native-looking IDs, missing roots, reply-to-reply chains and invalid tone denominators', () => {
    const examples = [excerpts(), excerpts(), excerpts(), excerpts(), excerpts()];
    examples[0].comments[0].id = 18400000000000;
    examples[1].comments[0].parentId = 5;
    examples[2].comments[0].parentId = 4;
    examples[3].comments[3].gyurov = 'neutral';
    examples[4].comments[3].text = ' ';
    for (const value of examples) expect(validFacebookCommentReaderReport(value, manifest().posts[0], hash, row.counts)).toBe(false);
    expect(validFacebookCommentReaderReport(excerpts(), { ...manifest().posts[0], count: 5 }, hash, row.counts)).toBe(false);
  });

  it('measures the excerpt limit in Unicode codepoints', () => {
    const data = excerpts();
    data.comments[0].text = '🙂'.repeat(280);
    expect(validFacebookCommentReaderReport(data, manifest().posts[0], hash, row.counts)).toBe(true);
    data.comments[0].text += '🙂';
    expect(validFacebookCommentReaderReport(data, manifest().posts[0], hash, row.counts)).toBe(false);
  });

  it('rejects labels from a different assessment revision even when the raw hash is unchanged', () => {
    const data = excerpts();
    data.comments[0].gyurov = 'neutral';
    expect(validFacebookCommentReaderReport(data, manifest().posts[0], hash, row.counts)).toBe(false);
  });
});

describe('Facebook comment reader', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads only the selected post, renders excerpts as text and preserves source provenance', () => {
    const fixture = setup();
    flushReader();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.candidate()).toBe('yotova');
    expect(element.querySelector('dialog')).not.toBeNull();
    expect(element.querySelector('.comment-text')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element.querySelector('.reader-list img')).toBeNull();
    expect(element.querySelector('.unpublished')?.textContent).toContain('Няма публикуван откъс');
    const source = element.querySelector('dialog a')!;
    expect(source.getAttribute('href')).toBe(post.url);
    expect(source.getAttribute('rel')).toBe('noopener noreferrer');
    expect(element.querySelector('.reader-list')?.getAttribute('tabindex')).toBe('0');
    const close = vi.fn();
    component.close.subscribe(close);
    element.querySelector<HTMLButtonElement>('button[aria-label="Затвори"]')!.click();
    expect(close).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('combines candidate tone and excerpt search, opens a complete thread and resets filters', () => {
    const fixture = setup();
    flushReader();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.setCandidate('gyurov');
    component.toneFilter.set('critical');
    component.table()!.query.set('критичен');
    fixture.detectChanges();
    expect(component.table()!.viewRows().map(comment => comment.id)).toEqual([1]);
    component.showThread(3);
    fixture.detectChanges();
    expect(component.table()!.viewRows().map(comment => comment.id)).toEqual([3, 1, 4]);
    expect(component.toneFilter()).toBe('');
    expect(component.table()!.query()).toBe('');
    component.resetFilters();
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(4);
    expect(component.threadFilter()).toBeNull();
    fixture.destroy();
  });

  it('fails closed on a mismatched manifest or file and permits retry', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${component.baseUrl}manifest.json`).flush({ ...manifest(), collectionSha256: 'c'.repeat(64) });
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    component.load();
    const wrong = excerpts();
    wrong.postId = 'another-post';
    flushReader(wrong);
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    component.load();
    flushReader();
    fixture.detectChanges();
    expect(component.report()?.comments).toHaveLength(4);
    expect(component.error()).toBe('');
    fixture.destroy();
  });

  it('shows a network failure without inventing empty comments', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    TestBed.inject(HttpTestingController).expectOne(`${component.baseUrl}manifest.json`)
      .flush('unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.error()).toContain('не можаха');
    fixture.destroy();
  });
});
