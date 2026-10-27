import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VirtualCardsComponent } from './virtual-cards';

@Component({
  imports: [VirtualCardsComponent],
  template: `<app-virtual-cards [items]="items" label="Тестови карти"><ng-template let-item><button>{{ item.id }}</button></ng-template></app-virtual-cards>`,
})
class CardsHost {
  items = Array.from({ length: 10000 }, (_, index) => ({ id: String(index) }));
}

describe('virtual cards', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('renders a bounded window, reaches the final card and resets after filtering', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
      return new DOMRect(0, 0, 500, this.hasAttribute('data-virtual-index') ? 300 : 500);
    });
    const fixture = TestBed.createComponent(CardsHost);
    await fixture.whenStable();
    const viewport = fixture.nativeElement.querySelector('[role="list"]') as HTMLElement;
    const cards = () => viewport.querySelectorAll('[role="listitem"]');
    expect(cards().length).toBeLessThan(100);
    expect(cards()[0].getAttribute('aria-setsize')).toBe('10000');
    viewport.scrollTop = Number.MAX_SAFE_INTEGER;
    viewport.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(cards()[cards().length - 1].textContent?.trim()).toBe('9999');
    expect(cards().length).toBeLessThan(100);
    fixture.componentInstance.items = [{ id: 'filtered' }];
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(viewport.scrollTop).toBe(0);
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain('filtered');
  });

  it('regroups responsive columns, preserves accessible positions and handles focus when cards scroll away', async () => {
    const style = document.createElement('div').style;
    style.setProperty('--card-columns', '4');
    vi.stubGlobal('getComputedStyle', () => style);
    const callbacks: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(() => callback([], this)); }
      observe() {} unobserve() {} disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300));
    const fixture = TestBed.createComponent(CardsHost);
    await fixture.whenStable();
    const viewport = fixture.nativeElement.querySelector('[role="list"]') as HTMLElement;
    expect(viewport.querySelector('[data-virtual-index]')?.children).toHaveLength(4);
    expect(viewport.querySelector('[role="listitem"]')?.getAttribute('aria-posinset')).toBe('1');
    viewport.querySelector('button')!.focus();
    viewport.scrollTop = 50000; viewport.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(document.activeElement).toBe(viewport);
    style.setProperty('--card-columns', '2');
    callbacks.forEach(callback => callback());
    await fixture.whenStable();
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.querySelector('[data-virtual-index]')?.children).toHaveLength(2);
    expect(viewport.querySelector('[role="listitem"]')?.getAttribute('aria-posinset')).toBe('1');
  });
});
