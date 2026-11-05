import { Component, Input, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { afterEach, describe, expect, it } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { ThemeService } from '../../services/theme.service';
import { FacebookCommentsResearchComponent } from './facebook-comments-research';
import { FacebookCommentRow, facebookCommentPageCounts, facebookCommentTotals, validFacebookCommentsReport } from './facebook-comments.util';
import { FacebookCommentCounts, FacebookCommentsReport, FacebookPage, FacebookPost, FacebookReport } from './facebook-research.models';
import { FACEBOOK_STANCE_BUCKETS } from './facebook-research.util';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

const source = snapshot as FacebookReport;
const pages: FacebookPage[] = ['a', 'b'].map(id => ({ ...source.pages[0], id, name: `Страница ${id}` }));
const posts: FacebookPost[] = ['a', 'b', 'c', 'd'].map((id, index) => ({ ...source.posts[0], id,
  pageId: index === 1 ? 'b' : 'a', excerpt: `Публикация ${id}`, summary: `Тема ${id}`,
  url: `https://www.facebook.com/${index === 1 ? 'b' : 'a'}/posts/${id}/` }));
const counts = (patch: Partial<FacebookCommentCounts> = {}): FacebookCommentCounts => ({
  supportive: 0, critical: 0, mixed: 0, neutral: 0, unclear: 0, 'not-mentioned': 0, unreviewed: 0, ...patch,
});

function commentFixture(): FacebookCommentsReport {
  const checkedAt = '2026-11-05T10:00:00Z';
  return { version: 1, capturedAt: checkedAt, collectionSha256: 'a'.repeat(64), posts: posts.map((post, index) => ({
    postId: post.id, checkedAt: index === 3 ? null : checkedAt,
    status: (['partial', 'unavailable', 'complete', 'not-checked'] as const)[index],
    ordering: index === 0 || index === 2 ? 'all' : null,
    reportedCount: index === 0 ? 6 : index === 2 ? 0 : null,
    capturedCount: index === 0 ? 4 : 0, assessedCount: index === 0 ? 3 : 0,
    topLevelCount: index === 0 ? 3 : 0, replyCount: index === 0 ? 1 : 0,
    counts: index === 0 ? { gyurov: counts({ supportive: 1, critical: 1, neutral: 1, unreviewed: 1 }),
      yotova: counts({ critical: 1, neutral: 2, unreviewed: 1 }) } : { gyurov: counts(), yotova: counts() }, notes: [],
  })) };
}

function setup() {
  TestBed.configureTestingModule({ imports: [FacebookCommentsResearchComponent], providers: [
    provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ThemeService, useValue: { darkMode: signal(false) } },
  ] });
  TestBed.overrideComponent(FacebookCommentsResearchComponent, { remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] } });
  const fixture = TestBed.createComponent(FacebookCommentsResearchComponent);
  fixture.componentRef.setInput('pages', pages);
  fixture.componentRef.setInput('posts', posts);
  fixture.detectChanges();
  return fixture;
}

describe('Facebook comment aggregates', () => {
  it('validates post coverage and each independent candidate denominator', () => {
    expect(validFacebookCommentsReport(commentFixture(), posts)).toBe(true);
    const invalid = [commentFixture(), commentFixture(), commentFixture(), commentFixture(), commentFixture()];
    invalid[0].posts[0].counts.gyurov.critical = 2;
    invalid[1].posts[1].postId = 'unknown';
    invalid[2].posts[1].postId = invalid[2].posts[0].postId;
    invalid[3].posts[0].replyCount = -1;
    invalid[4].posts[3].reportedCount = 0;
    for (const data of invalid) expect(validFacebookCommentsReport(data, posts)).toBe(false);
    expect(validFacebookCommentsReport({ ...commentFixture(), posts: [] }, posts)).toBe(false);
  });

  it('keeps support, criticism, missing coverage and displayed totals distinct', () => {
    const rows: FacebookCommentRow[] = commentFixture().posts.map((row, index) => ({ ...row, post: posts[index], page: pages.find(page => page.id === posts[index].pageId)! }));
    expect(facebookCommentPageCounts(rows, 'gyurov')).toEqual([{ id: 'a', name: 'Страница a', supportive: 1, critical: 1 }]);
    expect(facebookCommentPageCounts(rows, 'yotova')).toEqual([{ id: 'a', name: 'Страница a', supportive: 0, critical: 1 }]);
    expect(facebookCommentTotals(rows)).toEqual({ captured: 4, assessed: 3, checked: 3, reported: 6, reportedPosts: 2 });
  });
});

describe('Facebook comments workspace', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the separate dataset and renders candidate counts with linked controls and full coverage', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    TestBed.inject(HttpTestingController).expectOne(component.dataUrl).flush(commentFixture());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(component.totals()).toEqual({ captured: 4, assessed: 3, checked: 3, reported: 6, reportedPosts: 2 });
    expect(component.pageCounts()[0]).toMatchObject({ supportive: 1, critical: 1 });
    const critical = component.chartOptions().series![1] as Highcharts.SeriesBarOptions;
    expect((critical.data as Highcharts.PointOptionsObject[])[0].y).toBe(-1);
    expect(element.querySelector('.chart-scroll')?.getAttribute('tabindex')).toBe('0');
    for (const tab of element.querySelectorAll('[role="tab"]')) {
      expect(element.querySelector(`#${tab.getAttribute('aria-controls')}`)?.getAttribute('role')).toBe('tabpanel');
    }
    element.querySelector<HTMLButtonElement>('#facebook-comments-candidate-tab-yotova')!.click();
    fixture.detectChanges();
    expect(component.pageCounts()[0]).toMatchObject({ supportive: 0, critical: 1 });
    expect(component.exportTitle()).toContain('Йотова');
    expect(element.querySelector('.sr-only caption')?.textContent).toContain('Йотова');
    expect(element.querySelector('.comments-table a')?.getAttribute('rel')).toBe('noopener noreferrer');
    fixture.destroy();
  });

  it('shows unavailable and unchecked threads as missing while preserving an observed zero', () => {
    const fixture = setup();
    TestBed.inject(HttpTestingController).expectOne(fixture.componentInstance.dataUrl).flush(commentFixture());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    for (const status of ['unavailable', 'not-checked']) {
      const row = element.querySelector(`.comments-table tr[data-coverage="${status}"]`)!;
      expect(row.querySelectorAll('td')[1].textContent).toContain('— / —');
      expect(row.querySelectorAll('td')[3].textContent?.trim()).toBe('—');
    }
    const zero = element.querySelector('.comments-table tr[data-coverage="complete"]')!;
    expect(zero.querySelectorAll('td')[1].textContent).toContain('0 / 0');
    expect(zero.querySelectorAll('td')[3].textContent?.trim()).toBe('0');
    fixture.destroy();
  });

  it('opens the selected comment reader lazily and returns to the aggregate table on close', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(component.dataUrl).flush(commentFixture());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-facebook-comment-reader')).toBeNull();
    expect(element.querySelectorAll('.reader-button')).toHaveLength(1);
    element.querySelector<HTMLButtonElement>('.reader-button')!.click();
    fixture.detectChanges();
    const file = `${'c'.repeat(64)}.json`;
    const collectionSha256 = 'a'.repeat(64);
    http.expectOne('/data/facebook/2026/comments/manifest.json').flush({ version: 1, collectionSha256,
      posts: [{ postId: 'a', file, count: 4 }] });
    http.expectOne(`/data/facebook/2026/comments/${file}`).flush({ version: 1, collectionSha256, postId: 'a', comments: [
      { id: 1, parentId: null, text: 'Одобрение.', truncated: false, gyurov: 'supportive', yotova: 'neutral' },
      { id: 2, parentId: null, text: 'Критика.', truncated: false, gyurov: 'critical', yotova: 'critical' },
      { id: 3, parentId: null, text: 'Информация.', truncated: false, gyurov: 'neutral', yotova: 'neutral' },
      { id: 4, parentId: 1, text: null, truncated: false, gyurov: 'unreviewed', yotova: 'unreviewed' },
    ] });
    fixture.detectChanges();
    expect(element.querySelector('dialog')?.textContent).toContain('Одобрение.');
    element.querySelector<HTMLButtonElement>('dialog button[aria-label="Затвори"]')!.click();
    fixture.detectChanges();
    expect(component.selectedReaderRow()).toBeNull();
    expect(element.querySelector('dialog')).toBeNull();
    fixture.destroy();
  });

  it('applies Page and search filters to both chart and totals, then resets them', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    TestBed.inject(HttpTestingController).expectOne(component.dataUrl).flush(commentFixture());
    fixture.detectChanges();
    component.pageFilter.set('b');
    fixture.detectChanges();
    expect(component.visibleRows().map(row => row.postId)).toEqual(['b']);
    expect(component.pageCounts()).toEqual([]);
    expect(component.totals().reportedPosts).toBe(0);
    component.resetFilters();
    fixture.detectChanges();
    component.table()!.query.set('Публикация a');
    fixture.detectChanges();
    expect(component.visibleRows().map(row => row.postId)).toEqual(['a']);
    expect(component.totals().captured).toBe(4);
    component.resetFilters();
    fixture.detectChanges();
    expect(component.visibleRows()).toHaveLength(posts.length);
    expect(component.table()!.query()).toBe('');
    expect(FACEBOOK_STANCE_BUCKETS).toHaveLength(7);
    fixture.destroy();
  });

  it('updates directional comment totals for the selected candidate, Page and search cohort', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const data = commentFixture();
    Object.assign(data.posts[1], { status: 'complete', ordering: 'all', reportedCount: 4,
      capturedCount: 4, assessedCount: 4, topLevelCount: 4,
      counts: { gyurov: counts({ supportive: 3, critical: 1 }), yotova: counts({ supportive: 1, critical: 3 }) },
    });
    TestBed.inject(HttpTestingController).expectOne(component.dataUrl).flush(data);
    fixture.detectChanges();
    expect(component.directionalTotals()).toEqual({ supportive: 4, critical: 2 });
    component.setCandidate('yotova');
    fixture.detectChanges();
    expect(component.directionalTotals()).toEqual({ supportive: 1, critical: 4 });
    const summary = fixture.nativeElement.querySelector('.note[aria-live="polite"]') as HTMLElement;
    expect(summary.textContent).toContain('Към Йотова');
    expect(summary.querySelector('.supportive')?.textContent).toBe('1 в подкрепа');
    expect(summary.querySelector('.critical')?.textContent).toBe('4 критични');
    component.pageFilter.set('b');
    fixture.detectChanges();
    expect(component.directionalTotals()).toEqual({ supportive: 1, critical: 3 });
    component.resetFilters();
    fixture.detectChanges();
    component.table()!.query.set('Публикация a');
    fixture.detectChanges();
    expect(component.directionalTotals()).toEqual({ supportive: 0, critical: 1 });
    expect(summary.querySelector('.supportive')?.textContent).toBe('0 в подкрепа');
    expect(summary.querySelector('.critical')?.textContent).toBe('1 критични');
    fixture.destroy();
  });

  it('reports failed or invalid loads without inventing zero results and permits retry', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(component.dataUrl).flush('unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    component.load();
    http.expectOne(component.dataUrl).flush({ version: 1, posts: [] });
    fixture.detectChanges();
    expect(component.report()).toBeNull();
    component.load();
    http.expectOne(component.dataUrl).flush(commentFixture());
    fixture.detectChanges();
    expect(component.error()).toBe('');
    expect(component.report()).not.toBeNull();
    fixture.destroy();
  });
});
