import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandidateVotes, Section } from '../models/election.models';
import { buildCandidateComparisonIndex, candidateComparisonKey } from './candidate-comparisons.util';

function candidate(overrides: Partial<CandidateVotes> = {}): CandidateVotes {
  return {
    candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия',
    total: 12, paper: 7, machine: 5, ...overrides,
  };
}

function section(votes: Record<string, CandidateVotes> = {}, regionId = '01'): Section {
  return {
    sectionId: '010000001', regionId, cityName: 'Град', sectionName: '', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 0, noVotes: 0, activityBp: 8000,
    topParties: [], partyVotes: {}, candidateVotes: votes,
  };
}

describe('historical candidate comparisons', () => {
  afterEach(() => vi.useRealTimers());

  it('aggregates all requested candidates in one pass and keeps party identities separate', async () => {
    const first = candidate();
    const second = candidate({ partyId: '2', partyName: 'Друга партия', total: 4, paper: 1, machine: 3 });
    const unseen = candidate({ candidateName: 'Без участие' });
    const zero = candidate({ candidateName: 'Нула', total: 0, paper: 0, machine: 0 });
    const votes = {
      first: candidate({ candidateName: ' ИВАН ИВАНОВ ', partyName: ' ПАРТИЯ ' }),
      duplicate: candidate({ total: 99, paper: 99, machine: 0 }),
      second,
      zero,
    };
    const readVotes = vi.fn(() => votes);
    const historicalSection = section();
    Object.defineProperty(historicalSection, 'candidateVotes', { get: readVotes });

    const results = await buildCandidateComparisonIndex([first, second, unseen, zero], {
      '2024.01.01': { sections: [historicalSection, section({ first, second })] },
      '2025.01.01': { sections: [section({ second })] },
      '2026.01.01': { sections: [section({ first: candidate({ total: 1000 }) })] },
    }, '2026.01.01', 'all');

    expect(readVotes).toHaveBeenCalledTimes(1);
    expect(results.get(candidateComparisonKey(first))).toEqual({
      comparisons: [{ v: 24, d: '2024.01.01' }],
      paperComparisons: [{ v: 14, d: '2024.01.01' }],
      machineComparisons: [{ v: 10, d: '2024.01.01' }],
    });
    expect(results.get(candidateComparisonKey(second))).toEqual({
      comparisons: [{ v: 4, d: '2025.01.01' }, { v: 8, d: '2024.01.01' }],
      paperComparisons: [{ v: 1, d: '2025.01.01' }, { v: 2, d: '2024.01.01' }],
      machineComparisons: [{ v: 3, d: '2025.01.01' }, { v: 6, d: '2024.01.01' }],
    });
    expect(results.get(candidateComparisonKey(unseen))?.comparisons).toEqual([]);
    expect(results.get(candidateComparisonKey(zero))?.comparisons).toEqual([]);
  });

  it('filters regions before reading candidate maps and handles missing preference data', async () => {
    const first = candidate();
    const excluded = section({ first }, '02');
    const readExcludedVotes = vi.fn(() => ({ first }));
    Object.defineProperty(excluded, 'candidateVotes', { get: readExcludedVotes });
    const missing = section();
    missing.candidateVotes = undefined;
    const results = await buildCandidateComparisonIndex([first], {
      '2024.01.01': { sections: [section({ first }), excluded, missing] },
    }, '2026.01.01', '01');

    expect(results.get(candidateComparisonKey(first))?.comparisons).toEqual([{ v: 12, d: '2024.01.01' }]);
    expect(readExcludedVotes).not.toHaveBeenCalled();
  });

  it('yields between section batches and does not mutate candidate input', async () => {
    vi.useFakeTimers();
    const first = candidate();
    const sections = Array.from({ length: 101 }, () => section({ first }));
    const pending = buildCandidateComparisonIndex([first], {
      '2024.01.01': { sections },
    }, '2026.01.01');
    let complete = false;
    void pending.then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    await vi.runAllTimersAsync();
    expect((await pending).get(candidateComparisonKey(first))?.comparisons)
      .toEqual([{ v: 1212, d: '2024.01.01' }]);
    expect(first).not.toHaveProperty('comparisons');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips the archive when no candidates are requested', async () => {
    const readVotes = vi.fn(() => ({ first: candidate() }));
    const historicalSection = section();
    Object.defineProperty(historicalSection, 'candidateVotes', { get: readVotes });
    expect(await buildCandidateComparisonIndex([], { '2024.01.01': { sections: [historicalSection] } }, '2026.01.01'))
      .toEqual(new Map());
    expect(readVotes).not.toHaveBeenCalled();
  });

  it('stops an obsolete scan at the next batch boundary', async () => {
    vi.useFakeTimers();
    const first = candidate();
    const readVotes = vi.fn(() => ({ first }));
    const historicalSection = section();
    Object.defineProperty(historicalSection, 'candidateVotes', { get: readVotes });
    const controller = new AbortController();
    const pending = buildCandidateComparisonIndex([first], {
      '2024.01.01': { sections: Array.from({ length: 101 }, () => historicalSection) },
    }, '2026.01.01', 'all', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    expect(readVotes).toHaveBeenCalledTimes(50);
    controller.abort();
    await vi.runAllTimersAsync();
    await rejected;
    expect(readVotes).toHaveBeenCalledTimes(50);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not inspect an archive when already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('Replaced scan');
    controller.abort(reason);
    const readVotes = vi.fn(() => ({ first: candidate() }));
    const historicalSection = section();
    Object.defineProperty(historicalSection, 'candidateVotes', { get: readVotes });

    await expect(buildCandidateComparisonIndex([candidate()], {
      '2024.01.01': { sections: [historicalSection] },
    }, '2026.01.01', 'all', controller.signal)).rejects.toBe(reason);
    expect(readVotes).not.toHaveBeenCalled();
  });
});
