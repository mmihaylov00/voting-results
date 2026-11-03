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
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
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
    expect(element.querySelector('tbody tr')?.textContent).toContain('0,24');
    expect(fixture.componentInstance.partyEstimates()[0].coefficients[0].ci95).toEqual([-.2, .7]);
  });
});
