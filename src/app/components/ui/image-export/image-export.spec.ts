import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageExportComponent } from './image-export';

const png = new Blob(['image-data'], { type: 'image/png' });
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

class ClipboardImage {
  static supports = () => true;
  constructor(readonly data: Record<string, Blob>) {}
}

describe('PNG image export modal', () => {
  const write = vi.fn<(items: ClipboardItem[]) => Promise<void>>();

  beforeEach(() => {
    write.mockReset().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    vi.stubGlobal('ClipboardItem', ClipboardImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });

  function setup(createImage: () => Promise<Blob> = vi.fn().mockResolvedValue(png)) {
    TestBed.configureTestingModule({ imports: [ImageExportComponent], providers: [provideRouter([])] });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:png-preview');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const downloads: { href: string; filename: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });
    const fixture = TestBed.createComponent(ImageExportComponent);
    fixture.componentRef.setInput('createImage', createImage);
    fixture.componentRef.setInput('title', 'Прираст по секции');
    fixture.componentRef.setInput('filename', 'section-gains.png');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, create, revoke, downloads,
      element: fixture.nativeElement as HTMLElement };
  }

  it('opens immediately, renders once, previews and downloads the same PNG', async () => {
    let resolveImage: (blob: Blob) => void = () => {};
    const generate = vi.fn(() => new Promise<Blob>(resolve => { resolveImage = resolve; }));
    const { fixture, component, create, revoke, downloads, element } = setup(generate);
    const pending = component.open();
    fixture.detectChanges();
    expect(element.querySelector('dialog')).not.toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Подготовка');
    expect(create).not.toHaveBeenCalled();
    await component.open();
    expect(generate).toHaveBeenCalledOnce();
    resolveImage(png);
    await pending;
    fixture.detectChanges();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:png-preview');
    component.download();
    expect(downloads).toEqual([{ href: 'blob:png-preview', filename: 'section-gains.png' }]);
    expect(create).toHaveBeenCalledExactlyOnceWith(png);
    expect(component.opened()).toBe(true);
    component.close();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:png-preview');
    fixture.destroy();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('copies the prepared PNG with a direct clipboard write and reports success', async () => {
    const { fixture, component, element } = setup();
    await component.open();
    fixture.detectChanges();
    await component.copy();
    fixture.detectChanges();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0][0]).toMatchObject({ data: { 'image/png': png } });
    expect(component.copied()).toBe(true);
    expect(element.textContent).toContain('Изображението е копирано.');
    expect(component.opened()).toBe(true);
    fixture.destroy();
  });

  it('retains download after a clipboard permission failure', async () => {
    const { fixture, component, downloads, element } = setup();
    write.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await component.open();
    await component.copy();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Копирането е блокирано');
    component.download();
    expect(downloads).toHaveLength(1);
    expect(component.copied()).toBe(false);
    fixture.destroy();
  });

  it('explains unsupported image clipboard support while retaining PNG download', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const { fixture, component, downloads, element } = setup();
    await component.open();
    fixture.detectChanges();
    const copyButton = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Копирай изображението'));
    expect(copyButton?.disabled).toBe(true);
    expect(element.textContent).toContain('Копирането на изображения не се поддържа');
    await component.copy();
    expect(write).not.toHaveBeenCalled();
    component.download();
    expect(downloads).toHaveLength(1);
    fixture.destroy();
  });

  it('shows renderer errors and permits retry in the existing modal', async () => {
    const generate = vi.fn<() => Promise<Blob>>().mockRejectedValueOnce(new Error('Изчакайте картата.')).mockResolvedValueOnce(png);
    const { fixture, component, element } = setup(generate);
    await component.open();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Изчакайте картата.');
    expect(component.previewUrl()).toBe('');
    await component.generateImage();
    fixture.detectChanges();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(component.previewUrl()).toBe('blob:png-preview');
    fixture.destroy();
  });

  it('ignores rendering that finishes after the modal closes or is destroyed', async () => {
    let resolveImage: (blob: Blob) => void = () => {};
    const { fixture, component, create } = setup(() => new Promise(resolve => { resolveImage = resolve; }));
    const pending = component.open();
    component.close();
    fixture.destroy();
    resolveImage(png);
    await pending;
    expect(create).not.toHaveBeenCalled();
    expect(component.previewUrl()).toBe('');
  });
});
