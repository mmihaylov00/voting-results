import { ComponentRef, Directive, ElementRef, HostListener, Injector, Input, OnChanges, OnDestroy, ViewContainerRef, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RegionCandidate } from '../../../models/election.models';
import { ElectionService } from '../../../services/election';
import { contestantParticipations } from '../../../utils/contestant-profile.util';
import { ContestantPreviewComponent } from './contestant-preview';

@Directive({ selector: '[appContestantPreview]', standalone: true })
export class ContestantPreviewDirective implements OnChanges, OnDestroy {
  private static nextId = 0;
  private static active: ContestantPreviewDirective | null = null;
  @Input('appContestantPreview') name = '';
  @Input() contestantPreviewDate = '';
  @Input() contestantPreviewPartyId = '';
  @Input() contestantPreviewCandidate: RegionCandidate | null = null;
  @Input() contestantPreviewRegion = '';
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly container = inject(ViewContainerRef);
  private readonly tooltipId = `contestant-preview-${++ContestantPreviewDirective.nextId}`;
  private preview: ComponentRef<ContestantPreviewComponent> | null = null;
  private showTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private hovered = false;
  private focused = false;
  private tooltipHovered = false;
  private generation = 0;
  private readonly dismissOnViewportChange = (event: Event) => {
    if (event.type === 'scroll' && event.target instanceof Node
      && this.preview?.location.nativeElement.contains(event.target)) return;
    this.hide();
  };
  private readonly dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (this.preview || this.showTimer)) {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.hovered = true;
    this.scheduleShow();
  }
  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.hovered = false;
    this.scheduleHide();
  }
  @HostListener('focusin')
  onFocus(): void {
    this.focused = true;
    this.scheduleShow();
  }
  @HostListener('focusout', ['$event'])
  onBlur(event: FocusEvent): void {
    if (event.relatedTarget instanceof Node && this.host.contains(event.relatedTarget)) return;
    this.focused = false;
    this.scheduleHide();
  }
  @HostListener('click')
  onClick(): void { this.hide(); }

  ngOnChanges(): void {
    this.hide();
    if (this.hovered || this.focused) this.scheduleShow();
  }
  ngOnDestroy(): void { this.hide(); }

  private scheduleShow(): void {
    clearTimeout(this.hideTimer);
    if (this.preview || this.showTimer || !this.name.trim()) return;
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      if (this.hovered || this.focused) this.show();
    }, 200);
  }
  private scheduleHide(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (!this.hovered && !this.focused && !this.tooltipHovered) this.hide();
    }, 120);
  }

  private show(): void {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    if (this.preview || !this.name.trim()) return;
    ContestantPreviewDirective.active?.hide();
    ContestantPreviewDirective.active = this;
    const generation = ++this.generation;
    const candidate = this.contestantPreviewCandidate;
    const service = candidate ? null : this.injector.get(ElectionService);
    const type = service?.electionType ?? 'governmental';
    const preview = this.container.createComponent(ContestantPreviewComponent);
    this.preview = preview;
    preview.setInput('name', this.name);
    preview.setInput('type', type);
    preview.setInput('candidate', candidate);
    preview.setInput('date', this.contestantPreviewDate);
    preview.setInput('region', this.contestantPreviewRegion);
    preview.setInput('loading', !candidate);
    const element: HTMLElement = preview.location.nativeElement;
    element.id = this.tooltipId;
    element.addEventListener('mouseenter', () => {
      this.tooltipHovered = true;
      clearTimeout(this.hideTimer);
    });
    element.addEventListener('mouseleave', () => {
      this.tooltipHovered = false;
      this.scheduleHide();
    });
    (this.host.closest('dialog[open]') ?? document.body).appendChild(element);
    const descriptions = this.host.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
    this.host.setAttribute('aria-describedby', [...descriptions, this.tooltipId].join(' '));
    document.addEventListener('keydown', this.dismissOnEscape, true);
    document.addEventListener('scroll', this.dismissOnViewportChange, true);
    window.addEventListener('scroll', this.dismissOnViewportChange);
    window.addEventListener('resize', this.dismissOnViewportChange);
    this.render();
    if (service) {
      void firstValueFrom(service.getAllData()).then(summaries => {
        if (generation !== this.generation || this.preview !== preview) return;
        preview.setInput('participations', contestantParticipations(this.name, type, service.getDates(), summaries,
          { date: this.contestantPreviewDate, partyId: this.contestantPreviewPartyId }));
        preview.setInput('loading', false);
        this.render();
      }, () => {
        if (generation !== this.generation || this.preview !== preview) return;
        preview.setInput('loading', false);
        preview.setInput('error', true);
        this.render();
      });
    }
  }

  private render(): void {
    if (!this.preview) return;
    this.preview.changeDetectorRef.detectChanges();
    const element: HTMLElement = this.preview.location.nativeElement;
    const anchor = this.host.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + (anchor.width - bounds.width) / 2, window.innerWidth - bounds.width - 8));
    const below = anchor.bottom + 8;
    const top = below + bounds.height <= window.innerHeight - 8 ? below : anchor.top - bounds.height - 8;
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
  }

  private hide(): void {
    this.generation++;
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = undefined;
    this.hideTimer = undefined;
    this.tooltipHovered = false;
    if (ContestantPreviewDirective.active === this) ContestantPreviewDirective.active = null;
    document.removeEventListener('keydown', this.dismissOnEscape, true);
    document.removeEventListener('scroll', this.dismissOnViewportChange, true);
    window.removeEventListener('scroll', this.dismissOnViewportChange);
    window.removeEventListener('resize', this.dismissOnViewportChange);
    const descriptions = this.host.getAttribute('aria-describedby')?.split(/\s+/).filter(id => id && id !== this.tooltipId) ?? [];
    if (descriptions.length) this.host.setAttribute('aria-describedby', descriptions.join(' '));
    else this.host.removeAttribute('aria-describedby');
    this.preview = null;
    this.container.clear();
  }
}
