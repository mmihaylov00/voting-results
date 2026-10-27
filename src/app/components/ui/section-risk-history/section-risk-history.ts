import { TableControlsComponent, TableColumns } from '../table-controls/table-controls';
import { SortableTableHeaderComponent } from '../sortable-table-header/sortable-table-header';
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject } from '@angular/core';
import { Section } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { buildSectionRiskHistory, RiskHistoryDataset, SectionRiskHistory } from '../../../utils/section-risk-history.util';
import { RiskBadgeComponent } from '../risk-badge/risk-badge';

@Component({
  selector: 'app-section-risk-history',
  standalone: true,
  imports: [TableControlsComponent, SortableTableHeaderComponent, CommonModule, RiskBadgeComponent],
  templateUrl: './section-risk-history.html',
})
export class SectionRiskHistoryComponent implements OnChanges {
  @Input() section: Section | null = null;
  @Input() date = '';
  @Input() history: Record<string, RiskHistoryDataset> = {};

  private readonly electionService = inject(ElectionService);
  result: SectionRiskHistory = { rows: [], assessed: 0, flagged: 0, unmatched: 0, unavailable: 0 };
  readonly tableColumns: TableColumns<SectionRiskHistory['rows'][number]> = {
    election: row => `${row.date} ${row.name}`, score: row => row.score, turnout: row => row.turnout,
    signals: row => row.status === 'assessed' ? row.codes.join(', ') || (row.flagged ? 'Има рискови индикатори' : 'Без рискови индикатори')
      : row.status === 'unmatched' ? 'Несъпоставима секция' : 'Няма налична оценка',
    winner: row => row.winnerName,
  };

  ngOnChanges(): void {
    this.result = buildSectionRiskHistory(this.section, this.date, this.electionService.getDates(), this.history);
  }

  formatPercent(value: number | null): string {
    return value === null ? '-' : `${value.toLocaleString('bg-BG', { maximumFractionDigits: 1 })}%`;
  }
}
