import { SelectComponent } from '../ui/select/select';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { VoteFlowData } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ThemeService } from '../../services/theme.service';
import { VoteOriginsComponent } from './vote-origins';
import { BaseModalComponent } from '../ui/base-modal/base-modal';

const payload: VoteFlowData = {
  date: '2026.04.19', from: '2024.10.27', generatedAt: '2026-07-30',
  source: { publisher: 'Наясно', url: 'https://example.com/flows', repository: 'https://github.com/atanasster/electionsbg', retrievedAt: '2026-10-26', sha256: 'test' },
  fromNodes: [{ id: 'a', name: 'ГЕРБ', votes: 100, pseudo: false }, { id: '__abstain__', name: 'Не гласували', votes: 80, pseudo: true }],
  toNodes: [{ id: 'b', name: 'БСП', votes: 120, pseudo: false }, { id: 'c', name: 'ПП-ДБ', votes: 60, pseudo: false }],
  flows: [{ from: 'a', to: 'b', votes: 50 }, { from: '__abstain__', to: 'b', votes: 70 }, { from: 'a', to: 'c', votes: 50 }, { from: '__abstain__', to: 'c', votes: 10 }],
  sectionsMatched: 100, sectionsDropped: 2, residual: 0.001, maxNodeExcess: 0.05,
};

describe('VoteOriginsComponent', () => {
  const darkMode = signal(false);
  let getVoteFlows: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    darkMode.set(false);
    getVoteFlows = vi.fn(() => of(payload));
    TestBed.configureTestingModule({ imports: [VoteOriginsComponent], providers: [
      provideRouter([]),
      { provide: ElectionContextService, useValue: { getVoteFlows } },
      { provide: ThemeService, useValue: { darkMode } },
    ] });
  });

  async function render() {
    const fixture = TestBed.createComponent(VoteOriginsComponent);
    fixture.componentRef.setInput('date', '2026.04.19');
    await fixture.whenStable(); fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  }

  it('changes only the selected party flows and reuses the loaded matrix on theme changes', async () => {
    const { fixture, component, host } = await render();
    expect(component.selected()).toBeNull();
    expect(component.groups().map(group => group.target.id)).toEqual(['b', 'c']);
    expect(component.chart().targets).toHaveLength(2);
    expect(component.total()).toBe(180);
    const data = component.data();
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    select.valueChange.emit('c');
    fixture.detectChanges();
    expect(component.selected()?.id).toBe('c');
    expect(component.total()).toBe(60);
    expect(host.querySelectorAll('[data-vote-origin-party]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-vote-origin-segment]')).toHaveLength(2);
    select.valueChange.emit('');
    fixture.detectChanges();
    expect(component.selected()).toBeNull();
    expect(component.chart().targets).toHaveLength(2);
    expect(host.querySelectorAll('[data-vote-origin-party]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-vote-origin-segment]')).toHaveLength(4);
    const chart = component.chart();
    darkMode.set(true); fixture.detectChanges();
    expect(component.data()).toBe(data);
    expect(component.chart()).toBe(chart);
    expect(getVoteFlows).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('date', '2024.10.27');
    await fixture.whenStable();
    expect(getVoteFlows).toHaveBeenCalledTimes(2);
    expect(component.selected()).toBeNull();
  });

  it('labels estimates and coverage, exposes model imprecision and provides accessible data', async () => {
    const { fixture, host } = await render();
    expect(host.textContent).toContain('Моделна оценка');
    expect(host.textContent).toContain('100 съпоставени секции');
    expect(host.textContent).toContain('Не гласували');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('разминавания');
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelectorAll('[data-vote-origin-party]')).toHaveLength(2);
    expect(host.querySelector('[role="combobox"]')?.textContent).toContain('Всички партии');
    expect(host.querySelectorAll('details')).toHaveLength(2);
    expect(host.querySelector('[data-vote-origin-party]')?.textContent).toContain('≈');
    expect(host.textContent).toContain('100% от оценените входящи гласове');
    host.querySelector<HTMLButtonElement>('button[aria-label="Методика за произхода на гласовете"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-base-modal')?.textContent).toContain('не проследяване на отделни избиратели');
    expect(host.querySelector('app-base-modal')?.textContent).toContain('сумата на показаните входящи потоци');
    expect(host.querySelector('a[href="https://example.com/flows"]')).not.toBeNull();
  });

  it.each(['c', 'unknown'])('restores a valid expanded methodology target from %s without accepting unknown parties', async party => {
    const queryParamMap = convertToParamMap({ originParty: party });
    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParamMap: of(queryParamMap), snapshot: { queryParamMap } } });
    const { fixture, component, host } = await render();
    expect(component.selected()?.id ?? null).toBe(party === 'c' ? 'c' : null);
    host.querySelector<HTMLButtonElement>('button[aria-label="Методика за произхода на гласовете"]')!.click();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(BaseModalComponent)).componentInstance as BaseModalComponent;
    expect(modal.pageQueryParams()).toEqual({ panel: 'geography', originParty: party === 'c' ? 'c' : null });
    expect(getVoteFlows).toHaveBeenCalledOnce();
  });

  it('uses one normalized bar per party with consistent source order and estimated totals', async () => {
    getVoteFlows.mockReturnValue(of({ ...payload, toNodes: [{ ...payload.toNodes[0], votes: 999 }, payload.toNodes[1]] }));
    const { host, component } = await render();
    const bars = [...host.querySelectorAll('[data-vote-origin-party]')];
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      const segments = [...bar.querySelectorAll<HTMLButtonElement>('[data-vote-origin-segment]')];
      expect(segments.map(segment => segment.dataset['voteOriginSegment'])).toEqual(['a', '__abstain__']);
      expect(segments.reduce((sum, segment) => sum + parseFloat(segment.style.width), 0)).toBeCloseTo(100);
    }
    const firstSegments = bars[0].querySelectorAll<HTMLButtonElement>('[data-vote-origin-segment]');
    expect(parseFloat(firstSegments[0].style.width)).toBeCloseTo(50 / 120 * 100);
    expect(bars[0].textContent).toContain('≈ 120');
    expect(bars[0].textContent).not.toContain('999');
    const details = bars[0].querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelectorAll('li')).toHaveLength(2);
    expect(details.textContent).toContain('58,3%');
    expect(details.textContent).toContain('≈ 70 гласа');
    expect(component.formatShare(0.04)).toBe('<0,1%');
    expect(getVoteFlows).toHaveBeenCalledOnce();
  });

  it('shows connection details on hover and keyboard focus, follows the pointer and stays inside the viewport', async () => {
    const { fixture, host, component } = await render();
    const chart = component.chart();
    const connection = host.querySelector<SVGPathElement>('svg[role="group"] path')!;
    expect(connection.getAttribute('tabindex')).toBe('0');
    expect(connection.getAttribute('aria-label')).toContain('От: Не гласували');
    connection.dispatchEvent(new Event('mouseenter'));
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain('Не гласували (2024.10.27)');
    expect(tooltip.textContent).toContain('БСП (2026.04.19)');
    expect(tooltip.textContent).toContain('≈ 70 оценени гласа');
    expect(tooltip.textContent).toContain('58,3% от потоците към БСП');
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 280, 100));
    connection.dispatchEvent(new MouseEvent('mousemove', { clientX: window.innerWidth - 4, clientY: window.innerHeight - 4 }));
    expect(parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(tooltip.style.left) + 280).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(parseFloat(tooltip.style.top)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(tooltip.style.top) + 100).toBeLessThanOrEqual(window.innerHeight - 8);
    connection.dispatchEvent(new Event('mouseleave'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    connection.dispatchEvent(new Event('focusin'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('≈ 70 оценени гласа');
    connection.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    const segment = host.querySelector<HTMLButtonElement>('[data-vote-origin-segment="a"]')!;
    segment.dispatchEvent(new Event('focusin'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('ГЕРБ-СДС');
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('≈ 50 оценени гласа');
    expect(component.chart()).toBe(chart);
    expect(getVoteFlows).toHaveBeenCalledOnce();
    fixture.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('escapes source names in tooltips and leaves missing party estimates explicit', async () => {
    getVoteFlows.mockReturnValue(of({ ...payload,
      fromNodes: [{ ...payload.fromNodes[0], name: '<b>Източник & име</b>' }, payload.fromNodes[1]],
      toNodes: [...payload.toNodes, { id: 'missing', name: 'Липсваща оценка', votes: 1, pseudo: false }],
    }));
    const { fixture, host } = await render();
    const segment = host.querySelector<HTMLButtonElement>('[data-vote-origin-segment="a"]')!;
    segment.dispatchEvent(new Event('mouseenter'));
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain('<b>Източник & име</b>');
    expect(tooltip.querySelector('b')).toBeNull();
    const missing = host.querySelector('[data-vote-origin-party="missing"]')!;
    expect(missing.textContent).toContain('Няма публикувани потоци');
    expect(missing.querySelector('[data-vote-origin-segment]')).toBeNull();
    expect(missing.textContent).not.toContain('≈ 0');
    fixture.destroy();
  });

  it('keeps a missing estimate explicit instead of rendering zero flows', async () => {
    getVoteFlows.mockReturnValue(throwError(() => new Error('offline')));
    const { host } = await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('не може да бъде заредена');
    expect(host.querySelector('svg')).toBeNull();
    expect(host.querySelector('table')).toBeNull();
  });

  it('uses shared party labels in the selector, diagram, tooltips and bars without changing flow identities', async () => {
    const data: VoteFlowData = { ...payload, toNodes: [{ ...payload.toNodes[0], name: 'ПрБ' }, payload.toNodes[1]] };
    getVoteFlows.mockReturnValue(of(data));
    const { host, component } = await render();
    expect(component.partyOptions().find(option => option.value === 'b')?.label).toBe('ПБ');
    expect([...host.querySelectorAll('svg text')].map(label => label.textContent)).toContain('ПБ');
    expect(host.querySelector('svg[role="group"] path')?.getAttribute('aria-label')).toContain('ПБ');
    expect(host.querySelector('[data-vote-origin-party] h4')?.textContent?.trim()).toBe('ПБ');
    expect(host.textContent).not.toContain('ПрБ');
    component.selectParty('b');
    expect(component.selected()?.name).toBe('ПрБ');
    expect(component.total()).toBe(120);
    expect(component.data()).toBe(data);
  });
});
