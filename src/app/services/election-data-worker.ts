import type { ElectionDataRequest, ElectionDataResponse } from './election-data-parser';

export class ElectionWorkerUnavailableError extends Error {}

export class ElectionDataWorker {
  private worker: Worker | null = null;
  private unavailable = false;
  private nextId = 0;
  private pending = new Map<number, { resolve: (payload: unknown) => void; reject: (error: Error) => void }>();

  parse(buffer: ArrayBuffer, url: string): Promise<unknown> | null {
    if (this.unavailable || typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./election-data.worker', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }: MessageEvent<ElectionDataResponse>) => {
          const request = this.pending.get(data.id);
          if (!request) return;
          this.pending.delete(data.id);
          if (data.error !== undefined) request.reject(new Error(data.error));
          else request.resolve(data.payload);
        };
        this.worker.onerror = () => this.disable();
        this.worker.onmessageerror = () => this.disable();
      } catch {
        this.unavailable = true;
        return null;
      }
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, buffer, url } satisfies ElectionDataRequest, [buffer]);
      } catch {
        this.disable();
      }
    });
  }

  destroy(): void {
    this.disable();
  }

  private disable(): void {
    this.unavailable = true;
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) {
      request.reject(new ElectionWorkerUnavailableError('Election data worker is unavailable.'));
    }
    this.pending.clear();
  }
}
