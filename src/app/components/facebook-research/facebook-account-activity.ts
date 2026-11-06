import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { ThemeService } from '../../services/theme.service';
import { ChartImageExportComponent } from '../ui/chart-image-export/chart-image-export';
import { FACEBOOK_COMMENT_BANDS, FACEBOOK_PAGE_BANDS, FacebookActivityCell } from './facebook-participation.util';
import { facebookCount } from './facebook-research.util';

@Component({
  selector: 'app-facebook-account-activity',
  imports: [HighchartsChartComponent, ChartImageExportComponent],
  templateUrl: './facebook-account-activity.html',
  styleUrl: './facebook-account-activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookAccountActivityComponent {
  private readonly theme = inject(ThemeService);
  readonly cells = input.required<readonly FacebookActivityCell[] | null>();
  readonly matchedComments = input.required<number>();
  readonly scaleMax = input.required<number>();
  readonly pageName = input('');
  readonly collectedDate = input('');
  readonly commentBands = [...FACEBOOK_COMMENT_BANDS].reverse();
  readonly pageBands = FACEBOOK_PAGE_BANDS;
  readonly count = facebookCount;
  readonly visibleCells = computed(() => this.cells()?.filter(
    (cell): cell is FacebookActivityCell & { accounts: number } => cell.accounts !== null,
  ) ?? []);
  readonly matrix = computed(() => new Map(this.cells()?.map(cell => [
    `${cell.commentBand}:${cell.pageBand}`, cell.accounts,
  ])));
  readonly exportTitle = computed(() => `Коментари и страници на акаунт · ${this.pageName() || 'Цялата извадка'} · към ${this.collectedDate()}`);
  readonly chartOptions = computed((): Highcharts.Options => {
    const dark = this.theme.darkMode();
    const ink = dark ? '#e5ebf2' : '#18374f';
    const muted = dark ? '#9baebd' : '#697c89';
    const coordinates = (cell: FacebookActivityCell) => ({
      x: FACEBOOK_PAGE_BANDS.indexOf(cell.pageBand),
      y: FACEBOOK_COMMENT_BANDS.indexOf(cell.commentBand),
    });
    return {
      chart: { type: 'scatter', height: 430, animation: false, backgroundColor: 'transparent',
        style: { fontFamily: 'inherit' }, spacing: [18, 18, 8, 4] },
      title: { text: undefined }, credits: { enabled: false }, accessibility: { enabled: false },
      legend: { enabled: false },
      xAxis: { categories: [...FACEBOOK_PAGE_BANDS], min: 0, max: 3, tickPositions: [0, 1, 2, 3],
        tickWidth: 0, gridLineWidth: 1, gridLineColor: 'var(--facebook-rule)', lineWidth: 0,
        title: { text: 'Различни страници на акаунт', style: { color: ink } },
        labels: { style: { color: ink, fontSize: '12px' } } },
      yAxis: { categories: [...FACEBOOK_COMMENT_BANDS], min: 0, max: 5, tickPositions: [0, 1, 2, 3, 4, 5],
        gridLineColor: 'var(--facebook-rule)', startOnTick: false, endOnTick: false,
        title: { text: 'Коментари на акаунт', style: { color: ink } },
        labels: { style: { color: ink, fontSize: '12px' } } },
      tooltip: { outside: true, headerFormat: '',
        pointFormat: '<b>{point.custom.label} акаунта</b><br/>Коментари на акаунт: <b>{point.custom.commentBand}</b><br/>Различни страници: <b>{point.custom.pageBand}</b>' },
      plotOptions: { series: { animation: false }, scatter: {
        dataLabels: { enabled: true, allowOverlap: true, verticalAlign: 'middle', y: 0,
          format: '{point.custom.label}', style: { color: ink, fontSize: '12px', textOutline: 'none', fontWeight: '600' } } } },
      responsive: { rules: [{ condition: { maxWidth: 480 }, chartOptions: { chart: { height: 390,
        spacingRight: 8 }, xAxis: { title: { style: { fontSize: '11px' } } },
        yAxis: { title: { style: { fontSize: '11px' } } } } }] },
      series: [{ type: 'scatter', name: 'Брой акаунти',
        data: this.visibleCells().map(cell => ({ ...coordinates(cell),
          marker: { symbol: 'circle', radius: 24 * Math.sqrt(cell.accounts / Math.max(1, this.scaleMax())),
            fillColor: dark ? '#275c4a' : '#b6dece', lineColor: dark ? '#72c9a6' : '#23805d', lineWidth: 1 },
          custom: { ...cell, label: facebookCount(cell.accounts) } })),
      }, { type: 'scatter', name: 'Скрити малки групи', enableMouseTracking: false,
        marker: { enabled: false }, dataLabels: { style: { color: muted, fontWeight: '400' } },
        data: (this.cells() ?? []).filter(cell => cell.accounts === null).map(cell => ({ ...coordinates(cell),
          custom: { label: this.cellCount(cell.commentBand, cell.pageBand) } })) }],
    };
  });

  cellCount(commentBand: string, pageBand: string): string {
    const maximumComments = commentBand === '1' ? 1 : commentBand === '2' ? 2 : Infinity;
    if (Number.parseInt(pageBand, 10) > maximumComments) return '-';
    const value = this.matrix().get(`${commentBand}:${pageBand}`);
    return value == null ? '<5' : facebookCount(value);
  }
}
