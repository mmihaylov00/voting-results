import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges, ElementRef, Inject, OnDestroy } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { getPartyAlias } from '../../../utils/party-aliases';
import { getPartyColor, getPartyDisplayName } from '../../../utils/party-colors';
import { PartyBadgeComponent } from '../../ui/party-badge/party-badge';
import { MapIconComponent } from '../../ui/map-icon/map-icon';
import { ThemeService } from '../../../services/theme.service';
import { sortPartiesByVotes } from '../../../utils/party-order.util';

@Component({
  selector: 'app-party-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    PartyBadgeComponent,
    MapIconComponent,
  ],
  templateUrl: './party-filter.html'
})
export class PartyFilterComponent implements OnChanges, OnDestroy {
  @Input() label = 'Партия';
  @Input() parties: { id: string, name: string, total?: number }[] = [];
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() showVotes: boolean = false;
  @Input() position: 'left' | 'right' = 'left';
  @Input() partyVotes?: { [partyId: string]: number };
  @Input() singleSelect: boolean = false;
  @Output() selectedPartyIdsChange = new EventEmitter<Set<string>>();

  showDropdown = signal<boolean>(false);
  private readonly onDocumentClick: (event: MouseEvent) => void;

  get selectedParties() { return this.parties.filter(party => this.selectedPartyIds.has(party.id)).slice(0, 3); }
  partyColor(name: string): string { return getPartyColor(name, this.theme.darkMode()); }

  get selectedPartyName(): string | null {
    if (this.selectedPartyIds.size !== 1) return null;
    const selectedId = Array.from(this.selectedPartyIds)[0];
    const party = this.parties.find(p => p.id === selectedId);
    if (!party) return null;
    return getPartyDisplayName(party.name);
  }

  get sortedParties(): { id: string, name: string }[] {
    return sortPartiesByVotes(this.parties.filter(party => party.id !== '0'), this.partyVotes);
  }

  get allSelected(): boolean {
    return this.sortedParties.length > 0 && this.sortedParties.every(p => this.selectedPartyIds.has(p.id));
  }

  get someSelected(): boolean {
    return this.selectedPartyIds.size > 0 && !this.allSelected;
  }

  toggleParty(partyId: string): void {
    if (this.singleSelect) {
      this.selectedPartyIdsChange.emit(new Set([partyId]));
      this.closeDropdown();
      return;
    }
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

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    @Inject(DOCUMENT) private document: Document,
    private readonly theme: ThemeService,
  ) {
    this.onDocumentClick = (event: MouseEvent) => {
      if (!this.showDropdown()) return;
      const target = event.target as Node | null;
      if (target && this.elementRef.nativeElement.contains(target)) return;
      this.closeDropdown();
    };

    this.document.addEventListener('click', this.onDocumentClick, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Ensure the component updates when selectedPartyIds input changes
    if (changes['selectedPartyIds'] && !changes['selectedPartyIds'].firstChange) {
      // Force change detection by accessing the signal
      this.showDropdown.set(this.showDropdown());
    }
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('click', this.onDocumentClick, true);
  }
}
