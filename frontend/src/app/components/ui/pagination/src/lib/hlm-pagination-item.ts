import { Directive, HostBinding, Input } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';

@Directive({
	selector: 'li[hlmPaginationItem]',
	host: {
		'data-slot': 'pagination-item',
	},
})
export class HlmPaginationItem {
  @Input() class: string = '';

  @HostBinding('class')
  get hostClass() {
    return hlm('', this.class);
  }
}
