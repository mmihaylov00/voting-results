import { TableControlsComponent, TableColumns } from '../ui/table-controls/table-controls';
import { SortableTableHeaderComponent } from '../ui/sortable-table-header/sortable-table-header';
import { LoadingBarComponent } from '../ui/loading-bar/loading-bar';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, distinctUntilChanged, map } from 'rxjs';
import { Region } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { buildRecurringSectionRisks, RecurringSectionRisk } from '../../utils/section-risk-history.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { VirtualTableDirective } from '../ui/virtual-table/virtual-table';
import { RiskBadgeComponent } from '../ui/risk-badge/risk-badge';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { CsvExportButtonComponent } from '../ui/csv-export-button/csv-export-button';
import { CsvExportData } from '../../utils/csv-export.util';
import { CsvExportModalComponent } from '../ui/csv-export-modal/csv-export-modal';

@Component({
  selector: 'app-recurring-risks',
  standalone: true,
  imports: [TableControlsComponent, SortableTableHeaderComponent, LoadingBarComponent, CommonModule, RouterLink, HlmButtonDirective, VirtualTableDirective, RiskBadgeComponent, HlmTooltipDirective, CsvExportButtonComponent, CsvExportModalComponent],
  templateUrl: './recurring-risks.html',
})
export class RecurringRisksComponent implements OnInit {
  @ViewChild('recurringTable') private tableControls?: TableControlsComponent<RecurringSectionRisk>;
  private readonly electionService = inject(ElectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly electionType = this.electionService.electionType;
  date = '';
  region = '';
  regions: Region[] = [];
  rows: RecurringSectionRisk[] = [];
  filteredRows: RecurringSectionRisk[] = [];
  readonly csvExportAction = () => this.exportCsv();
  csvExportData: CsvExportData | null = null;
  readonly tableColumns: TableColumns<RecurringSectionRisk> = {
    section: row => `${row.section.sectionId} ${row.section.sectionName}`,
    place: row => `${row.section.cityName} ${row.section.regionName ?? ''}`,
    flagged: row => row.flagged, unavailable: row => row.unavailable,
    status: row => this.currentStatus(row),
    codes: row => row.codes.join(', '),
  };
  loading = true;
  error = '';
  private loadVersion = 0;

  currentStatus(row: RecurringSectionRisk): string {
    return !row.currentAssessed ? 'Няма налична оценка' : row.currentFlagged ? 'Има рискови индикатори' : 'Без рискови индикатори';
  }

  exportCsv(): void {
    const rows = this.tableControls?.viewRows() ?? this.filteredRows;
    if (this.loading || !rows.length) return;
    this.csvExportData = {
      filename: `recurring_risks_${this.electionType}_${this.date}_${this.region || 'all'}.csv`,
      headers: ['Дата', 'Район', 'Име на района', 'Секция', 'Име на секцията', 'Населено място',
        'Избори с рискови индикатори', 'Оценени избори', 'Без съпоставима оценка', 'В избраните избори', 'Секционни кодове през годините'],
      rows: rows.map(row => [this.date, row.section.regionId, row.section.regionName, row.section.sectionId,
        row.section.sectionName, row.section.cityName, row.flagged, row.assessed, row.unavailable,
        this.currentStatus(row), row.codes.join(', ')]),
    };
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([params, query]) => params.get('regionId') ?? query.get('region') ?? ''),
      distinctUntilChanged(), takeUntilDestroyed(this.destroyRef),
    ).subscribe((region) => {
      this.region = region;
      if (this.regions.length && !this.regions.some((item) => item.id === this.region)) this.region = '';
      this.updateScope();
    });
    this.route.paramMap.pipe(
      map(params => params.get('date') ?? ''), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef),
    ).subscribe((date) => {
      this.date = date;
      this.load();
    });
  }

  load(): void {
    const version = ++this.loadVersion;
    this.loading = true;
    this.error = '';
    this.rows = [];
    this.filteredRows = [];
    this.regions = [];
    this.changeDetector.markForCheck();
    const election = this.electionService.getDates().find((item) => item.date === this.date);
    if (!election) {
      this.loading = false;
      this.error = 'Няма данни за избраните избори.';
      return;
    }
    this.electionService.getRiskHistoryData(this.date).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (history) => {
        if (version !== this.loadVersion) return;
        this.rows = buildRecurringSectionRisks(this.date, this.electionService.getDates(), history);
        this.regions = history[this.date]?.regions ?? [];
        if (!this.regions.some((item) => item.id === this.region)) this.region = '';
        this.loading = false;
        this.updateScope();
      },
      error: () => {
        if (version !== this.loadVersion) return;
        this.loading = false;
        this.error = 'Историческите данни не можаха да бъдат заредени.';
        this.changeDetector.markForCheck();
      },
    });
  }

  private updateScope(): void {
    this.filteredRows = this.region ? this.rows.filter((row) => row.section.regionId === this.region) : this.rows;
    this.changeDetector.markForCheck();
  }

}
