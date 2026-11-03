import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { HistoricalRunoffBenchmark } from './forensics.models';
import { isOfficialSource, signed } from './forensics.util';
import { getPresidentialCandidateName } from '../../utils/candidate-label';

@Component({
  selector: 'app-forensics-history',
  imports: [DecimalPipe, HighchartsChartComponent, HlmButtonDirective, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <highcharts-chart class="block w-full" [options]="chart()" />
    <p class="note">Различни годишни извадки и изборен контекст. 2016/2021: липсват адреси и потвърдени флагове за специални секции. @if (hasArchiveRebuild()) {Архивните възстановки са без нова проверка на ZIP.} Сравнението е описателно.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Сравнение с историческите балотажи"><table class="history-summary">
      <caption>Една и съща извадка за всички стойности в съответната година.</caption>
      <thead><tr><th scope="col">Година</th><th scope="col">Сравними секции</th><th scope="col">Δ активност</th><th scope="col">Δ гласували</th><th scope="col">Δ финалист 1</th><th scope="col">Δ финалист 2</th></tr></thead>
      <tbody>@for (row of ordered(); track row.cycle) {<tr>
        <th scope="row">{{ row.cycle }}@if (row.context) {<small [title]="row.context">{{ contextLabel(row) }}</small>}</th>
        <td>{{ row.eligibleN ?? row.n | number }}<small>от {{ row.sections | number }}</small></td>
        <td><strong>{{ signed(row.deltaTurnoutPp) }}</strong><small>п.п.</small></td>
        <td>{{ signed(row.deltaVoted, 0) }}</td>
        @for (index of [0, 1]; track index) {<td class="finalist">@if (row.finalists[index]; as candidate) {<strong>{{ signed(candidate.deltaVotes, 0) }}</strong><small [title]="candidate.name">{{ candidateName(candidate.name) }}</small>} @else {няма данни}</td>}
      </tr>}</tbody>
    </table></div>
    @for (row of ordered(); track row.cycle) {
      <details class="cycle-details" [attr.data-cycle]="row.cycle">
        <summary><app-map-icon name="history" />{{ row.cycle }} · Базови стойности, контекст и източници</summary>
        <div class="cycle-body">
          <p>{{ row.cohortDefinition }}</p>
          <p class="note">{{ matching(row.matchingConfidence) }} · {{ row.excludedN | number }} изключени секции.</p>
          @if (row.context) {<p>{{ row.context }} @if (isOfficialSource(row.contextSourceUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="row.contextSourceUrl" target="_blank" rel="noopener noreferrer" title="Контекст на изборите: ЦИК"><app-map-icon name="share" />ЦИК</a>}</p>}
          <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="'Базови стойности ' + row.cycle"><table><thead><tr><th scope="col">Показател</th><th scope="col">I тур · {{ row.round1Date }}</th><th scope="col">II тур · {{ row.round2Date }}</th></tr></thead><tbody>
            <tr><th scope="row">По списък</th><td>{{ row.registered1 | number }}</td><td>{{ row.registered2 | number }}</td></tr>
            <tr><th scope="row">Дописани</th><td>{{ row.added1 | number }}</td><td>{{ row.added2 | number }}</td></tr>
            <tr><th scope="row">Гласували</th><td>{{ row.voted1 | number }}</td><td>{{ row.voted2 | number }}</td></tr>
            <tr><th scope="row">Активност</th><td>{{ percent(row.turnout1) }}</td><td>{{ percent(row.turnout2) }}</td></tr>
          </tbody></table></div>
          <p class="note">Средна секционна промяна: {{ signed(row.meanDeltaPp) }} п.п. Общата промяна в графиката използва сумите на гласувалите и избирателите по списък.</p>
          <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="'Кандидатски резултати ' + row.cycle"><table><caption>Дяловете включват всички действителни гласове, включително „Не подкрепям никого“.</caption><thead><tr><th scope="col">Кандидатска двойка</th><th scope="col">Гласове I / II</th><th scope="col">Δ гласове</th><th scope="col">Дял I / II</th><th scope="col">Δ дял, п.п.</th></tr></thead><tbody>@for (candidate of row.finalists; track candidate.name) {<tr><th scope="row">{{ candidate.name }}<small>Бюлетина {{ candidate.ballot1 }} / {{ candidate.ballot2 }}</small></th><td>{{ candidate.votes1 | number }} / {{ candidate.votes2 | number }}</td><td>{{ signed(candidate.deltaVotes, 0) }}</td><td>{{ percent(candidate.share1) }} / {{ percent(candidate.share2) }}</td><td>{{ signed(candidate.deltaSharePp) }}</td></tr>}</tbody></table></div>
          @if (row.stableListSensitivity; as stable) {<p>Стабилни списъци: {{ stable.n | number }} секции · Δ активност {{ signed(stable.deltaTurnoutPp) }} п.п. · Δ гласували {{ signed(stable.deltaVoted, 0) }}.</p>}
          <details class="limits"><summary>Ограничения на сравнението</summary><ul>@for (limitation of row.limitations; track $index) {<li>{{ limitation }}</li>}</ul></details>
          @if (needsArchiveNote(row)) {<p class="note">Архивна възстановка по документиран източник; ZIP не е повторно проверен.</p>}
          <div class="sources">@for (source of row.sources; track source.date) {@if (isOfficialSource(source.sourceUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="source.sourceUrl" target="_blank" rel="noopener noreferrer" [title]="'Официален източник ' + source.date"><app-map-icon name="share" />{{ source.date }}</a>}@if (isSourceDocumentation(source.sourceDocumentationUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="source.sourceDocumentationUrl" target="_blank" rel="noopener noreferrer" [title]="'Запазена документация ' + source.date"><app-map-icon name="history" />{{ source.date }} · SOURCE.md</a>}}</div>
        </div>
      </details>
    }
  `,
  styleUrl: './forensics-history.scss',
})
export class ForensicsHistoryComponent {
  readonly benchmarks = input<HistoricalRunoffBenchmark[]>([]);
  readonly ordered = computed(() => [...this.benchmarks()].sort((a, b) => a.cycle - b.cycle));
  readonly signed = signed;
  readonly isOfficialSource = isOfficialSource;
  readonly hasArchiveRebuild = computed(() => this.ordered().some(row => this.needsArchiveNote(row)));
  readonly candidateName = getPresidentialCandidateName;
  contextLabel(row: HistoricalRunoffBenchmark): string {
    const context = row.context?.toLocaleLowerCase('bg') ?? '';
    return context.includes('референдум') ? 'С референдум' : context.includes('парламентар') ? 'С парламентарен вот' : 'Изборен контекст';
  }
  readonly chart = computed<Highcharts.Options>(() => ({
    chart: { type: 'column', height: 280, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: 'Промяна в общата активност по балотажи', style: { color: 'var(--research-ink)', fontSize: '15px' } },
    xAxis: { categories: this.ordered().map(row => String(row.cycle)), labels: { style: { color: 'var(--research-ink)' } } },
    yAxis: { title: { text: 'Процентни пункта', style: { color: 'var(--research-ink)' } }, labels: { style: { color: 'var(--research-ink)' } }, gridLineColor: 'var(--research-rule)', plotLines: [{ value: 0, color: '#81909c', width: 1 }] },
    legend: { enabled: false }, credits: { enabled: false }, tooltip: { valueDecimals: 2, valueSuffix: ' п.п.' },
    plotOptions: { series: { animation: false, dataLabels: { enabled: true, format: '{point.y:.2f} п.п.', style: { color: 'var(--research-ink)', textOutline: 'none' } } } },
    series: [{ type: 'column', name: 'Δ активност', color: '#81909c', data: this.ordered().map(row => row.deltaTurnoutPp) }],
  }));
  percent(value: number | null): string {
    return value === null ? 'няма данни' : value.toLocaleString('bg-BG', { maximumFractionDigits: 2 }) + '%';
  }
  needsArchiveNote(row: HistoricalRunoffBenchmark): boolean {
    return row.sources.some(source => source.freshArchiveVerification === false);
  }
  isSourceDocumentation(url: unknown): url is string {
    return isOfficialSource(url) || typeof url === 'string' && /^\/data\/\d{4}\.\d{2}\.\d{2}\/SOURCE\.md$/.test(url);
  }
  matching(value: string): string {
    return ({ code_and_place_only: 'По номер и населено място; адресът не е потвърден', code_place_only_missing_addresses: 'По номер и населено място; историческите адреси липсват',
      address_checked: 'Проверени номер, място и адрес', mixed: 'Смесено ниво на съпоставяне', no_eligible_pairs: 'Няма допустими двойки секции',
      strict_address_identity: 'Проверено съответствие на номер, място и адрес' } as Record<string, string>)[value] ?? value;
  }
}
