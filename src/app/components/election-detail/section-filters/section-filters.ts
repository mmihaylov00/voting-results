import { Component, EventEmitter, Input, Output, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionTab, SectionFilters } from '../../../models/election.models';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmTooltipDirective } from '../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';

@Component({
  selector: 'app-section-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmTooltipDirective,
  ],
  templateUrl: './section-filters.html',
})
export class SectionFiltersComponent implements OnInit {
  @Input() initialFilters?: SectionFilters;
  @Input() showIcons: boolean = true;
  @Input() date: string = '';
  @Input() fullWidth: boolean = false;

  @Output() filterChange = new EventEmitter<SectionFilters>();

  searchTerm = signal<string>('');
  activeTab = signal<SectionTab>('all');
  activityOperator = signal<'lte' | 'gte'>('lte');
  lowActivityThreshold = signal<number | null>(100);
  sectionTypes = signal<Set<string>>(new Set());
  riskFilterType = signal<'any' | 'none' | null>(null);
  selectedRiskCategories = signal<Set<string>>(new Set());

  availableSectionTypes = [
    { id: 'City', label: 'Град' },
    { id: 'Village', label: 'Село' },
    { id: 'Other', label: 'Други' },
    { id: 'Mobile', label: 'Подвижна' },
  ];

  ngOnInit() {
    if (this.initialFilters) {
      this.searchTerm.set(this.initialFilters.searchTerm || '');
      this.activeTab.set(this.initialFilters.activeTab || 'all');
      this.activityOperator.set(this.initialFilters.activityOperator || 'lte');
      this.lowActivityThreshold.set(this.initialFilters.lowActivityThreshold !== undefined ? this.initialFilters.lowActivityThreshold : 100);
      this.sectionTypes.set(this.initialFilters.sectionTypes || new Set());
      this.riskFilterType.set(this.initialFilters.riskFilterType || null);
      this.selectedRiskCategories.set(this.initialFilters.selectedRiskCategories || new Set());
    }
  }

  constructor() {
    effect(() => {
      this.filterChange.emit({
        searchTerm: this.searchTerm(),
        activeTab: this.activeTab(),
        activityOperator: this.activityOperator(),
        lowActivityThreshold: this.lowActivityThreshold(),
        sectionTypes: this.sectionTypes(),
        riskFilterType: this.riskFilterType(),
        selectedRiskCategories: this.selectedRiskCategories()
      });
    });
  }

  toggleSectionType(typeId: string): void {
    const newSet = new Set(this.sectionTypes());
    if (newSet.has(typeId)) {
      newSet.delete(typeId);
    } else {
      newSet.add(typeId);
    }
    this.sectionTypes.set(newSet);
  }

  riskCategories = [
    { code: 'R1', label: 'R1', description: 'R1: Аномалии в активността и улавяне на гласове' },
    { code: 'R2', label: 'R2', description: 'R2: Отклонения в съотношението хартия/машина' },
    { code: 'R3', label: 'R3', description: 'R3: Аномалии в невалидните гласове' },
    { code: 'R4', label: 'R4', description: 'R4: Волатилност и чувствителност на резултата' }
  ];

  toggleRiskFilterType(type: 'any' | 'none'): void {
    // If clicking the same type, deselect it
    if (this.riskFilterType() === type) {
      this.riskFilterType.set(null);
    } else {
      // Otherwise, select the new type (this automatically deselects the other)
      this.riskFilterType.set(type);
      // Clear R code selections when selecting any/none
      this.selectedRiskCategories.set(new Set());
    }
  }

  toggleRiskCategory(category: string): void {
    const newSet = new Set(this.selectedRiskCategories());
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    this.selectedRiskCategories.set(newSet);
    // Clear any/none selection when selecting specific R codes
    if (newSet.size > 0) {
      this.riskFilterType.set(null);
    }
  }

  setTab(tab: SectionTab): void {
    this.activeTab.set(tab);
  }

  toggleActivityOperator(): void {
    this.activityOperator.set(this.activityOperator() === 'lte' ? 'gte' : 'lte');
  }

  onSearchTermChange(term: string) {
    this.searchTerm.set(term);
  }

  onThresholdChange(val: number | null) {
    this.lowActivityThreshold.set(val);
  }
}
