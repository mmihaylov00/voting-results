import { describe, expect, it } from 'vitest';
import { getContestantImage } from './contestant-image.util';

describe('contestant images', () => {
  it('covers every parliamentary party or coalition that placed in the national top five', () => {
    const names = [
      'ПРОГРЕСИВНА БЪЛГАРИЯ', 'ГЕРБ-СДС', 'ПП ГЕРБ',
      'КОАЛИЦИЯ ПРОДЪЛЖАВАМЕ ПРОМЯНАТА – ДЕМОКРАТИЧНА БЪЛГАРИЯ',
      'Движение за права и свободи - ДПС', 'Движение за права и свободи – ДПС',
      'ВЪЗРАЖДАНЕ', 'ДПС-Ново начало', 'БСП – ОБЕДИНЕНА ЛЕВИЦА',
      'БСП за БЪЛГАРИЯ', 'БСП ЗА БЪЛГАРИЯ', 'Продължаваме Промяната',
      'ПП ИМА ТАКЪВ НАРОД',
      'ДЕМОКРАТИЧНА БЪЛГАРИЯ – ОБЕДИНЕНИЕ (ДА България, ДСБ, Зелено движение)',
      'ОБЕДИНЕНИ ПАТРИОТИ – НФСБ, АТАКА и ВМРО', 'ВОЛЯ',
    ];
    for (const name of names) expect(getContestantImage(name, 'governmental'), name).not.toBeNull();
  });

  it('covers every presidential candidate that placed in the national top five', () => {
    const names = [
      'Илияна Малинова Йотова', 'Андрей Атанасов Гюров', 'Костадин Тодоров Костадинов',
      'Радостин Петев Василев', 'Ивелин Людмилов Михайлов', 'Румен Георгиев Радев',
      'Анастас Георгиев Герджиков', 'Мустафа Сали Карадайъ', 'Лозан Йорданов Панов',
      'Цецка Цачева Данговска', 'Красимир Дончев Каракачанов', 'Веселин Найденов Марешки',
      'Пламен Василев Орешарски',
    ];
    for (const name of names) expect(getContestantImage(name, 'presidential'), name).not.toBeNull();
  });

  it('matches historical party aliases and presidential running-mate changes', () => {
    expect(getContestantImage('ПП ВЪЗРАЖДАНЕ', 'governmental')?.src)
      .toBe(getContestantImage('ВЪЗРАЖДАНЕ', 'governmental')?.src);
    expect(getContestantImage('Костадин Тодоров Костадинов и Елена Цонева Гунчева', 'presidential')?.src)
      .toBe(getContestantImage('Костадин Тодоров Костадинов и Петър Петров Волгин', 'presidential')?.src);
  });

  it('keeps standalone parties and coalitions distinct and leaves unknown profiles without an image', () => {
    expect(getContestantImage('Продължаваме Промяната', 'governmental')?.id)
      .not.toBe(getContestantImage('КОАЛИЦИЯ ПРОДЪЛЖАВАМЕ ПРОМЯНАТА – ДЕМОКРАТИЧНА БЪЛГАРИЯ', 'governmental')?.id);
    expect(getContestantImage('Румен Георгиев Радев', 'governmental')).toBeNull();
    expect(getContestantImage('ГЕРБ-СДС', 'presidential')).toBeNull();
    expect(getContestantImage('Неизвестен кандидат', 'presidential')).toBeNull();
  });
});
