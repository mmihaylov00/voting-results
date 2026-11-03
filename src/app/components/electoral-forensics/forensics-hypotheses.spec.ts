import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ForensicsHypothesesComponent } from './forensics-hypotheses';
import { ForensicsHypothesis } from './forensics.models';

function hypothesis(overrides: Partial<ForensicsHypothesis> = {}): ForensicsHypothesis {
  return { id: 'H3', title: 'Метод на гласуване', status: 'not_identifiable', summary: 'Недостатъчно припокриване.',
    n: 6, estimate: null, unit: 'процентни пункта', ci95: null, p: null, q: null, method: '',
    limitations: ['Няма отделим причинен ефект.'], details: {}, ...overrides };
}

describe('hypothesis result presentation', () => {
  it('shows unsupported effects explicitly without substituting zero effects or probabilities', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis()]);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('.check');
    expect(row?.querySelector('summary')?.textContent).toContain('Недостатъчна подкрепа в данните');
    expect(row?.textContent).toContain('Неустановим ефект');
    expect(row?.textContent).toContain('няма данни');
    expect(row?.textContent).toContain('няма оценка');
    expect(fixture.componentInstance.probability(0.00000001)).toBe('<0,0001');
  });

  it('surfaces the two party-specific estimates and intervals separately from the H2 omnibus correction', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'H2', status: 'estimated', q: .24, details: { coefficients: {
      gerbSharePer10pp: { estimate: .25, ci95: [-.2, .7], p: .3 },
      dpsSharePer10pp: { estimate: -.4, ci95: [-.8, 0], p: .06 },
      logRegistered: { estimate: 11, ci95: [-1, 23], p: .1 },
    } } })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const partyTable = element.querySelector('.party-estimates');
    expect(partyTable?.querySelectorAll('tbody tr').length).toBe(2);
    expect(partyTable?.textContent).toContain('ГЕРБ-СДС');
    expect(partyTable?.textContent).toContain('Движение за права и свободи - ДПС');
    expect(partyTable?.textContent).toContain('некоригирани');
    expect(element.querySelector('.check-q')?.textContent).toContain('0,24');
    expect(element.querySelector<HTMLDetailsElement>('.check')?.open).toBe(false);
    expect(fixture.componentInstance.partyEstimates()[0].coefficients[0].ci95).toEqual([-.2, .7]);
  });

  it('shows stable-list candidate estimates as readable sensitivity rows with their own sample and correction', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'C1', estimate: -.5, status: 'estimated', details: {
      sensitivity: { n: 80, estimate: -.7, ci95: [-1, -.4], p: .01, q: .03, status: 'estimated' },
    } })]);
    fixture.detectChanges();
    const sensitivity = (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Кандидатски проверки при стабилни списъци"]');
    expect(sensitivity?.textContent).toContain('80');
    expect(sensitivity?.textContent).toContain('-0,70');
    expect(sensitivity?.textContent).toContain('0,03');
    expect(fixture.componentInstance.sensitivities()[0].ci95).toEqual([-1, -.4]);
  });

  it('keeps methods and raw calculations behind a closed row while exposing the estimate, interval, q and sample', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'C1', estimate: -.5, ci95: [-.8, -.2], q: .02,
      p: .006, n: 80, status: 'estimated', method: 'Регресия с общински контроли.',
      details: { coefficient: -.5, sourceCheck: 'Запазено изчисление' } })]);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>('.check')!;
    expect(row.open).toBe(false);
    expect(row.querySelector('summary')?.textContent).toContain('-0,50');
    expect(row.querySelector('summary')?.textContent).toContain('[-0,80; -0,20]');
    expect(row.querySelector('summary')?.textContent).toContain('0,02');
    expect(row.querySelector('summary')?.textContent).toContain('80');
    expect(row.querySelector('summary')?.textContent).not.toContain('Регресия');
    expect(row.querySelector('.status-chip')?.textContent).toBe('Сигнал за асоциация');
    row.open = true;
    expect(row.querySelector('.check-body')?.textContent).toContain('Регресия с общински контроли.');
    expect(row.querySelector('.technical-values')?.textContent).toContain('0,006');
    expect(row.querySelector('pre')?.textContent).toContain('Запазено изчисление');
    expect(fixture.componentInstance.badge(hypothesis({ status: 'estimated', q: .2 }))).toBe('Без ясен сигнал');
  });

  it('labels H4 observations as distinct polling locations and other checks as sections', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis({ id: 'H4', n: 4470 }), hypothesis({ id: 'H1', n: 80 })]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.check-head')?.textContent).toContain('Наблюдения');
    expect(element.querySelector('[data-check-id="H4"] .check-n')?.textContent).toContain('Места за гласуване');
    expect(element.querySelector('[data-check-id="H1"] .check-n')?.textContent).toContain('Секции');
    expect(element.querySelector('[data-check-id="H4"] .check-n')?.textContent).not.toContain('Секции');
  });

  it('keeps effect, q and observation labels available to screen readers on desktop', () => {
    const fixture = TestBed.createComponent(ForensicsHypothesesComponent);
    fixture.componentRef.setInput('rows', [hypothesis()]);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.check summary .mobile-label')];
    expect(labels.map(label => label.textContent?.trim())).toEqual(['Оценка · 95% интервал', 'q', 'Наблюдения']);
    for (const label of labels) {
      expect(getComputedStyle(label).display).not.toBe('none');
      expect(getComputedStyle(label).visibility).not.toBe('hidden');
      expect(getComputedStyle(label).position).toBe('absolute');
      expect(label.getAttribute('aria-hidden')).not.toBe('true');
    }
  });
});
