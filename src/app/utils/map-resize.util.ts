import type { Map } from 'leaflet';

export function resizeMapPreservingView(map: Map | undefined): void {
  if (!map) return;
  const size = map.getSize();
  const zoom = map.getZoom();
  const center = Number.isFinite(zoom) ? map.getCenter() : null;
  map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
  if (center && !size.equals(map.getSize())) {
    // Leaflet's reset option avoids pixel rounding in its pan optimization.
    const viewOptions = { animate: false, reset: true };
    map.setView(center, zoom, viewOptions);
  }
}
