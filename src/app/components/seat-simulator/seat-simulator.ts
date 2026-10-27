import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, EMPTY, forkJoin, map, of, switchMap } from 'rxjs';
import officialSeats from '../../../assets/parliament-seats.json';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import {
  allocateSeats, buildNationalBallots, coalitionSeats, MAJORITY_SEATS,
  NationalBallot, NATIONAL_THRESHOLD, PARLIAMENT_SEATS, parseSeatThreshold,
} from '../../utils/seat-allocation.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { ParliamentChartComponent } from '../ui/parliament-chart/parliament-chart';
import { BaseModalComponent } from '../ui/base-modal/base-modal';

type OfficialSeats = { source: string; decision: string; seats: Partial<Record<string, number>> };
const OFFICIAL_SEATS: Partial<Record<string, OfficialSeats>> = officialSeats;

@Component({
  selector: 'app-seat-simulator',
  standalone: true,
  imports: [CommonModule, RouterLink, HlmButtonDirective, HlmInputDirective, HlmTooltipDirective, ParliamentChartComponent, BaseModalComponent],
  templateUrl: './seat-simulator.html',
})
export class SeatSimulatorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elections = inject(ElectionService);
  private readonly destroyRef = inject(DestroyRef);
  readonly modalPages = inject(ModalPageService);
  readonly methodOpen = signal(false);
  private readonly defaultTab = this.route.snapshot.data['view'] === 'simulator' ? 'simulator' : 'mandates';
  readonly activeTab = signal<'mandates' | 'simulator'>(this.defaultTab);
  readonly isMandates = computed(() => this.activeTab() === 'mandates');
  readonly theme = inject(ThemeService);
  readonly date = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly threshold = signal(NATIONAL_THRESHOLD);
  readonly ballots = signal<NationalBallot[]>([]);
  private readonly partyNames = signal<Record<string, string>>({});
  private readonly requestedCoalition = signal<string[]>([]);
  readonly allocation = computed(() => allocateSeats(this.ballots(), this.threshold()));
  readonly mandateAllocation = computed(() => allocateSeats(this.ballots(), NATIONAL_THRESHOLD));
  readonly parliamentaryRows = computed(() => this.allocation().rows.filter((row) => row.seats > 0));
  readonly selectedIds = computed(() => {
    const eligible = new Set(this.parliamentaryRows().map((row) => row.id));
    return new Set(this.requestedCoalition().filter((id) => eligible.has(id)));
  });
  readonly selectedRows = computed(() => this.parliamentaryRows().filter((row) => this.selectedIds().has(row.id)));
  readonly selectedSeats = computed(() => coalitionSeats(this.allocation().rows, this.selectedIds()));
  readonly official = computed(() => OFFICIAL_SEATS[this.date()] ?? null);
  readonly mandateRows = computed(() => {
    const reference = this.official();
    return (reference
      ? Object.entries(reference.seats).map(([id, seats]) => ({ id, name: this.partyNames()[id] || `Листа № ${id}`, seats: seats ?? 0 }))
      : this.mandateAllocation().rows
    ).filter(row => row.seats > 0).sort((left, right) => right.seats - left.seats || left.id.localeCompare(right.id, 'bg', { numeric: true }));
  });
  readonly totalSeats = PARLIAMENT_SEATS;
  readonly majority = MAJORITY_SEATS;
  readonly displayName = getPartyDisplayName;

  constructor() {
    this.route.queryParamMap.pipe(
      map(params => ({ tab: params.get('tab'), threshold: params.get('threshold'), coalition: params.get('coalition') })),
      distinctUntilChanged((previous, current) => previous.tab === current.tab
        && previous.threshold === current.threshold && previous.coalition === current.coalition),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ tab, threshold, coalition }) => {
      this.activeTab.set(tab === 'mandates' || tab === 'simulator' ? tab : this.defaultTab);
      this.threshold.set(parseSeatThreshold(threshold));
      this.requestedCoalition.set((coalition ?? '').split(',').filter(Boolean).slice(0, 100));
    });
    this.route.paramMap.pipe(
      map((params) => params.get('date') ?? ''),
      distinctUntilChanged(),
      switchMap((date) => {
        this.methodOpen.set(false);
        this.date.set(date);
        this.ballots.set([]);
        this.partyNames.set({});
        this.loading.set(true);
        this.error.set('');
        if (this.elections.electionType !== 'governmental'
          || !this.elections.getDates().some((election) => election.date === date)) {
          this.error.set('Мандатите са достъпни за парламентарните избори в архива.');
          this.loading.set(false);
          return EMPTY;
        }
        return forkJoin({ regions: this.elections.getRegions(date), parties: this.elections.getParties(date) }).pipe(
          map(({ regions, parties }) => ({ ballots: buildNationalBallots(regions, parties), parties, error: '' })),
          catchError(() => of({ ballots: [], parties: {}, error: 'Данните не могат да бъдат заредени. Опитай отново.' })),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ ballots, parties, error }) => {
      this.ballots.set(ballots);
      this.partyNames.set(parties);
      this.error.set(error);
      this.loading.set(false);
    });
  }

  color(name: string): string {
    return getPartyColor(name, this.theme.darkMode());
  }

  partyTooltip(name: string, seats: number): string {
    return `${getPartyDisplayName(name)}\n${seats} мандата`
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  setThreshold(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseSeatThreshold(target.value);
    const qualified = new Set(allocateSeats(this.ballots(), value).rows.filter((row) => row.seats > 0).map((row) => row.id));
    this.updateQuery(value, [...this.selectedIds()].filter((id) => qualified.has(id)));
  }

  toggleParty(id: string): void {
    if (!this.parliamentaryRows().some((row) => row.id === id)) return;
    const selected = new Set(this.selectedIds());
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.updateQuery(this.threshold(), [...selected]);
  }

  reset(): void {
    this.updateQuery(NATIONAL_THRESHOLD, []);
  }

  selectTab(tab: 'mandates' | 'simulator'): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true,
    });
  }

  private updateQuery(threshold: number, coalition: string[]): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { threshold: threshold === NATIONAL_THRESHOLD ? null : threshold, coalition: coalition.length ? coalition.join(',') : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
