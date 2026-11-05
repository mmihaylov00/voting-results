import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { FacebookCandidate, FacebookReport, FacebookStanceLabel } from './facebook-research.models';
import { FacebookToneReviewComponent } from './facebook-tone-review';
import { FacebookToneReviewService } from './facebook-tone-review.service';
import { FacebookToneReviewItem } from './facebook-tone-review.util';

const report = snapshot as FacebookReport;
const post = report.posts[0];
const page = report.pages.find(page => page.id === post.pageId)!;
const postItem: FacebookToneReviewItem = {
  key: `post:${post.id}`, kind: 'post', postId: post.id, commentId: null, parentId: null,
  pageId: page.id, pageName: page.name, postUrl: post.url, postText: 'Публикация за двамата кандидати.',
  text: 'Публикация за двамата кандидати.', parentText: null, truncated: false,
  gyurov: 'neutral', yotova: 'critical', sourceSha256: 'a'.repeat(64), collectionSha256: 'b'.repeat(64),
};
const commentItem: FacebookToneReviewItem = {
  ...postItem, key: `comment:${post.id}:2`, kind: 'comment', commentId: 2, parentId: 1,
  text: '<img src=x onerror=alert(1)>', parentText: 'Основен коментар.', gyurov: 'supportive', yotova: 'neutral',
};
const withheld: FacebookToneReviewItem = { ...commentItem, key: `comment:${post.id}:3`, commentId: 3, text: null };

function setup() {
  const changes = signal<Record<string, Partial<Record<FacebookCandidate, FacebookStanceLabel>>>>({});
  const service = {
    report: signal<FacebookReport | null>(report), items: signal([postItem, commentItem, withheld]),
    loading: signal(false), commentsLoading: signal(false), commentsLoaded: signal(true),
    progress: signal(10), totalCommentPosts: signal(20), error: signal(''), commentsError: signal(''),
    draftError: signal(''), submitting: signal(false), submitError: signal(''), submitted: signal(0),
    pending: () => [], pendingCount: () => Object.keys(changes()).length,
    tone: (item: FacebookToneReviewItem, candidate: FacebookCandidate) => changes()[item.key]?.[candidate] ?? item[candidate],
    changed: (item: FacebookToneReviewItem) => !!changes()[item.key],
    setTone: vi.fn((item: FacebookToneReviewItem, candidate: FacebookCandidate, tone: FacebookStanceLabel) => {
      changes.update(current => ({ ...current, [item.key]: { ...current[item.key], [candidate]: tone } }));
    }),
    undo: vi.fn((item: FacebookToneReviewItem) => changes.update(current => {
      const next = { ...current };
      delete next[item.key];
      return next;
    })),
    load: vi.fn(), loadComments: vi.fn(), submit: vi.fn(),
  };
  TestBed.configureTestingModule({ imports: [FacebookToneReviewComponent], providers: [provideRouter([])] });
  TestBed.overrideComponent(FacebookToneReviewComponent, { set: { providers: [
    { provide: FacebookToneReviewService, useValue: service },
  ] } });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FacebookToneReviewComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, element: fixture.nativeElement as HTMLElement };
}

describe('Facebook tone review page', () => {
  it('loads the review data and shows separate labelled controls for both candidates', () => {
    const { fixture, service, element } = setup();
    expect(service.load).toHaveBeenCalledOnce();
    expect(element.querySelector('h1')?.textContent).toContain('Преглед на тоновете');
    expect(element.querySelectorAll('.review-row')).toHaveLength(1);
    const labels = Array.from(element.querySelectorAll('.tone-control label'), label => label.textContent);
    expect(labels).toEqual(['Гюров', 'Йотова']);
    expect(element.querySelector('.item-actions a')?.getAttribute('href')).toBe(post.url);
    expect(element.querySelector('.item-actions a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(element.querySelector('.submit-button')?.hasAttribute('disabled')).toBe(true);
    fixture.destroy();
  });

  it('keeps the visible list stable while editing and shows the original tone and pending count', () => {
    const { fixture, component, service, element } = setup();
    const rows = component.table()!.viewRows();
    const controls = fixture.debugElement.queryAll(By.css('.tone-controls app-select'));
    controls[0].componentInstance.valueChange.emit('critical');
    fixture.detectChanges();
    expect(service.setTone).toHaveBeenCalledWith(postItem, 'gyurov', 'critical');
    expect(component.table()!.viewRows()).toBe(rows);
    expect(element.querySelector('.review-row')?.classList.contains('edited')).toBe(true);
    expect(element.querySelector('.tone-control small')?.textContent).toContain('Преди: Информативен');
    expect(element.querySelector('.submit-bar strong')?.textContent).toContain('1 предложение');
    expect(element.querySelector('.submit-button')?.hasAttribute('disabled')).toBe(false);
    element.querySelector<HTMLButtonElement>('.submit-button')!.click();
    expect(service.submit).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('filters by content and page, resets filters, and can show only changed rows', () => {
    const { fixture, component, service, element } = setup();
    component.table()!.query.set('несъществуващ текст');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(0);
    expect(element.textContent).toContain('Няма резултати по тези филтри.');
    component.table()!.query.set('');
    component.pageFilter.set('another-page');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(0);
    component.resetFilters();
    component.onlyChanged.set(true);
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(0);
    service.setTone(postItem, 'yotova', 'supportive');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(1);
    element.querySelector<HTMLButtonElement>('.item-actions button')!.click();
    fixture.detectChanges();
    expect(service.undo).toHaveBeenCalledWith(postItem);
    expect(component.table()!.viewRows()).toHaveLength(0);
    fixture.destroy();
  });

  it('renders comments safely with source context and disables withheld excerpts', () => {
    const { fixture, component, element } = setup();
    component.setKind('comment');
    fixture.detectChanges();
    expect(component.table()!.viewRows()).toHaveLength(2);
    expect(element.querySelector('.review-list img')).toBeNull();
    expect(element.querySelector('.review-text')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element.querySelector('.context')?.hasAttribute('open')).toBe(false);
    expect(element.querySelector('.context')?.textContent).toContain('Основен коментар.');
    expect(element.querySelector('.context')?.textContent).toContain(postItem.postText);
    const rows = element.querySelectorAll('.review-row');
    expect(rows[1].querySelector('.unpublished')?.textContent).toContain('Няма публикуван откъс');
    const controls = fixture.debugElement.queryAll(By.css('.tone-controls app-select'));
    expect(controls[2].componentInstance.disabled()).toBe(true);
    expect(controls[3].componentInstance.disabled()).toBe(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { kind: 'comment' } }));
    fixture.destroy();
  });

  it('disables submission until loading completes, exposes retries, and retains visible feedback', () => {
    const { fixture, service, element } = setup();
    service.setTone(postItem, 'gyurov', 'supportive');
    service.commentsLoaded.set(false);
    service.commentsLoading.set(true);
    fixture.detectChanges();
    expect(element.querySelector('.submit-button')?.hasAttribute('disabled')).toBe(true);
    expect(element.querySelector('.load-progress')?.textContent).toContain('10 / 20');
    service.commentsLoading.set(false);
    service.commentsError.set('Не могат да се заредят коментарите.');
    fixture.detectChanges();
    const retry = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Зареди коментарите отново'))!;
    retry.click();
    expect(service.loadComments).toHaveBeenCalledOnce();
    service.commentsLoaded.set(true);
    service.submitting.set(true);
    fixture.detectChanges();
    expect(element.querySelector('.submit-button')?.textContent).toContain('Изпращане');
    const controls = fixture.debugElement.queryAll(By.css('.tone-controls app-select'));
    expect(controls.every(control => control.componentInstance.disabled())).toBe(true);
    service.submitting.set(false);
    service.submitError.set('Изпращането не е успешно.');
    service.submitted.set(1);
    fixture.detectChanges();
    expect(element.textContent).toContain('Изпращането не е успешно.');
    expect(element.textContent).toContain('Изпратени за преглед: 1.');
    fixture.destroy();
  });
});
