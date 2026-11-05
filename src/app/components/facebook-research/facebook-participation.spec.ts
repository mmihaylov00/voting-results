import { Component, Input, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HighchartsChartComponent } from 'highcharts-angular';
import { afterEach, describe, expect, it } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { ThemeService } from '../../services/theme.service';
import { FacebookParticipationComponent } from './facebook-participation';
import { FacebookParticipationReport, validFacebookParticipationReport } from './facebook-participation.util';
import { FacebookCommentCounts, FacebookCommentsReport, FacebookPage, FacebookPost, FacebookReport } from './facebook-research.models';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

const source = snapshot as FacebookReport;
const pages: FacebookPage[] = ['a', 'b'].map(id => ({ ...source.pages[0], id, name: `Страница ${id}`,
  url: `https://www.facebook.com/${id}` }));
const posts: FacebookPost[] = ['a', 'b'].map(id => ({ ...source.posts[0], id, pageId: id,
  excerpt: `Публикация ${id}`, summary: `Тема ${id}`, url: `https://www.facebook.com/${id}/posts/1/` }));
const hash = 'a'.repeat(64);
const capturedAt = '2026-11-05T12:00:00Z';
const counts = (): FacebookCommentCounts => ({ supportive: 0, critical: 0, mixed: 0, neutral: 0,
  unclear: 0, 'not-mentioned': 0, unreviewed: 20 });

function commentsFixture(): FacebookCommentsReport {
  return { version: 1, capturedAt, collectionSha256: hash, posts: posts.map((post, index) => ({
    postId: post.id, checkedAt: capturedAt, status: index === 0 ? 'complete' : 'partial', ordering: 'all',
    reportedCount: index === 0 ? 20 : 21, capturedCount: 20, assessedCount: 0, topLevelCount: 10,
    replyCount: 10, counts: { gyurov: counts(), yotova: counts() }, notes: [],
  })) };
}

function participationFixture(): FacebookParticipationReport {
  return {
    version: 1, runId: 'snapshot-test', capturedAt, minimumCellCount: 5, unit: 'observed-accounts', collectionSha256: hash,
    coverage: { capturedComments: 40, matchedIdentityComments: 36, unknownIdentityComments: 4 },
    totals: { accounts: 12, accountsOnMultiplePosts: 6, accountsOnMultiplePages: 6 },
    posts: posts.map(post => ({ postId: post.id, pageId: post.pageId, capturedComments: 20,
      topLevelComments: 10, replyComments: 10, matchedIdentityComments: 18, accounts: 9,
      accountsStartingThreads: 5, accountsWithMultipleComments: 5 })),
    pages: pages.map(page => ({ pageId: page.id, postCount: 1, capturedComments: 20, matchedIdentityComments: 18, accounts: 9 })),
    postOverlaps: [{ leftPostId: 'a', rightPostId: 'b', sharedAccounts: 6 }],
    pageOverlaps: [{ leftPageId: 'a', rightPageId: 'b', sharedAccounts: 6 }],
  };
}

function suppressedFixture(): FacebookParticipationReport {
  const data = participationFixture();
  data.totals = { accounts: null, accountsOnMultiplePosts: null, accountsOnMultiplePages: null };
  data.posts.forEach(post => { post.accounts = null; post.accountsStartingThreads = null; post.accountsWithMultipleComments = null; });
  data.pages.forEach(page => { page.accounts = null; });
  data.pageOverlaps = [];
  data.postOverlaps = [];
  return data;
}

function setup() {
  TestBed.configureTestingModule({ imports: [FacebookParticipationComponent], providers: [provideHttpClient(),
    provideHttpClientTesting(), provideRouter([]), { provide: ThemeService, useValue: { darkMode: signal(false) } }] });
  TestBed.overrideComponent(FacebookParticipationComponent, { remove: { imports: [HighchartsChartComponent] },
    add: { imports: [ChartStub] } });
  const fixture = TestBed.createComponent(FacebookParticipationComponent);
  fixture.componentRef.setInput('posts', posts);
  fixture.componentRef.setInput('pages', pages);
  fixture.detectChanges();
  return fixture;
}

function flush(data: FacebookParticipationReport = participationFixture(), comments: FacebookCommentsReport = commentsFixture()) {
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/data/facebook/2026/participation.json').flush(data);
  http.expectOne('/data/facebook/2026/comments.json').flush(comments);
}

describe('Facebook participation snapshot validation', () => {
  it('accepts a fully matched aggregate snapshot and suppression without publishing small cells', () => {
    expect(validFacebookParticipationReport(participationFixture(), posts, commentsFixture())).toBe(true);
    expect(validFacebookParticipationReport(suppressedFixture(), posts, commentsFixture())).toBe(true);
  });

  it('rejects extra fields that could expose participant identifiers or private state', () => {
    const examples = [
      { ...participationFixture(), accounts: { privateToken: {} } },
      { ...participationFixture(), secret: 'hidden' },
      { ...participationFixture(), observedComments: ['private-token'] },
    ];
    const nested = participationFixture();
    Object.assign(nested.posts[0], { accountIds: ['private-token'] });
    const totals = participationFixture();
    Object.assign(totals.totals, { profileUrl: 'https://www.facebook.com/person' });
    for (const value of [...examples, nested, totals]) {
      expect(validFacebookParticipationReport(value, posts, commentsFixture())).toBe(false);
    }
  });

  it('rejects stale snapshots, missing posts, changed Page ownership and incorrect denominators', () => {
    const examples = Array.from({ length: 7 }, participationFixture);
    examples[0].collectionSha256 = 'b'.repeat(64);
    examples[1].posts.pop();
    examples[2].posts[0].pageId = 'b';
    examples[3].posts[0].capturedComments = 21;
    examples[4].coverage.unknownIdentityComments = 3;
    examples[5].pages[0].postCount = 2;
    examples[6].posts[0].replyComments = 9;
    for (const value of examples) expect(validFacebookParticipationReport(value, posts, commentsFixture())).toBe(false);
  });

  it('rejects unsuppressed small cells and impossible account/subset counts', () => {
    const examples = Array.from({ length: 8 }, participationFixture);
    examples[0].totals.accountsOnMultiplePosts = 4;
    examples[1].posts[0].accounts = 19;
    examples[2].posts[0].accountsStartingThreads = 10;
    examples[3].posts[0].accountsWithMultipleComments = 10;
    examples[4].totals.accounts = 8;
    examples[5].pages[0].accounts = null;
    examples[6].totals.accountsOnMultiplePosts = null;
    examples[7].coverage.matchedIdentityComments = -1;
    for (const value of examples) expect(validFacebookParticipationReport(value, posts, commentsFixture())).toBe(false);
  });

  it('rejects duplicate/self/unknown overlaps and pairs above their account bounds', () => {
    const examples = Array.from({ length: 6 }, participationFixture);
    examples[0].postOverlaps.push({ leftPostId: 'b', rightPostId: 'a', sharedAccounts: 6 });
    examples[1].pageOverlaps[0].rightPageId = 'a';
    examples[2].postOverlaps[0].leftPostId = 'unknown';
    examples[3].pageOverlaps[0].sharedAccounts = 10;
    examples[4].postOverlaps[0].sharedAccounts = 4;
    examples[5].pages.push({ ...examples[5].pages[0] });
    for (const value of examples) expect(validFacebookParticipationReport(value, posts, commentsFixture())).toBe(false);
  });
});

describe('Facebook aggregate participation workspace', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders totals, visible view tabs, coverage and source links without account profiles', () => {
    const fixture = setup();
    flush();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.report()?.totals.accounts).toBe(12);
    expect(element.querySelector('.participation-totals')?.textContent).toContain('12');
    expect(element.querySelector('.coverage')?.textContent).toContain('36');
    expect(element.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(element.querySelector('.table-scroll')?.getAttribute('tabindex')).toBe('0');
    expect(element.querySelector('.chart-scroll')).not.toBeNull();
    expect(element.querySelector('.table-scroll a')?.getAttribute('href')).toBe(pages[0].url);
    expect(element.querySelector('.table-scroll a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(element.querySelector('[aria-label*="акаунт #"]')).toBeNull();
    fixture.destroy();
  });

  it('filters Page and post overlap tables with the same search controls and updates the chart', () => {
    const fixture = setup();
    flush();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.pageFilter.set('b');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(1);
    expect(component.chartRows()[0].left).toBe('Страница b');
    component.setView('overlaps');
    fixture.detectChanges();
    expect(component.table()!.viewRows()[0].shared).toBe(6);
    component.setOverlapScope('posts');
    fixture.detectChanges();
    expect(component.table()!.viewRows()[0].leftUrl).toBe(posts[0].url);
    expect(fixture.nativeElement.querySelector('.shared-count')?.textContent).toContain('6');
    component.table()!.query.set('missing');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Няма съвпадения с поне 5 акаунта');
    component.resetFilters();
    component.setView('posts');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(2);
    expect(component.table()!.viewRows()[1].status).toBe('Частична');
    fixture.destroy();
  });

  it('keeps suppressed cells distinct from zero and does not plot suppressed accounts', () => {
    const fixture = setup();
    flush(suppressedFixture());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.participation-totals')?.textContent).toContain('<5');
    expect(fixture.nativeElement.querySelector('.account-count')?.textContent).toBe('<5');
    expect(fixture.nativeElement.querySelector('.chart-scroll')).toBeNull();
    expect(fixture.componentInstance.chartRows()).toHaveLength(0);
    fixture.destroy();
  });

  it('fails closed on mismatched data and lets a visitor retry a network failure', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const stale = participationFixture(); stale.collectionSha256 = 'b'.repeat(64);
    flush(stale);
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('не съвпадат');
    component.load();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(component.dataUrl).flush('unavailable', { status: 503, statusText: 'Unavailable' });
    http.expectOne('/data/facebook/2026/comments.json');
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    expect(component.report()).toBeNull();
    component.load(); flush(); fixture.detectChanges();
    expect(component.report()?.coverage.capturedComments).toBe(40);
    expect(component.error()).toBe('');
    fixture.destroy();
  });
});
