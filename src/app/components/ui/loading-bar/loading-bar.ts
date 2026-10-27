import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "visible() ? appearance() === 'inline' ? 'block' : 'flex' : 'none'",
    '[class.loading-overlay]': "appearance() !== 'inline'",
    '[class.loading-contained]': "appearance() === 'contained'",
  },
  template: `
    @if (visible()) {
      <div class="loading-track" role="progressbar" [attr.aria-label]="label()"
        aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percentage()">
        @for (run of [cycle()]; track run.id) {
          <div class="loading-fill" [style.transform]="'scaleX(' + value() / 100 + ')'"></div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    :host(.loading-overlay) { position: fixed; inset: 0; z-index: 100; align-items: center; justify-content: center; background: hsl(var(--background) / .8); backdrop-filter: blur(4px); }
    :host(.loading-contained) { position: absolute; z-index: 700; border-radius: inherit; }
    .loading-track { height: .375rem; width: 100%; overflow: hidden; border-radius: 999px; background: hsl(var(--muted)); }
    :host(.loading-overlay) .loading-track { width: calc(100% - 4rem); max-width: 28rem; }
    .loading-fill { height: 100%; width: 100%; background: hsl(var(--primary)); transform-origin: left; transition: transform 220ms linear; }
    @media (prefers-reduced-motion: reduce) { .loading-fill { transition: none; } }
  `,
})
export class LoadingBarComponent {
  readonly loading = input(false);
  readonly progress = input<number | null>(null);
  readonly label = input('Зареждане');
  readonly appearance = input<'inline' | 'overlay' | 'contained'>('inline');
  readonly visible = signal(false);
  readonly value = signal(0);
  readonly percentage = computed(() => Math.floor(this.value()));
  protected readonly cycle = signal({ id: 0 });
  private interval?: ReturnType<typeof setInterval>;
  private completion?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const loading = this.loading();
      untracked(() => {
        this.clearTimers();
        if (loading) {
          this.cycle.update(cycle => ({ id: cycle.id + 1 }));
          this.value.set(0);
          this.visible.set(true);
          this.interval = setInterval(() => {
            const reported = this.progress();
            const milestone = reported !== null && Number.isFinite(reported) ? Math.max(0, Math.min(100, reported)) : 0;
            // Estimate between reported milestones; completion belongs to the loading state.
            this.value.update(value => Math.min(99, Math.max(value, milestone) + (99 - value) * .006));
          }, 50);
        } else if (this.visible()) {
          this.value.set(100);
          this.completion = setTimeout(() => this.visible.set(false), 260);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearTimers());
  }

  private clearTimers(): void {
    clearInterval(this.interval);
    clearTimeout(this.completion);
  }
}
