import { TableControlsComponent, TableColumns } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { SelectComponent } from '../ui/select/select';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ELECTION_TYPE } from '../../utils/election-type';
import { ComparisonProfile, comparisonProfiles, comparisonStrongholds } from '../../utils/head-to-head.util';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import { comparisonLeader, formatComparisonValue } from '../../utils/comparison-display.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { COMPARISON_SIDES, ComparisonCellComponent } from '../ui/comparison-cell/comparison-cell';
import { HlmTableBodyDirective, HlmTableDirective, HlmTableHeadDirective, HlmTableHeaderDirective, HlmTableRowDirective } from '../ui/table-helm/src/lib/hlm-table.directives';

@Component({
  selector: 'app-head-to-head',
  standalone: true,
  imports: [TableControlsComponent, SortableTableHeaderComponent, LoadingBarComponent, SelectComponent, CommonModule, RouterLink, HlmButtonDirective, HlmTableDirective, ComparisonCellComponent,
    HlmTableHeaderDirective, HlmTableBodyDirective, HlmTableRowDirective, HlmTableHeadDirective],
  templateUrl: './head-to-head.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: ':host { display: block; min-width: 0; }',
})
export class HeadToHeadComponent {
  private readonly elections = inject(ElectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  readonly electionType = inject(ELECTION_TYPE);
  readonly scope = input<Section[] | null>(null);
  readonly embedded = input(false);
  private generation = 0;
  private readonly query = signal(convertToParamMap({}));
  private readonly sections = signal<Section[]>([]);
  private readonly parties = signal<Record<string, string>>({});
  readonly date = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly mode = computed(() => this.electionType === 'governmental' && this.query().get('mode') === 'candidates' ? 'candidates' : 'parties');
  readonly dateName = computed(() => this.elections.getDates().find(election => election.date === this.date())?.name ?? this.date());
  readonly regions = computed(() => {
    const regions = new Map<string, string>();
    for (const section of this.sections()) regions.set(section.regionId, section.regionName || `Район ${section.regionId}`);
    return [...regions].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id, 'bg', { numeric: true }));
  });
  readonly region = computed(() => {
    const region = this.query().get('region');
    return region !== null && this.regions().some(option => option.id === region) ? region : '';
  });
  private readonly scopedSections = computed(() => this.scope()
    ?? (this.region() ? this.sections().filter(section => section.regionId === this.region()) : this.sections()));
  readonly profiles = computed(() => comparisonProfiles(this.scopedSections(), this.parties(), this.mode()));
  readonly profileOptions = computed(() => this.profiles().map(profile => ({
    value: profile.id, label: this.profileLabel(profile), partyName: profile.partyName || profile.name,
  })));
  readonly left = computed<ComparisonProfile | null>(() => this.profiles().find(profile => profile.id === this.query().get('left')) ?? this.profiles()[0] ?? null);
  readonly right = computed<ComparisonProfile | null>(() => this.profiles().find(profile => profile.id === this.query().get('right')) ?? this.profiles()[1] ?? this.profiles()[0] ?? null);
  private readonly leftSide = computed(() => this.strongholds(this.left()));
  private readonly rightSide = computed(() => this.strongholds(this.right()));
  readonly sides = computed(() => [this.leftSide(), this.rightSide()].filter(side => side !== null));
  readonly rows = computed(() => {
    const left = this.left();
    const right = this.right();
    const candidates = this.mode() === 'candidates';
    return [
      { label: candidates ? 'Преференции' : 'Гласове', left: left?.votes, right: right?.votes, rate: false },
      { label: candidates ? 'Дял от гласовете за партията в МИР' : 'Дял от гласувалите', left: left?.share, right: right?.share, rate: true },
      { label: 'Хартиени', left: left?.paper, right: right?.paper, rate: false },
      { label: 'Машинни', left: left?.machine, right: right?.machine, rate: false },
      { label: 'Машинен дял', left: left?.machineShare, right: right?.machineShare, rate: true },
      ...(this.electionType === 'governmental' ? [{
        label: candidates ? 'Дял от преференциите за партията в МИР' : 'Преференции спрямо гласовете за партията',
        left: left?.preferenceShare, right: right?.preferenceShare, rate: true,
      }] : []),
    ].map(row => ({ ...row, leader: this.leader(row.left, row.right) }));
  });
  readonly displayPartyName = getPartyDisplayName;
  readonly tableColumns: TableColumns<ReturnType<HeadToHeadComponent['rows']>[number]> = {
    label: row => row.label, left: row => row.left, right: row => row.right,
    difference: row => row.left != null && row.right != null ? row.left - row.right : null,
  };
  readonly comparisonSides = COMPARISON_SIDES;
  readonly format = formatComparisonValue;
  readonly leader = comparisonLeader;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => this.query.set(params));
    this.route.paramMap.pipe(
      map(params => params.get('date') ?? ''), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef),
    ).subscribe(date => { void this.load(date); });
    this.destroyRef.onDestroy(() => { this.generation++; });
  }

  async load(date = this.date()): Promise<void> {
    const generation = ++this.generation;
    this.date.set(date);
    this.sections.set([]);
    this.parties.set({});
    this.error.set('');
    if (!this.elections.getDates().some(election => election.date === date)) {
      this.loading.set(false);
      this.error.set('Няма данни за избраните избори.');
      return;
    }
    this.loading.set(true);
    try {
      const sections = await firstValueFrom(this.elections.getSections(date, undefined, false));
      if (generation !== this.generation) return;
      const parties = await firstValueFrom(this.elections.getParties(date));
      if (generation !== this.generation) return;
      this.parties.set(parties);
      this.sections.set(sections);
    } catch {
      if (generation === this.generation) this.error.set('Данните не могат да бъдат заредени. Опитайте отново.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  setSelection(key: 'left' | 'right', value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private strongholds(profile: ComparisonProfile | null) {
    return profile ? {
      profile,
      settlements: comparisonStrongholds(this.scopedSections(), profile, 'settlement'),
      sections: comparisonStrongholds(this.scopedSections(), profile, 'section'),
    } : null;
  }

  profileLabel(profile: ComparisonProfile): string {
    return this.mode() === 'candidates'
      ? `${profile.name} · ${getPartyDisplayName(profile.partyName)} · МИР ${profile.regionId} · № ${profile.candidateId}`
      : getPartyDisplayName(profile.name);
  }

  color(profile: ComparisonProfile): string { return getPartyColor(profile.partyName, this.theme.darkMode()); }

}
