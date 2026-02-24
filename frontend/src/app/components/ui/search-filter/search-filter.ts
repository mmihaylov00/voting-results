import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmInputDirective } from '../input-helm/src/lib/hlm-input.directive';

@Component({
  selector: 'app-search-filter',
  standalone: true,
  imports: [CommonModule, HlmInputDirective],
  templateUrl: './search-filter.html'
})
export class SearchFilterComponent {
  @Input() placeholder: string = 'Търсене...';
  @Input() value: string = '';
  @Input() inputClass: string = '';
  @Input() containerClass: string = '';
  @Input() iconClass: string = '';
  @Input() inputId?: string;

  @Output() valueChange = new EventEmitter<string>();

  onInput(value: string): void {
    this.valueChange.emit(value);
  }
}
