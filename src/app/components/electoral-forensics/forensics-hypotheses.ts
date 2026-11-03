import { DecimalPipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ForensicsHypothesis } from './forensics.models';
import { signed } from './forensics.util';
import { MapIconComponent } from '../ui/map-icon/map-icon';

type Coefficient = { name: string; estimate: number | null; ci95: [number, number] | null; p: number | null };

function numericInterval(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? [value[0], value[1]] : null;
}

@Component({
  selector: 'app-forensics-hypotheses',
  imports: [DecimalPipe, JsonPipe, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="guide">Изберете проверка за метода, p-стойността и ограниченията. Статистическият сигнал не доказва нарушение.</p>
    <div class="table-scroll checks" tabindex="0" role="region" aria-label="Резултати от статистическите проверки">
      <div class="check-grid check-head" aria-hidden="true"><span>Проверка</span><span>Оценка и 95% интервал</span><span>q</span><span>Наблюдения</span><span></span></div>
      @for (row of rows(); track row.id) {
        <details class="check" [attr.data-check-id]="row.id">
          <summary class="check-grid">
            <span class="check-label"><strong>{{ row.id }} · {{ shortLabel(row) }}</strong><span class="status-chip" [class.signal]="hasSignal(row)" [attr.title]="hasSignal(row) ? 'q < 0,05: асоциация в рамките на модела, а не доказателство за нарушение' : status(row.status)">{{ badge(row) }}</span></span>
            <span class="check-effect"><small class="mobile-label">Оценка · 95% интервал</small><strong>{{ row.id === 'H2' && row.estimate === null ? 'Две партийни оценки' : signed(row.estimate) }}</strong><small>{{ interval(row.ci95) }}@if (row.estimate !== null) { · {{ row.id.startsWith('C') ? 'п.п. / +10 п.п.' : 'п.п.' }}}</small></span>
            <span class="check-q" [attr.title]="row.q"><small class="mobile-label">q</small>{{ probability(row.q) }}</span>
            <span class="check-n"><small class="mobile-label">Наблюдения</small>{{ row.n | number }}<small>{{ row.id === 'H4' ? 'Места за гласуване' : 'Секции' }}</small></span>
            <app-map-icon class="toggle-icon" name="chevron-right" />
          </summary>
          <div class="check-body">
            <h4>{{ row.title }}</h4><p>{{ row.summary }}</p>
            <dl class="technical-values"><div><dt>p</dt><dd [attr.title]="row.p">{{ probability(row.p) }}</dd></div><div><dt>Мерна единица</dt><dd>{{ row.unit }}</dd></div><div><dt>Статус на оценката</dt><dd>{{ status(row.status) }}</dd></div></dl>
            @if (row.id === 'H2') {
              @for (party of partyEstimates(); track party.id) {
                <div class="party-estimates"><div class="table-scroll" tabindex="0" role="region" aria-label="Партийни оценки и доверителни интервали"><table><caption>За +10 п.п. исторически партиен дял. Отделните p-стойности са некоригирани; общата q-стойност за H2 е показана по-горе.</caption><thead><tr><th scope="col">Регистрация от 19.04.2026</th><th scope="col">Оценка, п.п.</th><th scope="col">95% интервал</th><th scope="col">p</th></tr></thead><tbody>@for (coefficient of party.coefficients; track coefficient.name) {<tr><th scope="row">{{ coefficient.name }}</th><td>{{ signed(coefficient.estimate) }}</td><td>{{ interval(coefficient.ci95) }}</td><td>{{ probability(coefficient.p) }}</td></tr>}</tbody></table></div></div>
              }
            }
            @if (row.method) {<p><strong>Метод:</strong> {{ row.method }}</p>}
            <ul>@for (limitation of row.limitations; track $index) {<li>{{ limitation }}</li>}</ul>
            <details class="technical"><summary>Всички контролни коефициенти и изчисления</summary><pre>{{ row.details | json }}</pre></details>
          </div>
        </details>
      }
    </div>
    @if (sensitivities().length) {<details><summary>Същите кандидатски проверки при стабилни списъци</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Кандидатски проверки при стабилни списъци"><table><caption>Отделна извадка със стабилни списъци. Показани са публикуваните оценки и корекции за тази проверка.</caption><thead><tr><th scope="col">Проверка</th><th scope="col">Статус</th><th scope="col">N</th><th scope="col">Оценка</th><th scope="col">95% интервал</th><th scope="col">p</th><th scope="col">q</th></tr></thead><tbody>@for (row of sensitivities(); track row.id) {<tr><th scope="row">{{ row.id }}</th><td>{{ status(row.status) }}</td><td>{{ row.n ?? 'няма данни' }}</td><td>{{ signed(row.estimate) }}</td><td>{{ interval(row.ci95) }}</td><td>{{ probability(row.p) }}</td><td>{{ probability(row.q) }}</td></tr>}</tbody></table></div></details>}
  `,
  styleUrl: './forensics-hypotheses.scss',
})
export class ForensicsHypothesesComponent {
  readonly rows = input<ForensicsHypothesis[]>([]);
  readonly signed = signed;
  shortLabel(row: ForensicsHypothesis): string {
    return ({ H1: 'Размер на секцията', H2: 'Исторически партиен дял', H3: 'Метод на гласуване',
      H4: 'Териториално сходство', H5: 'Алтернативни обяснения', C1: 'Активност и дял на Йотова',
      C2: 'ГЕРБ и дял на Йотова', C3: 'ДПС и дял на Йотова' } as Record<string, string>)[row.id] ?? row.title;
  }
  hasSignal(row: ForensicsHypothesis): boolean {
    return row.status === 'estimated' && row.q !== null && row.q < .05;
  }
  badge(row: ForensicsHypothesis): string {
    if (row.status === 'not_identifiable' || row.status === 'insufficient_support') return 'Недостатъчна подкрепа в данните';
    if (row.status === 'estimated' && row.q !== null) return this.hasSignal(row) ? 'Сигнал за асоциация' : 'Без ясен сигнал';
    return this.status(row.status);
  }
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
