import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ContestantDirectoryEntry, contestantDirectory } from '../../utils/contestant-directory.util';
import { ContestantSummary } from '../../utils/contestant-profile.util';
import { getContestantImage } from '../../utils/contestant-image.util';
import { ContestantDetailModalComponent } from '../contestant-detail-modal/contestant-detail-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { ContestantPreviewDirective } from '../ui/contestant-preview/contestant-preview.directive';
import { SearchFilterComponent } from '../ui/search-filter/search-filter';
import { PreferenceDirectoryComponent } from './preference-directory';
import { SelectComponent, SelectOption } from '../ui/select/select';
import { VirtualCardsComponent } from '../ui/virtual-cards/virtual-cards';

@Component({
  selector: 'app-contestant-directory',
  standalone: true,
  imports: [CommonModule, RouterLink, HlmButtonDirective, HlmCardDirective, SearchFilterComponent,
    ContestantPreviewDirective, ContestantDetailModalComponent, PreferenceDirectoryComponent, SelectComponent, VirtualCardsComponent],
  templateUrl: './contestant-directory.html',
})
export class ContestantDirectoryComponent implements OnInit, OnDestroy {
  private readonly elections = inject(ElectionService);
  readonly type = this.elections.electionType;
  readonly presidential = this.type === 'presidential';
  readonly preferencesView = toSignal(inject(ActivatedRoute).queryParamMap.pipe(
    map(params => !this.presidential && params.get('tab') === 'preferences'),
  ), { initialValue: false });
  readonly dateOptions: SelectOption[] = [{ value: 'all', label: 'Всички избори', icon: 'calendar' },
    ...[...this.elections.getDates()].sort((a, b) => b.date.localeCompare(a.date))
      .map(election => ({ value: election.date, label: election.name, icon: 'calendar' as const }))];
  readonly selectedDate = signal('all');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  private readonly summaries = signal<Record<string, ContestantSummary>>({});
  readonly entries = computed(() => contestantDirectory(this.type, this.elections.getDates(), this.summaries(),
    this.selectedDate() === 'all' ? undefined : this.selectedDate()));
  readonly selectedContestant = signal<ContestantDirectoryEntry | null>(null);
  readonly failedImages = signal<ReadonlySet<string>>(new Set());
  private generation = 0;
  readonly cards = computed(() => this.entries().map(entry => {
    const words = entry.displayName.trim().split(/\s+/);
    const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toLocaleUpperCase('bg');
    return { ...entry, image: getContestantImage(entry.name, this.type), initials };
  }));
  readonly filteredCards = computed(() => {
    const query = this.search().normalize('NFC').trim().toLocaleLowerCase('bg');
    const terms = query.split(/\s+/);
    const cards = this.cards();
    return query ? cards.filter(entry => [entry.displayName, ...entry.names]
      .some(name => {
        const normalized = name.normalize('NFC').toLocaleLowerCase('bg');
        return terms.every(term => normalized.includes(term));
      })) : cards;
  });

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.generation++; }

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const summaries = await firstValueFrom(this.elections.getAllData());
      if (generation !== this.generation) return;
      this.summaries.set(summaries);
    } catch {
      if (generation === this.generation) this.error.set('Профилите не могат да бъдат заредени. Опитайте отново.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  imageFailed(src: string): void {
    this.failedImages.update(images => new Set([...images, src]));
  }
}
