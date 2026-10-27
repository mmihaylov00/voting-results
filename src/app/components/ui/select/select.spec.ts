import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../services/theme.service';
import { SelectComponent, partySelectOptions } from './select';

describe('SelectComponent', () => {
  const darkMode = signal(false);

  beforeEach(() => {
    darkMode.set(false);
    TestBed.configureTestingModule({ imports: [SelectComponent], providers: [
      { provide: ThemeService, useValue: { darkMode } },
    ] });
  });

  async function render() {
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('label', 'Партия');
    fixture.componentRef.setInput('value', '1');
    fixture.componentRef.setInput('options', partySelectOptions([{ id: '1', name: 'ПП-ДБ' }, { id: '2', name: 'ГЕРБ-СДС' }]));
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance, trigger: fixture.nativeElement.querySelector('button') as HTMLButtonElement };
  }

  it('uses consistent party names and theme colors in the trigger and every option', async () => {
    const { fixture, trigger } = await render();
    expect(trigger.textContent).toContain('ПП-ДБ');
    const swatch = trigger.querySelector<HTMLElement>('.party-swatch')!;
    const lightColor = swatch.style.backgroundColor;
    trigger.click(); await fixture.whenStable();
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options.every(option => option.querySelector('.party-swatch'))).toBe(true);
    darkMode.set(true); await fixture.whenStable();
    expect(swatch.style.backgroundColor).not.toBe(lightColor);
    expect(swatch.style.backgroundColor).toBe(document.querySelector<HTMLElement>('[role="option"] .party-swatch')!.style.backgroundColor);
    expect(partySelectOptions([{ id: '3', name: 'ПрБ' }])[0].label).toBe('ПБ');
  });

  it('emits an option selection and ignores values outside the available options', async () => {
    const { fixture, component, trigger } = await render();
    const changed = vi.fn(); component.valueChange.subscribe(changed);
    trigger.click(); await fixture.whenStable();
    const options = document.querySelectorAll<HTMLButtonElement>('[role="option"]');
    options[1].click(); await fixture.whenStable();
    expect(changed).toHaveBeenCalledExactlyOnceWith('2');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    component.selectValue('unknown'); component.selectValue(['1', '2']);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('orders party choices by votes without changing the selected identity or emitting a change', async () => {
    const { fixture, component, trigger } = await render();
    const parties = [{ id: '1', name: 'ПП-ДБ' }, { id: '2', name: 'ГЕРБ-СДС' }];
    const changed = vi.fn(); component.valueChange.subscribe(changed);
    fixture.componentRef.setInput('options', partySelectOptions(parties, { '1': 10, '2': 90 }));
    await fixture.whenStable();
    expect(component.value()).toBe('1');
    expect(trigger.textContent).toContain('ПП-ДБ');
    trigger.click(); await fixture.whenStable();
    expect([...document.querySelectorAll('[role="option"]')].map(option => option.textContent?.trim())).toEqual(['ГЕРБ-СДС', 'ПП-ДБ']);
    expect(changed).not.toHaveBeenCalled();
    expect(parties.map(party => party.id)).toEqual(['1', '2']);
  });

  it('shows option icons, supports keyboard opening and closes on Escape without bubbling', async () => {
    const { fixture, trigger } = await render();
    fixture.componentRef.setInput('options', [{ value: '1', label: 'Райони', icon: 'region' }, { value: '2', label: 'Чужбина', icon: 'globe' }]);
    await fixture.whenStable();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = document.querySelector('[role="listbox"]')!;
    expect([...menu.querySelectorAll('[role="option"]')].every(option => option.querySelector('app-map-icon'))).toBe(true);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    menu.dispatchEvent(escape); await fixture.whenStable();
    expect(escape.defaultPrevented).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('preserves the null option used to clear historical party selections', async () => {
    const { fixture, component, trigger } = await render();
    fixture.componentRef.setInput('options', [{ value: null, label: 'Изберете', icon: 'users' },
      ...partySelectOptions([{ id: '1', name: 'ПП-ДБ' }])]);
    await fixture.whenStable();
    const changed = vi.fn(); component.valueChange.subscribe(changed);
    trigger.click(); await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    await fixture.whenStable();
    expect(changed).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('keeps options inside a native modal dialog and removes its overlay on destruction', async () => {
    const { fixture, trigger } = await render();
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', '');
    document.body.appendChild(dialog); dialog.appendChild(fixture.nativeElement);
    trigger.click(); await fixture.whenStable();
    expect(dialog.querySelector('[role="listbox"]')).not.toBeNull();
    fixture.destroy();
    expect(dialog.querySelector('.cdk-overlay-container')).toBeNull();
    dialog.remove();
  });
});
