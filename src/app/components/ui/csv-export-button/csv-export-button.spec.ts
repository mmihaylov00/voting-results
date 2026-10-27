import { TestBed } from '@angular/core/testing';
import { CsvExportButtonComponent } from './csv-export-button';

function setup(action: () => void | Promise<void>) {
  const fixture = TestBed.createComponent(CsvExportButtonComponent);
  fixture.componentRef.setInput('action', action);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component: fixture.componentInstance, element, button: element.querySelector('button')! };
}

describe('CSV export button', () => {
  it('uses the same outlined button, table icon and label and prevents disabled exports', async () => {
    const action = vi.fn();
    const { fixture, component, button } = setup(action);
    expect(button.textContent?.trim()).toBe('Експорт CSV');
    expect(button.title).toBe('Експорт CSV');
    expect(button.type).toBe('button');
    expect(button.classList.contains('border')).toBe(true);
    expect(button.classList.contains('h-10')).toBe(true);
    expect(button.querySelector('app-map-icon svg[aria-hidden="true"]')).not.toBeNull();
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    button.click();
    await component.export();
    expect(button.disabled).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('prevents duplicate exports while work is pending and signals success afterward', async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>(resolve => finish = resolve));
    const { fixture, component, button } = setup(action);
    const exported = vi.fn(); component.exported.subscribe(exported);
    const pending = component.export(); fixture.detectChanges();
    await component.export();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(action).toHaveBeenCalledOnce();
    expect(exported).not.toHaveBeenCalled();
    finish(); await pending; fixture.detectChanges();
    expect(exported).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
  });

  it('shows a common error, keeps the action available and clears the error on retry', async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined);
    const { fixture, component, element, button } = setup(action);
    const exported = vi.fn(); component.exported.subscribe(exported);
    await component.export(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Файлът не може да бъде изтеглен. Опитайте отново.');
    expect(button.disabled).toBe(false);
    expect(exported).not.toHaveBeenCalled();
    await component.export(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(exported).toHaveBeenCalledOnce();
  });

  it('does not emit completion after the view is destroyed', async () => {
    let finish!: () => void;
    const { fixture, component } = setup(() => new Promise<void>(resolve => finish = resolve));
    const exported = vi.fn(); component.exported.subscribe(exported);
    const pending = component.export();
    fixture.destroy(); finish(); await pending;
    expect(exported).not.toHaveBeenCalled();
  });
});
