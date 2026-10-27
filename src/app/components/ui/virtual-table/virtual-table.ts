import {
  afterRenderEffect,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

interface RowWindow {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

function rowAt(offsets: Float64Array, offset: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

@Directive({
  selector: '[virtualRows]',
  standalone: true,
  exportAs: 'virtualRows',
  host: { '(scroll)': 'updateWindow()', '(keydown)': 'onKeyDown($event)' },
})
export class VirtualTableDirective<T> {
  readonly virtualRows = input<readonly T[]>([]);
  readonly virtualRowsLayout = input<unknown>();
  readonly estimatedHeight = input(64, { alias: 'virtualRowHeight' });
  readonly window = signal<RowWindow>({ start: 0, end: 0, top: 0, bottom: 0 });
  readonly rows = computed(() => this.virtualRows().slice(this.window().start, this.window().end));
  readonly columnCount = signal(1);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly buffer = 8;
  private heights = new Float64Array(0);
  private offsets = new Float64Array(1);
  private resizeObserver?: ResizeObserver;
  private columnGroup?: HTMLTableColElement;
  private columnLayout: unknown;
  private columnViewportWidth = 0;
  private table?: HTMLTableElement;
  private originalTableWidth = '';
  private originalTableLayout = '';

  constructor() {
    effect(() => {
      const count = this.virtualRows().length;
      const layout = this.virtualRowsLayout();
      const estimatedHeight = this.estimatedHeight();
      untracked(() => {
        if (layout !== this.columnLayout) {
          this.columnLayout = layout;
          this.clearColumnWidths();
        }
        this.heights = new Float64Array(count).fill(estimatedHeight);
        this.rebuildOffsets();
        this.element.scrollTop = 0;
        this.updateWindow();
      });
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measureRows());
    }
    afterRenderEffect(() => {
      this.window();
      this.virtualRows();
      this.virtualRowsLayout();
      this.resizeObserver?.disconnect();
      this.resizeObserver?.observe(this.element);
      for (const row of this.element.querySelectorAll('[data-virtual-index]')) {
        this.resizeObserver?.observe(row);
      }
      this.measureRows();
    });
    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.clearColumnWidths();
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.target !== this.element || (event.key !== 'Home' && event.key !== 'End')) return;
    event.preventDefault();
    this.element.scrollTop = event.key === 'End' ? this.element.scrollHeight : 0;
    this.updateWindow();
  }

  updateWindow(): void {
    const count = this.heights.length;
    const viewportHeight = this.viewportHeight();
    const scrollTop = Math.min(this.element.scrollTop, Math.max(0, this.offsets[count] - viewportHeight));
    const start = Math.max(0, rowAt(this.offsets, scrollTop) - this.buffer);
    const end = Math.min(count, rowAt(this.offsets, scrollTop + viewportHeight) + this.buffer + 1);
    const next = { start, end, top: this.offsets[start], bottom: this.offsets[count] - this.offsets[end] };
    const previous = this.window();
    if (next.start === previous.start && next.end === previous.end
      && next.top === previous.top && next.bottom === previous.bottom) return;

    const focused = this.element.ownerDocument.activeElement?.closest<HTMLElement>('[data-virtual-index]');
    if (focused && this.element.contains(focused)) {
      const index = Number(focused.dataset['virtualIndex']);
      if (index < start || index >= end) this.element.focus({ preventScroll: true });
    }
    this.window.set(next);
  }

  private viewportHeight(): number {
    const headerHeight = this.element.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    return Math.max(1, (this.element.clientHeight || 600) - headerHeight);
  }

  private rebuildOffsets(): void {
    this.offsets = new Float64Array(this.heights.length + 1);
    for (let index = 0; index < this.heights.length; index++) {
      this.offsets[index + 1] = this.offsets[index] + this.heights[index];
    }
  }

  private clearColumnWidths(): void {
    this.columnGroup?.remove();
    this.columnGroup = undefined;
    if (this.table) {
      this.table.style.width = this.originalTableWidth;
      this.table.style.tableLayout = this.originalTableLayout;
    }
  }

  private stabilizeColumns(table: HTMLTableElement): boolean {
    const viewportWidth = this.element.clientWidth;
    const row = table.querySelector<HTMLTableRowElement>('tr[data-virtual-index]');
    if (!viewportWidth || (this.columnGroup && viewportWidth === this.columnViewportWidth)
      || !row) return false;
    const resized = !!this.columnGroup;
    this.clearColumnWidths();
    const widths = Array.from(row.cells, cell => cell.getBoundingClientRect().width);
    if (!widths.length || widths.some(width => width <= 0)) return resized;
    if (!this.table) {
      this.table = table;
      this.originalTableWidth = table.style.width;
      this.originalTableLayout = table.style.tableLayout;
    }
    this.columnGroup = table.ownerDocument.createElement('colgroup');
    for (const width of widths) {
      const column = table.ownerDocument.createElement('col');
      column.style.width = `${width}px`;
      this.columnGroup.appendChild(column);
    }
    table.insertBefore(this.columnGroup, table.firstChild);
    table.style.width = `${widths.reduce((total, width) => total + width, 0)}px`;
    table.style.tableLayout = 'fixed';
    this.columnViewportWidth = viewportWidth;
    return resized;
  }

  private measureRows(): void {
    const table = this.element.querySelector('table');
    const columns = Array.from(table?.tHead?.rows[0]?.cells ?? []).reduce((count, cell) => count + cell.colSpan, 0) || 1;
    if (columns !== this.columnCount()) this.columnCount.set(columns);

    const anchor = rowAt(this.offsets, this.element.scrollTop);
    const anchorOffset = this.element.scrollTop - this.offsets[anchor];
    const atBottom = this.element.scrollTop >= this.offsets[this.heights.length] - this.viewportHeight() - 1;
    let changed = table ? this.stabilizeColumns(table) : false;
    if (changed) this.heights.fill(this.estimatedHeight());
    for (const row of this.element.querySelectorAll<HTMLElement>('[data-virtual-index]')) {
      const index = Number(row.dataset['virtualIndex']);
      const height = row.getBoundingClientRect().height;
      if (height > 0 && index < this.heights.length && Math.abs(this.heights[index] - height) > 0.5) {
        this.heights[index] = height;
        changed = true;
      }
    }
    if (changed) {
      this.rebuildOffsets();
      this.element.scrollTop = atBottom
        ? Math.max(0, this.offsets[this.heights.length] - this.viewportHeight())
        : this.offsets[anchor] + anchorOffset;
    }
    this.updateWindow();
  }
}
