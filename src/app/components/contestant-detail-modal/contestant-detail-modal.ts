import { TableControlsComponent, TableColumns } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { SelectComponent, SelectOption } from '../ui/select/select';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import officialSeats from '../../../assets/parliament-seats.json';
import { RegionCandidate, Section, SectionDetails } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { SettlementMapDataService } from '../../services/settlement-map-data.service';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPresidentialCandidateName } from '../../utils/candidate-label';
import { getContestantImage } from '../../utils/contestant-image.util';
import { copyToClipboard } from '../../utils/common.utils';
import {
  ContestantDetailElection, ContestantParticipation, ContestantSummary, contestantParticipations, matchContestantId,
} from '../../utils/contestant-profile.util';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import { allocateSeats, buildNationalBallots } from '../../utils/seat-allocation.util';
import { PreferenceProfileElection, preferenceProfileElection } from '../../utils/preference-profile.util';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { StatCardComponent } from '../ui/stat-card/stat-card';
import { RiskBadgeComponent } from '../ui/risk-badge/risk-badge';
import {
  HlmTableDirective, HlmTableHeaderDirective, HlmTableBodyDirective,
  HlmTableRowDirective, HlmTableHeadDirective, HlmTableCellDirective,
} from '../ui/table-helm/src/lib/hlm-table.directives';
import { SectionDetailModalComponent } from '../election-detail/modals/section-detail-modal/section-detail-modal';
import { ContestantProfilePanelsComponent } from './contestant-profile-panels';

type ProfileTab = 'overview' | 'elections' | 'geography' | 'sections' | 'risks' | 'candidates';
type ProfileIdentity = { partyName: string; partyId: string; date: string };
type OfficialSeats = { source: string; decision: string; seats: Partial<Record<string, number>> };
const OFFICIAL_SEATS: Partial<Record<string, OfficialSeats>> = officialSeats;

@Component({
  selector: 'app-contestant-detail-modal',
  standalone: true,
  imports: [TableControlsComponent, SortableTableHeaderComponent, LoadingBarComponent, SelectComponent, CommonModule, BaseModalComponent, HlmButtonDirective, HighchartsChartComponent,
    StatCardComponent, RiskBadgeComponent, HlmTableDirective, HlmTableHeaderDirective, HlmTableBodyDirective,
    HlmTableRowDirective, HlmTableHeadDirective, HlmTableCellDirective,
    ContestantProfilePanelsComponent, SectionDetailModalComponent],
  templateUrl: './contestant-detail-modal.html',
  styleUrl: './contestant-detail-modal.scss',
})
export class ContestantDetailModalComponent implements OnChanges, OnDestroy {
  private static nextId = 0;
  readonly controlId = ++ContestantDetailModalComponent.nextId;
  @Input({ required: true }) partyName = '';
  @Input({ required: true }) currentDate = '';
  @Input() partyId = '';
  @Input() nested = false;
  @Input() preferenceCandidate: RegionCandidate | null = null;
  @Input() preferenceSections: Section[] = [];
  @Input() preferencePageRoute: string[] = [];
  @Input() preferencePageQueryParams: Params = {};
  @Output() close = new EventEmitter<void>();

  private readonly elections = inject(ElectionService);
  private readonly maps = inject(SettlementMapDataService);
  private readonly theme = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap);
  private readonly resolvedIdentity = signal<ProfileIdentity | null>(null);
  private loadedIdentity = '';
  readonly modalPages = inject(ModalPageService);
  private generation = 0;
  private detailGeneration = 0;
  private sectionGeneration = 0;
  private summaries: Record<string, ContestantSummary> = {};
  private readonly detailCache = new Map<string, ContestantDetailElection>();
  private municipalityNames: Promise<Map<string, string>> | null = null;
  private preferenceLoad: AbortController | null = null;
  readonly preferenceElections = signal<PreferenceProfileElection[]>([]);
  private readonly preferenceAnchorRegion = signal('');
  readonly presidential = this.elections.electionType === 'presidential';
  readonly activeTab = signal<ProfileTab>('overview');
  readonly scope = signal('all');
  readonly participations = signal<ContestantParticipation[]>([]);
  readonly detailElections = signal<ContestantDetailElection[]>([]);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly geographyWarning = signal('');
  readonly detailProgress = signal(0);
  readonly chartMetric = signal<'share' | 'votes'>('share');
  readonly metricOptions: SelectOption[] = [
    { value: 'share', label: 'Дял', icon: 'percent' }, { value: 'votes', label: 'Гласове', icon: 'party-votes' },
  ];
  readonly scopeOptions = computed(() => [{ value: 'all', label: 'Всички избори' },
    ...this.participations().map(election => ({ value: election.date, label: election.name + (election.provisional ? ' · Предварителни' : '') }))]);
  readonly sectionLoading = signal(false);
  readonly sectionError = signal('');
  readonly sectionShareMessage = signal('');
  readonly failedImage = signal('');
  readonly profileImage = computed(() => getContestantImage(
    (this.activeTab() === 'overview' ? this.initialElection()?.fullName : this.selected()?.fullName) ?? this.profileName,
    this.preferenceMode ? 'presidential' : this.elections.electionType,
  ));
  readonly openedSection = signal<{ date: string; details: SectionDetails; section: Section; sections: Section[] } | null>(null);
  readonly openedCandidate = signal<{ date: string; candidate: RegionCandidate; sections: Section[] } | null>(null);
  readonly nestedContestant = signal<{ partyName: string; partyId: string; date: string } | null>(null);
  get tabs(): { id: ProfileTab; label: string }[] { return [
    { id: 'overview', label: 'Обобщение' }, { id: 'elections', label: 'Избори' },
    { id: 'geography', label: 'География' }, { id: 'sections', label: 'Секции' },
    { id: 'risks', label: 'Рискове' },
    ...(!this.presidential && !this.preferenceMode ? [{ id: 'candidates' as const, label: 'Кандидати и преференции' }] : []),
  ]; }
  readonly selectedPreference = computed(() => this.preferenceElections().find(election => election.participation.date === this.scope()) ?? null);
  readonly participationColumns: TableColumns<ContestantParticipation> = {
    election: row => `${row.date} ${row.name}`, name: row => this.preferenceMode
      ? this.preferenceLists(row.date).map(list => `${list.partyName} ${list.regionName}`).join(' ') : row.fullName,
    votes: row => row.votes, share: row => row.share, rank: row => row.rank,
  };
  readonly preferenceListColumns: TableColumns<PreferenceProfileElection['lists'][number]> = {
    region: row => row.regionName, party: row => row.partyName, number: row => row.candidateId, rank: row => row.rank,
    votes: row => row.votes, share: row => row.share,
  };
  readonly preferenceRiskColumns: TableColumns<ReturnType<ContestantDetailModalComponent['preferenceRiskLists']>[number]> = {
    election: row => `${row.date} ${row.electionName}`, region: row => row.regionName,
    list: row => `${row.partyName} № ${row.candidateId}`, signals: row => row.risks.map(risk => risk.code).join(', '),
  };
  readonly preferenceRiskLists = computed(() => this.preferenceElections()
    .filter(election => this.scope() === 'all' || election.participation.date === this.scope())
    .flatMap(election => election.lists.filter(list => list.risks.length).map(list => ({
      ...list, date: election.participation.date, electionName: election.participation.name,
      context: { candidate: { candidateName: election.participation.fullName,
        candidateId: list.candidateId, partyId: list.partyId, partyName: list.partyName } },
    }))));
  readonly selected = computed(() => this.participations().find(election => election.date === this.scope()) ?? null);
  readonly panelTab = computed(() => {
    const tab = this.activeTab();
    return tab === 'overview' || tab === 'elections' ? 'geography' : tab;
  });
  readonly latest = computed<ContestantParticipation | null>(() => this.participations()[0] ?? null);
  readonly initialElection = computed<ContestantParticipation | null>(() => this.participations().find(election => election.date === this.profileDate) ?? this.latest());
  readonly first = computed<ContestantParticipation | null>(() => this.participations().at(-1) ?? null);
  readonly best = computed(() => {
    const byRound = new Map<number, ContestantParticipation>();
    for (const election of this.participations()) {
      if (election.share === null) continue;
      const round = election.round ?? 0;
      const previous = byRound.get(round);
      if (!previous || election.share > (previous.share ?? -1)) byRound.set(round, election);
    }
    return [...byRound.values()].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  });
  readonly selectedDetails = computed(() => this.detailElections().find(election => election.participation.date === this.scope()) ?? null);
  readonly roundComparison = computed(() => {
    const selected = this.selected();
    if (!this.presidential || !selected) return null;
    const sameYear = this.participations().filter(election => election.date.slice(0, 4) === selected.date.slice(0, 4));
    const first = sameYear.find(election => election.round === 1);
    const second = sameYear.find(election => election.round === 2);
    return first && second ? { first, second, voteChange: second.votes - first.votes,
      shareChange: first.share === null || second.share === null ? null : second.share - first.share } : null;
  });
  readonly votingMethods = computed(() => {
    const detail = this.selectedDetails();
    if (!detail) return null;
    return detail.sections.reduce((totals, section) => {
      const votes = section.partyVotes[detail.participation.partyId];
      totals.paper += votes?.paper ?? 0;
      totals.machine += votes?.machine ?? 0;
      return totals;
    }, { paper: 0, machine: 0 });
  });
  readonly mandate = computed(() => {
    const election = this.selected();
    if (this.presidential || this.preferenceMode || !election) return null;
    const summary = this.summaries[election.date];
    if (!summary) return null;
    const allocation = allocateSeats(buildNationalBallots(summary.regions, summary.parties));
    const row = allocation.rows.find(ballot => ballot.id === election.partyId);
    const official = OFFICIAL_SEATS[election.date];
    return row ? {
      seats: official ? official.seats[election.partyId] ?? 0 : row.seats,
      official, eligible: row.eligible, passedThreshold: row.passedThreshold, share: row.share,
    } : null;
  });
  readonly chartOptions = computed<Highcharts.Options>(() => {
    const dark = this.theme.darkMode();
    const metric = this.chartMetric();
    const points = [...this.participations()].reverse();
    const rounds = this.presidential ? [...new Set(points.map(point => point.round ?? 1))].sort() : [0];
    return {
      chart: { type: 'column', backgroundColor: 'transparent', height: 300, style: { fontFamily: 'inherit' } },
      title: { text: undefined }, credits: { enabled: false },
      xAxis: { categories: points.map(point => point.name), labels: { style: { color: dark ? '#cbd5e1' : '#475569' } } },
      yAxis: { min: 0, title: { text: metric === 'share' ? this.shareLabel + ' (%)' : this.votesLabel },
        labels: { style: { color: dark ? '#cbd5e1' : '#475569' } } },
      legend: { enabled: this.presidential, itemStyle: { color: dark ? '#cbd5e1' : '#475569' } },
      tooltip: { valueDecimals: metric === 'share' ? 2 : 0, valueSuffix: metric === 'share' ? '%' : '' },
      plotOptions: { column: { borderWidth: 0, borderRadius: 3, grouping: false }, series: {
        cursor: 'pointer', point: { events: { click: event => {
          const point = points[event.point.index];
          if (point) this.openElection(point.date);
        } } },
      } },
      series: rounds.map((round, index) => ({
        type: 'column', name: this.presidential ? `Тур ${round}` : this.displayName,
        color: getPartyColor(this.profileName, dark), opacity: index === 0 ? 1 : 0.6,
        data: points.map(point => !this.presidential || point.round === round ? point[metric] : null),
      })),
    };
  });

  get displayName(): string {
    if (this.preferenceMode) return this.profileName;
    return this.presidential ? getPresidentialCandidateName(this.profileName) : getPartyDisplayName(this.profileName);
  }

  get preferenceMode(): boolean { return this.preferenceCandidate !== null; }
  get profilePageId(): 'candidate' | 'contestant' { return this.preferenceMode ? 'candidate' : 'contestant'; }
  get votesLabel(): string { return this.preferenceMode ? 'Преференции' : 'Гласове'; }
  get shareLabel(): string { return this.preferenceMode ? 'Дял от партийните гласове' : 'Дял от гласувалите'; }
  get subtitle(): string {
    return this.preferenceMode ? 'Кандидат за народен представител · ' + getPartyDisplayName(this.preferenceCandidate?.partyName)
      : this.presidential ? 'Президентски кандидат · Всички райони' : 'Партия / коалиция · Всички райони';
  }

  preferenceLists(date: string) {
    return this.preferenceElections().find(election => election.participation.date === date)?.lists ?? [];
  }

  get profileName(): string { return this.resolvedIdentity()?.partyName ?? this.partyName; }
  get profileDate(): string { return this.resolvedIdentity()?.date ?? this.currentDate; }
  get profileParty(): string { return this.resolvedIdentity()?.partyId ?? this.partyId; }
  get pageRoute(): string[] {
    if (!this.preferenceMode) return ['/', this.elections.electionType];
    if (this.preferencePageRoute.length) return this.preferencePageRoute;
    const region = this.preferenceAnchorRegion();
    return ['/', this.elections.electionType, 'election', this.currentDate, ...(region ? ['region', region] : ['all'])];
  }
  get pageQueryParams(): Params {
    if (this.preferenceCandidate) return { ...this.preferencePageQueryParams,
      candidate: `${this.preferenceCandidate.partyId}_${this.preferenceCandidate.candidateId}`,
      profileTab: this.activeTab(), profileScope: this.scope(), profileMetric: this.chartMetric(),
      section: null, group: null };
    return { profileName: this.profileName, profileParty: this.profileParty || null, profileDate: this.profileDate,
      profileTab: this.activeTab(), profileScope: this.scope(), profileMetric: this.chartMetric(),
      section: null, group: null, candidate: null, analysis: null };
  }

  constructor() {
    effect(() => {
      const params = this.queryParams();
      if (!params || this.nested) return;
      untracked(() => {
        const page = params.get('dialog') === this.profilePageId ? params : null;
        if (page) this.nestedContestant.set(null);
        if (this.loadedIdentity !== this.identityKey(page)) void this.load();
        else if (page && !this.loading()) this.restorePageState(page);
      });
    });
  }

  ngOnChanges(): void {
    const params = this.queryParams();
    const page = !this.nested && params?.get('dialog') === this.profilePageId ? params : null;
    if (this.loadedIdentity !== this.identityKey(page)) void this.load();
  }

  ngOnDestroy(): void {
    this.preferenceLoad?.abort();
    this.generation++;
    this.detailGeneration++;
    this.sectionGeneration++;
  }

  async load(): Promise<void> {
    const queryParams = this.queryParams();
    const params = !this.nested && queryParams?.get('dialog') === this.profilePageId ? queryParams : null;
    this.loadedIdentity = this.identityKey(params);
    const requested = this.identity(params);
    this.resolvedIdentity.set(requested);
    const generation = ++this.generation;
    this.preferenceLoad?.abort();
    this.detailGeneration++;
    this.sectionGeneration++;
    this.detailCache.clear();
    this.preferenceElections.set([]);
    this.preferenceAnchorRegion.set('');
    this.failedImage.set('');
    this.summaries = {};
    this.participations.set([]);
    this.detailElections.set([]);
    this.scope.set('all');
    this.activeTab.set('overview');
    this.error.set('');
    this.detailError.set('');
    this.geographyWarning.set('');
    this.detailLoading.set(false);
    this.detailProgress.set(0);
    this.openedSection.set(null);
    this.openedCandidate.set(null);
    this.nestedContestant.set(null);
    this.sectionLoading.set(false);
    this.sectionError.set('');
    this.loading.set(true);
    try {
      if (this.preferenceCandidate) {
        await this.loadPreferenceProfile(this.preferenceCandidate, generation, params);
        return;
      }
      const summaries = await firstValueFrom(this.elections.getAllData());
      if (generation !== this.generation) return;
      this.summaries = summaries;
      const participations = contestantParticipations(this.profileName, this.elections.electionType, this.elections.getDates(), summaries,
        { date: this.profileDate, partyId: this.profileParty });
      if (params) {
        const anchor = participations.find(election => election.date === requested.date
          && (!requested.partyId || election.partyId === requested.partyId));
        if (!anchor) {
          this.error.set('Невалиден профил. Изберете партия или кандидат от архива.');
          return;
        }
        this.resolvedIdentity.set({ date: anchor.date, partyId: anchor.partyId, partyName: anchor.fullName });
      }
      this.participations.set(participations);
      if (params) this.restorePageState(this.queryParams() ?? params);
    } catch {
      if (generation === this.generation) this.error.set('Профилът не може да бъде зареден. Опитайте отново.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  selectTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    void this.loadDetails();
    this.updatePageUrl();
  }

  selectScope(date: string): void {
    if (date !== 'all' && !this.participations().some(election => election.date === date)) return;
    this.scope.set(date);
    void this.loadDetails();
    this.updatePageUrl();
  }

  selectChartMetric(metric: string): void {
    if (metric !== 'share' && metric !== 'votes') return;
    this.chartMetric.set(metric);
    this.updatePageUrl();
  }

  private identity(params: ParamMap | null): ProfileIdentity {
    if (this.preferenceCandidate) return { partyName: this.preferenceCandidate.candidateName,
      partyId: this.preferenceCandidate.partyId, date: this.currentDate };
    return params ? { partyName: params.get('profileName') ?? '', partyId: params.get('profileParty') ?? '', date: params.get('profileDate') ?? '' }
      : { partyName: this.partyName, partyId: this.partyId, date: this.currentDate };
  }

  private identityKey(params: ParamMap | null): string {
    return JSON.stringify([!!params, this.identity(params), this.preferenceCandidate?.candidateId, this.preferenceCandidate?.partyName]);
  }

  private restorePageState(params: ParamMap): void {
    const tab = this.tabs.find(tab => tab.id === params.get('profileTab'))?.id ?? 'overview';
    const scope = this.participations().some(election => election.date === params.get('profileScope'))
      ? params.get('profileScope')! : 'all';
    const changed = this.activeTab() !== tab || this.scope() !== scope;
    this.activeTab.set(tab);
    this.scope.set(scope);
    this.chartMetric.set(params.get('profileMetric') === 'votes' ? 'votes' : 'share');
    if (changed) void this.loadDetails();
  }

  private updatePageUrl(): void {
    if (!this.nested && this.modalPages.isActive(this.profilePageId)) void this.modalPages.open(this.profilePageId, this.pageQueryParams);
  }

  openElection(date: string): void {
    this.activeTab.set('elections');
    this.selectScope(date);
  }

  private async loadPreferenceProfile(candidate: RegionCandidate, generation: number, params: ParamMap | null): Promise<void> {
    const controller = new AbortController();
    this.preferenceLoad = controller;
    const summaries = await firstValueFrom(this.elections.getAllData());
    if (generation !== this.generation) return;
    this.summaries = summaries;
    const municipalities = await this.loadMunicipalityNames();
    if (generation !== this.generation) return;
    const catalog = this.elections.getDates().filter(election => election.type === 'governmental')
      .sort((left, right) => right.date.localeCompare(left.date));
    const profiles: PreferenceProfileElection[] = [];
    for (const [index, election] of catalog.entries()) {
      const sections = await firstValueFrom(this.elections.getSections(election.date, undefined, false));
      if (generation !== this.generation) return;
      const profile = await preferenceProfileElection(candidate, election, sections,
        summaries[election.date]?.parties ?? {}, controller.signal);
      if (generation !== this.generation) return;
      if (profile) {
        for (const section of profile.sections) {
          if (!section.municipalityName && section.settlementEkatte) section.municipalityName = municipalities.get(section.settlementEkatte);
        }
        profiles.push(profile);
        this.detailCache.set(election.date, profile);
      }
      this.detailProgress.set(Math.round((index + 1) / catalog.length * 100));
    }
    const anchor = profiles.find(profile => profile.participation.date === this.currentDate);
    const lists = anchor?.lists.filter(list => list.partyId === candidate.partyId && list.candidateId === candidate.candidateId) ?? [];
    if (!lists.length) {
      this.error.set('Няма еднозначно съпоставено участие за кандидата в избраните избори.');
      return;
    }
    const sourceRegions = new Set(this.preferenceSections.map(section => section.regionId));
    const anchorList = lists.find(list => sourceRegions.size === 1 && sourceRegions.has(list.regionId)) ?? lists[0];
    this.preferenceAnchorRegion.set(anchorList.regionId);
    this.preferenceElections.set(profiles);
    this.participations.set(profiles.map(profile => profile.participation));
    this.detailProgress.set(100);
    if (params) this.restorePageState(this.queryParams() ?? params);
    await this.loadDetails();
  }

  async loadDetails(): Promise<void> {
    const generation = ++this.detailGeneration;
    this.detailError.set('');
    const tab = this.activeTab();
    if (tab === 'overview' || (tab === 'elections' && this.scope() === 'all')) {
      this.detailLoading.set(false);
      return;
    }
    this.detailProgress.set(0);
    const requested = this.scope() === 'all' ? this.participations() : this.participations().filter(election => election.date === this.scope());
    if (this.preferenceMode) {
      const dates = new Set(requested.map(election => election.date));
      this.detailElections.set(this.preferenceElections().filter(election => dates.has(election.participation.date)));
      this.detailProgress.set(100);
      this.detailLoading.set(false);
      return;
    }
    this.detailElections.set([]);
    this.detailLoading.set(true);
    try {
      const municipalities = await this.loadMunicipalityNames();
      if (generation !== this.detailGeneration) return;
      const details: ContestantDetailElection[] = [];
      for (const [index, participation] of requested.entries()) {
        let detail = this.detailCache.get(participation.date);
        if (!detail) {
          const sections = await firstValueFrom(this.elections.getSections(participation.date, undefined, false));
          if (generation !== this.detailGeneration) return;
          for (const section of sections) {
            if (!section.municipalityName && section.settlementEkatte) {
              section.municipalityName = municipalities.get(section.settlementEkatte);
            }
          }
          detail = { participation, sections };
          this.detailCache.set(participation.date, detail);
        }
        details.push(detail);
        this.detailProgress.set(Math.round((index + 1) / requested.length * 100));
      }
      if (generation === this.detailGeneration) {
        this.detailProgress.set(100);
        this.detailElections.set(details);
      }
    } catch {
      if (generation === this.detailGeneration) this.detailError.set('Подробните данни не могат да бъдат заредени. Опитайте отново.');
    } finally {
      if (generation === this.detailGeneration) this.detailLoading.set(false);
    }
  }

  private loadMunicipalityNames(): Promise<Map<string, string>> {
    if (!this.municipalityNames) {
      this.municipalityNames = (async () => {
        try {
          const [settlements, municipalities] = await Promise.all([
            firstValueFrom(this.maps.getSettlementsLookup()), firstValueFrom(this.maps.getMunicipalitiesLookup()),
          ]);
          const names = new Map<string, string>();
          for (const municipality of municipalities as { obshtina?: string; name?: string }[]) {
            if (municipality.obshtina && municipality.name) names.set(municipality.obshtina, municipality.name);
          }
          const bySettlement = new Map<string, string>();
          for (const settlement of settlements) {
            const name = settlement.obshtina ? names.get(settlement.obshtina) : undefined;
            if (settlement.ekatte && name) bySettlement.set(settlement.ekatte, name);
          }
          return bySettlement;
        } catch {
          this.geographyWarning.set('Имената на общините не са заредени. Резултатите по райони и секции са достъпни.');
          this.municipalityNames = null;
          return new Map<string, string>();
        }
      })();
    }
    return this.municipalityNames;
  }

  async openSection(event: { date: string; section: Section }): Promise<void> {
    if (this.preferenceMode) {
      const source = this.preferenceElections().find(election => election.participation.date === event.date)?.sourceSections
        .find(section => section.sectionId === event.section.sectionId && section.regionId === event.section.regionId);
      if (!source) {
        this.sectionError.set('Първоначалните данни за секцията не са достъпни.');
        return;
      }
      event = { ...event, section: source };
    }
    if (this.modalPages.isActive(this.profilePageId)) {
      await this.modalPages.open('section', { section: event.section.sectionId, candidate: null, group: null, analysis: null },
        ['/', this.elections.electionType, 'election', event.date, 'region', event.section.regionId]);
      return;
    }
    const generation = ++this.sectionGeneration;
    this.sectionLoading.set(true);
    this.sectionError.set('');
    this.sectionShareMessage.set('');
    try {
      const details = await firstValueFrom(this.elections.getSectionDetails(event.date, event.section.sectionId));
      if (generation !== this.sectionGeneration) return;
      const sourceSections = this.preferenceMode
        ? this.preferenceElections().find(election => election.participation.date === event.date)?.sourceSections
        : this.detailCache.get(event.date)?.sections;
      const sections = sourceSections?.filter(section => section.regionId === event.section.regionId) ?? [event.section];
      this.openedSection.set({ date: event.date, details, section: event.section, sections });
    } catch {
      if (generation === this.sectionGeneration) this.sectionError.set('Секцията не може да бъде заредена. Опитайте отново.');
    } finally {
      if (generation === this.sectionGeneration) this.sectionLoading.set(false);
    }
  }

  openCandidate(event: { date: string; candidate: RegionCandidate; sections: Section[] }): void {
    if (this.modalPages.isActive(this.profilePageId)) {
      void this.modalPages.open('candidate', { candidate: `${event.candidate.partyId}_${event.candidate.candidateId}`,
        section: null, group: null, analysis: null }, this.candidatePageRoute(event.date, event.sections));
      return;
    }
    this.openedCandidate.set(event);
  }

  candidatePageRoute(date: string, sections: Section[]): string[] {
    const regionId = sections[0]?.regionId;
    return ['/', this.elections.electionType, 'election', date, ...(regionId ? ['region', regionId] : ['all'])];
  }

  openSectionCandidate(candidate: RegionCandidate): void {
    const section = this.openedSection();
    if (section) this.openCandidate({ date: section.date, candidate, sections: section.sections });
  }

  closeSection(): void {
    this.sectionGeneration++;
    this.openedSection.set(null);
    this.sectionLoading.set(false);
  }

  readonly shareSection = async (): Promise<boolean> => {
    const section = this.openedSection();
    if (!section) return false;
    const tree = this.router.createUrlTree(this.candidatePageRoute(section.date, [section.section]),
      { queryParams: { section: section.section.sectionId, dialog: 'section' } });
    const url = new URL(this.router.serializeUrl(tree), window.location.origin).href;
    const copied = await copyToClipboard(url);
    if (this.openedSection() === section) this.sectionShareMessage.set(copied ? '' : `Линк към секцията: ${url}`);
    return copied;
  };

  formatUpdatedAt(value: string): string {
    return new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  sectionParties(date: string): { id: string; name: string }[] {
    return Object.entries(this.summaries[date]?.parties ?? {}).map(([id, name]) => ({ id, name }));
  }

  openRelatedContestant(event: { partyName: string; partyId: string }): void {
    const section = this.openedSection();
    if (!section) return;
    this.openedSection.set(null);
    if (matchContestantId(this.profileName, { [event.partyId]: event.partyName }, this.elections.electionType)) this.openElection(section.date);
    else if (!this.nested && this.modalPages.isActive(this.profilePageId)) {
      void this.modalPages.open('contestant', {
        profileName: event.partyName, profileParty: event.partyId, profileDate: section.date,
        profileTab: 'overview', profileScope: 'all', profileMetric: 'share', candidate: null, section: null }, ['/', this.elections.electionType]);
    }
    else this.nestedContestant.set({ ...event, date: section.date });
  }
}
