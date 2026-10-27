import { vi } from 'vitest';
import { ElectionDataWorker, ElectionWorkerUnavailableError } from './election-data-worker';
import type { ElectionDataRequest, ElectionDataResponse } from './election-data-parser';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<ElectionDataResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  respond(data: ElectionDataResponse) { this.onmessage?.({ data } as MessageEvent<ElectionDataResponse>); }
}

describe('ElectionDataWorker', () => {
  afterEach(() => { vi.unstubAllGlobals(); TestWorker.instances = []; });

  it('uses the fallback when workers are unavailable or cannot be constructed', () => {
    vi.stubGlobal('Worker', undefined);
    expect(new ElectionDataWorker().parse(new ArrayBuffer(1), '/data')).toBeNull();
    vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked'); } });
    expect(new ElectionDataWorker().parse(new ArrayBuffer(1), '/data')).toBeNull();
  });

  it('shares a worker, transfers buffers and matches out-of-order responses', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const parser = new ElectionDataWorker();
    const buffer = new ArrayBuffer(4);
    const first = parser.parse(buffer, '/first');
    const second = parser.parse(new ArrayBuffer(2), '/second');
    expect(TestWorker.instances).toHaveLength(1);
    const worker = TestWorker.instances[0];
    const [request, transfer] = worker.postMessage.mock.calls[0] as [ElectionDataRequest, ArrayBuffer[]];
    expect(request).toMatchObject({ id: 1, buffer, url: '/first' });
    expect(transfer).toEqual([buffer]);
    worker.respond({ id: 2, payload: { date: 'second' } });
    worker.respond({ id: 1, payload: { date: 'first' } });
    expect(await first).toEqual({ date: 'first' });
    expect(await second).toEqual({ date: 'second' });
    parser.destroy();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports parse errors and disables a failed worker so downloads can be retried safely', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const parser = new ElectionDataWorker();
    const corrupt = parser.parse(new ArrayBuffer(1), '/bad')!.catch(error => error);
    const worker = TestWorker.instances[0];
    worker.respond({ id: 1, error: 'Invalid JSON' });
    expect(await corrupt).toMatchObject({ message: 'Invalid JSON' });
    const interrupted = parser.parse(new ArrayBuffer(1), '/valid')!.catch(error => error);
    worker.onerror?.();
    expect(await interrupted).toBeInstanceOf(ElectionWorkerUnavailableError);
    expect(parser.parse(new ArrayBuffer(1), '/retry')).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
