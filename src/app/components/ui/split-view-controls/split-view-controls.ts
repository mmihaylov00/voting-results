import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { MapIconComponent } from '../map-icon/map-icon';

export type SplitViewLayout = 'split' | 'list' | 'map';

@Component({
  selector: 'app-split-view-controls',
  standalone: true,
  imports: [MapIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative h-full pb-4 pt-48">
      <div class="absolute inset-y-0 left-1/2 w-px bg-border/50" aria-hidden="true"></div>
      <div class="sticky top-[calc(50dvh-2.5rem)] flex flex-col items-center gap-1"
        role="group" aria-label="Подредба на списъка и картата">
        @if (layout() !== 'list') {
          <button type="button" class="panel-handle"
            [attr.aria-label]="layout() === 'map' ? 'Покажи списъка' : 'Скрий списъка'"
            [title]="layout() === 'map' ? 'Покажи списъка' : 'Скрий списъка'"
            [attr.aria-expanded]="layout() !== 'map'"
            (click)="layout.set(layout() === 'map' ? 'split' : 'map')">
            <app-map-icon [name]="layout() === 'map' ? 'chevron-right' : 'chevron-left'" />
          </button>
        }
        @if (layout() !== 'map') {
          <button type="button" class="panel-handle"
            [attr.aria-label]="layout() === 'list' ? 'Покажи картата' : 'Скрий картата'"
            [title]="layout() === 'list' ? 'Покажи картата' : 'Скрий картата'"
            [attr.aria-expanded]="layout() !== 'list'"
            (click)="layout.set(layout() === 'list' ? 'split' : 'list')">
            <app-map-icon [name]="layout() === 'list' ? 'chevron-left' : 'chevron-right'" />
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .panel-handle {
      @apply inline-flex h-8 w-7 items-center justify-center rounded-full border border-border
        bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent
        hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring;
    }
  `,
})
export class SplitViewControlsComponent {
  readonly layout = model<SplitViewLayout>('split');
}
