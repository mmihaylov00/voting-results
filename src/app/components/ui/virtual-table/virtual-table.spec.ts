import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { VirtualTableDirective } from './virtual-table';

@Component({
  imports: [VirtualTableDirective],
  template: `
    <div [virtualRows]="items" [virtualRowsLayout]="layout" #viewport="virtualRows" tabindex="0">
      <table [attr.aria-rowcount]="items.length + 1">
        <thead><tr><th [attr.data-width]="columnWidth">Number</th></tr></thead>
        <tbody>
          <tr aria-hidden="true"><td [style.height.px]="viewport.window().top"></td></tr>
          @for (item of viewport.rows(); track item) {
            <tr [attr.data-virtual-index]="viewport.window().start + $index" [attr.data-height]="height(item)"
                [attr.aria-rowindex]="viewport.window().start + $index + 2">
              <td><button>{{ item }}</button></td>
            </tr>
          }
          <tr aria-hidden="true"><td [style.height.px]="viewport.window().bottom"></td></tr>
        </tbody>
      </table>
    </div>
  `,
})
class VirtualTableTestComponent {
  items = Array.from({ length: 13000 }, (_, index) => index);
  layout = 'default';
  columnWidth = 500;
  height = (_item: number) => 64;
}

describe('VirtualTableDirective', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
      const height = this.tagName === 'THEAD' ? 48 : Number(this.getAttribute('data-height'));
      return new DOMRect(0, 0, Number(this.getAttribute('data-width')) || 500, height);
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function setup(columnWidth = 500) {
    const fixture = TestBed.createComponent(VirtualTableTestComponent);
    fixture.componentInstance.columnWidth = columnWidth;
    const viewport = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    let height = 320;
    let width = 500;
    Object.defineProperty(viewport, 'clientHeight', { get: () => height });
    Object.defineProperty(viewport, 'clientWidth', { get: () => width });
    await fixture.whenStable();
    const directive = fixture.debugElement.query(By.directive(VirtualTableDirective)).injector.get(VirtualTableDirective<number>);
    const rows = () => Array.from(viewport.querySelectorAll<HTMLTableRowElement>('tr[data-virtual-index]'));
    const scroll = async (top: number) => {
      viewport.scrollTop = top;
      viewport.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
    };
    return {
      fixture, viewport, directive, rows, scroll,
      resize: (next: number) => { height = next; },
      resizeWidth: (next: number) => { width = next; },
    };
  }

  it('bounds rendered rows while preserving the full dataset and continuous scroll extent', async () => {
    const { fixture, directive, rows, scroll } = await setup();
    const data = fixture.componentInstance.items;
    expect(rows().length).toBeLessThan(30);
    expect(rows()[0].textContent?.trim()).toBe('0');
    expect(directive.window().bottom).toBeGreaterThan(800000);

    await scroll(6400);
    expect(directive.window().start).toBe(92);
    expect(rows().some(row => row.textContent?.trim() === '100')).toBe(true);
    expect(rows().length).toBeLessThan(30);

    await scroll(13000 * 64);
    expect(rows().at(-1)?.textContent?.trim()).toBe('12999');
    expect(rows().at(-1)?.getAttribute('aria-rowindex')).toBe('13001');
    expect(directive.window().bottom).toBe(0);
    expect(fixture.componentInstance.items).toBe(data);
    expect(data.length).toBe(13000);
  });

  it('resets after filtering or sorting and handles empty results', async () => {
    const { fixture, viewport, rows, scroll } = await setup();
    await scroll(64000);
    fixture.componentInstance.items = [9, 4, 2];
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(viewport.scrollTop).toBe(0);
    expect(rows().map(row => row.textContent?.trim())).toEqual(['9', '4', '2']);

    fixture.componentInstance.items = [];
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(rows()).toHaveLength(0);
  });

  it('measures row heights and recalculates the window when the viewport grows', async () => {
    const { fixture, directive, rows, scroll, resize } = await setup();
    fixture.componentInstance.height = () => 32;
    fixture.componentInstance.layout = 'compact';
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    await scroll(640);
    expect(directive.window().start).toBeGreaterThan(0);
    expect(directive.window().top).toBe(directive.window().start * 32);
    const count = rows().length;
    resize(640);
    await scroll(640);
    expect(rows().length).toBeGreaterThan(count);
    expect(rows().length).toBeLessThan(50);
  });

  it('keeps keyboard focus on the viewport when a focused row scrolls out of the buffer', async () => {
    const { viewport, rows, scroll } = await setup();
    rows()[0].querySelector('button')!.focus();
    await scroll(64000);
    expect(document.activeElement).toBe(viewport);
  });

  it('keeps column widths and horizontal scroll stable between windows, then remeasures on layout or viewport changes', async () => {
    let notifyResize = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { notifyResize = () => callback([], this); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const { fixture, viewport, directive, scroll, resizeWidth } = await setup(700);
    const table = viewport.querySelector('table')!;
    const column = () => table.querySelector('col')!;
    expect(column().style.width).toBe('700px');
    expect(table.style.width).toBe('700px');
    expect(table.style.tableLayout).toBe('fixed');

    viewport.scrollLeft = 180;
    fixture.componentInstance.columnWidth = 350;
    fixture.changeDetectorRef.markForCheck();
    await scroll(6400);
    expect(column().style.width).toBe('700px');
    expect(table.style.width).toBe('700px');
    expect(viewport.scrollLeft).toBe(180);

    await scroll(0);
    fixture.componentInstance.items = [...fixture.componentInstance.items];
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(column().style.width).toBe('700px');

    fixture.componentInstance.layout = 'different-columns';
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(column().style.width).toBe('350px');

    fixture.componentInstance.columnWidth = 1000;
    fixture.componentInstance.height = () => 32;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    resizeWidth(900);
    notifyResize();
    await fixture.whenStable();
    expect(column().style.width).toBe('1000px');
    expect(table.style.width).toBe('1000px');
    await scroll(640);
    expect(directive.window().top).toBe(directive.window().start * 32);
  });
});
