import { DecimalPipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ForensicsHypothesis } from './forensics.models';
import { signed } from './forensics.util';

type Coefficient = { name: string; estimate: number | null; ci95: [number, number] | null; p: number | null };

function numericInterval(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? [value[0], value[1]] : null;
}

@Component({
  selector: 'app-forensics-hypotheses',
  imports: [DecimalPipe, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="table-scroll" tabindex="0" role="region" aria-label="Резултати от статистическите проверки"><table>
    <caption>Оценка, 95% доверителен интервал, p-стойност и коригирана q-стойност. Липсваща оценка означава описателна или неустановима проверка.</caption>
    <thead><tr><th scope="col">Хипотеза и сравнение</th><th scope="col">Статус</th><th scope="col">N</th><th scope="col">Оценка</th><th scope="col">95% интервал</th><th scope="col">p</th><th scope="col">q</th></tr></thead>
    <tbody>@for (row of rows(); track row.id) {<tr><th scope="row">{{ row.id }} · {{ row.title }}<small>{{ row.summary }}</small></th><td>{{ status(row.status) }}</td><td>{{ row.n | number }}</td><td>{{ row.id === 'H2' && row.estimate === null ? 'Партийни оценки по-долу' : signed(row.estimate) }}<small>{{ row.unit }}</small></td><td>{{ interval(row.ci95) }}</td><td>{{ probability(row.p) }}</td><td>{{ probability(row.q) }}</td></tr>}</tbody>
    </table></div>
    @if (sensitivities().length) {<details><summary>Същите кандидатски проверки при стабилни списъци</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Кандидатски проверки при стабилни списъци"><table><caption>Отделна извадка със стабилни списъци. Показани са публикуваните оценки и корекции за тази проверка.</caption><thead><tr><th scope="col">Проверка</th><th scope="col">Статус</th><th scope="col">N</th><th scope="col">Оценка</th><th scope="col">95% интервал</th><th scope="col">p</th><th scope="col">q</th></tr></thead><tbody>@for (row of sensitivities(); track row.id) {<tr><th scope="row">{{ row.id }}</th><td>{{ status(row.status) }}</td><td>{{ row.n ?? 'няма данни' }}</td><td>{{ signed(row.estimate) }}</td><td>{{ interval(row.ci95) }}</td><td>{{ probability(row.p) }}</td><td>{{ probability(row.q) }}</td></tr>}</tbody></table></div></details>}
    @for (row of partyEstimates(); track row.id) {<div class="party-estimates"><h4>{{ row.id }} · Партийни оценки</h4><div class="table-scroll" tabindex="0" role="region" aria-label="Партийни оценки и доверителни интервали"><table><caption>Промяна в активността за +10 п.п. исторически партиен дял. p-стойностите на отделните коефициенти са некоригирани; основната q-стойност за H2 е в общата таблица.</caption><thead><tr><th scope="col">Отделна регистрация от 19.04.2026</th><th scope="col">Оценка, п.п.</th><th scope="col">95% интервал</th><th scope="col">p</th></tr></thead><tbody>@for (coefficient of row.coefficients; track coefficient.name) {<tr><th scope="row">{{ coefficient.name }}</th><td>{{ signed(coefficient.estimate) }}</td><td>{{ interval(coefficient.ci95) }}</td><td>{{ probability(coefficient.p) }}</td></tr>}</tbody></table></div></div>}
    @for (row of rows(); track row.id) {<details><summary>{{ row.id }} · Метод, контроли и ограничения</summary><p>{{ row.method }}</p><ul>@for (limitation of row.limitations; track $index) {<li>{{ limitation }}</li>}</ul><details><summary>Технически резултат и всички контролни коефициенти</summary><pre>{{ row.details | json }}</pre></details></details>}`,
  styleUrl: './forensics-tables.scss',
  styles: `th:first-child{min-width:260px;max-width:510px;white-space:normal}th small{line-height:1.6}td small{max-width:210px;white-space:normal}.party-estimates{margin:1.2rem 0}h4{font-weight:600;font-size:.9rem}details{font-size:.84rem;padding:.8rem 0;border-top:1px solid hsl(var(--foreground)/.12)}summary{cursor:pointer;font-weight:550}p,li{line-height:1.7}ul{list-style:disc;padding-left:1.2rem}pre{max-height:420px;overflow:auto;font-size:.72rem;white-space:pre-wrap;overflow-wrap:anywhere}`,
})
export class ForensicsHypothesesComponent {
  readonly rows = input<ForensicsHypothesis[]>([]);
  readonly signed = signed;
  readonly partyEstimates = computed(() => this.rows().filter(row => row.id === 'H2').map(row => ({
    id: row.id, coefficients: this.coefficients(row),
  })).filter(row => row.coefficients.length));
  readonly sensitivities = computed(() => this.rows().flatMap(row => {
    const data = row.details['sensitivity'];
    if (!row.id.startsWith('C') || !data || typeof data !== 'object' || Array.isArray(data)) return [];
    const record = data as Record<string, unknown>;
    return [{ id: row.id, status: typeof record['status'] === 'string' ? record['status'] : 'insufficient_support',
      n: typeof record['n'] === 'number' ? record['n'] : null,
      estimate: typeof record['estimate'] === 'number' ? record['estimate'] : null,
      ci95: numericInterval(record['ci95']), p: typeof record['p'] === 'number' ? record['p'] : null,
      q: typeof record['q'] === 'number' ? record['q'] : null }];
  }));

  status(value: string): string {
    return ({ estimated: 'Оценена асоциация', descriptive: 'Описателна', not_identifiable: 'Неустановим ефект',
      insufficient_support: 'Недостатъчна извадка', exploratory: 'Изследователска проверка' } as Record<string, string>)[value] ?? value;
  }

  interval(value: [number, number] | null): string {
    return value ? `[${signed(value[0])}; ${signed(value[1])}]` : 'няма оценка';
  }

  probability(value: number | null): string {
    if (value === null) return 'няма оценка';
    return value < .0001 ? '<0,0001' : value.toLocaleString('bg-BG', { maximumFractionDigits: 4 });
  }

  private coefficients(row: ForensicsHypothesis): Coefficient[] {
    const coefficients = row.details['coefficients'];
    if (!coefficients || typeof coefficients !== 'object') return [];
    const names: Record<string, string> = { gerbSharePer10pp: 'ГЕРБ-СДС · №15', dpsSharePer10pp: 'Движение за права и свободи - ДПС · №17' };
    return Object.entries(coefficients).flatMap(([key, value]) => {
      if (!names[key] || !value || typeof value !== 'object') return [];
      const record = value as Record<string, unknown>;
      const ci = record['ci95'];
      return [{ name: names[key], estimate: typeof record['estimate'] === 'number' ? record['estimate'] : null,
        p: typeof record['p'] === 'number' ? record['p'] : null,
        ci95: numericInterval(ci) }];
    });
  }
}
