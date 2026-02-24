import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ResultsService } from '../../../services/results.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

type ResultsStats = {
  electionDate: string;
  totalSections: number;
  resultsCount: number;
  missingSectionIds: string[];
  extraSectionIds: string[];
};

@Component({
  selector: 'app-results-stats',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
  ],
  templateUrl: './results-stats.html',
})
export class ResultsStatsComponent {
  electionId: string | null = null;
  electionDate = '';
  stats = signal<ResultsStats | null>(null);
  error = signal<string | null>(null);

  constructor(private route: ActivatedRoute, private resultsService: ResultsService) {
    this.electionId = this.route.snapshot.paramMap.get('id');
  }

  load() {
    if (!this.electionId || !this.electionDate) return;
    this.error.set(null);
    this.resultsService.stats(this.electionId, this.electionDate).subscribe({
      next: (data) => this.stats.set(data as ResultsStats),
      error: (err) => this.error.set(err?.error?.message || 'Failed to load stats'),
    });
  }
}
