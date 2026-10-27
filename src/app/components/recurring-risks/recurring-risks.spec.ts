import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { Region, Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { RecurringRisksComponent } from './recurring-risks';

function section(id: string, regionId: string): Section {
  return { sectionId: id, regionId, cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 8000, riskScore: 1 };
}

describe('RecurringRisksComponent', () => {
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
    component.page = 2;
    query.next(convertToParamMap({ region: 'unknown' }));
    expect(component.region).toBe('');
    expect(component.page).toBe(0);
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

  it('updates only regional rows and preserves pagination on unrelated query changes', () => {
    const sections = [section('010100001', '01'), section('020100001', '02')];
    const regions: Region[] = [
      { id: '01', name: 'Район 1', total: 100, voted: 80, partyVotes: {} },
      { id: '02', name: 'Район 2', total: 100, voted: 80, partyVotes: {} },
    ];
    response.next({
      '2026.04.19': { sections, parties: {}, regions },
      '2024.10.27': { sections, parties: {}, regions },
    });
    const rows = component.filteredRows;
    expect(component.filteredRows).toBe(rows);
    component.page = 2;
    query.next(convertToParamMap({ region: '01', unrelated: 'value' }));
    expect(component.page).toBe(2);
    expect(component.filteredRows).toBe(rows);
    query.next(convertToParamMap({ region: '02' }));
    expect(component.page).toBe(0);
    expect(component.filteredRows.map(row => row.section.regionId)).toEqual(['02']);
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
    expect(fixture.nativeElement.textContent).toContain('Зареждане на съпоставимата история');
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
    expect(fixture.nativeElement.textContent).not.toContain('Зареждане на съпоставимата история');
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
    expect(fixture.nativeElement.textContent).not.toContain('Зареждане на съпоставимата история');
  });
});
