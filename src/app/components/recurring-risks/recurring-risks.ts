import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, distinctUntilChanged, map } from 'rxjs';
import { Region } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { buildRecurringSectionRisks, RecurringSectionRisk } from '../../utils/section-risk-history.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';

@Component({
  selector: 'app-recurring-risks',
  standalone: true,
  imports: [CommonModule, RouterLink, HlmButtonDirective],
  templateUrl: './recurring-risks.html',
})
export class RecurringRisksComponent implements OnInit {
  private readonly electionService = inject(ElectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly electionType = this.electionService.electionType;
  readonly pageSize = 30;
  date = '';
  region = '';
  regions: Region[] = [];
  rows: RecurringSectionRisk[] = [];
  filteredRows: RecurringSectionRisk[] = [];
  page = 0;
  loading = true;
  error = '';
  private loadVersion = 0;

  get visibleRows(): RecurringSectionRisk[] {
    return this.filteredRows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
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
    this.page = 0;
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
    this.page = 0;
    this.changeDetector.markForCheck();
  }

}
