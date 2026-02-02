import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmTableHeadDirective } from '../table-helm/src/lib/hlm-table.directives';

@Component({
  selector: 'app-sortable-table-header',
  standalone: true,
  imports: [
    CommonModule,
    HlmTableHeadDirective,
  ],
  templateUrl: './sortable-table-header.html',
})
export class SortableTableHeaderComponent {
  @Input() columnKey: string = '';
  @Input() label: string = '';
  @Input() currentSortColumn: string = '';
  @Input() sortDirection: 'asc' | 'desc' = 'asc';
  @Input() align: 'left' | 'right' = 'left';
  @Output() sortChange = new EventEmitter<string>();

  get isActive(): boolean {
    return this.currentSortColumn === this.columnKey;
  }

  get sortIcon(): string {
    if (this.isActive) {
      return this.sortDirection === 'asc' ? '↑' : '↓';
    }
    return '';
  }

  onClick(): void {
    this.sortChange.emit(this.columnKey);
  }
}
