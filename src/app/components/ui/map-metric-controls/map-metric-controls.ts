import { SelectComponent, SelectOption } from '../select/select';
import { Component, EventEmitter, Input, OnChanges, Output, ChangeDetectionStrategy } from '@angular/core';
import { MapMetric } from '../../../utils/map-metric.helper';
import { PartyFilterComponent } from '../../election-detail/party-filter/party-filter';

@Component({
  selector: 'app-map-metric-controls',
  standalone: true,
  imports: [SelectComponent, PartyFilterComponent],
  template: `
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <app-select class="min-w-0 flex-1" label="Показател на картата" [value]="metric" [options]="metricOptions" (valueChange)="selectMetric($event)" />
      @if (metric === 'party-votes' || metric === 'party-change') {
        <app-party-filter class="block min-w-0 w-full" position="right" [label]="presidential ? 'Кандидат' : 'Партия'" [parties]="parties"
          [selectedPartyIds]="selectedPartyIds" [partyVotes]="partyVotes" [singleSelect]="true" (selectedPartyIdsChange)="selectParty($event)" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: ':host { display: block; min-width: 0; }',
})
export class MapMetricControlsComponent implements OnChanges {
  @Input() metric: MapMetric = 'leading-party';
  @Input() selectedPartyId: string | null = null;
  @Input() parties: { id: string; name: string; total?: number }[] = [];
  @Input() partyVotes?: Record<string, number>;
  @Input() presidential = false;
  @Output() metricChange = new EventEmitter<MapMetric>();
  @Output() partyChange = new EventEmitter<string>();
  selectedPartyIds = new Set<string>();
  readonly metrics: { metric: MapMetric; label: string }[] = [
    { metric: 'leading-party', label: 'Партии' }, { metric: 'summary', label: 'Обобщение' },
    { metric: 'leading-preference', label: 'Преференции' }, { metric: 'activity', label: 'Активност' },
    { metric: 'risks', label: 'Риск' }, { metric: 'invalid-votes', label: 'Недействителни' },
    { metric: 'no-votes', label: 'Не подкрепям' }, { metric: 'machine-vs-paper', label: 'Машини / хартия' },
    { metric: 'winner-margin', label: 'Преднина на победителя' }, { metric: 'party-votes', label: 'Гласове за партия' },
    { metric: 'party-change', label: 'Промяна на подкрепата' }, { metric: 'below-threshold', label: 'Гласове за партии под 4%' },
  ];

  ngOnChanges(): void {
    this.selectedPartyIds = new Set(this.selectedPartyId ? [this.selectedPartyId] : []);
  }

  get metricOptions(): SelectOption<MapMetric>[] {
    return this.metrics.filter(item => !this.presidential || (item.metric !== 'leading-preference' && item.metric !== 'below-threshold'))
      .map(item => ({ value: item.metric, icon: item.metric,
        label: item.metric === 'leading-party' && this.presidential ? 'Кандидати'
          : item.metric === 'party-votes' && this.presidential ? 'Гласове за кандидат' : item.label }));
  }

  selectMetric(value: string): void {
    const selected = this.metrics.find(item => item.metric === value && (!this.presidential || (item.metric !== 'leading-preference' && item.metric !== 'below-threshold')));
    if (selected) this.metricChange.emit(selected.metric);
  }

  selectParty(ids: Set<string>): void {
    const selected = ids.values().next().value;
    if (selected) this.partyChange.emit(selected);
  }
}
