import type { BooleanInput } from '@angular/cdk/coercion';
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RouterLink } from '@angular/router';
import type { ButtonVariants } from '../../../button-helm/src/lib/hlm-button.directive';
import { HlmPaginationLink } from './hlm-pagination-link';

@Component({
	selector: 'hlm-pagination-previous',
	imports: [HlmPaginationLink],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<a
			hlmPaginationLink
			[link]="link()"
			[queryParams]="queryParams()"
			[queryParamsHandling]="queryParamsHandling()"
			[size]="_size()"
			[attr.aria-label]="ariaLabel()"
      class="inline-flex items-center gap-1 px-2.5"
		>
			<span aria-hidden="true">‹</span>
			<span [class]="_labelClass()">{{ text() }}</span>
		</a>
	`,
})
export class HlmPaginationPrevious {
	/** The link to navigate to the previous page. */
	public readonly link = input<RouterLink['routerLink']>();
	/** The query parameters to pass to the previous page. */
	public readonly queryParams = input<RouterLink['queryParams']>();
	/** How to handle query parameters when navigating to the previous page. */
	public readonly queryParamsHandling = input<RouterLink['queryParamsHandling']>();

	/** The aria-label for the previous page link. */
	public readonly ariaLabel = input<string>('Go to previous page', { alias: 'aria-label' });
	/** The text to display for the previous page link. */
	public readonly text = input<string>('Previous');
	/** Whether the button should only display the icon. */
	public readonly iconOnly = input<boolean, BooleanInput>(false, {
		transform: booleanAttribute,
	});
	protected readonly _labelClass = computed(() => (this.iconOnly() ? 'sr-only' : 'hidden sm:block'));
	protected readonly _size = computed<ButtonVariants['size']>(() => (this.iconOnly() ? 'icon' : 'default'));

}
