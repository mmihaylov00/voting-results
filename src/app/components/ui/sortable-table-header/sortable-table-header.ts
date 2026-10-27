import { Component, Directive, ElementRef, Input, Output, EventEmitter, HostListener, HostBinding, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableSorting } from '../table-controls/table-controls';

@Directive({
  selector: 'th[appSortKeyboard]',
  standalone: true,
  host: { tabindex: '0', '(keydown)': 'activate($event)' },
})
export class SortableHeaderKeyboardDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  activate(event: KeyboardEvent): void {
    if (event.target !== this.element || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    this.element.click();
  }
}

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
  @Input() align: 'left' | 'right' | 'center' = 'left';
  @Input() labelClass: string = '';
  @Input() table: TableSorting | null = null;
  @Output() sortChange = new EventEmitter<string>();

  get isActive(): boolean {
    return (this.table?.sortColumn() ?? this.currentSortColumn) === this.columnKey;
  }

  get activeDirection(): 'asc' | 'desc' { return this.table?.direction() ?? this.sortDirection; }

  @HostBinding('attr.tabindex') readonly tabIndex = 0;
  @HostBinding('attr.aria-sort') get ariaSort(): string {
    return this.isActive ? this.activeDirection === 'asc' ? 'ascending' : 'descending' : 'none';
  }

  @HostBinding('class')
  get hostClasses(): string {
    const baseClasses = 'cursor-pointer hover:bg-primary/20 active:bg-primary/30 transition-colors text-secondary dark:text-primary group relative';
    return this.align === 'right' ? `${baseClasses} text-right` : this.align === 'center' ? `${baseClasses} text-center` : baseClasses;
  }

  @HostListener('click')
  onClick(): void {
    this.table?.sort(this.columnKey);
    this.sortChange.emit(this.columnKey);
  }

  @HostListener('keydown.enter', ['$event'])
  @HostListener('keydown.space', ['$event'])
  onKeyDown(event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.onClick();
  }
}
