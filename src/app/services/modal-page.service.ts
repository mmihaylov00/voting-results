import { Injectable, TemplateRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ModalPageService {
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    startWith(null),
    map(() => this.router.parseUrl(this.router.url).queryParams),
  ), { initialValue: this.router.parseUrl(this.router.url).queryParams });
  readonly activeId = computed(() => {
    const id: unknown = this.queryParams()['dialog'];
    return typeof id === 'string' && /^[a-z][a-z-]{0,39}$/.test(id) ? id : null;
  });
  readonly modalMode = computed(() => this.queryParams()['dialogMode'] === 'modal');
  private readonly page = signal<{ owner: object; id: string; template: TemplateRef<unknown> } | null>(null);
  readonly pageTemplate = computed(() => {
    const page = this.page();
    return page && this.isPage(page.id) ? page.template : null;
  });

  isActive(id: string): boolean {
    return !!id && this.activeId() === id;
  }

  isPage(id: string): boolean {
    return this.isActive(id) && !this.modalMode();
  }

  open(id: string, queryParams: Params = {}, pageRoute: string[] = []): Promise<boolean> {
    return this.router.navigate(pageRoute, {
      queryParams: { ...queryParams, dialog: id }, queryParamsHandling: 'merge',
    });
  }

  collapse(id: string): void {
    if (this.isPage(id)) {
      void this.router.navigate([], { queryParams: { dialogMode: 'modal' }, queryParamsHandling: 'merge' });
    }
  }

  close(id: string): void {
    if (this.isActive(id)) {
      const queryParams: Params = { dialog: null, dialogMode: null };
      if (id === 'section') { queryParams['section'] = null; queryParams['group'] = null; }
      if (id === 'candidate') queryParams['candidate'] = null;
      void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
    }
  }

  attach(owner: object, id: string, template: TemplateRef<unknown>): void {
    this.page.set({ owner, id, template });
  }

  detach(owner: object): void {
    if (this.page()?.owner === owner) this.page.set(null);
  }
}
