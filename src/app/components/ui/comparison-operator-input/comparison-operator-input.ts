import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../input-helm/src/lib/hlm-input.directive';
import { HlmTooltipDirective } from '../tooltip-helm/src/lib/hlm-tooltip.directive';

@Component({
  selector: 'app-comparison-operator-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmTooltipDirective,
  ],
  templateUrl: './comparison-operator-input.html',
})
export class ComparisonOperatorInputComponent {
  @Input() operator: 'lte' | 'gte' = 'lte';
  @Input() value: number | null = null;
  @Input() placeholder: string = '0';
  @Input() min: number = 0;
  @Input() max: number = 100;
  @Input() step: number | string = 0.01;
  @Input() suffix: string | undefined;
  @Input() label: string = 'Активност';
  @Output() operatorChange = new EventEmitter<'lte' | 'gte'>();
  @Output() valueChange = new EventEmitter<number | null>();

  get operatorSymbol(): string {
    return this.operator === 'lte' ? '≤' : '≥';
  }

  get tooltipText(): string {
    return this.operator === 'lte'
      ? 'Превключи към по-голямо или равно'
      : 'Превключи към по-малко или равно';
  }

  toggleOperator(): void {
    const newOperator = this.operator === 'lte' ? 'gte' : 'lte';
    this.operatorChange.emit(newOperator);
  }

  onValueChange(newValue: number | null): void {
    this.valueChange.emit(newValue);
  }
}
