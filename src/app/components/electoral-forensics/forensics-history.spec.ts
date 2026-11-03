import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HighchartsChartComponent } from 'highcharts-angular';
import { describe, expect, it } from 'vitest';
import { historicalFixture } from './forensics.fixtures';
import { ForensicsHistoryComponent } from './forensics-history';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

function setup() {
  TestBed.configureTestingModule({ imports: [ForensicsHistoryComponent] }).overrideComponent(ForensicsHistoryComponent, {
    remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] },
  });
  const fixture = TestBed.createComponent(ForensicsHistoryComponent);
  fixture.componentRef.setInput('benchmarks', [historicalFixture(), historicalFixture({ cycle: 2021,
    context: 'Първият тур съвпада с парламентарни избори.', turnout1: null, turnout2: null, deltaTurnoutPp: null }),
    historicalFixture({ cycle: 2026, round1Date: '2026.10.25', round2Date: '2026.11.01',
      context: undefined, contextSourceUrl: undefined, sources: [], matchingConfidence: 'address_checked',
      voted1: 400, voted2: 450, deltaVoted: 50, turnout1: 40, turnout2: 45, deltaTurnoutPp: 5 })]);
  fixture.detectChanges();
  return fixture;
}

describe('historical runoff year selection', () => {
  it('shows the latest year directly while retaining the three-year overview and caveats', () => {
    const fixture = setup();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.history-summary tbody tr')).toHaveLength(3);
    expect(fixture.componentInstance.selectedYear()).toBe('2026');
    expect(element.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    const panel = element.querySelector('[role="tabpanel"]')!;
    expect(panel.textContent).toContain('2026 · Стойности по турове');
    expect(panel.querySelector('[aria-label="Базови стойности 2026"]')?.textContent).toContain('400');
    expect(panel.querySelector('[aria-label="Базови стойности 2026"]')?.textContent).toContain('450');
    expect(element.textContent).toContain('липсват адреси и потвърдени флагове');
    expect(element.textContent).toContain('Различни годишни извадки');
    expect(element.querySelector('.note')?.textContent).toContain('без нова проверка на ZIP');
    expect(fixture.componentInstance.chart().series?.[0]).toMatchObject({ data: [-5, null, 5] });
    expect(element.querySelectorAll('details')).toHaveLength(0);
  });

  it('changes years through visible tabs and preserves full context, baseline values and source documentation', () => {
    const fixture = setup();
    const element = fixture.nativeElement as HTMLElement;
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const initialPanelId = element.querySelector('[role="tabpanel"]')!.id;
    for (const button of tabs) expect(element.querySelectorAll(`[id="${button.getAttribute('aria-controls')}"]`)).toHaveLength(1);
    const tab = tabs.find(button => button.textContent?.includes('2016'))!;
    tab.click(); fixture.detectChanges();
    expect(fixture.componentInstance.selectedYear()).toBe('2016');
    const panel = element.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(panel.id).toBe(tab.getAttribute('aria-controls'));
    expect(panel.id).toBe(initialPanelId);
    for (const button of tabs) expect(element.querySelectorAll(`[id="${button.getAttribute('aria-controls')}"]`)).toHaveLength(1);
    expect(panel.textContent).toContain('национален референдум');
    expect(panel.querySelector('[aria-label="Базови стойности 2016"]')?.textContent).toContain('600');
    expect(panel.querySelector('[aria-label="Кандидатски резултати 2016"]')?.textContent).toContain('200 / 320');
    expect(panel.textContent).toContain('ZIP не е повторно проверен');
    expect(panel.querySelector('a[href="/data/2016.11.06/SOURCE.md"]')).not.toBeNull();
    expect(panel.querySelector('a[href^="https://www.cik.bg"]')).not.toBeNull();
    expect(fixture.componentInstance.isSourceDocumentation('/data/../../private/SOURCE.md')).toBe(false);
    expect(panel.querySelector('[aria-label="Базови стойности 2016"] [data-change]')).toBeNull();
  });

  it('links the chart and year table to the same selected panel and colors only signed changes', () => {
    const fixture = setup();
    const element = fixture.nativeElement as HTMLElement;
    const click = fixture.componentInstance.chart().plotOptions?.series?.point?.events?.click;
    if (!click) throw new Error('Missing historical chart selection handler');
    Reflect.apply(click, { index: 0 }, [{}]); fixture.detectChanges();
    expect(fixture.componentInstance.selectedYear()).toBe('2016');
    expect(element.querySelector('.history-summary [data-change="down"]')?.textContent).toBe('-5,00');
    expect(element.querySelector('.history-summary [data-change="up"]')?.textContent).toContain('+120');
    const year = [...element.querySelectorAll<HTMLButtonElement>('.history-summary button')].find(button => button.textContent?.trim() === '2021')!;
    year.click(); fixture.detectChanges();
    expect(fixture.componentInstance.selectedYear()).toBe('2021');
    expect(element.querySelector('[role="tabpanel"]')?.textContent).toContain('парламентарни избори');
    expect(element.querySelector('.history-summary [data-change="missing"]')?.textContent).toBe('няма данни');
  });
});
