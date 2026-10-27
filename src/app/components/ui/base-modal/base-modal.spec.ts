import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ModalPageService } from '../../../services/modal-page.service';
import { BaseModalComponent } from './base-modal';

@Component({
  imports: [BaseModalComponent, NgTemplateOutlet],
  template: `
    <div id="workspace" [hidden]="!!pages.pageTemplate()">
      @if (show()) {
        <app-base-modal title="Секция 230000001" subtitle="София" pageId="section" maxWidth="sm:max-w-3xl"
          [pageQueryParams]="{section: '230000001'}" (close)="closed = closed + 1">
          <input aria-label="Филтър" />
          <p>Резултати за секцията</p>
          <ng-template #headerImage><img src="/profile-test.jpg" alt="Изображение на профила" width="96" height="96" /></ng-template>
          <ng-template #headerActions><button type="button">Сподели</button></ng-template>
          <ng-template #footer>Край на резултатите</ng-template>
        </app-base-modal>
      }
    </div>
    <div id="page"><ng-container [ngTemplateOutlet]="pages.pageTemplate()" /></div>
  `,
})
class ModalHostComponent {
  readonly pages = inject(ModalPageService);
  readonly show = signal(true);
  closed = 0;
}

describe('BaseModalComponent', () => {
  let fixture: ComponentFixture<ModalHostComponent>;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ModalHostComponent],
      providers: [provideRouter([{ path: 'results', component: ModalHostComponent }])],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/results?metric=activity');
    fixture = TestBed.createComponent(ModalHostComponent);
    await fixture.whenStable();
  });

  it('moves the complete view into a page and retains projected input state', async () => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.alt).toBe('Изображение на профила');
    expect(fixture.nativeElement.querySelector('dialog section').classList.contains('sm:max-w-3xl')).toBe(true);
    input.value = 'София';
    (fixture.nativeElement.querySelector('[aria-label="Отвори като страница"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const page = fixture.nativeElement.querySelector('#page') as HTMLElement;
    expect(router.parseUrl(router.url).queryParams).toEqual({ metric: 'activity', dialog: 'section', section: '230000001' });
    expect(fixture.nativeElement.querySelector('#workspace').hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(page.textContent).toContain('Секция 230000001');
    expect(page.textContent).toContain('Край на резултатите');
    expect(page.querySelector('input')).toBe(input);
    expect(page.querySelector('img')?.getAttribute('src')).toBe(image.getAttribute('src'));
    expect(page.querySelector('section')?.classList.contains('sm:max-w-3xl')).toBe(false);
    expect(input.value).toBe('София');
    expect(document.activeElement).toBe(page.querySelector('h2'));
    expect(page.querySelector('[aria-label="Отвори като страница"]')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.closed).toBe(0);
    expect(fixture.componentInstance.pages.isPage('section')).toBe(true);

    await router.navigateByUrl('/results?metric=activity');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#workspace').hidden).toBe(false);
    expect(fixture.nativeElement.querySelector('dialog')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input')).toBe(input);
  });

  it('opens direct page links and clears the outlet when the source view is destroyed', async () => {
    await router.navigateByUrl('/results?dialog=section');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#page').textContent).toContain('Резултати за секцията');
    fixture.componentInstance.show.set(false);
    await fixture.whenStable();
    expect(fixture.componentInstance.pages.pageTemplate()).toBeNull();
    expect(fixture.nativeElement.querySelector('#workspace').hidden).toBe(false);
  });

  it('shrinks an expanded view into a modal and expands it again without closing or losing its controls', async () => {
    await router.navigateByUrl('/results?dialog=section&section=230000001&metric=activity');
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'София';
    (fixture.nativeElement.querySelector('[aria-label="Свий до прозорец"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const pages = fixture.componentInstance.pages;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('input')).toBe(input);
    expect(input.value).toBe('София');
    expect(fixture.nativeElement.querySelector('#workspace').hidden).toBe(false);
    expect(fixture.nativeElement.querySelector('#page').textContent).toBe('');
    expect(fixture.componentInstance.closed).toBe(0);
    expect(pages.isActive('section')).toBe(true);
    expect(pages.isPage('section')).toBe(false);
    expect(router.parseUrl(router.url).queryParams).toEqual({
      dialog: 'section', dialogMode: 'modal', section: '230000001', metric: 'activity',
    });
    expect(dialog.querySelector('[aria-label="Свий до прозорец"]')).toBeNull();
    (dialog.querySelector('[aria-label="Отвори като страница"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('#page input')).toBe(input);
    expect(input.value).toBe('София');
    expect(fixture.componentInstance.closed).toBe(0);
    expect(pages.isPage('section')).toBe(true);
    expect(router.parseUrl(router.url).queryParams['dialogMode']).toBeUndefined();
  });

  it('opens a collapsed direct link as a modal and clears its URL state when closed', async () => {
    await router.navigateByUrl('/results?dialog=section&dialogMode=modal&section=230000001');
    await fixture.whenStable();
    expect(fixture.componentInstance.pages.pageTemplate()).toBeNull();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    (dialog.querySelector('[aria-label="Затвори"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.closed).toBe(1);
    expect(router.parseUrl(router.url).queryParams).toEqual({});
  });

  it('keeps the shrink control without a duplicate back button in expanded views', async () => {
    await router.navigateByUrl('/results?dialog=section&section=230000001');
    await fixture.whenStable();
    const page = fixture.nativeElement.querySelector('#page') as HTMLElement;
    expect(page.querySelector('[aria-label="Назад към резултатите"]')).toBeNull();
    expect(page.querySelector('[aria-label="Свий до прозорец"]')).not.toBeNull();
    expect(fixture.componentInstance.closed).toBe(0);
    expect(fixture.componentInstance.pages.isPage('section')).toBe(true);
  });

  it('closes on native cancellation or the backdrop without closing on content clicks', () => {
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    fixture.nativeElement.querySelector('input').click();
    expect(fixture.componentInstance.closed).toBe(0);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.closed).toBe(1);
    dialog.click();
    expect(fixture.componentInstance.closed).toBe(2);
  });
});
