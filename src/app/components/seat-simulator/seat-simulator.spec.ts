import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { SeatSimulatorComponent } from './seat-simulator';

describe('SeatSimulatorComponent', () => {
  let queries: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dates: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let getRegions: ReturnType<typeof vi.fn>;
  let getParties: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queries = new BehaviorSubject(convertToParamMap({ threshold: '4', coalition: '21,unknown' }));
    dates = new BehaviorSubject(convertToParamMap({ date: '2026.04.19' }));
    getRegions = vi.fn(() => of([{ id: '1', name: 'Област', total: 1000, voted: 1000, partyVotes: { '7': 300, '21': 700 } }]));
    getParties = vi.fn(() => of({ '7': 'ПП-ДБ', '21': 'ПРОГРЕСИВНА БЪЛГАРИЯ' }));
    TestBed.configureTestingModule({
      imports: [SeatSimulatorComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: dates, queryParamMap: queries, snapshot: { data: { view: 'simulator' } } } },
        { provide: ThemeService, useValue: { darkMode: () => false } },
        { provide: ElectionService, useValue: {
          electionType: 'governmental',
          getDates: () => [{ date: '2026.04.19', name: 'Април 2026' }, { date: '2024.10.27', name: 'Октомври 2024' }],
          getRegions, getParties,
        } },
      ],
    });
  });

  it('shows verified mandates and offers the simulator as a tab on the same page', () => {
    TestBed.inject(ActivatedRoute).snapshot.data['view'] = 'mandates';
    getParties.mockReturnValue(of({
      '7': 'ПП-ДБ', '8': 'ВЪЗРАЖДАНЕ', '15': 'ГЕРБ-СДС', '17': 'ДПС', '21': 'ПРОГРЕСИВНА БЪЛГАРИЯ',
    }));
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelectorAll('app-parliament-chart circle')).toHaveLength(240);
    expect(host.querySelectorAll('circle[data-party-id="21"]')).toHaveLength(131);
    expect(host.querySelector('li[data-party-id="15"]')?.textContent).toContain('ГЕРБ-СДС');
    expect(host.querySelector('a[href="https://www.cik.bg/bg/decisions/4807/2026-04-23"]')?.textContent).toContain('Официално разпределение');
    expect([...host.querySelectorAll('nav button')].map(button => button.textContent)).toEqual(['Мандати', 'Симулатор']);
    expect(host.querySelector('a[href="/governmental/election/2026.04.19/simulator"]')).toBeNull();
    expect(host.querySelector('input[type="number"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('button[aria-label="Как се изчислява"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-base-modal')?.textContent).toContain('Всяка точка представлява един мандат');
  });

  it('labels historical mandates as calculated and keeps the standard threshold despite simulator query parameters', () => {
    TestBed.inject(ActivatedRoute).snapshot.data['view'] = 'mandates';
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    queries.next(convertToParamMap({ threshold: '0', coalition: '7' }));
    getRegions.mockReturnValue(of([{ id: '1', name: 'Област', total: 1000, voted: 1000, partyVotes: { '7': 39, '21': 961 } }]));
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    expect(host.textContent).toContain('Изчислено разпределение · праг 4%');
    expect(host.querySelectorAll('circle[data-party-id="21"]')).toHaveLength(240);
    expect(host.querySelectorAll('circle[data-party-id="7"]')).toHaveLength(0);
    const allocation = component.mandateAllocation();
    queries.next(convertToParamMap({ threshold: '10', coalition: '21' }));
    expect(component.mandateAllocation()).toBe(allocation);
    expect(getRegions).toHaveBeenCalledOnce();
    expect(getParties).toHaveBeenCalledOnce();
    expect(host.querySelector('nav[aria-label="Изглед на мандатите"]')).not.toBeNull();
  });

  it('shows a load failure instead of a misleading empty parliament', () => {
    TestBed.inject(ActivatedRoute).snapshot.data['view'] = 'mandates';
    getRegions.mockReturnValue(throwError(() => new Error('Network failure')));
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Данните не могат да бъдат заредени');
    expect(host.querySelector('app-parliament-chart')).toBeNull();
  });

  it('restores valid coalition members and exposes the verified reference separately', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.selectedIds()).toEqual(new Set(['21']));
    expect(component.selectedSeats()).toBe(168);
    expect(component.official()?.seats['21']).toBe(131);
    expect(fixture.nativeElement.textContent).toContain('Симулирано разпределение');
    expect(fixture.nativeElement.textContent).toContain('Има мнозинство');
  });

  it('keeps threshold and coalition selection in the URL', () => {
    const component = TestBed.createComponent(SeatSimulatorComponent).componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.toggleParty('7');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { threshold: null, coalition: '21,7' }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
    queries.next(convertToParamMap({ threshold: '100', coalition: 'bogus' }));
    expect(component.threshold()).toBe(4);
    expect(component.selectedSeats()).toBe(0);
  });

  it('keeps coalition computations stable when switching unrelated workspace tabs', () => {
    const component = TestBed.createComponent(SeatSimulatorComponent).componentInstance;
    const selected = component.selectedRows();
    const allocation = component.allocation();
    queries.next(convertToParamMap({ threshold: '4', coalition: '21,unknown', panel: 'polls' }));
    expect(component.selectedRows()).toBe(selected);
    expect(component.allocation()).toBe(allocation);
    expect(getRegions).toHaveBeenCalledOnce();
  });

  it('reuses election data for coalition and threshold changes and keeps allocation for coalition-only changes', () => {
    const component = TestBed.createComponent(SeatSimulatorComponent).componentInstance;
    const allocation = component.allocation();
    queries.next(convertToParamMap({ coalition: '7' }));
    expect(component.selectedSeats()).toBe(72);
    expect(component.allocation()).toBe(allocation);
    dates.next(convertToParamMap({ date: '2026.04.19', unrelated: 'value' }));
    queries.next(convertToParamMap({ threshold: '6.5', coalition: '21' }));
    expect(component.threshold()).toBe(6.5);
    expect(component.allocation()).not.toBe(allocation);
    expect(component.selectedSeats()).toBe(168);
    expect(getRegions).toHaveBeenCalledOnce();
    expect(getParties).toHaveBeenCalledOnce();
  });

  it('changes the threshold through the numeric field without a range slider', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(input.value).toBe('4');
    expect(host.textContent).not.toContain('Обичаен праг: 4%');

    input.value = '6.5';
    input.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { threshold: 6.5, coalition: '21' }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
    input.value = '100';
    input.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { threshold: null, coalition: '21' }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });

  it('keeps simulator choices and loaded election data when switching tabs', () => {
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    queries.next(convertToParamMap({ tab: 'simulator', threshold: '0', coalition: '7' }));
    getRegions.mockReturnValue(of([{ id: '1', name: 'Област', total: 1000, voted: 1000, partyVotes: { '7': 39, '21': 961 } }]));
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const allocation = component.allocation();
    const selectedSeats = component.selectedSeats();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.selectTab('mandates'); fixture.detectChanges();
    expect(component.isMandates()).toBe(true);
    expect(component.mandateRows().map(row => row.id)).toEqual(['21']);
    expect(component.selectedIds()).toEqual(new Set(['7']));
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: 'mandates' }, queryParamsHandling: 'merge' }));
    component.selectTab('simulator'); fixture.detectChanges();
    expect(component.isMandates()).toBe(false);
    expect(component.threshold()).toBe(0);
    expect(component.selectedSeats()).toBe(selectedSeats);
    expect(component.allocation()).toBe(allocation);
    expect(fixture.nativeElement.querySelector('input[type="number"]').value).toBe('0');
    expect(getRegions).toHaveBeenCalledOnce();
    expect(getParties).toHaveBeenCalledOnce();
  });

  it('resets the threshold and coalition with a labelled icon button and no mandates link', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const host = fixture.nativeElement as HTMLElement;
    const reset = host.querySelector<HTMLButtonElement>('button[aria-label="Нулирай симулацията"]')!;
    expect(reset.textContent?.trim()).toBe('');
    expect(reset.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('a[href$="/mandates"]')).toBeNull();
    reset.click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { threshold: null, coalition: null }, queryParamsHandling: 'merge', replaceUrl: true }));
  });

  it('recovers when navigating from an invalid date to an available election', () => {
    dates.next(convertToParamMap({ date: '2099.01.01' }));
    const component = TestBed.createComponent(SeatSimulatorComponent).componentInstance;
    expect(component.error()).toContain('парламентарните');
    dates.next(convertToParamMap({ date: '2026.04.19' }));
    expect(component.error()).toBe('');
    expect(component.ballots().length).toBe(2);
  });

  it('shows party names and seats on hover and keyboard focus', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role="group"] button')!;
    expect(button.hasAttribute('title')).toBe(false);

    for (const [show, hide] of [['mouseenter', 'mouseleave'], ['focusin', 'focusout']]) {
      button.dispatchEvent(new Event(show));
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('ПБ');
      expect(tooltip?.textContent).toContain('168 мандата');
      button.dispatchEvent(new Event(hide));
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    }
  });

  it('keeps one tooltip when focus and hover overlap and removes it on destroy', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role="group"] button')!;
    button.dispatchEvent(new Event('focusin'));
    button.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    fixture.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('renders party names as text in tooltips', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    const name = 'Листа <img src=x onerror="alert(1)"> & партньори';
    fixture.componentInstance.ballots.set([{ id: '99', name, votes: 1000, eligible: true }]);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role="group"] button')!;
    button.dispatchEvent(new Event('mouseenter'));
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toContain(name);
    expect(tooltip?.textContent).toContain('240 мандата');
    expect(tooltip?.querySelector('img')).toBeNull();
  });

  it('opens the methodology with the shared modal and closes it with its close button', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const info = host.querySelector<HTMLButtonElement>('button[aria-label="Как се изчислява"]')!;
    expect(info.getAttribute('aria-haspopup')).toBe('dialog');
    expect(host.querySelector('app-base-modal')).toBeNull();
    info.click();
    fixture.detectChanges();
    const dialog = host.querySelector('app-base-modal')!;
    expect(dialog.textContent).toMatch(/върху 1[\s,]000 действителни гласа за листи/);
    expect(dialog.textContent).toContain('„Не подкрепям никого“ и невалидните бюлетини');
    expect(dialog.textContent).toContain('Гласовете за местни листи участват в прага');
    expect(dialog.textContent).toContain('Не моделира избрани независими кандидати');
    expect(dialog.textContent).toContain('Коалициите показват само аритметично мнозинство');
    expect(dialog.querySelector('a[href="https://www.cik.bg/bg/decisions/4807/2026-04-23"]')?.textContent)
      .toContain('4807-НС / 23.04.2026');
    expect(dialog.querySelector('a[href="https://results.cik.bg/pe202604/hnmvis/index.html"]')?.textContent)
      .toContain('Методика на ЦИК');

    dialog.querySelector<HTMLButtonElement>('button[aria-label="Затвори"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-base-modal')).toBeNull();
  });

  it('updates the methodology total and preserves the remainder tie explanation', () => {
    const fixture = TestBed.createComponent(SeatSimulatorComponent);
    fixture.componentInstance.ballots.set(Array.from({ length: 7 }, (_, index) => ({
      id: String(index + 1), name: `Листа ${index + 1}`, votes: 1, eligible: true,
    })));
    fixture.componentInstance.methodOpen.set(true);
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('app-base-modal')!;
    expect(dialog.textContent).toContain('върху 7 действителни гласа за листи');
    expect(dialog.textContent).toContain('Има равни остатъци на границата на последния мандат');
    expect(dialog.textContent).toContain('официалното разпределение може да изисква жребий');
  });
});
