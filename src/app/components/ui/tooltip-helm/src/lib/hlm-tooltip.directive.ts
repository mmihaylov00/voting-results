import { Directive, Input, ElementRef, HostListener, Renderer2, OnDestroy } from '@angular/core';
import { ComparativeValue } from '../../../../../models/election.models';
import { DecimalPipe } from '@angular/common';

@Directive({
  selector: '[hlmTooltip]',
  standalone: true,
  providers: [DecimalPipe]
})
export class HlmTooltipDirective implements OnDestroy {
  @Input('hlmTooltip') comparisons: ComparativeValue[] | string | undefined;
  @Input() currentValue: number | undefined;
  @Input() isPercent: boolean = false;

  private tooltipElement: HTMLElement | null = null;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private decimalPipe: DecimalPipe
  ) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    if (!this.comparisons) return;
    this.showTooltip();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.hideTooltip();
  }

  private showTooltip() {
    this.tooltipElement = this.renderer.createElement('div');

    let content = '';
    if (typeof this.comparisons === 'string') {
      content = `<div class="flex flex-col gap-1">`;
      this.comparisons.split('\n').forEach(line => {
        content += `<span class="whitespace-nowrap">${line}</span>`;
      });
      content += `</div>`;
    } else if (Array.isArray(this.comparisons)) {
      content = '<div class="flex flex-col gap-1">';
      this.comparisons.forEach(c => {
      const formattedValue = this.isPercent
        ? (c.value * 100).toFixed(2) + '%'
        : this.decimalPipe.transform(c.value, '1.0-0');

      let arrow = '';
      if (this.currentValue !== undefined) {
        if (this.currentValue > c.value) {
          arrow = '<span class="text-red-500 ml-1">↓</span>';
        } else if (this.currentValue < c.value) {
          arrow = '<span class="text-green-500 ml-1">↑</span>';
        }
      }

      content += `
        <div class="flex justify-between gap-4 text-[10px] whitespace-nowrap items-center">
          <span class="opacity-70">${c.dateName}:</span>
          <span class="font-bold flex items-center">${formattedValue}${arrow}</span>
        </div>
      `;
    });
    content += '</div>';
    }

    this.renderer.setProperty(this.tooltipElement, 'innerHTML', content);
    this.renderer.addClass(this.tooltipElement, 'fixed');
    this.renderer.addClass(this.tooltipElement, 'z-[300]');
    this.renderer.addClass(this.tooltipElement, 'bg-popover');
    this.renderer.addClass(this.tooltipElement, 'text-popover-foreground');
    this.renderer.addClass(this.tooltipElement, 'px-2');
    this.renderer.addClass(this.tooltipElement, 'py-1');
    this.renderer.addClass(this.tooltipElement, 'rounded-md');
    this.renderer.addClass(this.tooltipElement, 'border');
    this.renderer.addClass(this.tooltipElement, 'shadow-md');
    this.renderer.addClass(this.tooltipElement, 'pointer-events-none');
    this.renderer.addClass(this.tooltipElement, 'text-xs');

    this.renderer.appendChild(document.body, this.tooltipElement);

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipElement!.getBoundingClientRect();

    let top = hostRect.top - tooltipRect.height - 8;
    let left = hostRect.left + (hostRect.width / 2) - (tooltipRect.width / 2);

    if (top < 8) {
      top = hostRect.bottom + 8;
    }

    if (left < 8) {
      left = 8;
    } else if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }

    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
  }

  private hideTooltip() {
    if (this.tooltipElement) {
      this.renderer.removeChild(document.body, this.tooltipElement);
      this.tooltipElement = null;
    }
  }

  ngOnDestroy() {
    this.hideTooltip();
  }
}
