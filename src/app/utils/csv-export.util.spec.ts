import { createCsv, downloadCsvFile } from './csv-export.util';

describe('CSV exports', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('uses UTF-8 BOM, comma-separated quoted cells and CRLF while preserving Bulgarian text, zeroes and missing values', () => {
    expect(createCsv([
      ['Кандидат', 'Гласове', 'Промяна', 'Липсващи'],
      ['Иван "Иво", Иванов\nСофия', 0, -12.5, null, undefined, NaN, Infinity],
    ])).toBe('\uFEFF"Кандидат","Гласове","Промяна","Липсващи"\r\n"Иван ""Иво"", Иванов\nСофия","0","-12.5","","","",""');
  });

  it('escapes spreadsheet formulas including whitespace prefixes without changing numeric differences', () => {
    const cells = ['=SUM(1,2)', '+123', '-123', '@SUM(1)', '  =1+1', '\ttext', '\rtext', '\ntext'];
    const csv = createCsv([cells, [-123, 123]]);
    for (const cell of cells) expect(csv).toContain(`"'${cell}"`);
    expect(csv).toContain('\r\n"-123","123"');
  });

  it('downloads through a temporary anchor and releases its URL after the browser receives the click', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe('results.csv');
      expect(this.href).toBe('blob:csv-test');
    });
    downloadCsvFile(createCsv([['България', 42]]), 'results.csv');
    expect(click).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((create.mock.calls[0][0] as Blob).type).toBe('text/csv;charset=utf-8;');
    expect(document.querySelector('a[href="blob:csv-test"]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:csv-test');
  });

  it('cleans up a failed download and lets the caller show the error', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => downloadCsvFile('contents', 'results.csv')).toThrow('blocked');
    expect(document.querySelector('a[href="blob:csv-test"]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:csv-test');
  });
});
