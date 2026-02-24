import { Component, EventEmitter, Input, Output, TemplateRef, ContentChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { HlmTypographyDirective } from '../typography-helm/src/lib/hlm-typography.directive';

@Component({
  selector: 'app-base-modal',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmTypographyDirective,
  ],
  templateUrl: './base-modal.html',
  host: {
    '(document:keydown.escape)': 'close.emit()'
  }
})
export class BaseModalComponent {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() zIndex: string = 'z-[100]';
  @Input() size: 'full' | 'half' = 'full';
  @Output() close = new EventEmitter<void>();

  @ContentChild('headerActions') headerActions?: TemplateRef<any>;
  @ContentChild('footer') footer?: TemplateRef<any>;

  closeModal(): void {
    this.close.emit();
  }

  get panelClass(): string {
    const base = 'bg-background w-full h-full sm:h-auto sm:max-h-[90vh] sm:rounded-lg shadow-xl flex flex-col';
    if (this.size === 'half') {
      return `${base} sm:w-[min(90vw,56rem)]`;
    }
    return base;
  }
}
