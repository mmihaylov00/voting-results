import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RiskBadgeComponent } from '../risk-badge/risk-badge';
import { formatRiskMessage, RiskContext } from '../../../utils/risk-message.util';

export interface RiskAnalysisData {
  riskScore?: number;
  riskIndicators?: Array<{
    code: string;
    category: string;
    severity: string;
    details?: any;
  }>;
}

@Component({
  selector: 'app-risk-analysis-summary',
  standalone: true,
  imports: [
    CommonModule,
    RiskBadgeComponent,
  ],
  templateUrl: './risk-analysis-summary.html',
})
export class RiskAnalysisSummaryComponent {
  @Input() riskData?: RiskAnalysisData;
  @Input() context?: RiskContext;

  get hasRisks(): boolean {
    return !!(
      (this.riskData?.riskIndicators && this.riskData.riskIndicators.length > 0)
    );
  }

  getMessage(indicator: { code: string; details?: any }): string {
    return formatRiskMessage(indicator, this.context);
  }
}
