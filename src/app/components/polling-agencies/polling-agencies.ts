import { SelectComponent } from '../ui/select/select';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { PollingData } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { BaseModalComponent } from '../ui/base-modal/base-modal';

@Component({
  selector: 'app-polling-agencies',
  standalone: true,
  imports: [SelectComponent, CommonModule, HlmButtonDirective, BaseModalComponent],
  templateUrl: './polling-agencies.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollingAgenciesComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elections = inject(ElectionService);
  private readonly context = inject(ElectionContextService);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requestedAgency = signal('');
  readonly modalPages = inject(ModalPageService);
  readonly methodOpen = signal(false);
  readonly activeTab = signal<'accuracy' | 'comparison'>('accuracy');
  readonly date = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<PollingData | null>(null);
  readonly displayName = getPartyDisplayName;
  readonly agencies = computed(() => this.data()?.agencies ?? []);
  readonly agencyOptions = computed(() => [{ value: '', label: 'Всички агенции' },
    ...this.agencies().map(agency => ({ value: agency.id, label: agency.name }))]);
  readonly selected = computed(() => this.agencies().find(agency => agency.id === this.requestedAgency()) ?? null);
  readonly comparisonAgencies = computed(() => {
    const selected = this.selected();
    return selected ? [selected] : this.agencies();
  });
  readonly comparisonRows = computed(() => {
    const agencies = this.comparisonAgencies();
    const reports = agencies.map(agency => new Map(agency.errors.map(result => [result.party, result])));
    const actuals = new Map<string, number>();
    for (const agency of this.agencies()) {
      for (const result of agency.errors) actuals.set(result.party, result.actual);
    }
    return [...actuals].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'bg'))
      .map(([party, actual]) => {
        const results = reports.map(report => report.get(party));
        const available = results.filter(result => result !== undefined);
        const minimumError = Math.min(...available.map(result => Math.abs(result.polled - actual)));
        return { party, actual, cells: results.map((result, index) => ({
          agency: agencies[index], result: result ?? null,
          closest: available.length > 1 && result !== undefined
            && Math.abs(Math.abs(result.polled - actual) - minimumError) < 1e-9,
        })) };
      });
  });
  readonly maxMae = computed(() => Math.max(0.01, ...this.agencies().map(agency => agency.mae)));
  readonly closestAgencies = computed(() => {
    const agencies = this.comparisonAgencies();
    const minimum = Math.min(...agencies.map(agency => agency.mae));
    return new Set(agencies.filter(agency => agencies.length > 1 && Math.abs(agency.mae - minimum) < 1e-9).map(agency => agency.id));
  });

  constructor() {
    this.route.queryParamMap.pipe(
      map(params => params.get('agency') ?? ''), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef),
    ).subscribe(agency => {
      this.requestedAgency.set(agency);
      if (agency) this.activeTab.set('comparison');
    });
    this.route.paramMap.pipe(
      map(params => params.get('date') ?? ''), distinctUntilChanged(),
      switchMap(date => {
        this.methodOpen.set(false);
        this.date.set(date);
        this.data.set(null);
        this.loading.set(true);
        this.error.set('');
        if (this.elections.electionType !== 'governmental' || !this.elections.getDates().some(election => election.date === date)) {
          this.error.set('Избери парламентарни избори от архива.');
          this.loading.set(false);
          return EMPTY;
        }
        return this.context.getPolls(date).pipe(catchError(() => { this.error.set('Данните за агенциите не могат да бъдат заредени.'); return of(null); }));
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => { this.data.set(data); this.loading.set(false); });
  }

  selectAgency(id: string): void {
    if (id && !this.agencies().some(agency => agency.id === id)) return;
    this.requestedAgency.set(id);
    this.activeTab.set('comparison');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { agency: id || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  color(name: string): string {
    return getPartyColor(name, this.theme.darkMode());
  }
}
