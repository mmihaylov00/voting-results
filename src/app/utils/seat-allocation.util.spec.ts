import { Region } from '../models/election.models';
import officialSeats from '../../assets/parliament-seats.json';
import {
  allocateSeats, buildNationalBallots, coalitionSeats, NationalBallot,
  parseSeatThreshold,
} from './seat-allocation.util';

const ballot = (id: string, votes: number, eligible = true): NationalBallot => ({ id, name: `Партия ${id}`, votes, eligible });
const region = (partyVotes: Record<string, number>): Region => ({ id: '1', name: 'Област', total: 1000, voted: 500, partyVotes });

describe('national seat allocation', () => {
  it('includes local ballots in the denominator and excludes the synthetic others bucket', () => {
    const rows = buildNationalBallots([region({ '0': 500, '1': 96, '2': 4, '25': 1 })], { '0': 'Други', '1': 'Партия 1', '2': 'Партия 2' });
    expect(rows.map((row) => row.id)).toEqual(['1', '2', '25']);
    expect(rows.find((row) => row.id === '25')?.eligible).toBe(false);
    const result = allocateSeats(rows);
    expect(result.totalVotes).toBe(101);
    expect(result.rows.find((row) => row.id === '2')?.passedThreshold).toBe(false);
    expect(result.rows.find((row) => row.id === '1')?.seats).toBe(240);
  });

  it('treats an explicit initiative committee as a local ballot without misclassifying a party name', () => {
    const rows = buildNationalBallots([region({ '1': 20, '2': 20 })], { '1': 'ИК Иван Иванов', '2': 'ДВИЖЕНИЕ НА НЕПАРТИЙНИТЕ КАНДИДАТИ' });
    expect(rows.find((row) => row.id === '1')?.eligible).toBe(false);
    expect(rows.find((row) => row.id === '2')?.eligible).toBe(true);
  });

  it('includes exactly four percent and awards the largest remainder', () => {
    const result = allocateSeats([ballot('1', 960), ballot('2', 40)]);
    expect(result.rows.map((row) => row.seats)).toEqual([230, 10]);
    expect(result.rows.every((row) => row.passedThreshold)).toBe(true);
    expect(result.hasRemainderTie).toBe(false);
  });

  it('uses decimal thresholds without rounding shares before qualification', () => {
    const result = allocateSeats([ballot('1', 959), ballot('2', 41)], 4.1);
    expect(result.rows[1].passedThreshold).toBe(true);
    expect(allocateSeats([ballot('1', 959), ballot('2', 41)], 4.11).rows[1].passedThreshold).toBe(false);
  });

  it('always conserves 240 seats when at least one party qualifies', () => {
    for (const threshold of [0, 1, 4, 10, 50]) {
      const result = allocateSeats([ballot('1', 612), ballot('2', 221), ballot('3', 123), ballot('4', 44)], threshold);
      expect(result.rows.reduce((sum, row) => sum + row.seats, 0)).toBe(240);
    }
  });

  it('uses a stable ballot order for tied remainders and exposes the tie', () => {
    const result = allocateSeats(['7', '5', '3', '1', '6', '4', '2'].map((id) => ballot(id, 1)), 0);
    expect(result.rows.filter((row) => row.seats === 35).map((row) => row.id).sort()).toEqual(['1', '2']);
    expect(result.hasRemainderTie).toBe(true);
  });

  it('handles no votes, zero-vote parties, and no qualifying party', () => {
    expect(allocateSeats([]).rows).toEqual([]);
    expect(allocateSeats([ballot('1', 0)], 0).rows[0].seats).toBe(0);
    expect(allocateSeats([ballot('1', 50), ballot('2', 50)], 60).representedVotes).toBe(0);
  });

  it('rejects invalid votes, duplicated ballots, and invalid thresholds', () => {
    for (const votes of [-1, 1.5, NaN, Infinity]) expect(() => allocateSeats([ballot('1', votes)])).toThrow();
    expect(() => allocateSeats([ballot('1', 1), ballot('1', 2)])).toThrow();
    for (const threshold of [-1, 101, NaN, Infinity, 4.111]) expect(() => allocateSeats([], threshold)).toThrow();
    expect(() => buildNationalBallots([region({ '1': -1 })], { '1': 'Партия' })).toThrow();
  });

  it('matches the independently published 2026 CIK mandate totals', () => {
    const votes = [23861, 10032, 18640, 104506, 97753, 4392, 408846, 137940, 4358, 9761, 50759, 18999, 6221, 100572, 433755, 1840, 230693, 9804, 17263, 93559, 1444920, 1897, 3027, 4665, 2093];
    const rows = allocateSeats(votes.map((votes, index) => ballot(String(index + 1), votes, index !== 24))).rows;
    expect(Object.fromEntries(rows.filter((row) => row.seats).map((row) => [row.id, row.seats])))
      .toEqual(officialSeats['2026.04.19'].seats);
    expect(coalitionSeats(rows, new Set(['7', '8', '15', '17']))).toBe(109);
    expect(coalitionSeats(rows, new Set(['21', 'unknown']))).toBe(131);
  });
});

describe('simulator URL threshold', () => {
  it('accepts bounded one-decimal percentages and defaults malformed input', () => {
    expect(parseSeatThreshold('0')).toBe(0);
    expect(parseSeatThreshold('3.5')).toBe(3.5);
    expect(parseSeatThreshold('10')).toBe(10);
    for (const raw of [null, '', ' ', '-1', '11', 'Infinity', '4.55', '4x']) expect(parseSeatThreshold(raw)).toBe(4);
  });
});
