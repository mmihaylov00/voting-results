import { TableControlsComponent, TableColumns } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
import { Region } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import { comparisonDelta } from '../../utils/comparison-display.util';
import { getCikUrl } from '../../utils/election-links';
import { topElectoralRegions } from '../../utils/geography.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { DemographicBreakdownComponent } from './demographic-breakdown';
import { VoteOriginsComponent } from './vote-origins';

@Component({
  selector: 'app-election-geography',
  standalone: true,
  imports: [TableControlsComponent, SortableTableHeaderComponent, LoadingBarComponent, CommonModule, RouterLink, HlmButtonDirective, BaseModalComponent, DemographicBreakdownComponent, VoteOriginsComponent],
  templateUrl: './election-geography.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElectionGeographyComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly elections = inject(ElectionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  readonly modalPages = inject(ModalPageService);
  readonly methodOpen = signal(false);
  readonly date = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly regions = signal<Region[]>([]);
  readonly previous = signal<Region[] | null>(null);
  readonly previousDate = signal('');
  readonly parties = signal<Record<string, string>>({});
  readonly rows = computed(() => topElectoralRegions(this.regions(), this.previous()));
  readonly tableColumns: TableColumns<ReturnType<typeof topElectoralRegions>[number]> = {
    name: row => row.name, winner: row => row.winnerId ? this.partyName(row.winnerId) : row.tied ? 'Равенство' : null,
    voted: row => row.voted, turnout: row => row.turnout, machineShare: row => row.machineShare,
    share: row => row.share, change: row => row.share !== null && row.priorShare !== null ? row.share - row.priorShare : null,
  };
  readonly delta = comparisonDelta;
  readonly cikUrl = getCikUrl;
  readonly tabs = [
    { id: 'regions', label: 'Топ изборни райони' },
    { id: 'origins', label: 'Откъде дойдоха гласовете' },
    { id: 'demographics', label: 'Демографски разделения' },
  ] as const;
  readonly activeTab = signal<'regions' | 'origins' | 'demographics'>('regions');
  readonly visitedTabs = signal(new Set(['regions']));

  constructor() {
    effect(() => {
      if (this.modalPages.isActive('vote-origin-method')) this.selectTab('origins');
      else if (this.modalPages.isActive('demographic-method')) this.selectTab('demographics');
      else if (this.modalPages.isActive('region-method')) this.selectTab('regions');
    });
    this.route.paramMap.pipe(
      map(params => params.get('date') ?? ''), distinctUntilChanged(),
      switchMap(date => {
        this.methodOpen.set(false);
        this.date.set(date);
        this.loading.set(true);
        this.error.set('');
        this.regions.set([]);
        this.previous.set(null);
        const dates = this.elections.getDates();
        if (this.elections.electionType !== 'governmental' || !dates.some(election => election.date === date)) {
          this.error.set('Избери парламентарни избори от архива.');
          this.loading.set(false);
          return EMPTY;
        }
        const prior = dates.filter(election => election.date < date).sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? '';
        this.previousDate.set(prior);
        return forkJoin({
          regions: this.elections.getRegions(date), parties: this.elections.getParties(date),
          previous: prior ? this.elections.getRegions(prior).pipe(catchError(() => of(null))) : of(null),
        }).pipe(catchError(() => { this.error.set('Районите не могат да бъдат заредени.'); return of(null); }));
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      if (data) { this.regions.set(data.regions); this.parties.set(data.parties); this.previous.set(data.previous); }
      this.loading.set(false);
    });
  }

  partyName(id: string): string {
    return getPartyDisplayName(this.parties()[id] ?? `Листа № ${id}`);
  }

  selectTab(tab: 'regions' | 'origins' | 'demographics'): void {
    this.activeTab.set(tab);
    if (!this.visitedTabs().has(tab)) this.visitedTabs.update(tabs => new Set([...tabs, tab]));
  }

  color(id: string | null): string {
    return getPartyColor(id ? this.parties()[id] : null, this.theme.darkMode());
  }
}
