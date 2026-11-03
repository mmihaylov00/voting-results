import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SignedChangeDirective } from './signed-change';

@Component({
  imports: [SignedChangeDirective],
  template: `<span class="font-semibold" [appSignedChange]="value()">+0,50 п.п.</span>`,
})
class Host {
  readonly value = signal<number | null | undefined>(undefined);
}

describe('SignedChangeDirective', () => {
  it.each([
    { value: 0.5, direction: 'up' }, { value: -0.25, direction: 'down' },
    { value: 0, direction: 'flat' }, { value: -0, direction: 'flat' },
    { value: null, direction: 'missing' }, { value: undefined, direction: 'missing' },
    { value: NaN, direction: 'missing' }, { value: Infinity, direction: 'missing' },
    { value: -Infinity, direction: 'missing' },
  ])('uses $direction for $value without rewriting the formatted label', ({ value, direction }) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLSpanElement;
    expect(span.getAttribute('data-change')).toBe(direction);
    expect(span.textContent).toBe('+0,50 п.п.');
    expect(span.classList.contains('font-semibold')).toBe(true);
    expect(span.classList.contains('text-emerald-700')).toBe(direction === 'up');
    expect(span.classList.contains('dark:text-emerald-400')).toBe(direction === 'up');
    expect(span.classList.contains('text-rose-700')).toBe(direction === 'down');
    expect(span.classList.contains('dark:text-rose-400')).toBe(direction === 'down');
  });

  it('clears stale direction colors when the same node changes sign or becomes unavailable', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(5);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLSpanElement;
    expect(span.classList.contains('text-emerald-700')).toBe(true);
    fixture.componentInstance.value.set(-5);
    fixture.detectChanges();
    expect(span.classList.contains('text-emerald-700')).toBe(false);
    expect(span.classList.contains('text-rose-700')).toBe(true);
    fixture.componentInstance.value.set(null);
    fixture.detectChanges();
    expect(span.getAttribute('data-change')).toBe('missing');
    expect(span.classList.contains('text-rose-700')).toBe(false);
    expect(span.classList.contains('font-semibold')).toBe(true);
  });
});
