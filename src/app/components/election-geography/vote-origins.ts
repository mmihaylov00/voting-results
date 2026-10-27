import { SelectComponent, partySelectOptions } from '../ui/select/select';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { VoteFlowData, VoteFlowNode } from '../../models/election-context.models';
import { ElectionContextService } from '../../services/election-context.service';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { getPartyColor, getPartyDisplayName } from '../../utils/party-colors';
import { incomingVoteFlows, layoutVoteOrigins } from '../../utils/vote-flow.util';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import { HlmTooltipDirective } from '../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { BaseModalComponent } from '../ui/base-modal/base-modal';

const VOTE_FORMAT = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const SHARE_FORMAT = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

@Component({
  selector: 'app-vote-origins',
  standalone: true,
  imports: [SelectComponent, CommonModule, HlmButtonDirective, HlmTooltipDirective, BaseModalComponent],
  templateUrl: './vote-origins.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoteOriginsComponent {
  private readonly context = inject(ElectionContextService);
  private readonly theme = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly requestedParty = signal('');
  readonly modalPages = inject(ModalPageService);
  readonly methodOpen = signal(false);
  readonly date = input.required<string>();
  readonly data = signal<VoteFlowData | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly targets = computed(() => this.data()?.toNodes.filter(node => !node.pseudo && node.votes > 0).sort((left, right) => right.votes - left.votes) ?? []);
  readonly selected = computed(() => this.targets().find(node => node.id === this.requestedParty()) ?? null);
  readonly partyOptions = computed(() => [{ value: '', label: 'Всички партии' }, ...partySelectOptions(this.targets())]);
  readonly groups = computed(() => {
    const data = this.data();
    const target = this.selected();
    return data ? (target ? [target] : this.targets()).map(target => {
      const rows = incomingVoteFlows(data, target.id);
      return { target, total: rows.reduce((sum, row) => sum + row.votes, 0),
        rows: rows.map(row => ({ ...row, ...this.connectionDetails(row.source, target, row.votes, row.share) })),
      };
    }) : [];
  });
  readonly total = computed(() => this.groups().reduce((sum, group) => sum + group.total, 0));
  readonly chart = computed(() => {
    const chart = layoutVoteOrigins(this.groups());
    return { ...chart, ribbons: chart.ribbons.map(ribbon => ({ ...ribbon,
      ...this.connectionDetails(ribbon.source, ribbon.target, ribbon.votes, ribbon.share),
    })) };
  });
  readonly bars = computed(() => {
    const order = new Map(this.chart().sources.map((source, index) => [source.node.id, index]));
    return this.groups().map(group => ({ ...group,
      segments: [...group.rows].sort((left, right) => order.get(left.source.id)! - order.get(right.source.id)!),
    }));
  });
  readonly formatVotes = VOTE_FORMAT.format;

  constructor() {
    this.route.queryParamMap.pipe(
      map(params => params.get('originParty') ?? ''), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(party => this.requestedParty.set(party));
    effect(onCleanup => {
      const date = this.date();
      this.methodOpen.set(false);
      this.loading.set(true);
      this.error.set('');
      this.data.set(null);
      this.requestedParty.set(this.route.snapshot.queryParamMap.get('originParty') ?? '');
      const subscription = this.context.getVoteFlows(date).subscribe({
        next: data => { this.data.set(data); this.loading.set(false); },
        error: () => { this.error.set('Оценката за движението на гласовете не може да бъде заредена.'); this.loading.set(false); },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  selectParty(id: string): void {
    if (!id || this.targets().some(node => node.id === id)) this.requestedParty.set(id);
  }

  displayName(node: VoteFlowNode): string {
    return node.pseudo ? node.name : getPartyDisplayName(node.name);
  }

  color(node: VoteFlowNode): string {
    return node.pseudo ? 'hsl(var(--muted-foreground))'
      : getPartyColor(node.name, this.theme.darkMode());
  }

  formatShare(share: number): string {
    return share > 0 && share < 0.1 ? '<0,1%' : `${SHARE_FORMAT.format(share)}%`;
  }

  private connectionDetails(source: VoteFlowNode, target: VoteFlowNode, votes: number, share: number) {
    const label = `От: ${this.displayName(source)} (${this.data()?.from})\nКъм: ${this.displayName(target)} (${this.date()})`
      + `\n≈ ${this.formatVotes(votes)} оценени гласа\n${this.formatShare(share)} от потоците към ${this.displayName(target)}`;
    return { label, tooltip: label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') };
  }
}
