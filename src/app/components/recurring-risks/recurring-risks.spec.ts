import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { Region, Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { RecurringRisksComponent } from './recurring-risks';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { TableControlsComponent } from '../ui/table-controls/table-controls';

function section(id: string, regionId: string): Section {
  return { sectionId: id, regionId, cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 8000, riskScore: 1 };
}

describe('RecurringRisksComponent', () => {
  afterEach(() => vi.restoreAllMocks());
  let component: RecurringRisksComponent;
  let fixture: ComponentFixture<RecurringRisksComponent>;
  let response: Subject<Record<string, { sections: Section[]; parties: Record<string, string>; regions: Region[] }>>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dates: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let getRiskHistoryData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    response = new Subject();
    query = new BehaviorSubject(convertToParamMap({ region: '01' }));
    dates = new BehaviorSubject(convertToParamMap({ date: '2026.04.19' }));
    getRiskHistoryData = vi.fn(() => response.asObservable());
    TestBed.configureTestingModule({
      imports: [RecurringRisksComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          paramMap: dates, queryParamMap: query,
        } },
        { provide: ElectionService, useValue: {
          electionType: 'governmental', getRiskHistoryData, getDates: () => [
            { date: '2026.04.19', name: 'Април 2026', type: 'governmental' },
            { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
          ],
        } },
      ],
    });
    fixture = TestBed.createComponent(RecurringRisksComponent);
    component = fixture.componentInstance;
    fixture.autoDetectChanges();
  });

  it('restores a valid regional query and ignores unknown regions', () => {
    const sections = [section('010100001', '01'), section('020100001', '02')];
    const regions: Region[] = [
      { id: '01', name: 'Район 1', total: 100, voted: 80, partyVotes: {} },
      { id: '02', name: 'Район 2', total: 100, voted: 80, partyVotes: {} },
    ];
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    expect(component.loading).toBe(false);
    expect(component.filteredRows.map((row) => row.section.regionId)).toEqual(['01']);
    query.next(convertToParamMap({ region: 'unknown' }));
    expect(component.region).toBe('');
    expect(component.filteredRows).toHaveLength(2);
  });

  it('reports failed loads and clears the error when retried', () => {
    response.error(new Error('offline'));
    expect(component.loading).toBe(false);
    expect(component.error).toContain('не можаха');
    response = new Subject();
    component.load();
    expect(component.error).toBe('');
    expect(component.loading).toBe(true);
    response.next({ '2026.04.19': { sections: [], parties: {}, regions: [] } });
    expect(component.loading).toBe(false);
    expect(component.rows).toEqual([]);
  });

  it('renders historical codes as individually explained badges without fetching more data', async () => {
    const sections = [{ ...section('010100001', '01'), riskIndicators: [{ code: 'R1.1', category: 'R1', severity: 'high' }] }];
    const regions = [{ id: '01', name: 'Район 1', total: 100, voted: 80, partyVotes: {} }];
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    await fixture.whenStable();
    const badge = fixture.nativeElement.querySelector('app-risk-badge button') as HTMLButtonElement;
    expect(badge.textContent?.trim()).toBe('R1.1');
    expect(badge.getAttribute('aria-label')).toContain('Активността се променя');
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
  });

  it('exports all regional search matches in sorted order and disables export for an empty result', async () => {
    const sections = Array.from({ length: 160 }, (_, index) => ({
      ...section(String(index).padStart(9, '0'), index % 2 ? '02' : '01'),
      sectionName: index < 128 ? 'Изборна секция' : 'Други',
      riskIndicators: [{ code: 'R1.1', category: 'R1', severity: 'high' }],
    }));
    const regions = ['01', '02'].map(id => ({ id, name: id, total: 100, voted: 80, partyVotes: {} }));
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    await fixture.whenStable();
    const controls = fixture.debugElement.query(By.directive(TableControlsComponent)).componentInstance as TableControlsComponent<typeof component.rows[number]>;
    controls.query.set('Изборна секция');
    controls.sort('section'); controls.sort('section');
    await fixture.whenStable();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recurring-csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const button = fixture.nativeElement.querySelector('app-csv-export-button button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    expect(create).not.toHaveBeenCalled();
    const confirm = fixture.nativeElement.querySelector('app-csv-export-modal app-csv-export-button button') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    confirm.click();
    await fixture.whenStable();
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('Expected a CSV blob');
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    const lines = contents.split('\r\n');
    expect(lines).toHaveLength(65);
    expect(lines[1]).toContain('"2026.04.19","01","","000000126"');
    expect(lines.at(-1)).toContain('"000000000"');
    expect(contents).toContain('"Има рискови индикатори","R1.1"');
    expect(contents).not.toContain('"000000001"');
    expect(contents).not.toContain('"Други"');
    expect(filename).toBe('recurring_risks_governmental_2026.04.19_01.csv');
    expect(controls.viewRows().length).toBeGreaterThan(fixture.nativeElement.querySelectorAll('tr[data-virtual-index]').length);
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
    expect(component.csvExportData).toBeNull();
    controls.query.set('Няма такава секция');
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    component.exportCsv();
    expect(create).toHaveBeenCalledOnce();
  });

  it('distinguishes current indicators, an assessed clear result and missing assessment with accessible status icons', async () => {
    vi.spyOn(TestBed.inject(ElectionService), 'getDates').mockReturnValue([
      { date: '2026.04.19', name: 'Април 2026', type: 'governmental' },
      { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
      { date: '2023.04.02', name: 'Април 2023', type: 'governmental' },
    ]);
    const earlier = ['010100001', '010100002', '010100003'].map(id => section(id, '01'));
    const current = [earlier[0], { ...earlier[1], riskScore: 0 }, { ...earlier[2], riskScore: undefined }];
    const regions = [{ id: '01', name: 'Район 1', total: 300, voted: 240, partyVotes: {} }];
    response.next({
      '2026.04.19': { sections: current, parties: {}, regions },
      '2024.10.27': { sections: earlier, parties: {}, regions },
      '2023.04.02': { sections: earlier, parties: {}, regions },
    });
    await fixture.whenStable();
    const flagged = fixture.nativeElement.querySelector('[role="img"][aria-label="Има рискови индикатори"]') as HTMLElement;
    const clear = fixture.nativeElement.querySelector('[role="img"][aria-label="Без рискови индикатори"]') as HTMLElement;
    const unavailable = fixture.nativeElement.querySelector('[role="img"][aria-label="Няма налична оценка"]') as HTMLElement;
    expect(flagged.classList.contains('text-red-600')).toBe(true);
    expect(flagged.querySelector('path')?.getAttribute('d')).toBe('M18 6 6 18M6 6l12 12');
    expect(clear.classList.contains('text-green-600')).toBe(true);
    expect(clear.querySelector('path')?.getAttribute('d')).toBe('m5 12 4 4L19 6');
    expect(unavailable.classList.contains('text-muted-foreground')).toBe(true);
    expect(unavailable.textContent?.trim()).toBe('-');
    expect(unavailable.querySelector('svg')).toBeNull();
  });

  it('virtualizes all matching rows, preserves scrolling on unrelated queries and resets when the region changes', async () => {
    const sections = Array.from({ length: 128 }, (_, index) => section(String(index).padStart(9, '0'), index % 2 ? '02' : '01'));
    const regions: Region[] = [
      { id: '01', name: 'Район 1', total: 100, voted: 80, partyVotes: {} },
      { id: '02', name: 'Район 2', total: 100, voted: 80, partyVotes: {} },
    ];
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    await fixture.whenStable();
    const viewport = fixture.debugElement.query(By.directive(VirtualTableDirective));
    const list = viewport.injector.get(VirtualTableDirective);
    const rows = component.filteredRows;
    expect(component.filteredRows).toBe(rows);
    expect(list.virtualRows()).toHaveLength(64);
    expect(viewport.nativeElement.querySelectorAll('[data-virtual-index]').length).toBeLessThan(30);
    viewport.nativeElement.scrollTop = 2000;
    viewport.nativeElement.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    const window = list.window();
    expect(window.start).toBeGreaterThan(0);
    query.next(convertToParamMap({ region: '01', unrelated: 'value' }));
    await fixture.whenStable();
    expect(list.window()).toBe(window);
    expect(component.filteredRows).toBe(rows);
    viewport.nativeElement.scrollTop = 64000;
    viewport.nativeElement.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(viewport.nativeElement.querySelector('tr[data-virtual-index="63"] a')?.textContent).toBe('000000126');
    query.next(convertToParamMap({ region: '02' }));
    await fixture.whenStable();
    expect(list.window().start).toBe(0);
    expect(viewport.nativeElement.scrollTop).toBe(0);
    expect(component.filteredRows.every(row => row.section.regionId === '02')).toBe(true);
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
  });

  it('reloads history only when the election date changes', () => {
    dates.next(convertToParamMap({ date: '2026.04.19', unrelated: 'value' }));
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    expect(getRiskHistoryData).toHaveBeenCalledTimes(2);
    expect(getRiskHistoryData).toHaveBeenLastCalledWith('2024.10.27');
  });

  it('uses the regional page scope ahead of legacy query parameters without reloading history', () => {
    const sections = [section('010100001', '01'), section('020100001', '02')];
    const regions = ['01', '02'].map(id => ({ id, name: id, total: 100, voted: 80, partyVotes: {} }));
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    dates.next(convertToParamMap({ date: '2026.04.19', regionId: '02' }));
    query.next(convertToParamMap({ panel: 'risks', region: '01' }));
    expect(component.filteredRows.map(row => row.section.regionId)).toEqual(['02']);
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
  });

  it('renders an asynchronous history response without manual change detection', async () => {
    await fixture.whenStable();
    const loader = fixture.debugElement.query(By.directive(LoadingBarComponent)).componentInstance as LoadingBarComponent;
    expect(loader.loading()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')?.textContent.trim()).toBe('');
    const sections = [section('010100001', '01'), section('020100001', '02')];
    const regions: Region[] = [
      { id: '01', name: 'Район 1', total: 100, voted: 80, partyVotes: {} },
      { id: '02', name: 'Район 2', total: 100, voted: 80, partyVotes: {} },
    ];
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    await fixture.whenStable();
    expect(loader.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('010100001');
    expect(fixture.nativeElement.textContent).not.toContain('020100001');
    query.next(convertToParamMap({}));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('020100001');
  });

  it('renders asynchronous failures without manual change detection', async () => {
    await fixture.whenStable();
    response.error(new Error('offline'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('не можаха да бъдат заредени');
    const loader = fixture.debugElement.query(By.directive(LoadingBarComponent)).componentInstance as LoadingBarComponent;
    expect(loader.loading()).toBe(false);
  });
});
