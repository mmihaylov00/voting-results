import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AgencyComparison, PollingData } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { PollingAgenciesComponent } from './polling-agencies';

const agency = (id: string): AgencyComparison => ({
  id, name: `Агенция ${id}`, website: 'https://example.com/', pollId: `poll-${id}`, sourceUrl: 'https://example.com/poll',
  fieldwork: 'Apr 13-15 2026', fieldworkEnd: '2026-04-15', daysBefore: 4, respondents: 1000, mae: 2,
  deduplicated: 0, normalized: true, redistributed: 5, methodology: 'Интервю',
  errors: [{ party: 'ГЕРБ', polled: 12, published: 11, actual: 10, error: 2 }],
});
const payload: PollingData = { date: '2026.04.19', generatedAt: '2026-10-22', source: { publisher: 'Наясно', url: 'https://example.com/data', repository: 'https://github.com/atanasster/electionsbg', retrievedAt: '2026-10-26', sha256: 'test' }, agencies: [agency('A'), agency('B')] };

describe('PollingAgenciesComponent', () => {
  let queries: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dates: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let getPolls: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queries = new BehaviorSubject(convertToParamMap({}));
    dates = new BehaviorSubject(convertToParamMap({ date: '2026.04.19' }));
    getPolls = vi.fn(() => of(payload));
    TestBed.configureTestingModule({ imports: [PollingAgenciesComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: dates, queryParamMap: queries } },
      { provide: ElectionService, useValue: { electionType: 'governmental', getDates: () => [{ date: '2026.04.19', name: 'Април 2026' }, { date: '2024.10.27', name: 'Октомври 2024' }] } },
      { provide: ElectionContextService, useValue: { getPolls } },
      { provide: ThemeService, useValue: { darkMode: () => false } },
    ] });
  });

  it('changes agency and query state without loading the data again', async () => {
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.selected()).toBeNull();
    expect(component.comparisonAgencies()).toHaveLength(2);
    expect(component.activeTab()).toBe('accuracy');
    const agencies = component.agencies();
    queries.next(convertToParamMap({ agency: 'B' }));
    fixture.detectChanges();
    expect(component.selected()?.id).toBe('B');
    expect(component.agencies()).toBe(agencies);
    dates.next(convertToParamMap({ date: '2026.04.19', unrelated: 'change' }));
    expect(getPolls).toHaveBeenCalledOnce();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.selectAgency('A');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { agency: 'A' }, queryParamsHandling: 'merge', replaceUrl: true }));
    component.selectAgency('');
    expect(component.selected()).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { agency: null } }));
    component.selectAgency('unknown');
    expect(navigate).toHaveBeenCalledTimes(2);
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    expect(getPolls).toHaveBeenCalledTimes(2);
  });

  it('uses a second tab and a normal table with all agencies selected by default', async () => {
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('nav button')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['Точност на агенциите', 'Проучване и резултати']);
    expect(host.querySelector<HTMLElement>('section[aria-labelledby="agency-comparison-title"]')?.hidden).toBe(true);
    tabs[1].click(); fixture.detectChanges();
    expect(host.querySelector<HTMLElement>('[aria-label="Отклонение на агенциите"]')?.hidden).toBe(true);
    const table = host.querySelector('section[aria-labelledby="agency-comparison-title"] table')!;
    expect(table.querySelectorAll('thead th')).toHaveLength(4);
    expect(host.querySelector('#polling-agency--trigger')?.textContent).toContain('Всички агенции');
    expect(host.querySelector('[data-comparison-difference]')).toBeNull();
    expect(host.querySelector('[data-comparison-arrow]')).toBeNull();
    expect(table.textContent).toContain('Публикувано: 11.0%');
    expect(table.querySelector('a[href="https://example.com/poll"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('button[aria-label="Методика на социологическите сравнения"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-base-modal')?.textContent).toContain('най-малкото абсолютно отклонение');
    tabs[0].click(); tabs[1].click(); fixture.detectChanges();
    expect(getPolls).toHaveBeenCalledOnce();
  });

  it('marks the nearest estimates and overall MAE, including ties, without treating missing values as zero', async () => {
    const A = { ...agency('A'), mae: 2, errors: [
      { party: 'ГЕРБ', polled: 12, published: 12, actual: 10, error: 2 },
      { party: 'БСП', polled: 0, published: 0, actual: 5, error: -5 },
      { party: 'ИТН', polled: 0, published: 0, actual: 0, error: 0 },
    ] };
    const B = { ...agency('B'), mae: 1, errors: [
      { party: 'ГЕРБ', polled: 9, published: 9, actual: 10, error: -1 },
      { party: 'ИТН', polled: 0, published: 0, actual: 0, error: 0 },
    ] };
    const C = { ...agency('C'), mae: 1, errors: [{ party: 'ГЕРБ', polled: 11, published: 11, actual: 10, error: 1 }] };
    getPolls.mockReturnValue(of({ ...payload, agencies: [A, B, C] }));
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    const rows = component.comparisonRows();
    expect(rows.map(row => row.party)).toEqual(['ГЕРБ', 'БСП', 'ИТН']);
    expect(rows[0].cells.filter(cell => cell.closest).map(cell => cell.agency.id)).toEqual(['B', 'C']);
    expect(rows[1].cells.map(cell => cell.result?.polled ?? null)).toEqual([0, null, null]);
    expect(rows[1].cells.every(cell => !cell.closest)).toBe(true);
    expect(rows[2].actual).toBe(0);
    expect(rows[2].cells.filter(cell => cell.closest).map(cell => cell.agency.id)).toEqual(['A', 'B']);
    const host = fixture.nativeElement as HTMLElement;
    expect([...host.querySelectorAll('[data-closest-overall]')].map(cell => cell.getAttribute('data-closest-overall'))).toEqual(['B', 'C']);
    expect(host.querySelector('section[aria-labelledby="agency-comparison-title"] tbody')?.textContent).toContain('0.0%');
    expect(host.querySelector('[aria-label="Няма публикувана оценка"]')?.textContent).toBe('-');
  });

  it('displays shared party aliases while retaining the source names used to match agency estimates', async () => {
    const agencies = payload.agencies.map(item => ({ ...item,
      errors: [{ ...item.errors[0], party: 'ПрБ' }, { ...item.errors[0], party: 'ГЕРБ' }],
    }));
    getPolls.mockReturnValue(of({ ...payload, agencies }));
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect([...host.querySelectorAll('section[aria-labelledby="agency-comparison-title"] tbody th[scope="row"]')].map(cell => cell.textContent?.trim()))
      .toEqual(['ГЕРБ-СДС', 'ПБ']);
    expect(host.textContent).not.toContain('ПрБ');
    const row = fixture.componentInstance.comparisonRows().find(item => item.party === 'ПрБ')!;
    expect(row.cells.map(cell => cell.result?.party)).toEqual(['ПрБ', 'ПрБ']);
    expect(row.cells.every(cell => cell.closest)).toBe(true);
  });

  it('opens a linked agency in the comparison tab and keeps the selection when switching tabs', async () => {
    queries.next(convertToParamMap({ agency: 'B' }));
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.activeTab()).toBe('comparison');
    expect(component.comparisonAgencies().map(agency => agency.id)).toEqual(['B']);
    expect(component.comparisonRows()[0].cells[0].closest).toBe(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('section[aria-labelledby="agency-comparison-title"] table thead')?.textContent).toContain('Агенция B');
    expect(host.querySelector('section[aria-labelledby="agency-comparison-title"] table thead')?.textContent).not.toContain('Агенция A');
    component.activeTab.set('accuracy'); component.activeTab.set('comparison');
    expect(component.selected()?.id).toBe('B');
    expect(getPolls).toHaveBeenCalledOnce();
    component.activeTab.set('accuracy');
    queries.next(convertToParamMap({ agency: 'B', panel: 'mandates' }));
    expect(component.activeTab()).toBe('accuracy');
    queries.next(convertToParamMap({ agency: 'unknown' }));
    expect(component.selected()).toBeNull();
    expect(component.comparisonAgencies()).toHaveLength(2);
  });

  it('shows missing polling data explicitly and rejects dates outside the archive', async () => {
    getPolls.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(PollingAgenciesComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('не могат да бъдат заредени');
    dates.next(convertToParamMap({ date: '2099.01.01' }));
    expect(fixture.componentInstance.error()).toContain('архива');
    expect(getPolls).toHaveBeenCalledOnce();
  });
});
