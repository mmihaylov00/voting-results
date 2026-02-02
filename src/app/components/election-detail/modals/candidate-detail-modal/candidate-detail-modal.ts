import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Section, RegionCandidate } from '../../../../models/election.models';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../../ui/table-helm/src/lib/hlm-table.directives';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmTooltipDirective } from '../../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { BaseModalComponent } from '../../../ui/base-modal/base-modal';
import { RiskBadgeComponent } from '../../../ui/risk-badge/risk-badge';

export interface CandidateSectionData {
  sectionId: string;
  cityName: string;
  sectionName: string;
  paper: number;
  machine: number;
  total: number;
  percentInSection: number;
  partyPercentInSection: number;
  section: Section; // Keep reference to section for opening detail modal
  risks?: Array<{ code: string; category: string; severity: string; message: string }>;
}

@Component({
  selector: 'app-candidate-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
    BaseModalComponent,
    RiskBadgeComponent,
  ],
  templateUrl: './candidate-detail-modal.html'
})
export class CandidateDetailModalComponent implements OnInit {
  @Input({ required: true }) candidate!: RegionCandidate;
  @Input({ required: true }) sections: Section[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() openSection = new EventEmitter<Section>();

  sectionData: CandidateSectionData[] = [];

  ngOnInit(): void {
    this.calculateSectionData();
  }

  calculateSectionData(): void {
    const data: CandidateSectionData[] = [];

    this.sections.forEach(section => {
      if (!section.candidateVotes) return;

      // Find candidate votes for this candidate in this section
      const candidateKey = `${this.candidate.partyId}_${this.candidate.candidateId}`;
      const candidateVotes = section.candidateVotes[candidateKey];

      if (!candidateVotes || candidateVotes.total === 0) return;

      // Get party votes for this section
      const partyVotes = section.partyVotes[this.candidate.partyId];
      const partyTotal = partyVotes?.total || 0;

      // Calculate percentages
      const sectionVoted = section.voted || 0;
      const percentInSection = sectionVoted > 0 ? (candidateVotes.total / sectionVoted) * 100 : 0;
      const partyPercentInSection = sectionVoted > 0 ? (partyTotal / sectionVoted) * 100 : 0;

      // Get risks for this candidate in this section
      // Use candidateRiskIndicators if available (includes R6.2), otherwise use riskIndicators
      const risksToCheck = (section as any).candidateRiskIndicators || section.riskIndicators;
      const candidateRisks = risksToCheck?.filter((risk: any) => {
        if (!risk.details || !risk.details.candidateId) return false;
        const riskCandidateId = String(risk.details.candidateId);
        const candidateId = String(this.candidate.candidateId);
        const partyIdMatches = risk.details.partyId 
          ? risk.details.partyId === this.candidate.partyId 
          : true;
        return riskCandidateId === candidateId && partyIdMatches;
      }) || [];

      data.push({
        sectionId: section.sectionId,
        cityName: section.cityName,
        sectionName: section.sectionName,
        paper: candidateVotes.paper,
        machine: candidateVotes.machine,
        total: candidateVotes.total,
        percentInSection,
        partyPercentInSection,
        section,
        risks: candidateRisks
      });
    });

    // Sort by total votes descending
    this.sectionData = data.sort((a, b) => b.total - a.total);
  }

  onRowClick(sectionData: CandidateSectionData): void {
    this.openSection.emit(sectionData.section);
  }

  closeModal(): void {
    this.close.emit();
  }
}
