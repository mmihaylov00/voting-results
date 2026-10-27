import { electionToolTabs, isElectionTool, parseElectionPanel } from './election-workspace.util';

describe('election workspace tabs', () => {
  it('places repeating risks first and limits the other tools to national parliamentary pages', () => {
    expect(electionToolTabs('governmental', true).map(tab => tab.id)).toEqual(['risks', 'geography', 'polls', 'mandates']);
    expect(electionToolTabs('governmental', false).map(tab => tab.id)).toEqual(['risks']);
    expect(electionToolTabs('presidential', true).map(tab => tab.id)).toEqual(['risks']);
    expect(electionToolTabs('presidential', false).map(tab => tab.id)).toEqual(['risks']);
  });

  it('validates shared tab selections against the election type and scope', () => {
    expect(parseElectionPanel('geography', 'governmental', true)).toBe('geography');
    expect(parseElectionPanel('geography', 'governmental', false)).toBeNull();
    expect(parseElectionPanel('mandates', 'presidential', true)).toBeNull();
    expect(parseElectionPanel('risks', 'presidential', false)).toBe('risks');
    expect(parseElectionPanel('comparison', 'presidential', false)).toBe('comparison');
    expect(parseElectionPanel('unknown', 'governmental', true)).toBeNull();
    expect(parseElectionPanel(['risks'], 'governmental', true)).toBeNull();
    expect(isElectionTool('comparison')).toBe(false);
    expect(isElectionTool('mandates')).toBe(true);
  });
});
