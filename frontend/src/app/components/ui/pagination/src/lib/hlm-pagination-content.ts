import { Directive, HostBinding, Input } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';

@Directive({
	selector: 'ul[hlmPaginationContent]',
	host: {
		'data-slot': 'pagination-content',
	},
})
export class HlmPaginationContent {
  @Input() class: string = '';

  @HostBinding('class')
  get hostClass() {
    return hlm('flex flex-row items-center gap-1', this.class);
  }
}
