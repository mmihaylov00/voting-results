import { Directive, HostBinding, Input, input } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';

@Directive({
	selector: '[hlmPagination],hlm-pagination',
	host: {
		'data-slot': 'pagination',
		role: 'navigation',
		'[attr.aria-label]': 'ariaLabel()',
	},
})
export class HlmPagination {
	/** The aria-label for the pagination component. */
	public readonly ariaLabel = input<string>('pagination', { alias: 'aria-label' });

  @Input() class: string = '';

  @HostBinding('class')
  get hostClass() {
    return hlm('mx-auto flex w-full justify-center', this.class);
  }
}
