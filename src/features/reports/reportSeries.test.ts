import type { ReportSeriesPoint } from '@models/api';
import { computeSeriesHighlights, fillSeriesGaps, utcDayKey } from './reportSeries';

/**
 * Report series preparation.
 *
 * The gap-filling exists because `GET /reports` omits days with no sales. Charting
 * that sparse array directly implies the trading days were consecutive, which is a
 * quietly wrong picture of the merchant's week.
 */

const point = (date: string, amount: number, count = 1): ReportSeriesPoint => ({ date, amount, count });

describe('fillSeriesGaps', () => {
  it('inserts zero days the API omitted', () => {
    const filled = fillSeriesGaps(
      [point('2026-08-17', 50_000), point('2026-08-20', 30_000)],
      '2026-08-17T00:00:00.000Z',
      '2026-08-21T23:59:59.999Z',
    );

    expect(filled.map((p) => p.date)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
    // The two reported days keep their values; the rest are explicit zeros.
    expect(filled[0]!.amount).toBe(50_000);
    expect(filled[1]!).toEqual({ date: '2026-08-18', amount: 0, count: 0 });
    expect(filled[3]!.amount).toBe(30_000);
    expect(filled[4]!.count).toBe(0);
  });

  it('produces one point per calendar day inclusive of both ends', () => {
    const filled = fillSeriesGaps([], '2026-08-01T10:00:00.000Z', '2026-08-31T10:00:00.000Z');
    expect(filled).toHaveLength(31);
  });

  it('handles a single-day range', () => {
    const filled = fillSeriesGaps(
      [point('2026-08-23', 12_345)],
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T23:59:59.999Z',
    );

    expect(filled).toHaveLength(1);
    expect(filled[0]!.amount).toBe(12_345);
  });

  it('ignores the time component when deciding day boundaries', () => {
    // A range starting late in the day still includes that whole day.
    const filled = fillSeriesGaps([], '2026-08-17T23:30:00.000Z', '2026-08-18T00:30:00.000Z');
    expect(filled.map((p) => p.date)).toEqual(['2026-08-17', '2026-08-18']);
  });

  it('returns the original series when the range is inverted', () => {
    const series = [point('2026-08-20', 1000)];
    expect(fillSeriesGaps(series, '2026-08-25T00:00:00.000Z', '2026-08-20T00:00:00.000Z')).toEqual(series);
  });

  it('returns the original series for an unparseable range', () => {
    const series = [point('2026-08-20', 1000)];
    expect(fillSeriesGaps(series, 'not-a-date', '2026-08-21T00:00:00.000Z')).toEqual(series);
  });

  it('refuses to expand a pathological range into a huge array', () => {
    const series = [point('2020-01-01', 1000)];
    const filled = fillSeriesGaps(series, '2000-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    // Falls back rather than allocating ~9500 points for a chart.
    expect(filled).toEqual(series);
  });

  it('preserves ascending date order', () => {
    const filled = fillSeriesGaps(
      [point('2026-08-20', 1), point('2026-08-18', 2)],
      '2026-08-17T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
    );

    const dates = filled.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('utcDayKey', () => {
  it('matches the key convention the reports endpoint uses', () => {
    expect(utcDayKey('2026-08-23T18:45:00.000Z')).toBe('2026-08-23');
  });
});

describe('computeSeriesHighlights', () => {
  it('finds the best trading day', () => {
    const { bestDay } = computeSeriesHighlights([
      point('2026-08-17', 50_000),
      point('2026-08-18', 120_000),
      point('2026-08-19', 30_000),
    ]);

    expect(bestDay?.date).toBe('2026-08-18');
    expect(bestDay?.amount).toBe(120_000);
  });

  it('counts only days that had sales as trading days', () => {
    const { tradingDays } = computeSeriesHighlights([
      point('2026-08-17', 50_000, 2),
      point('2026-08-18', 0, 0),
      point('2026-08-19', 30_000, 1),
    ]);

    expect(tradingDays).toBe(2);
  });

  it('averages across trading days, not calendar days', () => {
    // ₹800 over two trading days is ₹400/day — dividing by the 4 calendar days
    // would tell a merchant closed on weekends that they earned less per day.
    const { averagePerTradingDay } = computeSeriesHighlights([
      point('2026-08-17', 50_000, 1),
      point('2026-08-18', 0, 0),
      point('2026-08-19', 0, 0),
      point('2026-08-20', 30_000, 1),
    ]);

    expect(averagePerTradingDay).toBe(40_000);
  });

  it('returns an integer paise average', () => {
    const { averagePerTradingDay } = computeSeriesHighlights([
      point('2026-08-17', 10_000, 1),
      point('2026-08-18', 10_001, 1),
      point('2026-08-19', 10_001, 1),
    ]);

    expect(Number.isInteger(averagePerTradingDay)).toBe(true);
  });

  it('reports no best day when nothing sold in the range', () => {
    const { bestDay, tradingDays, averagePerTradingDay } = computeSeriesHighlights([
      point('2026-08-17', 0, 0),
      point('2026-08-18', 0, 0),
    ]);

    expect(bestDay).toBeNull();
    expect(tradingDays).toBe(0);
    expect(averagePerTradingDay).toBe(0);
  });

  it('handles an empty series', () => {
    expect(computeSeriesHighlights([])).toEqual({
      bestDay: null,
      tradingDays: 0,
      averagePerTradingDay: 0,
    });
  });
});
