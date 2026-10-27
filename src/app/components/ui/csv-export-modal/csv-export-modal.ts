import { Component, OnInit, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CsvExportData, createCsv, downloadCsvFile } from '../../../utils/csv-export.util';
import { BaseModalComponent } from '../base-modal/base-modal';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { CsvExportButtonComponent } from '../csv-export-button/csv-export-button';

@Component({
  selector: 'app-csv-export-modal',
  standalone: true,
  imports: [CommonModule, BaseModalComponent, HlmButtonDirective, CsvExportButtonComponent],
  template: `
    <app-base-modal #modal title="Експорт CSV" subtitle="Експортирайте текущите резултати от таблицата"
      maxWidth="max-w-3xl" (close)="close.emit()">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-secondary/70 dark:text-primary/70">Колони</h3>
        <p class="text-sm text-muted-foreground">{{ data().rows.length | number }} записа</p>
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
        @for (header of data().headers; track $index) {
          <label class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted">
            <input type="checkbox" [checked]="selectedColumns().has($index)" (change)="toggleColumn($index)"
              [disabled]="selectedColumns().size === 1 && selectedColumns().has($index)" class="cursor-pointer accent-primary" />
            <span class="text-sm">{{ header }}</span>
          </label>
        }
      </div>
      <ng-template #footer>
        <button hlmBtn variant="outline" type="button" (click)="modal.closeModal()">Отказ</button>
        <app-csv-export-button [action]="csvExportAction" [disabled]="!data().rows.length || !selectedColumns().size"
          (exported)="modal.closeModal()" />
      </ng-template>
    </app-base-modal>
  `,
})
export class CsvExportModalComponent implements OnInit {
  readonly data = input.required<CsvExportData>();
  readonly close = output<void>();
  readonly selectedColumns = signal(new Set<number>());
  readonly csvExportAction = () => this.downloadCsv();

  ngOnInit(): void {
    this.selectedColumns.set(new Set(this.data().headers.map((_, index) => index)));
  }

  toggleColumn(index: number): void {
    const selection = new Set(this.selectedColumns());
    if (selection.has(index)) {
      if (selection.size === 1) return;
      selection.delete(index);
    } else selection.add(index);
    this.selectedColumns.set(selection);
  }

  downloadCsv(): void {
    const data = this.data();
    const columns = data.headers.map((_, index) => index).filter(index => this.selectedColumns().has(index));
    if (!data.rows.length || !columns.length) return;
    downloadCsvFile(createCsv([
      columns.map(index => data.headers[index]),
      ...data.rows.map(row => columns.map(index => row[index])),
    ]), data.filename);
  }
}
