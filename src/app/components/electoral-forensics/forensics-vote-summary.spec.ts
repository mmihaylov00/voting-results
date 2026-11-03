import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../services/theme.service';
import { jointVoteSummary } from './forensics-candidates.util';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsVoteSummaryComponent } from './forensics-vote-summary';

describe('ForensicsVoteSummaryComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [ForensicsVoteSummaryComponent],
    providers: [{ provide: ThemeService, useValue: { darkMode: signal(false) } }],
  }));

  function render(summary: ReturnType<typeof jointVoteSummary>) {
    const fixture = TestBed.createComponent(ForensicsVoteSummaryComponent);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.metric')];
  }

  it.each([
    [1020, '+0,50', '25,5%'],
    [990, '-0,25', '24,75%'],
  ])('keeps a sub-one percentage-point change in pp for %s signed voters', (voted2, change, after) => {
    const metrics = render(jointVoteSummary([sectionFixture({
      registered1: 4000, registered2: 4000, voted1: 1000, voted2,
      candidateChanges: [candidateFixture('4', 400, 405), candidateFixture('25', 500, 515)],
    })]));
    const turnout = metrics.find(metric => metric.querySelector('dt')?.textContent?.includes('активността'))!;
    expect(turnout.querySelector('dd')?.textContent).toContain(change);
    expect(turnout.querySelector('.unit')?.textContent).toBe('п.п.');
    expect(turnout.querySelector('dd')?.getAttribute('data-change')).toBe(voted2 > 1000 ? 'up' : 'down');
    expect(turnout.querySelector('dd')?.textContent).not.toContain('%');
    expect(turnout.querySelector('.baseline')?.textContent).toContain('25%');
    expect(turnout.querySelector('.baseline')?.textContent).toContain(after);
  });

  it('shows aggregate voter and both candidate gains with their original round baselines', () => {
    const metrics = render(jointVoteSummary([
      sectionFixture({ registered1: 1000, registered2: 1000, voted1: 400, voted2: 500,
        candidateChanges: [candidateFixture('4', 100, 140), candidateFixture('25', 200, 260)] }),
      sectionFixture({ sectionId: '050100002', registered1: 1000, registered2: 1000, voted1: 500, voted2: 700,
        candidateChanges: [candidateFixture('4', 200, 260), candidateFixture('25', 100, 200)] }),
    ]));
    expect(metrics).toHaveLength(4);
    const voters = metrics[0];
    expect(voters.querySelector('dd')?.textContent).toBe('+300');
    expect(voters.querySelector('.baseline')?.textContent?.replace(/\s/g, '')).toBe('900→1200');
    const gyurov = metrics.find(metric => metric.querySelector('dt')?.textContent?.includes('Андрей Гюров'))!;
    const yotova = metrics.find(metric => metric.querySelector('dt')?.textContent?.includes('Илияна Йотова'))!;
    expect(gyurov.querySelector('dd')?.textContent).toBe('+100гласа');
    expect(gyurov.querySelector('dd')?.getAttribute('data-change')).toBe('up');
    expect(gyurov.querySelector('.baseline')?.textContent?.replace(/\s/g, '')).toBe('300→400');
    expect(yotova.querySelector('dd')?.textContent).toBe('+160гласа');
    expect(yotova.querySelector('dd')?.classList.contains('dark:text-emerald-400')).toBe(true);
    expect(yotova.querySelector('.baseline')?.textContent?.replace(/\s/g, '')).toBe('300→460');
    expect(yotova.querySelector('.baseline')?.hasAttribute('data-change')).toBe(false);
  });

  it('keeps an empty cohort unavailable instead of inventing a zero change or candidate baseline', () => {
    const metrics = render(jointVoteSummary([]));
    expect(metrics[1].querySelector('dd')?.textContent).toContain('няма данни');
    expect(metrics[1].querySelector('dd')?.textContent).not.toContain('0,00');
    expect(metrics[1].querySelector('dd')?.getAttribute('data-change')).toBe('missing');
    for (const candidate of metrics.slice(2)) {
      expect(candidate.querySelector('dd')?.textContent).toContain('няма данни');
      expect(candidate.querySelector('.baseline')?.textContent?.replace(/\s/g, '')).toBe('нямаданни→нямаданни');
    }
  });

  it('shows decreases in red and leaves zero candidate gains neutral', () => {
    const metrics = render(jointVoteSummary([sectionFixture({ registered1: 4000, registered2: 4000,
      voted1: 1000, voted2: 990,
      candidateChanges: [candidateFixture('4', 400, 390), candidateFixture('25', 500, 500)],
    })]));
    expect(metrics[0].querySelector('dd')?.getAttribute('data-change')).toBe('down');
    expect(metrics[2].querySelector('dd')?.classList.contains('text-rose-700')).toBe(true);
    const unchanged = metrics[3].querySelector('dd')!;
    expect(unchanged.getAttribute('data-change')).toBe('flat');
    expect(unchanged.classList.contains('text-emerald-700')).toBe(false);
    expect(unchanged.classList.contains('text-rose-700')).toBe(false);
    expect(metrics[3].querySelector('.baseline')?.getAttribute('data-change')).toBeNull();
  });
});
