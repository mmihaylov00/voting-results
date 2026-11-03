import { ChangeDetectionStrategy, Component, computed, effect, input, signal, viewChild } from '@angular/core';
import { ForensicsGroup } from './forensics.models';
import { signed } from './forensics.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';

interface GeographicGroup extends ForensicsGroup {
  paperN?: number;
  machineN?: number;
  unknownMethodN?: number;
}

@Component({
  selector: 'app-forensics-group-table',
  imports: [HlmButtonDirective, MapIconComponent, TableControlsComponent, SortableTableHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="flex flex-wrap items-start justify-between gap-3">
      <app-table-controls class="min-w-0 flex-1" [rows]="rows()" [columns]="tableColumns"
        label="Търсене на район, община или населено място" #groupTable />
      <button hlmBtn variant="outline" size="sm" class="gap-2" type="button"
        [attr.aria-expanded]="showDetails()" [attr.aria-controls]="tableId" (click)="toggleDetails()">
        <app-map-icon name="summary" />
        {{ showDetails() ? 'Основни показатели' : 'Всички показатели' }}
      </button>
    </div>
    <div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="label()">
      <table class="geography-table" [id]="tableId">
        <caption>{{ label() }}. Сумите са за допустимите сравними секции; Δ = II тур - I тур.</caption>
        <thead><tr>
          <th scope="col" app-sortable-table-header columnKey="name" label="Място" [table]="groupTable" align="left"></th>
          <th scope="col" app-sortable-table-header columnKey="eligibleN" label="Сравними / всички" [table]="groupTable" align="right"></th>
          <th scope="col" app-sortable-table-header columnKey="deltaTurnoutPp" label="Δ активност, п.п." [table]="groupTable" align="right"></th>
          <th scope="col" app-sortable-table-header columnKey="deltaVoted" label="Δ гласували" [table]="groupTable" align="right"></th>
          <th scope="col" app-sortable-table-header columnKey="gyurov" label="Δ Гюров" [table]="groupTable" align="right"></th>
          <th scope="col" app-sortable-table-header columnKey="yotova" label="Δ Йотова" [table]="groupTable" align="right"></th>
          <th scope="col" app-sortable-table-header columnKey="flaggedN" label="За преглед" title="Основания за преглед на активността" [table]="groupTable" align="right"></th>
          @if (showDetails()) {
            <th scope="col" app-sortable-table-header columnKey="registered1" label="По списък I / II" [table]="groupTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="voted1" label="Гласували I / II" [table]="groupTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="turnout1" label="Активност I / II" [table]="groupTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="meanDeltaPp" label="Средна секционна Δ" [table]="groupTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="deltaAdded" label="Дописани I / II" [table]="groupTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="addedReviewN" label="Дописани: преглед" [table]="groupTable" align="right"></th>
            <th scope="col" title="Хартиени / машинни / неустановени секции на I тур">Метод I: Х / М / ?</th>
            <th scope="col" app-sortable-table-header columnKey="smallN" label="До 400 избиратели" [table]="groupTable" align="right"></th>
          }
        </tr></thead>
        <tbody>@for (row of visible(); track row.key) {
          <tr>
            <th scope="row">{{ groupName(row.name) }}@if (row.region && row.region !== row.name) {<small>{{ row.region }}</small>}</th>
            <td [attr.aria-label]="count(row.eligibleN) + ' сравними от ' + count(row.n) + ' общо'">{{ count(row.eligibleN) }} <span class="text-muted-foreground">/ {{ count(row.n) }}</span></td>
            <td>{{ signed(row.deltaTurnoutPp) }}</td><td>{{ signed(row.deltaVoted, 0) }}</td>
            <td>{{ signed(candidateGain(row, '4'), 0) }}@if (showDetails()) {@if (candidate(row, '4'); as pair) {<small>{{ count(pair.votes1) }} → {{ count(pair.votes2) }}</small>}}</td>
            <td>{{ signed(candidateGain(row, '25'), 0) }}@if (showDetails()) {@if (candidate(row, '25'); as pair) {<small>{{ count(pair.votes1) }} → {{ count(pair.votes2) }}</small>}}</td>
            <td>{{ count(row.flaggedN) }}</td>
            @if (showDetails()) {
              <td>{{ count(row.registered1) }} / {{ count(row.registered2) }}</td>
              <td>{{ count(row.voted1) }} / {{ count(row.voted2) }}</td>
              <td>{{ percent(row.turnout1) }} / {{ percent(row.turnout2) }}</td>
              <td>{{ signed(row.meanDeltaPp) }} п.п.</td>
              <td>{{ count(row.added1) }} / {{ count(row.added2) }}<small>Δ {{ signed(row.deltaAdded, 0) }}</small></td>
              <td>{{ count(row.addedReviewN) }}</td>
              <td>{{ count(row.paperN) }} / {{ count(row.machineN) }} / {{ count(row.unknownMethodN) }}</td>
              <td>{{ count(row.smallN) }}</td>
            }
          </tr>
        } @empty {<tr><td [attr.colspan]="showDetails() ? 15 : 7">Няма съответстващи места.</td></tr>}</tbody>
      </table>
    </div>
    @if (filtered().length > pageSize) {
      <nav class="pagination" aria-label="Страници на географската таблица">
        <span aria-live="polite">{{ page() + 1 }} / {{ pages() }}</span>
        <button hlmBtn variant="outline" size="sm" class="gap-1" type="button" (click)="page.set(page() - 1)" [disabled]="page() === 0"><app-map-icon name="chevron-left" />Предишни</button>
        <button hlmBtn variant="outline" size="sm" class="gap-1" type="button" (click)="page.set(page() + 1)" [disabled]="page() + 1 >= pages()">Следващи<app-map-icon name="chevron-right" /></button>
      </nav>
    }`,
  styleUrl: './forensics-tables.scss',
})
export class ForensicsGroupTableComponent {
  private static nextId = 0;
  readonly tableId = `forensics-geography-${++ForensicsGroupTableComponent.nextId}`;
  readonly rows = input<GeographicGroup[]>([]);
  readonly label = input('Обобщени данни');
  readonly page = signal(0);
  readonly pageSize = 50;
  readonly showDetails = signal(false);
  readonly signed = signed;
  readonly controls = viewChild<TableControlsComponent<GeographicGroup>>('groupTable');
  readonly tableColumns: TableColumns<GeographicGroup> = {
    name: row => `${this.groupName(row.name)} ${row.region ?? ''}`,
    eligibleN: row => row.eligibleN, deltaTurnoutPp: row => row.deltaTurnoutPp,
    deltaVoted: row => row.deltaVoted, gyurov: row => this.candidateGain(row, '4'),
    yotova: row => this.candidateGain(row, '25'), flaggedN: row => row.flaggedN,
    registered1: row => row.registered1, voted1: row => row.voted1, turnout1: row => row.turnout1,
    meanDeltaPp: row => row.meanDeltaPp, deltaAdded: row => row.deltaAdded,
    addedReviewN: row => row.addedReviewN, smallN: row => row.smallN,
  };
  readonly filtered = computed(() => this.controls()?.viewRows() ?? this.rows());
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));

  constructor() {
    effect(() => {
      const controls = this.controls();
      controls?.query();
      controls?.sortColumn();
      controls?.direction();
      this.rows();
      this.page.set(0);
    });
  }

  toggleDetails(): void {
    this.showDetails.update(value => !value);
    const controls = this.controls();
    const sort = controls?.sortColumn();
    if (!this.showDetails() && controls && sort
      && !['name', 'eligibleN', 'deltaTurnoutPp', 'deltaVoted', 'gyurov', 'yotova', 'flaggedN'].includes(sort)) {
      controls.sortColumn.set('deltaTurnoutPp');
      controls.direction.set('desc');
      this.page.set(0);
    }
  }

  percent(value: number | null | undefined): string {
    return value == null ? 'няма данни' : value.toLocaleString('bg-BG', { maximumFractionDigits: 2 }) + '%';
  }

  count(value: number | null | undefined): string {
    return value == null ? 'няма данни' : value.toLocaleString('bg-BG');
  }

  candidateGain(row: ForensicsGroup, id: string): number | null {
    return this.candidate(row, id)?.deltaVotes ?? null;
  }

  candidate(row: ForensicsGroup, id: string) {
    return row.candidateTotals?.find(candidate => candidate.id === id);
  }

  groupName(value: string): string {
    return ({ paper: 'Хартиено', machine: 'Машинно', interrupted: 'Преустановено машинно',
      special: 'Специални секции', unknown: 'Неустановен метод' } as Record<string, string>)[value] ?? value;
  }
}
