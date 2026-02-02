import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RiskBadgeComponent } from '../risk-badge/risk-badge';

export interface RiskAnalysisData {
  riskScore?: number;
  riskIndicators?: Array<{
    code: string;
    category: string;
    severity: string;
    message: string;
    details?: any;
  }>;
}

@Component({
  selector: 'app-risk-analysis-summary',
  standalone: true,
  imports: [
    CommonModule,
  ],
  templateUrl: './risk-analysis-summary.html',
})
export class RiskAnalysisSummaryComponent {
  @Input() riskData?: RiskAnalysisData;

  get hasRisks(): boolean {
    return !!(
      (this.riskData?.riskIndicators && this.riskData.riskIndicators.length > 0)
    );
  }

  getSeverityColor(severity: string): string {
    const colorMap: { [key: string]: string } = {
      high: 'bg-red-600',
      medium: 'bg-orange-500',
      low: 'bg-yellow-500'
    };
    return colorMap[severity] || colorMap['medium'];
  }

  getCategoryCode(code: string): string {
    const parts = code.split('.');
    if (parts.length > 1) {
      return `${parts[0]}.${parts[1]}`;
    }
    return code;
  }
}
