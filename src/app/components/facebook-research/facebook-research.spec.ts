import { Component, EventEmitter, Input, Output } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By, Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookResearchComponent } from './facebook-research';
import { FacebookResearchChartsComponent, FacebookToneSelection } from './facebook-research-charts';
import { FacebookPageDirectoryComponent } from './facebook-page-directory';
import { FacebookCandidate, FacebookDirectory, FacebookPageSummary, FacebookPost, FacebookReport, FacebookStanceLabel } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_TONE_LABELS } from './facebook-research.util';

@Component({ selector: 'app-facebook-research-charts', template: '' })
class ChartsStub {
  @Input() pages: readonly FacebookPageSummary[] = [];
  @Input() posts: readonly FacebookPost[] = [];
  @Output() pageSelect = new EventEmitter<string>();
  @Output() toneSelect = new EventEmitter<FacebookToneSelection>();
}

const report = snapshot as FacebookReport;
const directory: FacebookDirectory = {
  checkedAt: '2026-11-04',
  entries: [{
    id: 'regional-sample', name: report.pages[0].name, aliases: [], status: 'in-sample',
    facebookUrl: report.pages[0].url, websiteUrl: 'https://strumanews.bg/', regional: true,
    coverage: 'Благоевград и Югозападна България', regions: ['Благоевград'],
    sources: [{ url: 'https://strumanews.bg/', note: 'Обхват от сайта на издателя.' }],
    notes: [], samplePageId: report.pages[0].id,
  }, {
    id: 'unresolved-lead', name: 'Нова страница за проверка', aliases: [], status: 'unresolved',
    facebookUrl: null, websiteUrl: null, regional: null, coverage: '', regions: [],
    sources: [], notes: [], samplePageId: null,
  }],
};

function setup(view = 'pages') {
  TestBed.configureTestingModule({
    imports: [FacebookResearchComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParams: { view } } } }],
  });
  TestBed.overrideComponent(FacebookResearchComponent, {
    remove: { imports: [FacebookResearchChartsComponent] }, add: { imports: [ChartsStub] },
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FacebookResearchComponent);
  fixture.detectChanges();
  return fixture;
}

function loaded(view = 'pages', data = report) {
  const fixture = setup(view);
  TestBed.inject(HttpTestingController).expectOne(fixture.componentInstance.dataUrl).flush(data);
  fixture.detectChanges();
  return fixture;
}

const toneStatuses: FacebookStanceLabel[] = ['supportive', 'critical', 'mixed', 'neutral', 'unclear', 'not-mentioned', 'unreviewed'];

function toneFixture(): FacebookReport {
  const data = structuredClone(report);
  delete data.directory;
  data.matches = [];
  data.reviews = [];
  data.pages = [];
  data.posts = [];
  const yotovaTones = { supportive: 'critical', critical: 'mixed', mixed: 'neutral', neutral: 'unclear',
    unclear: null, 'not-mentioned': 'supportive' } as const;
  for (const status of toneStatuses) {
    const page = { ...structuredClone(report.pages[0]), id: `tone-${status}`, name: `Страница ${status}`, url: `https://www.facebook.com/tone-${status}` };
    delete page.avatar;
    data.pages.push(page);
    const post = { ...structuredClone(report.posts[0]), id: `post-${status}`, pageId: page.id,
      url: `${page.url}/posts/1`, excerpt: `Публикация ${status}`, summary: `marker-${status}`,
      origin: 'collection' as const, keywords: [{ keyword: 'избори', source: 'text', evidence: 'избори' }], images: [] };
    if (status === 'unreviewed') delete post.stance;
    else {
      post.stance = { gyurov: status === 'not-mentioned' ? null : status,
        yotova: yotovaTones[status],
        reason: `Основание ${status}`, sourceTextSha256: post.sourceTextSha256 };
    }
    data.posts.push(post);
  }
  const opposing = { ...structuredClone(data.pages[0]), id: 'tone-opposing', name: 'Смесена страница', url: 'https://www.facebook.com/tone-opposing' };
  data.pages.push(opposing);
  for (const tone of ['supportive', 'critical'] as const) {
    const post = { ...structuredClone(data.posts[0]), id: `post-opposing-${tone}`, pageId: opposing.id,
      url: `${opposing.url}/posts/${tone}`, excerpt: `Противоположен ${tone}` };
    post.stance = { gyurov: tone, yotova: null, reason: `Основание ${tone}`, sourceTextSha256: post.sourceTextSha256 };
    data.posts.push(post);
  }
  data.coverage = [{ keyword: 'избори', count: data.posts.length }];
  data.collectionPostCount = data.posts.length;
  return data;
}

describe('Facebook research workspace', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.inject(Meta).removeTag('name="robots"');
  });

  it('opens the directory URL without adding leads to the observed sample and cross-navigates to collected posts', () => {
    const fixture = loaded('directory', { ...report, directory });
    const component = fixture.componentInstance;
    expect(component.tabs().find(tab => tab.id === 'directory')).toEqual({ id: 'directory', label: 'Каталог', count: 2 });
    expect(component.tabs().find(tab => tab.id === 'pages')?.count).toBe(report.pages.length);
    expect(component.tabs().find(tab => tab.id === 'posts')?.count).toBe(report.posts.length);
    expect(fixture.nativeElement.querySelector('app-facebook-research-charts')).toBeNull();
    fixture.debugElement.query(By.directive(FacebookPageDirectoryComponent)).triggerEventHandler('pageSelect', report.pages[0].id);
    fixture.detectChanges();
    expect(component.view()).toBe('posts');
    expect(component.pageFilter()).toBe(report.pages[0].id);
    expect(component.filteredPosts().length).toBe(report.posts.filter(post => post.pageId === report.pages[0].id).length);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { view: 'posts' } }));
    component.showPagePosts('unresolved-lead');
    expect(component.pageFilter()).toBe(report.pages[0].id);
    fixture.destroy();
  });

  it('shows verified regional coverage, searches it and exports it from the directory without changing Page models', () => {
    const fixture = loaded('pages', { ...report, directory });
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-regional-coverage]')?.textContent).toContain(directory.entries[0].coverage);
    component.pageTable()!.query.set('Югозападна');
    fixture.detectChanges();
    expect(component.pageTable()!.viewRows().map(page => page.id)).toEqual([report.pages[0].id]);
    component.exportPages(component.pageTable()!.viewRows());
    const csv = component.csvData()!;
    expect(csv.rows[0][csv.headers.indexOf('Регионална страница')]).toBe('Да');
    expect(csv.rows[0][csv.headers.indexOf('Обхват')]).toBe(directory.entries[0].coverage);
    expect(csv.rows[0][csv.headers.indexOf('Региони')]).toBe('Благоевград');
    expect(csv.rows[0].length).toBe(csv.headers.length);
    expect(component.pages()[0]).not.toHaveProperty('regional');
    fixture.destroy();
  });

  it('accepts legacy reports without a directory and falls back from a stale directory link', () => {
    const legacy = { ...report };
    delete legacy.directory;
    const fixture = loaded('directory', legacy);
    expect(fixture.componentInstance.view()).toBe('pages');
    expect(fixture.componentInstance.tabs().some(tab => tab.id === 'directory')).toBe(false);
    expect(fixture.nativeElement.querySelector('app-facebook-page-directory')).toBeNull();
    fixture.destroy();
  });

  it('shows the partial sample, scrollable tabs and Page rankings with missing counters', () => {
    const fixture = loaded();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Частична извадка');
    expect(element.querySelector('.page-table')?.getAttribute('aria-rowcount')).toBe(String(report.pages.length + 1));
    const visibleRows = element.querySelectorAll('.page-table tbody tr[data-virtual-index]');
    expect(visibleRows.length).toBeGreaterThan(0);
    expect(element.querySelector('.page-table')?.textContent).toContain('без брояч');
    expect(element.querySelector('.workspace-tabs [role="tablist"]')?.classList.contains('scrollable')).toBe(true);
    expect(element.querySelectorAll('.page-table app-facebook-research-image')).toHaveLength(visibleRows.length);
    fixture.componentInstance.exportPages(fixture.componentInstance.pages());
    expect(fixture.componentInstance.csvData()?.rows).toHaveLength(report.pages.length);
    fixture.destroy();
  });

  it('loads comment aggregates only when their tab opens and preserves the original post sample', () => {
    const fixture = loaded();
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const url = '/data/facebook/2026/comments.json';
    http.expectNone(url);
    expect(component.tabs().find(tab => tab.id === 'comments')).toEqual({ id: 'comments', label: 'Коментари' });
    component.setView('comments');
    fixture.detectChanges();
    const counts = { supportive: 0, critical: 0, mixed: 0, neutral: 0, unclear: 0, 'not-mentioned': 0, unreviewed: 0 };
    http.expectOne(url).flush({ version: 1, capturedAt: '2026-11-05T10:00:00Z', collectionSha256: 'a'.repeat(64),
      posts: report.posts.map(post => ({ postId: post.id, checkedAt: null, status: 'not-checked', ordering: null,
        reportedCount: null, capturedCount: 0, assessedCount: 0, topLevelCount: 0, replyCount: 0,
        counts: { gyurov: counts, yotova: counts }, notes: [] })) });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-facebook-comments-research')).not.toBeNull();
    expect(component.report()?.posts).toEqual(report.posts);
    expect(component.tabs().find(tab => tab.id === 'posts')?.count).toBe(report.posts.length);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { view: 'comments' } }));
    fixture.destroy();
  });

  it('combines Page, keyword and text filters and exports the full filtered result', () => {
    const fixture = loaded();
    const component = fixture.componentInstance;
    const source = report.posts.find(post => post.keywords.length && post.metrics.reactions.value)!;
    component.showPagePosts(source.pageId);
    component.keywordFilter.set(source.keywords[0].keyword);
    fixture.detectChanges();
    const expected = report.posts.filter(post => post.pageId === source.pageId && post.keywords.some(match => match.keyword === source.keywords[0].keyword));
    expect(component.filteredPosts().map(post => post.id)).toEqual(expected.map(post => post.id));
    const controls = component.postTable()!;
    expect(controls.sortColumn()).toBe('reactions');
    controls.query.set(source.excerpt);
    fixture.detectChanges();
    expect(controls.viewRows().some(post => post.id === source.id)).toBe(true);
    component.exportPosts(controls.viewRows());
    expect(component.csvData()?.rows.length).toBe(controls.viewRows().length);
    expect(component.csvData()?.rows.some(row => row.includes(source.url))).toBe(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { view: 'posts' } }));
    fixture.destroy();
  });

  it('filters individual posts by every candidate status without confusing unreviewed and unmentioned captions', () => {
    const data = toneFixture();
    const fixture = loaded('posts', data);
    const component = fixture.componentInstance;
    expect(component.toneOptions.map(option => option.value)).toEqual(['', ...toneStatuses]);
    for (const candidate of FACEBOOK_CANDIDATES) {
      for (const status of toneStatuses) {
        component.resetPostFilters();
        component.setToneFilter('posts', candidate, status);
        fixture.detectChanges();
        const expected = data.posts.filter(post => (post.stance ? post.stance[candidate] ?? 'not-mentioned' : 'unreviewed') === status);
        expect(new Set(component.filteredPosts().map(post => post.id))).toEqual(new Set(expected.map(post => post.id)));
        const other: FacebookCandidate = candidate === 'gyurov' ? 'yotova' : 'gyurov';
        expect(component.postToneFilters()[other]).toBe('');
      }
    }
    component.setToneFilter('posts', 'gyurov', 'unreviewed');
    component.setToneFilter('posts', 'yotova', 'unreviewed');
    fixture.detectChanges();
    expect(component.filteredPosts().map(post => post.id)).toEqual(['post-unreviewed']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.post-table [data-tone="unreviewed"]')).toHaveLength(2);
    component.resetPostFilters();
    fixture.detectChanges();
    component.postTable()!.query.set('Гюров');
    fixture.detectChanges();
    expect(component.postTable()!.viewRows()).toHaveLength(0);
    component.postTable()!.query.set('Неоценен');
    fixture.detectChanges();
    expect(component.postTable()!.viewRows().map(post => post.id)).toEqual(['post-unreviewed']);
    fixture.destroy();
  });

  it('filters aggregate Page labels and keeps chart, exports, resets and post drilldown consistent', () => {
    const fixture = loaded('pages', toneFixture());
    const component = fixture.componentInstance;
    component.setToneFilter('pages', 'gyurov', 'mixed');
    fixture.detectChanges();
    expect(component.filteredPages().map(page => page.id)).toEqual(['tone-mixed', 'tone-opposing']);
    component.setToneFilter('pages', 'yotova', 'not-mentioned');
    fixture.detectChanges();
    expect(component.filteredPages().map(page => page.id)).toEqual(['tone-opposing']);
    const charts = fixture.debugElement.query(By.directive(ChartsStub)).componentInstance as ChartsStub;
    expect(charts.pages.map(page => page.id)).toEqual(['tone-opposing']);
    component.exportPages(component.pageTable()!.viewRows());
    expect(component.csvData()!.rows).toHaveLength(1);
    expect(component.csvData()!.rows[0][component.csvData()!.headers.indexOf('Гюров, тон в извадката')]).toBe('Смесен');
    component.csvData.set(null);
    component.setToneFilter('posts', 'gyurov', 'mixed');
    component.showPagePosts('tone-opposing');
    fixture.detectChanges();
    expect(component.postToneFilters()).toEqual({ gyurov: '', yotova: '' });
    expect(component.filteredPosts().map(post => post.id)).toEqual(['post-opposing-supportive', 'post-opposing-critical']);
    expect(component.pageToneFilters()).toEqual({ gyurov: 'mixed', yotova: 'not-mentioned' });
    component.setView('pages');
    fixture.detectChanges();
    component.pageTable()!.query.set('does not match');
    fixture.detectChanges();
    expect(component.pageTable()!.viewRows()).toHaveLength(0);
    component.resetPageFilters();
    fixture.detectChanges();
    expect(component.pageToneFilters()).toEqual({ gyurov: '', yotova: '' });
    expect(component.pageTable()!.query()).toBe('');
    expect(component.pageTable()!.viewRows()).toHaveLength(8);
    fixture.destroy();
  });

  it('opens the clicked chart segment with its Page and candidate tone, clearing previous post tones', () => {
    const fixture = loaded('pages', toneFixture());
    const component = fixture.componentInstance;
    component.setToneFilter('posts', 'gyurov', 'mixed');
    component.setToneFilter('posts', 'yotova', 'supportive');
    fixture.debugElement.query(By.directive(ChartsStub)).triggerEventHandler('toneSelect', {
      pageId: 'tone-opposing', candidate: 'gyurov', tone: 'critical',
    });
    fixture.detectChanges();
    expect(component.view()).toBe('posts');
    expect(component.pageFilter()).toBe('tone-opposing');
    expect(component.postToneFilters()).toEqual({ gyurov: 'critical', yotova: '' });
    expect(component.filteredPosts().map(post => post.id)).toEqual(['post-opposing-critical']);
    fixture.destroy();
  });

  it('combines post tone filters with existing filters and shows the same badges, reasons and CSV statuses', () => {
    const fixture = loaded('posts', toneFixture());
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    component.setToneFilter('posts', 'gyurov', 'critical');
    component.setToneFilter('posts', 'yotova', 'mixed');
    fixture.detectChanges();
    expect(component.filteredPosts().map(post => post.id)).toEqual(['post-critical']);
    component.pageFilter.set('tone-critical');
    component.keywordFilter.set('избори');
    component.postTable()!.query.set('marker-critical');
    fixture.detectChanges();
    const rows = component.postTable()!.viewRows();
    expect(rows.map(post => post.id)).toEqual(['post-critical']);
    const row = element.querySelector('.post-table tbody tr[data-virtual-index]')!;
    expect(row.querySelector('[data-tone="critical"]')?.textContent).toBe(FACEBOOK_TONE_LABELS.critical);
    expect(row.querySelector('[data-tone="mixed"]')?.textContent).toBe(FACEBOOK_TONE_LABELS.mixed);
    expect(row.querySelector('[data-tone="supportive"]')).toBeNull();
    row.querySelector<HTMLButtonElement>('td button')!.click();
    fixture.detectChanges();
    expect(component.selectedPostId()).toBe('post-critical');
    expect(element.querySelector('dialog [aria-label="Тон на публикацията"]')?.textContent).toContain('Основание critical');
    component.selectedPostId.set('');
    component.exportPosts(rows);
    const csv = component.csvData()!;
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0][csv.headers.indexOf('Гюров, тон в надписа')]).toBe('Критичен');
    expect(csv.rows[0][csv.headers.indexOf('Йотова, тон в надписа')]).toBe('Смесен');
    component.csvData.set(null);
    component.resetPostFilters();
    fixture.detectChanges();
    expect(component.pageFilter()).toBe('');
    expect(component.keywordFilter()).toBe('');
    expect(component.postToneFilters()).toEqual({ gyurov: '', yotova: '' });
    expect(component.postTable()!.query()).toBe('');
    expect(component.postTable()!.viewRows()).toHaveLength(9);
    fixture.destroy();
  });

  it('shows candidate tone counts with source-level reasons and includes them in both CSV exports', () => {
    const fixture = loaded();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const bnews = component.pages().find(page => page.name === 'BNews Bg')!;
    const bunker = component.pages().find(page => page.name === 'Бункер нюз')!;
    const row = [...element.querySelectorAll('.page-table tbody tr')].find(row => row.textContent?.includes('BNews Bg'))!;
    expect(row.querySelector('[data-tone="critical"]')?.textContent).toContain('Критичен');
    expect(row.textContent).toContain('Критични: 19');
    component.exportPages([bnews, bunker]);
    let csv = component.csvData()!;
    expect(csv.rows[0][csv.headers.indexOf('Гюров, Критични')]).toBe(19);
    expect(csv.rows[1][csv.headers.indexOf('Гюров, В подкрепа')]).toBe(5);
    expect(csv.rows.every(row => row.length === csv.headers.length)).toBe(true);
    component.csvData.set(null);
    const post = report.posts.find(post => post.pageId === bunker.id && post.stance?.gyurov === 'supportive')!;
    row.querySelector<HTMLButtonElement>('td button')!.click();
    fixture.detectChanges();
    expect(component.view()).toBe('posts');
    expect(component.pageFilter()).toBe(bnews.id);
    component.openPost(post.id);
    fixture.detectChanges();
    expect(element.querySelector('dialog [aria-label="Тон на публикацията"]')?.textContent).toContain(post.stance!.reason);
    expect(element.querySelector('dialog [data-tone="supportive"]')?.textContent).toContain('В подкрепа');
    component.exportPosts([post]);
    csv = component.csvData()!;
    expect(csv.rows[0][csv.headers.indexOf('Гюров, тон в надписа')]).toBe('В подкрепа');
    expect(csv.rows[0][csv.headers.indexOf('Основание за тона')]).toBe(post.stance!.reason);
    expect(csv.rows[0]).toContain(post.url);
    expect(csv.rows[0].length).toBe(csv.headers.length);
    fixture.destroy();
  });

  it('opens matched posts and fact-check leads in mutually exclusive source modals', () => {
    const fixture = loaded('duplicates');
    const component = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.duplicate-group')).toHaveLength(10);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('+83 мин');
    component.openPost(report.matches[0].targetId);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('dialog')?.textContent).toContain('Няма данни');
    expect(element.querySelector('dialog a')?.getAttribute('href')).toBe(component.selectedPost()?.url);
    component.openReview(report.reviews[0]);
    fixture.detectChanges();
    expect(component.selectedPost()).toBeNull();
    expect(element.querySelector('dialog')?.textContent).toContain(report.reviews[0].checks[0]);
    component.openPost(report.reviews[0].postIds[0]);
    fixture.detectChanges();
    expect(component.selectedReview()).toBeNull();
    expect(element.querySelectorAll('dialog')).toHaveLength(1);
    fixture.destroy();
  });

  it('recovers from a failed request and rejects an invalid report without rendering it', () => {
    const fixture = setup();
    const http = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;
    http.expectOne(component.dataUrl).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    component.load();
    http.expectOne(component.dataUrl).flush({});
    expect(component.error()).toContain('непълен');
    expect(component.report()).toBeNull();
    component.load();
    http.expectOne(component.dataUrl).flush(report);
    fixture.detectChanges();
    expect(component.error()).toBe('');
    expect(component.report()?.posts).toHaveLength(report.posts.length);
    fixture.destroy();
  });

  it('opens the complete captured photo set and preserves text-only and video post states', () => {
    const fixture = loaded('posts');
    const component = fixture.componentInstance;
    component.openPost(report.posts[0].id);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('dialog app-facebook-research-image.detail img')).toHaveLength(3);
    expect(element.querySelector('dialog a[aria-label="Отвори изображението във Facebook"]')?.getAttribute('href')).toBe(report.posts[0].url);
    component.openPost(report.posts.find(post => post.images?.some(image => image.kind === 'video-thumbnail'))!.id);
    fixture.detectChanges();
    expect(element.querySelector('dialog [aria-label="Миниатюра на видео"]')).not.toBeNull();
    expect(element.querySelector('dialog a[aria-label="Отвори видеото във Facebook"]')).not.toBeNull();
    component.openPost(report.posts.find(post => !post.images?.length)!.id);
    fixture.detectChanges();
    expect(element.querySelector('dialog [aria-label="Изображения от публикацията"]')).toBeNull();
    expect(element.querySelector('dialog .post-detail')?.textContent).toContain('Твърдението не е проверено');
    fixture.destroy();
  });

  it('keeps Facebook AI labels and link-preview headlines visible in details and CSV exports', () => {
    const fixture = loaded('posts');
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const aiPost = report.posts.find(post => post.platformLabels?.includes('AI content'))!;
    component.pageFilter.set(aiPost.pageId);
    fixture.detectChanges();
    expect(element.querySelector('.post-table')?.textContent).toContain('Facebook: AI content');
    component.openPost(aiPost.id);
    fixture.detectChanges();
    expect(element.querySelector('dialog .post-detail')?.textContent).toContain('Facebook: AI content');
    component.exportPosts([aiPost]);
    let csv = component.csvData()!;
    expect(csv.rows[0][csv.headers.indexOf('Означения във Facebook')]).toBe('AI content');
    expect(csv.rows[0].length).toBe(csv.headers.length);
    component.csvData.set(null);
    const headlinePost = report.posts.find(post => post.linkHeadline)!;
    component.openPost(headlinePost.id);
    fixture.detectChanges();
    expect(element.querySelector('dialog .post-detail')?.textContent).toContain(headlinePost.linkHeadline);
    component.exportPosts([headlinePost]);
    csv = component.csvData()!;
    expect(csv.rows[0][csv.headers.indexOf('Заглавие във връзката')]).toBe(headlinePost.linkHeadline);
    fixture.destroy();
  });

  it('restores prior document metadata when leaving the unlisted page', () => {
    const fixture = loaded('coverage');
    fixture.destroy();
    const meta = TestBed.inject(Meta);
    const title = TestBed.inject(Title);
    meta.updateTag({ name: 'robots', content: 'index,follow' });
    title.setTitle('Изборен архив');
    const page = TestBed.createComponent(FacebookResearchComponent);
    page.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(page.componentInstance.dataUrl).flush(report);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex,nofollow,noarchive');
    page.destroy();
    expect(meta.getTag('name="robots"')?.content).toBe('index,follow');
    expect(title.getTitle()).toBe('Изборен архив');
  });
});
