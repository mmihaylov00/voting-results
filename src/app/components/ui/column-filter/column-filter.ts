import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { HlmTooltipDirective } from '../tooltip-helm/src/lib/hlm-tooltip.directive';

export interface Column {
  id: string;
  label: string;
}

@Component({
  selector: 'app-column-filter',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTooltipDirective,
  ],
  templateUrl: './column-filter.html',
  host: {
    '(document:click)': 'closeDropdown()'
  }
})
export class ColumnFilterComponent {
  @Input() columns: Column[] = [];
  @Input() selectedColumnIds: Set<string> = new Set();
  @Input() rowCount?: number;
  @Input() rowCountLabel: string = 'Редове';
  @Output() selectedColumnIdsChange = new EventEmitter<Set<string>>();

  showDropdown = signal<boolean>(false);

  get filteredColumns(): Column[] {
    return this.columns.filter(col => col.id !== 'actions'); // Filter out actions column
  }

  toggleColumn(columnId: string, event: Event): void {
    event.stopPropagation();
    const newSet = new Set(this.selectedColumnIds);
    if (newSet.has(columnId)) {
      // Don't allow unchecking if it's the last column
      if (newSet.size > 1) {
        newSet.delete(columnId);
      }
    } else {
      newSet.add(columnId);
    }
    this.selectedColumnIdsChange.emit(newSet);
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.showDropdown.set(!this.showDropdown());
  }

  closeDropdown(): void {
    this.showDropdown.set(false);
  }
}
