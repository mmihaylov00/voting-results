import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MayorAnalysis } from './forensics.models';
import { ForensicsMayorsComponent } from './forensics-mayors';

function setup() {
  TestBed.configureTestingModule({ imports: [ForensicsMayorsComponent] });
  const fixture = TestBed.createComponent(ForensicsMayorsComponent);
  const summary = { sections: 10, spikeN: 2, spikeRate: 20, meanDeltaPp: 5,
    deltaTurnoutPp: 4, candidate4Delta: -10, candidate25Delta: 30 };
  const data: MayorAnalysis = {
    basis: 'Регистрации от местните избори през 2023 г.', sourceUrl: 'https://results.cik.bg/mi2023/',
    electionDate: '2023', coverage: { matchedMunicipalities: 2, totalMunicipalities: 265,
      matchedSections: 20, eligibleSections: 22 },
    groups: [{ ...summary, party: 'Местна коалиция А (Партия Б)', municipalities: 1,
      medianMunicipalityDeltaPp: 4 }, { ...summary, party: 'Партия Б', municipalities: 1,
      medianMunicipalityDeltaPp: null, spikeN: 0, spikeRate: 0 }],
    municipalities: [{ ...summary, code: 'BLG01', name: 'Банско', mayor: 'Първи кмет',
      party: 'Местна коалиция А (Партия Б)', sourceUrl: 'https://results.cik.bg/mi2023/rezultati/0101.html' },
    { ...summary, code: 'VID01', name: 'Белоградчик', mayor: 'Втори кмет', party: 'Партия Б',
      sourceUrl: 'https://cik.bg.example.com/fake', deltaTurnoutPp: -2 }],
    limitations: ['Не са проверени последващи частични избори и смени на кметове.'],
  };
  fixture.componentRef.setInput('analysis', data);
  fixture.detectChanges();
  return { fixture, data, element: fixture.nativeElement as HTMLElement };
}

describe('mayor nomination comparison', () => {
  it('keeps exact coalition labels, coverage and historical limitations visible with verified source links', () => {
    const { element } = setup();
    expect(element.textContent).toContain('2 от 265 административни общини');
    expect(element.textContent).toContain('20 от 22 допустими секции');
    expect(element.textContent).toContain('не потвърждава партийно членство');
    expect(element.textContent).toContain('кой заема длъжността през 2026 г.');
    expect(element.textContent).toContain('без корекция за местни различия');
    expect(element.textContent).toContain('Не са проверени последващи частични избори');
    expect(element.querySelectorAll('.party-table tbody tr')).toHaveLength(2);
    expect(element.querySelector('.party-table tbody th')?.textContent).toContain('Местна коалиция А (Партия Б)');
    expect(element.querySelectorAll('.municipality-table a')).toHaveLength(1);
    expect(element.querySelector('a[href^="https://cik.bg.example.com"]')).toBeNull();
    expect(element.querySelectorAll('.party-table tbody tr')[1].textContent).toContain('0%');
    expect(element.querySelectorAll('.party-table tbody tr')[1].textContent).toContain('няма данни');
    expect(element.querySelector('.party-table [data-change="down"]')?.textContent).toBe('-10');
  });

  it('searches mayors and parties and sorts municipal turnout through keyboard controls', () => {
    const { fixture, element } = setup();
    const search = element.querySelectorAll<HTMLInputElement>('input')[1];
    search.value = 'втори кмет'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(element.querySelectorAll('.municipality-table tbody tr')).toHaveLength(1);
    expect(element.querySelector('.municipality-table tbody th')?.textContent).toContain('Белоградчик');
    search.value = ''; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    const header = element.querySelector<HTMLElement>('.municipality-table th[columnKey="deltaTurnoutPp"]')!;
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(element.querySelector('.municipality-table tbody th')?.textContent).toContain('Банско');
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(element.querySelector('.municipality-table tbody th')?.textContent).toContain('Белоградчик');
  });

  it('updates scoped exports and renders an explicit unavailable state', () => {
    const { fixture, element } = setup();
    fixture.componentRef.setInput('csvPrefix', 'query2'); fixture.detectChanges();
    expect(element.querySelector('a[download][href$="query2-mayor-parties.csv"]')).not.toBeNull();
    expect(element.querySelector('a[download][href$="query2-mayor-municipalities.csv"]')).not.toBeNull();
    fixture.componentRef.setInput('analysis', undefined); fixture.detectChanges();
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('не са налични');
  });

  it('marks historical-only municipalities and shows sourced subsequent changes without implying current verification', () => {
    const { fixture, data, element } = setup();
    fixture.componentRef.setInput('analysis', { ...data,
      coverage: { ...data.coverage, historicalOnlyMunicipalities: 1, unmatchedSections: 10 },
      municipalities: data.municipalities.map((row, index) => index === 0 ? { ...row,
        affiliationUsable: false, contextNote: 'Частичен избор след 2023 г.',
        contextSourceUrl: 'https://www.cik.bg/bg/decisions/example' } : row),
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('1 общини са изключени от партийните сравнения');
    expect(element.textContent).toContain('10 допустими секции остават извън партийните сравнения');
    expect(element.textContent).toContain('Останалите записи също не са потвърждение');
    const first = element.querySelector('.municipality-table tbody tr')!;
    expect(first.textContent).toContain('Първи кмет');
    expect(first.textContent).toContain('Само исторически запис - извън партийните сравнения');
    expect(first.textContent).toContain('Частичен избор след 2023 г.');
    expect(first.querySelector('a[href="https://www.cik.bg/bg/decisions/example"]')).not.toBeNull();
  });
});
