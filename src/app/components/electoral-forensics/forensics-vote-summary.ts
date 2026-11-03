import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { getPartyColor } from '../../utils/party-colors';
import { jointVoteSummary } from './forensics-candidates.util';
import { signed } from './forensics.util';
import { SignedChangeDirective } from '../ui/signed-change/signed-change';

@Component({
  selector: 'app-forensics-vote-summary',
  imports: [SignedChangeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dl class="vote-summary">
    @for (metric of metrics(); track metric.id) {
      <div class="metric" [style.--metric-color]="metric.color">
        <dt><span class="metric-dot" aria-hidden="true"></span>{{ metric.label }}</dt>
        <dd [appSignedChange]="metric.change">{{ metric.value }}<span class="unit">{{ metric.unit }}</span></dd>
        <dd class="baseline" [attr.aria-label]="'I тур: ' + metric.before + '; II тур: ' + metric.after">{{ metric.before }} <span aria-hidden="true">→</span> {{ metric.after }}</dd>
      </div>
    }
  </dl>`,
  styles: `
    :host{display:block;min-width:0}.vote-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0}
    .metric{min-width:0;padding:1.25rem 1.5rem 1.25rem 0}.metric+.metric{border-left:1px solid var(--research-rule);padding-left:1.5rem}
    dt{display:flex;align-items:center;gap:.45rem;font-size:.8rem;color:hsl(var(--muted-foreground));font-weight:500}
    .metric-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:var(--metric-color)}
    dd{margin:0;font-variant-numeric:tabular-nums}dd:not(.baseline){font-size:clamp(1.6rem,3vw,2.35rem);font-weight:650;letter-spacing:-.045em;line-height:1.3;margin:.55rem 0 .3rem;white-space:nowrap}
    .unit{font-size:.7rem;letter-spacing:0;font-weight:500;margin-left:.35rem;color:hsl(var(--muted-foreground))}
    .baseline{font-size:.73rem;color:hsl(var(--muted-foreground));font-variant-numeric:tabular-nums}.baseline span{padding:0 .2rem}
    @media(max-width:700px){.vote-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:1rem 1rem 1rem 0}.metric+.metric{padding-left:1rem}.metric:nth-child(3){padding-left:0;border-left:0}.metric:nth-child(n+3){border-top:1px solid var(--research-rule)}}
    @media(max-width:420px){.unit{display:block;margin-left:0;line-height:1.6}}
    @media(max-width:360px){.vote-summary{grid-template-columns:1fr}.metric+.metric{padding-left:0;border-left:0;border-top:1px solid var(--research-rule)}}
  `,
})
export class ForensicsVoteSummaryComponent {
  readonly summary = input.required<ReturnType<typeof jointVoteSummary>>();
  private readonly theme = inject(ThemeService);
  readonly metrics = computed(() => {
    const summary = this.summary();
    const count = (value: number | null) => value === null ? 'няма данни' : value.toLocaleString('bg-BG');
    const percent = (value: number | null) => value === null ? 'няма данни' : `${value.toLocaleString('bg-BG', { maximumFractionDigits: 2 })}%`;
    return [
      { id: 'voters', label: 'Промяна в гласувалите', value: signed(summary.deltaVoted, 0), change: summary.deltaVoted, unit: '',
        before: count(summary.voted1), after: count(summary.voted2), color: 'hsl(var(--foreground))' },
      { id: 'turnout', label: 'Промяна в активността', value: signed(summary.deltaTurnoutPp), change: summary.deltaTurnoutPp, unit: 'п.п.',
        before: percent(summary.turnout1), after: percent(summary.turnout2), color: 'hsl(var(--primary))' },
      ...(['4', '25'] as const).map(id => {
        const candidate = summary.candidates.find(row => row.id === id);
        const label = id === '4' ? 'Андрей Гюров' : 'Илияна Йотова';
        return { id, label, value: signed(candidate?.deltaVotes, 0), change: candidate?.deltaVotes,
          unit: Math.abs(candidate?.deltaVotes ?? 0) === 1 ? 'глас' : 'гласа',
          before: count(candidate?.votes1 ?? null), after: count(candidate?.votes2 ?? null),
          color: getPartyColor(candidate?.name ?? label, this.theme.darkMode()) };
      }),
    ];
  });
}
