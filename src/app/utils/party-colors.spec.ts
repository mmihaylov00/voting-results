import { describe, expect, it } from 'vitest';
import { getPresidentialCandidateName } from './candidate-label';
import { getPartyAlias } from './party-aliases';
import { getPartyBadgeLabel, getPartyColor, getPartyDisplayName, getPartyLegendIndex } from './party-colors';

describe('party display aliases', () => {
  it.each(['ПрБ', ' ПрБ ', 'ПБ', 'ПРОГРЕСИВНА БЪЛГАРИЯ', 'Прогресивна България'])(
    'uses the same label, palette and legend priority for %s', name => {
      expect(getPartyAlias(name)).toBe('ПБ');
      expect(getPartyDisplayName(name)).toBe('ПБ');
      expect(getPartyBadgeLabel(name)).toBe('ПБ');
      for (const dark of [false, true]) {
        expect(getPartyColor(name, dark)).toBe(getPartyColor('ПБ', dark));
      }
      expect(getPartyLegendIndex(name)).toBe(0);
    },
  );
});

describe('presidential display labels', () => {
  it('shows the first candidate full name for actual presidential ticket labels', () => {
    expect(getPartyDisplayName('Румен Георгиев Радев и Илияна Малинова Йотова')).toBe('Румен Георгиев Радев');
    expect(getPartyBadgeLabel('Анастас Георгиев Герджиков и Невяна Михайлова Митева-Матеева')).toBe('Анастас Георгиев Герджиков');
    expect(getPresidentialCandidateName('Цецка Цачева Данговска и Пламен Иванов Манушев')).toBe('Цецка Цачева Данговска');
    expect(getPartyDisplayName('Румен Радев и Илияна Йотова')).toBe('Румен Радев');
    expect(getPartyDisplayName('Мустафа Сали Карадайъ, Искра Димитрова Михайлова-Копарова')).toBe('Мустафа Сали Карадайъ');
  });

  it('keeps parliamentary labels and identity aliases unchanged', () => {
    const labels = ['ПП ИМА ТАКЪВ НАРОД', 'Движение за права и свободи - ДПС', 'Коалиция Продължаваме Промяната и Демократична България'];
    for (const name of labels) expect(getPartyDisplayName(name)).toBe(getPartyAlias(name));
    const ticket = 'Румен Георгиев Радев и Илияна Малинова Йотова';
    expect(getPartyAlias(ticket)).toBe(ticket);
    expect(getPartyDisplayName(null)).toBe('');
  });

  for (const dark of [false, true]) {
    it(`reuses existing party colors in ${dark ? 'dark' : 'light'} theme`, () => {
      const progressive = getPartyColor('ПРОГРЕСИВНА БЪЛГАРИЯ', dark);
      expect(getPartyColor('Румен Георгиев Радев и Илияна Малинова Йотова', dark)).toBe(progressive);
      expect(getPartyColor('Илияна Малинова Йотова', dark)).toBe(progressive);
      expect(getPartyColor('Анастас Георгиев Герджиков и Невяна Михайлова Митева-Матеева', dark)).toBe(getPartyColor('ГЕРБ', dark));
      expect(getPartyColor('Атанас Герджиков', dark)).toBe(getPartyColor('ГЕРБ', dark));
      expect(getPartyColor('Цецка Цачева Данговска и Пламен Иванов Манушев', dark)).toBe(getPartyColor('ГЕРБ', dark));
      expect(getPartyColor('Мустафа Сали Карадайъ и Искра Димитрова Михайлова-Копарова', dark)).toBe(getPartyColor('ДПС', dark));
      expect(getPartyColor('Андрей Атанасов Гюров и Георги Димитров Кандев', dark)).toBe(getPartyColor('ПРОДЪЛЖАВАМЕ ПРОМЯНАТА', dark));
      expect(getPartyColor('андрей гюров', dark)).toBe(getPartyColor('ПРОДЪЛЖАВАМЕ ПРОМЯНАТА', dark));
      expect(getPartyColor('Костадин Тодоров Костадинов и Петър Петров Волгин', dark)).toBe(getPartyColor('ВЪЗРАЖДАНЕ', dark));
      expect(getPartyColor('Ивелин Людмилов Михайлов и Юлиана Младенова Матеева', dark)).toBe(getPartyColor('ВЕЛИЧИЕ', dark));
      expect(getPartyColor('Радостин Петев Василев и Красимир Цветков Манов', dark)).toBe(getPartyColor('МЕЧ', dark));
      expect(getPartyColor('Румен Гълъбинов Гълъбинов и Веска Атанасова Волева', dark)).toBe('#64748B');
      expect(getPartyColor('Други', dark)).not.toBe(getPartyColor('Партия без зададен цвят', dark));
      expect(getPartyColor(' други ', dark)).toBe(getPartyColor('Други', dark));
    });
  }

  it('prioritizes assigned palettes while leaving unknown parties and Others separate', () => {
    const names = ['Неизвестна партия', 'Други', 'Ивелин Михайлов', 'Друга неизвестна партия', 'Андрей Гюров'];
    expect([...names].sort((a, b) => getPartyLegendIndex(a) - getPartyLegendIndex(b))).toEqual([
      'Ивелин Михайлов', 'Андрей Гюров', 'Неизвестна партия', 'Друга неизвестна партия', 'Други',
    ]);
    expect(getPartyLegendIndex(null)).toBe(1);
  });

  it('does not assign the vice-presidential candidate palette to the first candidate', () => {
    expect(getPartyColor('Иван Иванов и Андрей Гюров')).toBe('#64748B');
  });
});
