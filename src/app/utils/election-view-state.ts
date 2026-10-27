import { SectionTab, ViewMode } from '../models/election.models';
import { MapSelection } from './map-interaction.util';
import { ElectionPanel, isElectionTool } from './election-workspace.util';

export interface ElectionViewState {
  view: Exclude<ViewMode, 'map'>;
  panel: ElectionPanel;
  map: boolean;
  mapLevel: 'regions' | 'municipalities' | 'cities' | 'neighborhoods' | 'sections';
  party: string | null;
  search: string;
  tab: SectionTab;
  activity: number | null;
  operator: 'lte' | 'gte';
  types: string[];
  risk: 'any' | 'none' | null;
  categories: string[];
  parties: string[];
  candidateSearch: string;
  candidateParties: string[];
  preference: number | null;
  preferenceOperator: 'lte' | 'gte';
  leaders: boolean;
  candidateRisk: 'any' | 'none' | null;
  candidateCategories: string[];
  columns: string[];
  candidateColumns: string[];
  sort: string;
  ascending: boolean;
  candidateSort: string;
  candidateAscending: boolean;
  selection: MapSelection | null;
}

const TABS: SectionTab[] = ['all', 'target', 'swing', 'risky', 'outside', 'declining', 'dormant', 'flip', 'vanishing'];
const KINDS: MapSelection['kind'][] = ['region', 'municipality', 'settlement', 'neighborhood', 'section', 'country', 'city'];
const text = (value: unknown, limit = 200): string => typeof value === 'string' ? value.slice(0, limit) : '';
const list = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length <= 80))].slice(0, 200) : [];
const risk = (value: unknown) => value === 'any' || value === 'none' ? value : null;
const threshold = (value: unknown, fallback: number): number | null => value === null ? null : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000_000 ? value : fallback;

// Consecutive section IDs keep links to large selected regions compact.
export function encodeSectionScope(ids: string[]): string {
  const sorted = [...new Set(ids)].sort();
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    let last = first;
    while (/^\d{1,12}$/.test(first) && sorted[i + 1]?.length === first.length && Number(sorted[i + 1]) === Number(last) + 1) last = sorted[++i];
    ranges.push(first === last ? first : `${first}~${last}`);
  }
  return ranges.join(',');
}

export function decodeSectionScope(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.length > 32_000) return null;
  if (!value) return [];
  const ids: string[] = [];
  for (const part of value.split(',')) {
    const [first, last, extra] = part.split('~');
    if (!/^\d{1,12}$/.test(first) || extra !== undefined) return null;
    if (last === undefined) ids.push(first);
    else {
      if (!/^\d{1,12}$/.test(last) || last.length !== first.length) return null;
      const count = Number(last) - Number(first) + 1;
      if (count <= 0 || count + ids.length > 25_000) return null;
      for (let offset = 0; offset < count; offset++) ids.push(String(Number(first) + offset).padStart(first.length, '0'));
    }
    if (ids.length > 25_000) return null;
  }
  return [...new Set(ids)];
}

export function encodeElectionViewState(state: ElectionViewState): string {
  return JSON.stringify({ ...state, selection: state.selection ? { ...state.selection, sectionIds: encodeSectionScope(state.selection.sectionIds) } : null });
}

export function decodeElectionViewState(value: unknown): ElectionViewState | null {
  if (typeof value !== 'string' || value.length > 40_000) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch { return null; }
  let selection: MapSelection | null = null;
  if (raw['selection'] && typeof raw['selection'] === 'object') {
    const selected = raw['selection'] as Record<string, unknown>;
    const kind = KINDS.find(kind => kind === selected['kind']);
    const sectionIds = decodeSectionScope(selected['sectionIds']);
    if (kind && sectionIds) selection = { kind, label: text(selected['label'], 300), sectionIds };
  }
  return {
    view: raw['view'] === 'cities' || raw['view'] === 'municipalities' || raw['view'] === 'candidates' ? raw['view'] : 'sections',
    panel: raw['panel'] === 'stats' || raw['panel'] === 'history' || raw['panel'] === 'comparison'
      || typeof raw['panel'] === 'string' && isElectionTool(raw['panel']) ? raw['panel'] : 'results',
    map: raw['map'] === true,
    mapLevel: raw['mapLevel'] === 'regions' || raw['mapLevel'] === 'municipalities' || raw['mapLevel'] === 'neighborhoods' || raw['mapLevel'] === 'sections' ? raw['mapLevel'] : 'cities',
    party: text(raw['party'], 40) || null, search: text(raw['search']),
    tab: TABS.find(tab => tab === raw['tab']) ?? 'all', activity: threshold(raw['activity'], 100), operator: raw['operator'] === 'gte' ? 'gte' : 'lte',
    types: list(raw['types']), risk: risk(raw['risk']), categories: list(raw['categories']).filter(code => /^R[1-6]$/.test(code)),
    parties: list(raw['parties']), candidateSearch: text(raw['candidateSearch']), candidateParties: list(raw['candidateParties']),
    preference: threshold(raw['preference'], 0), preferenceOperator: raw['preferenceOperator'] === 'lte' ? 'lte' : 'gte', leaders: raw['leaders'] === true,
    candidateRisk: risk(raw['candidateRisk']), candidateCategories: list(raw['candidateCategories']).filter(code => /^R[1-6]$/.test(code)),
    columns: list(raw['columns']), candidateColumns: list(raw['candidateColumns']), sort: text(raw['sort'], 50), ascending: raw['ascending'] !== false,
    candidateSort: text(raw['candidateSort'], 50), candidateAscending: raw['candidateAscending'] === true, selection,
  };
}
