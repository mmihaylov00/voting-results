import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FacebookResearchImageComponent } from './facebook-research-image';
import { FacebookImage } from './facebook-research.models';

const image: FacebookImage = {
  src: '/images/facebook/2026/' + 'a'.repeat(64) + '.jpg',
  sourceUrl: 'https://www.facebook.com/bnews.bg', width: 640, height: 480,
  kind: 'image', capturedAt: '2026-11-04', sha256: 'a'.repeat(64),
};

describe('Facebook research imagery', () => {
  it('loads media lazily with dimensions and recovers when a failed image is replaced', () => {
    const fixture = TestBed.createComponent(FacebookResearchImageComponent);
    fixture.componentRef.setInput('label', 'BNews Bg');
    fixture.componentRef.setInput('variant', 'detail');
    fixture.componentRef.setInput('image', image);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rendered = element.querySelector('img')!;
    expect(rendered.getAttribute('loading')).toBe('lazy');
    expect(rendered.getAttribute('width')).toBe('640');
    expect(rendered.alt).toBe('BNews Bg');
    rendered.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('недостъпно');
    fixture.componentRef.setInput('image', { ...image, src: image.src.replace(image.sha256, 'b'.repeat(64)) });
    fixture.detectChanges();
    expect(element.querySelector('img')).not.toBeNull();
    fixture.destroy();
  });

  it('keeps Page initials and text-only posts readable, and distinguishes video thumbnails', () => {
    const fixture = TestBed.createComponent(FacebookResearchImageComponent);
    fixture.componentRef.setInput('label', 'Struma News');
    fixture.componentRef.setInput('variant', 'avatar');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent?.trim()).toBe('SN');
    expect(element.querySelector('.placeholder')?.getAttribute('aria-hidden')).toBe('true');
    fixture.componentRef.setInput('variant', 'thumbnail');
    fixture.detectChanges();
    expect(element.textContent?.trim()).toBe('Текст');
    fixture.componentRef.setInput('image', { ...image, kind: 'video-thumbnail' });
    fixture.detectChanges();
    expect(element.querySelector('.video')?.getAttribute('aria-label')).toBe('Миниатюра на видео');
    expect(element.querySelector('img')?.alt).toBe('');
    fixture.destroy();
  });
});
