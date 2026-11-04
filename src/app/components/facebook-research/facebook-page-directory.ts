import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal, viewChild } from '@angular/core';
import { CsvExportData } from '../../utils/csv-export.util';
import { BaseModalComponent } from '../ui/base-modal/base-modal';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { CsvExportModalComponent } from '../ui/csv-export-modal/csv-export-modal';
import { MapIconComponent } from '../ui/map-icon/map-icon';
import { SelectComponent } from '../ui/select/select';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { TableColumns, TableControlsComponent } from '../ui/table-controls/table-controls';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { FacebookDirectory, FacebookDirectoryEntry, FacebookDirectoryStatus } from './facebook-research.models';

const STATUS_LABELS: Record<FacebookDirectoryStatus, string> = {
  'in-sample': 'В извадката',
  'page-verified': 'Потвърдена страница',
  'publisher-linked': 'Връзка от издател',
  unresolved: 'Непотвърдена',
  ambiguous: 'Неясно съвпадение',
};

const STATUS_DETAILS: Record<FacebookDirectoryStatus, string> = {
  'in-sample': 'Има събрани публикации в изследването.',
  'page-verified': 'Потвърдена е Facebook страница; няма събрани публикации в извадката.',
  'publisher-linked': 'Официалният сайт сочи към Facebook. Самата страница и публикациите ѝ още не са проверени.',
  unresolved: 'Текущата Facebook страница не е потвърдена.',
  ambiguous: 'Името има неясни или различни съвпадения. Facebook страницата не е потвърдена.',
};

@Component({
  selector: 'app-facebook-page-directory',
  imports: [CommonModule, SelectComponent, TableControlsComponent, SortableTableHeaderComponent,
    VirtualTableDirective, BaseModalComponent, CsvExportModalComponent, HlmButtonDirective, MapIconComponent],
  templateUrl: './facebook-page-directory.html',
  styleUrl: './facebook-page-directory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookPageDirectoryComponent {
  readonly directory = input.required<FacebookDirectory>();
  readonly pageSelect = output<string>();
  readonly statusFilter = signal('');
  readonly scopeFilter = signal('');
  readonly regionFilter = signal('');
  readonly selectedEntry = signal<FacebookDirectoryEntry | null>(null);
  readonly csvData = signal<CsvExportData | null>(null);
  readonly table = viewChild<TableControlsComponent<FacebookDirectoryEntry>>('directoryTable');
  readonly statusLabels = STATUS_LABELS;
  readonly statusDetails = STATUS_DETAILS;
  readonly statusOptions = [
    { value: '', label: 'Всички статуси' },
    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ];
  readonly scopeOptions = [
    { value: '', label: 'Всеки обхват' },
    { value: 'regional', label: 'Регионални' },
    { value: 'nonregional', label: 'Общ обхват' },
    { value: 'unknown', label: 'Неуточнен обхват' },
  ];
  readonly regionOptions = computed(() => [
    { value: '', label: 'Всички региони / градове' },
    ...[...new Set(this.directory().entries.flatMap(entry => entry.regions))]
      .sort((a, b) => a.localeCompare(b, 'bg')).map(region => ({ value: region, label: region })),
  ]);
  readonly filteredEntries = computed(() => this.directory().entries.filter(entry =>
    (!this.statusFilter() || entry.status === this.statusFilter())
    && (!this.scopeFilter() || this.scopeKey(entry) === this.scopeFilter())
    && (!this.regionFilter() || entry.regions.includes(this.regionFilter()))));
  readonly columns: TableColumns<FacebookDirectoryEntry> = {
    name: entry => entry.name,
    status: entry => STATUS_LABELS[entry.status],
    coverage: entry => `${this.scopeLabel(entry)} ${entry.coverage} ${entry.regions.join(' ')}`,
    search: entry => `${entry.aliases.join(' ')} ${entry.facebookUrl ?? ''} ${entry.websiteUrl ?? ''}`,
  };

  scopeKey(entry: FacebookDirectoryEntry): string {
    return entry.regional === null ? 'unknown' : entry.regional ? 'regional' : 'nonregional';
  }

  scopeLabel(entry: FacebookDirectoryEntry): string {
    return entry.regional === null ? 'Неуточнен обхват' : entry.regional ? 'Регионална' : 'Общ обхват';
  }

  resetFilters(): void {
    this.statusFilter.set('');
    this.scopeFilter.set('');
    this.regionFilter.set('');
    this.table()?.query.set('');
  }

  openEntry(entry: FacebookDirectoryEntry): void {
    this.csvData.set(null);
    this.selectedEntry.set(entry);
  }

  showPosts(entry: FacebookDirectoryEntry): void {
    if (!entry.samplePageId) return;
    this.selectedEntry.set(null);
    this.pageSelect.emit(entry.samplePageId);
  }

  exportCurrent(): void {
    const rows = this.table()?.viewRows() ?? [];
    this.csvData.set({
      filename: 'facebook-page-directory-2026.csv',
      headers: ['Име', 'Други имена', 'Статус', 'Обхват', 'Покритие', 'Региони / градове',
        'Facebook', 'Сайт', 'Бележки', 'Източници', 'Актуализирано на'],
      rows: rows.map(entry => [entry.name, entry.aliases.join('; '), STATUS_LABELS[entry.status],
        this.scopeLabel(entry), entry.coverage, entry.regions.join('; '), entry.facebookUrl,
        entry.websiteUrl, entry.notes.join('; '), entry.sources.map(source => `${source.note}: ${source.url}`).join('; '),
        this.directory().checkedAt]),
    });
  }
}
