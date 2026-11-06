import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MayorAnalysis, MayorMunicipality, MayorPartyGroup } from './forensics.models';
import { isOfficialSource, signed } from './forensics.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { SignedChangeDirective } from '../ui/signed-change/signed-change';

@Component({
  selector: 'app-forensics-mayors',
  imports: [DecimalPipe, HlmButtonDirective, MapIconComponent, TableControlsComponent, SortableTableHeaderComponent, SignedChangeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './forensics-tables.scss',
  template: `
    @if (analysis(); as data) {
      <h3 class="mt-4 mb-2">Кметове и ръст между туровете</h3>
      <p class="mb-2">{{ data.basis }}</p>
      <p class="mb-3 text-sm text-muted-foreground">Показана е партията или коалицията, издигнала избрания през 2023 г. общински кмет. Това не потвърждава партийно членство или кой заема длъжността през 2026 г.</p>
      <p class="mb-3 text-sm">Покритие на партийните сравнения: {{ data.coverage.matchedMunicipalities | number }} от {{ data.coverage.totalMunicipalities | number }} административни общини; {{ data.coverage.matchedSections | number }} от {{ data.coverage.eligibleSections | number }} допустими секции.</p>
      @if (data.coverage.historicalOnlyMunicipalities) {<p class="mb-3 text-sm">{{ data.coverage.historicalOnlyMunicipalities | number }} общини са изключени от партийните сравнения заради установени последващи промени. В справочника е запазен историческият победител от 2023 г. Останалите записи също не са потвърждение за длъжността през 2026 г.</p>}
      @if (data.coverage.noEligibleMunicipalities) {<p class="mb-3 text-sm">{{ data.coverage.noEligibleMunicipalities | number }} общини нямат допустими секции в този обхват и не участват в партийните сравнения.</p>}
      @if (data.coverage.unmatchedSections) {<p class="mb-3 text-sm">{{ data.coverage.unmatchedSections | number }} допустими секции остават извън партийните сравнения.</p>}
      <p class="mb-3 text-sm">Рязък ръст: поне 10 п.п. повече активност и 30 допълнителни гласували при промяна в списъка до 5%. Дялът е от допустимите секции в групата. Сравнението е описателно, без корекция за местни различия и без доказателство за причинна връзка.</p>
      <div class="mb-4 flex flex-wrap gap-2">
        @if (isOfficialSource(data.sourceUrl)) {<a hlmBtn variant="outline" size="sm" class="gap-2" [href]="data.sourceUrl" target="_blank" rel="noopener noreferrer"><app-map-icon name="share" />ЦИК · {{ data.electionDate }}</a>}
        <a hlmBtn variant="outline" size="sm" class="gap-2" [href]="csvRoot + csvPrefix() + '-mayor-parties.csv'" download><app-map-icon name="download-table" />Партии CSV</a>
        <a hlmBtn variant="outline" size="sm" class="gap-2" [href]="csvRoot + csvPrefix() + '-mayor-municipalities.csv'" download><app-map-icon name="download-table" />Кметове CSV</a>
      </div>
      <h4 class="mb-2">По издигнала партия или коалиция</h4>
      <app-table-controls [rows]="data.groups" [columns]="partyColumns" label="Търсене на издигнала партия или коалиция" #partyTable />
      <div class="table-scroll" tabindex="0" role="region" aria-label="Ръст според издигналата партия на кмета">
        <table class="geography-table party-table">
          <caption>Точните регистрации от местните избори се запазват отделно. Медианата дава еднаква тежест на всяка административна община.</caption>
          <thead><tr>
            <th scope="col" app-sortable-table-header columnKey="party" label="Партия / коалиция" [table]="partyTable"></th>
            <th scope="col" app-sortable-table-header columnKey="municipalities" label="Общини" [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="sections" label="Секции" [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="spikeRate" label="С рязък ръст" [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="medianMunicipalityDeltaPp" label="Медиана общинска Δ, п.п." [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="deltaTurnoutPp" label="Обща Δ активност, п.п." [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="candidate4Delta" label="Δ Гюров" [table]="partyTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="candidate25Delta" label="Δ Йотова" [table]="partyTable" align="right"></th>
          </tr></thead>
          <tbody>@for (row of partyTable.viewRows(); track row.party) {<tr>
            <th scope="row">{{ row.party }}</th>
            <td>{{ row.municipalities | number }}</td><td>{{ row.sections | number }}</td>
            <td>{{ percent(row.spikeRate) }}<small>{{ row.spikeN | number }} секции</small></td>
            <td [appSignedChange]="row.medianMunicipalityDeltaPp">{{ signed(row.medianMunicipalityDeltaPp) }}</td>
            <td [appSignedChange]="row.deltaTurnoutPp">{{ signed(row.deltaTurnoutPp) }}</td>
            <td [appSignedChange]="row.candidate4Delta">{{ signed(row.candidate4Delta, 0) }}</td>
            <td [appSignedChange]="row.candidate25Delta">{{ signed(row.candidate25Delta, 0) }}</td>
          </tr>} @empty {<tr><td colspan="8">Няма съответстващи партии или коалиции.</td></tr>}</tbody>
        </table>
      </div>
      <h4 class="mt-5 mb-2">Кмет и регистрация по общини</h4>
      <app-table-controls [rows]="data.municipalities" [columns]="municipalityColumns" label="Търсене на община, кмет или партия" #municipalityTable />
      <div class="table-scroll" tabindex="0" role="region" aria-label="Кметове и ръст по общини">
        <table class="geography-table municipality-table">
          <caption>Общинският кмет се отнася за всички секции в общината, включително селата. Районните и селските кметове са отделни длъжности.</caption>
          <thead><tr>
            <th scope="col" app-sortable-table-header columnKey="name" label="Община" [table]="municipalityTable"></th>
            <th scope="col" app-sortable-table-header columnKey="mayor" label="Избран кмет · 2023" [table]="municipalityTable"></th>
            <th scope="col" app-sortable-table-header columnKey="party" label="Издигнала партия / коалиция" [table]="municipalityTable"></th>
            <th scope="col" app-sortable-table-header columnKey="sections" label="Секции" [table]="municipalityTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="spikeRate" label="С рязък ръст" [table]="municipalityTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="deltaTurnoutPp" label="Δ активност, п.п." [table]="municipalityTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="candidate4Delta" label="Δ Гюров" [table]="municipalityTable" align="right"></th>
            <th scope="col" app-sortable-table-header columnKey="candidate25Delta" label="Δ Йотова" [table]="municipalityTable" align="right"></th>
          </tr></thead>
          <tbody>@for (row of municipalityTable.viewRows(); track row.code) {<tr>
            <th scope="row">{{ row.name }}<small>{{ row.code }}</small></th>
            <td class="wrap-cell text-left!">@if (isOfficialSource(row.sourceUrl)) {<a class="underline underline-offset-2" [href]="row.sourceUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="row.mayor + ' - резултат на ЦИК за ' + row.name">{{ row.mayor }}</a>} @else { {{ row.mayor }} }
              @if (row.affiliationUsable === false) {<small class="opacity-100!">Само исторически запис - извън партийните сравнения.</small>}
              @if (row.contextNote) {<small>{{ row.contextNote }} @if (isOfficialSource(row.contextSourceUrl)) {<a class="underline underline-offset-2" [href]="row.contextSourceUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Последваща промяна в ' + row.name + ' - източник на ЦИК'">Източник на ЦИК</a>}</small>}
            </td>
            <td class="wrap-cell text-left!">{{ row.party }}</td>
            <td>{{ row.sections | number }}</td>
            <td>{{ percent(row.spikeRate) }}<small>{{ row.spikeN | number }} секции</small></td>
            <td [appSignedChange]="row.deltaTurnoutPp">{{ signed(row.deltaTurnoutPp) }}</td>
            <td [appSignedChange]="row.candidate4Delta">{{ signed(row.candidate4Delta, 0) }}</td>
            <td [appSignedChange]="row.candidate25Delta">{{ signed(row.candidate25Delta, 0) }}</td>
          </tr>} @empty {<tr><td colspan="8">Няма съответстващи общини.</td></tr>}</tbody>
        </table>
      </div>
      <details class="mt-4"><summary>Източници и ограничения</summary><ul class="mt-2 list-disc pl-5">@for (limitation of data.limitations; track $index) {<li>{{ limitation }}</li>}</ul></details>
    } @else {<p class="mt-3" role="status">Данните за кметовете не са налични за този обхват.</p>}
  `,
})
export class ForensicsMayorsComponent {
  readonly analysis = input<MayorAnalysis>();
  readonly csvPrefix = input('query1');
  readonly csvRoot = '/data/forensics/2026/';
  readonly signed = signed;
  readonly isOfficialSource = isOfficialSource;
  readonly partyColumns: TableColumns<MayorPartyGroup> = {
    party: row => row.party, municipalities: row => row.municipalities,
    sections: row => row.sections, spikeRate: row => row.spikeRate,
    medianMunicipalityDeltaPp: row => row.medianMunicipalityDeltaPp,
    deltaTurnoutPp: row => row.deltaTurnoutPp,
    candidate4Delta: row => row.candidate4Delta, candidate25Delta: row => row.candidate25Delta,
  };
  readonly municipalityColumns: TableColumns<MayorMunicipality> = {
    name: row => row.name, mayor: row => row.mayor, party: row => row.party,
    sections: row => row.sections, spikeRate: row => row.spikeRate,
    deltaTurnoutPp: row => row.deltaTurnoutPp,
    candidate4Delta: row => row.candidate4Delta, candidate25Delta: row => row.candidate25Delta,
  };

  percent(value: number | null): string {
    return value === null ? 'няма данни' : value.toLocaleString('bg-BG', { maximumFractionDigits: 2 }) + '%';
  }
}
