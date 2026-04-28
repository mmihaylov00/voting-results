import { Component, Input, Output, EventEmitter, HostListener, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'th[app-sortable-table-header]',
  standalone: true,
  imports: [
    CommonModule,
  ],
  templateUrl: './sortable-table-header.html',
})
export class SortableTableHeaderComponent {
  @Input() columnKey: string = '';
  @Input() label: string = '';
  @Input() currentSortColumn: string = '';
  @Input() sortDirection: 'asc' | 'desc' = 'asc';
  @Input() align: 'left' | 'right' = 'left';
  @Input() labelClass: string = '';
  @Output() sortChange = new EventEmitter<string>();

  get isActive(): boolean {
    return this.currentSortColumn === this.columnKey;
  }

  @HostBinding('class')
  get hostClasses(): string {
    const baseClasses = 'cursor-pointer hover:bg-primary/20 active:bg-primary/30 transition-colors text-secondary dark:text-primary group relative';
    return this.align === 'right' ? `${baseClasses} text-right` : baseClasses;
  }

  @HostListener('click')
  onClick(): void {
    this.sortChange.emit(this.columnKey);
  }
}
