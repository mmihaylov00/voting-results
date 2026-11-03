import { Directive, computed, input } from '@angular/core';

@Directive({
  selector: '[appSignedChange]',
  standalone: true,
  host: { '[attr.data-change]': 'direction()', '[class]': 'colors()' },
})
export class SignedChangeDirective {
  readonly appSignedChange = input<number | null | undefined>();
  readonly direction = computed(() => {
    const value = this.appSignedChange();
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'missing';
    return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  });
  readonly colors = computed(() => {
    switch (this.direction()) {
      case 'up': return 'text-emerald-700 dark:text-emerald-400';
      case 'down': return 'text-rose-700 dark:text-rose-400';
      default: return '';
    }
  });
}
