import { getPartyColor } from './party-colors';
import * as L from 'leaflet';

export type MapMetric =
  | 'leading-party'
  | 'leading-preference'
  | 'activity'
  | 'risks'
  | 'party-votes'
  | 'invalid-votes'
  | 'no-votes'
  | 'machine-vs-paper'
  | 'winner-margin';

export interface MapPartyLeader {
  partyId: string;
  partyName: string;
  total: number;
}

export interface MapPreferenceLeader {
  candidateId: string;
  candidateName: string;
  partyId: string;
  partyName: string;
  total: number;
}

export interface MapAggregate {
  total: number;
  voted: number;
  discardedVotes: number;
  noVotes: number;
  totalPaper: number;
  totalMachine: number;
  totalElectors: number;
  riskScore: number;
  partyTotals: Record<string, number>;
  leadingParty?: MapPartyLeader;
  leadingPreference?: MapPreferenceLeader;
}

export class MapMetricHelper {
  static getFillColor(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    isDark: boolean,
    selectedPartyId?: string | null,
    partiesById: Record<string, string> = {}
  ): string {
    if (!aggregate) {
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (metric === 'leading-preference') {
      return getPartyColor(aggregate.leadingPreference?.partyName, isDark);
    }

    if (metric === 'activity') {
      const activity = aggregate.totalElectors > 0 ? (aggregate.voted / aggregate.totalElectors) : 0;
      if (activity > 0.6) return '#166534';
      if (activity > 0.5) return '#15803d';
      if (activity > 0.4) return '#16a34a';
      if (activity > 0.3) return '#22c55e';
      if (activity > 0.2) return '#4ade80';
      if (activity > 0.1) return '#86efac';
      return '#bbf7d0';
    }

    if (metric === 'risks') {
      const riskScore = aggregate.riskScore || 0;
      if (riskScore > 20) return '#991b1b';
      if (riskScore > 15) return '#b91c1c';
      if (riskScore > 10) return '#dc2626';
      if (riskScore > 5) return '#ef4444';
      if (riskScore > 2) return '#f87171';
      if (riskScore > 0) return '#fca5a5';
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (metric === 'invalid-votes') {
      const invalidShare = aggregate.total > 0 ? (aggregate.discardedVotes / aggregate.total) : 0;
      if (invalidShare > 0.15) return '#991b1b';
      if (invalidShare > 0.10) return '#b91c1c';
      if (invalidShare > 0.07) return '#dc2626';
      if (invalidShare > 0.05) return '#ef4444';
      if (invalidShare > 0.03) return '#f87171';
      if (invalidShare > 0.01) return '#fca5a5';
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (metric === 'no-votes') {
      const noVotesShare = aggregate.total > 0 ? (aggregate.noVotes / aggregate.total) : 0;
      if (noVotesShare > 0.10) return '#6b21a8';
      if (noVotesShare > 0.07) return '#86198f';
      if (noVotesShare > 0.05) return '#a21caf';
      if (noVotesShare > 0.03) return '#c026d3';
      if (noVotesShare > 0.02) return '#d946ef';
      if (noVotesShare > 0.01) return '#e879f9';
      return isDark ? '#334155' : '#cbd5e1';
    }

    if (metric === 'machine-vs-paper') {
      const machine = aggregate.totalMachine || 0;
      const paper = aggregate.totalPaper || 0;
      const total = machine + paper;
      if (total === 0) return isDark ? '#334155' : '#cbd5e1';

      const machineShare = machine / total;
      if (machineShare > 0.9) return '#1e3a8a';
      if (machineShare > 0.7) return '#1d4ed8';
      if (machineShare > 0.55) return '#3b82f6';
      if (machineShare > 0.45) return '#94a3b8';
      if (machineShare > 0.3) return '#f97316';
      if (machineShare > 0.1) return '#c2410c';
      return '#7c2d12';
    }

    if (metric === 'winner-margin') {
      const parties = Object.entries(aggregate.partyTotals)
        .sort((a, b) => b[1] - a[1]);
      if (parties.length < 2 || aggregate.total === 0) return isDark ? '#334155' : '#cbd5e1';

      const margin = (parties[0][1] - parties[1][1]) / aggregate.total;
      if (margin > 0.4) return '#312e81';
      if (margin > 0.3) return '#3730a3';
      if (margin > 0.2) return '#4338ca';
      if (margin > 0.1) return '#4f46e5';
      if (margin > 0.05) return '#6366f1';
      return '#818cf8';
    }

    if (metric === 'party-votes' && selectedPartyId) {
      const partyName = partiesById[selectedPartyId] || selectedPartyId;
      return getPartyColor(partyName, isDark);
    }

    return getPartyColor(aggregate.leadingParty?.partyName, isDark);
  }

  static buildMetricTooltip(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    header: string,
    showPreferences: boolean = true
  ): string {
    if (!aggregate) return header;

    if (metric === 'leading-preference' && aggregate.leadingPreference) {
      return `${header}<br/>Води преференция: ${aggregate.leadingPreference.candidateName}<br/>${aggregate.leadingPreference.partyName} • ${aggregate.leadingPreference.total.toLocaleString('bg-BG')} гласа`;
    }

    if (metric === 'activity') {
      const activity = aggregate.totalElectors > 0 ? (aggregate.voted / aggregate.totalElectors * 100) : 0;
      return `${header}<br/>Активност: ${activity.toFixed(2)}%<br/>${aggregate.voted.toLocaleString('bg-BG')} от ${aggregate.totalElectors.toLocaleString('bg-BG')} избиратели`;
    }

    if (metric === 'risks') {
      return `${header}<br/>Рисков рейтинг: ${aggregate.riskScore}<br/>${aggregate.total.toLocaleString('bg-BG')} общо гласа`;
    }

    if (metric === 'invalid-votes') {
      const invalidShare = aggregate.total > 0 ? (aggregate.discardedVotes / aggregate.total * 100) : 0;
      return `${header}<br/>Недействителни: ${invalidShare.toFixed(2)}%<br/>${aggregate.discardedVotes.toLocaleString('bg-BG')} от ${aggregate.total.toLocaleString('bg-BG')} гласа`;
    }

    if (metric === 'no-votes') {
      const noVotesShare = aggregate.total > 0 ? (aggregate.noVotes / aggregate.total * 100) : 0;
      return `${header}<br/>Не подкрепям никого: ${noVotesShare.toFixed(2)}%<br/>${aggregate.noVotes.toLocaleString('bg-BG')} от ${aggregate.total.toLocaleString('bg-BG')} гласа`;
    }

    if (metric === 'machine-vs-paper') {
      const total = aggregate.totalMachine + aggregate.totalPaper;
      const machineShare = total > 0 ? (aggregate.totalMachine / total * 100) : 0;
      const paperShare = total > 0 ? (aggregate.totalPaper / total * 100) : 0;
      return `${header}<br/>Машинно: ${machineShare.toFixed(2)}% (${aggregate.totalMachine.toLocaleString('bg-BG')})<br/>Хартия: ${paperShare.toFixed(2)}% (${aggregate.totalPaper.toLocaleString('bg-BG')})`;
    }

    if (metric === 'winner-margin') {
      const parties = Object.entries(aggregate.partyTotals)
        .sort((a, b) => b[1] - a[1]);
      if (parties.length < 2 || aggregate.total === 0) return header;

      const margin = (parties[0][1] - parties[1][1]) / aggregate.total * 100;
      return `${header}<br/>Разлика: ${margin.toFixed(2)}%<br/>${parties[0][1].toLocaleString('bg-BG')} срещу ${parties[1][1].toLocaleString('bg-BG')} гласа`;
    }

    if (metric === 'party-votes' && aggregate.leadingParty) {
      const percentage = aggregate.total > 0 ? (aggregate.partyTotals[aggregate.leadingParty.partyId] || 0) / aggregate.total * 100 : 0;
      return `${header}<br/>${aggregate.leadingParty.partyName}: ${percentage.toFixed(2)}%<br/>${(aggregate.partyTotals[aggregate.leadingParty.partyId] || 0).toLocaleString('bg-BG')} гласа`;
    }

    if (aggregate.leadingParty) {
      const percentage = aggregate.total > 0 ? (aggregate.leadingParty.total / aggregate.total * 100) : 0;
      return `${header}<br/>Победител: ${aggregate.leadingParty.partyName}<br/>${percentage.toFixed(2)}% • ${aggregate.leadingParty.total.toLocaleString('bg-BG')} гласа`;
    }

    return header;
  }

  static getAggregateStyle(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    isDark: boolean,
    selectedPartyId?: string | null,
    partiesById: Record<string, string> = {}
  ): L.PathOptions {
    const fillColor = this.getFillColor(metric, aggregate, isDark, selectedPartyId, partiesById);

    let fillOpacity = aggregate ? 0.9 : 0.45;
    if (aggregate && metric === 'party-votes' && selectedPartyId) {
      const votes = aggregate.partyTotals[selectedPartyId] || 0;
      const share = aggregate.total > 0 ? votes / aggregate.total : 0;
      fillOpacity = 0.6 + share * 0.4;
    }

    return {
      color: '#fff',
      weight: 0.2,
      opacity: 0.6,
      fillColor,
      fillOpacity,
    };
  }

  static getBackgroundStyle(): L.PathOptions {
    return {
      color: '#fff',
      weight: 1.1,
      fillOpacity: 0,
      interactive: false,
      opacity: 0.6,
    };
  }
}
