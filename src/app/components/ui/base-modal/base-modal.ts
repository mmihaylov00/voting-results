import { Component, ElementRef, EventEmitter, Injector, Input, Output, TemplateRef, ContentChild, afterNextRender, computed, effect, inject, input, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params } from '@angular/router';
import { ModalPageService } from '../../../services/modal-page.service';
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
})
export class BaseModalComponent {
  private static nextId = 0;
  private readonly pages = inject(ModalPageService);
  private readonly injector = inject(Injector);
  private readonly content = viewChild<TemplateRef<unknown>>('modalContent');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('modalDialog');
  readonly headingId = `modal-heading-${++BaseModalComponent.nextId}`;
  readonly pageId = input('');
  readonly pageQueryParams = input<Params>({});
  readonly pageRoute = input<string[]>([]);
  readonly isPage = computed(() => this.pages.isPage(this.pageId()));
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() maxWidth: string = '';
  @Input() zIndex: string = 'z-[1200]';
  @Output() close = new EventEmitter<void>();

  @ContentChild('headerActions') headerActions?: TemplateRef<unknown>;
  @ContentChild('headerImage') headerImage?: TemplateRef<unknown>;
  @ContentChild('footer') footer?: TemplateRef<unknown>;

  constructor() {
    effect(onCleanup => {
      const content = this.content();
      if (this.isPage() && content) {
        this.pages.attach(this, this.pageId(), content);
        afterNextRender(() => document.getElementById(this.headingId)?.focus(), { injector: this.injector });
      }
      onCleanup(() => this.pages.detach(this));
    });
    effect(onCleanup => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
      onCleanup(() => { if (dialog.open) dialog.close?.(); });
    });
  }

  expand(): void {
    void this.pages.open(this.pageId(), { ...this.pageQueryParams(), dialogMode: null }, this.pageRoute());
  }

  collapse(): void {
    this.pages.collapse(this.pageId());
  }

  closeModal(): void {
    this.pages.close(this.pageId());
    this.close.emit();
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.closeModal();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeModal();
  }
}
