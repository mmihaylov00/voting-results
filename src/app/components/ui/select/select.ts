import { ChangeDetectionStrategy, Component, ElementRef, Injectable, computed, inject, input, output } from '@angular/core';
import { Overlay, OverlayContainer } from '@angular/cdk/overlay';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { ThemeService } from '../../../services/theme.service';
import { getPartyColor, getPartyDisplayName } from '../../../utils/party-colors';
import { MapIconComponent, MapIconName } from '../map-icon/map-icon';
import { sortPartiesByVotes } from '../../../utils/party-order.util';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  icon?: MapIconName;
  partyName?: string;
}

export function partySelectOptions(parties: readonly { id: string; name: string; total?: number }[], votes?: Readonly<Record<string, number>>): SelectOption[] {
  return sortPartiesByVotes(parties, votes).map(party => ({ value: party.id, label: getPartyDisplayName(party.name), partyName: party.name }));
}

@Injectable()
class SelectOverlayContainer extends OverlayContainer {
  private readonly host = inject(ElementRef<HTMLElement>);

  override getContainerElement(): HTMLElement {
    const container = super.getContainerElement();
    // Native modal dialogs keep body overlays behind their top layer.
    const dialog = this.host.nativeElement.closest('dialog[open]');
    const parent = dialog ?? this._document.body;
    if (container.parentElement !== parent) parent.appendChild(container);
    return container;
  }
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [BrnSelectImports, MapIconComponent],
  providers: [Overlay, { provide: OverlayContainer, useClass: SelectOverlayContainer }],
  template: `
    <brn-select #select [id]="controlId()" [value]="value()" [placeholder]="label()" [disabled]="disabled()"
      [closeDelay]="0" (openChange)="onOpen($event)" (valueChange)="selectValue($event)">
      <button brnSelectTrigger class="select-trigger" [class.breadcrumb]="appearance() === 'breadcrumb'"
        [attr.title]="selected()?.label || label()">
        @if (selected()?.partyName; as partyName) {
          <span class="party-swatch" [style.background-color]="partyColor(partyName)" aria-hidden="true"></span>
        } @else {
          <app-map-icon [name]="selected()?.icon || icon()" />
        }
        <span class="min-w-0 flex-1 truncate text-left">{{ selected()?.label || label() }}</span>
        <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <brn-select-content class="site-select-menu" (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); select.hide()" (keydown.tab)="select.hide()">
        @for (option of options(); track option.value) {
          <button brnOption [value]="option.value" type="button" class="select-option">
            @if (option.partyName) {
              <span class="party-swatch" [style.background-color]="partyColor(option.partyName)" aria-hidden="true"></span>
            } @else {
              <app-map-icon [name]="option.icon || icon()" />
            }
            <span class="min-w-0 flex-1 text-left">{{ option.label }}</span>
            @if (option.value === value()) { <app-map-icon name="check" /> }
          </button>
        }
      </brn-select-content>
    </brn-select>
  `,
  styles: `
    :host { display: block; min-width: 0; max-width: 100%; }
    .select-trigger { display: flex; width: 100%; min-width: 0; min-height: 2.5rem; align-items: center; gap: .5rem; border: 1px solid hsl(var(--input)); border-radius: .375rem; background: hsl(var(--background)); color: hsl(var(--foreground)); padding: .5rem .75rem; font-size: .875rem; font-weight: 500; cursor: pointer; }
    .select-trigger:hover { background: hsl(var(--muted)); }
    .select-trigger:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
    .select-trigger:disabled { opacity: .5; cursor: not-allowed; }
    .select-trigger.breadcrumb { border: 0; border-bottom: 1px solid hsl(var(--muted-foreground) / .6); border-radius: .375rem .375rem 0 0; background: transparent; padding: .375rem .25rem; }
    .select-trigger.breadcrumb:hover { background: hsl(var(--muted) / .5); border-bottom-color: hsl(var(--primary)); }
    .site-select-menu { width: 100%; max-height: min(22rem, calc(100dvh - 2rem)); margin-block: .25rem; border: 1px solid hsl(var(--border) / .4); border-radius: .375rem; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); padding: .25rem; box-shadow: 0 8px 24px #0003; }
    .select-option { display: flex; width: 100%; align-items: center; gap: .625rem; min-height: 2.5rem; border-radius: .25rem; padding: .5rem; font-size: .875rem; overflow-wrap: anywhere; cursor: pointer; }
    .select-option:hover, .select-option:focus { background: hsl(var(--muted)); outline: none; }
    .select-option[aria-selected="true"] { background: hsl(var(--primary) / .12); font-weight: 600; }
    .party-swatch { width: .875rem; height: .875rem; flex-shrink: 0; border-radius: .25rem; box-shadow: inset 0 0 0 1px #80808050; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectComponent<T extends string | null = string> {
  private static nextId = 0;
  private readonly theme = inject(ThemeService);
  private readonly overlayContainer = inject(OverlayContainer);
  readonly controlId = input(`site-select-${++SelectComponent.nextId}`);
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = input<T>();
  readonly valueChange = output<T>();
  readonly icon = input<MapIconName>('filter');
  readonly appearance = input<'default' | 'breadcrumb'>('default');
  readonly disabled = input(false);
  readonly selected = computed(() => this.options().find(option => option.value === this.value()));

  partyColor(name: string): string { return getPartyColor(name, this.theme.darkMode()); }

  selectValue(value: T | T[] | undefined): void {
    if (value !== undefined && !Array.isArray(value) && this.options().some(option => option.value === value)) this.valueChange.emit(value);
  }

  onOpen(open: boolean): void {
    if (open) this.overlayContainer.getContainerElement();
  }
}
