import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FacebookStanceSummary } from './facebook-research.models';
import { FACEBOOK_CANDIDATES, FACEBOOK_CANDIDATE_LABELS, FACEBOOK_STANCE_BUCKETS, FACEBOOK_TONE_COUNTS, FACEBOOK_TONE_LABELS } from './facebook-research.util';

@Component({
  selector: 'app-facebook-research-stance',
  template: `
    @for (candidate of candidates; track candidate) {
      <div class="candidate-tone">
        <div class="tone-heading"><strong>{{ candidateLabels[candidate] }}</strong><span class="tone" [attr.data-tone]="summary()[candidate].label">{{ labels[summary()[candidate].label] }}</span></div>
        @if (showCounts()) {
          <div class="tone-counts">
            @for (bucket of buckets; track bucket) {
              @if (summary()[candidate].counts[bucket]) {<span>{{ countLabels[bucket] }}: {{ summary()[candidate].counts[bucket] }}</span>}
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host{display:block;min-width:172px;text-align:left;white-space:normal;font-weight:400}
    .candidate-tone+.candidate-tone{margin-top:.65rem}
    .tone-heading{display:flex;align-items:center;justify-content:space-between;gap:.6rem;font-size:.8rem;line-height:1.5}
    strong{font-weight:600}.tone{padding:.12rem .45rem;border-radius:.25rem;font-size:.7rem;background:hsl(var(--muted));color:hsl(var(--muted-foreground));white-space:nowrap}
    [data-tone=supportive]{background:#e4f1ed;color:#176549}[data-tone=critical]{background:#fbe8e6;color:#9e382f}[data-tone=mixed]{background:#f6eddd;color:#865c19}
    :host-context(.dark) [data-tone=supportive]{background:#143b30;color:#9bddc6}:host-context(.dark) [data-tone=critical]{background:#4a2529;color:#f3b1ac}:host-context(.dark) [data-tone=mixed]{background:#403520;color:#e6cb95}
    .tone-counts{display:flex;flex-wrap:wrap;gap:.12rem .55rem;margin-top:.25rem;color:hsl(var(--muted-foreground));font-size:.7rem;line-height:1.5}
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacebookResearchStanceComponent {
  readonly summary = input.required<FacebookStanceSummary>();
  readonly showCounts = input(true);
  readonly candidates = FACEBOOK_CANDIDATES;
  readonly candidateLabels = FACEBOOK_CANDIDATE_LABELS;
  readonly buckets = FACEBOOK_STANCE_BUCKETS;
  readonly labels = FACEBOOK_TONE_LABELS;
  readonly countLabels = FACEBOOK_TONE_COUNTS;
}
