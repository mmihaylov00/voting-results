import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ContestantSummary, contestantPreferences, isSyntheticContestant } from '../../utils/contestant-profile.util';
import { partyIdentity } from '../../utils/election-comparison.util';
import { getContestantImage } from '../../utils/contestant-image.util';
import { partyVoteTotals } from '../../utils/party-order.util';
import { PreferenceDirectoryData, PreferenceDirectoryEntry, preferenceDirectory } from '../../utils/preference-directory.util';
import { CandidateDetailModalComponent } from '../election-detail/modals/candidate-detail-modal/candidate-detail-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { ContestantPreviewDirective } from '../ui/contestant-preview/contestant-preview.directive';
import { PartyBadgeComponent } from '../ui/party-badge/party-badge';
import { SearchFilterComponent } from '../ui/search-filter/search-filter';
import { SelectComponent, SelectOption, partySelectOptions } from '../ui/select/select';
import { VirtualCardsComponent } from '../ui/virtual-cards/virtual-cards';

@Component({
  selector: 'app-preference-directory',
  standalone: true,
  imports: [CommonModule, HlmButtonDirective, HlmCardDirective, SelectComponent, SearchFilterComponent,
    PartyBadgeComponent, ContestantPreviewDirective, CandidateDetailModalComponent, VirtualCardsComponent],
  templateUrl: './preference-directory.html',
})
export class PreferenceDirectoryComponent implements OnInit, OnDestroy {
  private readonly elections = inject(ElectionService);
  readonly dates = [...this.elections.getDates()].filter(election => election.type === 'governmental')
    .sort((left, right) => right.date.localeCompare(left.date));
  readonly dateOptions: SelectOption[] = [{ value: 'all', label: 'Всички избори', icon: 'calendar' },
    ...this.dates.map(election => ({ value: election.date, label: election.name, icon: 'calendar' as const }))];
  readonly selectedDate = signal('all');
  readonly selectedParty = signal('all');
  readonly leadersOnly = signal(false);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly processed = signal(0);
  readonly error = signal('');
  readonly selectedCandidate = signal<PreferenceDirectoryEntry | null>(null);
  readonly failedImages = signal<ReadonlySet<string>>(new Set());
  private readonly summaries = signal<Record<string, ContestantSummary>>({});
  private readonly data = signal<Record<string, PreferenceDirectoryData>>({});
  private generation = 0;
  private readonly images = new Map<string, ReturnType<typeof getContestantImage>>();

  readonly entries = computed(() => preferenceDirectory(this.dates, this.data(),
    this.selectedDate() === 'all' ? undefined : this.selectedDate()));
  readonly partyOptions = computed<SelectOption[]>(() => {
    const parties = new Map<string, { id: string; name: string; total: number }>();
    for (const election of this.dates) {
      if (this.selectedDate() !== 'all' && election.date !== this.selectedDate()) continue;
      const summary = this.summaries()[election.date];
      if (!summary) continue;
      const votes = partyVoteTotals(summary.regions);
      for (const [ballot, name] of Object.entries(summary.parties)) {
        const id = partyIdentity(name);
        if (!isSyntheticContestant(name, ballot) && !parties.has(id)) parties.set(id, { id, name, total: votes[ballot] ?? 0 });
      }
    }
    return [{ value: 'all', label: 'Всички партии', icon: 'users' }, ...partySelectOptions([...parties.values()])];
  });
  readonly cards = computed(() => this.entries().map(entry => {
    const words = entry.name.trim().split(/\s+/);
    return { ...entry,
      initials: (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase('bg'),
      regionLabel: entry.lists.map(list => list.regionName).join(', ') };
  }));
  readonly filteredCards = computed(() => {
    const terms = this.search().normalize('NFC').trim().toLocaleLowerCase('bg').split(/\s+/).filter(Boolean);
    return this.cards().filter(entry => (this.selectedParty() === 'all' || partyIdentity(entry.partyName) === this.selectedParty())
      && (!this.leadersOnly() || entry.lists.some(list => list.candidateId === '101'))
      && terms.every(term => [entry.name, entry.partyName, entry.regionLabel].join(' ')
        .normalize('NFC').toLocaleLowerCase('bg').includes(term)));
  });

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.generation++; }

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.processed.set(0);
    try {
      const summaries = await firstValueFrom(this.elections.getAllData());
      if (generation !== this.generation) return;
      this.summaries.set(summaries);
      for (const [index, election] of this.dates.entries()) {
        if (!this.data()[election.date]) {
          const sections = await firstValueFrom(this.elections.getSections(election.date, undefined, false));
          if (generation !== this.generation) return;
          const rows = contestantPreferences(sections);
          this.data.update(data => ({ ...data, [election.date]: { rows, regions: summaries[election.date]?.regions ?? [] } }));
        }
        this.processed.set(index + 1);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (generation !== this.generation) return;
      }
    } catch {
      if (generation === this.generation) this.error.set('Преференциите не могат да бъдат заредени. Опитайте отново.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  changeDate(date: string): void {
    if (date !== 'all' && !this.dates.some(election => election.date === date)) return;
    this.selectedDate.set(date);
    this.selectedParty.set('all');
  }

  imageFailed(src: string): void { this.failedImages.update(images => new Set([...images, src])); }
  imageFor(name: string) {
    if (!this.images.has(name)) this.images.set(name, getContestantImage(name, 'presidential'));
    return this.images.get(name) ?? null;
  }
}
