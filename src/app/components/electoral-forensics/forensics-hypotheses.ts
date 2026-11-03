import { DecimalPipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ForensicsHypothesis } from './forensics.models';
import { signed } from './forensics.util';
import { ViewTabsComponent, ViewTab } from '../ui/view-tabs/view-tabs';
import { SignedChangeDirective } from '../ui/signed-change/signed-change';

type Coefficient = { name: string; estimate: number | null; ci95: [number, number] | null; p: number | null };

function numericInterval(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? [value[0], value[1]] : null;
}

@Component({
  selector: 'app-forensics-hypotheses',
  imports: [DecimalPipe, JsonPipe, ViewTabsComponent, SignedChangeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-view-tabs [tabs]="tabs()" [value]="selectedRow()?.id ?? ''" (valueChange)="activeId.set($event)" label="Статистическа проверка" [idPrefix]="tabPrefix" [panelId]="tabPrefix + '-panel'" />
    @if (selectedRow(); as row) {
      <section class="check-panel" role="tabpanel" tabindex="0" [id]="tabPrefix + '-panel'" [attr.aria-labelledby]="tabPrefix + '-tab-' + row.id" [attr.data-check-id]="row.id">
        <div class="check-heading"><h3>{{ row.title }}</h3><span class="status-chip" [class.signal]="hasSignal(row)" [attr.title]="hasSignal(row) ? 'q < 0,05: асоциация в рамките на модела, а не доказателство за нарушение' : status(row.status)">{{ badge(row) }}</span></div>
        <p>{{ row.summary }}</p>
        <dl class="check-metrics">
          <div><dt>Оценка</dt><dd [appSignedChange]="row.estimate">{{ row.id === 'H2' && row.estimate === null ? 'Две партийни оценки' : signed(row.estimate) }}</dd></div>
          <div><dt>95% интервал</dt><dd>{{ interval(row.ci95) }}</dd></div>
          <div><dt>q</dt><dd [attr.title]="row.q">{{ probability(row.q) }}</dd></div>
          <div><dt>p</dt><dd [attr.title]="row.p">{{ probability(row.p) }}</dd></div>
          <div><dt>{{ row.id === 'H4' ? 'Места за гласуване' : 'Секции' }}</dt><dd>{{ row.n | number }}</dd></div>
        </dl>
        <p class="unit"><strong>Мерна единица:</strong> {{ row.unit }}</p>
        @if (row.id === 'H2') {
          @for (party of partyEstimates(); track party.id) {
            <div class="party-estimates"><div class="table-scroll" tabindex="0" role="region" aria-label="Партийни оценки и доверителни интервали"><table><caption>За +10 п.п. исторически партиен дял. Отделните p-стойности са некоригирани; общата q-стойност за H2 е показана по-горе.</caption><thead><tr><th scope="col">Регистрация от 19.04.2026</th><th scope="col">Оценка, п.п.</th><th scope="col">95% интервал</th><th scope="col">p</th></tr></thead><tbody>@for (coefficient of party.coefficients; track coefficient.name) {<tr><th scope="row">{{ coefficient.name }}</th><td [appSignedChange]="coefficient.estimate">{{ signed(coefficient.estimate) }}</td><td>{{ interval(coefficient.ci95) }}</td><td>{{ probability(coefficient.p) }}</td></tr>}</tbody></table></div></div>
          }
        }
        @if (selectedSensitivity(); as stable) {
          <h4>Сравнение със стабилни списъци</h4>
          <div class="table-scroll" tabindex="0" role="region" aria-label="Кандидатски проверки при стабилни списъци"><table><caption>Същата проверка в две извадки; всяка използва собствената публикувана корекция.</caption><thead><tr><th scope="col">Извадка</th><th scope="col">Статус</th><th scope="col">Секции</th><th scope="col">Оценка</th><th scope="col">95% интервал</th><th scope="col">p</th><th scope="col">q</th></tr></thead><tbody>
            <tr><th scope="row">Основна</th><td>{{ status(row.status) }}</td><td>{{ row.n | number }}</td><td [appSignedChange]="row.estimate">{{ signed(row.estimate) }}</td><td>{{ interval(row.ci95) }}</td><td>{{ probability(row.p) }}</td><td>{{ probability(row.q) }}</td></tr>
            <tr><th scope="row">Стабилни списъци</th><td>{{ status(stable.status) }}</td><td>{{ stable.n ?? 'няма данни' }}</td><td [appSignedChange]="stable.estimate">{{ signed(stable.estimate) }}</td><td>{{ interval(stable.ci95) }}</td><td>{{ probability(stable.p) }}</td><td>{{ probability(stable.q) }}</td></tr>
          </tbody></table></div>
        }
        @if (row.method) {<p><strong>Метод:</strong> {{ row.method }}</p>}
        <ul class="limitations">@for (limitation of row.limitations; track $index) {<li>{{ limitation }}</li>}</ul>
        <p class="guide">Статистическият сигнал описва асоциация и не доказва нарушение.</p>
        <details class="technical"><summary>Контролни коефициенти и изчисления</summary><pre>{{ row.details | json }}</pre></details>
      </section>
    }
  `,
  styleUrl: './forensics-hypotheses.scss',
})
export class ForensicsHypothesesComponent {
  private static nextId = 0;
  readonly rows = input<ForensicsHypothesis[]>([]);
  readonly activeId = signal('');
  readonly tabPrefix = `forensics-check-${++ForensicsHypothesesComponent.nextId}`;
  readonly selectedRow = computed<ForensicsHypothesis | null>(() => this.rows().find(row => row.id === this.activeId()) ?? this.rows()[0] ?? null);
  readonly tabs = computed<ViewTab[]>(() => this.rows().map(row => ({ id: row.id, label: `${row.id} · ${this.shortLabel(row)}` })));
  readonly selectedSensitivity = computed(() => this.sensitivities().find(row => row.id === this.selectedRow()?.id) ?? null);
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
