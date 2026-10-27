import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../services/theme.service';
import { ParliamentChartComponent } from './parliament-chart';

describe('ParliamentChartComponent', () => {
  const darkMode = signal(false);
  const parties = [
    { id: '21', name: 'ПРОГРЕСИВНА БЪЛГАРИЯ', seats: 131 },
    { id: '15', name: 'ГЕРБ-СДС', seats: 39 },
    { id: '7', name: 'ПП-ДБ', seats: 37 },
    { id: '17', name: 'ДПС', seats: 21 },
    { id: '8', name: 'ВЪЗРАЖДАНЕ', seats: 12 },
  ];

  beforeEach(() => {
    darkMode.set(false);
    TestBed.configureTestingModule({
      imports: [ParliamentChartComponent],
      providers: [{ provide: ThemeService, useValue: { darkMode } }],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(ParliamentChartComponent);
    fixture.componentRef.setInput('parties', parties);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('draws exactly one distinct, non-overlapping dot per seat within the semicircle', () => {
    const { host } = render();
    const dots = [...host.querySelectorAll('circle')].map(circle => ({
      x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')),
    }));
    expect(dots).toHaveLength(240);
    expect(new Set(dots.map(dot => `${dot.x},${dot.y}`)).size).toBe(240);
    expect(dots.every(dot => dot.x >= 6.2 && dot.x <= 553.8 && dot.y >= 6.2 && dot.y <= 293.8)).toBe(true);
    for (let index = 0; index < dots.length; index++) {
      for (const other of dots.slice(index + 1)) {
        expect(Math.hypot(dots[index].x - other.x, dots[index].y - other.y)).toBeGreaterThan(12.4);
      }
    }
  });

  it('matches party totals, seat shares, accessible labels and hover names', () => {
    const { host } = render();
    for (const party of parties) {
      expect(host.querySelectorAll(`circle[data-party-id="${party.id}"]`)).toHaveLength(party.seats);
      const dot = host.querySelector(`circle[data-party-id="${party.id}"]`)!;
      dot.dispatchEvent(new Event('mouseenter'));
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(party.name);
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(`${party.seats} мандата`);
      dot.dispatchEvent(new Event('mouseleave'));
    }
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toContain('240 мандата');
    expect(host.querySelector('desc')?.textContent).toContain('131 мандата');
    expect(host.querySelector('figcaption')?.textContent).toContain('мнозинство на 121');
    expect(host.querySelector('li[data-party-id="21"]')?.textContent).toMatch(/54[.,]6%/);
  });

  it('shows seat share on hover and keyboard focus and dismisses it on Escape', () => {
    const { fixture, host } = render();
    const dot = host.querySelector('circle[data-party-id="21"]')!;
    dot.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('131 мандата · 54,6%');
    expect(dot.querySelector('title')).toBeNull();
    dot.dispatchEvent(new Event('mouseleave'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    const legend = host.querySelector<HTMLElement>('li[data-party-id="21"]')!;
    expect(legend.tabIndex).toBe(0);
    legend.dispatchEvent(new Event('focusin'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('54,6%');
    legend.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    legend.dispatchEvent(new Event('focusin'));
    fixture.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('updates party colors on theme changes without moving seats', () => {
    const { fixture, host } = render();
    const dot = host.querySelector('circle[data-party-id="21"]')!;
    const position = [dot.getAttribute('cx'), dot.getAttribute('cy')];
    const color = dot.getAttribute('fill');
    darkMode.set(true);
    fixture.detectChanges();
    expect(dot.getAttribute('fill')).not.toBe(color);
    expect([dot.getAttribute('cx'), dot.getAttribute('cy')]).toEqual(position);
  });

  it('puts assigned colors first and Others last in the legend without moving seats', () => {
    const { fixture, host } = render();
    const input = [
      { id: 'u1', name: 'Непозната А', seats: 3 },
      { id: 'other', name: 'Други', seats: 1 },
      { id: 'gerb', name: 'ГЕРБ', seats: 2 },
      { id: 'u2', name: 'Непозната Б', seats: 4 },
      { id: 'bsp', name: 'БСП', seats: 1 },
    ];
    fixture.componentRef.setInput('parties', input);
    for (const dark of [false, true]) {
      darkMode.set(dark);
      fixture.detectChanges();
      expect([...host.querySelectorAll('li')].map(item => item.getAttribute('data-party-id')))
        .toEqual(['gerb', 'bsp', 'u1', 'u2', 'other']);
      const swatch = (id: string) => host.querySelector<HTMLElement>(`li[data-party-id="${id}"] span`)!.style.backgroundColor;
      expect(swatch('other')).not.toBe(swatch('u1'));
      expect([...host.querySelectorAll('circle[data-party-id]')].map(dot => dot.getAttribute('data-party-id')))
        .toEqual(input.flatMap(party => Array.from({ length: party.seats }, () => party.id)));
    }
    expect(input.map(party => party.id)).toEqual(['u1', 'other', 'gerb', 'u2', 'bsp']);
  });

  it('renders missing seats as unassigned rather than giving them to another party', () => {
    const { fixture, host } = render();
    fixture.componentRef.setInput('parties', [{ id: '1', name: 'Листа <img src=x>', seats: 10 }]);
    fixture.detectChanges();
    expect(host.querySelectorAll('circle[data-party-id]')).toHaveLength(10);
    expect(host.querySelectorAll('circle:not([data-party-id])')).toHaveLength(230);
    expect(host.querySelector('figcaption')?.textContent).toMatch(/10\s*\/ 240 мандата/);
    expect(host.querySelector('img')).toBeNull();
    host.querySelector('circle[data-party-id="1"]')!.dispatchEvent(new Event('mouseenter'));
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toContain('Листа <img src=x>');
    expect(tooltip?.textContent).toContain('10 мандата · 4,2%');
    expect(tooltip?.querySelector('img')).toBeNull();
    host.querySelector('circle[data-party-id="1"]')!.dispatchEvent(new Event('mouseleave'));
  });
});
