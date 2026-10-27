import { TestBed } from '@angular/core/testing';
import { LoadingBarComponent } from './loading-bar';

describe('loading bar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  function setup() {
    const fixture = TestBed.createComponent(LoadingBarComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, component: fixture.componentInstance, element,
      bar: () => element.querySelector<HTMLElement>('[role="progressbar"]'),
      advance: (ms: number) => { vi.advanceTimersByTime(ms); fixture.detectChanges(); } };
  }

  it('starts at zero, advances between milestones and never finishes while work is pending', () => {
    const { fixture, component, bar, advance } = setup();
    expect(bar()).toBeNull();
    fixture.componentRef.setInput('loading', true); fixture.detectChanges();
    expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
    expect(bar()?.textContent?.trim()).toBe('');
    advance(500);
    expect(component.value()).toBeGreaterThan(0);
    fixture.componentRef.setInput('progress', 50);
    advance(50);
    expect(component.value()).toBeGreaterThanOrEqual(50);
    const milestone = component.value();
    advance(500);
    expect(component.value()).toBeGreaterThan(milestone);
    fixture.componentRef.setInput('progress', 10);
    advance(50);
    expect(component.value()).toBeGreaterThan(milestone);
    fixture.componentRef.setInput('progress', 100);
    advance(50);
    expect(component.value()).toBe(99);
    advance(60000);
    expect(component.value()).toBe(99);
    expect(bar()?.getAttribute('aria-valuemax')).toBe('100');
  });

  it('reaches 100 and leaves time for the fill transition before hiding', () => {
    const { fixture, component, bar, advance } = setup();
    fixture.componentRef.setInput('loading', true); fixture.detectChanges();
    advance(500);
    fixture.componentRef.setInput('loading', false); fixture.detectChanges();
    expect(component.value()).toBe(100);
    expect(bar()?.getAttribute('aria-valuenow')).toBe('100');
    advance(259);
    expect(bar()).not.toBeNull();
    advance(1);
    expect(bar()).toBeNull();
  });

  it('restarts without letting an earlier completion hide the new operation', () => {
    const { fixture, component, bar, advance } = setup();
    fixture.componentRef.setInput('loading', true); fixture.detectChanges();
    const firstFill = bar()?.firstElementChild;
    advance(500);
    fixture.componentRef.setInput('loading', false); fixture.detectChanges();
    fixture.componentRef.setInput('loading', true); fixture.detectChanges();
    expect(component.value()).toBe(0);
    expect(bar()?.firstElementChild).not.toBe(firstFill);
    advance(500);
    expect(bar()).not.toBeNull();
    expect(component.value()).toBeLessThan(100);
  });

  it('handles unavailable progress and stops updating after destruction', () => {
    const { fixture, component, advance } = setup();
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('progress', NaN); fixture.detectChanges();
    advance(100);
    expect(Number.isFinite(component.value())).toBe(true);
    const value = component.value();
    fixture.destroy();
    vi.advanceTimersByTime(60000);
    expect(component.value()).toBe(value);
  });
});
