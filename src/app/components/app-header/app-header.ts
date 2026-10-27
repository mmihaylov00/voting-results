import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import elections from '../../../assets/elections.json';
import { ThemeService } from '../../services/theme.service';
import { ElectionType } from '../../utils/election-type';
import { REGION_ID_TO_NAME } from '../../utils/region-names';
import { parseElectionPanel } from '../../utils/election-workspace.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { SelectComponent } from '../ui/select/select';

type ProvisionalElection = {
  date: string;
  provisional?: { sourceUrl: string; updatedAt: string; processedPercent: number };
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, HlmButtonDirective, SelectComponent],
  template: `
    <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[300] focus:bg-background focus:p-3">Към съдържанието</a>
    <header class="sticky top-0 z-50 border-b border-primary/20 bg-background/95 backdrop-blur-sm">
      <div class="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 sm:px-8">
        <a routerLink="/" class="mr-auto flex min-w-0 items-center gap-2 py-1 font-semibold tracking-tight text-foreground lg:mr-0" aria-label="Изборни резултати - начало">
          <span aria-hidden="true" class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">✓</span>
          <span>Изборни резултати</span>
        </a>
        <nav aria-label="Навигационна пътека" class="order-3 min-w-0 w-full lg:order-none lg:w-auto lg:flex-1">
          <ol class="flex min-w-0 flex-wrap items-center gap-y-1">
            @if (backLink(); as destination) {
              <li class="mr-2 flex shrink-0 items-center">
                <a hlmBtn variant="outline" size="icon" [routerLink]="destination" class="h-11 w-11 border-foreground/30 bg-muted text-foreground" aria-label="Назад" title="Назад">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7M19 12H5"/></svg>
                </a>
              </li>
            }
            <li class="flex min-w-0 max-w-full items-center">
              <app-select controlId="navigation-type" label="Вид избори" appearance="breadcrumb" class="max-w-[17rem]"
                [value]="type()" (valueChange)="changeType($event)" [options]="typeOptions" />
            </li>
            @if (isDirectory()) {
              <li class="flex min-w-0 max-w-full items-center" aria-current="page">
                <span aria-hidden="true" class="breadcrumb-separator">›</span>
                <span class="px-2 py-2 font-medium">Партии и кандидати</span>
              </li>
            } @else {
              <li class="flex min-w-0 max-w-full items-center">
                <span aria-hidden="true" class="breadcrumb-separator">›</span>
                <app-select controlId="navigation-date" label="Изборна дата" icon="calendar" appearance="breadcrumb" class="max-w-[17rem]"
                  [value]="isElection() ? date() : ''" (valueChange)="changeDate($event)" [options]="dateOptions()" />
              </li>
            }
            @if (isElection()) {
              <li class="flex min-w-0 max-w-full items-center" aria-current="page">
                <span aria-hidden="true" class="breadcrumb-separator">›</span>
                <app-select controlId="navigation-region" label="Район" icon="region" appearance="breadcrumb" class="max-w-[17rem]"
                  [value]="region()" (valueChange)="changeRegion($event)" [options]="regionOptions" />
              </li>
            }
          </ol>
        </nav>
        <div class="flex shrink-0 items-center gap-2">
          <button hlmBtn variant="outline" size="icon" type="button" class="h-11 w-11 shrink-0 border-foreground/30 bg-muted text-foreground" (click)="theme.toggleDarkMode()" [attr.aria-label]="theme.darkMode() ? 'Светла тема' : 'Тъмна тема'" [attr.title]="theme.darkMode() ? 'Светла тема' : 'Тъмна тема'">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              @if (theme.darkMode()) {
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42M6.35 17.65l-1.42 1.42"/>
              } @else {
                <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>
              }
            </svg>
          </button>
        </div>
      </div>
      @if (provisional(); as snapshot) {
        <div role="status" class="border-t border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <div class="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm sm:px-8">
            <strong>Предварителни резултати</strong>
            <span>Обработени протоколи общо: {{ snapshot.processedPercent }}%</span>
            <span>Данни към <time [attr.datetime]="snapshot.updatedAt">{{ snapshot.updatedAtLabel }}</time> (София)</span>
            <a [href]="snapshot.sourceUrl" target="_blank" rel="noopener noreferrer" class="font-semibold underline underline-offset-2">Източник: ЦИК</a>
          </div>
        </div>
      }
    </header>
  `,
  styles: `
    :host { display: contents; }
    .breadcrumb-separator {
      flex-shrink: 0;
      padding: 0 .375rem;
      font-size: 1.75rem;
      line-height: 1;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class AppHeaderComponent {
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);
  private readonly url = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationEnd), map(() => this.router.url), startWith(this.router.url),
  ), { initialValue: this.router.url });
  private readonly tree = computed(() => this.router.parseUrl(this.url()));
  private readonly segments = computed(() => this.tree().root.children['primary']?.segments.map(segment => segment.path) ?? []);
  readonly type = computed<ElectionType>(() => this.segments()[0] === 'presidential' ? 'presidential' : 'governmental');
  readonly dates = computed(() => elections.filter(election => election.type === this.type()).sort((left, right) => right.date.localeCompare(left.date)));
  readonly date = computed(() => this.dates().find(election => election.date === this.segments()[2])?.date ?? this.dates()[0]?.date ?? '');
  readonly isElection = computed(() => this.segments()[1] === 'election');
  readonly isDirectory = computed(() => this.segments()[1] === 'contestants');
  readonly backLink = computed(() => {
    if (!this.segments().length) return null;
    if (!this.isElection()) return ['/'];
    return this.segments().length > 3
      ? ['/', this.type(), 'election', this.date()]
      : ['/', this.type()];
  });
  readonly provisional = computed(() => {
    const election: ProvisionalElection | undefined = this.isElection()
      ? this.dates().find(item => item.date === this.segments()[2]) : undefined;
    const snapshot = election?.provisional;
    if (!snapshot) return undefined;
    return { ...snapshot, updatedAtLabel: new Intl.DateTimeFormat('bg-BG', {
      timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(snapshot.updatedAt)) };
  });
  readonly regions = Object.entries(REGION_ID_TO_NAME).map(([id, name]) => ({ id, name }));
  readonly typeOptions = [
    { value: 'governmental', label: 'Парламентарни', icon: 'parliament' },
    { value: 'presidential', label: 'Президентски', icon: 'person' },
  ] as const;
  readonly dateOptions = computed(() => [{ value: '', label: 'Всички дати' },
    ...this.dates().map(election => ({ value: election.date, label: election.name }))]);
  readonly regionOptions = [{ value: '', label: 'Всички райони', icon: 'globe' as const },
    ...this.regions.map(region => ({ value: region.id, label: region.name, icon: region.id === '32' ? 'globe' as const : 'region' as const }))];
  readonly region = computed(() => this.validRegion(this.segments()[3] === 'region' ? this.segments()[4] : this.tree().queryParams['region']));

  changeType(type: string): void {
    if (type !== 'governmental' && type !== 'presidential') return;
    if (this.isDirectory()) {
      void this.router.navigate(['/', type, 'contestants']);
      return;
    }
    const date = elections.filter(election => election.type === type).sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? '';
    if (this.isElection()) this.navigate(type, date);
    else void this.router.navigate(['/', type]);
  }

  changeDate(date: string): void {
    if (!date) {
      void this.router.navigate(['/', this.type()]);
      return;
    }
    if (!this.dates().some(election => election.date === date)) return;
    this.navigate(this.type(), date);
  }

  changeRegion(value: string): void {
    const region = this.validRegion(value);
    if (!this.isElection() || value && !region) return;
    this.navigate(this.type(), this.date(), region);
  }

  private validRegion(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) return '';
    const normalized = value.replace(/^0+(?=\d)/, '');
    return this.regions.some(region => region.id === normalized) ? normalized : '';
  }

  private navigate(type: ElectionType, date: string, region = this.region()): void {
    const commands = ['/', type, 'election', date];
    const queryParams: Params = {};
    if (region) commands.push('region', region);
    else if (this.segments()[3] === 'region' || this.segments()[3] === 'all') commands.push('all');
    const panel = parseElectionPanel(this.tree().queryParams['panel'], type, !region);
    if (panel && panel !== 'results') queryParams['panel'] = panel;
    if (type === 'governmental'
      && this.type() === 'governmental' && this.tree().queryParams['metric'] === 'below-threshold') {
      queryParams['metric'] = 'below-threshold';
    }
    const mode = this.tree().queryParams['mode'];
    const tab = this.tree().queryParams['tab'];
    if (panel === 'mandates' && tab === 'simulator') queryParams['tab'] = 'simulator';
    if (panel === 'comparison' && this.tree().queryParams['comparison'] === 'parties') queryParams['comparison'] = 'parties';
    if (panel === 'comparison'
      && (mode === 'parties' || mode === 'candidates' && type === 'governmental')) queryParams['mode'] = mode;
    void this.router.navigate(commands, { queryParams });
  }
}
