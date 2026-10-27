import { LoadingBarComponent } from '../loading-bar/loading-bar';
import { DOCUMENT } from '@angular/common';
import { Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
import { MapIconComponent } from '../map-icon/map-icon';

@Component({
  selector: 'app-map-actions',
  standalone: true,
  imports: [LoadingBarComponent, MapIconComponent],
  template: `
    <div class="flex justify-end gap-2">
      <button type="button" class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background/95 text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
        [disabled]="exporting" [attr.aria-busy]="exporting" [attr.aria-label]="exporting ? 'Подготовка на PNG...' : 'Изтегли картата като PNG'"
        [title]="exporting ? 'Подготовка на PNG...' : 'Изтегли картата като PNG'" (click)="exportClick.emit()">
        <app-loading-bar #exportProgress [loading]="exporting" label="Експортиране на картата" class="w-6" />
        @if (!exportProgress.visible()) { <app-map-icon name="download" /> }
      </button>
      <button type="button" class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background/95 text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        [attr.aria-label]="fullscreen ? 'Изход от цял екран' : 'Покажи картата на цял екран'"
        [title]="fullscreen ? 'Изход от цял екран' : 'Покажи картата на цял екран'" (click)="fullscreenClick.emit()">
        <app-map-icon name="fullscreen" />
      </button>
    </div>
  `,
})
export class MapActionsComponent {
  @Input() exporting = false;
  @Output() exportClick = new EventEmitter<void>();
  @Output() fullscreenClick = new EventEmitter<void>();
  private readonly document = inject(DOCUMENT);
  fullscreen = Boolean(this.document.fullscreenElement);

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.fullscreen = Boolean(this.document.fullscreenElement);
  }
}
