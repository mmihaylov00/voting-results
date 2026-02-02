import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Section, TableColumn } from '../../../../models/election.models';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../../ui/table-helm/src/lib/hlm-table.directives';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardContentDirective,
  HlmCardFooterDirective,
} from '../../../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { HlmInputDirective } from '../../../ui/input-helm/src/lib/hlm-input.directive';
import { getGoogleMapsUrl, copyToClipboard as copyToClipboardUtil } from '../../../../utils/common.utils';
import { sortArray, toggleSort as toggleSortUtil, SortState } from '../../../../utils/table-sort.util';
import { BaseModalComponent } from '../../../ui/base-modal/base-modal';
import { SortableTableHeaderComponent } from '../../../ui/sortable-table-header/sortable-table-header';
import { ColumnFilterComponent } from '../../../ui/column-filter/column-filter';

@Component({
  selector: 'app-protocol-error-modal',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableCellDirective,
    HlmTooltipDirective,
    HlmInputDirective,
    BaseModalComponent,
    SortableTableHeaderComponent,
    ColumnFilterComponent
  ],
  templateUrl: './protocol-error-modal.html'
})
export class ProtocolErrorModalComponent {
  private readonly visibleColumnsStorageKey = 'visible_protocol_error_columns';
  @Input({ required: true }) sectionsWithError: Section[] = [];
  @Output() close = new EventEmitter<void>();

  copiedId = signal<string | null>(null);
  sortColumn = signal<string>('sectionId');
  sortDirection = signal<'asc' | 'desc'>('asc');
  searchTerm = signal<string>('');
  protocolColumns: TableColumn[] = [
    { id: 'sectionId', label: 'Секция' },
    { id: 'cityName', label: 'Град' },
    { id: 'voted', label: 'Подписи' },
    { id: 'protocolPaperVotes', label: 'Хартиени' },
    { id: 'protocolMachineVotes', label: 'Машинни' },
    { id: 'protocolErrorDiff', label: 'Разлика' },
  ];
  visibleColumns = signal<Set<string>>(new Set(this.protocolColumns.map(column => column.id)));

  sortedSections = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filtered = term
      ? this.sectionsWithError.filter(section =>
          String(section.sectionId).toLowerCase().includes(term) ||
          section.cityName.toLowerCase().includes(term) ||
          section.sectionName.toLowerCase().includes(term)
        )
      : this.sectionsWithError;
    return sortArray(
      filtered,
      this.sortColumn(),
      this.sortDirection()
    );
  });

  constructor() {
    this.loadVisibleColumns();
  }

  onColumnSelectionChange(selectedIds: Set<string>): void {
    this.visibleColumns.set(selectedIds);
    localStorage.setItem(this.visibleColumnsStorageKey, JSON.stringify(Array.from(selectedIds)));
  }

  toggleSort(column: string) {
    const newState = toggleSortUtil(
      this.sortColumn(),
      this.sortDirection(),
      column
    );
    this.sortColumn.set(newState.column);
    this.sortDirection.set(newState.direction);
  }

  getGoogleMapsUrl = getGoogleMapsUrl;

  async copyToClipboard(text: string, event: Event): Promise<void> {
    event.stopPropagation();
    const success = await copyToClipboardUtil(text);
    if (success) {
      this.markAsCopied(text);
    }
  }

  private markAsCopied(text: string): void {
    this.copiedId.set(text);
    setTimeout(() => {
      if (this.copiedId() === text) {
        this.copiedId.set(null);
      }
    }, 2000);
  }

  private loadVisibleColumns(): void {
    const savedColumns = localStorage.getItem(this.visibleColumnsStorageKey);
    if (!savedColumns) return;
    try {
      const columnsArray = JSON.parse(savedColumns);
      if (Array.isArray(columnsArray)) {
        const validColumns = columnsArray.filter(id => this.protocolColumns.some(column => column.id === id));
        if (validColumns.length > 0) {
          this.visibleColumns.set(new Set(validColumns));
        }
      }
    } catch (error) {
      console.error('Error parsing saved protocol modal columns', error);
    }
  }
}
