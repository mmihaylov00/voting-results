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
    expect(element.querySelector('dialog')).not.toBeNull();
    expect(element.querySelector('.comment-text')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element.querySelector('.reader-list img')).toBeNull();
    expect(element.querySelector('.unpublished')).toBeNull();
    expect(element.querySelector('[role=tablist]')).toBeNull();
    const labels = Array.from(element.querySelectorAll('.root-comment .comment-tone'), badge => badge.textContent);
    expect(labels).toHaveLength(4);
    expect(labels.some(label => label?.includes('Гюров'))).toBe(true);
    expect(labels.some(label => label?.includes('Йотова'))).toBe(true);
    const firstCommentTones = element.querySelectorAll('.root-comment')[0].querySelectorAll('.comment-tone');
    expect(firstCommentTones[0].textContent).toContain('Гюров');
    expect(firstCommentTones[0].getAttribute('data-tone')).toBe('not-mentioned');
    expect(firstCommentTones[1].textContent).toContain('Йотова');
    expect(firstCommentTones[1].getAttribute('data-tone')).toBe('supportive');
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

  it('groups forward-reference replies under roots and keeps replies collapsed by default', () => {
    const fixture = setup();
    flushReader();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.visibleThreads().map(thread => thread.root.id)).toEqual([2, 3]);
    expect(component.visibleThreads()[1].replies.map(reply => reply.id)).toEqual([1, 4]);
    expect(component.expandedThreads().size).toBe(0);
    expect(element.querySelectorAll('.thread')).toHaveLength(2);
    expect(element.querySelector<HTMLElement>('.replies')?.hidden).toBe(true);
    expect(element.querySelectorAll('.replies .reply')).toHaveLength(0);
    expect(element.querySelectorAll('.reply-toggle')).toHaveLength(1);
    expect(element.querySelector('.reply-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.reply-toggle')?.textContent).toContain('2');
    fixture.destroy();
  });

  it('expands and collapses replies without replacing the focused toggle or root list', () => {
    const fixture = setup();
    flushReader();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const threads = component.visibleThreads();
    const toggle = element.querySelector<HTMLButtonElement>('.reply-toggle')!;
    const controlledId = toggle.getAttribute('aria-controls');
    expect(controlledId).toBeTruthy();
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    expect(component.visibleThreads()).toBe(threads);
    expect(component.expandedThreads().has(3)).toBe(true);
    expect(element.querySelector('.reply-toggle')).toBe(toggle);
    expect(toggle.ownerDocument.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.replies')?.id).toBe(controlledId);
    expect(element.querySelectorAll('.replies .comment-tone')).toHaveLength(4);
    expect(element.querySelector('.replies .comment-text')?.textContent).toContain('Критичен откъс.');
    expect(element.querySelector('.unpublished')?.textContent).toContain('Няма публикуван откъс');
    toggle.click();
    fixture.detectChanges();
    expect(component.visibleThreads()).toBe(threads);
    expect(element.querySelector<HTMLElement>('.replies')?.hidden).toBe(true);
    expect(element.querySelectorAll('.replies .reply')).toHaveLength(0);
    expect(element.querySelector('.reply-toggle')).toBe(toggle);
    expect(toggle.ownerDocument.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('.replies .comment-text')?.textContent).toContain('Критичен откъс.');
    fixture.destroy();
  });

  it('retains the root as context when only a reply matches search and both tone filters', () => {
    const fixture = setup();
    flushReader();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.gyurovToneFilter.set('critical');
    component.yotovaToneFilter.set('not-mentioned');
    component.table()!.query.set('критичен');
    fixture.detectChanges();
    expect(component.table()!.viewRows().map(comment => comment.id)).toEqual([1]);
    expect(component.visibleThreads().map(thread => thread.root.id)).toEqual([3]);
    expect(component.visibleThreads()[0].rootMatches).toBe(false);
    expect(component.visibleThreads()[0].replies.map(reply => reply.id)).toEqual([1]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.root-comment .comment-text')?.textContent).toContain('Контекст за пълния коментар.');
    expect(element.querySelector('.reply-toggle')?.textContent).toContain('1');
    component.toggleReplies(3);
    fixture.detectChanges();
    expect(element.querySelector('.replies .comment-text')?.textContent).toContain('Критичен откъс.');
    expect(element.querySelector('.unpublished')).toBeNull();
    fixture.destroy();
  });

  it('requires both tone filters to match the same comment and resets filters and expansions', () => {
    const fixture = setup();
    const data = excerpts();
    data.comments[1].yotova = 'neutral';
    data.comments[2].yotova = 'supportive';
    flushReader(data);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.gyurovToneFilter.set('critical');
    component.yotovaToneFilter.set('supportive');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(0);
    expect(component.visibleThreads()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Няма коментари по тези филтри.');
    component.yotovaToneFilter.set('not-mentioned');
    component.table()!.query.set('критичен');
    component.toggleReplies(3);
    fixture.detectChanges();
    expect(component.expandedThreads().has(3)).toBe(true);
    component.resetFilters();
    fixture.detectChanges();
    expect(component.gyurovToneFilter()).toBe('');
    expect(component.yotovaToneFilter()).toBe('');
    expect(component.table()!.query()).toBe('');
    expect(component.table()!.viewRows()).toHaveLength(4);
    expect(component.visibleThreads()).toHaveLength(2);
    expect(component.expandedThreads().size).toBe(0);
    expect(fixture.nativeElement.querySelector('.replies')?.hidden).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.replies .reply')).toHaveLength(0);
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
    component.toggleReplies(3);
    expect(component.expandedThreads().has(3)).toBe(true);
    component.load();
    expect(component.expandedThreads().size).toBe(0);
    flushReader();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.replies .reply')).toHaveLength(0);
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
