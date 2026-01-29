import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { Section, Region, PartyVotes } from '../../models/election.models';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';

@Component({
  selector: 'app-historical-trends',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HighchartsChartComponent,
    HlmButtonDirective,
    HlmCardDirective,
    HlmInputDirective,
    HlmTypographyDirective
  ],
  templateUrl: './historical-trends.html'
})
export class HistoricalTrendsComponent implements OnInit {
  Highcharts: typeof Highcharts = Highcharts;

  level = signal<'national' | 'region' | 'section'>('national');
  selectedRegionId = signal<string>('');
  selectedSectionId = signal<string>('');

  regions: { id: string, name: string }[] = [];

  chartOptions: Highcharts.Options = {};
  percentChartOptions: Highcharts.Options = {};

  dates: { date: string, name: string }[] = [];

  allData: { [date: string]: any } = {};

  constructor(
    private electionService: ElectionService,
    private themeService: ThemeService
  ) {
    this.dates = this.electionService.getDates();

    effect(() => {
      this.themeService.darkMode();
      this.level();
      this.selectedRegionId();
      this.selectedSectionId();
      if (Object.keys(this.allData).length > 0) {
        this.updateCharts();
      }
    });
  }

  ngOnInit() {
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      this.updateCharts();
    });

    // Load regions from the latest election to populate the dropdown
    if (this.dates.length > 0) {
      this.electionService.getRegions(this.dates[0].date).subscribe(regions => {
        this.regions = regions.map(r => ({ id: r.id, name: r.name }));
      });
    }
  }

  updateCharts() {
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
      percentData.push(totalVoted > 0 ? (votes / totalVoted) * 100 : 0);
    });

    const isDark = this.themeService.darkMode();
    const textColor = isDark ? '#f8fafc' : '#020817';

    this.chartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Абсолютен брой гласове за ПП-ДБ', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Гласове', style: { color: textColor } }, labels: { style: { color: textColor } } },
      series: [{ name: 'Гласове', data: votesData, color: '#0ea5e9' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true }
    };

    this.percentChartOptions = {
      chart: { type: 'line', backgroundColor: 'transparent' },
      title: { text: 'Процентна подкрепа за ПП-ДБ', style: { color: textColor } },
      xAxis: { categories, labels: { style: { color: textColor } } },
      yAxis: { title: { text: 'Процент (%)', style: { color: textColor } }, labels: { style: { color: textColor } }, min: 0, max: 100 },
      series: [{ name: 'Процент', data: percentData, color: '#10b981' }] as any,
      credits: { enabled: false },
      tooltip: { shared: true, valueSuffix: '%' }
    };
  }
}
