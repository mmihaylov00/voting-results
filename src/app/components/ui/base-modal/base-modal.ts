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
  @Input() maxWidth: string = 'max-w-6xl';
  @Input() showCloseButton: boolean = true;
  @Input() zIndex: string = 'z-[100]';
  @Output() close = new EventEmitter<void>();

  @ContentChild('headerActions') headerActions?: TemplateRef<any>;
  @ContentChild('footer') footer?: TemplateRef<any>;

  closeModal(): void {
    this.close.emit();
  }
}
