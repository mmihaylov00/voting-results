import { describe, expect, it } from 'vitest';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { candidateDelta, hasReviewFlag, jointVoteSummary } from './forensics-candidates.util';

describe('joint candidate and voter changes', () => {
  it('uses exactly the same eligible paired cohort and weighted electorate for all four changes', () => {
    const first = sectionFixture({ registered1: 100, registered2: 200, voted1: 50, voted2: 80,
      candidateChanges: [candidateFixture('4', 10, 30), candidateFixture('25', 10, 35)],
      addedReviewFlags: ['2026.10.25:added_exceed_signed'] });
    const second = sectionFixture({ sectionId: '2', registered1: 300, registered2: 300, voted1: 50, voted2: 100,
      candidateChanges: [candidateFixture('4', 5, 20), candidateFixture('25', 30, 70)] });
    const excluded = sectionFixture({ sectionId: '3', eligible: false, candidateChanges: [candidateFixture('4', 1, 1000), candidateFixture('25', 1, 1000)] });
    const missingPair = sectionFixture({ sectionId: '4', candidateChanges: [candidateFixture('4', 1, 1000)] });
    const summary = jointVoteSummary([first, second, excluded, missingPair]);
    expect(summary.n).toBe(2);
    expect(summary.deltaVoted).toBe(80);
    expect(summary.turnout1).toBe(25);
    expect(summary.turnout2).toBe(36);
    expect(summary.deltaTurnoutPp).toBe(11);
    expect(summary.candidates.map(candidate => candidate.deltaVotes)).toEqual([35, 65]);
    expect(hasReviewFlag(first)).toBe(true);
    expect(first.candidateChanges[0].deltaVotes).toBe(20);
  });

  it('keeps missing candidate counts unavailable and accepts genuine zero votes', () => {
    expect(candidateDelta(sectionFixture(), '4')).toBeNull();
    const zero = sectionFixture({ voted1: 0, voted2: 20, candidateChanges: [candidateFixture('4', 0, 10), candidateFixture('25', 0, 10)] });
    expect(jointVoteSummary([zero]).n).toBe(1);
    expect(jointVoteSummary([zero]).deltaVoted).toBe(20);
    expect(jointVoteSummary([]).deltaVoted).toBeNull();
    expect(jointVoteSummary([{ ...zero, registered1: 0 }]).n).toBe(0);
  });
});
