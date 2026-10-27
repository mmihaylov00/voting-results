import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MapSearchItem, searchMapItems } from '../../../utils/map-interaction.util';
import { MapIconComponent } from '../map-icon/map-icon';

@Component({
  selector: 'app-map-tools',
  standalone: true,
  imports: [MapIconComponent],
  template: `
    <div class="flex flex-wrap items-start gap-2">
      <div class="relative min-w-0 flex-1">
        <input type="search" aria-label="Търсене на място или секция в картата"
          placeholder="Място или номер на секция..." [value]="query"
          class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          (input)="search($any($event.target).value)" (keydown.escape)="clear()"
          (keydown.enter)="matches.length && select(matches[0])" />
        @if (query.trim()) {
          <div class="absolute left-0 right-0 top-10 z-[700] max-h-64 overflow-auto rounded-md border border-border bg-background shadow-lg">
            @for (item of matches; track item.id) {
              <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
                (click)="select(item)"><app-map-icon [name]="item.kind === 'country' ? 'globe' : item.kind === 'city' ? 'settlement' : item.kind" />{{ item.label }}</button>
            } @empty {
              <p class="px-3 py-2 text-sm text-muted-foreground" role="status">Няма намерени места в избраните данни.</p>
            }
          </div>
        }
      </div>
    </div>
    @if (error) { <p class="mt-2 text-sm text-destructive" role="alert">{{ error }}</p> }
  `,
})
export class MapToolsComponent implements OnChanges {
  @Input() items: MapSearchItem[] = [];
  @Input() error = '';
  @Output() searchSelect = new EventEmitter<MapSearchItem>();
  query = '';
  matches: MapSearchItem[] = [];

  ngOnChanges(): void {
    this.matches = searchMapItems(this.items, this.query);
  }

  search(query: string): void {
    this.query = query;
    this.matches = searchMapItems(this.items, query);
  }

  select(item: MapSearchItem): void {
    this.searchSelect.emit(item);
    this.clear();
  }

  clear(): void {
    this.query = '';
    this.matches = [];
  }
}
