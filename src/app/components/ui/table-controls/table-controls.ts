import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFilterComponent } from '../search-filter/search-filter';
import { SortDirection, getDefaultSortDirection, sortArray } from '../../../utils/table-sort.util';

export type TableValue = string | number | null | undefined;
export type TableColumns<T> = Record<string, (row: T) => TableValue>;
export interface TableSorting {
  sortColumn(): string;
  direction(): SortDirection;
  sort(column: string): void;
}

@Component({
  selector: 'app-table-controls',
  standalone: true,
  imports: [CommonModule, SearchFilterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="w-full sm:w-72">
        <label class="sr-only" [for]="searchId">{{ label() }}</label>
        <app-search-filter [inputId]="searchId" [value]="query()" (valueChange)="query.set($event)" />
      </div>
      <p class="text-xs text-muted-foreground" aria-live="polite">{{ viewRows().length | number }} от {{ rows().length | number }}</p>
    </div>
  `,
  styles: ':host { display: block; min-width: 0; }',
})
export class TableControlsComponent<T> implements TableSorting {
  private static nextId = 0;
  readonly searchId = `table-search-${++TableControlsComponent.nextId}`;
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<TableColumns<T>>();
  readonly label = input('Търсене в таблицата');
  readonly query = signal('');
  readonly sortColumn = signal('');
  readonly direction = signal<SortDirection>('asc');
  readonly viewRows = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('bg');
    const columns = this.columns();
    const values = Object.values(columns);
    const rows = query ? this.rows().filter(row => values
      .some(value => String(value(row) ?? '').toLocaleLowerCase('bg').includes(query))) : this.rows();
    const value = columns[this.sortColumn()];
    return value ? sortArray(rows, this.sortColumn(), this.direction(), 'bg', value) : rows;
  });

  sort(column: string): void {
    const value = this.columns()[column];
    if (!value) return;
    const sample = this.rows().find(row => value(row) != null);
    this.direction.set(this.sortColumn() === column
      ? this.direction() === 'asc' ? 'desc' : 'asc' : getDefaultSortDirection(column, sample === undefined || typeof value(sample) !== 'number'));
    this.sortColumn.set(column);
  }
}
