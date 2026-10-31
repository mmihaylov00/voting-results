import { TableControlsComponent, TableColumns } from '../ui/table-controls/table-controls';
import { SelectComponent, SelectOption } from '../ui/select/select';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, ChangeDetectionStrategy } from '@angular/core';
import { RegionCandidate, Section } from '../../models/election.models';
import {
  ContestantDetailElection, ContestantGeographyLevel, ContestantGeographyRow,
  ContestantPreferenceRow, ContestantSectionRow, contestantGeography,
  contestantGeographyIdentity, contestantPreferences, contestantSectionRows,
} from '../../utils/contestant-profile.util';
import { difference, indexSections, matchHistoricalSection, percent } from '../../utils/election-comparison.util';
import { aggregateSectionsBySettlement, SettlementAggregate } from '../../utils/settlement-map.util';
import { MapExportContext } from '../../utils/map-interaction.util';
import { AbroadMapComponent } from '../ui/abroad-map/abroad-map';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { RiskBadgeComponent } from '../ui/risk-badge/risk-badge';
import { SearchFilterComponent } from '../ui/search-filter/search-filter';
import { SettlementMapComponent, SettlementMapLevel } from '../ui/settlement-map/settlement-map';
import { ContestantPreviewDirective } from '../ui/contestant-preview/contestant-preview.directive';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { CsvExportButtonComponent } from '../ui/csv-export-button/csv-export-button';
import { CsvExportData, createCsv } from '../../utils/csv-export.util';
import { CsvExportModalComponent } from '../ui/csv-export-modal/csv-export-modal';
import {
  HlmTableDirective, HlmTableHeaderDirective, HlmTableBodyDirective,
  HlmTableRowDirective, HlmTableHeadDirective, HlmTableCellDirective,
} from '../ui/table-helm/src/lib/hlm-table.directives';

type PanelTab = 'geography' | 'sections' | 'risks' | 'candidates';
type SortKey = 'date' | 'label' | 'votes' | 'share' | 'paper' | 'machine' | 'region' | 'voteChange' | 'shareChange' | 'sectionCount' | 'preferencesShare' | 'signals';
type ElectionLabel = { date: string; electionName: string; partyId: string; fullName: string };
type Change = { baselineDate: string | null; voteChange: number | null; shareChange: number | null };
type SectionRow = ContestantSectionRow & ElectionLabel & Change;
type GeographyRow = ContestantGeographyRow & ElectionLabel & Change;
type PreferenceRow = ContestantPreferenceRow & ElectionLabel;
type RiskSummary = ElectionLabel & {
  assessed: number; unavailable: number; flagged: number; common: number; specific: number;
  flaggedVotes: number; exposure: number | null;
};
type RecurringRow = { date: string; section: Section; flagged: number; assessed: number; unavailable: number; codes: string[] };

@Component({
  selector: 'app-contestant-profile-panels',
  standalone: true,
  imports: [TableControlsComponent, SelectComponent, CommonModule, HlmButtonDirective, SearchFilterComponent,
    RiskBadgeComponent, SettlementMapComponent, AbroadMapComponent, ContestantPreviewDirective,
    SortableTableHeaderComponent, VirtualTableDirective, CsvExportButtonComponent, CsvExportModalComponent, HlmTableDirective, HlmTableHeaderDirective, HlmTableBodyDirective,
    HlmTableRowDirective, HlmTableHeadDirective, HlmTableCellDirective],
  templateUrl: './contestant-profile-panels.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './contestant-profile-panels.scss',
})
export class ContestantProfilePanelsComponent implements OnChanges {
  private static nextId = 0;
  @Input({ required: true }) elections: ContestantDetailElection[] = [];
  @Input({ required: true }) tab: PanelTab = 'sections';
  @Input() presidential = false;
  @Input() preference = false;
  @Output() openSection = new EventEmitter<{ date: string; section: Section }>();
  @Output() openCandidate = new EventEmitter<{ date: string; candidate: RegionCandidate; sections: Section[] }>();

  readonly searchInputId = `contestant-profile-search-${++ContestantProfilePanelsComponent.nextId}`;
  readonly geographyLevels: { id: ContestantGeographyLevel; name: string }[] = [
    { id: 'region', name: 'Райони' }, { id: 'municipality', name: 'Общини' },
    { id: 'settlement', name: 'Населени места' }, { id: 'country', name: 'Чужбина' },
  ];
  readonly geographyOptions: SelectOption<ContestantGeographyLevel>[] = this.geographyLevels.map(option => ({
    value: option.id, label: option.name, icon: option.id === 'country' ? 'globe' : option.id,
  }));
  readonly riskOptions: SelectOption[] = [
    { value: 'all', label: 'Всички секции', icon: 'section' }, { value: 'flagged', label: 'С рискови индикатори', icon: 'risks' },
    { value: 'clear', label: 'Оценени без индикатори', icon: 'check' }, { value: 'unavailable', label: 'Без оценка', icon: 'no-votes' },
  ];
  level: ContestantGeographyLevel = 'region';
  search = '';
  riskFilter = 'all';
  sortKey: SortKey = 'votes';
  ascending = false;
  readonly csvExportAction = () => this.exportCsv();
  csvExportData: CsvExportData | null = null;
  sectionRows: SectionRow[] = [];
  geographyRows: GeographyRow[] = [];
  preferenceRows: PreferenceRow[] = [];
  filteredSections: SectionRow[] = [];
  filteredGeography: GeographyRow[] = [];
  filteredPreferences: PreferenceRow[] = [];
  riskSummaries: RiskSummary[] = [];
  recurring: RecurringRow[] = [];
  readonly riskSummaryColumns: TableColumns<RiskSummary> = {
    election: row => `${row.date} ${row.electionName}`, assessed: row => row.assessed, unavailable: row => row.unavailable,
    flagged: row => row.flagged, common: row => row.common, specific: row => row.specific,
    votes: row => row.flaggedVotes, exposure: row => row.exposure,
  };
  readonly recurringColumns: TableColumns<RecurringRow> = {
    section: row => `${row.section.sectionId} ${row.section.cityName} ${row.section.regionName ?? ''} ${row.date}`,
    flagged: row => row.flagged, assessed: row => row.assessed, unavailable: row => row.unavailable, codes: row => row.codes.join(', '),
  };
  settlements: SettlementAggregate[] = [];
  mapParties: Record<string, string> = {};
  partiesByDate: Record<string, Record<string, string>> = {};
  mapExportContext: MapExportContext | null = null;
  missingMunicipalities = 0;

  get votesLabel(): string { return this.preference ? 'Преференции' : 'Гласове'; }
  get shareLabel(): string { return this.preference ? 'Дял от партийните гласове' : 'Дял от гласувалите'; }
  get voteChangeLabel(): string { return this.preference ? 'Промяна преференции' : 'Промяна гласове'; }

  get mapElection(): ContestantDetailElection | null { return this.elections.length === 1 ? this.elections[0] : null; }
  get mapView(): SettlementMapLevel {
    return this.level === 'municipality' ? 'municipalities' : this.level === 'settlement' ? 'cities' : 'regions';
  }
  get rowCount(): number {
    return this.tab === 'geography' ? this.filteredGeography.length
      : this.tab === 'candidates' ? this.filteredPreferences.length : this.filteredSections.length;
  }

  ngOnChanges(): void {
    this.partiesByDate = Object.fromEntries(this.elections.map(election => [election.participation.date,
      { [election.participation.partyId]: election.participation.fullName }]));
    if (this.tab === 'geography') this.updateGeography();
    if (this.tab === 'sections' || this.tab === 'risks') {
      this.sectionRows = this.elections.flatMap(election => this.sectionsWithChanges(election));
      if (this.tab === 'risks') this.updateRisks();
    }
    if (this.tab === 'candidates') {
      this.preferenceRows = this.elections.flatMap(election => contestantPreferences(
        election.sections, election.participation.partyId, election.participation.fullName,
      ).map(row => ({ ...row, ...this.label(election) })));
    }
    this.filterRows();
  }

  setLevel(): void { this.updateGeography(); this.filterRows(); }
  setSearch(value: string): void { this.search = value; this.filterRows(); }
  sort(key: SortKey): void {
    this.ascending = this.sortKey === key ? !this.ascending : ['label', 'date', 'region', 'signals'].includes(key);
    this.sortKey = key;
    this.filterRows();
  }
  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey === key ? this.ascending ? 'ascending' : 'descending' : 'none';
  }

  filterRows(): void {
    const query = this.search.trim().toLocaleLowerCase('bg');
    const matches = (...values: string[]) => !query || values.join(' ').toLocaleLowerCase('bg').includes(query);
    this.filteredSections = this.sortRows(this.sectionRows.filter(row => matches(row.electionName, row.date,
      row.section.sectionId, row.section.regionName ?? '', row.section.municipalityName ?? '', row.section.cityName, row.section.sectionName)
      && (this.tab !== 'risks' || !!row.risks?.length)
      && (this.tab !== 'sections' || this.riskFilter === 'all' || this.riskFilter === 'flagged' && !!row.risks?.length
        || this.riskFilter === 'unavailable' && row.risks === null
        || this.riskFilter === 'clear' && row.risks !== null && row.risks.length === 0)), row => ({
      date: row.date, label: `${row.section.cityName} ${row.section.sectionId}`,
      votes: row.votes, share: row.share, paper: row.paper, machine: row.machine,
      voteChange: row.voteChange, shareChange: row.shareChange, signals: row.risks?.map(risk => risk.code).join(', ') ?? null,
    }));
    this.filteredGeography = this.sortRows(this.geographyRows.filter(row => matches(row.name, row.electionName, row.date)), row => ({
      date: row.date, label: row.name, votes: row.votes, share: row.share, paper: row.paper, machine: row.machine,
      voteChange: row.voteChange, shareChange: row.shareChange, sectionCount: row.sectionCount,
    }));
    this.filteredPreferences = this.sortRows(this.preferenceRows.filter(row => matches(row.candidateName,
      row.candidateId, row.regionName, row.regionId, row.electionName, row.date)), row => ({
      date: row.date, label: row.candidateName, votes: row.total,
      share: row.shareOfPartyVotes, paper: row.paper, machine: row.machine, region: row.regionName, preferencesShare: row.shareOfPreferences,
    }));
  }

  selectCandidate(row: PreferenceRow): void {
    const election = this.elections.find(item => item.participation.date === row.date);
    if (election) this.openCandidate.emit({ date: row.date, candidate: row,
      sections: election.sections.filter(section => section.regionId === row.regionId) });
  }

  sectionsCsv(): string {
    const data = this.sectionCsvData();
    return createCsv([data.headers, ...data.rows]);
  }

  private sectionCsvData(): Pick<CsvExportData, 'headers' | 'rows'> {
    return {
      headers: ['Избори', 'Дата', this.preference ? 'Кандидат' : 'Партия/кандидат', 'Секция', 'Район', 'Община/държава', 'Населено място', this.votesLabel, `${this.shareLabel} %`, 'Базови избори', this.voteChangeLabel, 'Промяна дял п.п.', 'Хартиени', 'Машинни', 'Рискови индикатори'],
      rows: this.filteredSections.map(row => [row.electionName, row.date, row.fullName, row.section.sectionId,
        row.section.regionName ?? row.section.regionId, row.section.municipalityName ?? '', row.section.cityName,
        row.votes, row.share, row.baselineDate, row.voteChange, row.shareChange, row.paper, row.machine,
        row.risks === null ? 'Няма оценка' : row.risks.map(risk => risk.code).join(', ')]),
    };
  }

  exportCsv(): void {
    if (!this.rowCount) return;
    const table = this.tab === 'geography' ? {
        headers: ['Избори', 'Дата', 'Място', this.votesLabel, `${this.shareLabel} %`, 'Базови избори', this.voteChangeLabel, 'Промяна дял п.п.', 'Секции'],
        rows: this.filteredGeography.map(row => [row.electionName, row.date, row.name, row.votes, row.share,
          row.baselineDate, row.voteChange, row.shareChange, row.sectionCount]),
      } : this.tab === 'candidates' ? {
        headers: ['Избори', 'Дата', 'Район', 'Кандидат', 'Номер', 'Преференции', 'Дял от партийните гласове в района %', 'Дял от партийните преференции в района %'],
        rows: this.filteredPreferences.map(row => [row.electionName, row.date, row.regionName, row.candidateName,
          row.candidateId, row.total, row.shareOfPartyVotes, row.shareOfPreferences]),
      } : this.sectionCsvData();
    this.csvExportData = { ...table, filename: `profile-${this.tab}-${this.elections.length === 1 ? this.elections[0].participation.date : 'all'}.csv` };
  }

  private updateGeography(): void {
    this.missingMunicipalities = this.elections.reduce((sum, election) => sum + election.sections
      .filter(section => section.regionId !== '32' && !section.municipalityName).length, 0);
    this.geographyRows = this.elections.flatMap(election => {
      const sections = this.geographySections(election);
      const baseline = this.baseline(election);
      const previousSections = baseline ? this.geographySections(baseline) : [];
      const previousRows = new Map(baseline ? contestantGeography(previousSections, baseline.participation.partyId, this.level)
        .map(row => [row.id, row]) : []);
      const currentGroups = this.geographyGroups(sections);
      const previousGroups = this.geographyGroups(previousSections);
      return contestantGeography(sections, election.participation.partyId, this.level).map(row => {
        const previous = previousRows.get(row.id);
        const covered = !!previous && this.completeCoverage(currentGroups.get(row.id) ?? [], previousGroups.get(row.id) ?? []);
        return { ...row, ...this.label(election), baselineDate: baseline?.participation.date ?? null,
          voteChange: covered ? difference(row.votes, previous.votes) : null,
          shareChange: covered ? difference(row.share, previous.share) : null };
      });
    });
    const single = this.mapElection;
    this.mapParties = single ? { [single.participation.partyId]: single.participation.fullName } : {};
    this.mapExportContext = single ? { election: single.participation.name,
      metricLabel: `Дял на ${single.participation.fullName} ${this.preference ? 'от партийните гласове' : 'от гласувалите'}`, place: 'Всички райони' } : null;
    this.settlements = single ? aggregateSectionsBySettlement(single.sections, this.mapParties) : [];
  }

  private baseline(election: ContestantDetailElection): ContestantDetailElection | undefined {
    return this.elections.filter(previous => previous.participation.date < election.participation.date
      && previous.participation.type === election.participation.type
      && previous.participation.round === election.participation.round && !previous.participation.provisional)
      .sort((left, right) => right.participation.date.localeCompare(left.participation.date))[0];
  }

  private sectionsWithChanges(election: ContestantDetailElection): SectionRow[] {
    const baseline = this.baseline(election);
    const previousSections = indexSections(baseline?.sections ?? []);
    const currentSections = indexSections(election.sections);
    return contestantSectionRows(election.sections, election.participation.partyId).map(row => {
      const current = matchHistoricalSection(row.section, currentSections);
      const previous = current && matchHistoricalSection(row.section, previousSections);
      const votes = previous && baseline ? previous.partyVotes[baseline.participation.partyId]?.total ?? 0 : null;
      return { ...row, ...this.label(election), baselineDate: baseline?.participation.date ?? null,
        voteChange: difference(row.votes, votes),
        shareChange: previous && votes !== null ? difference(row.share, percent(votes, previous.voted)) : null };
    });
  }

  private geographySections(election: ContestantDetailElection): Section[] {
    return this.level === 'municipality' ? election.sections.filter(section => !!section.municipalityName) : election.sections;
  }

  private geographyGroups(sections: Section[]): Map<string, Section[]> {
    const groups = new Map<string, Section[]>();
    for (const section of sections) {
      const place = contestantGeographyIdentity(section, this.level);
      if (!place) continue;
      const group = groups.get(place.id) ?? [];
      group.push(section);
      groups.set(place.id, group);
    }
    return groups;
  }

  private completeCoverage(current: Section[], previous: Section[]): boolean {
    if (!current.length || current.length !== previous.length) return false;
    const currentIndex = indexSections(current);
    const previousIndex = indexSections(previous);
    return currentIndex.size === current.length && previousIndex.size === previous.length
      && current.every(section => !!matchHistoricalSection(section, previousIndex));
  }

  private updateRisks(): void {
    const rowsByDate = new Map<string, SectionRow[]>();
    for (const row of this.sectionRows) {
      const rows = rowsByDate.get(row.date) ?? [];
      rows.push(row);
      rowsByDate.set(row.date, rows);
    }
    this.riskSummaries = this.elections.map(election => {
      const rows = rowsByDate.get(election.participation.date) ?? [];
      const flagged = rows.filter(row => !!row.risks?.length);
      const flaggedVotes = flagged.reduce((sum, row) => sum + row.votes, 0);
      return { ...this.label(election), assessed: rows.filter(row => row.risks !== null).length,
        unavailable: rows.filter(row => row.risks === null).length, flagged: flagged.length,
        common: flagged.filter(row => row.risks!.some(risk => risk.details?.partyId == null)).length,
        specific: flagged.filter(row => row.risks!.some(risk => risk.details?.partyId != null)).length,
        flaggedVotes, exposure: percent(flaggedVotes, election.participation.votes) };
    });
    this.recurring = this.recurringRows(rowsByDate);
  }

  private recurringRows(rowsByDate: Map<string, SectionRow[]>): RecurringRow[] {
    const recurring: RecurringRow[] = [];
    const rounds = new Set(this.elections.map(election => election.participation.round));
    for (const round of rounds) {
      const elections = this.elections.filter(election => election.participation.round === round)
        .sort((left, right) => right.participation.date.localeCompare(left.participation.date));
      const latest = elections[0];
      if (!latest || elections.length < 2) continue;
      const indexed = elections.map(election => ({
        date: election.participation.date, sections: indexSections(election.sections),
        rows: new Map((rowsByDate.get(election.participation.date) ?? []).map(row => [row.section, row])),
      }));
      for (const section of latest.sections) {
        let assessed = 0;
        let flagged = 0;
        const codes = new Set<string>();
        for (const election of indexed) {
          const matched = matchHistoricalSection(section, election.sections);
          const row = matched && election.rows.get(matched);
          if (!row || row.risks === null) continue;
          assessed++;
          if (row.risks.length) {
            flagged++;
            row.risks.forEach(risk => codes.add(risk.code));
          }
        }
        if (flagged >= 2) recurring.push({ date: latest.participation.date, section, assessed,
          flagged, unavailable: elections.length - assessed, codes: [...codes].sort() });
      }
    }
    return recurring.sort((left, right) => right.flagged - left.flagged || left.section.sectionId.localeCompare(right.section.sectionId));
  }

  private label(election: ContestantDetailElection): ElectionLabel {
    const participation = election.participation;
    return { date: participation.date, electionName: participation.name,
      partyId: participation.partyId, fullName: participation.fullName };
  }

  private sortRows<T>(rows: T[], values: (row: T) => Partial<Record<SortKey, string | number | null>>): T[] {
    const direction = this.ascending ? 1 : -1;
    return rows.sort((left, right) => {
      const leftValues = values(left);
      const rightValues = values(right);
      if (this.sortKey !== 'date' && leftValues.date !== rightValues.date) {
        return String(rightValues.date).localeCompare(String(leftValues.date));
      }
      const a = leftValues[this.sortKey];
      const b = rightValues[this.sortKey];
      if (a == null || b == null) return Number(a == null) - Number(b == null);
      return direction * (typeof a === 'number' && typeof b === 'number' ? a - b
        : String(a).localeCompare(String(b), 'bg', { numeric: true }));
    });
  }

}
