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
import { RiskAnalysisSummaryComponent } from '../../../ui/risk-analysis-summary/risk-analysis-summary';
import { SortableTableHeaderComponent } from '../../../ui/sortable-table-header/sortable-table-header';
import { sortArray, getDefaultSortDirection } from '../../../../utils/table-sort.util';
import { ComparativeValue } from '../../../../models/election.models';
import { ElectionService } from '../../../../services/election';

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
  risks?: Array<{ code: string; category: string; severity: string; details?: any }>;
  comparisons?: ComparativeValue[];
  paperComparisons?: ComparativeValue[];
  machineComparisons?: ComparativeValue[];
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
    HlmTooltipDirective,
    BaseModalComponent,
    RiskBadgeComponent,
    RiskAnalysisSummaryComponent,
    SortableTableHeaderComponent,
  ],
  templateUrl: './candidate-detail-modal.html'
})
export class CandidateDetailModalComponent implements OnInit {
  @Input({ required: true }) candidate!: RegionCandidate;
  @Input({ required: true }) sections: Section[] = [];
  @Input() currentDate: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() openSection = new EventEmitter<Section>();

  sectionData: CandidateSectionData[] = [];
  allData: { [date: string]: { sections: Section[], parties: { [id: string]: string }, regions: any[] } } = {};

  sortColumn: keyof CandidateSectionData = 'total';
  sortDir: 'asc' | 'desc' = 'desc';

  constructor(private electionService: ElectionService) {}

  get partiesById(): { [id: string]: string } {
    return this.allData[this.currentDate]?.parties || {};
  }

  ngOnInit(): void {
    // Load all election data for comparisons
    this.electionService.getAllData().subscribe(data => {
      this.allData = data;
      this.calculateSectionData();
    });
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
      // Filter by both candidateId/partyId AND sectionId to show only section-specific risks
      // Exclude R6.2 and R2.4 since they are region-level risks (same for all sections)
      const risksToCheck = (section as any).candidateRiskIndicators || section.riskIndicators;
      const candidateRisks = risksToCheck?.filter((risk: any) => {
        if (!risk.details) return false;
        
        // Exclude R6.2 and R2.4 - these are region-level risks, not section-specific
        if (risk.code === 'R6.2' || risk.code === 'R2.4') {
          return false;
        }
        
        // Check if this risk is for this candidate
        if (risk.details.candidateId) {
          const riskCandidateId = String(risk.details.candidateId);
          const candidateId = String(this.candidate.candidateId);
          const partyIdMatches = risk.details.partyId 
            ? risk.details.partyId === this.candidate.partyId 
            : true;
          
          // Also check if the risk is for this specific section
          const sectionIdMatches = risk.details.sectionId 
            ? risk.details.sectionId === section.sectionId 
            : true;
          
          return riskCandidateId === candidateId && partyIdMatches && sectionIdMatches;
        }
        
        // If no candidateId, it's a section-level risk - include it
        return true;
      }) || [];
      
      // Also include section-level risks (not candidate-specific)
      const sectionRisks = section.riskIndicators?.filter((risk: any) => {
        // Exclude candidate-specific risks (they have candidateId in details)
        // Also exclude R6.2 and R2.4
        if (risk.code === 'R6.2' || risk.code === 'R2.4') {
          return false;
        }
        return !risk.details || !risk.details.candidateId;
      }) || [];
      
      // Combine candidate-specific risks for this section and section-level risks
      const allRisks = [...candidateRisks, ...sectionRisks];

      // Calculate comparisons for this candidate in this section
      const comparisons = this.calculateCandidateComparisons(section.sectionId, candidateVotes);

      const sectionDataItem: CandidateSectionData = {
        sectionId: section.sectionId,
        cityName: section.cityName,
        sectionName: section.sectionName,
        paper: candidateVotes.paper,
        machine: candidateVotes.machine,
        total: candidateVotes.total,
        percentInSection,
        partyPercentInSection,
        section,
        risks: allRisks
      };
      
      if (comparisons.total) {
        sectionDataItem.comparisons = comparisons.total;
      }
      if (comparisons.paper) {
        sectionDataItem.paperComparisons = comparisons.paper;
      }
      if (comparisons.machine) {
        sectionDataItem.machineComparisons = comparisons.machine;
      }
      
      data.push(sectionDataItem);
    });

    this.sectionData = data;
    this.sortSectionData(this.sortColumn, true);
  }

  toggleSort(column: string): void {
    const typedColumn = column as keyof CandidateSectionData;
    if (this.sortColumn === typedColumn) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = typedColumn;
      const isStringColumn = ['sectionId', 'cityName', 'sectionName'].includes(column);
      this.sortDir = getDefaultSortDirection(column, isStringColumn);
    }
    this.sortSectionData(this.sortColumn, true);
  }

  sortSectionData(column: keyof CandidateSectionData, preserveDir: boolean = false): void {
    if (!preserveDir) {
      this.sortDir = this.sortColumn === column && this.sortDir === 'asc' ? 'desc' : 'asc';
    }
    this.sortColumn = column;

    const sorted = sortArray(this.sectionData, this.sortColumn, this.sortDir);
    this.sectionData.length = 0;
    this.sectionData.push(...sorted);
  }

  calculateCandidateComparisons(sectionId: string, candidateVotes: any): { total?: ComparativeValue[], paper?: ComparativeValue[], machine?: ComparativeValue[] } {
    const dates = this.electionService.getDates();
    const comparisons: ComparativeValue[] = [];
    const paperComparisons: ComparativeValue[] = [];
    const machineComparisons: ComparativeValue[] = [];

    dates.forEach(dateInfo => {
      if (dateInfo.date === this.currentDate) return; // Skip current date

      const otherDateData = this.allData[dateInfo.date];
      if (!otherDateData || !otherDateData.sections) return;

      // Find the same section in other election
      const otherSection = otherDateData.sections.find((s: Section) => s.sectionId === sectionId);
      if (!otherSection || !otherSection.candidateVotes) return;

      // Find candidate by matching name and party
      let foundTotal = 0;
      let foundPaper = 0;
      let foundMachine = 0;

      Object.values(otherSection.candidateVotes).forEach((otherCandidate: any) => {
        const nameMatches = otherCandidate.candidateName.trim().toLowerCase() === this.candidate.candidateName.trim().toLowerCase();
        const partyMatches = otherCandidate.partyName.trim().toLowerCase() === this.candidate.partyName.trim().toLowerCase();
        
        if (nameMatches && partyMatches) {
          foundTotal = otherCandidate.total;
          foundPaper = otherCandidate.paper;
          foundMachine = otherCandidate.machine;
        }
      });

      if (foundTotal > 0) {
        comparisons.push({ v: foundTotal, d: dateInfo.date });
        paperComparisons.push({ v: foundPaper, d: dateInfo.date });
        machineComparisons.push({ v: foundMachine, d: dateInfo.date });
      }
    });

    return {
      total: comparisons.length > 0 ? comparisons : undefined,
      paper: paperComparisons.length > 0 ? paperComparisons : undefined,
      machine: machineComparisons.length > 0 ? machineComparisons : undefined
    };
  }

  onRowClick(sectionData: CandidateSectionData): void {
    this.openSection.emit(sectionData.section);
  }

  closeModal(): void {
    this.close.emit();
  }
}
