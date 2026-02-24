import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmTooltipDirective } from '../tooltip-helm/src/lib/hlm-tooltip.directive';
import { formatRiskMessage, RiskContext } from '../../../utils/risk-message.util';

export interface RiskIndicator {
  code: string;
  category: string;
  severity: string; // 'high' | 'medium' | 'low' as string
  details?: any;
}

@Component({
  selector: 'app-risk-badge',
  standalone: true,
  imports: [
    CommonModule,
    HlmTooltipDirective,
  ],
  templateUrl: './risk-badge.html',
})
export class RiskBadgeComponent {
  @Input() risk!: RiskIndicator;
  @Input() size: 'small' | 'medium' = 'small';
  @Input() displayMode: 'compact' | 'full' = 'compact';
  @Input() context?: RiskContext;

  get severityClasses(): string {
    const baseClasses = this.size === 'small' 
      ? 'px-1.5 py-0.5 text-xs rounded-full'
      : 'px-2 py-1 text-xs rounded-md';
    
    const severityMap: { [key: string]: string } = {
      high: 'bg-red-500/20 text-red-600 dark:text-red-400',
      medium: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
      low: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
    };
    
    return `${baseClasses} ${severityMap[this.risk.severity] || severityMap['medium']}`;
  }

  get displayText(): string {
    const message = formatRiskMessage(this.risk, this.context);
    if (this.displayMode === 'full') {
      return `<strong>${this.risk.code}</strong>: ${message}`;
    }
    return this.risk.code;
  }

  get tooltipText(): string {
    return formatRiskMessage(this.risk, this.context);
  }
}
