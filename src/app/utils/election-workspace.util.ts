import { ElectionType } from './election-type';

export type ElectionTool = 'risks' | 'geography' | 'polls' | 'mandates';
export type ElectionPanel = 'results' | 'stats' | 'history' | 'comparison' | ElectionTool;

const RISK_TAB = { id: 'risks', label: 'Повтарящи се рискове', icon: 'risks' } as const;
const NATIONAL_TABS = [
  { id: 'geography', label: 'География', icon: 'region' },
  { id: 'polls', label: 'Социологически агенции', icon: 'activity' },
  { id: 'mandates', label: 'Мандати и коалиции', icon: 'leading-party' },
] as const;

export function electionToolTabs(type: ElectionType, national: boolean) {
  return [RISK_TAB, ...(national && type === 'governmental' ? NATIONAL_TABS : [])];
}

export function isElectionTool(panel: string): panel is ElectionTool {
  return panel === 'risks' || NATIONAL_TABS.some(tab => tab.id === panel);
}

export function parseElectionPanel(value: unknown, type: ElectionType, national: boolean): ElectionPanel | null {
  return (['results', 'stats', 'history', 'comparison'] as const).find(panel => panel === value)
    ?? electionToolTabs(type, national).find(tab => tab.id === value)?.id ?? null;
}
