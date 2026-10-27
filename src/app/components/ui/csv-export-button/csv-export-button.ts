import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../map-icon/map-icon';

@Component({
  selector: 'app-csv-export-button',
  standalone: true,
  imports: [HlmButtonDirective, MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button hlmBtn variant="outline" type="button" class="gap-2" [disabled]="disabled() || pending()"
      [attr.aria-busy]="pending()" title="Експорт CSV" (click)="export()">
      <app-map-icon name="download-table" />
      Експорт CSV
    </button>
    @if (error()) { <p role="alert" class="mt-2 max-w-sm text-sm text-destructive">{{ error() }}</p> }
  `,
  styles: ':host { display: inline-flex; min-width: 0; flex-direction: column; align-items: flex-start; }',
})
export class CsvExportButtonComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly action = input.required<() => void | Promise<void>>();
  readonly disabled = input(false);
  readonly exported = output<void>();
  readonly pending = signal(false);
  readonly error = signal('');

  async export(): Promise<void> {
    if (this.disabled() || this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      await this.action()();
      if (!this.destroyRef.destroyed) this.exported.emit();
    } catch {
      if (!this.destroyRef.destroyed) this.error.set('Файлът не може да бъде изтеглен. Опитайте отново.');
    } finally {
      if (!this.destroyRef.destroyed) this.pending.set(false);
    }
  }
}
