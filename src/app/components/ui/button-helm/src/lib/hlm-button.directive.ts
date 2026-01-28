import { Component, Input, HostBinding } from '@angular/core';
import { cva, VariantProps } from 'class-variance-authority';
import { hlm } from '../../../../../utils/hlm-utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

@Component({
  selector: 'button[hlmBtn], a[hlmBtn]',
  standalone: true,
  template: `<ng-content />`,
})
export class HlmButtonDirective {
  private _variant: ButtonVariants['variant'] = 'default';
  @Input()
  set variant(value: ButtonVariants['variant']) {
    this._variant = value;
  }

  private _size: ButtonVariants['size'] = 'default';
  @Input()
  set size(value: ButtonVariants['size']) {
    this._size = value;
  }

  @Input()
  class: string = '';

  @HostBinding('class')
  get columnClass() {
    return hlm(buttonVariants({ variant: this._variant, size: this._size }), this.class);
  }
}
