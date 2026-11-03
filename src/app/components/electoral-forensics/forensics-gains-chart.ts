import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { ThemeService } from '../../services/theme.service';
import { getPartyColor } from '../../utils/party-colors';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SignedChangeDirective } from '../ui/signed-change/signed-change';
import { ViewTab, ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { ForensicsSection } from './forensics.models';
import { sectionLabel, signed } from './forensics.util';

export interface SectionGainPoint {
  row: ForensicsSection;
  turnout: number;
  gyurov: number;
  yotova: number;
  listChangePct: number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Matches the joint paired cohort, excluding non-finite chart coordinates and vote baselines. */
export function sectionGainPoints(rows: readonly ForensicsSection[]): SectionGainPoint[] {
  return rows.flatMap(row => {
    if (!row.comparableRoundPair || row.eligible === false
      || !finite(row.registered1) || row.registered1 <= 0 || !finite(row.registered2) || row.registered2 <= 0
      || !finite(row.voted1) || !finite(row.voted2) || !finite(row.deltaVoted)) return [];
    const gyurov = row.candidateChanges.find(candidate => candidate.id === '4');
    const yotova = row.candidateChanges.find(candidate => candidate.id === '25');
    if (!gyurov || !yotova || ![gyurov.votes1, gyurov.votes2, gyurov.deltaVotes,
      yotova.votes1, yotova.votes2, yotova.deltaVotes].every(finite)) return [];
    return [{ row, turnout: row.deltaVoted, gyurov: gyurov.deltaVotes, yotova: yotova.deltaVotes,
      listChangePct: 100 * Math.abs(row.registered2 - row.registered1) / row.registered1 }];
  });
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

@Component({
  selector: 'app-forensics-gains-chart',
  imports: [HighchartsChartComponent, ViewTabsComponent, HlmButtonDirective, MapIconComponent, SignedChangeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-view-tabs [tabs]="comparisonTabs" [(value)]="comparison" label="Сравнение на секционния прираст"
      [idPrefix]="tabPrefix" [panelId]="tabPrefix + '-panel'" />
    <div class="chart-controls">
      <label class="stable-filter"><input type="checkbox" [checked]="stableOnly()" (change)="stableOnly.set(checked($event))">Само стабилни списъци (до 5% промяна)</label>
      <p class="scope" aria-live="polite"><strong>{{ count(points().length) }}</strong> от {{ count(rows().length) }} секции
        @if (rows().length !== eligiblePoints().length) { · {{ count(rows().length - eligiblePoints().length) }} без допустима пълна двойка}
        @if (stableOnly()) { · {{ count(eligiblePoints().length - points().length) }} с променени списъци извън графиката}
      </p>
    </div>
    <div role="tabpanel" [id]="tabPrefix + '-panel'" [attr.aria-labelledby]="tabPrefix + '-tab-' + comparison()">
      @if (points().length) {
        <highcharts-chart class="block w-full" [options]="chart()" />
        <p class="note list-key"><span class="list-marker" aria-hidden="true"></span>Жълт контур: над 5% промяна в списъка.</p>
        <p class="note">Една точка = една секция; еднаквите стойности се застъпват. Изберете точка за секционните данни. На компютър може да увеличите област с влачене.</p>
        <p class="note">Над линията 1:1 прирастът за Йотова е по-голям от {{ comparison() === 'gyurov' ? 'прираста за Гюров' : 'промяната в броя гласували' }}. Промененият кандидатски избор също влияе; графиката не доказва индивидуални прехвърляния или нарушение.</p>
      } @else {<p class="empty" role="status">Няма допустими секции с пълни данни за избраните филтри.</p>}
    </div>
    @if (points().length) {
      <div class="rank-heading"><h3>Най-големи промени за Йотова</h3>
        <label>Подреди по<select [value]="ranking()" (change)="changeRanking($event)"><option value="absolute">Най-голяма промяна</option><option value="gain">Най-голям ръст</option></select></label>
      </div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Секциите с най-големи промени за Йотова">
        <table class="geography-table"><caption>Първите {{ count(ranked().length) }} от същата извадка. {{ ranking() === 'absolute' ? 'По абсолютната промяна, включително спадове.' : 'По най-големия прираст в гласове.' }} Δ = II тур - I тур.</caption>
          <thead><tr><th scope="col">Секция / място</th><th scope="col">Δ Йотова</th><th scope="col">Δ Гюров</th><th scope="col">Δ гласували</th><th scope="col">Δ активност, п.п.</th><th scope="col">По списък I / II</th></tr></thead>
          <tbody>@for (point of ranked(); track point.row.sectionId) {<tr>
            <th scope="row"><button hlmBtn variant="ghost" size="sm" class="section-link gap-1" type="button" [attr.aria-label]="'Отвори секция ' + point.row.sectionId" (click)="sectionSelect.emit(point.row)"><app-map-icon name="section" />{{ point.row.sectionId }}</button><small>{{ sectionLabel(point.row) }}</small></th>
            <td><strong [appSignedChange]="point.yotova">{{ signed(point.yotova, 0) }}</strong><small>{{ candidateVotes(point.row, '25', 'votes1') }} → {{ candidateVotes(point.row, '25', 'votes2') }}</small></td>
            <td><span [appSignedChange]="point.gyurov">{{ signed(point.gyurov, 0) }}</span></td>
            <td><span [appSignedChange]="point.turnout">{{ signed(point.turnout, 0) }}</span></td>
            <td><span [appSignedChange]="point.row.deltaTurnoutPp">{{ signed(point.row.deltaTurnoutPp) }}</span></td>
            <td>{{ count(point.row.registered1) }} / {{ count(point.row.registered2) }}@if (point.listChangePct > 5) {<small>Промяна над 5%</small>}</td>
          </tr>}</tbody>
        </table>
      </div>
    }
  `,
  styleUrl: './forensics-gains-chart.scss',
})
export class ForensicsGainsChartComponent {
  private static nextId = 0;
  readonly tabPrefix = `section-gains-${++ForensicsGainsChartComponent.nextId}`;
  readonly rows = input.required<readonly ForensicsSection[]>();
  readonly sectionSelect = output<ForensicsSection>();
  readonly comparison = signal('turnout');
  readonly stableOnly = signal(false);
  readonly ranking = signal<'absolute' | 'gain'>('absolute');
  readonly comparisonTabs: ViewTab[] = [{ id: 'turnout', label: 'Йотова и гласувалите' }, { id: 'gyurov', label: 'Йотова и Гюров' }];
  readonly signed = signed;
  readonly sectionLabel = sectionLabel;
  private readonly theme = inject(ThemeService);
  readonly eligiblePoints = computed(() => sectionGainPoints(this.rows()));
  readonly points = computed(() => this.eligiblePoints().filter(point => !this.stableOnly() || point.listChangePct <= 5));
  readonly orderedByMagnitude = computed(() => [...this.points()].sort((a, b) => Math.abs(b.yotova) - Math.abs(a.yotova) || a.row.sectionId.localeCompare(b.row.sectionId)));
  readonly ranked = computed(() => (this.ranking() === 'absolute' ? this.orderedByMagnitude()
    : [...this.points()].sort((a, b) => b.yotova - a.yotova || a.row.sectionId.localeCompare(b.row.sectionId))).slice(0, 20));

  readonly chart = computed<Highcharts.Options>(() => {
    const points = this.points();
    const pointsById = new Map(points.map(point => [point.row.sectionId, point]));
    const xValue = (point: SectionGainPoint) => this.comparison() === 'gyurov' ? point.gyurov : point.turnout;
    const extremeIds = new Set(this.orderedByMagnitude().filter(point => point.yotova !== 0).slice(0, 5).map(point => point.row.sectionId));
    let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
    for (const point of points) {
      minX = Math.min(minX, xValue(point)); maxX = Math.max(maxX, xValue(point));
      minY = Math.min(minY, point.yotova); maxY = Math.max(maxY, point.yotova);
    }
    const start = Math.max(minX, minY); const end = Math.min(maxX, maxY);
    const positive = getPartyColor('Илияна Йотова', this.theme.darkMode());
    const negative = this.theme.darkMode() ? '#fb7185' : '#be123c';
    const openPoint = (id: string | undefined) => {
      const point = id === undefined ? undefined : pointsById.get(id);
      if (point) this.sectionSelect.emit(point.row);
    };
    const tooltip = (id: string | undefined) => {
      const point = id === undefined ? undefined : pointsById.get(id);
      return point ? this.tooltip(point) : '';
    };
    return {
      chart: { type: 'scatter', height: 500, backgroundColor: 'transparent', style: { fontFamily: 'inherit' }, zooming: { type: 'xy', pinchType: 'xy' } },
      title: { text: 'Всяка точка е избирателна секция', align: 'left', style: { color: 'var(--research-ink)', fontSize: '15px' } },
      xAxis: { title: { text: this.comparison() === 'gyurov' ? 'Δ гласове за Гюров' : 'Δ гласували', style: { color: 'var(--research-ink)' } },
        allowDecimals: false, minRange: 1, labels: { style: { color: 'var(--research-ink)' } }, gridLineWidth: 1, gridLineColor: 'var(--research-rule)', plotLines: [{ value: 0, color: '#81909c', width: 1 }] },
      yAxis: { title: { text: 'Δ гласове за Йотова', style: { color: 'var(--research-ink)' } },
        allowDecimals: false, minRange: 1, labels: { style: { color: 'var(--research-ink)' } }, gridLineColor: 'var(--research-rule)', plotLines: [{ value: 0, color: '#81909c', width: 1 }] },
      legend: { align: 'left', itemStyle: { color: 'var(--research-ink)', fontSize: '11px' } }, credits: { enabled: false },
      lang: { resetZoom: 'Всички точки', resetZoomTitle: 'Нулирай увеличението' },
      tooltip: { useHTML: false, outside: false, backgroundColor: 'hsl(var(--background))', borderColor: '#81909c', style: { color: 'var(--research-ink)', fontSize: '12px' },
        formatter() { return tooltip(this.options.id); } },
      plotOptions: { series: { animation: false }, scatter: { turboThreshold: 0, cursor: 'pointer', marker: { radius: 3, lineWidth: 0 },
        // Shared filtering keeps label ownership intact across point and theme updates.
        point: { events: { click() { openPoint(this.options.id); } } }, dataLabels: { enabled: true,
          filter: { property: 'labelrank', operator: '>', value: 0 }, format: '{point.name}', allowOverlap: false,
          style: { color: 'var(--research-ink)', textOutline: 'none', fontSize: '10px' } } } },
      series: [
        { type: 'line', name: 'Равен абсолютен прираст (описателна линия)', color: '#81909c', dashStyle: 'Dash', lineWidth: 1,
          marker: { enabled: false }, enableMouseTracking: false, data: [[start, start], [end, end]] },
        { type: 'scatter', name: 'Избирателни секции', color: positive, data: points.map(point => {
          const extreme = extremeIds.has(point.row.sectionId);
          const changedList = point.listChangePct > 5;
          const color = point.yotova > 0 ? positive : point.yotova < 0 ? negative : '#81909c';
          return { id: point.row.sectionId, x: xValue(point), y: point.yotova, name: escapeText(point.row.sectionId), labelrank: extreme ? Math.abs(point.yotova) : 0,
            marker: { radius: extreme ? 5 : 3, fillColor: Highcharts.color(color).setOpacity(extreme ? 1 : .35).get(),
              lineColor: changedList ? '#b58118' : 'var(--research-ink)', lineWidth: changedList ? 1.5 : extreme ? 1 : 0 } };
        }) },
      ],
      responsive: { rules: [{ condition: { maxWidth: 500 }, chartOptions: { chart: { height: 420 }, legend: { itemStyle: { fontSize: '10px' } } } }] },
    };
  });

  tooltip(point: SectionGainPoint): string {
    const row = point.row;
    return [
      `<b>${escapeText(row.sectionId)}</b>`,
      ...sectionLabel(row).split(' / ').filter(Boolean).map(escapeText),
      `По списък: ${this.count(row.registered1)} → ${this.count(row.registered2)}`,
      `Гласували: ${this.count(row.voted1)} → ${this.count(row.voted2)} (Δ ${signed(point.turnout, 0)})`,
      `Йотова: ${this.candidateVotes(row, '25', 'votes1')} → ${this.candidateVotes(row, '25', 'votes2')} (Δ ${signed(point.yotova, 0)})`,
      `Гюров: ${this.candidateVotes(row, '4', 'votes1')} → ${this.candidateVotes(row, '4', 'votes2')} (Δ ${signed(point.gyurov, 0)})`,
      `Δ активност: ${signed(row.deltaTurnoutPp)}${finite(row.deltaTurnoutPp) ? ' п.п.' : ''}`,
      point.listChangePct > 5 ? 'Списъкът се променя с над 5%' : 'Списъкът се променя с до 5%',
    ].join('<br/>');
  }

  count(value: number | null): string { return value === null ? 'няма данни' : value.toLocaleString('bg-BG'); }
  candidateVotes(row: ForensicsSection, id: string, round: 'votes1' | 'votes2'): string {
    return this.count(row.candidateChanges.find(candidate => candidate.id === id)?.[round] ?? null);
  }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  changeRanking(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'absolute' || value === 'gain') this.ranking.set(value);
  }
}
