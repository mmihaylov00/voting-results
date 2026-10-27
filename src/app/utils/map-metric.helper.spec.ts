import { describe, expect, it } from 'vitest';
import { MapAggregate, MapMetricHelper } from './map-metric.helper';

const aggregate: MapAggregate = {
  total: 1000,
  totalElectors: 1000,
  voted: 200,
  discardedVotes: 20,
  noVotes: 10,
  totalPaper: 140,
  totalMachine: 60,
  riskScore: 0,
  partyTotals: { a: 120, b: 50 },
  leadingParty: { partyId: 'a', partyName: 'Партия А', total: 120 },
};
const parties = { a: 'Партия А', b: 'Партия Б' };

describe('map metrics', () => {
  it('uses national qualification and local valid list votes for the below-threshold metric', () => {
    const place = { ...aggregate, partyTotals: { a: 60, b: 30, independent: 10, '0': 100 } };
    const ids = new Set(['b']);
    const tooltip = MapMetricHelper.buildMetricTooltip('below-threshold', place, '', true, parties, null, ids);
    expect(tooltip).toContain('30.00%');
    expect(tooltip).toContain('30 гласа');
    const legend = MapMetricHelper.getLegend('below-threshold', false);
    expect(MapMetricHelper.getFillColor('below-threshold', place, false, null, parties, ids)).toBe(legend.items[4].color);
    expect(MapMetricHelper.getFillColor('below-threshold', place, false)).toBe(legend.noDataColor);
    expect(MapMetricHelper.buildMetricTooltip('below-threshold', place, '')).toContain('Няма данни');
    expect(MapMetricHelper.getFillColor('below-threshold', place, false, null, parties, new Set())).toBe(legend.items[0].color);
  });
  it('uses voters for invalid and none-of-the-above shares, including color bands', () => {
    expect(MapMetricHelper.buildMetricTooltip('invalid-votes', aggregate, '')).toContain('10.00%');
    expect(MapMetricHelper.buildMetricTooltip('no-votes', aggregate, '')).toContain('5.00%');
    expect(MapMetricHelper.getFillColor('invalid-votes', aggregate, false)).toBe('#dc2626');
    expect(MapMetricHelper.getFillColor('no-votes', aggregate, false)).toBe('#c026d3');
  });

  it('shows the selected party rather than the leading party and uses voters for its share', () => {
    const tooltip = MapMetricHelper.buildMetricTooltip('party-votes', aggregate, '', true, parties, 'b');
    expect(tooltip).toContain('Партия Б: 25.00%');
    expect(tooltip).toContain('50 гласа');
    expect(tooltip).not.toContain('Партия А');
    expect(MapMetricHelper.getAggregateStyle('party-votes', aggregate, false, 'b', parties).fillOpacity).toBe(0.7);
    expect(MapMetricHelper.buildMetricTooltip('leading-party', aggregate, '')).toContain('60.00% от гласувалите');
  });

  it('labels projected candidate shares as preferences over party votes in tooltips and legends', () => {
    const preferences = { ...aggregate, voted: 40, partyTotals: { preference: 10, party: 40 } };
    const names = { preference: 'Иван Иванов' };
    const tooltip = MapMetricHelper.buildMetricTooltip('party-votes', preferences, '', true,
      names, 'preference', null, 'преференции', 'от партийните гласове');
    expect(tooltip).toContain('25.00% от партийните гласове');
    expect(tooltip).toContain('10 преференции');
    expect(tooltip).not.toContain('от гласувалите');
    expect(MapMetricHelper.getLegend('party-votes', false, 'preference', names, 'от партийните гласове')
      .description).toBe('Дял от партийните гласове. По-плътният цвят означава по-висок дял.');
    expect(MapMetricHelper.buildMetricTooltip('party-votes', preferences, '', true,
      names, 'preference', null, '<b>преференции</b>', 'от <b>партийните гласове</b>'))
      .toContain('&lt;b&gt;преференции&lt;/b&gt;');
  });

  it('keeps turnout and winner margin explicitly based on the electorate', () => {
    expect(MapMetricHelper.buildMetricTooltip('activity', aggregate, '')).toContain('20.00%');
    expect(MapMetricHelper.buildMetricTooltip('winner-margin', aggregate, '', true, parties)).toContain('7.00% от избирателите');
    expect(MapMetricHelper.getFillColor('winner-margin', aggregate, false)).toBe('#6366f1');
  });

  it('distinguishes missing denominators from valid zero values', () => {
    const missing = { ...aggregate, voted: 0, totalElectors: 0 };
    const noData = MapMetricHelper.getLegend('activity', false).noDataColor;
    expect(MapMetricHelper.getFillColor('activity', missing, false)).toBe(noData);
    expect(MapMetricHelper.getFillColor('invalid-votes', missing, false)).toBe(noData);
    expect(MapMetricHelper.buildMetricTooltip('activity', missing, '')).toContain('Няма данни');
    expect(MapMetricHelper.getFillColor('risks', aggregate, false)).not.toBe(noData);
  });

  it('uses matching fixed legend thresholds at the color band boundaries', () => {
    const legend = MapMetricHelper.getLegend('invalid-votes', false);
    expect(legend.description).toContain('гласували');
    expect(legend.items[4].label).toBe('> 7 - 10%');
    expect(legend.items[4].color).toBe(MapMetricHelper.getFillColor('invalid-votes', aggregate, false));
    const aboveBoundary = { ...aggregate, discardedVotes: 21 };
    expect(MapMetricHelper.getFillColor('invalid-votes', aboveBoundary, false)).toBe(legend.items[5].color);
  });

  it('renders baseline share changes as percentage points with missing-data handling', () => {
    const loss = { ...aggregate, partyChangePp: -7 };
    const gain = { ...aggregate, partyChangePp: 7 };
    expect(MapMetricHelper.getFillColor('party-change', loss, false)).toBe('#dc2626');
    expect(MapMetricHelper.getFillColor('party-change', gain, false)).toBe('#3b82f6');
    expect(MapMetricHelper.buildMetricTooltip('party-change', gain, '', true, parties, 'b')).toContain('+7.00 п.п.');
    expect(MapMetricHelper.getFillColor('party-change', aggregate, false)).toBe(MapMetricHelper.getLegend('party-change', false).noDataColor);
    expect(MapMetricHelper.buildMetricTooltip('party-change', aggregate, '')).toContain('Няма данни');
  });

  it('escapes party names in HTML tooltips', () => {
    const tooltip = MapMetricHelper.buildMetricTooltip('party-votes', aggregate, '', true, { b: '<b>Партия</b>' }, 'b');
    expect(tooltip).toContain('&lt;b&gt;Партия&lt;/b&gt;');
  });

  it('shows only the presidential candidate in map labels while retaining raw ticket identities', () => {
    const ticket = 'Румен Георгиев Радев и Илияна Малинова Йотова';
    const presidentialParties = { a: ticket, b: 'Цецка Цачева Данговска и Пламен Иванов Манушев' };
    const result = { ...aggregate, leadingParty: { partyId: 'a', total: 120, partyName: ticket } };
    const tooltip = MapMetricHelper.buildMetricTooltip('summary', result, '', true, presidentialParties);
    expect(tooltip).toContain('Румен Георгиев Радев');
    expect(tooltip).not.toContain('Йотова');
    expect(tooltip).toContain('Топ 3 кандидати');
    expect(MapMetricHelper.getLegend('summary', false, null, presidentialParties).title).toBe('Водещ кандидат');
    expect(MapMetricHelper.getLegend('party-votes', false, 'a', presidentialParties).title).toBe('Румен Георгиев Радев');
    expect(MapMetricHelper.getLegend('leading-party', false, null, presidentialParties).items[0].label).toBe('Румен Георгиев Радев');
    expect(presidentialParties.a).toBe(ticket);
  });

  for (const isDark of [false, true]) {
    it(`keeps assigned colors before unassigned names and Others in ${isDark ? 'dark' : 'light'} categorical legends`, () => {
      const ticket = 'Андрей Андреев Гюров и Десислава Иванова';
      const names = { '0': 'Други', '1': 'Непозната А', '2': ticket, '3': 'ВЕЛИЧИЕ', '4': 'Непозната Б' };
      const original = Object.entries(names);
      for (const metric of ['leading-party', 'leading-preference'] as const) {
        const legend = MapMetricHelper.getLegend(metric, isDark, null, names);
        expect(legend.items.map(item => item.label)).toEqual([
          'Андрей Андреев Гюров', 'ВЕЛИЧИЕ', 'Непозната А', 'Непозната Б', 'Други',
        ]);
        expect(legend.items[2].color).toBe(legend.items[3].color);
        expect(legend.items[4].color).not.toBe(legend.items[2].color);
      }
      expect(Object.entries(names)).toEqual(original);
    });
  }
});
