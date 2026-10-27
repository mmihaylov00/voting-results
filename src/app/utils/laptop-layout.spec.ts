import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { observeLaptopLayout } from './laptop-layout';

describe('laptop layout', () => {
  it('tracks the laptop breakpoint and removes its listener on destruction', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => query));
    try {
      TestBed.configureTestingModule({});
      const laptop = TestBed.runInInjectionContext(observeLaptopLayout);
      expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
      expect(laptop()).toBe(false);
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent);
      expect(laptop()).toBe(true);
      TestBed.resetTestingModule();
      expect(listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
