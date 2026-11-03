import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TableColumns, TableControlsComponent } from './table-controls';
import { SortableTableHeaderComponent, SortableHeaderKeyboardDirective } from '../sortable-table-header/sortable-table-header';
import { VirtualTableDirective } from '../virtual-table/virtual-table';
import { SearchFilterComponent } from '../search-filter/search-filter';

interface Row { id: number; name: string; votes: number | null; }

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TableControlsComponent, SortableTableHeaderComponent, SortableHeaderKeyboardDirective, VirtualTableDirective],
  template: `
    <app-table-controls [rows]="rows" [columns]="columns" label="Търсене на район" #table />
    <div [virtualRows]="table.viewRows()" #viewport="virtualRows" tabindex="0">
      <table><thead><tr>
        <th app-sortable-table-header label="Район" columnKey="name" [table]="table"></th>
        <th app-sortable-table-header label="Гласове" columnKey="votes" [table]="table" align="right"></th>
      </tr></thead><tbody>
        @for (row of viewport.rows(); track row.id) {
          <tr [attr.data-virtual-index]="viewport.window().start + $index"><td>{{ row.name }}</td><td>{{ row.votes }}</td></tr>
        }
      </tbody></table>
    </div>
    <table><thead><tr><th appSortKeyboard (click)="legacySort = legacySort + 1">Custom header <button type="button" (click)="$event.stopPropagation()">Filter</button></th></tr></thead></table>
  `,
})
class Host {
  legacySort = 0;
  rows: Row[] = [{ id: 1, name: 'Бургас', votes: 12 }, { id: 2, name: 'София', votes: 100 },
    { id: 3, name: 'Варна', votes: null }, { id: 4, name: 'София 2', votes: 0 }];
  columns: TableColumns<Row> = { name: row => row.name, votes: row => row.votes };
}

describe('shared table controls', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const table = fixture.debugElement.query(By.directive(TableControlsComponent)).componentInstance as TableControlsComponent<Row>;
    const viewport = fixture.debugElement.query(By.directive(VirtualTableDirective));
    return { fixture, table, element: fixture.nativeElement as HTMLElement, viewport };
  }

  it('filters visible column values, preserves its source and updates after the dataset changes', async () => {
    const { fixture, table, element } = await setup();
    const source = fixture.componentInstance.rows;
    const input = element.querySelector('input')!;
    expect(element.querySelector('label')?.htmlFor).toBe(input.id);
    input.value = 'СОФИЯ'; input.dispatchEvent(new Event('input')); await fixture.whenStable();
    expect(table.viewRows().map(row => row.id)).toEqual([2, 4]);
    expect(fixture.componentInstance.rows).toBe(source);
    fixture.componentInstance.rows = [{ id: 5, name: 'София 3', votes: 5 }];
    fixture.changeDetectorRef.markForCheck(); await fixture.whenStable();
    expect(table.viewRows().map(row => row.id)).toEqual([5]);
    table.query.set('няма'); await fixture.whenStable();
    expect(table.viewRows()).toEqual([]);
  });

  it('forwards optional search-input classes without changing the default used by other tables', () => {
    const fixture = TestBed.createComponent(TableControlsComponent<Row>);
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('columns', { name: (row: Row) => row.name });
    fixture.detectChanges();
    const search = fixture.debugElement.query(By.directive(SearchFilterComponent)).componentInstance as SearchFilterComponent;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(search.inputClass).toBe('');
    expect(input.classList.contains('text-sm')).toBe(true);
    expect(input.classList.contains('text-base!')).toBe(false);
    const classes = 'text-base! sm:text-sm! min-h-11 sm:min-h-9';
    fixture.componentRef.setInput('searchInputClass', classes);
    fixture.detectChanges();
    expect(search.inputClass).toBe(classes);
    for (const name of classes.split(' ')) expect(input.classList.contains(name)).toBe(true);
  });

  it('toggles numeric and text columns with click, Enter and Space and keeps missing values last', async () => {
    const { fixture, table, element } = await setup();
    const [name, votes] = element.querySelectorAll('th');
    votes.click(); await fixture.whenStable();
    expect(table.viewRows().map(row => row.id)).toEqual([2, 1, 4, 3]);
    expect(votes.getAttribute('aria-sort')).toBe('descending');
    votes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(table.viewRows().map(row => row.id)).toEqual([4, 1, 2, 3]);
    expect(votes.getAttribute('aria-sort')).toBe('ascending');
    name.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(name.getAttribute('aria-sort')).toBe('ascending');
    expect(votes.getAttribute('aria-sort')).toBe('none');
    expect(table.viewRows().map(row => row.name)).toEqual(['Бургас', 'Варна', 'София', 'София 2']);
  });

  it('resets the virtual window after search or sorting without truncating the full list', async () => {
    const { fixture, table, viewport } = await setup();
    fixture.componentInstance.rows = Array.from({ length: 1000 }, (_, id) => ({ id, name: `Район ${id}`, votes: id }));
    fixture.changeDetectorRef.markForCheck(); await fixture.whenStable();
    viewport.nativeElement.scrollTop = 32000;
    viewport.nativeElement.dispatchEvent(new Event('scroll')); await fixture.whenStable();
    const virtual = viewport.injector.get(VirtualTableDirective);
    expect(virtual.window().start).toBeGreaterThan(0);
    table.sort('votes'); await fixture.whenStable();
    expect(viewport.nativeElement.scrollTop).toBe(0);
    expect(table.viewRows()[0].votes).toBe(999);
    expect(table.viewRows()).toHaveLength(1000);
    table.query.set('Район 999'); await fixture.whenStable();
    expect(table.viewRows()).toHaveLength(1);
    expect(viewport.nativeElement.querySelectorAll('tr[data-virtual-index]')).toHaveLength(1);
  });

  it('makes custom headers keyboard accessible without intercepting controls inside them', async () => {
    const { fixture, element } = await setup();
    const header = element.querySelector<HTMLElement>('th[appSortKeyboard]')!;
    expect(header.tabIndex).toBe(0);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    header.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.legacySort).toBe(2);
    const childEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.querySelector('button')!.dispatchEvent(childEnter);
    expect(childEnter.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.legacySort).toBe(2);
  });
});
