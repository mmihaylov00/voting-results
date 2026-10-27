import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ElectionService } from '../../../services/election';
import { ElectionContextService } from '../../../services/election-context.service';
import { ThemeService } from '../../../services/theme.service';
import { ElectionToolsComponent } from './election-tools';

describe('workspace tools', () => {
  it('loads tools on demand and retains their instances and data when switching tabs', async () => {
    const getRiskHistoryData = vi.fn(() => of({}));
    const getPolls = vi.fn(() => of(null));
    TestBed.configureTestingModule({
      imports: [ElectionToolsComponent], deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ date: '2026.04.19', regionId: '23' })), queryParamMap: of(convertToParamMap({})) } },
        { provide: ElectionService, useValue: { electionType: 'governmental', getDates: () => [{ date: '2026.04.19', type: 'governmental' }], getRiskHistoryData } },
        { provide: ElectionContextService, useValue: { getPolls } },
        { provide: ThemeService, useValue: { darkMode: () => false } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ElectionToolsComponent);
    fixture.componentRef.setInput('panel', 'results');
    fixture.componentRef.setInput('national', true);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-recurring-risks')).toBeNull();
    expect(host.querySelector('app-polling-agencies')).toBeNull();
    expect(getRiskHistoryData).not.toHaveBeenCalled();
    expect(getPolls).not.toHaveBeenCalled();
    fixture.componentRef.setInput('panel', 'risks');
    await fixture.whenStable();
    const risks = host.querySelector('app-recurring-risks');
    expect(risks).not.toBeNull();
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
    expect(getPolls).not.toHaveBeenCalled();
    fixture.componentRef.setInput('panel', 'polls');
    await fixture.whenStable();
    const polls = host.querySelector('app-polling-agencies');
    expect(polls).not.toBeNull();
    expect(getPolls).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('panel', 'risks'); await fixture.whenStable();
    fixture.componentRef.setInput('panel', 'polls'); await fixture.whenStable();
    expect(host.querySelector('app-recurring-risks')).toBe(risks);
    expect(host.querySelector('app-polling-agencies')).toBe(polls);
    expect(getRiskHistoryData).toHaveBeenCalledOnce();
    expect(getPolls).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('national', false); await fixture.whenStable();
    expect(host.querySelector('app-polling-agencies')).toBeNull();
  });
});
