import { VoteFlowData, VoteFlowNode } from '../models/election-context.models';

export interface VoteOrigin {
  source: VoteFlowNode;
  votes: number;
  share: number;
}

export interface VoteOriginGroup {
  target: VoteFlowNode;
  rows: VoteOrigin[];
}

export function incomingVoteFlows(data: VoteFlowData, targetId: string): VoteOrigin[] {
  if (!data.toNodes.some(node => node.id === targetId)) return [];
  const sources = new Map(data.fromNodes.map(node => [node.id, node]));
  const incoming = data.flows.filter(flow => flow.to === targetId).flatMap(flow => {
    const source = sources.get(flow.from);
    return source && flow.votes > 0 ? [{ source, votes: flow.votes }] : [];
  }).sort((left, right) => right.votes - left.votes || left.source.name.localeCompare(right.source.name, 'bg'));
  const total = incoming.reduce((sum, flow) => sum + flow.votes, 0);
  return incoming.map(flow => ({ ...flow, share: total > 0 ? flow.votes / total * 100 : 0 }));
}

export function layoutVoteOrigins(groups: VoteOriginGroup[]) {
  const sourceTotals = new Map<string, { node: VoteFlowNode; total: number }>();
  const targets = groups.map(group => {
    let total = 0;
    for (const row of group.rows) {
      const source = sourceTotals.get(row.source.id) ?? { node: row.source, total: 0 };
      source.total += row.votes;
      sourceTotals.set(row.source.id, source);
      total += row.votes;
    }
    return { node: group.target, total };
  }).filter(target => target.total > 0);
  const sources = [...sourceTotals.values()].sort((left, right) => right.total - left.total || left.node.name.localeCompare(right.node.name, 'bg'));
  const height = Math.max(440, Math.max(sources.length, targets.length) * 30);
  const gap = 18;
  const total = targets.reduce((sum, target) => sum + target.total, 0);
  const bandHeight = height - 24 - Math.max(0, Math.max(sources.length, targets.length) - 1) * gap;
  const scale = total > 0 ? bandHeight / total : 0;
  const positionNodes = (nodes: typeof sources) => {
    let y = (height - total * scale - Math.max(0, nodes.length - 1) * gap) / 2;
    return nodes.map(item => {
      const thickness = item.total * scale;
      const result = { ...item, y, height: thickness, center: y + thickness / 2, offset: 0 };
      y += thickness + gap;
      return result;
    });
  };
  const sourceNodes = positionNodes(sources);
  const targetNodes = positionNodes(targets);
  const sourcesById = new Map(sourceNodes.map(source => [source.node.id, source]));
  const targetsById = new Map(targetNodes.map(target => [target.node.id, target]));
  const ribbons = groups.flatMap(group => group.rows.map(row => {
    const source = sourcesById.get(row.source.id)!;
    const target = targetsById.get(group.target.id)!;
    const sourceY = source.y + source.offset;
    const targetY = target.y + target.offset;
    const thickness = row.votes * scale;
    source.offset += thickness;
    target.offset += thickness;
    return { ...row, target: group.target, y: sourceY, height: thickness,
      path: `M 300 ${sourceY} C 530 ${sourceY}, 530 ${targetY}, 760 ${targetY} L 760 ${targetY + thickness} C 530 ${targetY + thickness}, 530 ${sourceY + thickness}, 300 ${sourceY + thickness} Z` };
  }));
  return { height, bandHeight: total > 0 ? bandHeight : 0, sources: sourceNodes, targets: targetNodes, ribbons };
}
