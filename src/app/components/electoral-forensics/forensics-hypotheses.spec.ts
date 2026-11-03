import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ForensicsHypothesesComponent } from './forensics-hypotheses';
import { ForensicsHypothesis } from './forensics.models';

function hypothesis(overrides: Partial<ForensicsHypothesis> = {}): ForensicsHypothesis {
  return { id: 'H3', title: 'Метод на гласуване', status: 'not_identifiable', summary: 'Недостатъчно припокриване.',
    n: 6, estimate: null, unit: 'процентни пункта', ci95: null, p: null, q: null, method: '',
    limitations: ['Няма отделим причинен ефект.'], details: {}, ...overrides };
}

describe('hypothesis view selection', () => {
  it('keeps an empty model set empty instead of inventing a default check', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedRow()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="tabpanel"]')).toBeNull();
  });

  it('shows unavailable effects explicitly without replacing missing observations with zero', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis()]);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('[role="tabpanel"]')!;
    expect(panel.textContent).toContain('Недостатъчна подкрепа в данните');
    expect(panel.textContent).toContain('няма данни');
    expect(panel.textContent).toContain('няма оценка');
    expect(panel.querySelector('[data-change="missing"]')).not.toBeNull();
    expect(fixture.componentInstance.probability(.00000001)).toBe('<0,0001');
  });

  it('keeps H2 party-specific estimates visible with their uncorrected p-values', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'H2', status: 'estimated', q: .24, details: { coefficients: {
      gerbSharePer10pp: { estimate: .25, ci95: [-.2, .7], p: .3 },
      dpsSharePer10pp: { estimate: -.4, ci95: [-.8, 0], p: .06 },
      logRegistered: { estimate: 11, ci95: [-1, 23], p: .1 },
    } } })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const table = element.querySelector('.party-estimates')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.textContent).toContain('ГЕРБ-СДС');
    expect(table.textContent).toContain('Движение за права и свободи - ДПС');
    expect(table.textContent).toContain('некоригирани');
    expect(element.querySelector('.check-metrics')?.textContent).toContain('0,24');
    expect(table.closest('details')).toBeNull();
    expect(table.querySelectorAll('td[data-change="up"]')).toHaveLength(1);
    expect(table.querySelectorAll('td[data-change="down"]')).toHaveLength(1);
  });

  it('shows primary and stable-list candidate estimates together without an accordion', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'C1', estimate: -.5, status: 'estimated', details: {
      sensitivity: { n: 80, estimate: -.7, ci95: [-1, -.4], p: .01, q: .03, status: 'estimated' },
    } })]);
    fixture.detectChanges();
    const comparison = (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Кандидатски проверки при стабилни списъци"]')!;
    expect(comparison.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(comparison.textContent).toContain('Основна');
    expect(comparison.textContent).toContain('80');
    expect(comparison.textContent).toContain('-0,70');
    expect(comparison.textContent).toContain('0,03');
    expect(comparison.closest('details')).toBeNull();
    expect(fixture.componentInstance.selectedSensitivity()?.ci95).toEqual([-1, -.4]);
  });

  it('switches primary information through the shared keyboard tabs with correct panel labels and observation units', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'H4', n: 4470 }), hypothesis({ id: 'H1', n: 80 })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(2);
    expect(element.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    const initialPanelId = element.querySelector('[role="tabpanel"]')!.id;
    for (const tab of tabs) expect(element.querySelectorAll(`[id="${tab.getAttribute('aria-controls')}"]`)).toHaveLength(1);
    expect(element.querySelector('.check-metrics')?.textContent).toContain('Места за гласуване');
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedRow()?.id).toBe('H1');
    const panel = element.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
    expect(panel.id).toBe(tabs[1].getAttribute('aria-controls'));
    expect(panel.id).toBe(initialPanelId);
    for (const tab of tabs) expect(element.querySelectorAll(`[id="${tab.getAttribute('aria-controls')}"]`)).toHaveLength(1);
    expect(panel.querySelector('.check-metrics')?.textContent).toContain('Секции');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(element.querySelectorAll('details')).toHaveLength(1);
  });

  it('shows explanations and labelled p/q/CI/N directly, colors only the estimate and retains raw calculations', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'C1', estimate: -.5, ci95: [-.8, -.2], q: .02,
      p: .006, n: 80, status: 'estimated', method: 'Регресия с общински контроли.',
      details: { coefficient: -.5, sourceCheck: 'Запазено изчисление' } })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.check-metrics dt')).toHaveLength(5);
    expect(element.querySelector('.check-metrics')?.textContent).toContain('[-0,80; -0,20]');
    expect(element.querySelector('.check-metrics')?.textContent).toContain('0,006');
    expect(element.querySelectorAll('.check-metrics [data-change]')).toHaveLength(1);
    expect(element.querySelector('.check-metrics [data-change="down"]')?.textContent).toBe('-0,50');
    expect(element.querySelector('.check-panel')?.textContent).toContain('Регресия с общински контроли.');
    expect(element.querySelector('.status-chip')?.textContent).toBe('Сигнал за асоциация');
    expect(element.querySelector<HTMLDetailsElement>('.technical')?.open).toBe(false);
    expect(element.querySelector('pre')?.textContent).toContain('Запазено изчисление');
    expect(fixture.componentInstance.badge(hypothesis({ status: 'estimated', q: .2 }))).toBe('Без ясен сигнал');
  });
});
