import { Region } from '../models/election.models';
import { getBelowThresholdPartyIds } from './below-threshold.util';

const region = (id: string, partyVotes: Record<string, number>): Region => ({
  id, name: 'Област', total: 1000, voted: 500, partyVotes,
});
const parties = { '1': 'Партия 1', '2': 'Партия 2' };

describe('parties below the national parliamentary threshold', () => {
  it('sums domestic and abroad votes before deciding qualification', () => {
    const domestic = region('1', { '1': 49, '2': 1 });
    const abroad = region('32', { '1': 47, '2': 3 });
    expect(getBelowThresholdPartyIds([domestic], parties)).toEqual(new Set(['2']));
    expect(getBelowThresholdPartyIds([domestic, abroad], parties)).toEqual(new Set());
  });

  it('does not mark a party at exactly four percent as below threshold', () => {
    expect(getBelowThresholdPartyIds([region('1', { '1': 96, '2': 4 })], parties)).toEqual(new Set());
    expect(getBelowThresholdPartyIds([region('1', { '1': 97, '2': 3 })], parties)).toEqual(new Set(['2']));
  });

  it('includes local independent ballots in the denominator without marking them as parties', () => {
    expect(getBelowThresholdPartyIds([region('1', { '1': 96, '2': 4, '25': 1 })], parties))
      .toEqual(new Set(['2']));
    expect(getBelowThresholdPartyIds([region('1', { '1': 96, '2': 4, '25': 1 })], { ...parties, '25': 'ИК Иван Иванов' }))
      .toEqual(new Set(['2']));
  });

  it('excludes no-support and invalid ballots and the synthetic others bucket', () => {
    const data = { ...region('1', { '0': 1000, '1': 96, '2': 4 }), noVotes: 1000, discardedVotes: 1000 };
    expect(getBelowThresholdPartyIds([data], { ...parties, '0': 'Други' })).toEqual(new Set());
  });

  it('distinguishes absent usable data from a known empty below-threshold set', () => {
    expect(getBelowThresholdPartyIds([], parties)).toBeNull();
    expect(getBelowThresholdPartyIds([region('1', { '1': 0, '2': 0 })], parties)).toBeNull();
    expect(getBelowThresholdPartyIds([region('1', { '25': 100 })], {})).toBeNull();
    expect(getBelowThresholdPartyIds([region('1', { '1': 50, '2': 50 })], parties)).toEqual(new Set());
  });
});
