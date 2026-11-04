import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FacebookImage } from './facebook-research.models';

@Component({
  selector: 'app-facebook-research-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.avatar]': 'variant() === "avatar"',
    '[class.thumbnail]': 'variant() === "thumbnail"',
    '[class.detail]': 'variant() === "detail"',
  },
  template: `
    @if (image(); as media) {
      @if (failed() !== media.src) {
        <img [src]="media.src" [alt]="variant() === 'detail' ? label() : ''"
          [width]="media.width" [height]="media.height" loading="lazy" decoding="async"
          (error)="failed.set(media.src)" />
        @if (media.kind === 'video-thumbnail') {
          <span class="video" aria-label="Миниатюра на видео"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2v12l10-6z"/></svg><span>Видео</span></span>
        }
      } @else {
        <span class="placeholder" [attr.role]="variant() === 'detail' ? 'img' : null" [attr.aria-hidden]="variant() === 'detail' ? null : true" [attr.aria-label]="label() + ' · изображението е недостъпно'">{{ variant() === 'avatar' ? initials() : 'Няма снимка' }}</span>
      }
    } @else {
      <span class="placeholder" aria-hidden="true">{{ variant() === 'avatar' ? initials() : 'Текст' }}</span>
    }
  `,
  styles: `
    :host{position:relative;display:inline-flex;flex-shrink:0;overflow:hidden;background:hsl(var(--muted));border-radius:.35rem;vertical-align:middle}
    img{display:block;width:100%;height:100%;object-fit:cover}:host(.avatar){width:2rem;height:2rem;border-radius:50%}
    :host(.thumbnail){width:4rem;height:4rem}.placeholder{display:grid;place-content:center;width:100%;min-height:inherit;text-align:center;color:hsl(var(--muted-foreground));font-size:.65rem;line-height:1.3;padding:.2rem}
    :host(.avatar) .placeholder{font-weight:650;font-size:.7rem}:host(.detail){display:block;width:100%;border-radius:.35rem}
    :host(.detail) img{width:auto;max-width:100%;height:auto;max-height:65dvh;object-fit:contain;margin:auto}
    :host(.detail) .placeholder{min-height:8rem;font-size:.85rem}.video{position:absolute;right:.25rem;bottom:.25rem;display:flex;align-items:center;gap:.3rem;padding:.2rem .3rem;color:white;background:#0c1e2ee6;border-radius:.2rem;font-size:.7rem}
    :host(.thumbnail) .video span{display:none}:host(.detail) .video{right:.6rem;bottom:.6rem;padding:.35rem .5rem}
    @media(max-width:700px){:host(.thumbnail){width:3rem;height:3rem}}
  `,
})
export class FacebookResearchImageComponent {
  readonly image = input<FacebookImage>();
  readonly label = input.required<string>();
  readonly variant = input<'avatar' | 'thumbnail' | 'detail'>('thumbnail');
  readonly failed = signal('');
  readonly initials = computed(() => this.label().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase());
}
