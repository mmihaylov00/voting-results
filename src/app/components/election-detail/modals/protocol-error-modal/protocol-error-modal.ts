import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Section } from '../../../../models/election.models';
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
import { getGoogleMapsUrl, copyToClipboard as copyToClipboardUtil } from '../../../../utils/common.utils';
import { sortArray, toggleSort as toggleSortUtil, SortState } from '../../../../utils/table-sort.util';
import { BaseModalComponent } from '../../../ui/base-modal/base-modal';
import { SortableTableHeaderComponent } from '../../../ui/sortable-table-header/sortable-table-header';

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
    BaseModalComponent,
    SortableTableHeaderComponent
  ],
  templateUrl: './protocol-error-modal.html'
})
export class ProtocolErrorModalComponent {
  @Input({ required: true }) sectionsWithError: Section[] = [];
  @Output() close = new EventEmitter<void>();

  copiedId = signal<string | null>(null);
  sortColumn = signal<string>('sectionId');
  sortDirection = signal<'asc' | 'desc'>('asc');

  sortedSections = computed(() => {
    return sortArray(
      this.sectionsWithError,
      this.sortColumn(),
      this.sortDirection()
    );
  });

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
}
