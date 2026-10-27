import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { SelectComponent, SelectOption } from '../ui/select/select';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DEMOGRAPHIC_METRICS, DemographicData } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPartyColor, getPartyDisplayName, getPartyLegendIndex } from '../../utils/party-colors';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { BaseModalComponent } from '../ui/base-modal/base-modal';

const CORRELATION_FORMAT = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const METRIC_ORDER = Object.keys(DEMOGRAPHIC_METRICS);

@Component({
  selector: 'app-demographic-breakdown',
  standalone: true,
  imports: [LoadingBarComponent, SelectComponent, HlmButtonDirective, HlmTooltipDirective, BaseModalComponent],
  templateUrl: './demographic-breakdown.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemographicBreakdownComponent {
  private readonly context = inject(ElectionContextService);
  private readonly theme = inject(ThemeService);
  readonly modalPages = inject(ModalPageService);
  readonly methodOpen = signal(false);
  readonly date = input.required<string>();
  readonly data = signal<DemographicData | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly group = signal('all');
  readonly groups = [
    { id: 'all', label: 'Всички показатели', icon: 'summary' }, { id: 'education', label: 'Образование', icon: 'education' },
    { id: 'age', label: 'Възраст', icon: 'calendar' }, { id: 'economy', label: 'Икономика', icon: 'economy' },
    { id: 'ethnicity', label: 'Етническа група', icon: 'users' }, { id: 'religion', label: 'Вероизповедание', icon: 'religion' }, { id: 'gender', label: 'Пол', icon: 'person' },
  ] as const;
  readonly groupOptions: SelectOption[] = this.groups.map(group => ({ value: group.id, label: group.label, icon: group.icon }));
  readonly displayName = getPartyDisplayName;
  readonly legendParties = computed(() => (this.data()?.parties ?? []).slice().sort((left, right) =>
    getPartyLegendIndex(left.name) - getPartyLegendIndex(right.name)));
  readonly rows = computed(() => {
    const data = this.data();
    if (!data) return [];
    return data.rows.filter(row => this.group() === 'all' || DEMOGRAPHIC_METRICS[row.metric].group === this.group())
      .sort((left, right) => this.groups.findIndex(group => group.id === DEMOGRAPHIC_METRICS[left.metric].group)
        - this.groups.findIndex(group => group.id === DEMOGRAPHIC_METRICS[right.metric].group)
        || METRIC_ORDER.indexOf(left.metric) - METRIC_ORDER.indexOf(right.metric))
      .map(row => ({
        metric: row.metric, label: DEMOGRAPHIC_METRICS[row.metric].label,
        group: DEMOGRAPHIC_METRICS[row.metric].group,
        groupLabel: this.groups.find(group => group.id === DEMOGRAPHIC_METRICS[row.metric].group)!.label,
        points: row.correlations.map((r, index) => {
          const party = data.parties[index];
          const label = `${getPartyDisplayName(party.name)}\n${DEMOGRAPHIC_METRICS[row.metric].label}\nr = ${this.format(r)}`;
          return { party, r, position: (r + 1) * 50, label,
            tooltip: label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') };
        }),
      }));
  });

  constructor() {
    effect(onCleanup => {
      const date = this.date();
      this.methodOpen.set(false);
      this.loading.set(true);
      this.error.set('');
      this.data.set(null);
      const subscription = this.context.getDemographics(date).subscribe({
        next: data => { this.data.set(data); this.loading.set(false); },
        error: () => { this.error.set('Демографските данни не могат да бъдат заредени.'); this.loading.set(false); },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  setGroup(group: string): void {
    if (this.groups.some(option => option.id === group)) this.group.set(group);
  }

  color(name: string): string {
    return getPartyColor(name, this.theme.darkMode());
  }

  format(value: number): string {
    return (value > 0 ? '+' : '') + CORRELATION_FORMAT.format(value);
  }
}
