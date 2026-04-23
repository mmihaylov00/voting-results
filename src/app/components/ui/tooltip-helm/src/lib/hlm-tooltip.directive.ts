import { Directive, Input, ElementRef, HostListener, Renderer2, OnDestroy, OnInit, OnChanges } from '@angular/core';
import { ComparativeValue } from '../../../../../models/election.models';
import { DecimalPipe } from '@angular/common';
import { getDateName } from '../../../../../utils/date-name.util';

const elections = [
  {"date": "2026.04.19", "name": "Април 2026"},
  {"date": "2024.10.27", "name": "Октомври 2024"},
  {"date": "2024.06.09", "name": "Юни 2024"},
  {"date": "2023.04.02", "name": "Април 2023"}
];

@Directive({
  selector: '[hlmTooltip]',
  standalone: true,
  providers: [DecimalPipe]
})
export class HlmTooltipDirective implements OnDestroy {
  @Input('hlmTooltip') comparisons: ComparativeValue[] | string | undefined;
  @Input() currentValue: number | undefined;
  @Input() isPercent: boolean = false;
  @Input() showTrend: boolean = false;
  @Input() isLoading: boolean = false;

  private tooltipElement: HTMLElement | null = null;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private decimalPipe: DecimalPipe
  ) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    if (this.isLoading || !this.comparisons || (Array.isArray(this.comparisons) && this.comparisons.length === 0)) return;
    this.showTooltip();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.hideTooltip();
  }

  private trendIndicator: HTMLElement | null = null;

  private ngOnInit() {
    this.updateTrendIndicator();
  }

  private ngOnChanges() {
    this.updateTrendIndicator();
  }

  private getPercentageDelta(current: number, compared: number): number | null {
    if (compared === 0) {
      return current === 0 ? 0 : null;
    }

    return ((current - compared) / compared) * 100;
  }

  private getPercentageDeltaMarkup(
    current: number,
    compared: number,
    className: string = ''
  ): { markup: string; colorClass: string | null } {
    const delta = this.getPercentageDelta(current, compared);

    if (delta === null) {
      return { markup: '<span class="text-[12px]">–</span>', colorClass: 'text-muted-foreground' };
    }

    if (delta === 0) {
      return { markup: '<span class="text-[12px]">0.00%</span>', colorClass: 'text-muted-foreground' };
    }

    const formattedDelta = `${delta < 0 ? '-' : ''}${Math.abs(delta).toFixed(2)}%`;
    const arrow = delta > 0 ? '↑' : '↓';
    const classes = [className, 'text-[12px]', 'font-bold', delta > 0 ? 'text-green-500' : 'text-red-500']
      .filter(Boolean)
      .join(' ');

    return {
      markup: `<span class="${classes}">${formattedDelta}<span class="font-bold text-[14px]">${arrow}</span></span>`,
      colorClass: null,
    };
  }

  private updateTrendIndicator() {
    if (!this.showTrend || this.currentValue === undefined) {
      this.removeTrendIndicator();
      return;
    }

    if (!this.trendIndicator) {
      this.trendIndicator = this.renderer.createElement('span');
      this.renderer.addClass(this.trendIndicator, 'ml-1');
      this.renderer.addClass(this.trendIndicator, 'inline-flex');
      this.renderer.addClass(this.trendIndicator, 'items-center');
      this.renderer.addClass(this.trendIndicator, 'text-[12px]');
      this.renderer.addClass(this.trendIndicator, 'font-bold');
      this.renderer.appendChild(this.el.nativeElement, this.trendIndicator);
    }

    // Clear previous classes and text/content
    this.renderer.removeClass(this.trendIndicator, 'text-green-500');
    this.renderer.removeClass(this.trendIndicator, 'text-red-500');
    this.renderer.removeClass(this.trendIndicator, 'text-muted-foreground');
    this.renderer.removeClass(this.trendIndicator, 'text-primary');
    this.renderer.removeClass(this.trendIndicator, 'bg-primary/10');
    this.renderer.removeClass(this.trendIndicator, 'px-1');
    this.renderer.removeClass(this.trendIndicator, 'rounded');
    this.renderer.removeClass(this.trendIndicator, 'text-[12px]');
    this.renderer.setProperty(this.trendIndicator, 'innerHTML', '');

    if (this.isLoading) {
      this.renderer.setProperty(this.trendIndicator, 'innerHTML', '⌛');
      this.renderer.addClass(this.trendIndicator, 'text-muted-foreground');
      return;
    }

    if (this.comparisons === undefined) {
      this.removeTrendIndicator();
      return;
    }

    const hasNoComparisons = !Array.isArray(this.comparisons) || this.comparisons.length === 0;

    if (hasNoComparisons || typeof this.comparisons === 'string') {
      if (hasNoComparisons) {
        this.renderer.setProperty(this.trendIndicator, 'innerHTML', `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class="text-primary">
            <path d="M4 19V5h2v14H4zm4 0V5h2v14H8zm4 0V5h2v14h-2zm4 0V5h2v14h-2zm4 0V5h2v14h-2z" opacity="0"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-weight="bold">NEW</text>
          </svg>
        `);
        this.renderer.addClass(this.trendIndicator, 'text-primary');
      } else {
        this.removeTrendIndicator();
      }
      return;
    }

    // Find the current election date from the URL or state
    // For simplicity, we can try to find which election date we are currently viewing
    // and then find its predecessor.
    const currentPath = window.location.pathname;
    const dateMatch = currentPath.match(/(\d{4}\.\d{2}\.\d{2})/);
    const currentDate = dateMatch ? dateMatch[1] : null;

    if (!currentDate) {
      this.removeTrendIndicator();
      return;
    }

    const currentIndex = elections.findIndex(e => e.date === currentDate);
    if (currentIndex === -1) {
      // Current date not found in the list, can't reliably find previous
      this.removeTrendIndicator();
      return;
    }

    // Elections are sorted newest to oldest, so dates with index > currentIndex are older
    let bestPrevComp: ComparativeValue | undefined;
    for (let i = currentIndex + 1; i < elections.length; i++) {
      const dateToCheck = elections[i].date;
      const comp = (this.comparisons as ComparativeValue[]).find(c => c.d === dateToCheck);
      if (comp) {
        bestPrevComp = comp;
        break; // Found the most recent participation before the current election
      }
    }

    if (!bestPrevComp) {
      this.renderer.setProperty(this.trendIndicator, 'innerHTML', '–');
      this.renderer.addClass(this.trendIndicator, 'text-muted-foreground');
      return;
    }

    const prev = bestPrevComp.v;
    const { markup, colorClass } = this.getPercentageDeltaMarkup(this.currentValue, prev);
    this.renderer.setProperty(this.trendIndicator, 'innerHTML', markup);
    if (colorClass) {
      this.renderer.addClass(this.trendIndicator, colorClass);
    }
  }

  private removeTrendIndicator() {
    if (this.trendIndicator) {
      this.renderer.removeChild(this.el.nativeElement, this.trendIndicator);
      this.trendIndicator = null;
    }
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
          ? (c.v / 100).toFixed(2) + '%'
          : this.decimalPipe.transform(c.v, '1.0-0');

        let deltaMarkup = '';
        if (this.currentValue !== undefined) {
          deltaMarkup = this.getPercentageDeltaMarkup(this.currentValue, c.v, 'ml-1').markup;
        }

        content += `
          <div class="flex justify-between gap-4 text-[10px] whitespace-nowrap items-center">
            <span class="opacity-70">${getDateName(c.d)}:</span>
            <span class="font-bold flex items-center">${formattedValue}${deltaMarkup}</span>
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
