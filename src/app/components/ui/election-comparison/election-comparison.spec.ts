import { Component } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { Section } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { ThemeService } from '../../../services/theme.service';
import { ELECTION_TYPE, ElectionType } from '../../../utils/election-type';
import { ElectionComparisonComponent } from './election-comparison';

@Component({
  imports: [ElectionComparisonComponent],
  template: `<app-election-comparison [active]="true" [(mode)]="mode" [showAnalysis]="mode === 'elections'">
    <ng-template><p data-historical-analysis>Историческо сравнение</p></ng-template>
  </app-election-comparison>`,
})
class ComparisonHost {
  mode: 'elections' | 'parties' = 'elections';
}

async function setup(type: ElectionType = 'governmental', query: Record<string, string> = {}) {
  const queries = new BehaviorSubject(convertToParamMap(query));
  const sections: Section[] = [{
    sectionId: '010000001', regionId: '01', regionName: 'Район 1', cityName: 'Град', sectionName: '', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 0, noVotes: 0, activityBp: 8000, topParties: [],
    partyVotes: { '1': { total: 50, paper: 25, machine: 25 }, '2': { total: 20, paper: 20, machine: 0 } },
    candidateVotes: {
      first: { candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия 1', total: 10, paper: 5, machine: 5 },
      second: { candidateId: '102', candidateName: 'Петър Петров', partyId: '1', partyName: 'Партия 1', total: 5, paper: 5, machine: 0 },
    },
  }];
  const getSections = vi.fn(() => of(sections));
  TestBed.configureTestingModule({
    imports: [ComparisonHost], deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ date: '2026.04.19' })), queryParamMap: queries } },
      { provide: ELECTION_TYPE, useValue: type },
      { provide: ThemeService, useValue: { darkMode: () => false } },
      { provide: ElectionService, useValue: { electionType: type, getDates: () => [{ date: '2026.04.19' }], getSections,
        getParties: () => of({ '1': 'Партия 1', '2': 'Партия 2' }) } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(ComparisonHost);
  fixture.componentInstance.mode = 'parties';
  await fixture.whenStable(); fixture.detectChanges();
  return { fixture, queries, getSections, navigate, host: fixture.nativeElement as HTMLElement };
}

describe('combined comparison tab', () => {
  it('provides separate tabs and reuses the comparison data and visited historical view', async () => {
    const { fixture, queries, getSections, navigate, host } = await setup();
    expect(host.querySelector('[data-historical-analysis]')).toBeNull();
    expect(host.querySelector('app-head-to-head')).not.toBeNull();
    expect(getSections).toHaveBeenCalledOnce();
    const headToHead = host.querySelector('app-head-to-head');
    const buttons = host.querySelectorAll<HTMLButtonElement>('nav button');
    expect(Array.from(buttons, button => button.textContent?.trim())).toEqual(['Между избори', 'Между партии', 'Между кандидати']);
    buttons[0].click(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.mode).toBe('elections');
    const history = host.querySelector('[data-historical-analysis]');
    expect(history).not.toBeNull();
    buttons[1].click(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('app-head-to-head')).toBe(headToHead);
    expect(host.querySelector('[data-historical-analysis]')).toBe(history);
    expect(getSections).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { comparison: 'parties', mode: null }, queryParamsHandling: 'merge' }));

    buttons[2].click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { comparison: 'parties', mode: 'candidates', left: null, right: null }, queryParamsHandling: 'merge',
    }));
    queries.next(convertToParamMap({ comparison: 'parties', mode: 'candidates' }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(headToHead?.querySelector('tbody tr th')?.textContent).toContain('Преференции');
    expect(headToHead?.querySelectorAll('app-select')).toHaveLength(2);
    expect(headToHead?.textContent).not.toContain('Сравни');

    buttons[1].click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { comparison: 'parties', mode: null, left: null, right: null },
    }));
    queries.next(convertToParamMap({ comparison: 'parties' }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(headToHead?.querySelector('tbody tr th')?.textContent).toContain('Гласове');
    expect(host.querySelector('app-head-to-head')).toBe(headToHead);
    expect(host.querySelector('[data-historical-analysis]')).toBe(history);
    expect(getSections).toHaveBeenCalledOnce();
  });

  it('opens the candidate tab for existing candidate-comparison links', async () => {
    const { host, navigate } = await setup('governmental', { comparison: 'parties', mode: 'candidates' });
    const buttons = host.querySelectorAll<HTMLButtonElement>('nav button');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('app-head-to-head tbody tr th')?.textContent).toContain('Преференции');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps presidential comparisons limited to elections and presidential candidates', async () => {
    const { host, getSections } = await setup('presidential', { comparison: 'parties', mode: 'candidates' });
    const buttons = host.querySelectorAll<HTMLButtonElement>('nav button');
    expect(Array.from(buttons, button => button.textContent?.trim())).toEqual(['Между избори', 'Между кандидати']);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('app-head-to-head tbody tr th')?.textContent).toContain('Гласове');
    expect(getSections).toHaveBeenCalledOnce();
  });
});
