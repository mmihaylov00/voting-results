import * as pako from 'pako';
import { decodeElectionData, transferableElectionColumns } from './election-data-parser';

describe('election data parser', () => {
  it('decodes plain and gzip JSON without losing Unicode', () => {
    const payload = { parties: { '1': 'Партия' } };
    const plain = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = pako.gzip(plain);
    expect(decodeElectionData(plain.buffer, '/data/plain')).toEqual(payload);
    expect(decodeElectionData(compressed.buffer, '/data/compressed')).toEqual(payload);
  });

  it('rejects HTML redirects and corrupt JSON', () => {
    expect(() => decodeElectionData(new TextEncoder().encode(' \n<html>').buffer, '/data/missing'))
      .toThrow('HTML response from /data/missing');
    expect(() => decodeElectionData(new TextEncoder().encode('{broken').buffer, '/data/broken')).toThrow();
  });

  it('transfers numeric columns with exact values and preserves string dictionaries', () => {
    const names = ['София', 'Пловдив'];
    const payload = { version: 2, sections: {
      count: 2, dicts: { cityName: names }, sectionId: ['01', '02'],
      total: [123, 0], longitude: [23.123456, 24.123456], empty: [],
    } };
    const buffers = transferableElectionColumns(payload);
    expect(buffers).toHaveLength(2);
    expect(payload.sections.total).toBeInstanceOf(Float64Array);
    expect(Array.from(payload.sections.total)).toEqual([123, 0]);
    expect(Array.from(payload.sections.longitude)).toEqual([23.123456, 24.123456]);
    expect(payload.sections.dicts.cityName).toBe(names);
    expect(payload.sections.sectionId).toEqual(['01', '02']);
    expect(payload.sections.empty).toEqual([]);
    expect(transferableElectionColumns({ version: 1, sections: [] })).toEqual([]);
  });
});
