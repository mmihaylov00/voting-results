import { partyVoteTotals, sortPartiesByVotes } from './party-order.util';

describe('party vote ordering', () => {
  it('ranks by votes without mutating inputs and keeps ties and missing totals stable', () => {
    const parties = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
    const votes = { '1': 10, '2': 80, '3': 80, '4': 0 };
    expect(sortPartiesByVotes(parties, votes).map(party => party.id)).toEqual(['2', '3', '1', '4', '5']);
    expect(parties.map(party => party.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(votes).toEqual({ '1': 10, '2': 80, '3': 80, '4': 0 });
    expect(sortPartiesByVotes([], votes)).toEqual([]);
  });

  it('accepts totals on parties and gives explicit scope totals precedence, including zero', () => {
    const parties = [{ id: '1', total: 100 }, { id: '2', total: 20 }];
    expect(sortPartiesByVotes(parties).map(party => party.id)).toEqual(['1', '2']);
    expect(sortPartiesByVotes(parties, { '1': 0 }).map(party => party.id)).toEqual(['2', '1']);
  });

  it('aggregates both national region totals and detailed section votes', () => {
    const regions: { partyVotes: Record<string, number> }[] = [{ partyVotes: { '1': 40, '2': 10 } }, { partyVotes: { '2': 60 } }];
    expect(partyVoteTotals(regions)).toEqual({ '1': 40, '2': 70 });
    const sections: { partyVotes: Record<string, { total: number }> }[] = [{ partyVotes: { '1': { total: 15 }, '2': { total: 30 } } }, { partyVotes: { '1': { total: 20 } } }];
    expect(partyVoteTotals(sections)).toEqual({ '1': 35, '2': 30 });
    expect(sections[0].partyVotes['1'].total).toBe(15);
    expect(partyVoteTotals([])).toEqual({});
  });
});
