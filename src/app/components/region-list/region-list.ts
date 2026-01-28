import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { Region } from '../../models/election.models';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardDescriptionDirective, HlmCardContentDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';

@Component({
  selector: 'app-region-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmInputDirective,
    HlmTypographyDirective
  ],
  templateUrl: './region-list.html'
})
export class RegionListComponent implements OnInit {
  date: string = '';
  dateName: string = '';
  regions: Region[] = [];
  filteredRegions: Region[] = [];
  searchTerm: string = '';
  loading$: Observable<boolean>;

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService
  ) {
    this.loading$ = this.electionService.loading$;
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.date = params['date'];
      this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;
      if (this.date) {
        this.loadRegions();
      }
    });
  }

  loadRegions() {
    this.electionService.getRegions(this.date).subscribe(regions => {
      this.regions = regions;
      this.applyFilter();
    });
  }

  applyFilter() {
    if (!this.searchTerm) {
      this.filteredRegions = this.regions;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredRegions = this.regions.filter(r =>
        r.name.toLowerCase().includes(term) || r.id.includes(term)
      );
    }
  }

  formatRegionName(name: string): string {
    // Expected format: "01. БЛАГОЕВГРАД"
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[1].trim().toUpperCase();
    }
    return name.toUpperCase();
  }
}
