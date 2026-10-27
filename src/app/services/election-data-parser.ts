import * as pako from 'pako';

export type ElectionDataRequest = { id: number; buffer: ArrayBuffer; url: string };
export type ElectionDataResponse = { id: number; payload?: unknown; error?: string };

export function decodeElectionData(buffer: ArrayBuffer, url: string): unknown {
  try {
    const bytes = new Uint8Array(buffer);
    const firstByte = bytes.subarray(0, 64).find(byte => ![0x20, 0x0a, 0x0d, 0x09].includes(byte));
    if (firstByte === 0x3c) throw new Error(`HTML response from ${url}`);
    const decompressed = bytes[0] === 0x1f && bytes[1] === 0x8b ? pako.ungzip(bytes) : bytes;
    return JSON.parse(new TextDecoder().decode(decompressed));
  } catch (error: unknown) {
    throw new Error(`Error decoding election data from ${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Transfer numeric columns instead of cloning their backing storage into the UI thread. */
export function transferableElectionColumns(payload: unknown): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  if (!payload || typeof payload !== 'object' || !('version' in payload) || payload.version !== 2
    || !('sections' in payload) || !payload.sections || typeof payload.sections !== 'object') return buffers;
  const sections = payload.sections as Record<string, unknown>;
  for (const [name, values] of Object.entries(sections)) {
    if (!Array.isArray(values) || !values.length || typeof values[0] !== 'number') continue;
    const column = new Float64Array(values);
    sections[name] = column;
    buffers.push(column.buffer);
  }
  return buffers;
}
