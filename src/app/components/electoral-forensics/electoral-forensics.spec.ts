import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, RouterLink } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { ElectoralForensicsComponent } from './electoral-forensics';
import { ForensicsFinding, ForensicsGroup, ForensicsSection } from './forensics.models';
import { reportFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsHypothesesComponent } from './forensics-hypotheses';

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
    set: { imports: [CommonModule, FormsModule, RouterLink, ChartStub, MapStub, GroupStub, ForensicsHypothesesComponent] },
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
});
