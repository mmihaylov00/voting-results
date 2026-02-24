import { Component, Input, HostBinding, Directive } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';

@Directive({
  selector: '[hlmCard]',
  standalone: true,
})
export class HlmCardDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('rounded-lg border bg-card text-card-foreground shadow-sm block', this.class);
  }
}

@Directive({
  selector: '[hlmCardHeader]',
  standalone: true,
})
export class HlmCardHeaderDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('flex flex-col space-y-1.5 p-6', this.class);
  }
}

@Directive({
  selector: '[hlmCardTitle]',
  standalone: true,
})
export class HlmCardTitleDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('text-2xl font-semibold leading-none tracking-tight', this.class);
  }
}

@Directive({
  selector: '[hlmCardDescription]',
  standalone: true,
})
export class HlmCardDescriptionDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('text-sm text-muted-foreground', this.class);
  }
}

@Directive({
  selector: '[hlmCardContent]',
  standalone: true,
})
export class HlmCardContentDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('p-6 pt-0', this.class);
  }
}

@Directive({
  selector: '[hlmCardFooter]',
  standalone: true,
})
export class HlmCardFooterDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('flex items-center p-6 pt-0', this.class);
  }
}
