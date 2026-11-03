import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ForensicsGroup } from './forensics.models';
import { signed } from './forensics.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';

@Component({
  selector: 'app-forensics-group-table',
  imports: [DecimalPipe, HlmButtonDirective, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="group-tools"><label>Търсене <input [value]="search()" (input)="onSearch($event)" placeholder="Район, община или населено място"></label>
    <span>{{ filtered().length | number }} реда</span></div>
    <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="label()"><table>
      <caption>{{ label() }}. Сумите и процентите са само за допустимите сравними секции. „Секции“ включва и изключените записи.</caption>
      <thead><tr><th scope="col">Място</th><th scope="col">Секции</th><th scope="col">Сравними</th><th scope="col">По списък I / II</th><th scope="col">Гласували I / II</th><th scope="col">Активност I / II</th><th scope="col">Промяна, п.п.</th><th scope="col">Δ гласували</th><th scope="col">За преглед</th></tr></thead>
      <tbody>@for (row of visible(); track row.key) {<tr><th scope="row">{{ groupName(row.name) }}@if (row.region && row.region !== row.name) {<small>{{ row.region }}</small>}</th><td>{{ row.n | number }}</td><td>{{ row.eligibleN | number }}</td><td>{{ row.registered1 | number }} / {{ row.registered2 | number }}</td><td>{{ row.voted1 | number }} / {{ row.voted2 | number }}</td><td>{{ number(row.turnout1) }} / {{ number(row.turnout2) }}</td><td>{{ signed(row.deltaTurnoutPp) }}</td><td>{{ signed(row.deltaVoted, 0) }}</td><td>{{ row.flaggedN | number }}</td></tr>}
      @empty {<tr><td colspan="9">Няма съответстващи места.</td></tr>}</tbody>
    </table></div>
    @if (filtered().length > pageSize) {<div class="pagination"><button hlmBtn variant="outline" size="sm" class="gap-1" type="button" (click)="page.set(page() - 1)" [disabled]="page() === 0"><app-map-icon name="chevron-left" />Предишни</button><span>{{ page() + 1 }} / {{ pages() }}</span><button hlmBtn variant="outline" size="sm" class="gap-1" type="button" (click)="page.set(page() + 1)" [disabled]="page() + 1 >= pages()">Следващи<app-map-icon name="chevron-right" /></button></div>}`,
  styleUrl: './forensics-tables.scss',
  styles: `.group-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.8rem;margin:.85rem 0;font-size:.8rem}.group-tools label{display:flex;align-items:center;gap:.7rem}input{width:270px;max-width:100%}`,
})
export class ForensicsGroupTableComponent {
  readonly rows = input<ForensicsGroup[]>([]);
  readonly label = input('Обобщени данни');
  readonly search = signal('');
  readonly page = signal(0);
  readonly pageSize = 50;
  readonly signed = signed;
  readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('bg');
    return this.rows().filter(row => `${row.name} ${row.region ?? ''}`.toLocaleLowerCase('bg').includes(query));
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(0);
  }
  number(value: number | null): string {
    return value === null ? 'няма данни' : value.toLocaleString('bg-BG', { maximumFractionDigits: 2 }) + '%';
  }
  groupName(value: string): string {
    return ({ paper: 'Хартиено', machine: 'Машинно', interrupted: 'Преустановено машинно',
      special: 'Специални секции', unknown: 'Неустановен метод' } as Record<string, string>)[value] ?? value;
  }
}
