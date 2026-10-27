import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { CandidateVotes, RegionCandidate, Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { CandidateDetailModalComponent } from '../election-detail/modals/candidate-detail-modal/candidate-detail-modal';
import { partyIdentity } from '../../utils/election-comparison.util';
import { PreferenceDirectoryComponent } from './preference-directory';

@Component({ selector: 'app-candidate-detail-modal', standalone: true, template: '<button type="button" (click)="close.emit()">Затвори</button>' })
class CandidateStub {
  @Input() candidate!: RegionCandidate;
  @Input() sections: Section[] = [];
  @Input() currentDate = '';
  @Input() pageRoute: string[] = [];
  @Input() pageQueryParams = {};
  @Output() close = new EventEmitter<void>();
}

function candidate(overrides: Partial<CandidateVotes> = {}): CandidateVotes {
  return { candidateId: '101', candidateName: 'Иван Петров Иванов', partyId: '1', partyName: 'ГЕРБ-СДС',
    total: 10, paper: 6, machine: 4, ...overrides };
}

function section(overrides: Partial<Section> = {}): Section {
  return { sectionId: '230000001', regionId: '23', regionName: 'София', cityName: 'София', sectionName: 'Училище',
    sectionType: 'City', total: 120, voted: 100, discardedVotes: 0, noVotes: 0, activityBp: 8333, topParties: [],
    partyVotes: { '1': { total: 40, paper: 25, machine: 15 }, '2': { total: 30, paper: 20, machine: 10 } }, ...overrides };
}

async function setup() {
  const latest = [
    section({ candidateVotes: { first: candidate(), second: candidate({ candidateId: '102', candidateName: 'Петър Петров', total: 5, paper: 5, machine: 0 }),
      other: candidate({ partyId: '2', partyName: 'БСП', total: 30, paper: 20, machine: 10 }) } }),
    section({ sectionId: '230000002', partyVotes: { '1': { total: 60, paper: 40, machine: 20 }, '2': { total: 70, paper: 50, machine: 20 } },
      candidateVotes: { first: candidate({ total: 20, paper: 10, machine: 10 }), other: candidate({ partyId: '2', partyName: 'БСП', total: 20, paper: 10, machine: 10 }) } }),
    section({ sectionId: '240000001', regionId: '24', regionName: 'Втори район', partyVotes: { '1': { total: 10, paper: 10, machine: 0 } },
      candidateVotes: { first: candidate({ total: 4, paper: 4, machine: 0 }) } }),
  ];
  const previous = [section({ voted: 300, partyVotes: { '5': { total: 200, paper: 200, machine: 0 } }, candidateVotes: {
    first: candidate({ partyId: '5', partyName: 'ПП ГЕРБ', candidateName: 'Исторически Кандидат' }),
    current: candidate({ partyId: '5', partyName: 'ПП ГЕРБ', candidateId: '102', total: 100, paper: 100, machine: 0 }),
  } })];
  const summaries = {
    '2026.04.19': { parties: { '1': 'ГЕРБ-СДС', '2': 'БСП', '0': 'Други' }, regions: [
      { id: '23', name: 'София', total: 300, voted: 200, partyVotes: { '1': 100, '2': 100 } },
      { id: '24', name: 'Втори район', total: 120, voted: 100, partyVotes: { '1': 10 } },
    ] },
    '2024.10.27': { parties: { '5': 'ПП ГЕРБ' }, regions: [
      { id: '23', name: 'София', total: 400, voted: 300, partyVotes: { '5': 200 } },
    ] },
  };
  const service = {
    electionType: 'governmental',
    getDates: () => [{ date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
      { date: '2026.04.19', name: 'Април 2026', type: 'governmental' }],
    getAllData: vi.fn(() => of(summaries)),
    getSections: vi.fn((date: string): Observable<Section[]> => of(date === '2026.04.19' ? latest : previous)),
    getParties: vi.fn(() => of({ '1': 'ГЕРБ-СДС', '2': 'БСП', '0': 'Други' })),
    getRegions: vi.fn(() => of([{ id: '23', name: 'София', total: 2000, voted: 200,
      partyVotes: { '1': 110, '2': 100, '0': 1000 } }])),
  };
  TestBed.configureTestingModule({ imports: [PreferenceDirectoryComponent], deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [provideRouter([]), { provide: ElectionService, useValue: service },
      { provide: ThemeService, useValue: { darkMode: () => false } }],
  }).overrideComponent(PreferenceDirectoryComponent, {
    remove: { imports: [CandidateDetailModalComponent] }, add: { imports: [CandidateStub] },
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(PreferenceDirectoryComponent);
  return { fixture, component: fixture.componentInstance, service, latest, element: fixture.nativeElement as HTMLElement };
}

async function finish(fixture: ComponentFixture<PreferenceDirectoryComponent>) {
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
  await fixture.whenStable(); fixture.detectChanges();
}

describe('preference directory', () => {
  it('defaults to all elections, groups district results into cards and displays each person’s latest result', async () => {
    const { fixture, component, service, element } = await setup();
    await finish(fixture);
    expect(component.selectedDate()).toBe('all');
    expect(component.dateOptions[0]).toMatchObject({ value: 'all', label: 'Всички избори' });
    expect(service.getSections.mock.calls.map(call => call[0])).toEqual(['2026.04.19', '2024.10.27']);
    expect(component.filteredCards().map(card => card.votes)).toEqual([50, 34, 5, 10]);
    const combined = component.filteredCards().find(card => card.partyId === '1' && card.votes === 34)!;
    expect(combined.lists.map(list => list.regionId)).toEqual(['23', '24']);
    expect(combined.participationCount).toBe(2);
    expect(combined.share).toBeCloseTo(34 / 110 * 100);
    expect(component.partyOptions().map(option => option.value)).toEqual(['all', partyIdentity('ГЕРБ-СДС'), partyIdentity('БСП')]);
    expect(element.querySelectorAll('app-virtual-cards [role="listitem"]')).toHaveLength(4);
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('nav[aria-label="Страници с преференции"]')).toBeNull();
  });

  it('filters elections, parties and names locally and opens the combined candidate profile', async () => {
    const { fixture, component, service, element } = await setup();
    await finish(fixture);
    component.selectedParty.set(partyIdentity('ГЕРБ-СДС'));
    expect(component.filteredCards().map(card => card.votes)).toEqual([34, 5, 10]);
    component.search.set('втори район'); fixture.detectChanges();
    expect(component.filteredCards()).toHaveLength(1);
    expect(component.filteredCards()[0].votes).toBe(34);
    element.querySelector<HTMLButtonElement>('app-virtual-cards [role="listitem"] button')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(CandidateStub)).componentInstance as CandidateStub;
    expect(modal.currentDate).toBe('2026.04.19');
    expect(modal.candidate).toMatchObject({ partyId: '1', candidateName: 'Иван Петров Иванов', total: 34 });
    expect(modal.pageRoute).toEqual(['/', 'governmental', 'election', '2026.04.19', 'region', '23']);

    component.search.set(''); component.changeDate('2024.10.27'); fixture.detectChanges();
    expect(component.selectedParty()).toBe('all');
    expect(component.filteredCards().map(card => card.votes)).toEqual([100, 10]);
    component.changeDate('2026.04.19'); fixture.detectChanges();
    expect(component.filteredCards().map(card => card.votes)).toEqual([50, 34, 5]);
    component.changeDate('invalid');
    expect(component.selectedDate()).toBe('2026.04.19');
    component.search.set('няма такъв'); fixture.detectChanges();
    expect(element.textContent).toContain('Няма профили за избраните избори и филтри.');
    expect(service.getSections).toHaveBeenCalledTimes(2);
    expect(service.getAllData).toHaveBeenCalledOnce();
  });

  it('filters list leaders in the displayed election, including people who lead only one of their lists', async () => {
    const { fixture, component, service, latest, element } = await setup();
    for (const section of latest.filter(section => section.regionId === '23')) {
      section.candidateVotes!['first'].candidateId = '103';
    }
    await finish(fixture);
    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click(); fixture.detectChanges();
    expect(component.filteredCards().map(card => card.votes)).toEqual([50, 34, 10]);
    expect(component.filteredCards().find(card => card.votes === 34)?.candidate.candidateId).toBe('103');
    component.selectedParty.set(partyIdentity('ГЕРБ-СДС'));
    component.search.set('Иван'); fixture.detectChanges();
    expect(component.filteredCards().map(card => card.votes)).toEqual([34]);
    component.changeDate('2024.10.27'); fixture.detectChanges();
    expect(component.filteredCards()).toEqual([]);
    component.search.set(''); fixture.detectChanges();
    expect(component.filteredCards().map(card => card.votes)).toEqual([10]);
    component.changeDate('2026.04.19');
    checkbox.click(); fixture.detectChanges();
    expect(component.filteredCards().map(card => card.votes)).toEqual([50, 34, 5]);
    expect(service.getAllData).toHaveBeenCalledOnce();
    expect(service.getSections).toHaveBeenCalledTimes(2);
  });

  it('retries an incomplete archive scan without reloading completed elections', async () => {
    const { fixture, component, service, latest, element } = await setup();
    service.getSections.mockReturnValueOnce(of(latest)).mockReturnValueOnce(throwError(() => new Error('offline')));
    await finish(fixture);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Преференциите не могат да бъдат заредени');
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await finish(fixture);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(component.entries()).toHaveLength(4);
    expect(service.getSections.mock.calls.filter(call => call[0] === '2026.04.19')).toHaveLength(1);
    expect(service.getSections).toHaveBeenCalledTimes(3);
  });

  it('stops a pending archive scan when navigation destroys the directory', async () => {
    const { fixture, component, service, latest } = await setup();
    const pending = new Subject<Section[]>();
    service.getSections.mockReturnValueOnce(pending);
    fixture.detectChanges();
    await Promise.resolve();
    expect(service.getSections).toHaveBeenCalledOnce();
    fixture.destroy();
    pending.next(latest); pending.complete();
    await Promise.resolve(); await Promise.resolve();
    expect(component.entries()).toEqual([]);
    expect(service.getSections).toHaveBeenCalledOnce();
  });
});
