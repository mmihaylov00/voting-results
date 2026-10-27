import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { comparisonDelta, comparisonLeader, formatComparisonValue } from '../../../utils/comparison-display.util';

export const COMPARISON_SIDES = ['left', 'difference', 'right'] as const;

@Component({
  selector: 'td[appComparisonCell]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'cellClass()',
    '[attr.data-comparison-difference]': "side() === 'difference' ? '' : null",
    '[attr.data-leader]': "side() === 'difference' ? leader() : null",
    '[attr.data-comparison-winner]': 'leading() ? side() : null',
  },
  template: `
    @if (side() === 'difference') {
      <span class="font-semibold">{{ delta() }}</span>
      @if (leader() === 'left') {
        <span data-comparison-arrow aria-hidden="true" class="absolute left-2 top-1/2 -translate-y-1/2 text-xl font-semibold">←</span>
        <span class="sr-only">Лява страна води</span>
      } @else if (leader() === 'right') {
        <span data-comparison-arrow aria-hidden="true" class="absolute right-2 top-1/2 -translate-y-1/2 text-xl font-semibold">→</span>
        <span class="sr-only">Дясна страна води</span>
      } @else {
        <span class="mt-1 block text-xs text-muted-foreground">{{ leader() === 'tie' ? 'Равни' : 'Няма данни' }}</span>
      }
    } @else {
      @if (leading()) {
        <span aria-hidden="true" class="mr-1">✓</span><span class="sr-only">По-висока стойност: </span>
      }{{ value() }}
    }
  `,
})
export class ComparisonCellComponent {
  readonly side = input.required<typeof COMPARISON_SIDES[number]>();
  readonly left = input<number | null | undefined>();
  readonly right = input<number | null | undefined>();
  readonly rate = input(false);
  readonly rightMinusLeft = input(false);
  readonly leader = computed(() => comparisonLeader(this.left(), this.right()));
  readonly leading = computed(() => this.side() !== 'difference' && this.leader() === this.side());
  readonly value = computed(() => formatComparisonValue(this.side() === 'left' ? this.left() : this.right(), this.rate()));
  readonly delta = computed(() => this.rightMinusLeft()
    ? comparisonDelta(this.right(), this.left(), this.rate())
    : comparisonDelta(this.left(), this.right(), this.rate()));
  readonly cellClass = computed(() => 'align-middle tabular-nums ' + (this.side() === 'difference'
    ? 'relative px-8 py-3 text-center'
    : 'px-4 py-3 text-center' + (this.leading() ? ' bg-primary/10 font-semibold' : '')));
}
