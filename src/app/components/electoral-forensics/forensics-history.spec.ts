import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HighchartsChartComponent } from 'highcharts-angular';
import { describe, expect, it } from 'vitest';
import { historicalFixture } from './forensics.fixtures';
import { ForensicsHistoryComponent } from './forensics-history';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

describe('historical runoff context', () => {
  it('shows year-specific cohorts, gains and election context without claiming identical historical sections', () => {
    TestBed.configureTestingModule({ imports: [ForensicsHistoryComponent] }).overrideComponent(ForensicsHistoryComponent, {
      remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] },
    });
    const fixture = TestBed.createComponent(ForensicsHistoryComponent);
    fixture.componentRef.setInput('benchmarks', [historicalFixture(), historicalFixture({ cycle: 2021,
      context: 'Първият тур съвпада с парламентарни избори.', turnout1: null, turnout2: null, deltaTurnoutPp: null })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
    expect(element.querySelector('tbody')?.textContent).toContain('национален референдум');
    expect(element.querySelector('tbody')?.textContent).toContain('парламентарни избори');
    expect(element.textContent).toContain('липсват адреси и потвърдени флагове');
    expect(element.textContent).toContain('различни извадки');
    expect(element.textContent).toContain('+120');
    expect(element.textContent).toContain('няма данни');
    expect(fixture.componentInstance.chart().series?.[0]).toMatchObject({ data: [-5, null] });
    expect(element.querySelector<HTMLElement>('.table-scroll')?.tabIndex).toBe(0);
    expect(element.querySelector('a[href^="https://www.cik.bg"]')).not.toBeNull();
    expect(element.textContent).toContain('ZIP не е повторно проверен');
    expect(element.querySelector('a[href="/data/2016.11.06/SOURCE.md"]')).not.toBeNull();
    expect(fixture.componentInstance.isSourceDocumentation('/data/../../private/SOURCE.md')).toBe(false);
  });
});
