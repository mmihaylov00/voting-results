import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ViewTab, ViewTabsComponent } from './view-tabs';

@Component({
  imports: [ViewTabsComponent],
  template: `<app-view-tabs [tabs]="tabs" [(value)]="selected" label="Изглед" idPrefix="shared-tabs" panelId="shared-details" />
    <div id="shared-details" role="tabpanel" [attr.aria-labelledby]="'shared-tabs-tab-' + selected()">{{ selected() }}</div>`,
})
class SharedPanelHost {
  readonly tabs: readonly ViewTab[] = [{ id: 'map', label: 'Карта' }, { id: 'table', label: 'Таблица' }];
  readonly selected = signal('map');
}

describe('ViewTabsComponent', () => {
  const tabs: readonly ViewTab[] = [
    { id: 'map', label: 'Карта' },
    { id: 'table', label: 'Таблица', count: 12500 },
    { id: 'review', label: 'За преглед', count: 0 },
  ];

  async function render() {
    const fixture = TestBed.createComponent(ViewTabsComponent);
    fixture.componentRef.setInput('tabs', tabs);
    fixture.componentRef.setInput('value', 'map');
    fixture.componentRef.setInput('label', 'Изглед на секциите');
    fixture.componentRef.setInput('idPrefix', 'sections');
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance,
      buttons: [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')] };
  }

  it('labels the tab list and connects each tab to its panel with one tab stop', async () => {
    const { fixture, buttons } = await render();
    expect(fixture.nativeElement.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe('Изглед на секциите');
    expect(buttons.map(button => button.id)).toEqual(['sections-tab-map', 'sections-tab-table', 'sections-tab-review']);
    expect(buttons.map(button => button.getAttribute('aria-controls'))).toEqual(['sections-panel-map', 'sections-panel-table', 'sections-panel-review']);
    expect(buttons.map(button => button.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(buttons.map(button => button.tabIndex)).toEqual([0, -1, -1]);
    expect(buttons.map(button => button.dataset['state'])).toEqual(['active', 'inactive', 'inactive']);
    expect(buttons[0].querySelector('.count')).toBeNull();
    expect(buttons[1].querySelector('.count')?.textContent?.trim()).toBe((12500).toLocaleString('bg-BG'));
    expect(buttons[2].querySelector('.count')?.textContent?.trim()).toBe('0');
  });

  it('updates the model and active state when a tab is clicked', async () => {
    const { fixture, component, buttons } = await render();
    const changed = vi.fn();
    component.value.subscribe(changed);
    buttons[1].click();
    await fixture.whenStable();
    expect(component.value()).toBe('table');
    expect(changed).toHaveBeenCalledExactlyOnceWith('table');
    expect(buttons.map(button => button.tabIndex)).toEqual([-1, 0, -1]);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
  });

  it('selects and focuses adjacent tabs and wraps in both directions', async () => {
    const { fixture, component, buttons } = await render();
    buttons[0].focus();
    for (const [from, key, expected] of [[0, 'ArrowLeft', 2], [2, 'ArrowRight', 0], [0, 'ArrowRight', 1]] as const) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      buttons[from].dispatchEvent(event);
      await fixture.whenStable();
      expect(event.defaultPrevented).toBe(true);
      expect(component.value()).toBe(tabs[expected].id);
      expect(document.activeElement).toBe(buttons[expected]);
      expect(buttons[expected].tabIndex).toBe(0);
    }
  });

  it('supports Home and End without intercepting unrelated keys', async () => {
    const { fixture, component, buttons } = await render();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(component.value()).toBe('review');
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(component.value()).toBe('map');
    expect(document.activeElement).toBe(buttons[0]);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(component.value()).toBe('map');
  });

  it('reflects a parent selection without emitting a user change', async () => {
    const { fixture, component, buttons } = await render();
    const changed = vi.fn();
    component.value.subscribe(changed);
    fixture.componentRef.setInput('value', 'review');
    await fixture.whenStable();
    expect(buttons.map(button => button.tabIndex)).toEqual([-1, -1, 0]);
    expect(buttons[2].getAttribute('aria-selected')).toBe('true');
    expect(changed).not.toHaveBeenCalled();
  });

  it('links every tab to a shared existing panel while keyboard selection updates its label', async () => {
    const fixture = TestBed.createComponent(SharedPanelHost);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panel = root.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(buttons.every(button => root.querySelector('#' + button.getAttribute('aria-controls')) === panel)).toBe(true);
    expect(panel.getAttribute('aria-labelledby')).toBe(buttons[0].id);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('table');
    expect(document.activeElement).toBe(buttons[1]);
    expect(panel.getAttribute('aria-labelledby')).toBe(buttons[1].id);
    expect(buttons.every(button => button.getAttribute('aria-controls') === panel.id)).toBe(true);
  });
});
