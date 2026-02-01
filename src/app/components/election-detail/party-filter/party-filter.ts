import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { getPartyAlias } from '../../../utils/party-aliases';

@Component({
  selector: 'app-party-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
  ],
  templateUrl: './party-filter.html',
  host: {
    '(document:click)': 'closeDropdown()'
  }
})
export class PartyFilterComponent {
  @Input() parties: { id: string, name: string }[] = [];
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() showVotes: boolean = false;
  @Input() partyVotes?: { [partyId: string]: number };
  @Output() selectedPartyIdsChange = new EventEmitter<Set<string>>();

  showDropdown = signal<boolean>(false);

  get sortedParties(): { id: string, name: string }[] {
    const priorityOrder = [
      'ПП-ДБ',
      'ГЕРБ',
      'ДПС',
      'БСП',
      'ВЪЗРАЖДАНЕ',
      'ИТН',
      'МЕЧ',
      'ВЕЛИЧИЕ'
    ];

    const priorityParties: Array<{ party: { id: string, name: string }, index: number }> = [];
    const otherParties: { id: string, name: string }[] = [];

    this.parties.forEach(party => {
      if (party.id === '0') return; // Skip "Others"
      
      const alias = getPartyAlias(party.name).toUpperCase();
      const nameUpper = party.name.toUpperCase();
      
      // Check both alias and original name for matching
      const priorityIndex = priorityOrder.findIndex(p => {
        const pUpper = p.toUpperCase();
        return alias.includes(pUpper) || nameUpper.includes(pUpper);
      });
      
      if (priorityIndex !== -1) {
        priorityParties.push({ party, index: priorityIndex });
      } else {
        otherParties.push(party);
      }
    });

    // Sort priority parties by their index in the priority order
    priorityParties.sort((a, b) => a.index - b.index);
    
    // Sort other parties alphabetically by alias
    otherParties.sort((a, b) => {
      const aliasA = getPartyAlias(a.name).toUpperCase();
      const aliasB = getPartyAlias(b.name).toUpperCase();
      return aliasA.localeCompare(aliasB);
    });

    return [...priorityParties.map(p => p.party), ...otherParties];
  }

  get allSelected(): boolean {
    return this.sortedParties.length > 0 && this.sortedParties.every(p => this.selectedPartyIds.has(p.id));
  }

  get someSelected(): boolean {
    return this.selectedPartyIds.size > 0 && !this.allSelected;
  }

  toggleParty(partyId: string): void {
    const newSet = new Set(this.selectedPartyIds);
    if (newSet.has(partyId)) {
      newSet.delete(partyId);
    } else {
      newSet.add(partyId);
    }
    this.selectedPartyIdsChange.emit(newSet);
  }

  selectAll(): void {
    const newSet = new Set(this.sortedParties.map(p => p.id));
    this.selectedPartyIdsChange.emit(newSet);
  }

  deselectAll(): void {
    this.selectedPartyIdsChange.emit(new Set());
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.showDropdown.set(!this.showDropdown());
  }

  closeDropdown(): void {
    this.showDropdown.set(false);
  }

  getPartyAlias = getPartyAlias;
}
