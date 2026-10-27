import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SelectComponent } from '../ui/select/select';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ELECTION_TYPE, ElectionType } from '../../utils/election-type';
import { HeadToHeadComponent } from './head-to-head';

const sections: Section[] = [{
  sectionId: '010000001', regionId: '01', regionName: 'Район 1', cityName: 'Град', sectionName: '', sectionType: 'City',
  total: 100, voted: 80, discardedVotes: 1, noVotes: 0, activityBp: 8000, topParties: [],
  partyVotes: { '1': { total: 50, paper: 25, machine: 25 }, '2': { total: 20, paper: 20, machine: 0 } },
  candidateVotes: { '1_101': { candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия 1', total: 10, paper: 5, machine: 5 } },
}];

function setup(type: ElectionType = 'governmental', query: Record<string, string> = {}, data = sections) {
  const queryParams = new BehaviorSubject(convertToParamMap(query));
  const dates = new BehaviorSubject(convertToParamMap({ date: '2026.04.19' }));
  const getSections = vi.fn(() => of(data));
  TestBed.configureTestingModule({
    imports: [HeadToHeadComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: {
        paramMap: dates, queryParamMap: queryParams,
      } },
      { provide: ELECTION_TYPE, useValue: type },
      { provide: ThemeService, useValue: { darkMode: () => false } },
      { provide: ElectionService, useValue: {
        getDates: () => [{ date: '2026.04.19', name: 'Избори 2026' }, { date: '2024.10.27', name: 'Избори 2024' }],
        getSections, getParties: () => of({ '1': 'Партия 1', '2': 'Партия 2' }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(HeadToHeadComponent);
  return { fixture, component: fixture.componentInstance, queryParams, dates, getSections };
}

describe('head-to-head page', () => {
  it('uses the parent map or regional scope without reloading data and retains standalone labels', async () => {
    const otherRegion = { ...sections[0], sectionId: '020000001', regionId: '02' };
    const { fixture, component, getSections } = setup('governmental', {}, [...sections, otherRegion]);
    await fixture.whenStable();
    expect(component.left()?.votes).toBe(100);
    fixture.componentRef.setInput('scope', sections);
    fixture.componentRef.setInput('embedded', true);
    await fixture.whenStable();
    expect(component.left()?.votes).toBe(50);
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    fixture.componentRef.setInput('scope', []);
    expect(component.profiles()).toEqual([]);
    fixture.componentRef.setInput('scope', null);
    expect(component.left()?.votes).toBe(100);
    expect(getSections).toHaveBeenCalledOnce();
  });
  it('keeps the unchanged side strongholds when selecting the other participant', async () => {
    const { fixture, component, queryParams, getSections } = setup();
    await fixture.whenStable();
    const original = component.sides();
    queryParams.next(convertToParamMap({ left: '2' }));
    const changed = component.sides();
    expect(changed[0]).not.toBe(original[0]);
    expect(changed[1]).toBe(original[1]);
    queryParams.next(convertToParamMap({ left: '2', unrelated: 'value' }));
    expect(component.sides()).toBe(changed);
    expect(getSections).toHaveBeenCalledOnce();
  });

  it('reloads data only when the election date changes', async () => {
    const { fixture, component, queryParams, dates, getSections } = setup();
    await fixture.whenStable();
    const profiles = component.profiles();
    queryParams.next(convertToParamMap({ mode: 'candidates' }));
    queryParams.next(convertToParamMap({ left: '2', right: '1' }));
    dates.next(convertToParamMap({ date: '2026.04.19', unrelated: 'value' }));
    await fixture.whenStable();
    expect(getSections).toHaveBeenCalledOnce();
    expect(component.profiles()).toBe(profiles);
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    await fixture.whenStable();
    expect(getSections).toHaveBeenCalledTimes(2);
    expect(getSections).toHaveBeenLastCalledWith('2024.10.27', undefined, false);
  });

  it('updates regional results from header query changes without reloading the election', async () => {
    const otherRegion: Section = {
      ...sections[0], sectionId: '020000001', regionId: '02', regionName: 'Район 2', candidateVotes: undefined,
      partyVotes: { '1': { total: 5, paper: 5, machine: 0 }, '2': { total: 60, paper: 30, machine: 30 } },
    };
    const { fixture, component, queryParams, getSections } = setup('governmental', { region: '01' }, [...sections, otherRegion]);
    await fixture.whenStable();
    expect(component.left()?.votes).toBe(50);
    queryParams.next(convertToParamMap({ region: '02' }));
    expect(component.region()).toBe('02');
    expect(component.left()?.id).toBe('2');
    expect(component.rows()[0].left).toBe(60);
    expect(component.rows()[0].right).toBe(5);
    queryParams.next(convertToParamMap({}));
    expect(component.region()).toBe('');
    expect(component.rows()[0].left).toBe(80);
    expect(component.rows()[0].right).toBe(55);
    expect(getSections).toHaveBeenCalledOnce();
  });

  it('places signed differences between the two sides with arrows toward the leader', async () => {
    const { fixture, queryParams } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('table') as HTMLTableElement;
    const selects = [...table.querySelectorAll<HTMLButtonElement>('thead [role="combobox"]')];
    expect(selects).toHaveLength(2);
    const labels = selects.map(select => table.querySelector<HTMLElement>('#' + select.getAttribute('aria-labelledby'))!);
    expect(labels.map(label => label.textContent?.trim())).toEqual(['Лява страна', 'Дясна страна']);
    expect(labels.every(label => label.style.display === 'none')).toBe(true);
    expect(selects.every(select => select.querySelector('.party-swatch'))).toBe(true);
    expect(table.tHead?.textContent).not.toContain('лява - дясна');
    expect(table.caption?.classList.contains('sr-only')).toBe(true);
    expect(table.caption?.textContent).not.toContain('води');
    expect(table.tHead?.textContent).not.toContain('Води по');
    expect(fixture.nativeElement.textContent).not.toContain('Разлика = лява - дясна страна.');
    const firstDifference = () => table.querySelector('[data-comparison-difference]')!;
    expect(firstDifference().getAttribute('data-leader')).toBe('left');
    expect(table.tHead?.rows[0].cells[2].textContent).toContain('Разлика');
    expect(table.tBodies[0].rows[0].cells[2]).toBe(firstDifference());
    expect(table.tBodies[0].rows[0].cells).toHaveLength(5);
    expect(table.tBodies[0].rows[0].cells[0].textContent).toContain('Гласове');
    expect(table.tBodies[0].rows[0].cells[4].getAttribute('aria-hidden')).toBe('true');
    expect(firstDifference().textContent).toContain('+30');
    expect(firstDifference().textContent).toContain('Лява страна');
    expect(firstDifference().querySelector('[data-comparison-arrow]')?.textContent).toBe('←');
    expect(table.querySelector('tbody tr [data-comparison-winner="left"]')).not.toBeNull();

    queryParams.next(convertToParamMap({ left: '2', right: '1' }));
    fixture.detectChanges();
    expect(firstDifference().getAttribute('data-leader')).toBe('right');
    expect(firstDifference().textContent).toContain('-30');
    expect(firstDifference().textContent).toContain('Дясна страна');
    expect(firstDifference().querySelector('[data-comparison-arrow]')?.textContent).toBe('→');
    expect(table.querySelector('tbody tr [data-comparison-winner="right"]')).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const partySelect = fixture.debugElement.query(By.css('thead app-select')).componentInstance as SelectComponent;
    partySelect.valueChange.emit('1');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { left: '1' }, queryParamsHandling: 'merge' }));
  });

  it('distinguishes equal and missing values, including valid zero totals', async () => {
    const data: Section[] = [{ ...sections[0], voted: 0, candidateVotes: undefined,
      partyVotes: { '1': { total: 0, paper: 0, machine: 0 }, '2': { total: 0, paper: 0, machine: 0 } },
    }];
    const { fixture, component } = setup('governmental', {}, data);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.rows()[0].leader).toBe('tie');
    expect(component.rows()[1].leader).toBeNull();
    const differences = fixture.nativeElement.querySelectorAll('[data-comparison-difference]') as NodeListOf<HTMLElement>;
    expect(differences[0].textContent).toContain('Равни');
    expect(differences[1].getAttribute('data-leader')).toBeNull();
    expect(differences[1].textContent).toContain('Няма данни');
    expect(fixture.nativeElement.querySelector('[data-comparison-arrow]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-comparison-winner]')).toBeNull();
  });

  it('does not name a winner for the same participant on both sides', async () => {
    const { fixture, component } = setup('governmental', { left: '1', right: '1' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.rows()[0].leader).toBe('tie');
    expect(fixture.nativeElement.querySelector('[data-comparison-winner]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-comparison-arrow]')).toBeNull();
  });

  it('uses candidate preferences for the row leader and difference', async () => {
    const data: Section[] = [{ ...sections[0], candidateVotes: {
      ...sections[0].candidateVotes,
      '1_102': { candidateId: '102', candidateName: 'Петър Петров', partyId: '1', partyName: 'Партия 1', total: 5, paper: 5, machine: 0 },
    } }];
    const { fixture, component } = setup('governmental', { mode: 'candidates' }, data);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.rows()[0].leader).toBe('left');
    expect(component.rows()[0].left).toBe(10);
    expect(component.rows()[0].right).toBe(5);
    const difference = fixture.nativeElement.querySelector('[data-comparison-difference]');
    expect(difference?.textContent).toContain('+5');
    expect(difference?.querySelector('[data-comparison-arrow]')?.textContent).toBe('←');
    expect(fixture.nativeElement.querySelector('thead')?.textContent).not.toContain('Води по');
  });

  it('never awards missing or non-finite values a lead', async () => {
    const { fixture, component } = setup();
    await fixture.whenStable();
    expect(component.leader(0, 0)).toBe('tie');
    expect(component.leader(1, 0)).toBe('left');
    expect(component.leader(0, 1)).toBe('right');
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(component.leader(value, 0)).toBeNull();
      expect(component.leader(0, value)).toBeNull();
    }
  });

  it('loads only this election, renders comparisons and safely falls back from invalid query values', async () => {
    const { fixture, component, getSections } = setup('governmental', { mode: 'unknown', region: '999', left: 'invalid', right: 'invalid' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getSections).toHaveBeenCalledWith('2026.04.19', undefined, false);
    expect(component.mode()).toBe('parties');
    expect(component.region()).toBe('');
    expect(component.left()?.id).toBe('1');
    expect(component.right()?.id).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Избори 2026');
    expect(fixture.nativeElement.querySelector('table')).not.toBeNull();
  });

  it('restores candidate mode from the URL and updates only query state for selections', async () => {
    const { fixture, component, queryParams } = setup('governmental', { mode: 'candidates', region: '01' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mode()).toBe('candidates');
    expect(component.left()?.regionId).toBe('01');
    expect(fixture.nativeElement.textContent).toContain('Дял от преференциите за партията в МИР');
    queryParams.next(convertToParamMap({ mode: 'parties', left: '2', right: '1' }));
    expect(component.left()?.id).toBe('2');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.setSelection('right', '1');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { right: '1' }, queryParamsHandling: 'merge' }));
  });

  it('does not expose preference comparisons for presidential elections', async () => {
    const { fixture, component } = setup('presidential', { mode: 'candidates' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mode()).toBe('parties');
    expect(component.rows().some(row => row.label.includes('преференци'))).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Кандидати с преференции');
  });

  it('shows an actionable loading failure and rejects unknown election dates', async () => {
    const { fixture, component, getSections } = setup();
    await fixture.whenStable();
    getSections.mockImplementation(() => throwError(() => new Error('offline')));
    await component.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Опитай отново');
    await component.load('not-an-election');
    expect(component.error()).toBe('Няма данни за избраните избори.');
    expect(getSections).toHaveBeenCalledTimes(2);
  });
});
