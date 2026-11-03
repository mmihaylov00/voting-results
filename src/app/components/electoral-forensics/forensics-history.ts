import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { HistoricalRunoffBenchmark } from './forensics.models';
import { isOfficialSource, signed } from './forensics.util';

@Component({
  selector: 'app-forensics-history',
  imports: [DecimalPipe, HighchartsChartComponent, HlmButtonDirective, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="note">2016/2021: по-слабо съпоставяне по код и място; липсват адреси и потвърдени флагове за специални секции. Годините използват различни извадки и изборен контекст.</p>
    <highcharts-chart class="block w-full" [options]="chart()" />
    <div class="table-scroll" tabindex="0" role="region" aria-label="Сравнение с историческите балотажи"><table>
      <caption>Описателно сравнение, а не тест дали сегашните резултати са нормални. Сумите във всеки ред използват една и съща извадка.</caption>
      <thead><tr><th scope="col">Избори</th><th scope="col">Съпоставени / общо</th><th scope="col">Гласували I / II</th><th scope="col">Активност I / II</th><th scope="col">Δ активност, п.п.</th><th scope="col">Δ гласували</th><th scope="col">Δ гласове за всеки финалист</th></tr></thead>
      <tbody>@for (row of ordered(); track row.cycle) {<tr><th scope="row">{{ row.cycle }}@if (row.context) {<small>{{ row.context }}</small>}</th><td>{{ row.eligibleN ?? row.n | number }} / {{ row.sections | number }}</td><td>{{ row.voted1 | number }} / {{ row.voted2 | number }}</td><td>{{ percent(row.turnout1) }} / {{ percent(row.turnout2) }}</td><td>{{ signed(row.deltaTurnoutPp) }}</td><td>{{ signed(row.deltaVoted, 0) }}</td><td class="wrap-cell">@for (candidate of row.finalists; track candidate.name) {<div class="finalist"><strong>{{ signed(candidate.deltaVotes, 0) }}</strong> · {{ candidate.name }}<small>{{ candidate.votes1 | number }} → {{ candidate.votes2 | number }}</small></div>}</td></tr>}</tbody>
    </table></div>
    @for (row of ordered(); track row.cycle) {<details><summary>{{ row.cycle }} · Извадка, стабилни списъци и източници</summary>
      <p>{{ row.cohortDefinition }}</p><p><strong>Съпоставяне:</strong> {{ matching(row.matchingConfidence) }} · {{ row.excludedN | number }} изключени секции.</p>
      @if (row.context) {<p>{{ row.context }} @if (isOfficialSource(row.contextSourceUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="row.contextSourceUrl" target="_blank" rel="noopener noreferrer" title="Контекст на изборите: ЦИК"><app-map-icon name="share" />ЦИК</a>}</p>}
      @if (row.stableListSensitivity; as stable) {<p>Проверка със стабилни списъци: {{ stable.n | number }} секции · Δ активност {{ signed(stable.deltaTurnoutPp) }} п.п. · Δ гласували {{ signed(stable.deltaVoted, 0) }}.</p>}
      <ul>@for (limitation of row.limitations; track $index) {<li>{{ limitation }}</li>}</ul>
      @if (needsArchiveNote(row)) {<p>Архивна възстановка по документиран източник; ZIP не е повторно проверен.</p>}
      <div class="sources">@for (source of row.sources; track source.date) {@if (isOfficialSource(source.sourceUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="source.sourceUrl" target="_blank" rel="noopener noreferrer" [title]="'Официален източник ' + source.date"><app-map-icon name="share" />{{ source.date }}</a>}@if (isSourceDocumentation(source.sourceDocumentationUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="source.sourceDocumentationUrl" target="_blank" rel="noopener noreferrer" [title]="'Запазена документация ' + source.date"><app-map-icon name="history" />{{ source.date }} · SOURCE.md</a>}}</div>
    </details>}
  `,
  styleUrl: './forensics-tables.scss',
  styles: `.note{font-size:.8rem;line-height:1.6;opacity:.75;margin-bottom:1rem}tbody th{white-space:normal;min-width:170px;max-width:240px}.finalist{padding:.3rem 0}details{padding:.75rem 0;border-top:1px solid hsl(var(--foreground)/.12);font-size:.84rem}summary{cursor:pointer;font-weight:550}p,li{line-height:1.6}ul{list-style:disc;padding-left:1.2rem}.sources{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.8rem}`,
})
export class ForensicsHistoryComponent {
  readonly benchmarks = input<HistoricalRunoffBenchmark[]>([]);
  readonly ordered = computed(() => [...this.benchmarks()].sort((a, b) => a.cycle - b.cycle));
  readonly signed = signed;
  readonly isOfficialSource = isOfficialSource;
  readonly chart = computed<Highcharts.Options>(() => ({
    chart: { type: 'column', height: 260, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: 'Промяна в общата активност по балотажи', style: { color: 'var(--research-ink)', fontSize: '15px' } },
    xAxis: { categories: this.ordered().map(row => String(row.cycle)), labels: { style: { color: 'var(--research-ink)' } } },
    yAxis: { title: { text: 'Процентни пункта', style: { color: 'var(--research-ink)' } }, labels: { style: { color: 'var(--research-ink)' } }, gridLineColor: 'var(--research-rule)' },
    legend: { enabled: false }, credits: { enabled: false }, tooltip: { valueDecimals: 2, valueSuffix: ' п.п.' },
    plotOptions: { series: { animation: false } },
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
