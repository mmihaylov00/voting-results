import { ChangeDetectionStrategy, Component, ElementRef, Injectable, computed, inject, input, output } from '@angular/core';
import { Overlay, OverlayContainer } from '@angular/cdk/overlay';
import { BrnOverlayService } from '@spartan-ng/brain/overlay';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';
import { BrnSelect, BrnSelectImports } from '@spartan-ng/brain/select';
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
  imports: [BrnSelectImports, BrnPopoverImports, MapIconComponent],
  providers: [Overlay, BrnOverlayService, { provide: OverlayContainer, useClass: SelectOverlayContainer }],
  template: `
    <div brnSelect brnPopover #select="brnSelect" [value]="selected()" [itemToString]="optionLabel" [disabled]="disabled()"
      align="start" [sideOffset]="0" [role]="null" [autoFocus]="false"
      (stateChanged)="onOpen($event === 'open')" (valueChange)="selectValue($event)">
      <button brnSelectTrigger class="select-trigger" [class.breadcrumb]="appearance() === 'breadcrumb'"
        [id]="controlId() + '--trigger'" [attr.aria-label]="label()" [attr.title]="selected()?.label || label()"
        (keydown.escape)="closeOnEscape($event, select)">
        @if (selected()?.partyName; as partyName) {
          <span class="party-swatch" [style.background-color]="partyColor(partyName)" aria-hidden="true"></span>
        } @else {
          <app-map-icon [name]="selected()?.icon || icon()" />
        }
        <span class="min-w-0 flex-1 truncate text-left">{{ selected()?.label || label() }}</span>
        <svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <ng-template brnPopoverContent>
        <div brnSelectContent class="site-select-menu" (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); select.close()" (keydown.tab)="select.close()">
          <div brnSelectList [attr.aria-label]="label()">
            @for (option of options(); track option.value) {
              <div brnSelectItem [value]="option" class="select-option">
                @if (option.partyName) {
                  <span class="party-swatch" [style.background-color]="partyColor(option.partyName)" aria-hidden="true"></span>
                } @else {
                  <app-map-icon [name]="option.icon || icon()" />
                }
                <span class="min-w-0 flex-1 text-left">{{ option.label }}</span>
                @if (option.value === value()) { <app-map-icon name="check" /> }
              </div>
            }
          </div>
        </div>
      </ng-template>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; max-width: 100%; }
    .select-trigger { display: flex; width: 100%; min-width: 0; min-height: 2.5rem; align-items: center; gap: .5rem; border: 1px solid hsl(var(--input)); border-radius: .375rem; background: hsl(var(--background)); color: hsl(var(--foreground)); padding: .5rem .75rem; font-size: .875rem; font-weight: 500; cursor: pointer; }
    .select-trigger:hover { background: hsl(var(--muted)); }
    .select-trigger:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
    .select-trigger:disabled { opacity: .5; cursor: not-allowed; }
    .select-trigger.breadcrumb { border: 0; border-bottom: 1px solid hsl(var(--muted-foreground) / .6); border-radius: .375rem .375rem 0 0; background: transparent; padding: .375rem .25rem; }
    .select-trigger.breadcrumb:hover { background: hsl(var(--muted) / .5); border-bottom-color: hsl(var(--primary)); }
    .site-select-menu { width: var(--brn-select-width); max-height: min(22rem, calc(100dvh - 2rem)); overflow-y: auto; margin-block: .25rem; border: 1px solid hsl(var(--border) / .4); border-radius: .375rem; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); padding: .25rem; box-shadow: 0 8px 24px #0003; }
    .select-option { display: flex; width: 100%; align-items: center; gap: .625rem; min-height: 2.5rem; border-radius: .25rem; padding: .5rem; font-size: .875rem; overflow-wrap: anywhere; cursor: pointer; }
    .select-option:hover, .select-option[data-highlighted] { background: hsl(var(--muted)); outline: none; }
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
  readonly optionLabel = (option: SelectOption<T>): string => option.label;

  partyColor(name: string): string { return getPartyColor(name, this.theme.darkMode()); }

  selectValue(option: SelectOption<T> | null | undefined): void {
    if (option && this.options().some(candidate => candidate.value === option.value)) this.valueChange.emit(option.value);
  }

  closeOnEscape(event: Event, select: BrnSelect<SelectOption<T>>): void {
    if (!select.isExpanded()) return;
    event.preventDefault();
    event.stopPropagation();
    select.close();
  }

  onOpen(open: boolean): void {
    if (open) this.overlayContainer.getContainerElement();
  }
}
