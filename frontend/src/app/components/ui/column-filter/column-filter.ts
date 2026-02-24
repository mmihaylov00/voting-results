import { Component, Input, Output, EventEmitter, signal, ElementRef, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DOCUMENT } from '@angular/common';
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
  templateUrl: './column-filter.html'
})
export class ColumnFilterComponent implements OnDestroy {
  @Input() columns: Column[] = [];
  @Input() selectedColumnIds: Set<string> = new Set();
  @Input() rowCount?: number;
  @Input() rowCountLabel: string = 'Редове';
  @Output() selectedColumnIdsChange = new EventEmitter<Set<string>>();

  showDropdown = signal<boolean>(false);
  private readonly onDocumentClick: (event: MouseEvent) => void;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.onDocumentClick = (event: MouseEvent) => {
      if (!this.showDropdown()) return;
      const target = event.target as Node | null;
      if (target && this.elementRef.nativeElement.contains(target)) return;
      this.closeDropdown();
    };

    this.document.addEventListener('click', this.onDocumentClick, true);
  }

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

  ngOnDestroy(): void {
    this.document.removeEventListener('click', this.onDocumentClick, true);
  }
}
