import { Component, Input, Output, EventEmitter, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';

export interface RiskCategory {
  code: string;
  label: string;
  description?: string;
}

@Component({
  selector: 'app-risk-filter-dropdown',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
  ],
  templateUrl: './risk-filter-dropdown.html',
  host: {
    '(document:click)': 'closeDropdown()'
  }
})
export class RiskFilterDropdownComponent {
  @Input() riskCategories: RiskCategory[] = [];
  @Input() riskFilterType: 'any' | 'none' | null = null;
  @Input() selectedRiskCategories: Set<string> = new Set();
  @Input() radioName: string = 'riskType'; // Unique name for radio buttons to avoid conflicts

  @Output() riskFilterTypeChange = new EventEmitter<'any' | 'none' | null>();
  @Output() selectedRiskCategoriesChange = new EventEmitter<Set<string>>();

  showDropdown = signal<boolean>(false);

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.showDropdown.set(!this.showDropdown());
  }

  closeDropdown(): void {
    this.showDropdown.set(false);
  }

  toggleRiskFilterType(type: 'any' | 'none'): void {
    // If clicking the same type, deselect it
    if (this.riskFilterType === type) {
      this.riskFilterTypeChange.emit(null);
    } else {
      // Otherwise, select the new type (this automatically deselects the other)
      this.riskFilterTypeChange.emit(type);
      // Clear R code selections when selecting any/none
      this.selectedRiskCategoriesChange.emit(new Set());
    }
    // Close dropdown after selection
    this.showDropdown.set(false);
  }

  clearRiskFilter(): void {
    this.riskFilterTypeChange.emit(null);
    this.selectedRiskCategoriesChange.emit(new Set());
    this.showDropdown.set(false);
  }

  toggleRiskCategory(category: string): void {
    const newSet = new Set(this.selectedRiskCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    this.selectedRiskCategoriesChange.emit(newSet);
    // Clear any/none selection when selecting specific R codes
    if (newSet.size > 0) {
      this.riskFilterTypeChange.emit(null);
    }
  }

  getRiskLabel(): string {
    const type = this.riskFilterType;
    const selectedCategories = Array.from(this.selectedRiskCategories);

    if (type === 'any') return 'Рискови';
    if (type === 'none') return 'Безрискови';
    if (selectedCategories.length > 0) {
      if (selectedCategories.length === this.riskCategories.length) return 'Всички категории';
      return `Категории (${selectedCategories.length})`;
    }
    return 'Рискове';
  }

  hasActiveFilter(): boolean {
    return this.riskFilterType !== null || this.selectedRiskCategories.size > 0;
  }
}
