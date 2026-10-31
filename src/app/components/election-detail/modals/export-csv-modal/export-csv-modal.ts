import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params } from '@angular/router';
import { RegionCandidate, Section, SECTION_COLUMNS, TableColumn, ViewMode } from '../../../../models/election.models';
import { getPartyAlias } from '../../../../utils/party-aliases';
import { formatActivity } from '../../../../utils/common.utils';
import { loadVisibleColumns } from '../../../../utils/column-visibility';
import { formatRiskMessage } from '../../../../utils/risk-message.util';
import { candidateRiskAppliesToSection } from '../../../../utils/risk-utils';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { PartyFilterComponent } from '../../party-filter/party-filter';
import { BaseModalComponent } from '../../../ui/base-modal/base-modal';
import { CsvExportButtonComponent } from '../../../ui/csv-export-button/csv-export-button';
import { createCsv, downloadCsvFile } from '../../../../utils/csv-export.util';
import { getTopCandidates } from '../../../../utils/election-utils';

@Component({
  selector: 'app-export-csv-modal',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTypographyDirective,
    PartyFilterComponent,
    BaseModalComponent,
    CsvExportButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './export-csv-modal.html'
})
export class ExportCsvModalComponent {
  @Input() pageQueryParams: Params = {};
  @Input() tableSections: Section[] = [];
  @Input() filteredCandidates: RegionCandidate[] = [];
  @Input() allParties: { id: string, name: string }[] = [];
  @Input() partyVotes: Record<string, number> = {};
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() initialCandidateColumnIds: Set<string> = new Set();
  @Input() viewMode: ViewMode = 'sections';
  @Input() date: string = '';
  @Input() regionName: string = '';
  @Input() isAbroadRegion = false;
  @Output() close = new EventEmitter<void>();

  readonly csvExportAction = () => this.downloadCsv();
  exportPartyIds: Set<string> = new Set();
  baseAvailableColumns = SECTION_COLUMNS.filter(c => c.id !== 'typeVotes' && c.id !== 'topParties');
  exportColumnIds: Set<string> = new Set(this.availableColumns.map(c => c.id));
  candidateAvailableColumns: TableColumn[] = [
    { id: 'candidateId', label: 'Номер' },
    { id: 'risks', label: 'Рискове' },
    { id: 'candidateName', label: 'Име' },
    { id: 'partyName', label: 'Партия' },
    { id: 'totalInRegion', label: 'Преференции' },
    { id: 'preferencePercentOfPartyVotes', label: '% от гласовете за партията' },
  ];
  exportCandidateColumnIds: Set<string> = new Set(this.candidateAvailableColumns.map(c => c.id));

  get municipalityLabel(): string {
    return this.isAbroadRegion ? 'Държава' : 'Община';
  }

  get availableColumns(): TableColumn[] {
    return this.baseAvailableColumns.map((column) => (
      column.id === 'municipalityName'
        ? { ...column, label: this.municipalityLabel }
        : column
    ));
  }

  ngOnInit() {
    this.exportPartyIds = new Set(this.viewMode === 'candidates' && !this.selectedPartyIds.size
      ? this.filteredCandidates.map(candidate => candidate.partyId) : this.selectedPartyIds);
    const visibleColumns = loadVisibleColumns(
      'visible_columns',
      this.availableColumns.map(column => column.id),
      'export columns'
    );
    if (visibleColumns) {
      this.exportColumnIds = visibleColumns;
    }

    if (this.initialCandidateColumnIds.size > 0) {
      const validCandidateColumns = Array.from(this.initialCandidateColumnIds)
        .filter(id => this.candidateAvailableColumns.some(c => c.id === id));
      if (validCandidateColumns.length > 0) {
        this.exportCandidateColumnIds = new Set(validCandidateColumns);
      }
    }
  }

  formatActivity = formatActivity;
  getPartyAlias = getPartyAlias;

  private getPartiesById(): { [id: string]: string } {
    const map: { [id: string]: string } = {};
    this.allParties.forEach(p => {
      map[p.id] = p.name;
    });
    return map;
  }

  private getSectionAllRiskIndicators(section: Section | any): Array<{ code: string; category: string; severity: string; details?: any }> {
    const sectionRisks = section?.riskIndicators || [];
    const candidateRisks = ((section as any)?.candidateRiskIndicators || [])
      .filter((risk: any) => candidateRiskAppliesToSection(risk, section));
    return [...sectionRisks, ...candidateRisks].filter(risk => risk.code !== 'R6.2' && risk.code !== 'R2.4');
  }

  private getRisksForExport(section: Section | any): string {
    const partiesById = this.getPartiesById();
    if (section?.sections && Array.isArray(section.sections)) {
      return section.sections
        .flatMap((groupedSection: Section) => this.getSectionAllRiskIndicators(groupedSection)
          .map(indicator => `${groupedSection.sectionId}: ${indicator.code}: ${formatRiskMessage(indicator, { section: groupedSection, partiesById })}`))
        .join('; ');
    }

    return this.getSectionAllRiskIndicators(section)
      .map(indicator => `${indicator.code}: ${formatRiskMessage(indicator, { section, partiesById })}`)
      .join('; ');
  }

  toggleExportColumnSelection(columnId: string) {
    const selection = this.viewMode === 'candidates' ? this.exportCandidateColumnIds : this.exportColumnIds;
    if (selection.has(columnId)) {
      if (selection.size > 1) {
        selection.delete(columnId);
      }
    } else {
      selection.add(columnId);
    }
  }

  onExportPartySelectionChange(selectedIds: Set<string>) {
    this.exportPartyIds = selectedIds;
  }

  downloadCsv() {
    if (!this.exportCount) return;
    const filePrefix = this.viewMode === 'candidates'
      ? 'candidates'
      : this.viewMode === 'cities'
        ? 'cities'
        : this.viewMode === 'municipalities'
          ? 'municipalities'
          : 'results';
    const csvContent = this.viewMode === 'candidates'
      ? this.generateCandidatesCsv()
      : this.generateCsv(this.buildPartiesMap());
    downloadCsvFile(csvContent, `${filePrefix}_${this.regionName}_${this.date}.csv`);
  }

  buildPartiesMap(): { [id: string]: string } {
    const partiesMap: { [id: string]: string } = {};
    this.allParties.forEach(p => {
      if (this.exportPartyIds.has(p.id)) {
        partiesMap[p.id] = getPartyAlias(p.name);
      }
    });
    return partiesMap;
  }

  generateCsv(partiesMap: { [id: string]: string }): string {
    const sortedPartyIds = Object.keys(partiesMap).sort((a, b) => {
      const idA = parseInt(a, 10);
      const idB = parseInt(b, 10);
      if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
      return a.localeCompare(b);
    });

    const headers: string[] = [];
    if (this.exportColumnIds.has('sectionId')) headers.push('Секция');
    if (this.exportColumnIds.has('riskScore')) headers.push('Рискове');
    if (this.exportColumnIds.has('regionName')) headers.push('Регион');
    if (this.exportColumnIds.has('municipalityName')) headers.push(this.municipalityLabel);
    if (this.exportColumnIds.has('cityName')) {
      headers.push(this.viewMode === 'municipalities' ? this.municipalityLabel : 'Населено място');
    }
    if (this.exportColumnIds.has('sectionName')) headers.push('Име на секция');
    if (this.exportColumnIds.has('total')) headers.push('Избиратели');
    if (this.exportColumnIds.has('voted')) headers.push('Гласували');
    if (this.exportColumnIds.has('activityBp')) headers.push('Активност');
    if (this.exportColumnIds.has('discardedVotes')) headers.push('Невалидни');
    if (this.exportColumnIds.has('noVotes')) headers.push('Не подкрепя никого');
    if (this.exportColumnIds.has('votesToFirst')) headers.push('Нужни');
    if (this.exportColumnIds.has('topCandidates')) headers.push('Топ 3 преференции');

    headers.push(...sortedPartyIds.map(id => partiesMap[id]));

    const rows = this.tableSections.map(section => {
      const rowData: (string | number)[] = [];
      if (this.exportColumnIds.has('sectionId')) rowData.push(section.sectionId);
      if (this.exportColumnIds.has('riskScore')) rowData.push(this.getRisksForExport(section));
      if (this.exportColumnIds.has('regionName')) rowData.push(section.regionName || '');
      if (this.exportColumnIds.has('municipalityName')) rowData.push(section.municipalityName || '');
      if (this.exportColumnIds.has('cityName')) {
        rowData.push(this.viewMode === 'municipalities'
          ? (section.municipalityName || '')
          : section.cityName);
      }
      if (this.exportColumnIds.has('sectionName')) rowData.push(section.sectionName);
      if (this.exportColumnIds.has('total')) rowData.push(section.total);
      if (this.exportColumnIds.has('voted')) rowData.push(section.voted);
      if (this.exportColumnIds.has('activityBp')) rowData.push(this.formatActivity((section.activityBp || 0) / 10000) + '%');
      if (this.exportColumnIds.has('discardedVotes')) rowData.push(section.discardedVotes);
      if (this.exportColumnIds.has('noVotes')) rowData.push(section.noVotes);
      if (this.exportColumnIds.has('votesToFirst')) rowData.push(section.votesToFirst ?? '');
      if (this.exportColumnIds.has('topCandidates')) rowData.push(getTopCandidates(section)
        .map(candidate => `${candidate.candidateName} (${getPartyAlias(candidate.partyName)}): ${candidate.total}`).join('; '));

      rowData.push(...sortedPartyIds.map(id => {
        const partyVotes = section.partyVotes[id] as any;
        if (typeof partyVotes === 'number') {
          return partyVotes;
        }
        return partyVotes?.total || 0;
      }));

      return rowData;
    });

    return createCsv([headers, ...rows]);
  }

  generateCandidatesCsv(): string {
    const headers: string[] = [];
    if (this.exportCandidateColumnIds.has('candidateId')) headers.push('Номер');
    if (this.exportCandidateColumnIds.has('risks')) headers.push('Рискове');
    if (this.exportCandidateColumnIds.has('candidateName')) headers.push('Име');
    if (this.exportCandidateColumnIds.has('partyName')) headers.push('Партия');
    if (this.exportCandidateColumnIds.has('totalInRegion')) headers.push('Преференции');
    if (this.exportCandidateColumnIds.has('preferencePercentOfPartyVotes')) headers.push('% от гласовете за партията');

    const rows = this.exportCandidates.map(candidate => {
      const rowData: (string | number)[] = [];
      if (this.exportCandidateColumnIds.has('candidateId')) rowData.push(candidate.candidateId);
      if (this.exportCandidateColumnIds.has('risks')) rowData.push(candidate.riskIndicators?.length || 0);
      if (this.exportCandidateColumnIds.has('candidateName')) rowData.push(candidate.candidateName);
      if (this.exportCandidateColumnIds.has('partyName')) rowData.push(getPartyAlias(candidate.partyName));
      if (this.exportCandidateColumnIds.has('totalInRegion')) rowData.push(candidate.totalInRegion);
      if (this.exportCandidateColumnIds.has('preferencePercentOfPartyVotes')) {
        rowData.push(`${candidate.preferencePercentOfPartyVotes.toFixed(2)}%`);
      }

      return rowData;
    });

    return createCsv([headers, ...rows]);
  }

  get modalTitle(): string {
    if (this.viewMode === 'candidates') return 'Експорт на кандидати';
    if (this.viewMode === 'cities') return 'Експорт на градове';
    if (this.viewMode === 'municipalities') return 'Експорт на общини';
    return 'Експорт на секции';
  }

  get modalSubtitle(): string {
    return 'Експортирайте текущите резултати от таблицата'
  }

  get exportCount(): number {
    if (this.viewMode === 'candidates') return this.exportCandidates.length;
    return this.tableSections.length;
  }

  get exportCandidates(): RegionCandidate[] {
    return this.filteredCandidates.filter(candidate => this.exportPartyIds.has(candidate.partyId));
  }

  get exportColumns(): TableColumn[] {
    return this.viewMode === 'candidates' ? this.candidateAvailableColumns : this.availableColumns;
  }

  isColumnSelected(columnId: string): boolean {
    return this.viewMode === 'candidates'
      ? this.exportCandidateColumnIds.has(columnId)
      : this.exportColumnIds.has(columnId);
  }

}
