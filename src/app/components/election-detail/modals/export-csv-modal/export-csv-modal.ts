import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Section, SECTION_COLUMNS, SectionTab, SectionFilters } from '../../../../models/election.models';
import { filterSections } from '../../../../utils/election-utils';
import { getPartyAlias } from '../../../../utils/party-aliases';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardContentDirective,
  HlmCardDescriptionDirective
} from '../../../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { SectionFiltersComponent } from '../../section-filters/section-filters';

@Component({
  selector: 'app-export-csv-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmTypographyDirective,
    SectionFiltersComponent,
  ],
  templateUrl: './export-csv-modal.html',
  host: {
    '(document:keydown.escape)': 'close.emit()'
  }
})
export class ExportCsvModalComponent {
  @Input({ required: true }) sections: Section[] = [];
  @Input() allParties: { id: string, name: string }[] = [];
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() date: string = '';
  @Input() regionName: string = '';
  @Output() close = new EventEmitter<void>();

  @Input() searchTerm: string = '';
  @Input() initialActiveTab: SectionTab = 'all';
  @Input() initialActivityOperator: 'lte' | 'gte' = 'lte';
  @Input() initialLowActivityThreshold: number | null = 100;

  activeTab = signal<SectionTab>('all');
  activityOperator = signal<'lte' | 'gte'>('lte');
  lowActivityThreshold: number | null = 100;
  exportSectionTypes: Set<string> = new Set();
  riskFilterType: 'any' | 'none' | null = null;
  selectedRiskCategories: Set<string> = new Set();
  
  get emptyRiskCategoriesSet(): Set<string> {
    return new Set();
  }

  filteredSections: Section[] = [];
  exportPartyIds: Set<string> = new Set();
  availableColumns = SECTION_COLUMNS.filter(c => c.id !== 'typeVotes' && c.id !== 'topParties');
  exportColumnIds: Set<string> = new Set(this.availableColumns.map(c => c.id));

  ngOnInit() {
    this.activeTab.set(this.initialActiveTab);
    this.activityOperator.set(this.initialActivityOperator);
    this.lowActivityThreshold = this.initialLowActivityThreshold;
    this.exportPartyIds = new Set(this.selectedPartyIds);
    this.applyFilter();
    const savedColumns = localStorage.getItem('visible_columns');
    if (savedColumns) {
      try {
        const columnsArray = JSON.parse(savedColumns);
        if (Array.isArray(columnsArray)) {
          // Only include columns that exist in our availableColumns for CSV
          const validSavedColumns = columnsArray.filter(id => this.availableColumns.some(ac => ac.id === id));
          if (validSavedColumns.length > 0) {
            this.exportColumnIds = new Set(validSavedColumns);
          }
        }
      } catch (e) {
        console.error('Error parsing saved columns', e);
      }
    }
  }

  applyFilter(): void {
    const filters: SectionFilters = {
      searchTerm: this.searchTerm,
      activeTab: this.activeTab(),
      activityOperator: this.activityOperator(),
      lowActivityThreshold: this.lowActivityThreshold,
      sectionTypes: this.exportSectionTypes,
      riskFilterType: this.riskFilterType,
      selectedRiskCategories: this.selectedRiskCategories
    };

    this.filteredSections = filterSections(this.sections, filters);
  }

  onFilterChange(filters: SectionFilters): void {
    this.searchTerm = filters.searchTerm;
    this.activeTab.set(filters.activeTab);
    this.activityOperator.set(filters.activityOperator);
    this.lowActivityThreshold = filters.lowActivityThreshold;
    this.exportSectionTypes = filters.sectionTypes;
    this.riskFilterType = filters.riskFilterType || null;
    this.selectedRiskCategories = filters.selectedRiskCategories || new Set();
    this.applyFilter();
  }

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
  }

  getPartyAlias = getPartyAlias;

  toggleExportColumnSelection(columnId: string) {
    if (this.exportColumnIds.has(columnId)) {
      if (this.exportColumnIds.size > 1) {
        this.exportColumnIds.delete(columnId);
      }
    } else {
      this.exportColumnIds.add(columnId);
    }
  }

  toggleExportPartySelection(partyId: string) {
    if (this.exportPartyIds.has(partyId)) {
      this.exportPartyIds.delete(partyId);
    } else {
      this.exportPartyIds.add(partyId);
    }
  }

  downloadCsv() {
    const partiesMap: { [id: string]: string } = {};
    this.allParties.forEach(p => {
      if (this.exportPartyIds.has(p.id)) {
        partiesMap[p.id] = getPartyAlias(p.name);
      }
    });

    const csvContent = this.generateCsv(partiesMap);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `results_${this.regionName}_${this.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.close.emit();
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
    if (this.exportColumnIds.has('activityPercent')) headers.push('Активност');
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
      if (this.exportColumnIds.has('activityPercent')) rowData.push(this.formatActivity(section.activityPercent) + '%');
      if (this.exportColumnIds.has('discardedVotes')) rowData.push(section.discardedVotes);
      if (this.exportColumnIds.has('noVotes')) rowData.push(section.noVotes);

      rowData.push(...sortedPartyIds.map(id => section.partyVotes[id]?.total || 0));

      return rowData.map(v => this.escapeSemi(String(v)));
    });

    return [
      headers.map(h => this.escapeSemi(h)).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');
  }

  escapeSemi(v: string): string {
    if (!v) return '';
    if (v.includes(';') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }
}
