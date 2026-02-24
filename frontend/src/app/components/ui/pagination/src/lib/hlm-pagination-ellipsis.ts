import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
	selector: 'hlm-pagination-ellipsis',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'data-slot': 'pagination-ellipsis',
    class: 'flex size-9 items-center justify-center',
	},
	template: `
		<span aria-hidden="true">
      <span>...</span>
			<span class="sr-only">{{ srOnlyText() }}</span>
		</span>
	`,
})
export class HlmPaginationEllipsis {
	/** Screen reader only text for the ellipsis */
	public readonly srOnlyText = input<string>('More pages');
}
