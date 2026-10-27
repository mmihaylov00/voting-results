import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../services/theme.service';
import { PartyFilterComponent } from './party-filter';

describe('PartyFilterComponent', () => {
  it('uses scope votes instead of party priority and reorders without changing the selection', async () => {
    TestBed.configureTestingModule({ imports: [PartyFilterComponent], providers: [
      { provide: ThemeService, useValue: { darkMode: () => false } },
    ] });
    const fixture = TestBed.createComponent(PartyFilterComponent);
    const parties = [{ id: '1', name: 'ПП-ДБ' }, { id: '2', name: 'ГЕРБ-СДС' }, { id: '3', name: 'ПБ' }, { id: '0', name: 'Други' }];
    const selected = new Set(['2']);
    fixture.componentRef.setInput('parties', parties);
    fixture.componentRef.setInput('selectedPartyIds', selected);
    fixture.componentRef.setInput('partyVotes', { '1': 20, '2': 50, '3': 80, '0': 100 });
    await fixture.whenStable();
    const changed = vi.fn(); fixture.componentInstance.selectedPartyIdsChange.subscribe(changed);
    expect(fixture.componentInstance.sortedParties.map(party => party.id)).toEqual(['3', '2', '1']);
    fixture.componentRef.setInput('partyVotes', { '1': 100, '2': 20, '3': 80 });
    await fixture.whenStable();
    expect(fixture.componentInstance.sortedParties.map(party => party.id)).toEqual(['1', '3', '2']);
    expect(fixture.componentInstance.selectedPartyIds).toBe(selected);
    expect(changed).not.toHaveBeenCalled();
    expect(parties.map(party => party.id)).toEqual(['1', '2', '3', '0']);
  });

  it('colors selected parties and menu choices while preserving selection events and theme updates', async () => {
    const darkMode = signal(false);
    TestBed.configureTestingModule({ imports: [PartyFilterComponent], providers: [
      { provide: ThemeService, useValue: { darkMode } },
    ] });
    const fixture = TestBed.createComponent(PartyFilterComponent);
    const selected = new Set(['1']);
    fixture.componentRef.setInput('parties', [{ id: '1', name: 'ПП-ДБ' }, { id: '2', name: 'ГЕРБ-СДС' }]);
    fixture.componentRef.setInput('selectedPartyIds', selected);
    await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const swatch = trigger.querySelector<HTMLElement>('span[style]')!;
    const lightColor = swatch.style.backgroundColor;
    expect(lightColor).toBeTruthy();
    trigger.click(); await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(host.querySelectorAll('[aria-hidden="true"][style]')).toHaveLength(2);
    darkMode.set(true); await fixture.whenStable();
    expect(swatch.style.backgroundColor).not.toBe(lightColor);
    const changed = vi.fn(); fixture.componentInstance.selectedPartyIdsChange.subscribe(changed);
    fixture.componentInstance.toggleParty('2');
    expect(changed).toHaveBeenCalledExactlyOnceWith(new Set(['1', '2']));
    expect(selected).toEqual(new Set(['1']));
  });
});
