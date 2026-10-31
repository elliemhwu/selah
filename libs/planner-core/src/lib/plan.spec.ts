import { normalizePlan, planContains, planEnd, planText } from './plan';
import { positionAtEnd, positionBetween } from './position';

describe('plans', () => {
  it('normalizes a week to its first day and a month to the 1st', () => {
    expect(normalizePlan({ grain: 'week', start: '2026-11-05' }, 1)).toEqual({ grain: 'week', start: '2026-11-02' });
    expect(normalizePlan({ grain: 'week', start: '2026-11-05' }, 7)).toEqual({ grain: 'week', start: '2026-11-01' });
    expect(normalizePlan({ grain: 'month', start: '2026-11-19' }, 1)).toEqual({ grain: 'month', start: '2026-11-01' });
    expect(normalizePlan({ grain: 'day', start: '2026-11-19' }, 1)).toEqual({ grain: 'day', start: '2026-11-19' });
  });

  it('ends the day after a day, a week, or a month', () => {
    expect(planEnd({ grain: 'day', start: '2026-11-03' })).toBe('2026-11-04');
    expect(planEnd({ grain: 'week', start: '2026-10-26' })).toBe('2026-11-02');
    expect(planEnd({ grain: 'month', start: '2026-02-01' })).toBe('2026-03-01');
    expect(planEnd({ grain: 'month', start: '2026-12-01' })).toBe('2027-01-01');
  });

  it('contains the days from its start up to its end', () => {
    const week = { grain: 'week' as const, start: '2026-11-02' };
    expect(planContains(week, '2026-11-02')).toBe(true);
    expect(planContains(week, '2026-11-08')).toBe(true);
    expect(planContains(week, '2026-11-09')).toBe(false);
  });

  it('writes plans for the change log', () => {
    expect(planText({ grain: 'day', start: '2026-11-04' }, false)).toBe('2026-11-04/day');
    expect(planText(null, true)).toBe('later');
    expect(planText(null, false)).toBeNull();
  });
});

describe('positions', () => {
  it('puts a new row last', () => {
    expect(positionAtEnd([])).toBe(1);
    expect(positionAtEnd([{ position: 3 }, { position: 1.5 }])).toBe(4);
  });

  it('puts a moved row between its neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(null, 1)).toBe(0);
    expect(positionBetween(4, null)).toBe(5);
    expect(positionBetween(null, null)).toBe(1);
  });
});
