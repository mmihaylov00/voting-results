import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { ThemeService } from '../../services/theme.service';
import { ChartImageExportComponent } from '../ui/chart-image-export/chart-image-export';
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { FacebookMetric, FacebookPageSummary, FacebookPost } from './facebook-research.models';
import { FACEBOOK_METRIC_LABELS, facebookCount, facebookDailyCounts, facebookShortName } from './facebook-research.util';

@Component({
  selector: 'app-facebook-research-charts',
  imports: [HighchartsChartComponent, ChartImageExportComponent, ViewTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-grid">
      <section aria-labelledby="engagement-chart-title">
        <h2 id="engagement-chart-title">Взаимодействия по страници</h2>
        <app-view-tabs [tabs]="metricTabs" [(value)]="metric" [scrollable]="true" label="Показател за взаимодействия" idPrefix="facebook-metric" panelId="facebook-metric-panel" />
        <div id="facebook-metric-panel" role="tabpanel" [attr.aria-labelledby]="'facebook-metric-tab-' + metric()">
          <app-chart-image-export [title]="metricLabel() + ' в събраната извадка · Facebook · октомври 2026'" filename="facebook-pages-2026.png">
            <highcharts-chart aria-hidden="true" [options]="pageChart()" style="display:block;width:100%" />
          </app-chart-image-export>
        </div>
        <p class="chart-note">Сбор от наличните броячи; ≈ включва закръглени стойности. Таблицата по-долу съдържа всички стойности.</p>
      </section>
      <section aria-labelledby="publication-chart-title">
        <h2 id="publication-chart-title">Публикации по дни</h2>
        <p class="chart-note publication-note">{{ datedPosts() }} с точна дата · {{ intervalPosts() }} в период</p>
        <app-chart-image-export title="Публикации с точна дата · Facebook · октомври 2026" filename="facebook-publications-2026.png">
          <highcharts-chart aria-hidden="true" [options]="timelineChart()" style="display:block;width:100%" />
        </app-chart-image-export>
        <dl class="sr-only" aria-label="Публикации с точна дата по дни">@for (day of dailyCounts(); track day.date) {<dt>{{ day.date }}</dt><dd>{{ day.count }}</dd>}</dl>
      </section>
    </div>
  `,
  styles: `
    :host{display:block;min-width:0}.chart-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:2rem}
    section{min-width:0}section+section{border-left:1px solid var(--facebook-rule);padding-left:2rem}
    h2{font-size:1.15rem;font-weight:650;letter-spacing:-.025em;margin:0 0 1rem}
    .chart-note{font-size:.76rem;line-height:1.6;color:hsl(var(--muted-foreground));margin:.7rem 0 0}
    .publication-note{min-height:44px;margin:0;display:flex;align-items:center}
    @media(max-width:950px){.chart-grid{grid-template-columns:1fr}section+section{border-left:0;border-top:1px solid var(--facebook-rule);padding:1.5rem 0 0}}
  `,
})
export class FacebookResearchChartsComponent {
  private readonly theme = inject(ThemeService);
  readonly pages = input.required<readonly FacebookPageSummary[]>();
  readonly posts = input.required<readonly FacebookPost[]>();
  readonly pageSelect = output<string>();
  readonly metric = signal('shares');
  readonly metricTabs = [
    { id: 'reactions', label: 'Реакции' }, { id: 'comments', label: 'Коментари' },
    { id: 'shares', label: 'Споделяния' },
  ];
  readonly metricLabel = computed(() => FACEBOOK_METRIC_LABELS[this.metric() as FacebookMetric]);
  private readonly visiblePosts = computed(() => {
    const pages = new Set(this.pages().map(page => page.id));
    return this.posts().filter(post => pages.has(post.pageId));
  });
  readonly datedPosts = computed(() => this.visiblePosts().filter(post => post.date).length);
  readonly intervalPosts = computed(() => this.visiblePosts().length - this.datedPosts());
  readonly dailyCounts = computed(() => facebookDailyCounts(this.visiblePosts()));

  readonly pageChart = computed((): Highcharts.Options => {
    const metric = this.metric() as FacebookMetric;
    const rows = [...this.pages()].sort((a, b) => (b.totals[metric].value ?? -1) - (a.totals[metric].value ?? -1));
    const select = (index: number) => this.pageSelect.emit(rows[index].id);
    return {
      ...this.baseOptions(), chart: { ...this.baseOptions().chart, type: 'bar', height: Math.max(260, rows.length * 37 + 60) },
      xAxis: { categories: rows.map(row => facebookShortName(row.name)), labels: { style: { color: this.ink(), fontSize: '11px' } }, lineWidth: 0, tickWidth: 0 },
      yAxis: { min: 0, title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: this.ink() } } },
      tooltip: { headerFormat: '<b>{point.key}</b><br/>', pointFormat: this.metricLabel() + ': <b>{point.custom.display}</b><br/>{point.custom.coverage}', useHTML: false },
      plotOptions: { series: { animation: false, cursor: 'pointer', point: { events: { click() { select(this.index); } } } }, bar: { borderWidth: 0, borderRadius: 3, maxPointWidth: 20 } },
      series: [{ type: 'bar', name: this.metricLabel(), color: this.accent(), data: rows.map(row => ({
        y: row.totals[metric].value,
        custom: { display: facebookCount(row.totals[metric].value, row.totals[metric].approximate),
          coverage: row.totals[metric].missing ? `${row.totals[metric].missing} публикации без брояч` : 'Всички събрани публикации имат брояч' },
      })) }],
    };
  });

  readonly timelineChart = computed((): Highcharts.Options => {
    const counts = new Map(this.dailyCounts().map(row => [row.date, row.count]));
    const dates = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    return {
      ...this.baseOptions(), chart: { ...this.baseOptions().chart, type: 'column', height: Math.max(260, this.pages().length * 37 + 60) },
      xAxis: { categories: dates.map(date => `${Number(date.slice(-2))} окт`), tickInterval: 5, labels: { style: { color: this.ink(), fontSize: '11px' } }, lineWidth: 0 },
      yAxis: { min: 0, allowDecimals: false, title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: this.ink() } } },
      tooltip: { headerFormat: '<b>{point.key} 2026</b><br/>', pointFormat: 'Публикации: <b>{point.y}</b>', useHTML: false },
      plotOptions: { series: { animation: false }, column: { borderWidth: 0, borderRadius: 2 } },
      series: [{ type: 'column', name: 'Публикации', color: this.accent(), data: dates.map(date => counts.get(date) ?? 0) }],
    };
  });

  private ink(): string { return this.theme.darkMode() ? '#e5ebf2' : '#18374f'; }
  private accent(): string { return this.theme.darkMode() ? '#e7ba50' : '#277f9b'; }
  private baseOptions(): Highcharts.Options {
    return {
      chart: { backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: undefined }, legend: { enabled: false }, credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }
}
