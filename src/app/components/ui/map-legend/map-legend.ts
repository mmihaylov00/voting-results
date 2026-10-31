import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { ThemeService } from '../../../services/theme.service';
import { MapMetric, MapMetricHelper } from '../../../utils/map-metric.helper';

@Component({
  selector: 'app-map-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <details open class="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background/95 text-foreground shadow-xs">
      <summary class="cursor-pointer break-words px-3 py-2 text-xs font-medium">Легенда: {{ legend().title }}</summary>
      <div class="max-h-[min(28dvh,11rem)] overflow-x-hidden overflow-y-auto px-3 pb-3 text-xs">
        <p class="mb-2 whitespace-normal break-words text-muted-foreground">{{ legend().description }}</p>
        <ul class="space-y-1" aria-label="Цветове и стойности">
          @for (item of legend().items; track $index) {
            <li class="flex min-w-0 items-start gap-2" [attr.data-map-legend-color]="item.color">
              <span class="h-3 w-5 shrink-0 rounded-sm border border-foreground/20"
                    [style.background-color]="item.color" [style.opacity]="item.opacity ?? 1" aria-hidden="true"></span>
              <span class="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{{ item.label }}</span>
            </li>
          }
          <li class="flex items-center gap-2" [attr.data-map-legend-color]="legend().noDataColor">
            <span class="h-3 w-5 shrink-0 rounded-sm border border-dashed border-foreground/50"
                  [style.background-color]="legend().noDataColor" aria-hidden="true"></span>
            <span>Няма данни</span>
          </li>
        </ul>
      </div>
    </details>
  `,
})
export class MapLegendComponent {
  readonly metric = input<MapMetric>('leading-party');
  readonly selectedPartyId = input<string | null>(null);
  readonly partiesById = input<Record<string, string>>({});
  readonly shareLabel = input('от гласувалите');
  private readonly themeService = inject(ThemeService);
  readonly legend = computed(() => MapMetricHelper.getLegend(
    this.metric(), this.themeService.darkMode(), this.selectedPartyId(), this.partiesById(), this.shareLabel()
  ));
}
