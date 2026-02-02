import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegionCandidate, Section, SECTION_COLUMNS, TableColumn, ViewMode } from '../../../../models/election.models';
import { getPartyAlias } from '../../../../utils/party-aliases';
import { formatActivity } from '../../../../utils/common.utils';
import { loadVisibleColumns } from '../../../../utils/column-visibility';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { PartyFilterComponent } from '../../party-filter/party-filter';
import { BaseModalComponent } from '../../../ui/base-modal/base-modal';

@Component({
  selector: 'app-export-csv-modal',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTypographyDirective,
    PartyFilterComponent,
    BaseModalComponent,
  ],
  templateUrl: './export-csv-modal.html'
})
export class ExportCsvModalComponent {
  @Input() tableSections: Section[] = [];
  @Input() filteredCandidates: RegionCandidate[] = [];
  @Input() allParties: { id: string, name: string }[] = [];
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() initialCandidateColumnIds: Set<string> = new Set();
  @Input() viewMode: ViewMode = 'sections';
  @Input() date: string = '';
  @Input() regionName: string = '';
  @Output() close = new EventEmitter<void>();

  filteredSections: Section[] = [];
  exportPartyIds: Set<string> = new Set();
  availableColumns = SECTION_COLUMNS.filter(c => c.id !== 'typeVotes' && c.id !== 'topParties');
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

  ngOnInit() {
    this.exportPartyIds = new Set(this.selectedPartyIds);
    this.filteredSections = this.tableSections;
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
    const filePrefix = this.viewMode === 'candidates' ? 'candidates' : this.viewMode === 'cities' ? 'cities' : 'results';
    const csvContent = this.viewMode === 'candidates'
      ? this.generateCandidatesCsv()
      : this.generateCsv(this.buildPartiesMap());
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filePrefix}_${this.regionName}_${this.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.close.emit();
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
    if (this.exportColumnIds.has('cityName')) headers.push('Град');
    if (this.exportColumnIds.has('sectionName')) headers.push('Име на секция');
    if (this.exportColumnIds.has('total')) headers.push('Избиратели');
    if (this.exportColumnIds.has('voted')) headers.push('Гласували');
    if (this.exportColumnIds.has('activityBp')) headers.push('Активност');
    if (this.exportColumnIds.has('discardedVotes')) headers.push('Невалидни');
    if (this.exportColumnIds.has('noVotes')) headers.push('Не подкрепя никого');

    headers.push(...sortedPartyIds.map(id => partiesMap[id]));

    const rows = this.filteredSections.map(section => {
      const rowData: (string | number)[] = [];
      if (this.exportColumnIds.has('sectionId')) rowData.push(section.sectionId);
      if (this.exportColumnIds.has('cityName')) rowData.push(section.cityName);
      if (this.exportColumnIds.has('sectionName')) rowData.push(section.sectionName);
      if (this.exportColumnIds.has('total')) rowData.push(section.total);
      if (this.exportColumnIds.has('voted')) rowData.push(section.voted);
      if (this.exportColumnIds.has('activityBp')) rowData.push(this.formatActivity((section.activityBp || 0) / 10000) + '%');
      if (this.exportColumnIds.has('discardedVotes')) rowData.push(section.discardedVotes);
      if (this.exportColumnIds.has('noVotes')) rowData.push(section.noVotes);

      rowData.push(...sortedPartyIds.map(id => {
        const partyVotes = section.partyVotes[id] as any;
        if (typeof partyVotes === 'number') {
          return partyVotes;
        }
        return partyVotes?.total || 0;
      }));

      return rowData.map(v => this.escapeSemi(String(v)));
    });

    return [
      headers.map(h => this.escapeSemi(h)).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');
  }

  generateCandidatesCsv(): string {
    const headers: string[] = [];
    if (this.exportCandidateColumnIds.has('candidateId')) headers.push('Номер');
    if (this.exportCandidateColumnIds.has('risks')) headers.push('Рискове');
    if (this.exportCandidateColumnIds.has('candidateName')) headers.push('Име');
    if (this.exportCandidateColumnIds.has('partyName')) headers.push('Партия');
    if (this.exportCandidateColumnIds.has('totalInRegion')) headers.push('Преференции');
    if (this.exportCandidateColumnIds.has('preferencePercentOfPartyVotes')) headers.push('% от гласовете за партията');

    const rows = this.filteredCandidates.map(candidate => {
      const rowData: (string | number)[] = [];
      if (this.exportCandidateColumnIds.has('candidateId')) rowData.push(candidate.candidateId);
      if (this.exportCandidateColumnIds.has('risks')) rowData.push(candidate.riskIndicators?.length || 0);
      if (this.exportCandidateColumnIds.has('candidateName')) rowData.push(candidate.candidateName);
      if (this.exportCandidateColumnIds.has('partyName')) rowData.push(getPartyAlias(candidate.partyName));
      if (this.exportCandidateColumnIds.has('totalInRegion')) rowData.push(candidate.totalInRegion);
      if (this.exportCandidateColumnIds.has('preferencePercentOfPartyVotes')) {
        rowData.push(`${candidate.preferencePercentOfPartyVotes.toFixed(2)}%`);
      }

      return rowData.map(v => this.escapeSemi(String(v)));
    });

    return [
      headers.map(h => this.escapeSemi(h)).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');
  }

  get modalTitle(): string {
    if (this.viewMode === 'candidates') return 'Експорт на кандидати';
    if (this.viewMode === 'cities') return 'Експорт на градове';
    return 'Експорт на секции';
  }

  get modalSubtitle(): string {
    return 'Експортирайте текущите резултати от таблицата'
  }

  get exportCount(): number {
    if (this.viewMode === 'candidates') return this.filteredCandidates.length;
    return this.filteredSections.length;
  }

  get exportColumns(): TableColumn[] {
    return this.viewMode === 'candidates' ? this.candidateAvailableColumns : this.availableColumns;
  }

  isColumnSelected(columnId: string): boolean {
    return this.viewMode === 'candidates'
      ? this.exportCandidateColumnIds.has(columnId)
      : this.exportColumnIds.has(columnId);
  }

  escapeSemi(v: string): string {
    if (!v) return '';
    if (v.includes(';') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }
}
