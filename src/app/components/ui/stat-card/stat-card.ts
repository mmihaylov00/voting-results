import { Component, Input, TemplateRef, ContentChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardContentDirective,
  HlmCardDescriptionDirective,
} from '../card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../tooltip-helm/src/lib/hlm-tooltip.directive';
import { formatActivity } from '../../../utils/common.utils';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [
    CommonModule,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardContentDirective,
    HlmCardDescriptionDirective,
    HlmTypographyDirective,
    HlmTooltipDirective,
  ],
  templateUrl: './stat-card.html',
})
export class StatCardComponent {
  @Input() label!: string;
  @Input() value: string | number | null = null;
  @Input() isPercent: boolean = false;
  @Input() tooltipData?: any;
  @Input() currentValue?: number;
  @ContentChild('customContent') customContent?: TemplateRef<any>;

  formatActivity = formatActivity;

  get displayValue(): string {
    if (this.customContent) {
      return '';
    }
    if (this.value === null || this.value === undefined) {
      return '-';
    }
    if (this.isPercent && typeof this.value === 'number') {
      // Use formatActivity for activity percentages (0-1 range)
      if (this.value <= 1 && this.value >= 0) {
        return `${this.formatActivity(this.value)}%`;
      }
      return `${this.value.toFixed(2)}%`;
    }
    if (typeof this.value === 'number') {
      return this.value.toLocaleString();
    }
    return String(this.value);
  }

  get hasTooltip(): boolean {
    return !!this.tooltipData;
  }
}
