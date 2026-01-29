import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Region } from '../../models/election.models';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardDescriptionDirective, HlmCardContentDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';

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
    HlmTypographyDirective,
    HighchartsChartComponent
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

  totalElectors: number = 0;
  totalVoted: number = 0;
  totalInvalid: number = 0;
  totalNoVotes: number = 0;
  avgActivity: number = 0;
  totalMachine: number = 0;
  totalPaper: number = 0;

  activityChartOptions: Highcharts.Options = {};
  partyChartOptions: Highcharts.Options = {};
  notVotedChartOptions: Highcharts.Options = {};

  activeChart = signal<'activity' | 'party' | 'notVoted'>('activity');
  allParties: { id: string, name: string }[] = [];
  selectedPartyId = signal<string>('');

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService,
    public themeService: ThemeService
  ) {
    this.loading$ = this.electionService.loading$;

    effect(() => {
      // Re-calculate charts options when theme or selected party changes
      this.themeService.darkMode();
      this.selectedPartyId();
      if (this.regions.length > 0) {
        this.updateCharts();
      }
    });
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.date = params['date'];
      this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;
      if (this.date) {
        this.loadRegions();
        this.loadParties();
      }
    });
  }

  loadParties() {
    this.electionService.getParties(this.date).subscribe(partiesMap => {
      this.allParties = Object.entries(partiesMap)
        .map(([id, name]) => ({ id, name }))
        .filter(p => p.id !== '0')
        .sort((a, b) => {
          const numA = parseInt(a.id);
          const numB = parseInt(b.id);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.id.localeCompare(b.id);
        });

      // Default to PRODЪЛЖАВАМЕ if found
      const ppdb = this.allParties.find(p => p.name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ'));
      if (ppdb) {
        this.selectedPartyId.set(ppdb.id);
      } else if (this.allParties.length > 0) {
        this.selectedPartyId.set(this.allParties[0].id);
      }
    });
  }

  loadRegions() {
    this.electionService.getRegions(this.date).subscribe(regions => {
      this.regions = regions;
      this.calculateGlobalStats();
      this.applyFilter();
      this.updateCharts();
    });
  }

  private calculateGlobalStats() {
    this.totalElectors = this.regions.reduce((sum, r) => sum + r.total, 0);
    this.totalVoted = this.regions.reduce((sum, r) => sum + r.voted, 0);
    this.totalInvalid = this.regions.reduce((sum, r) => sum + (r.discardedVotes || 0), 0);
    this.totalNoVotes = this.regions.reduce((sum, r) => sum + (r.noVotes || 0), 0);
    this.totalMachine = this.regions.reduce((sum, r) => sum + (r.totalMachine || 0), 0);
    this.totalPaper = this.regions.reduce((sum, r) => sum + (r.totalPaper || 0), 0);
    this.avgActivity = this.totalElectors > 0 ? this.totalVoted / this.totalElectors : 0;
  }

  updateCharts() {
    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';
    const categories = this.regions.map(r => this.formatRegionName(r.name));

    // 1. Activity Chart
    const activityData = this.regions.map(r => r.total > 0 ? (r.voted / r.total) * 100 : 0);
    this.activityChartOptions = this.createBaseChartOptions('Активност по райони (%)', categories, activityData, textColor, '{point.y:.2f}%');

    // 2. Party Votes Chart
    const partyId = this.selectedPartyId();
    const partyName = this.allParties.find(p => p.id === partyId)?.name || 'Партия';
    const partyData = this.regions.map(r => {
      const votes = r.partyVotes[partyId] || 0;
      return r.voted > 0 ? (votes / r.voted) * 100 : 0;
    });
    this.partyChartOptions = this.createBaseChartOptions(`Гласове за ${partyName} (%)`, categories, partyData, textColor, '{point.y:.2f}%');

    // 3. Not Voted Chart
    const notVotedData = this.regions.map(r => r.total > 0 ? ((r.total - r.voted) / r.total) * 100 : 0);
    this.notVotedChartOptions = this.createBaseChartOptions('Негласували по райони (%)', categories, notVotedData, textColor, '{point.y:.2f}%');
  }

  private createBaseChartOptions(title: string, categories: string[], data: number[], textColor: string, format: string): Highcharts.Options {
    return {
      chart: { type: 'column', backgroundColor: 'transparent', height: 300 },
      title: { text: title, style: { color: textColor, fontSize: '14px' } },
      xAxis: { categories, labels: { style: { color: textColor, fontSize: '10px' }, rotation: -45 } },
      yAxis: { title: { text: '' }, labels: { style: { color: textColor } } },
      legend: { enabled: false },
      credits: { enabled: false },
      tooltip: { pointFormat: `<b>${format}</b>` },
      series: [{ name: 'Стойност', data, color: '#eab308' }] as any
    };
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
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[1].trim().toUpperCase();
    }
    return name.toUpperCase();
  }
}
