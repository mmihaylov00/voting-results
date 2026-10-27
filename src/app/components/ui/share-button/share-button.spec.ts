import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MapIconComponent } from '../map-icon/map-icon';
import { ShareButtonComponent } from './share-button';

describe('ShareButtonComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ShareButtonComponent] }));
  afterEach(() => vi.useRealTimers());

  function render(action = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)) {
    const fixture = TestBed.createComponent(ShareButtonComponent);
    fixture.componentRef.setInput('action', action);
    fixture.detectChanges();
    return { fixture, action, component: fixture.componentInstance,
      button: fixture.nativeElement.querySelector('button') as HTMLButtonElement,
      icon: () => fixture.debugElement.query(By.directive(MapIconComponent)).componentInstance as MapIconComponent };
  }

  it('shows a share icon and label, then green confirmation and a checked box for exactly 1.5 seconds', async () => {
    vi.useFakeTimers();
    const { fixture, action, button, icon } = render();
    expect(button.textContent?.trim()).toBe('Сподели');
    expect(icon().name).toBe('share');
    button.click(); await Promise.resolve(); fixture.detectChanges();
    expect(action).toHaveBeenCalledOnce();
    expect(button.textContent?.trim()).toBe('Копирано');
    expect(icon().name).toBe('square-check');
    expect(button.classList.contains('border-emerald-600')).toBe(true);
    expect(button.querySelector('[aria-live="polite"]')).not.toBeNull();
    vi.advanceTimersByTime(1499); fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('Копирано');
    vi.advanceTimersByTime(1); fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('Сподели');
    expect(icon().name).toBe('share');
    expect(button.classList.contains('border-emerald-600')).toBe(false);
  });

  it('restarts the confirmation timer when sharing again', async () => {
    vi.useFakeTimers();
    const { component } = render();
    await component.share();
    vi.advanceTimersByTime(1000);
    await component.share();
    vi.advanceTimersByTime(1499);
    expect(component.copied()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(component.copied()).toBe(false);
  });

  it('leaves the normal state when copying fails, clearing any previous confirmation', async () => {
    vi.useFakeTimers();
    const { fixture, component, action, button } = render();
    await component.share();
    action.mockResolvedValueOnce(false);
    await component.share(); fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('Сподели');
    expect(component.copied()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prevents duplicate requests while copying and restores the button afterwards', async () => {
    vi.useFakeTimers();
    let resolve!: (value: boolean) => void;
    const action = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const { fixture, component, button } = render(action);
    const pending = component.share(); fixture.detectChanges();
    expect(button.disabled).toBe(true);
    await component.share();
    expect(action).toHaveBeenCalledOnce();
    resolve(true); await pending; fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('false');
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves action errors and clears pending state without showing success', async () => {
    const error = new Error('Navigation failed');
    const { component } = render(vi.fn().mockRejectedValue(error));
    await expect(component.share()).rejects.toBe(error);
    expect(component.pending()).toBe(false);
    expect(component.copied()).toBe(false);
  });

  it('does not schedule confirmation after a pending share button is destroyed', async () => {
    vi.useFakeTimers();
    let resolve!: (value: boolean) => void;
    const { fixture, component } = render(vi.fn(() => new Promise<boolean>(done => { resolve = done; })));
    const pending = component.share();
    fixture.detectChanges();
    fixture.destroy();
    resolve(true); await pending;
    expect(component.copied()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
