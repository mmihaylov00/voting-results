import { ChangeDetectionStrategy, Component, OnDestroy, input, signal } from '@angular/core';
import { BaseModalComponent } from '../base-modal/base-modal';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../map-icon/map-icon';

@Component({
  selector: 'app-image-export',
  imports: [BaseModalComponent, HlmButtonDirective, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button hlmBtn variant="outline" size="sm" type="button" class="export-trigger gap-1.5 bg-background/95"
      aria-haspopup="dialog" [attr.aria-expanded]="opened()" [attr.aria-label]="'Експорт като PNG: ' + title()"
      title="Експорт като PNG" (click)="open()"><app-map-icon name="download" /><span>PNG</span></button>
    @if (opened()) {
      <app-base-modal title="Експорт като PNG" [subtitle]="title()" maxWidth="max-w-5xl" (close)="close()">
        @if (loading()) {<p class="py-8 text-sm text-muted-foreground" role="status">Подготовка на изображението…</p>}
        @if (error()) {
          <div class="py-4"><p class="text-sm text-destructive" role="alert">{{ error() }}</p>
            <button hlmBtn variant="outline" size="sm" type="button" class="mt-3 gap-2" (click)="generateImage()"><app-map-icon name="reset" />Опитайте отново</button></div>
        }
        @if (previewUrl()) {<div class="image-preview"><img [src]="previewUrl()" [alt]="title() + ' - PNG преглед'" /></div>}
        @if (!clipboardSupported()) {<p class="mt-3 text-xs text-muted-foreground">Копирането на изображения не се поддържа в този браузър. Използвайте изтеглянето.</p>}
        @if (copyError()) {<p class="mt-3 text-sm text-destructive" role="alert">{{ copyError() }}</p>}
        <ng-template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <button hlmBtn variant="outline" type="button" class="gap-2" [disabled]="!previewUrl() || copying() || !clipboardSupported()" (click)="copy()">
              @if (copied()) {<app-map-icon name="check" />} @else {<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>}
              {{ copying() ? 'Копиране…' : copied() ? 'Копирано' : 'Копирай изображението' }}
            </button>
            <button hlmBtn type="button" class="gap-2" [disabled]="!previewUrl()" (click)="download()"><app-map-icon name="download" />Изтегли PNG</button>
          </div>
          <span class="sr-only" role="status" aria-live="polite">{{ copied() ? 'Изображението е копирано.' : '' }}</span>
        </ng-template>
      </app-base-modal>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    button { min-height: 44px; }
    .image-preview { max-height: 65dvh; overflow: auto; border: 1px solid hsl(var(--border)); border-radius: .35rem; background: hsl(var(--muted)); }
    .image-preview img { display: block; width: 100%; height: auto; }
  `,
})
export class ImageExportComponent implements OnDestroy {
  readonly createImage = input.required<() => Promise<Blob>>();
  readonly title = input('Изображение');
  readonly filename = input('election-chart.png');
  readonly opened = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly previewUrl = signal('');
  readonly copying = signal(false);
  readonly copied = signal(false);
  readonly copyError = signal('');
  private image: Blob | null = null;
  private generation = 0;

  clipboardSupported(): boolean {
    return window.isSecureContext !== false && typeof navigator.clipboard?.write === 'function'
      && typeof ClipboardItem !== 'undefined' && ClipboardItem.supports?.('image/png') !== false;
  }

  async open(): Promise<void> {
    if (this.opened()) return;
    this.opened.set(true);
    await this.generateImage();
  }

  async generateImage(): Promise<void> {
    const generation = ++this.generation;
    this.clearImage();
    this.loading.set(true);
    this.error.set('');
    this.copyError.set('');
    this.copied.set(false);
    try {
      const image = await this.createImage()();
      if (generation !== this.generation || !this.opened()) return;
      if (image.type !== 'image/png' || !image.size) throw new Error('Не е получено валидно PNG изображение.');
      this.image = image;
      this.previewUrl.set(URL.createObjectURL(image));
    } catch (error) {
      if (generation === this.generation && this.opened()) {
        this.error.set(error instanceof Error ? error.message : 'Изображението не можа да бъде създадено.');
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async copy(): Promise<void> {
    if (!this.image || !this.clipboardSupported() || this.copying()) return;
    const generation = this.generation;
    this.copying.set(true);
    this.copied.set(false);
    this.copyError.set('');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.image })]);
      if (generation === this.generation && this.opened()) this.copied.set(true);
    } catch {
      if (generation === this.generation && this.opened()) this.copyError.set('Копирането е блокирано от браузъра. Използвайте „Изтегли PNG“.');
    } finally {
      if (generation === this.generation) this.copying.set(false);
    }
  }

  download(): void {
    if (!this.previewUrl()) return;
    const link = document.createElement('a');
    link.href = this.previewUrl();
    link.download = this.filename();
    try { link.click(); }
    catch { this.copyError.set('Файлът не може да бъде изтеглен. Опитайте отново.'); }
  }

  close(): void {
    ++this.generation;
    this.opened.set(false);
    this.loading.set(false);
    this.copying.set(false);
    this.clearImage();
  }

  ngOnDestroy(): void { this.close(); }

  private clearImage(): void {
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
    this.previewUrl.set('');
    this.image = null;
  }
}
