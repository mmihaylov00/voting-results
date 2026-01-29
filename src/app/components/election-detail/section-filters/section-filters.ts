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
  highRiskOnly = signal<boolean>(false);

  availableSectionTypes = [
    { id: 'City', label: 'Град' },
    { id: 'Village', label: 'Село' },
    { id: 'Abroad', label: 'Чужбина' },
    { id: 'Mobile', label: 'Подвижна' },
    { id: 'Hospital', label: 'Болница' },
    { id: 'Prison', label: 'Затвор' }
  ];

  ngOnInit() {
    if (this.initialFilters) {
      this.searchTerm.set(this.initialFilters.searchTerm || '');
      this.activeTab.set(this.initialFilters.activeTab || 'all');
      this.activityOperator.set(this.initialFilters.activityOperator || 'lte');
      this.lowActivityThreshold.set(this.initialFilters.lowActivityThreshold !== undefined ? this.initialFilters.lowActivityThreshold : 100);
      this.sectionTypes.set(this.initialFilters.sectionTypes || new Set());
      this.highRiskOnly.set(this.initialFilters.highRiskOnly || false);
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
        highRiskOnly: this.highRiskOnly()
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

  toggleHighRiskOnly(): void {
    this.highRiskOnly.set(!this.highRiskOnly());
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
