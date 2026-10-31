import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, TemplateRef, afterNextRender, computed, contentChild, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { VirtualTableDirective } from '../virtual-table/virtual-table';

@Component({
  selector: 'app-virtual-cards',
  standalone: true,
  imports: [NgTemplateOutlet, VirtualTableDirective],
  template: `
    <div [virtualRows]="rows()" [virtualRowHeight]="420" #viewport="virtualRows" class="card-viewport" role="list" [attr.aria-label]="label()" tabindex="0">
      <div [style.height.px]="viewport.window().top" aria-hidden="true"></div>
      @for (row of viewport.rows(); track row[0].id; let rowIndex = $index) {
        <div class="card-row" [attr.data-virtual-index]="viewport.window().start + $index" role="presentation">
          @for (item of row; track item.id) {
            <div class="min-w-0" role="listitem" [attr.aria-posinset]="(viewport.window().start + rowIndex) * columns() + $index + 1" [attr.aria-setsize]="items().length">
              <ng-container [ngTemplateOutlet]="template()" [ngTemplateOutletContext]="{ $implicit: item }" />
            </div>
          }
        </div>
      } @empty { <p class="py-12 text-center text-muted-foreground" role="status">{{ emptyMessage() }}</p> }
      <div [style.height.px]="viewport.window().bottom" aria-hidden="true"></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host { display: block; min-width: 0; --card-columns: 1; }
    .card-viewport { max-height: min(72dvh, 64rem); overflow: auto; scrollbar-gutter: stable; padding: 2px; }
    .card-viewport:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
    .card-row { display: grid; grid-template-columns: repeat(var(--card-columns), minmax(0, 1fr)); gap: 1rem; padding-bottom: 1rem; }
    @media (min-width: 640px) { :host { --card-columns: 2; } }
    @media (min-width: 1024px) { :host { --card-columns: 3; } }
    @media (min-width: 1280px) { :host { --card-columns: 4; } }
  `,
})
export class VirtualCardsComponent<T extends { id: string }> {
  readonly items = input.required<readonly T[]>();
  readonly label = input.required<string>();
  readonly emptyMessage = input('Няма резултати за избраните филтри.');
  readonly template = contentChild.required<TemplateRef<{ $implicit: T }>>(TemplateRef);
  readonly columns = signal(1);
  readonly rows = computed(() => {
    const items = this.items(), columns = this.columns();
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
    return rows;
  });

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement;
    const measure = () => this.columns.set(Number(getComputedStyle(element).getPropertyValue('--card-columns')) || 1);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    afterNextRender(() => { measure(); observer?.observe(element); });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }
}
