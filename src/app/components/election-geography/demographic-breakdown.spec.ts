import { SelectComponent } from '../ui/select/select';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DemographicData } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ThemeService } from '../../services/theme.service';
import { DemographicBreakdownComponent } from './demographic-breakdown';

const payload: DemographicData = {
  date: '2026.04.19', censusDate: '2021-09-07', censusSourceUrl: 'https://census2021.bg/',
  source: { publisher: 'Наясно', url: 'https://example.com/data', repository: 'https://github.com/atanasster/electionsbg', retrievedAt: '2026-10-26', sha256: 'test' },
  parties: [{ id: '1', name: 'ГЕРБ' }, { id: '2', name: 'БСП' }],
  rows: [{ metric: 'eduTertiary', correlations: [0.3, -0.5] }, { metric: 'age65plus', correlations: [-0.4, 0.6] }],
};

describe('DemographicBreakdownComponent', () => {
  const darkMode = signal(false);
  let getDemographics: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    darkMode.set(false);
    getDemographics = vi.fn(() => of(payload));
    TestBed.configureTestingModule({ imports: [DemographicBreakdownComponent], providers: [
      provideRouter([]),
      { provide: ElectionContextService, useValue: { getDemographics } },
      { provide: ThemeService, useValue: { darkMode } },
    ] });
  });

  async function render() {
    const fixture = TestBed.createComponent(DemographicBreakdownComponent);
    fixture.componentRef.setInput('date', '2026.04.19');
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  }

  it('filters categories and changes theme without fetching or replacing the dataset', async () => {
    const { fixture, component, host } = await render();
    expect(host.querySelectorAll('[role="group"]')).toHaveLength(2);
    const data = component.data();
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    select.valueChange.emit('education');
    fixture.detectChanges();
    expect(host.querySelectorAll('[role="group"]')).toHaveLength(1);
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toContain('Висше образование');
    const color = host.querySelector<HTMLElement>('[role="group"] button')!.style.backgroundColor;
    darkMode.set(true); fixture.detectChanges();
    expect(host.querySelector<HTMLElement>('[role="group"] button')!.style.backgroundColor).not.toBe(color);
    expect(component.data()).toBe(data);
    expect(getDemographics).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('date', '2024.10.27');
    await fixture.whenStable();
    expect(getDemographics).toHaveBeenCalledTimes(2);
    expect(getDemographics).toHaveBeenLastCalledWith('2024.10.27');
  });

  it('includes readable coefficient labels and explains the census date and aggregate basis', async () => {
    const { fixture, host, component } = await render();
    expect(component.format(-0.001)).toBe('-0,001');
    expect(host.querySelector('[role="group"] button')?.getAttribute('aria-label')).toContain('+0,30');
    host.querySelector<HTMLButtonElement>('button[aria-label="Методика на демографските разделения"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-base-modal')?.textContent).toContain('не данни за избора на отделни избиратели');
    expect(host.querySelector('app-base-modal')?.textContent).toContain('7 септември 2021');
    expect(host.querySelector('a[href="https://census2021.bg/"]')).not.toBeNull();
  });

  it('contains a data failure within the demographic section', async () => {
    getDemographics.mockReturnValue(throwError(() => new Error('offline')));
    const { host } = await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Демографските данни не могат');
    expect(host.querySelector('[role="group"]')).toBeNull();
  });

  it('orders the legend by assigned colors while preserving party correlation indexes', async () => {
    const data: DemographicData = { ...payload,
      parties: [{ id: 'u1', name: 'Непозната А' }, { id: 'other', name: 'Други' },
        { id: 'pb', name: 'ПрБ' }, { id: 'u2', name: 'Непозната Б' }, { id: 'gerb', name: 'ГЕРБ' }],
      rows: [{ metric: 'eduTertiary', correlations: [0.1, 0.2, 0.3, 0.4, 0.5] }],
    };
    getDemographics.mockReturnValue(of(data));
    const { host, component } = await render();
    const legend = [...host.querySelectorAll<HTMLElement>('ul li')];
    expect(legend.map(item => item.title)).toEqual(['ПБ', 'ГЕРБ-СДС', 'Непозната А', 'Непозната Б', 'Други']);
    expect(legend.map(item => item.textContent?.trim())).toEqual(legend.map(item => item.title));
    expect(component.rows()[0].points[2].label).toBe('ПБ\nВисше образование\nr = +0,30');
    expect(legend[4].querySelector('span')!.style.backgroundColor)
      .not.toBe(legend[2].querySelector('span')!.style.backgroundColor);
    expect(component.data()).toBe(data);
    expect(data.parties.map(party => party.id)).toEqual(['u1', 'other', 'pb', 'u2', 'gerb']);
    expect(component.rows()[0].points.map(point => [point.party.id, point.r]))
      .toEqual([['u1', 0.1], ['other', 0.2], ['pb', 0.3], ['u2', 0.4], ['gerb', 0.5]]);
  });

  it('groups categories, orders ages and shades every second complete row', async () => {
    const data: DemographicData = { ...payload, rows: [
      { metric: 'age65plus', correlations: [-0.8, 0.8] },
      { metric: 'religionNoneOrUndecl', correlations: [-0.9, 0.9] },
      { metric: 'age15_29', correlations: [-0.6, 0.6] },
      { metric: 'eduTertiary', correlations: [-0.1, 0.1] },
      { metric: 'ethnicRoma', correlations: [-0.7, 0.7] },
      { metric: 'ageUnder15', correlations: [-0.2, 0.2] },
    ] };
    getDemographics.mockReturnValue(of(data));
    const { component, host } = await render();
    expect(component.rows().map(row => row.metric)).toEqual([
      'eduTertiary', 'ageUnder15', 'age15_29', 'age65plus', 'ethnicRoma', 'religionNoneOrUndecl',
    ]);
    expect([...host.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['Образование', 'Възраст', 'Етническа група', 'Вероизповедание']);
    const rows = [...host.querySelectorAll('[data-demographic-row]')];
    expect(rows.map(row => row.classList.contains('bg-muted/50'))).toEqual([false, true, false, true, false, true]);
    expect(data.rows[0].metric).toBe('age65plus');
  });

  it('shows party, indicator and value on hover and keyboard focus, escaping party markup', async () => {
    getDemographics.mockReturnValue(of({ ...payload, parties: [{ id: '1', name: '<b>Непозната партия</b>' }, payload.parties[1]] }));
    const { fixture, host } = await render();
    const dot = host.querySelector<HTMLButtonElement>('[role="group"] button')!;
    dot.dispatchEvent(new Event('mouseenter'));
    let tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toContain('<b>Непозната партия</b>');
    expect(tooltip?.textContent).toContain('Висше образование');
    expect(tooltip?.textContent).toContain('r = +0,30');
    expect(tooltip?.querySelector('b')).toBeNull();
    dot.dispatchEvent(new Event('mouseleave'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    dot.dispatchEvent(new Event('focusin'));
    tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toContain('r = +0,30');
    dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    fixture.destroy();
  });
});
