import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ComparativeValue } from '../../../../../models/election.models';
import { HlmTooltipDirective } from './hlm-tooltip.directive';

@Component({
  standalone: true,
  imports: [HlmTooltipDirective],
  template: '<strong [hlmTooltip]="comparisons" [currentValue]="150" [showTrend]="true">150</strong>',
})
class TooltipHostComponent {
  comparisons: ComparativeValue[] = [];
}

describe('tooltip comparison trends', () => {
  let originalUrl: string;

  beforeEach(() => { originalUrl = window.location.href; });
  afterEach(() => { window.history.replaceState(null, '', originalUrl); });

  async function trend(date: string, type: 'presidential' | 'governmental', comparisons: ComparativeValue[]): Promise<string> {
    window.history.replaceState(null, '', `/${type}/election/${date}/all`);
    TestBed.configureTestingModule({ imports: [TooltipHostComponent] });
    const fixture = TestBed.createComponent(TooltipHostComponent);
    fixture.componentInstance.comparisons = comparisons;
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('strong > span')?.textContent ?? '';
  }

  it('compares the presidential runoff with the latest first round', async () => {
    expect(await trend('2026.11.01', 'presidential', [
      { d: '2021.11.21', v: 50 }, { d: '2026.10.25', v: 100 }, { d: '2026.04.19', v: 75 },
    ])).toBe('⬆50.00%');
  });

  it('compares a first round with the previous election runoff and excludes future dates', async () => {
    expect(await trend('2026.10.25', 'presidential', [
      { d: '2026.11.01', v: 300 }, { d: '2021.11.14', v: 50 }, { d: '2021.11.21', v: 100 },
    ])).toBe('⬆50.00%');
  });

  it('uses the latest available presidential comparison when nearer dates are missing', async () => {
    expect(await trend('2026.11.01', 'presidential', [
      { d: '2016.11.13', v: 50 }, { d: '2026.04.19', v: 100 }, { d: '2021.11.14', v: 75 },
    ])).toBe('⬆100.00%');
  });

  it('preserves parliamentary comparisons without using presidential dates', async () => {
    expect(await trend('2026.04.19', 'governmental', [
      { d: '2026.10.25', v: 300 }, { d: '2024.06.09', v: 50 }, { d: '2024.10.27', v: 100 },
    ])).toBe('⬆50.00%');
  });

  it('supports older parliamentary elections from the shared catalog', async () => {
    expect(await trend('2022.10.02', 'governmental', [
      { d: '2021.11.21', v: 75 }, { d: '2021.07.11', v: 100 }, { d: '2021.04.04', v: 50 },
    ])).toBe('⬆50.00%');
  });

  it('keeps a zero-vote latest baseline unavailable rather than substituting an older election', async () => {
    expect(await trend('2026.11.01', 'presidential', [
      { d: '2026.10.25', v: 0 }, { d: '2021.11.21', v: 100 },
    ])).toBe('–');
  });
});
