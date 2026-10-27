import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../../services/theme.service';
import { getPartyColor, getPartyDisplayName, getPartyLegendIndex } from '../../../utils/party-colors';
import { MAJORITY_SEATS, PARLIAMENT_SEATS, SeatRow } from '../../../utils/seat-allocation.util';
import { HlmTooltipDirective } from '../tooltip-helm/src/lib/hlm-tooltip.directive';

const SEAT_SHARE_FORMAT = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SEAT_POSITIONS = [19, 22, 25, 28, 32, 35, 38, 41].flatMap((count, row) => {
  const radius = 120 + row * 20;
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.PI * index / (count - 1);
    return { angle, x: 280 - radius * Math.cos(angle), y: 276 - radius * Math.sin(angle) };
  });
}).sort((left, right) => left.angle - right.angle);

@Component({
  selector: 'app-parliament-chart',
  standalone: true,
  imports: [DecimalPipe, HlmTooltipDirective],
  templateUrl: './parliament-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParliamentChartComponent {
  private readonly theme = inject(ThemeService);
  readonly parties = input.required<Pick<SeatRow, 'id' | 'name' | 'seats'>[]>();
  readonly totalSeats = PARLIAMENT_SEATS;
  readonly majority = MAJORITY_SEATS;
  readonly displayName = getPartyDisplayName;
  readonly legendParties = computed(() => this.parties().slice().sort((left, right) =>
    getPartyLegendIndex(left.name) - getPartyLegendIndex(right.name)));
  readonly tooltips = computed(() => new Map(this.parties().map(party => [party.id,
    `${party.name}\n${party.seats} мандата · ${SEAT_SHARE_FORMAT.format(party.seats / PARLIAMENT_SEATS * 100)}%`
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  ])));
  readonly allocatedSeats = computed(() => this.parties().reduce((total, party) => total + party.seats, 0));
  readonly description = computed(() => this.parties().map(party => `${getPartyDisplayName(party.name)}: ${party.seats} мандата, ${SEAT_SHARE_FORMAT.format(party.seats / PARLIAMENT_SEATS * 100)}%`).join('; '));
  readonly dots = computed(() => {
    const seats = this.parties().flatMap(party => Array.from({ length: party.seats }, () => party));
    return SEAT_POSITIONS.map((position, index) => ({ ...position, party: seats.at(index) ?? null }));
  });

  color(name: string): string {
    return getPartyColor(name, this.theme.darkMode());
  }
}
