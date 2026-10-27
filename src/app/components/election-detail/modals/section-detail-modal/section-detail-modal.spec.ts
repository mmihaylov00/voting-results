import { TestBed } from '@angular/core/testing';
import { Component, Directive, Input, signal, SimpleChange } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { HighchartsChartComponent } from 'highcharts-angular';
import { of } from 'rxjs';

import { ElectionService } from '../../../../services/election';
import { ThemeService } from '../../../../services/theme.service';
import { SectionDetailModalComponent } from './section-detail-modal';
import { RegionCandidate, Section } from '../../../../models/election.models';
import { ContestantPreviewDirective } from '../../../ui/contestant-preview/contestant-preview.directive';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStubComponent {
  @Input() options: unknown;
  @Input() oneToOne = false;
}

@Directive({ selector: '[appContestantPreview]' })
class PreviewStubDirective {
  @Input() appContestantPreview = '';
  @Input() contestantPreviewDate = '';
  @Input() contestantPreviewPartyId = '';
  @Input() contestantPreviewCandidate: RegionCandidate | null = null;
  @Input() contestantPreviewRegion = '';
}

describe('Presidential section history', () => {
  it('does not attribute a runoff ticket to a different candidate with a shared name', () => {
    const name = 'Пламен Василев Орешарски и Данаил Стоянов Папазов';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ElectionService,
          useValue: {
            electionType: 'presidential',
            loading$: of(false),
            getDates: () => [
              { date: '2016.11.13', name: 'Тур 2' },
              { date: '2016.11.06', name: 'Тур 1' },
            ],
          },
        },
        { provide: ThemeService, useValue: { darkMode: () => false } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new SectionDetailModalComponent(
      TestBed.inject(ThemeService), TestBed.inject(ElectionService)
    ));
    component.section = { sectionId: '01', cityName: 'София', sectionName: 'Секция', partyResults: [] };
    component.allParties = [{ id: '4', name }];
    component.selectedPartyIds = new Set(['4']);
    component.allData = {
      '2016.11.06': {
        parties: { '4': name },
        sections: [{ sectionId: '01', total: 200, voted: 100, partyVotes: { '4': { total: 25 } } }],
      },
      '2016.11.13': {
        parties: { '17': 'Цецка Цачева Данговска и Пламен Иванов Манушев' },
        sections: [{ sectionId: '01', total: 200, voted: 100, partyVotes: { '17': { total: 60 } } }],
      },
    };

    component.updateHistoricalCharts();

    expect(component.historicalVotesChartOptions.series).toEqual([
      expect.objectContaining({ name, data: [25, 0] }),
    ]);
  });
});

describe('Section modal update scope', () => {
  const darkMode = signal(false);

  function createModal(): SectionDetailModalComponent {
    darkMode.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: ElectionService, useValue: { electionType: 'governmental', loading$: of(false), getDates: () => [] } },
        { provide: ThemeService, useValue: { darkMode } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new SectionDetailModalComponent(
      TestBed.inject(ThemeService), TestBed.inject(ElectionService)
    ));
    component.section = { sectionId: '01', cityName: 'София', sectionName: 'Секция', partyResults: [] };
    component.allData = { '2016.11.13': {} };
    return component;
  }

  it('updates each chart once when the party/candidate tab or theme changes', () => {
    const component = createModal();
    const chart = vi.spyOn(component, 'updateChartOptions').mockImplementation(() => {});
    const history = vi.spyOn(component, 'updateHistoricalCharts').mockImplementation(() => {});
    TestBed.tick();
    chart.mockClear();
    history.mockClear();
    component.activeTab.set('candidates');
    TestBed.tick();
    expect(chart).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
    chart.mockClear();
    history.mockClear();
    darkMode.set(true);
    TestBed.tick();
    expect(chart).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
  });

  it('does not rebuild charts or candidates when only share feedback changes', () => {
    const component = createModal();
    const candidates = vi.spyOn(component, 'calculateCandidateResults').mockImplementation(() => {});
    const chart = vi.spyOn(component, 'updateChartOptions').mockImplementation(() => {});
    const history = vi.spyOn(component, 'updateHistoricalCharts').mockImplementation(() => {});
    component.ngOnChanges({ shareMessage: new SimpleChange('', 'Линкът е копиран.', false) });
    expect(candidates).not.toHaveBeenCalled();
    expect(chart).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    component.ngOnChanges({ date: new SimpleChange('', '2016.11.13', false) });
    expect(candidates).toHaveBeenCalledOnce();
    expect(chart).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
  });
});

describe('Section detail panels', () => {
  const section: Section = {
    sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: 'Училище', sectionType: 'City',
    total: 100, voted: 50, discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 5000,
    partyVotes: { '1': { total: 50, paper: 30, machine: 20 } },
  };

  async function createModal(withCandidates = false) {
    const scopedSection: Section = withCandidates ? { ...section, candidateVotes: {
      '1_101': { candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия',
        total: 10, paper: 6, machine: 4 },
    } } : section;
    const getAllFullData = vi.fn(() => of({
      '2024.10.27': { sections: [scopedSection], parties: { '1': 'Партия' }, regions: [] },
    }));
    TestBed.configureTestingModule({
      imports: [SectionDetailModalComponent], providers: [
        provideRouter([]),
        { provide: ElectionService, useValue: {
          electionType: 'governmental', loading$: of(false),
          getDates: () => [{ date: '2024.10.27', name: 'Октомври 2024' }], getAllFullData,
        } },
        { provide: ThemeService, useValue: { darkMode: signal(false) } },
      ],
    }).overrideComponent(SectionDetailModalComponent, {
      remove: { imports: [HighchartsChartComponent, ContestantPreviewDirective] },
      add: { imports: [ChartStubComponent, PreviewStubDirective] },
    });
    const fixture = TestBed.createComponent(SectionDetailModalComponent);
    fixture.componentRef.setInput('section', { ...scopedSection, partyResults: [
      { partyId: '1', partyName: 'Партия', total: 50, paper: 30, machine: 20, percent: 1, percentBp: 10000 },
    ] });
    fixture.componentRef.setInput('currentSectionData', scopedSection);
    fixture.componentRef.setInput('allParties', [{ id: '1', name: 'Партия' }]);
    fixture.componentRef.setInput('selectedPartyIds', new Set(['1']));
    fixture.componentRef.setInput('date', '2024.10.27');
    await fixture.whenStable();
    return { fixture, getAllFullData, host: fixture.nativeElement as HTMLElement };
  }

  it('binds full party identity to previews and keeps its profile action', async () => {
    const { fixture } = await createModal();
    const trigger = fixture.debugElement.query(By.directive(PreviewStubDirective));
    const preview = trigger.injector.get(PreviewStubDirective);
    expect(preview.appContestantPreview).toBe('Партия');
    expect(preview.contestantPreviewDate).toBe('2024.10.27');
    expect(preview.contestantPreviewPartyId).toBe('1');
    const open = vi.spyOn(fixture.componentInstance.openContestant, 'emit');
    trigger.nativeElement.click();
    expect(open).toHaveBeenCalledWith({ partyName: 'Партия', partyId: '1' });
  });

  it('gives section candidate names a keyboard button and cached preview without another archive load', async () => {
    const { fixture, getAllFullData } = await createModal(true);
    fixture.componentInstance.activeTab.set('candidates');
    await fixture.whenStable();
    const candidate = fixture.debugElement.queryAll(By.directive(PreviewStubDirective))
      .find(node => node.injector.get(PreviewStubDirective).contestantPreviewCandidate !== null)!;
    const preview = candidate.injector.get(PreviewStubDirective);
    expect(candidate.nativeElement.tagName).toBe('BUTTON');
    expect(preview.appContestantPreview).toBe('Иван Иванов');
    expect(preview.contestantPreviewDate).toBe('2024.10.27');
    expect(preview.contestantPreviewRegion).toContain('230000001');
    expect(preview.contestantPreviewCandidate).toMatchObject({ total: 10, paper: 6, machine: 4,
      preferencePercentOfPartyVotes: 20 });
    const row = fixture.componentInstance.candidateResults[0];
    expect(fixture.componentInstance.candidatePreview(row)).toBe(preview.contestantPreviewCandidate);
    const open = vi.spyOn(fixture.componentInstance.openCandidate, 'emit');
    candidate.nativeElement.click();
    expect(open).toHaveBeenCalledOnce();
    expect(getAllFullData).toHaveBeenCalledOnce();
  });

  it('separates results, statistics and history while preserving table controls and visited charts', async () => {
    const { fixture, host, getAllFullData } = await createModal();
    const component = fixture.componentInstance;
    const results = host.querySelector<HTMLElement>('section[aria-label="Резултати за секцията"]')!;
    const table = results.querySelector('table');
    expect(results.hidden).toBe(false);
    expect(host.querySelectorAll('highcharts-chart')).toHaveLength(0);
    expect(host.querySelector('app-section-risk-history')).toBeNull();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Раздели на секцията"] button')];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Резултати', 'Статистика', 'История', 'Рискове']);
    component.partySearchTerm = 'Партия';
    component.sortParties('paper');
    component.onColumnSelectionChange(new Set(['partyName', 'paper']));
    const sort = component.partySortDir;
    const charts = vi.spyOn(component, 'updateChartOptions');
    const history = vi.spyOn(component, 'updateHistoricalCharts');

    buttons[1].click();
    await fixture.whenStable();
    const stats = host.querySelector<HTMLElement>('section[aria-label="Статистика за секцията"]')!;
    const chart = stats.querySelector('highcharts-chart');
    expect(results.hidden).toBe(true);
    expect(stats.hidden).toBe(false);
    expect(chart).not.toBeNull();
    expect(stats.querySelector('app-risk-analysis-summary')).toBeNull();
    buttons[2].click();
    await fixture.whenStable();
    expect(stats.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('section[aria-label="История на секцията"]')!.hidden).toBe(false);
    expect(host.querySelectorAll('highcharts-chart')).toHaveLength(2);
    buttons[0].click();
    await fixture.whenStable();
    expect(results.hidden).toBe(false);
    expect(results.querySelector('table')).toBe(table);
    expect(stats.querySelector('highcharts-chart')).toBe(chart);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(component.partySearchTerm).toBe('Партия');
    expect(component.partySortDir).toBe(sort);
    expect(component.visiblePartyColumns()).toEqual(new Set(['partyName', 'paper']));
    expect(getAllFullData).toHaveBeenCalledOnce();
    expect(charts).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('keeps risk details and their timeline in the risks panel', async () => {
    const { fixture, host } = await createModal();
    fixture.componentInstance.selectPanel('risks');
    await fixture.whenStable();
    const risks = host.querySelector<HTMLElement>('section[aria-label="Рискове за секцията"]')!;
    expect(risks.hidden).toBe(false);
    expect(risks.querySelector('app-risk-analysis-summary')).not.toBeNull();
    expect(risks.querySelector('app-section-risk-history')).not.toBeNull();
    expect(risks.textContent).toContain('Няма отчетени рискови индикатори');
    expect(host.querySelector('highcharts-chart')).toBeNull();
  });
});
