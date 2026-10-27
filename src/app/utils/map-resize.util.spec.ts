// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as L from 'leaflet';
import { resizeMapPreservingView } from './map-resize.util';

describe('map resize', () => {
  it('keeps the geographic center and zoom when the container changes size', () => {
    const container = document.createElement('div');
    document.body.append(container);
    let width = 620;
    let height = 405;
    Object.defineProperties(container, {
      clientWidth: { get: () => width }, clientHeight: { get: () => height },
    });
    const map = L.map(container, { zoomAnimation: false, fadeAnimation: false }).setView([42.7, 25.3], 7);
    const center = map.getCenter();
    try {
      width = 900;
      height = 620;
      resizeMapPreservingView(map);
      expect(map.getCenter().equals(center, 1e-8)).toBe(true);
      expect(map.getZoom()).toBe(7);
      expect(map.getSize()).toEqual(L.point(width, height));
      width = 350;
      height = 320;
      resizeMapPreservingView(map);
      expect(map.getCenter().equals(center, 1e-8)).toBe(true);
      expect(map.getZoom()).toBe(7);
    } finally {
      map.remove();
      container.remove();
    }
  });

  it('handles a map before its first view is available', () => {
    const container = document.createElement('div');
    const map = L.map(container);
    try {
      expect(() => resizeMapPreservingView(map)).not.toThrow();
      expect(() => resizeMapPreservingView(undefined)).not.toThrow();
    } finally {
      map.remove();
    }
  });
});
