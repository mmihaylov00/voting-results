import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { HlmButtonDirective } from '../button-helm/src/lib/hlm-button.directive';

export interface ViewTab {
  id: string;
  label: string;
  count?: number;
}

@Component({
  selector: 'app-view-tabs',
  imports: [HlmButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="view-tabs" [class.scrollable]="scrollable()" role="tablist" [attr.aria-label]="label()">
    @for (tab of tabs(); track tab.id; let index = $index) {
      <button #tabButton hlmBtn variant="line" class="view-tab" type="button" role="tab"
        [id]="idPrefix() + '-tab-' + tab.id" [attr.aria-controls]="panelId() || idPrefix() + '-panel-' + tab.id"
        [attr.aria-selected]="value() === tab.id" [attr.tabindex]="value() === tab.id ? 0 : -1"
        [attr.data-state]="value() === tab.id ? 'active' : 'inactive'"
        (click)="value.set(tab.id)" (keydown)="onKeydown($event, index)">
        {{ tab.label }}
        @if (tab.count !== undefined) {<span class="count">{{ tab.count.toLocaleString('bg-BG') }}</span>}
      </button>
    }
  </div>`,
  styles: `
    :host{display:block;min-width:0;max-width:100%}
    .view-tabs{display:flex;flex-wrap:wrap;max-width:100%;gap:.25rem;padding:2px;border-bottom:1px solid hsl(var(--foreground)/.12)}
    .view-tab{flex:0 0 auto;min-height:44px;white-space:nowrap;padding:.65rem .85rem;color:hsl(var(--muted-foreground));border-bottom:2px solid transparent;transition:background-color .15s,color .15s,border-color .15s}
    .view-tab[data-state='active']{color:hsl(var(--foreground));border-bottom-color:hsl(var(--primary));font-weight:650}
    .view-tab:hover{color:hsl(var(--foreground));background:hsl(var(--muted))}
    .view-tab:focus-visible{outline:2px solid hsl(var(--foreground));outline-offset:-2px}
    .count{margin-left:.45rem;padding:.1rem .4rem;border-radius:999px;background:hsl(var(--foreground)/.08);font-size:.75rem;font-variant-numeric:tabular-nums}
    .view-tabs.scrollable{flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain}
    .view-tabs.scrollable .view-tab{max-width:none;white-space:nowrap}
    @media(max-width:640px){.view-tab{max-width:100%;height:auto;white-space:normal;text-align:left}}
    @media(prefers-reduced-motion:reduce){.view-tab{transition:none}}
  `,
})
export class ViewTabsComponent {
  readonly tabs = input.required<readonly ViewTab[]>();
  readonly value = model.required<string>();
  readonly label = input.required<string>();
  readonly idPrefix = input.required<string>();
  readonly panelId = input<string>();
  readonly scrollable = input(false);
  private readonly buttons = viewChildren<unknown, ElementRef<HTMLButtonElement>>('tabButton', { read: ElementRef });

  onKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    if (!tabs.length) return;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break;
      case 'ArrowRight': next = (index + 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.value.set(tabs[next].id);
    this.buttons()[next]?.nativeElement.focus();
  }
}
