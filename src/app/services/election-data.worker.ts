import { decodeElectionData, transferableElectionColumns } from './election-data-parser';
import type { ElectionDataRequest, ElectionDataResponse } from './election-data-parser';

addEventListener('message', ({ data }: MessageEvent<ElectionDataRequest>) => {
  try {
    const payload = decodeElectionData(data.buffer, data.url);
    const buffers = transferableElectionColumns(payload);
    postMessage({ id: data.id, payload } satisfies ElectionDataResponse, buffers);
  } catch (error: unknown) {
    postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) } satisfies ElectionDataResponse);
  }
});
