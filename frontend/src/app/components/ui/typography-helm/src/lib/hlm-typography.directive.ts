import { Directive, Input, HostBinding, ElementRef, inject } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';
import { cva, VariantProps } from 'class-variance-authority';

export const typographyVariants = cva('', {
  variants: {
    variant: {
      h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
      h2: 'scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0',
      h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
      h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
      p: 'leading-7 [&:not(:first-child)]:mt-6',
      blockquote: 'mt-6 border-l-2 pl-6 italic',
      ul: 'my-6 ml-6 list-disc [&>li]:mt-2',
      inlineCode: 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
      lead: 'text-xl text-muted-foreground',
      large: 'text-lg font-semibold',
      small: 'text-sm font-medium leading-none',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'p',
  },
});

export type TypographyVariants = VariantProps<typeof typographyVariants>;

@Directive({
  selector: '[hlmH1], [hlmH2], [hlmH3], [hlmH4], [hlmP], [hlmBlockquote], [hlmUl], [hlmInlineCode], [hlmLead], [hlmLarge], [hlmSmall], [hlmMuted]',
  standalone: true,
})
export class HlmTypographyDirective {
  private _elementRef = inject(ElementRef);
  private _variant: TypographyVariants['variant'] = 'p';

  @Input()
  set variant(value: TypographyVariants['variant']) {
    this._variant = value;
  }

  @Input() class: string = '';

  @HostBinding('class')
  get columnClass() {
    let variant = this._variant;
    // Auto-detect variant from selector
    const attributes = this._elementRef.nativeElement.attributes;
    if (attributes.getNamedItem('hlmH1')) variant = 'h1';
    else if (attributes.getNamedItem('hlmH2')) variant = 'h2';
    else if (attributes.getNamedItem('hlmH3')) variant = 'h3';
    else if (attributes.getNamedItem('hlmH4')) variant = 'h4';
    else if (attributes.getNamedItem('hlmP')) variant = 'p';
    else if (attributes.getNamedItem('hlmBlockquote')) variant = 'blockquote';
    else if (attributes.getNamedItem('hlmUl')) variant = 'ul';
    else if (attributes.getNamedItem('hlmInlineCode')) variant = 'inlineCode';
    else if (attributes.getNamedItem('hlmLead')) variant = 'lead';
    else if (attributes.getNamedItem('hlmLarge')) variant = 'large';
    else if (attributes.getNamedItem('hlmSmall')) variant = 'small';
    else if (attributes.getNamedItem('hlmMuted')) variant = 'muted';

    return hlm(typographyVariants({ variant }), this.class);
  }
}
