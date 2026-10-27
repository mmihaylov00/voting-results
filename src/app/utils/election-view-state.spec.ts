import { decodeElectionViewState, decodeSectionScope, encodeElectionViewState, encodeSectionScope } from './election-view-state';

describe('shareable election view', () => {
  it('round-trips filters, columns, place selection and candidate state', () => {
    const state = decodeElectionViewState(JSON.stringify({
      view: 'candidates', panel: 'comparison', map: true, party: '7', search: 'София', tab: 'risky',
      activity: null, operator: 'gte', types: ['normal'], risk: 'any', categories: ['R1'], parties: ['7', '8'],
      candidateSearch: 'Иван', candidateParties: ['7'], preference: 50, preferenceOperator: 'gte', leaders: true,
      candidateRisk: 'none', candidateCategories: ['R5'], columns: ['sectionId'], candidateColumns: ['candidateName'],
      sort: 'voted', ascending: false, candidateSort: 'total', candidateAscending: true,
      selection: { kind: 'settlement', label: 'София', sectionIds: '010000001~010000003' },
    }))!;
    expect(decodeElectionViewState(encodeElectionViewState(state))).toEqual(state);
    expect(state.selection?.sectionIds).toEqual(['010000001', '010000002', '010000003']);
  });

  it('compresses a regional selection and preserves leading zeros', () => {
    const ids = Array.from({ length: 500 }, (_, i) => String(10000000 + i).padStart(9, '0'));
    expect(encodeSectionScope(ids)).toBe('010000000~010000499');
    expect(decodeSectionScope(encodeSectionScope(ids))).toEqual(ids);
  });

  it('rejects malformed and unbounded scopes', () => {
    for (const value of ['1~999999999', '02~01', '1~02', '1~2~3', '<script>', ',']) expect(decodeSectionScope(value)).toBeNull();
    for (const value of ['', '{', 'null', '[]', '0']) expect(decodeElectionViewState(value)).toBeNull();
  });

  it('sanitizes unknown options and invalid numbers', () => {
    const state = decodeElectionViewState('{"view":"bogus","activity":-1,"preference":"NaN","categories":["R1","R99",7],"party":{},"selection":{"kind":"bogus","sectionIds":"1"}}')!;
    expect(state.view).toBe('sections');
    expect(state.activity).toBe(100);
    expect(state.preference).toBe(0);
    expect(state.categories).toEqual(['R1']);
    expect(state.party).toBeNull();
    expect(state.selection).toBeNull();
  });
});
