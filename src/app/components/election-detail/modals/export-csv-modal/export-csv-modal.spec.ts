import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ModalPageService } from '../../../../services/modal-page.service';
import { ExportCsvModalComponent } from './export-csv-modal';

describe('Export modal page navigation', () => {
  it.each(['Отказ', 'Експорт 0 записа'])('closes the page URL when using %s', async label => {
    TestBed.configureTestingModule({ imports: [ExportCsvModalComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ExportCsvModalComponent);
    const closePage = vi.spyOn(TestBed.inject(ModalPageService), 'close');
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    const download = vi.spyOn(fixture.componentInstance, 'downloadCsv').mockImplementation(() => {});
    await fixture.whenStable();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(button => button.textContent?.trim() === label)!;
    button.click();
    expect(closePage).toHaveBeenCalledWith('export');
    expect(closed).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledTimes(label === 'Отказ' ? 0 : 1);
  });
});
