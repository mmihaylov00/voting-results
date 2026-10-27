import { VoteFlowData } from '../models/election-context.models';
import { incomingVoteFlows, layoutVoteOrigins } from './vote-flow.util';

const data: VoteFlowData = {
  date: '2026.04.19', from: '2024.10.27', generatedAt: '2026-07-30',
  source: { publisher: 'Наясно', url: 'https://example.com/flows', repository: 'https://github.com/atanasster/electionsbg', retrievedAt: '2026-10-26', sha256: 'test' },
  fromNodes: [{ id: 'a', name: 'Партия А', votes: 50, pseudo: false }, { id: 'other', name: 'Не гласували', votes: 60, pseudo: true }],
  toNodes: [{ id: 'b', name: 'Партия Б', votes: 100, pseudo: false }, { id: 'c', name: 'Партия В', votes: 10, pseudo: false }],
  flows: [{ from: 'a', to: 'b', votes: 38 }, { from: 'other', to: 'b', votes: 60 }, { from: 'a', to: 'c', votes: 10 }],
  sectionsMatched: 100, sectionsDropped: 2, residual: 0.0001, maxNodeExcess: 0,
};

describe('vote origin presentation', () => {
  it('uses only the selected destination and bases shares on published flows, including non-voters', () => {
    const rows = incomingVoteFlows(data, 'b');
    expect(rows.map(row => row.source.id)).toEqual(['other', 'a']);
    expect(rows.reduce((sum, row) => sum + row.votes, 0)).toBe(98);
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100);
    expect(rows[0].share).toBeCloseTo(60 / 98 * 100);
    expect(incomingVoteFlows(data, 'missing')).toEqual([]);
  });

  it('preserves proportional band thickness and separates source labels', () => {
    const rows = incomingVoteFlows(data, 'b');
    const layout = layoutVoteOrigins([{ target: data.toNodes[0], rows }]);
    expect(layout.ribbons[0].height / layout.ribbons[1].height).toBeCloseTo(60 / 38);
    expect(layout.ribbons.reduce((sum, ribbon) => sum + ribbon.height, 0)).toBeCloseTo(layout.bandHeight);
    expect(layout.sources[1].y).toBeGreaterThan(layout.sources[0].y + layout.sources[0].height);
    expect(layout.ribbons.every(ribbon => ribbon.y >= 0 && ribbon.y + ribbon.height <= layout.height)).toBe(true);
    expect(layout.ribbons.every(ribbon => !ribbon.path.includes('NaN'))).toBe(true);
    expect(layoutVoteOrigins([]).bandHeight).toBe(0);
    expect(data.flows[0].votes).toBe(38);
  });

  it('lays out all destinations on one proportional scale without overlapping nodes', () => {
    const groups = data.toNodes.map(target => ({ target, rows: incomingVoteFlows(data, target.id) }));
    const layout = layoutVoteOrigins(groups);
    expect(layout.targets.map(target => target.node.id)).toEqual(['b', 'c']);
    expect(layout.sources).toHaveLength(2);
    expect(layout.ribbons).toHaveLength(3);
    expect(layout.ribbons[0].height / layout.ribbons[2].height).toBeCloseTo(60 / 10);
    for (const nodes of [layout.sources, layout.targets]) {
      expect(nodes.reduce((sum, node) => sum + node.height, 0)).toBeCloseTo(layout.bandHeight);
      expect(nodes[1].y).toBeGreaterThan(nodes[0].y + nodes[0].height);
      expect(nodes.every(node => node.y >= 0 && node.y + node.height <= layout.height)).toBe(true);
      for (const node of nodes) expect(node.offset).toBeCloseTo(node.height);
    }
    expect(layout.ribbons.every(ribbon => !/NaN|Infinity/.test(ribbon.path))).toBe(true);
    expect(groups.map(group => group.rows.reduce((sum, row) => sum + row.share, 0))).toEqual([100, 100]);
  });
});
