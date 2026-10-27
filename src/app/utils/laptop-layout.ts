import { DestroyRef, inject, signal } from '@angular/core';

export function observeLaptopLayout() {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
  const matches = signal(query?.matches ?? false);
  const update = (event: MediaQueryListEvent) => matches.set(event.matches);
  query?.addEventListener('change', update);
  inject(DestroyRef).onDestroy(() => query?.removeEventListener('change', update));
  return matches.asReadonly();
}
