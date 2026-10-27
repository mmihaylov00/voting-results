import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CsvExportData } from '../../../utils/csv-export.util';
import { CsvExportModalComponent } from './csv-export-modal';

const data: CsvExportData = {
  filename: 'selected-columns.csv',
  headers: ['Секция', 'Място', 'Индикатори'],
  rows: [['001', 'София', 'R1.1'], ['002', '=SUM(1,2)', null]],
};

describe('CSV export column modal', () => {
  afterEach(() => vi.restoreAllMocks());

  async function setup(value = data) {
    TestBed.configureTestingModule({ imports: [CsvExportModalComponent], providers: [provideRouter([])] });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:selected-columns');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fixture = TestBed.createComponent(CsvExportModalComponent);
    fixture.componentRef.setInput('data', value);
    const component = fixture.componentInstance;
    const closed = vi.fn(); component.close.subscribe(closed);
    await fixture.whenStable();
    return { fixture, component, create, closed, element: fixture.nativeElement as HTMLElement };
  }

  it('waits for confirmation, exports only selected columns in source order, and preserves all rows', async () => {
    const { fixture, component, create, closed, element } = await setup();
    expect(create).not.toHaveBeenCalled();
    expect(element.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(3);
    (element.querySelectorAll('input')[1] as HTMLInputElement).click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('app-csv-export-button button')!.click();
    await fixture.whenStable();
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('Expected a CSV blob');
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(contents).toBe('"Секция","Индикатори"\r\n"001","R1.1"\r\n"002",""');
    expect(component.data().rows).toBe(data.rows);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('keeps at least one column selected and cancels without downloading', async () => {
    const { fixture, component, create, closed, element } = await setup();
    component.toggleColumn(0); component.toggleColumn(2); component.toggleColumn(1);
    await fixture.whenStable();
    expect([...component.selectedColumns()]).toEqual([1]);
    expect(element.querySelectorAll('input:disabled')).toHaveLength(1);
    [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Отказ')!.click();
    await fixture.whenStable();
    expect(create).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('retains the dialog and column selection after download failure and permits retry', async () => {
    const { fixture, component, create, closed, element } = await setup();
    create.mockImplementationOnce(() => { throw new Error('blocked'); });
    component.toggleColumn(1);
    const button = element.querySelector<HTMLButtonElement>('app-csv-export-button button')!;
    button.click(); await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Файлът не може да бъде изтеглен');
    expect(closed).not.toHaveBeenCalled();
    expect([...component.selectedColumns()]).toEqual([0, 2]);
    button.click(); await fixture.whenStable();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('disables empty exports', async () => {
    const { component, create, closed, element } = await setup({ ...data, rows: [] });
    expect(element.querySelector<HTMLButtonElement>('app-csv-export-button button')!.disabled).toBe(true);
    component.downloadCsv();
    expect(create).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
