import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ModalPageService } from '../../../../services/modal-page.service';
import { ExportCsvModalComponent } from './export-csv-modal';
import { RegionCandidate, Section } from '../../../../models/election.models';
import { By } from '@angular/platform-browser';
import { PartyFilterComponent } from '../../party-filter/party-filter';

const section: Section = { sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище',
  sectionType: 'City', total: 100, voted: 80, discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 8000,
  partyVotes: { '1': { total: 40, paper: 30, machine: 10 } } };

function setup(rows = [section]) {
  TestBed.configureTestingModule({ imports: [ExportCsvModalComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ExportCsvModalComponent);
  fixture.componentRef.setInput('tableSections', rows);
  const closePage = vi.spyOn(TestBed.inject(ModalPageService), 'close');
  const closed = vi.fn(); fixture.componentInstance.close.subscribe(closed);
  const download = vi.spyOn(fixture.componentInstance, 'downloadCsv').mockImplementation(() => {});
  return { fixture, component: fixture.componentInstance, closePage, closed, download };
}

describe('Export modal page navigation', () => {
  it.each(['Отказ', 'Експорт CSV'])('closes the page URL when using %s', async label => {
    const { fixture, closePage, closed, download } = setup();
    await fixture.whenStable();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(button => button.textContent?.trim() === label)!;
    button.click();
    await fixture.whenStable();
    expect(closePage).toHaveBeenCalledWith('export');
    expect(closed).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledTimes(label === 'Отказ' ? 0 : 1);
  });

  it('disables empty exports without downloading or closing the dialog', async () => {
    const { fixture, closePage, closed, download } = setup([]);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('app-csv-export-button button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click(); await fixture.whenStable();
    expect(download).not.toHaveBeenCalled();
    expect(closePage).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it('keeps the dialog open after a failed download and closes only after a successful retry', async () => {
    const { fixture, closePage, closed, download } = setup();
    download.mockImplementationOnce(() => { throw new Error('blocked'); });
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('app-csv-export-button button') as HTMLButtonElement;
    button.click(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Файлът не може да бъде изтеглен');
    expect(closePage).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    button.click(); await fixture.whenStable();
    expect(closePage).toHaveBeenCalledExactlyOnceWith('export');
    expect(closed).toHaveBeenCalledOnce();
  });

  it('exports every current section with selected columns, safe text and the shared CSV format', () => {
    const component = new ExportCsvModalComponent();
    component.tableSections = Array.from({ length: 128 }, (_, index) => ({ ...section, sectionId: String(index).padStart(9, '0'), cityName: '=SUM(1,2)' }));
    component.exportColumnIds = new Set(['sectionId', 'cityName', 'voted']);
    const csv = component.generateCsv({ '1': 'ГЕРБ-СДС' });
    expect(csv.startsWith('\uFEFF"Секция","Населено място","Гласували","ГЕРБ-СДС"\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(129);
    expect(csv).toContain('"000000127","\'=SUM(1,2)","80","40"');
    component.tableSections = [section];
    expect(component.exportCount).toBe(1);
    expect(component.generateCsv({}).split('\r\n')).toHaveLength(2);
  });

  it('preserves selected candidate fields, party labels and preference values in the same CSV format', () => {
    const component = new ExportCsvModalComponent();
    const candidate: RegionCandidate = { candidateId: '101', candidateName: 'Иван "Иво", Иванов', partyId: '1', partyName: 'ГЕРБ-СДС',
      total: 128, paper: 80, machine: 48, totalInRegion: 128, partyPercentInRegion: 25, preferencePercentOfPartyVotes: 12.5 };
    component.viewMode = 'candidates';
    component.filteredCandidates = [candidate];
    component.exportPartyIds = new Set(['1']);
    component.exportCandidateColumnIds = new Set(['candidateName', 'partyName', 'totalInRegion', 'preferencePercentOfPartyVotes']);
    const csv = component.generateCandidatesCsv();
    expect(csv.startsWith('\uFEFF"Име","Партия","Преференции","% от гласовете за партията"\r\n')).toBe(true);
    expect(csv).toContain('"Иван ""Иво"", Иванов","ГЕРБ-СДС","128","12.50%"');
    expect(component.exportCount).toBe(1);
  });

  it('offers party selection for candidate exports and applies it to the row count and file', async () => {
    const { fixture, component, download } = setup();
    const candidate = (partyId: string): RegionCandidate => ({
      candidateId: '101', candidateName: `Кандидат ${partyId}`, partyId, partyName: `Партия ${partyId}`,
      total: 10, paper: 5, machine: 5, totalInRegion: 10, partyPercentInRegion: 10, preferencePercentOfPartyVotes: 10,
    });
    fixture.componentRef.setInput('viewMode', 'candidates');
    fixture.componentRef.setInput('filteredCandidates', [candidate('1'), candidate('2')]);
    fixture.componentRef.setInput('allParties', [{ id: '1', name: 'Партия 1' }, { id: '2', name: 'Партия 2' }]);
    await fixture.whenStable();
    expect(component.exportCount).toBe(2);
    const picker = fixture.debugElement.query(By.directive(PartyFilterComponent)).componentInstance as PartyFilterComponent;
    picker.selectedPartyIdsChange.emit(new Set(['2']));
    await fixture.whenStable();
    expect(component.exportCount).toBe(1);
    expect(component.generateCandidatesCsv()).toContain('Кандидат 2');
    expect(component.generateCandidatesCsv()).not.toContain('Кандидат 1');
    picker.selectedPartyIdsChange.emit(new Set());
    await fixture.whenStable();
    expect(component.exportCount).toBe(0);
    expect((fixture.nativeElement.querySelector('app-csv-export-button button') as HTMLButtonElement).disabled).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  it('includes targeting and top-preference columns instead of silently dropping their selections', () => {
    const component = new ExportCsvModalComponent();
    const candidate = (id: string, total: number) => ({ candidateId: id, candidateName: `Кандидат ${id}`, partyId: '1', partyName: 'ГЕРБ-СДС', total, paper: total, machine: 0 });
    component.exportColumnIds = new Set(['votesToFirst', 'topCandidates']);
    component.tableSections = [{ ...section, votesToFirst: 0, candidateVotes: {
      '1_101': candidate('101', 3), '1_102': candidate('102', 8), '1_103': candidate('103', 0),
      '1_104': candidate('104', 10), '1_105': candidate('105', 1),
    } }, { ...section, topCandidates: [{ candidateName: 'Обобщен кандидат', partyId: '1', partyName: 'ГЕРБ-СДС', total: 25 }] }];
    expect(component.generateCsv({})).toBe('\uFEFF"Нужни","Топ 3 преференции"\r\n"0","Кандидат 104 (ГЕРБ-СДС): 10; Кандидат 102 (ГЕРБ-СДС): 8; Кандидат 101 (ГЕРБ-СДС): 3"\r\n"","Обобщен кандидат (ГЕРБ-СДС): 25"');
  });
});
