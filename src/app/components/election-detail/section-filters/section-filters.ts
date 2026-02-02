import { Component, EventEmitter, Input, Output, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionTab, SectionFilters } from '../../../models/election.models';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmTooltipDirective } from '../../ui/tooltip-helm/src/lib/hlm-tooltip.directive';
import { ComparisonOperatorInputComponent } from '../../ui/comparison-operator-input/comparison-operator-input';
import { RiskFilterDropdownComponent, RiskCategory } from '../../ui/risk-filter-dropdown/risk-filter-dropdown';
import { SearchFilterComponent } from '../../ui/search-filter/search-filter';

@Component({
  selector: 'app-section-filters',
  standalone: true,
  host: {
    '(document:click)': 'closeAllDropdowns()'
  },
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTooltipDirective,
    ComparisonOperatorInputComponent,
    RiskFilterDropdownComponent,
    SearchFilterComponent,
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

  // Dropdown states
  showSectionTypesDropdown = signal<boolean>(false);
  showQuickFiltersDropdown = signal<boolean>(false);

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

  riskCategories: RiskCategory[] = [
    { code: 'R1', label: 'Аномалии в активността', description: 'R1: Аномалии в активността и улавяне на гласове' },
    { code: 'R2', label: 'Разлика между хартия/машини', description: 'R2: Отклонения в съотношението хартия/машина' },
    { code: 'R3', label: 'Аномалии в невалидни гласове', description: 'R3: Аномалии в невалидните гласове' },
    { code: 'R4', label: 'Волатилност на резултатите', description: 'R4: Волатилност и чувствителност на резултата' },
    { code: 'R5', label: 'Аномалии в преференциите', description: 'R5: Аномалии в участието и активацията на преференции' },
    { code: 'R6', label: 'Концентрация на преференции', description: 'R6: Концентрация и ексклузивност на преференции' }
  ];

  quickFilterTabs = [
    { id: 'all', label: 'Всички', description: 'Показва всички секции в района', icon: 'grid' },
    { id: 'target', label: 'Целеви', description: 'Секции, в които ПП-ДБ е първа политическа сила', icon: 'target' },
    { id: 'swing', label: 'Люлеещи се', description: 'Секции, в които ПП-ДБ е на по-малко от 5% разлика от първия', icon: 'swing' },
    { id: 'outside', label: 'Извън топ 3', description: 'Секции, в които ПП-ДБ е извън челните три места', icon: 'outside' },
    { id: 'dormant', label: 'Спящи', description: 'Секции с висока подкрепа за ПП-ДБ (>30%), но по-ниска активност от средната за областта', icon: 'dormant' },
    { id: 'flip', label: 'За обръщане', description: 'Секции, които могат да бъдат спечелени с малко допълнителни гласове', icon: 'flip' },
    { id: 'vanishing', label: 'Губещи', description: 'Секции, в които ПП-ДБ губи над 40% от гласовете си спрямо предходните избори', icon: 'vanishing' },
    { id: 'declining', label: 'Намаляващи', description: 'Секции, в които гласовете за ПП-ДБ са по-малко от предходните избори', icon: 'declining' }
  ];

  onRiskFilterTypeChange(type: 'any' | 'none' | null): void {
    this.riskFilterType.set(type);
  }

  onSelectedRiskCategoriesChange(categories: Set<string>): void {
    this.selectedRiskCategories.set(categories);
  }

  setTab(tab: SectionTab): void {
    this.activeTab.set(tab);
    this.showQuickFiltersDropdown.set(false);
  }

  selectQuickFilter(tabId: string): void {
    this.setTab(tabId as SectionTab);
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

  getSectionTypesLabel(): string {
    const selected = Array.from(this.sectionTypes());
    if (selected.length === 0) return 'Тип';
    if (selected.length === this.availableSectionTypes.length) return 'Всички типове';
    if (selected.length === 1) {
      const type = this.availableSectionTypes.find(t => t.id === selected[0]);
      return type?.label || 'Тип';
    }
    return `Тип (${selected.length})`;
  }


  getQuickFilterLabel(): string {
    const tab = this.activeTab();
    const tabInfo = this.quickFilterTabs.find(t => t.id === tab);
    return tabInfo?.label || 'Филтри';
  }

  getQuickFilterIcon(): string | null {
    const tab = this.activeTab();
    const tabInfo = this.quickFilterTabs.find(t => t.id === tab);
    return tabInfo?.icon || null;
  }

  getAvailableQuickFilters(): typeof this.quickFilterTabs {
    if (this.date === '2023.04.02') {
      return this.quickFilterTabs.filter(t => t.id !== 'declining');
    }
    return this.quickFilterTabs;
  }

  toggleSectionTypesDropdown(event: Event): void {
    event.stopPropagation();
    this.showSectionTypesDropdown.set(!this.showSectionTypesDropdown());
    this.showQuickFiltersDropdown.set(false);
  }


  toggleQuickFiltersDropdown(event: Event): void {
    event.stopPropagation();
    this.showQuickFiltersDropdown.set(!this.showQuickFiltersDropdown());
    this.showSectionTypesDropdown.set(false);
  }

  closeAllDropdowns(): void {
    this.showSectionTypesDropdown.set(false);
    this.showQuickFiltersDropdown.set(false);
  }
}
