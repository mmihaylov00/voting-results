import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Region, Section, PartyVotes } from '../../models/election.models';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardContentDirective,
  HlmCardDirective,
  HlmCardDescriptionDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
} from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';

interface ElectionData {
  date: string;
  name: string;
  totalElectors: number;
  totalVoted: number;
  avgActivity: number;
  topParties: { name: string; total: number; percent: number }[];
}

@Component({
  selector: 'app-election-list',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
    HlmInputDirective,
    HighchartsChartComponent,
  ],
  templateUrl: './election-list.html',
  styleUrl: './election-list.scss',
})
export class ElectionListComponent implements OnInit {
  dates: { date: string; name: string }[] = [];
  electionsData: Map<string, ElectionData> = new Map();
  loading$: any;

  // Historical trends properties
  Highcharts: typeof Highcharts = Highcharts;
  level = signal<'national' | 'region' | 'section'>('national');
  selectedRegionId = signal<string>('');
  selectedSectionId = signal<string>('');
  regions: { id: string, name: string }[] = [];
  chartOptions: Highcharts.Options = {};
  percentChartOptions: Highcharts.Options = {};
  allData: { [date: string]: any } = {};

  constructor(
    private electionService: ElectionService,
    private themeService: ThemeService
  ) {
    this.loading$ = this.electionService.loading$;
    this.dates = this.electionService.getDates();

    effect(() => {
      this.themeService.darkMode();
      this.level();
      this.selectedRegionId();
      this.selectedSectionId();
      if (Object.keys(this.allData).length > 0) {
        this.updateHistoricalCharts();
      }
    });
  }

  ngOnInit(): void {
    // Load all election data when site opens
    this.loadAllElectionsData();
    
    // Load historical trends data
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      this.updateHistoricalCharts();
    });

    // Load regions from the latest election to populate the dropdown
    if (this.dates.length > 0) {
      this.electionService.getRegions(this.dates[0].date).subscribe(regions => {
        this.regions = regions.map(r => ({ id: r.id, name: r.name }));
      });
    }
  }

  loadAllElectionsData(): void {
    this.dates.forEach(dateObj => {
      // Load both regions and parties to get party names
      this.electionService.getRegions(dateObj.date).subscribe(regions => {
        this.electionService.getParties(dateObj.date).subscribe(parties => {
          const electionData = this.calculateElectionStats(regions, parties, dateObj.date);
          this.electionsData.set(dateObj.date, electionData);
        });
      });
    });
  }

  calculateElectionStats(regions: Region[], parties: { [id: string]: string }, date: string): ElectionData {
    const totalElectors = regions.reduce((sum, r) => sum + r.total, 0);
    const totalVoted = regions.reduce((sum, r) => sum + r.voted, 0);
    const avgActivity = totalElectors > 0 ? totalVoted / totalElectors : 0;

    // Aggregate party votes across all regions
    const partyVotes: { [partyId: string]: number } = {};
    regions.forEach(region => {
      Object.entries(region.partyVotes).forEach(([partyId, votes]) => {
        partyVotes[partyId] = (partyVotes[partyId] || 0) + (votes as number);
      });
    });

    // Get top 3 parties with names
    const topParties = Object.entries(partyVotes)
      .filter(([pid, _]) => pid !== '0')
      .map(([partyId, total]) => {
        let name = parties[partyId] || partyId;
        // Normalize PP-DB name
        if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
          name = 'ПП-ДБ';
        }
        return {
          name,
          total,
          percent: totalVoted > 0 ? total / totalVoted : 0
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return {
      date,
      name: this.dates.find(d => d.date === date)?.name || date,
      totalElectors,
      totalVoted,
      avgActivity,
      topParties
    };
  }

  getElectionData(date: string): ElectionData | undefined {
    return this.electionsData.get(date);
  }

  formatActivity(percent: number): string {
    const value = percent * 100;
    return Math.min(100, Math.max(0, value)).toFixed(2);
  }

  updateHistoricalCharts() {
    const level = this.level();
    const regionId = this.selectedRegionId();
    const sectionId = this.selectedSectionId();

    const votesData: number[] = [];
    const percentData: number[] = [];
    const categories: string[] = [];

    // Sort dates ascending for the chart
    const sortedDates = [...this.dates].sort((a, b) => a.date.localeCompare(b.date));

    sortedDates.forEach(d => {
      const data = this.allData[d.date];
      if (!data) return;

      categories.push(d.name);

      let votes = 0;
      let totalVoted = 0;

      if (level === 'national') {
        data.regions.forEach((r: Region) => {
          totalVoted += r.voted;
          Object.entries(r.partyVotes).forEach(([pid, v]) => {
            const name = data.parties[pid] || pid;
            if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
              votes += v as number;
            }
          });
        });
      } else if (level === 'region' && regionId) {
        const region = data.regions.find((r: Region) => r.id === regionId);
        if (region) {
          totalVoted = region.voted;
          Object.entries(region.partyVotes).forEach(([pid, v]) => {
            const name = data.parties[pid] || pid;
            if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
              votes += v as number;
            }
          });
        }
      } else if (level === 'section' && sectionId) {
        const section = data.sections.find((s: Section) => s.sectionId === sectionId);
        if (section) {
          totalVoted = section.voted;
          Object.entries(section.partyVotes).forEach(([pid, v]) => {
            const votesObj = v as PartyVotes;
            const name = data.parties[pid] || pid;
            if (name.toUpperCase().includes('ПРОДЪЛЖАВАМЕ')) {
              votes += votesObj.total;
            }
          });
        }
      }

      votesData.push(votes);
      const percent = totalVoted > 0 ? (votes / totalVoted) * 100 : 0;
      percentData.push(Math.round(percent * 100) / 100);
    });

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    this.chartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой гласове за ПП-ДБ', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Гласове', style: { color: textColor } }, labels: { style: { color: textColor } } },
      legend: {
        itemStyle: { color: textColor }
      },
      series: [{ name: 'Гласове', data: votesData, color: '#0ea5e9' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.percentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процентна подкрепа за ПП-ДБ', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Процент (%)', style: { color: textColor } }, labels: { style: { color: textColor } }, min: 0, max: 100 },
      legend: {
        itemStyle: { color: textColor }
      },
      series: [{ name: 'Процент', data: percentData, color: '#10b981' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%', valueDecimals: 2 }
    };
  }
}
