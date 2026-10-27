import { getPartyColor, getPartyDisplayName, getPartyLegendIndex } from './party-colors';
import { getPresidentialCandidateName } from './candidate-label';
import type * as L from 'leaflet';

export type MapMetric =
  | 'leading-party'
  | 'leading-preference'
  | 'summary'
  | 'activity'
  | 'risks'
  | 'party-votes'
  | 'invalid-votes'
  | 'no-votes'
  | 'machine-vs-paper'
  | 'winner-margin'
  | 'party-change'
  | 'below-threshold';

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
  partyChangePp?: number | null;
}

export interface MapLegend {
  title: string;
  description: string;
  items: { label: string; color: string; opacity?: number }[];
  noDataColor: string;
}

type ScaleMetric = 'activity' | 'risks' | 'invalid-votes' | 'no-votes' | 'machine-vs-paper' | 'winner-margin' | 'party-change' | 'below-threshold';
const COLOR_SCALES: Record<ScaleMetric, { title: string; description: string; unit: string; limits: number[]; colors: string[] }> = {
  'below-threshold': {
    title: 'Гласове за партии под 4% бариера',
    description: 'Дял от действителните гласове за листи в мястото. Партиите под 4% се определят по националния резултат. Независимите кандидати не са в числителя; „Не подкрепям никого“ не е в знаменателя.',
    unit: '%', limits: [5, 10, 15, 20, 30, 40],
    colors: ['#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c'],
  },
  activity: {
    title: 'Избирателна активност', description: 'Гласували / избиратели по списък.', unit: '%',
    limits: [10, 20, 30, 40, 50, 60],
    colors: ['#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'],
  },
  risks: {
    title: 'Рискови индикатори', description: 'Брой индикатори в избраната територия. Индикаторите не доказват нарушение.', unit: '',
    limits: [0, 2, 5, 10, 15, 20],
    colors: ['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
  },
  'invalid-votes': {
    title: 'Недействителни гласове', description: 'Недействителни / гласували.', unit: '%',
    limits: [1, 3, 5, 7, 10, 15],
    colors: ['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
  },
  'no-votes': {
    title: 'Не подкрепям никого', description: 'Гласове „Не подкрепям никого“ / гласували.', unit: '%',
    limits: [1, 2, 3, 5, 7, 10],
    colors: ['#fae8ff', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#6b21a8'],
  },
  'machine-vs-paper': {
    title: 'Дял на машинния вот', description: 'Машинни / (машинни + хартиени гласове).', unit: '%',
    limits: [10, 30, 45, 55, 70, 90],
    colors: ['#7c2d12', '#c2410c', '#f97316', '#94a3b8', '#3b82f6', '#1d4ed8', '#1e3a8a'],
  },
  'winner-margin': {
    title: 'Преднина на победителя', description: 'Разлика между първите две партии / избиратели по списък.', unit: '%',
    limits: [5, 10, 20, 30, 40],
    colors: ['#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'],
  },
  'party-change': {
    title: 'Промяна в подкрепата', description: 'Промяна в дела на избраната партия спрямо базовите избори, в процентни пунктове.', unit: ' п.п.',
    limits: [-10, -5, -2, 2, 5, 10],
    colors: ['#991b1b', '#dc2626', '#f87171', '#f8fafc', '#93c5fd', '#3b82f6', '#1d4ed8'],
  },
};

export class MapMetricHelper {
  static getFillColor(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    isDark: boolean,
    selectedPartyId?: string | null,
    partiesById: Record<string, string> = {},
    belowThresholdPartyIds: ReadonlySet<string> | null = null,
  ): string {
    const noDataColor = isDark ? '#334155' : '#cbd5e1';
    if (!aggregate) return noDataColor;

    if (metric === 'leading-preference') {
      return aggregate.leadingPreference ? getPartyColor(aggregate.leadingPreference.partyName, isDark) : noDataColor;
    }

    const scale = this.colorScale(metric);
    if (scale) {
      const value = this.numericMetricValue(metric, aggregate, belowThresholdPartyIds);
      if (value === null) return noDataColor;
      const index = scale.limits.findIndex(limit => value <= limit);
      return scale.colors[index < 0 ? scale.colors.length - 1 : index];
    }

    if (metric === 'party-votes' && selectedPartyId) {
      if (aggregate.voted <= 0) return noDataColor;
      const partyName = partiesById[selectedPartyId] || selectedPartyId;
      return getPartyColor(partyName, isDark);
    }
    if (metric === 'party-votes') return noDataColor;

    return aggregate.leadingParty ? getPartyColor(aggregate.leadingParty.partyName, isDark) : noDataColor;
  }

  static buildMetricTooltip(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    header: string,
    showPreferences: boolean = true,
    partiesById: Record<string, string> = {},
    selectedPartyId?: string | null,
    belowThresholdPartyIds: ReadonlySet<string> | null = null,
    votesLabel = 'гласа',
    shareLabel = 'от гласувалите',
  ): string {
    if (!aggregate) return header;

    if (metric === 'summary') {
      return this.buildSummaryTooltip(aggregate, header, partiesById);
    }

    if (metric === 'leading-preference' && aggregate.leadingPreference) {
      return `${header}<br/>Води преференция: ${this.escapeHtml(aggregate.leadingPreference.candidateName)}<br/>${this.escapeHtml(getPartyDisplayName(aggregate.leadingPreference.partyName))} • ${aggregate.leadingPreference.total.toLocaleString('bg-BG')} гласа`;
    }

    if (this.colorScale(metric) && this.numericMetricValue(metric, aggregate, belowThresholdPartyIds) === null) {
      return `${header}<br/>Няма данни за показателя`;
    }

    if (metric === 'below-threshold') {
      const share = this.numericMetricValue(metric, aggregate, belowThresholdPartyIds)!;
      const votes = Object.entries(aggregate.partyTotals).filter(([id]) => belowThresholdPartyIds?.has(id)).reduce((sum, [, votes]) => sum + votes, 0);
      return `${header}<br/>За партии под националната бариера: ${share.toFixed(2)}%<br/>${votes.toLocaleString('bg-BG')} гласа от действителните гласове за листи`;
    }

    if (metric === 'party-change') {
      const change = aggregate.partyChangePp ?? 0;
      const partyName = selectedPartyId ? partiesById[selectedPartyId] || selectedPartyId : 'Избрана партия';
      return `${header}<br/>${this.escapeHtml(getPartyDisplayName(partyName))}<br/>Промяна спрямо базовите избори: ${change > 0 ? '+' : ''}${change.toFixed(2)} п.п.`;
    }

    if (metric === 'activity') {
      const activity = aggregate.totalElectors > 0 ? (aggregate.voted / aggregate.totalElectors * 100) : 0;
      return `${header}<br/>Активност: ${activity.toFixed(2)}%<br/>${aggregate.voted.toLocaleString('bg-BG')} от ${aggregate.totalElectors.toLocaleString('bg-BG')} избиратели`;
    }

    if (metric === 'risks') {
      return `${header}<br/>Рискови индикатори: ${aggregate.riskScore}<br/>${aggregate.voted.toLocaleString('bg-BG')} гласували`;
    }

    if (metric === 'invalid-votes') {
      const invalidShare = this.percentOf(aggregate.discardedVotes, aggregate.voted);
      return `${header}<br/>Недействителни: ${invalidShare.toFixed(2)}%<br/>${aggregate.discardedVotes.toLocaleString('bg-BG')} от ${aggregate.voted.toLocaleString('bg-BG')} гласували`;
    }

    if (metric === 'no-votes') {
      const noVotesShare = this.percentOf(aggregate.noVotes, aggregate.voted);
      return `${header}<br/>Не подкрепям никого: ${noVotesShare.toFixed(2)}%<br/>${aggregate.noVotes.toLocaleString('bg-BG')} от ${aggregate.voted.toLocaleString('bg-BG')} гласували`;
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
      if (parties.length < 2 || aggregate.totalElectors === 0) return header;

      const [winnerPartyId, winnerVotes] = parties[0];
      const [runnerUpPartyId, runnerUpVotes] = parties[1];
      const voteDifference = winnerVotes - runnerUpVotes;
      const margin = voteDifference / aggregate.totalElectors * 100;
      const winnerName = partiesById[winnerPartyId] || winnerPartyId;
      const runnerUpName = partiesById[runnerUpPartyId] || runnerUpPartyId;
      return [
        header,
        `Преднина на победителя: ${margin.toFixed(2)}% от избирателите`,
        `Разлика в гласове: ${voteDifference.toLocaleString('bg-BG')}`,
        `Първи: ${this.escapeHtml(getPartyDisplayName(winnerName))} (${winnerVotes.toLocaleString('bg-BG')})`,
        `Втори: ${this.escapeHtml(getPartyDisplayName(runnerUpName))} (${runnerUpVotes.toLocaleString('bg-BG')})`,
      ].join('<br/>');
    }

    if (metric === 'party-votes') {
      if (!selectedPartyId || aggregate.voted <= 0) return `${header}<br/>Няма данни за избрана партия`;
      const votes = aggregate.partyTotals[selectedPartyId] || 0;
      const partyName = partiesById[selectedPartyId] || selectedPartyId;
      const percentage = this.percentOf(votes, aggregate.voted);
      return `${header}<br/>${this.escapeHtml(getPartyDisplayName(partyName))}: ${percentage.toFixed(2)}% ${this.escapeHtml(shareLabel)}<br/>${votes.toLocaleString('bg-BG')} ${this.escapeHtml(votesLabel)}`;
    }

    if (aggregate.leadingParty) {
      const percentage = this.percentOf(aggregate.leadingParty.total, aggregate.voted);
      return `${header}<br/>Победител: ${this.escapeHtml(getPartyDisplayName(aggregate.leadingParty.partyName))}<br/>${percentage.toFixed(2)}% от гласувалите • ${aggregate.leadingParty.total.toLocaleString('bg-BG')} гласа`;
    }

    return header;
  }

  static getAggregateStyle(
    metric: MapMetric,
    aggregate: MapAggregate | undefined,
    isDark: boolean,
    selectedPartyId?: string | null,
    partiesById: Record<string, string> = {},
    belowThresholdPartyIds: ReadonlySet<string> | null = null,
  ): L.PathOptions {
    const fillColor = this.getFillColor(metric, aggregate, isDark, selectedPartyId, partiesById, belowThresholdPartyIds);

    let fillOpacity = aggregate ? 0.9 : 0.45;
    if (aggregate && metric === 'party-votes' && selectedPartyId) {
      const votes = aggregate.partyTotals[selectedPartyId] || 0;
      const share = aggregate.voted > 0 ? votes / aggregate.voted : 0;
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

  static getLegend(
    metric: MapMetric,
    isDark: boolean,
    selectedPartyId?: string | null,
    partiesById: Record<string, string> = {},
    shareLabel = 'от гласувалите',
  ): MapLegend {
    const noDataColor = isDark ? '#334155' : '#cbd5e1';
    const presidential = Object.values(partiesById).some(name => getPresidentialCandidateName(name) !== name);
    const scale = this.colorScale(metric);
    if (scale) {
      return {
        title: scale.title,
        description: presidential && metric === 'winner-margin' ? scale.description.replace('партии', 'кандидати') : scale.description,
        noDataColor,
        items: scale.colors.map((color, index) => {
          const lower = scale.limits[index - 1];
          const upper = scale.limits[index];
          const label = index === 0 ? `≤ ${upper}${scale.unit}`
            : upper === undefined ? `> ${lower}${scale.unit}`
              : `> ${lower} - ${upper}${scale.unit}`;
          return { color, label };
        }),
      };
    }

    if (metric === 'party-votes') {
      const partyName = selectedPartyId ? partiesById[selectedPartyId] || selectedPartyId : 'Изберете партия';
      return {
        title: getPartyDisplayName(partyName),
        description: `Дял ${shareLabel}. По-плътният цвят означава по-висок дял.`,
        noDataColor,
        items: selectedPartyId ? [0, 25, 50, 75, 100].map(percent => ({
          color: getPartyColor(partyName, isDark), label: `${percent}%`, opacity: 0.6 + percent / 100 * 0.4,
        })) : [],
      };
    }

    return {
      title: metric === 'leading-preference' ? 'Водеща преференция' : presidential ? 'Водещ кандидат' : 'Водеща партия',
      description: metric === 'leading-preference'
        ? 'Цветът показва партията на кандидата с най-много преференции.'
        : presidential ? 'Цветът показва кандидата с най-много гласове. Дяловете в подсказките са от гласувалите.'
          : 'Цветът показва партията с най-много гласове. Дяловете в подсказките са от гласувалите.',
      noDataColor,
      items: Object.values(partiesById)
        .sort((left, right) => getPartyLegendIndex(left) - getPartyLegendIndex(right))
        .map(name => ({ label: getPartyDisplayName(name), color: getPartyColor(name, isDark) })),
    };
  }

  private static colorScale(metric: MapMetric): typeof COLOR_SCALES[ScaleMetric] | undefined {
    return metric in COLOR_SCALES ? COLOR_SCALES[metric as ScaleMetric] : undefined;
  }

  private static numericMetricValue(metric: MapMetric, aggregate: MapAggregate, belowThresholdPartyIds: ReadonlySet<string> | null = null): number | null {
    const percent = (value: number, total: number): number | null =>
      Number.isFinite(value) && Number.isFinite(total) && total > 0 ? value / total * 100 : null;

    switch (metric) {
      case 'below-threshold': {
        if (belowThresholdPartyIds === null) return null;
        let total = 0;
        let below = 0;
        for (const [id, votes] of Object.entries(aggregate.partyTotals)) {
          if (id === '0') continue;
          total += votes;
          if (belowThresholdPartyIds.has(id)) below += votes;
        }
        return percent(below, total);
      }
      case 'activity': return percent(aggregate.voted, aggregate.totalElectors);
      case 'invalid-votes': return percent(aggregate.discardedVotes, aggregate.voted);
      case 'no-votes': return percent(aggregate.noVotes, aggregate.voted);
      case 'machine-vs-paper': return percent(aggregate.totalMachine, aggregate.totalMachine + aggregate.totalPaper);
      case 'risks': return Number.isFinite(aggregate.riskScore) ? aggregate.riskScore : null;
      case 'party-change': return typeof aggregate.partyChangePp === 'number' && Number.isFinite(aggregate.partyChangePp) ? aggregate.partyChangePp : null;
      case 'winner-margin': {
        const votes = Object.values(aggregate.partyTotals).sort((a, b) => b - a);
        return votes.length >= 2 ? percent(votes[0] - votes[1], aggregate.totalElectors) : null;
      }
      default: return null;
    }
  }

  private static buildSummaryTooltip(
    aggregate: MapAggregate,
    header: string,
    partiesById: Record<string, string>
  ): string {
    const partyRows = Object.entries(aggregate.partyTotals)
      .map(([partyId, total]) => ({
        partyId,
        partyName: partiesById[partyId] || (aggregate.leadingParty?.partyId === partyId ? aggregate.leadingParty.partyName : partyId),
        total,
      }))
      .sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName, 'bg') || a.partyId.localeCompare(b.partyId, 'bg'))
      .slice(0, 3);

    const partySummary = partyRows.length > 0
      ? partyRows
        .map((party, index) => {
          const percent = this.formatPercent(this.percentOf(party.total, aggregate.voted));
          return `${index + 1}. ${this.escapeHtml(getPartyDisplayName(party.partyName))}: ${this.formatNumber(party.total)} (${percent})`;
        })
        .join('<br/>')
      : 'Няма гласове за партии';

    const turnoutPercent = this.formatPercent(this.percentOf(aggregate.voted, aggregate.totalElectors));
    const invalidPercent = this.formatPercent(this.percentOf(aggregate.discardedVotes, aggregate.voted));
    const noVotesPercent = this.formatPercent(this.percentOf(aggregate.noVotes, aggregate.voted));
    const votingTypeTotal = aggregate.totalPaper + aggregate.totalMachine;
    const machinePercent = this.formatPercent(this.percentOf(aggregate.totalMachine, votingTypeTotal));
    const paperPercent = this.formatPercent(this.percentOf(aggregate.totalPaper, votingTypeTotal));

    return [
      header,
      Object.values(partiesById).some(name => getPresidentialCandidateName(name) !== name)
        ? '<strong>Топ 3 кандидати</strong>' : '<strong>Топ 3 партии</strong>',
      partySummary,
      `Активност: ${turnoutPercent} (${this.formatNumber(aggregate.voted)} от ${this.formatNumber(aggregate.totalElectors)})`,
      `Недействителни: ${this.formatNumber(aggregate.discardedVotes)} (${invalidPercent})`,
      `Не подкрепям никого: ${this.formatNumber(aggregate.noVotes)} (${noVotesPercent})`,
      `Машинно: ${this.formatNumber(aggregate.totalMachine)} (${machinePercent})`,
      `Хартия: ${this.formatNumber(aggregate.totalPaper)} (${paperPercent})`,
    ].join('<br/>');
  }

  private static percentOf(value: number, total: number): number {
    return total > 0 ? value / total * 100 : 0;
  }

  private static formatPercent(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  private static formatNumber(value: number): string {
    return value.toLocaleString('bg-BG');
  }

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
