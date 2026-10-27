import { Section } from '../../models/election.models';
import { Directive, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RegionCandidate } from '../../models/election.models';
import { ContestantDetailElection } from '../../utils/contestant-profile.util';
import { ContestantProfilePanelsComponent } from './contestant-profile-panels';
import { ContestantPreviewDirective } from '../ui/contestant-preview/contestant-preview.directive';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';

@Directive({ selector: '[appContestantPreview]' })
class PreviewStubDirective {
  @Input() appContestantPreview = '';
  @Input() contestantPreviewDate = '';
  @Input() contestantPreviewPartyId = '';
  @Input() contestantPreviewCandidate: RegionCandidate | null = null;
  @Input() contestantPreviewRegion = '';
}

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010010001', regionId: '1', regionName: 'Благоевград', cityName: 'Банско',
    municipalityName: 'Банско', settlementEkatte: '02676', sectionName: 'Училище', sectionType: 'normal',
    total: 100, voted: 50, discardedVotes: 0, noVotes: 0,
    partyVotes: { '2': { total: 20, paper: 10, machine: 10 } }, topParties: [], activityBp: 5000,
    ...overrides,
  };
}

function election(date: string, sections: Section[], overrides: Partial<ContestantDetailElection['participation']> = {}): ContestantDetailElection {
  return { participation: { date, name: date, type: 'governmental', partyId: '2', fullName: 'ГЕРБ-СДС',
    votes: sections.reduce((sum, item) => sum + (item.partyVotes['2']?.total ?? 0), 0),
    voted: sections.reduce((sum, item) => sum + item.voted, 0), share: 40, rank: 1, gapToLeader: 0,
    ...overrides }, sections };
}

describe('contestant profile detail panels', () => {
  it('uses projected candidate preferences and party-vote denominators in rows, labels, risks and exports', async () => {
    TestBed.configureTestingModule({ imports: [ContestantProfilePanelsComponent] });
    const fixture = TestBed.createComponent(ContestantProfilePanelsComponent);
    const projected = section({ voted: 20, partyVotes: {
      '2': { total: 20, paper: 10, machine: 10 }, preference: { total: 5, paper: 3, machine: 2 },
    }, riskIndicators: [{ code: 'R1.1', category: 'R1', severity: 'high' }] });
    fixture.componentRef.setInput('preference', true);
    fixture.componentRef.setInput('tab', 'risks');
    fixture.componentRef.setInput('elections', [election('2026.04.19', [projected], {
      partyId: 'preference', fullName: 'Иван Иванов', votes: 5, voted: 20, share: 25,
    })]);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(component.filteredSections[0]).toMatchObject({ votes: 5, paper: 3, machine: 2, share: 25 });
    expect(component.riskSummaries[0]).toMatchObject({ flaggedVotes: 5, exposure: 100 });
    const headers = [...fixture.nativeElement.querySelectorAll('th')].map(header => header.textContent?.trim());
    expect(headers).toContain('Преференции');
    expect(headers).toContain('Дял от партийните гласове');
    expect(headers).toContain('Преференции в секции със сигнали');
    expect(headers).toContain('Дял от преференциите');
    const csv = component.sectionsCsv();
    expect(csv).toContain('"Преференции","Дял от партийните гласове %"');
    expect(csv).not.toContain('Дял от гласувалите');
    component.tab = 'geography';
    component.ngOnChanges();
    expect(component.filteredGeography[0]).toMatchObject({ votes: 5, share: 25 });
    expect(component.mapExportContext?.metricLabel).toBe('Дял на Иван Иванов от партийните гласове');
  });

  it('binds candidate previews to their own election, district and existing preference statistics', async () => {
    TestBed.configureTestingModule({ imports: [ContestantProfilePanelsComponent] })
      .overrideComponent(ContestantProfilePanelsComponent, {
        remove: { imports: [ContestantPreviewDirective] }, add: { imports: [PreviewStubDirective] },
      });
    const fixture = TestBed.createComponent(ContestantProfilePanelsComponent);
    const candidate = { candidateId: '101', candidateName: 'Иван Иванов', partyId: '2', partyName: 'ГЕРБ-СДС', total: 5, paper: 3, machine: 2 };
    fixture.componentRef.setInput('tab', 'candidates');
    fixture.componentRef.setInput('elections', [election('2026.04.19', [section({ candidateVotes: { '2_101': candidate } })])]);
    await fixture.whenStable();
    const trigger = fixture.debugElement.query(By.directive(PreviewStubDirective));
    const preview = trigger.injector.get(PreviewStubDirective);
    expect(preview.appContestantPreview).toBe('Иван Иванов');
    expect(preview.contestantPreviewDate).toBe('2026.04.19');
    expect(preview.contestantPreviewPartyId).toBe('2');
    expect(preview.contestantPreviewRegion).toBe('Благоевград');
    expect(preview.contestantPreviewCandidate).toMatchObject({ total: 5, paper: 3, machine: 2 });
    const open = vi.spyOn(fixture.componentInstance.openCandidate, 'emit');
    trigger.nativeElement.click();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ date: '2026.04.19', candidate: preview.contestantPreviewCandidate }));
    const voteHeader = fixture.debugElement.queryAll(By.directive(SortableTableHeaderComponent))
      .find(header => header.injector.get(SortableTableHeaderComponent).columnKey === 'votes')!;
    voteHeader.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.ascending).toBe(true);
    voteHeader.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.ascending).toBe(false);
  });
  it('keeps election-labelled results separate and sorts within each election', () => {
    const component = new ContestantProfilePanelsComponent();
    component.elections = [election('2024.10.27', [section()]), election('2026.04.19', [section({
      partyVotes: { '2': { total: 5, paper: 5, machine: 0 } },
    })])];
    component.ngOnChanges();
    expect(component.filteredSections.map(row => [row.date, row.votes])).toEqual([
      ['2026.04.19', 5], ['2024.10.27', 20],
    ]);
    expect(component.filteredSections[0].voteChange).toBe(-15);
    expect(component.filteredSections[0].shareChange).toBe(-30);
    component.setSearch('2024.10.27');
    expect(component.rowCount).toBe(1);
  });

  it('preserves unassessed sections and ignores section filters in the risk tab', () => {
    const component = new ContestantProfilePanelsComponent();
    component.elections = [election('2026.04.19', [
      section(), section({ sectionId: '010010002', riskIndicators: [] }),
      section({ sectionId: '010010003', riskIndicators: [
        { code: 'R1.1', category: 'R1', severity: 'high' },
        { code: 'R2.1', category: 'R2', severity: 'medium', details: { partyId: '2' } },
        { code: 'R2.2', category: 'R2', severity: 'high', details: { partyId: '3' } },
      ] }),
    ])];
    component.riskFilter = 'clear';
    component.ngOnChanges();
    expect(component.filteredSections.map(row => row.section.sectionId)).toEqual(['010010002']);
    component.tab = 'risks';
    component.ngOnChanges();
    expect(component.filteredSections).toHaveLength(1);
    expect(component.riskSummaries[0]).toMatchObject({ assessed: 2, unavailable: 1, flagged: 1,
      common: 1, specific: 1, flaggedVotes: 20 });
    expect(component.riskSummaries[0].exposure).toBeCloseTo(100 / 3);
  });

  it('matches recurrence by settlement and round while keeping missing assessments separate', () => {
    const component = new ContestantProfilePanelsComponent();
    const flagged = section({ riskIndicators: [{ code: 'R1.1', category: 'R1', severity: 'high' }] });
    component.tab = 'risks';
    component.elections = [election('2021.11.14', [flagged], { type: 'presidential', round: 1 }),
      election('2026.10.25', [flagged], { type: 'presidential', round: 1 }),
      election('2016.11.06', [section()], { type: 'presidential', round: 1 }),
      election('2021.11.21', [flagged], { type: 'presidential', round: 2 })];
    component.ngOnChanges();
    expect(component.recurring).toHaveLength(1);
    expect(component.recurring[0]).toMatchObject({ flagged: 2, assessed: 2, unavailable: 1, date: '2026.10.25' });
    component.elections[1] = election('2026.10.25', [section({ ...flagged, settlementEkatte: '00014' })], { type: 'presidential', round: 1 });
    component.ngOnChanges();
    expect(component.recurring).toEqual([]);
  });

  it('requires complete area coverage and unchanged settlements for geographic changes', () => {
    const component = new ContestantProfilePanelsComponent();
    component.tab = 'geography';
    component.elections = [election('2024.10.27', [section()]), election('2026.04.19', [section({
      partyVotes: { '2': { total: 30, paper: 15, machine: 15 } },
    })])];
    component.ngOnChanges();
    expect(component.filteredGeography[0]).toMatchObject({ voteChange: 10, shareChange: 20, baselineDate: '2024.10.27' });
    component.elections[1].sections.push(section({ sectionId: '010010002' }));
    component.ngOnChanges();
    expect(component.filteredGeography[0]).toMatchObject({ voteChange: null, shareChange: null });
    component.elections[1].sections = [section({ settlementEkatte: '00014' })];
    component.ngOnChanges();
    expect(component.filteredGeography[0].voteChange).toBeNull();
  });

  it('does not use another presidential round or a preliminary snapshot as the baseline', () => {
    const component = new ContestantProfilePanelsComponent();
    component.elections = [election('2021.11.14', [section()], { type: 'presidential', round: 1 }),
      election('2021.11.21', [section()], { type: 'presidential', round: 2 }),
      election('2026.10.25', [section()], { type: 'presidential', round: 1, provisional: {
        sourceUrl: 'https://example.com', updatedAt: '2026-10-26', processedPercent: 90, reportedSections: 9, totalSections: 10,
      } }), election('2031.10.25', [section()], { type: 'presidential', round: 1 })];
    component.ngOnChanges();
    expect(component.filteredSections.find(row => row.date === '2021.11.21')?.baselineDate).toBeNull();
    expect(component.filteredSections.find(row => row.date === '2031.10.25')?.baselineDate).toBe('2021.11.14');
  });

  it('opens the correct candidate election and district with both preference denominators', () => {
    const component = new ContestantProfilePanelsComponent();
    component.tab = 'candidates';
    const candidate = { candidateId: '101', candidateName: 'Иван Иванов', partyId: '2', partyName: 'ГЕРБ-СДС', total: 5, paper: 3, machine: 2 };
    component.elections = [election('2026.04.19', [section({ candidateVotes: { '2_101': candidate } }),
      section({ regionId: '2', sectionId: '020010001', candidateVotes: { '2_101': { ...candidate, candidateName: 'Петър Петров' } } })])];
    component.ngOnChanges();
    const open = vi.spyOn(component.openCandidate, 'emit');
    const row = component.preferenceRows.find(item => item.regionId === '1')!;
    expect(row.shareOfPartyVotes).toBe(25);
    expect(row.shareOfPreferences).toBe(100);
    component.selectCandidate(row);
    expect(open).toHaveBeenCalledWith({ date: '2026.04.19', candidate: row,
      sections: [component.elections[0].sections[0]] });
  });

  it('exports filtered election-labelled rows with safe text and blank unavailable shares', () => {
    const component = new ContestantProfilePanelsComponent();
    component.elections = [election('2026.04.19', [section({ cityName: '=SUM(1,2)', voted: 0,
      sectionName: '"quoted"' })])];
    component.ngOnChanges();
    const csv = component.sectionsCsv();
    expect(csv).toContain('"2026.04.19"');
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"20","","","","","10","10","Няма оценка"');
    expect(csv).not.toContain('NaN');
  });
});
