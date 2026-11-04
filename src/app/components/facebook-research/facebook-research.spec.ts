import { Component, EventEmitter, Input, Output } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookResearchComponent } from './facebook-research';
import { FacebookResearchChartsComponent } from './facebook-research-charts';
import { FacebookPageSummary, FacebookPost, FacebookReport } from './facebook-research.models';

@Component({ selector: 'app-facebook-research-charts', template: '' })
class ChartsStub {
  @Input() pages: readonly FacebookPageSummary[] = [];
  @Input() posts: readonly FacebookPost[] = [];
  @Output() pageSelect = new EventEmitter<string>();
}

const report = snapshot as FacebookReport;

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

function loaded(view = 'pages') {
  const fixture = setup(view);
  TestBed.inject(HttpTestingController).expectOne(fixture.componentInstance.dataUrl).flush(report);
  fixture.detectChanges();
  return fixture;
}

describe('Facebook research workspace', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.inject(Meta).removeTag('name="robots"');
  });

  it('shows the partial sample, scrollable tabs and Page rankings with missing counters', () => {
    const fixture = loaded();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Частична извадка');
    expect(element.querySelectorAll('.page-table tbody tr')).toHaveLength(10);
    expect(element.querySelector('.page-table')?.textContent).toContain('4 без брояч');
    expect(element.querySelector('.workspace-tabs [role="tablist"]')?.classList.contains('scrollable')).toBe(true);
    expect(element.querySelectorAll('.page-table app-facebook-research-image img')).toHaveLength(10);
    fixture.componentInstance.exportPages(fixture.componentInstance.pages());
    expect(fixture.componentInstance.csvData()?.rows).toHaveLength(10);
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

  it('opens matched posts and fact-check leads in mutually exclusive source modals', () => {
    const fixture = loaded('duplicates');
    const component = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.duplicate-group')).toHaveLength(9);
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
    expect(component.report()?.posts).toHaveLength(86);
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
