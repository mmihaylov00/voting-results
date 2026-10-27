import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { ButtonVariants, HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';
import { MapIconComponent } from '../map-icon/map-icon';

@Component({
  selector: 'app-share-button',
  standalone: true,
  imports: [HlmButtonDirective, MapIconComponent],
  template: `
    <button hlmBtn variant="outline" [size]="size()" type="button" [disabled]="pending()" [attr.aria-busy]="pending()"
      [class]="copied()
        ? 'min-w-32 gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-950 dark:hover:text-emerald-300'
        : 'min-w-32 gap-2'" (click)="share()">
      <app-map-icon [name]="copied() ? 'square-check' : 'share'" />
      <span aria-live="polite">{{ copied() ? 'Копирано' : 'Сподели' }}</span>
    </button>
  `,
  styles: ':host { display: inline-flex; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButtonComponent {
  private readonly destroyRef = inject(DestroyRef);
  private resetTimer?: ReturnType<typeof setTimeout>;
  readonly action = input.required<() => Promise<boolean>>();
  readonly size = input<ButtonVariants['size']>('default');
  readonly copied = signal(false);
  readonly pending = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.resetTimer));
  }

  async share(): Promise<void> {
    if (this.pending()) return;
    clearTimeout(this.resetTimer);
    this.copied.set(false);
    this.pending.set(true);
    try {
      const copied = await this.action()();
      if (copied && !this.destroyRef.destroyed) {
        this.copied.set(true);
        this.resetTimer = setTimeout(() => this.copied.set(false), 1500);
      }
    } finally {
      if (!this.destroyRef.destroyed) this.pending.set(false);
    }
  }
}
