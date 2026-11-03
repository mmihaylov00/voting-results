import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By, Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, RouterLink } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElectoralForensicsComponent } from './electoral-forensics';
import { CandidateAnalysisSummary, ForensicsFinding, ForensicsGroup, ForensicsSection } from './forensics.models';
import { candidateFixture, groupFixture, reportFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsHypothesesComponent } from './forensics-hypotheses';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { ForensicsHistoryComponent } from './forensics-history';
import { ForensicsVoteSummaryComponent } from './forensics-vote-summary';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }
@Component({ selector: 'app-forensics-map', template: '' })
class MapStub { @Input() rows: ForensicsSection[] = []; @Output() sectionSelect = new EventEmitter<ForensicsSection>(); }
@Component({ selector: 'app-forensics-group-table', template: '' })
class GroupStub { @Input() rows: ForensicsGroup[] = []; @Input() label = ''; }

function setup(query = 'query1') {
  TestBed.configureTestingModule({
    imports: [ElectoralForensicsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { researchQuery: query } } } }],
  });
  TestBed.overrideComponent(ElectoralForensicsComponent, {
    set: { imports: [CommonModule, FormsModule, RouterLink, ChartStub, MapStub, GroupStub, ForensicsHypothesesComponent, HlmButtonDirective, MapIconComponent, ForensicsHistoryComponent, ForensicsVoteSummaryComponent] },
  });
  return TestBed.createComponent(ElectoralForensicsComponent);
}

describe('hidden electoral research pages', () => {
  afterEach(() => TestBed.inject(Meta).removeTag('name="robots"'));

  it('sets noindex,nofollow,noarchive while mounted and restores the prior robots tag and title', () => {
    const fixture = setup();
    const meta = TestBed.inject(Meta);
    const title = TestBed.inject(Title);
    meta.updateTag({ name: 'robots', content: 'index,follow' });
    // Capture the original state in a fresh component, before its initialization.
    fixture.destroy();
    meta.updateTag({ name: 'robots', content: 'index,follow' });
    title.setTitle('Изборен архив');
    const page = TestBed.createComponent(ElectoralForensicsComponent);
    page.detectChanges();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex,nofollow,noarchive');
    page.destroy();
    expect(meta.getTag('name="robots"')?.content).toBe('index,follow');
    expect(title.getTitle()).toBe('Изборен архив');
  });

  it('removes its robots tag when no tag existed previously', () => {
    const fixture = setup('query2');
    fixture.detectChanges();
    expect(fixture.componentInstance.focus).toBe(true);
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex,nofollow,noarchive');
    fixture.destroy();
    expect(TestBed.inject(Meta).getTag('name="robots"')).toBeNull();
  });

  it('loads both artifacts and filters, sorts and paginates the rendered section table', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/forensics/2026/report.json').flush(reportFixture());
    http.expectOne('/data/forensics/2026/sections.json').flush(Array.from({ length: 35 }, (_, i) => sectionFixture({
      sectionId: `0501${String(i).padStart(5, '0')}`, deltaTurnoutPp: i,
      settlementName: i === 0 ? 'Борово' : 'Рабиша',
    })));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('#geography tbody tr').length).toBe(30);
    expect(element.querySelector('#geography tbody th')?.textContent).toContain('050100034');
    fixture.componentInstance.sort('deltaTurnoutPp');
    fixture.detectChanges();
    expect(element.querySelector('#geography tbody th')?.textContent).toContain('050100000');
    const search = element.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'Борово';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('#geography tbody tr').length).toBe(1);
    expect(element.querySelector('#geography tbody')?.textContent).toContain('Борово');
    expect(fixture.componentInstance.page()).toBe(0);
    http.verify();
    fixture.destroy();
  });

  it('shows an explicit retry state when a data artifact fails', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/forensics/2026/report.json').flush('unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('не можа да бъде зареден');
    expect(fixture.componentInstance.loading()).toBe(false);
    fixture.destroy();
  });

  it('fetches complete records on selection, cancels obsolete requests and caches validated records', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/forensics/2026/report.json').flush(reportFixture());
    http.expectOne('/data/forensics/2026/sections.json').flush([]);
    const first = sectionFixture();
    const second = sectionFixture({ sectionId: '050100002' });
    fixture.componentInstance.selectSection(first);
    const obsolete = http.expectOne('/data/forensics/2026/section-records/050100001.json');
    fixture.componentInstance.selectSection(second);
    expect(obsolete.cancelled).toBe(true);
    http.expectOne('/data/forensics/2026/section-records/050100002.json').flush({ ...second, address: 'Оригинален адрес' });
    expect(fixture.componentInstance.selected()?.address).toBe('Оригинален адрес');
    expect(fixture.componentInstance.detailLoading()).toBe(false);
    fixture.componentInstance.selectSection(second);
    http.expectNone('/data/forensics/2026/section-records/050100002.json');
    fixture.destroy();
    http.verify();
  });

  it('rejects a detail record whose section identity does not match the requested record', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/forensics/2026/report.json').flush(reportFixture());
    http.expectOne('/data/forensics/2026/sections.json').flush([]);
    fixture.componentInstance.selectSection(sectionFixture());
    http.expectOne('/data/forensics/2026/section-records/050100001.json').flush(sectionFixture({ sectionId: '999999999' }));
    expect(fixture.componentInstance.selected()?.sectionId).toBe('050100001');
    expect(fixture.componentInstance.detailError()).toContain('различна секция');
    fixture.destroy();
  });

  it('uses the explicit query review queue instead of all national findings', () => {
    const fixture = setup();
    const report = reportFixture();
    const finding: ForensicsFinding = {
      sectionId: '050100001', regionName: 'Видин', municipalityName: 'Белоградчик', settlementName: 'Рабиша',
      deltaTurnoutPp: 20, deltaVoted: 40, registered1: 200, registered2: 200, voted1: 80, voted2: 120,
      turnout1: 40, turnout2: 60, robustZ: 3, peerN: 50, peerMedian: 2, criteria: [], calculations: [],
      alternativeExplanations: [], spatialQ: null, priority: true, small400: true,
    };
    report.findings = [finding, { ...finding, sectionId: '010100001', priority: false }];
    report.query1.findings = ['050100001'];
    fixture.componentInstance.report.set(report);
    expect(fixture.componentInstance.findings().map(row => row.sectionId)).toEqual(['050100001']);
    fixture.destroy();
  });

  it.each([
    ['query1', '/research/electoral-forensics-2026'],
    ['query2', '/research/runoff-mobilization-2026'],
  ])('keeps all %s section anchors on the current research route with a root base URL', (query, path) => {
    const existingBase = document.head.querySelector('base');
    const base = existingBase ?? document.createElement('base');
    const originalHref = existingBase?.getAttribute('href') ?? null;
    base.setAttribute('href', '/');
    if (!existingBase) document.head.appendChild(base);
    const fixture = setup(query);
    try {
      fixture.componentInstance.report.set(reportFixture());
      fixture.detectChanges();
      const anchors = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a[href*="#"]')];
      expect(anchors.length).toBeGreaterThanOrEqual(fixture.componentInstance.navigation.length);
      for (const anchor of anchors) {
        const destination = new URL(anchor.href);
        expect(destination.pathname).toBe(path);
        expect(destination.hash).not.toBe('');
        expect((fixture.nativeElement as HTMLElement).querySelector(destination.hash)).not.toBeNull();
      }
    } finally {
      fixture.destroy();
      if (!existingBase) base.remove();
      else if (originalHref === null) base.removeAttribute('href');
      else base.setAttribute('href', originalHref);
    }
  });

  it('explains the stable review criterion codes in Bulgarian', () => {
    const fixture = setup();
    expect(fixture.componentInstance.enumLabel('absolute_change_ge10pp_and_abs_robust_z_ge3'))
      .toContain('Промяна поне 10 процентни пункта');
    expect(fixture.componentInstance.enumLabel('registered_electorate_change_over5pct'))
      .toBe('Броят избиратели по списък се е променил с повече от 5%');
    fixture.destroy();
  });

  it('shows descriptive peer fractions and keeps address markers separate from official special flags', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/forensics/2026/report.json').flush(reportFixture());
    http.expectOne('/data/forensics/2026/sections.json').flush([]);
    const row = sectionFixture();
    row.signal.empiricalUpperTail = .125;
    fixture.componentInstance.selectSection(row);
    http.expectOne('/data/forensics/2026/section-records/050100001.json').flush({ sectionId: row.sectionId, elections: {
      '2026.10.25': { registered: 250, voted: 90, turnout: 36, sourceUrls: {}, votesByParty: {},
        special: false, specialReasons: [], institutionReviewFlag: true },
      '2026.11.01': { registered: 250, voted: 170, turnout: 68, sourceUrls: {}, votesByParty: {},
        special: true, specialReasons: ['official_mobile_flag'], institutionReviewFlag: false },
    } });
    fixture.detectChanges();
    const inspector = (fixture.nativeElement as HTMLElement).querySelector('#section-inspector');
    expect(inspector?.textContent).toContain('12,5%');
    expect(inspector?.textContent).toContain('Това не е p-стойност');
    expect(inspector?.textContent).not.toContain('коригирана вероятност');
    const rows = inspector?.querySelectorAll('.institution-evidence tbody tr');
    expect(rows?.[0].textContent).toContain('Няма посочен');
    expect(rows?.[0].textContent).toContain('Има обозначение за институция');
    expect(rows?.[1].textContent).toContain('Официално обозначена подвижна секция');
    expect(rows?.[1].textContent).toContain('Няма открит маркер');
    expect(inspector?.textContent).toContain('Той не определя официална категория');
    fixture.destroy();
    http.verify();
  });

  it('labels the cluster probability summaries as minimum p and maximum q', () => {
    const fixture = setup();
    const report = reportFixture();
    report.query1.clusters = [{ id: 'cluster1', sectionIds: ['050100001'], siteCount: 3, sectionCount: 1,
      regionName: 'Видин', municipalityName: 'Белоградчик', meanDeltaPp: 10, p: .001, q: .8,
      status: 'exploratory', definition: 'Териториална близост.', limitations: [] }];
    fixture.componentInstance.report.set(report);
    fixture.detectChanges();
    const review = (fixture.nativeElement as HTMLElement).querySelector('#review');
    expect(review?.textContent).toContain('Минимална p / максимална q на съставните места');
    expect(review?.textContent).not.toContain('Минимални p / q');
    fixture.destroy();
  });

  it('restores missing lazy-record explanations from the global finding even outside the page review queue', () => {
    const fixture = setup();
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const report = reportFixture();
    report.findings = [{
      sectionId: '010100001', regionName: 'Благоевград', municipalityName: 'Банско', settlementName: 'Банско',
      deltaTurnoutPp: 20, deltaVoted: 40, registered1: 200, registered2: 200, voted1: 80, voted2: 120,
      turnout1: 40, turnout2: 60, robustZ: 3, peerN: 50, peerMedian: 2, criteria: [], calculations: [],
      alternativeExplanations: ['Нормална балотажна мобилизация.', 'Промяна на кандидатския избор.'],
      spatialQ: null, priority: false, small400: true,
    }];
    report.query1.findings = [];
    http.expectOne('/data/forensics/2026/report.json').flush(report);
    http.expectOne('/data/forensics/2026/sections.json').flush([]);
    const row = sectionFixture({ sectionId: '010100001', priority: false });
    fixture.componentInstance.selectSection(row);
    http.expectOne('/data/forensics/2026/section-records/010100001.json').flush({ sectionId: row.sectionId, elections: {} });
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()?.signal.alternativeExplanations)
      .toEqual(report.findings[0].alternativeExplanations);
    const inspector = (fixture.nativeElement as HTMLElement).querySelector('#section-inspector');
    expect(inspector?.textContent).toContain('Нормална балотажна мобилизация.');
    expect(inspector?.textContent).toContain('Промяна на кандидатския избор.');
    fixture.destroy();
    http.verify();
  });

  it.each(['query1', 'query2'])('defaults %s to all districts and shares district filters between map, totals and section table', query => {
    const fixture = setup(query);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const report = reportFixture();
    report.regions = Array.from({ length: 31 }, (_, index) => groupFixture({ key: String(index + 1), name: `Район ${index + 1}` }));
    report.query1.regions = report.regions;
    report.query2.regions = report.regions;
    http.expectOne('/data/forensics/2026/report.json').flush(report);
    const rows = [sectionFixture(), sectionFixture({ sectionId: '010100001', regionId: '1', priority: false }),
      sectionFixture({ sectionId: '010100002', regionId: '1', priority: false, small400: false })];
    http.expectOne('/data/forensics/2026/sections.json').flush(rows);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const selector = element.querySelector('select[aria-label="Филтър по изборен район"]') as HTMLSelectElement;
    expect(selector.options.length).toBe(32);
    expect(selector.value).toBe('');
    expect(fixture.componentInstance.filtered().length).toBe(query === 'query1' ? 3 : 2);
    selector.value = '1';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const expected = rows.filter(row => row.regionId === '1' && (query !== 'query2' || row.small400));
    expect(fixture.componentInstance.filtered()).toEqual(expected);
    expect(fixture.debugElement.query(By.directive(MapStub)).componentInstance.rows).toEqual(expected);
    expect(element.querySelectorAll('#geography > .table-scroll tbody tr').length).toBe(expected.length);
    expect(fixture.componentInstance.totals().voted1).toBe(expected.reduce((sum, row) => sum + row.voted1!, 0));
    expect(element.textContent).not.toContain('Четирите приоритетни области');
    fixture.destroy();
    http.verify();
  });

  it('uses labelled icon download controls and focusable bounded table regions', () => {
    const fixture = setup();
    fixture.componentInstance.report.set(reportFixture());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    for (const control of element.querySelectorAll('a[download]')) {
      expect(control.hasAttribute('hlmBtn')).toBe(true);
      expect(control.getAttribute('aria-label')).toBeTruthy();
      expect(control.getAttribute('title')).toBeTruthy();
      expect(control.querySelector('svg')).not.toBeNull();
    }
    const nationalCsv = element.querySelector('a[href$="/sections.csv"]');
    expect(nationalCsv?.getAttribute('aria-label')).toContain('независимо от филтрите');
    for (const region of element.querySelectorAll<HTMLElement>('.table-scroll')) {
      expect(region.tabIndex).toBe(0);
      expect(region.getAttribute('role')).toBe('region');
      expect(region.getAttribute('aria-label')).toBeTruthy();
      const height = Number.parseFloat(getComputedStyle(region).maxHeight);
      expect(height).toBeGreaterThanOrEqual(360);
      expect(height).toBeLessThanOrEqual(420);
    }
    fixture.destroy();
  });

  it('keeps the overview independent of filters and resets the small-section view to its eligible cohort', () => {
    const fixture = setup('query2');
    const page = fixture.componentInstance;
    const candidateChanges = [candidateFixture('4', 20, 50), candidateFixture('25', 30, 90)];
    page.sections.set([
      sectionFixture({ candidateChanges }), sectionFixture({ sectionId: '010100001', regionId: '1', candidateChanges }),
      sectionFixture({ sectionId: '010100002', regionId: '1', small400: false, candidateChanges }),
      sectionFixture({ sectionId: '010100003', regionId: '1', eligible: false, candidateChanges }),
    ]);
    page.setFilter('regionId', '1');
    expect(page.jointTotals().n).toBe(1);
    expect(page.overviewTotals().n).toBe(2);
    page.setFilter('comparableOnly', false);
    page.setFilter('flaggedOnly', true);
    page.sort('candidate25Delta');
    page.page.set(2);
    expect(page.activeFilterCount()).toBe(3);
    page.resetFilters();
    expect(page.filters()).toMatchObject({ focus: true, comparableOnly: true, flaggedOnly: false, regionId: '', sort: 'candidate25Delta' });
    expect(page.filtered()).toHaveLength(2);
    expect(page.page()).toBe(0);
    expect(page.activeFilterCount()).toBe(0);
    fixture.destroy();
  });

  it('starts with core section columns and restores visible sorting when details are collapsed', () => {
    const fixture = setup();
    const page = fixture.componentInstance;
    page.report.set(reportFixture());
    fixture.detectChanges();
    const table = () => (fixture.nativeElement as HTMLElement).querySelector('#section-results-table')!;
    expect(table().querySelectorAll('thead th')).toHaveLength(6);
    page.toggleSectionDetails();
    fixture.detectChanges();
    expect(table().querySelectorAll('thead th')).toHaveLength(13);
    page.sort('registered1');
    page.page.set(2);
    page.toggleSectionDetails();
    fixture.detectChanges();
    expect(table().querySelectorAll('thead th')).toHaveLength(6);
    expect(page.filters()).toMatchObject({ sort: 'deltaTurnoutPp', descending: true });
    expect(page.page()).toBe(0);
    fixture.destroy();
  });

  it('highlights the section below the sticky navigation when the previous section is still visible', () => {
    let frame: FrameRequestCallback = () => {};
    let updateNavigation: () => void = () => {};
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: () => void) { updateNavigation = callback; }
      observe() {}
      disconnect() {}
    });
    const fixture = setup();
    try {
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/data/forensics/2026/report.json').flush(reportFixture());
      http.expectOne('/data/forensics/2026/sections.json').flush([]);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      vi.spyOn(element.querySelector('.section-nav')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 64, 100, 56));
      const sections = [...element.querySelectorAll('section[id]')];
      sections.forEach((section, index) => {
        const top = index < 4 ? -800 + index * 200 : 128 + (index - 4) * 400;
        vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 100, 400));
      });
      frame(0);
      updateNavigation();
      expect(fixture.componentInstance.activeSection()).toBe('candidate-checks');
      const hypotheses = element.querySelector('#hypotheses')!;
      vi.mocked(hypotheses.getBoundingClientRect).mockReturnValue(new DOMRect(0, 128, 100, 400));
      updateNavigation();
      expect(fixture.componentInstance.activeSection()).toBe('candidate-checks');
      http.verify();
    } finally {
      fixture.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('keeps joint counts paired and candidate-screen and added-voter checks visibly separate', () => {
    const fixture = setup('query2');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const report = reportFixture();
    const row = sectionFixture({ candidateChanges: [candidateFixture('4', 20, 50), candidateFixture('25', 30, 90)],
      added1: 100, added2: 2, addedPer100Voters1: 111.11, addedPer100Voters2: 1.18,
      addedReviewFlags: ['2026.10.25:added_exceed_signed'], candidateReviewFlags: ['joint_turnout_growth_yotova_gain_larger'] });
    const summary: CandidateAnalysisSummary = { eligibleSections: 1, usableSections: 1, excludedZeroFinalistSections: 0,
      stableListSections: 1, candidates: [], deltaVoted: 80,
      screen: { definition: 'Пълна извадка.', sections: 3, yotovaGain: 180, gyurovGain: 90, deltaVoted: 240,
        yotovaDominantSections: 3, gyurovDominantSections: 0, tiedSections: 0 },
      stableList: { eligibleSections: 1, usableSections: 1, excludedZeroFinalistSections: 0, candidates: [], deltaVoted: 80,
        screen: { definition: 'Стабилна извадка.', sections: 1, yotovaGain: 60, gyurovGain: 30, deltaVoted: 80,
          yotovaDominantSections: 1, gyurovDominantSections: 0, tiedSections: 0 } } };
    report.query2.candidateAnalysis = { summary, hypotheses: [], methodology: {} };
    report.query2.candidateReview = [{ sectionId: row.sectionId, regionName: 'Видин', municipalityName: 'Белоградчик', settlementName: 'Рабиша',
      candidateChanges: row.candidateChanges, deltaTurnoutPp: row.deltaTurnoutPp, deltaVoted: row.deltaVoted, candidateReviewFlags: row.candidateReviewFlags! }];
    report.query2.addedElectorReview = [{ sectionId: '050100002', regionName: 'Видин', municipalityName: 'Белоградчик', settlementName: 'Рабиша',
      added1: 100, added2: 2, voted1: 90, voted2: 170, addedPer100Voters1: 111.11, addedPer100Voters2: 1.18,
      deltaAdded: -98, addedReviewFlags: ['2026.10.25:added_exceed_signed'], eligible: false }];
    http.expectOne('/data/forensics/2026/report.json').flush(report);
    http.expectOne('/data/forensics/2026/sections.json').flush([row, sectionFixture({ sectionId: '050100002', eligible: false,
      candidateChanges: [candidateFixture('4', 1, 1000), candidateFixture('25', 1, 1000)] })]);
    fixture.componentInstance.setFilter('comparableOnly', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.filtered()).toHaveLength(2);
    expect(fixture.componentInstance.jointTotals().n).toBe(1);
    expect(fixture.componentInstance.jointTotals().deltaVoted).toBe(80);
    const element = fixture.nativeElement as HTMLElement;
    const totals = element.querySelector('[data-joint-totals]');
    expect(totals?.textContent).toContain('+30');
    expect(totals?.textContent).toContain('+60');
    expect(element.querySelector('#candidate-checks')?.textContent).toContain('Стабилна извадка.');
    expect(element.querySelector('[aria-label="Протоколни проверки за дописани избиратели"] tbody')?.textContent).toContain('050100002');
    expect(element.querySelector('[aria-label="Протоколни проверки за дописани избиратели"] tbody')?.textContent).toContain('Не');
    expect(element.querySelectorAll('.section-nav a a')).toHaveLength(0);
    http.verify(); fixture.destroy();
  });
});
