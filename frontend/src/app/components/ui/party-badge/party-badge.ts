import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../services/theme.service';
import { getPartyBadgeLabel, getPartyColor } from '../../../utils/party-colors';

@Component({
  selector: 'app-party-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './party-badge.html',
})
export class PartyBadgeComponent {
  @Input() partyName: string | null | undefined = '';
  @Input() size: 'xs' | 'sm' | 'md' = 'sm';
  @Input() extraClass = '';

  constructor(private themeService: ThemeService) {}

  get label(): string {
    return getPartyBadgeLabel(this.partyName);
  }

  get color(): string {
    return getPartyColor(this.partyName, this.themeService.darkMode());
  }

  get backgroundColor(): string {
    return this.toRgba(this.color, 0.14);
  }

  get borderColor(): string {
    return this.toRgba(this.color, 0.35);
  }

  get sizeClass(): string {
    switch (this.size) {
      case 'xs':
        return 'px-1.5 py-0.5 text-[10px]';
      case 'md':
        return 'px-2.5 py-1 text-xs';
      default:
        return 'px-2 py-0.5 text-xs';
    }
  }

  get badgeClass(): string {
    return [
      'inline-flex items-center rounded-full border font-semibold leading-none',
      'whitespace-nowrap max-w-full overflow-hidden text-ellipsis',
      this.sizeClass,
      this.extraClass,
    ].filter(Boolean).join(' ');
  }

  private toRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '').trim();
    if (normalized.length !== 6) return hex;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
