import { afterEach, beforeEach, vi } from 'vitest';

// CDK selects use browser layout APIs that jsdom does not implement.
HTMLElement.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal('matchMedia', vi.fn((query: string): MediaQueryList => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  })));
});
afterEach(() => vi.unstubAllGlobals());
