import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { ThemeService } from '../../services/theme.service';
import { ChartImageExportComponent } from '../ui/chart-image-export/chart-image-export';
import { ViewTabsComponent } from '../ui/view-tabs/view-tabs';
import { FacebookCandidate, FacebookMetric, FacebookPageSummary, FacebookPost } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_METRIC_LABELS, facebookCount, facebookDailyCounts, facebookShortName } from './facebook-research.util';

export interface FacebookToneSelection {
  pageId: string;
  candidate: FacebookCandidate;
  tone: 'supportive' | 'critical';
}

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
          @if (toneMode()) {
            <app-view-tabs [tabs]="candidateTabs" [value]="candidate()" (valueChange)="setCandidate($event)" [scrollable]="true" label="Кандидат за тона на публикациите" idPrefix="facebook-tone-candidate" panelId="facebook-tone-panel" />
          }
          <div [id]="toneMode() ? 'facebook-tone-panel' : null" [attr.role]="toneMode() ? 'tabpanel' : null" [attr.aria-labelledby]="toneMode() ? 'facebook-tone-candidate-tab-' + candidate() : null">
            @if (toneMode() && !toneRows().length) {
              <p class="chart-note empty-tone" role="status">Няма оценени публикации в подкрепа или критика към {{ candidateLabel() }} по тези филтри.</p>
            } @else {
              <app-chart-image-export [title]="exportTitle()" [filename]="toneMode() ? 'facebook-pages-' + candidate() + '-tone-2026.png' : 'facebook-pages-2026.png'">
                <div class="chart-scroll" tabindex="0" role="region" aria-labelledby="engagement-chart-title">
                  <!-- Recreate the chart when switching modes to clear retained Highcharts series and axis options. -->
                  @if (toneMode()) {
                    <highcharts-chart aria-hidden="true" [options]="toneChart()" style="display:block;width:100%" />
                  } @else {
                    <highcharts-chart aria-hidden="true" [options]="pageChart()" style="display:block;width:100%" />
                  }
                </div>
              </app-chart-image-export>
            }
            @if (toneMode()) {
              <div class="sr-only"><table>
                <caption>{{ metricLabel() }} по тон към {{ candidateLabel() }}</caption>
                <thead><tr><th scope="col">Страница</th><th scope="col">В подкрепа</th><th scope="col">Критични</th></tr></thead>
                <tbody>@for (row of toneRows(); track row.id) {<tr><th scope="row">{{ row.name }}</th><td>{{ count(row.supportive) }}</td><td>{{ count(row.critical) }}</td></tr>}</tbody>
              </table></div>
              <p class="chart-note">{{ tonePostCount() }} публикации в подкрепа / критика · {{ excludedTonePosts() }} с други или липсващи оценки.</p>
            }
          </div>
        </div>
        @if (!toneMode()) {<p class="chart-note">Сбор от наличните броячи; ≈ включва закръглени стойности. Таблицата по-долу съдържа всички стойности.</p>}
      </section>
      <section aria-labelledby="publication-chart-title">
        <h2 id="publication-chart-title">Публикации по дни</h2>
        <p class="chart-note publication-note" [class.tone-mode]="toneMode()">{{ datedPosts() }} с точна дата · {{ intervalPosts() }} в период</p>
        <app-chart-image-export title="Публикации с точна дата · Facebook · октомври 2026" filename="facebook-publications-2026.png">
          <div class="chart-scroll" tabindex="0" role="region" aria-labelledby="publication-chart-title">
            <highcharts-chart aria-hidden="true" [options]="timelineChart()" style="display:block;width:100%" />
          </div>
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
    .chart-scroll,.empty-tone{height:420px}.chart-scroll{overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.chart-scroll:focus-visible{outline:2px solid hsl(var(--foreground));outline-offset:3px}
    .publication-note{min-height:44px;margin:0;display:flex;align-items:center}.publication-note.tone-mode{min-height:88px}.empty-tone{padding:2rem 0}
    @media(max-width:950px){.chart-grid{grid-template-columns:1fr}section+section{border-left:0;border-top:1px solid var(--facebook-rule);padding:1.5rem 0 0}.publication-note,.publication-note.tone-mode{min-height:44px}.chart-scroll,.empty-tone{height:360px}}
  `,
})
export class FacebookResearchChartsComponent {
  private readonly theme = inject(ThemeService);
  readonly pages = input.required<readonly FacebookPageSummary[]>();
  readonly posts = input.required<readonly FacebookPost[]>();
  readonly pageSelect = output<string>();
  readonly toneSelect = output<FacebookToneSelection>();
  readonly candidate = signal<FacebookCandidate>('gyurov');
  readonly candidateTabs = FACEBOOK_CANDIDATES.map(id => ({ id, label: FACEBOOK_CANDIDATE_LABELS[id] }));
  readonly metric = signal('shares');
  readonly count = facebookCount;
  readonly metricTabs = [
    { id: 'reactions', label: 'Реакции' }, { id: 'comments', label: 'Коментари' },
    { id: 'shares', label: 'Споделяния' }, { id: 'tone', label: 'Подкрепа / критика' },
  ];
  readonly toneMode = computed(() => this.metric() === 'tone');
  readonly metricLabel = computed(() => this.toneMode() ? 'Публикации' : FACEBOOK_METRIC_LABELS[this.metric() as FacebookMetric]);
  readonly candidateLabel = computed(() => FACEBOOK_CANDIDATE_LABELS[this.candidate()]);
  readonly exportTitle = computed(() => this.toneMode()
    ? `${this.metricLabel()} · Подкрепа / критика към ${this.candidateLabel()} · Facebook извадка · октомври 2026`
    : `${this.metricLabel()} в събраната извадка · Facebook · октомври 2026`);
  private readonly visiblePosts = computed(() => {
    const pages = new Set(this.pages().map(page => page.id));
    return this.posts().filter(post => pages.has(post.pageId));
  });
  readonly datedPosts = computed(() => this.visiblePosts().filter(post => post.date).length);
  readonly intervalPosts = computed(() => this.visiblePosts().length - this.datedPosts());
  readonly dailyCounts = computed(() => facebookDailyCounts(this.visiblePosts()));
  readonly toneRows = computed(() => {
    const buckets = new Map(this.pages().map(page => [page.id, { id: page.id, name: page.name, supportive: 0, critical: 0 }]));
    for (const post of this.visiblePosts()) {
      const tone = post.stance?.[this.candidate()];
      if (tone === 'supportive' || tone === 'critical') buckets.get(post.pageId)![tone]++;
    }
    return [...buckets.values()].filter(row => row.supportive + row.critical > 0)
      .sort((a, b) => b.supportive + b.critical - a.supportive - a.critical);
  });
  readonly tonePostCount = computed(() => this.toneRows().reduce((sum, row) => sum + row.supportive + row.critical, 0));
  readonly excludedTonePosts = computed(() => this.visiblePosts().length - this.tonePostCount());

  setCandidate(value: string): void {
    if (value === 'gyurov' || value === 'yotova') this.candidate.set(value);
  }

  readonly pageChart = computed((): Highcharts.Options => {
    const metric = (this.toneMode() ? 'shares' : this.metric()) as FacebookMetric;
    const rows = [...this.pages()].sort((a, b) => (b.totals[metric].value ?? -1) - (a.totals[metric].value ?? -1));
    const select = (index: number) => this.pageSelect.emit(rows[index].id);
    return {
      ...this.baseOptions(), chart: { ...this.baseOptions().chart, type: 'bar', height: Math.max(260, rows.length * 37 + 60) },
      xAxis: { categories: rows.map(row => facebookShortName(row.name)), labels: { style: { color: this.ink(), fontSize: '11px' } }, lineWidth: 0, tickWidth: 0 },
      yAxis: { min: 0, title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: this.ink() } } },
      tooltip: { outside: true, headerFormat: '<b>{point.key}</b><br/>', pointFormat: this.metricLabel() + ': <b>{point.custom.display}</b><br/>{point.custom.coverage}', useHTML: false },
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
      ...this.baseOptions(), chart: { ...this.baseOptions().chart, type: 'column', height: 420 },
      xAxis: { categories: dates.map(date => `${Number(date.slice(-2))} окт`), tickInterval: 5, labels: { style: { color: this.ink(), fontSize: '11px' } }, lineWidth: 0 },
      yAxis: { min: 0, allowDecimals: false, title: { text: '' }, gridLineColor: 'var(--facebook-rule)', labels: { style: { color: this.ink() } } },
      tooltip: { outside: true, headerFormat: '<b>{point.key} 2026</b><br/>', pointFormat: 'Публикации: <b>{point.y}</b>', useHTML: false },
      plotOptions: { series: { animation: false }, column: { borderWidth: 0, borderRadius: 2 } },
      series: [{ type: 'column', name: 'Публикации', color: this.accent(), data: dates.map(date => counts.get(date) ?? 0) }],
    };
  });

  readonly toneChart = computed((): Highcharts.Options => {
    const rows = this.toneRows();
    const candidate = this.candidate();
    const extent = Math.max(1, ...rows.flatMap(row => [row.supportive, row.critical]));
    const select = (index: number, tone: FacebookToneSelection['tone']) => this.toneSelect.emit({ pageId: rows[index].id, candidate, tone });
    const series = (['supportive', 'critical'] as const).map((tone): Highcharts.SeriesBarOptions => ({
      type: 'bar', name: tone === 'supportive' ? 'Подкрепящи публикации' : 'Критични публикации',
      color: tone === 'supportive' ? (this.theme.darkMode() ? '#72c9a6' : '#23805d') : (this.theme.darkMode() ? '#ed9b96' : '#b84b47'),
      point: { events: { click() { select(this.index, tone); } } },
      data: rows.map(row => {
        const count = row[tone];
        return { y: tone === 'critical' && count ? -count : count, custom: { display: facebookCount(count) } };
      }),
    }));
    return {
      ...this.baseOptions(), chart: { ...this.baseOptions().chart, type: 'bar', height: Math.max(320, rows.length * 37 + 110) },
      responsive: { rules: [{ condition: { maxWidth: 480 }, chartOptions: {
        chart: { marginLeft: 112 }, xAxis: { labels: { distance: 8, style: { width: 100, textOverflow: 'ellipsis', whiteSpace: 'nowrap' } } },
      } }] },
      subtitle: { text: `${this.tonePostCount()} публикации · ${this.excludedTonePosts()} извън подкрепа / критика`, style: { color: this.ink(), fontSize: '10px' } },
      xAxis: { categories: rows.map(row => facebookShortName(row.name)), labels: { style: { color: this.ink(), fontSize: '11px' } }, lineWidth: 0, tickWidth: 0 },
      yAxis: { min: -extent, max: extent, tickPositions: [-extent, 0, extent], startOnTick: false, endOnTick: false, allowDecimals: false, title: { text: '' }, gridLineColor: 'var(--facebook-rule)',
        labels: { style: { color: this.ink() }, formatter() { return facebookCount(Math.abs(Number(this.value))); } },
        plotLines: [{ value: 0, width: 1, color: this.ink(), zIndex: 3 }] },
      legend: { enabled: true, itemStyle: { color: this.ink(), fontSize: '11px' } },
      tooltip: { outside: true, headerFormat: '<b>{point.key}</b><br/>', pointFormat: `{series.name} към ${this.candidateLabel()}<br/>Публикации: <b>{point.custom.display}</b>`, useHTML: false },
      plotOptions: { series: { animation: false, cursor: 'pointer', stacking: 'normal' }, bar: { borderWidth: 0, borderRadius: 2, maxPointWidth: 20 } },
      series,
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
