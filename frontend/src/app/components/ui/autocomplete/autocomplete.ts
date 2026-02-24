import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../input-helm/src/lib/hlm-input.directive';

export type AutocompleteOption = {
  id: string;
  label: string;
  description?: string;
};

@Component({
  selector: 'app-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule, HlmInputDirective, HlmButtonDirective],
  templateUrl: './autocomplete.html',
  host: {
    '(document:click)': 'onDocumentClick($event)'
  }
})
export class AutocompleteComponent implements OnChanges, OnDestroy {
  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @Input() placeholder = '';
  @Input() required = false;
  @Input() selectedId = '';
  @Input() options: AutocompleteOption[] = [];
  @Input() inputName = '';
  @Output() selectedIdChange = new EventEmitter<string>();

  inputValue = '';
  open = signal(false);
  private isDestroyed = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedId']) {
      this.syncInputFromSelection();
      return;
    }
    if (changes['options'] && this.selectedId) {
      this.syncInputFromSelection();
    }
  }

  get filteredOptions(): AutocompleteOption[] {
    const term = this.inputValue.trim().toLowerCase();
    if (!term) return this.options;
    return this.options.filter((o) =>
      o.label.toLowerCase().includes(term)
      || (o.description || '').toLowerCase().includes(term),
    );
  }

  onInputClick(event: Event): void {
    event.stopPropagation();
    this.open.update((isOpen) => !isOpen);
  }

  onInputChange(value: string): void {
    this.inputValue = value;
    this.open.set(true);
    const matched = this.options.find((o) => o.label === value);
    this.emitSelectedId(matched?.id || '');
  }

  selectOption(option: AutocompleteOption): void {
    this.inputValue = option.label;
    this.emitSelectedId(option.id);
    this.open.set(false);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.inputValue = '';
    this.emitSelectedId('');
    this.open.set(true);
  }

  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }

  private syncInputFromSelection(): void {
    const selected = this.options.find((option) => option.id === this.selectedId);
    this.inputValue = selected?.label || '';
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
  }

  private emitSelectedId(value: string): void {
    if (this.isDestroyed) {
      return;
    }
    this.selectedIdChange.emit(value);
  }
}
