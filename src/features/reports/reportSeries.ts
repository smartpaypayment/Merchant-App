import type { ReportSeriesPoint } from '@models/api';
import type { Paise } from '@models/index';

/**
 * Report series preparation.
 *
 * `GET /reports` returns a point only for days that had sales. Charting that
 * sparse array directly would be actively misleading: a week with sales on
 * Monday, Thursday and Sunday would render as three adjacent bars, implying three
 * consecutive trading days. Zero-filling the gaps is what makes the trend honest.
 *
 * ## Day keys are UTC
 *
 * The API derives its day key from the UTC portion of the transaction timestamp,
 * so gap-filling iterates UTC days to stay consistent with the data it is
 * filling. Note for the backend: a merchant's *business* day is IST, so an
 * evening transaction after 18:30 IST lands in the next UTC day and would be
 * attributed to tomorrow. Fixing that belongs server-side, in how the report is
 * aggregated — doing it in the client would just disagree with every other
 * consumer of the same endpoint.
 */

/** Guards against a pathological range producing a huge array. */
const MAX_FILLED_DAYS = 400;

const MS_PER_DAY = 86_400_000;

/** `2026-08-23` from an ISO timestamp, in UTC. */
export function utcDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Returns one point per day in `[from, to]`, inserting zeros for days the API
 * omitted. Existing points are preserved as-is.
 */
export function fillSeriesGaps(
  series: readonly ReportSeriesPoint[],
  from: string,
  to: string,
): ReportSeriesPoint[] {
  const start = new Date(from);
  const end = new Date(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    // Nothing sensible to fill against — hand back what the server gave us.
    return [...series];
  }

  const byDay = new Map(series.map((point) => [point.date, point]));

  // Iterate on UTC midnights so daylight-saving shifts cannot skip or duplicate a
  // day. India has no DST, but the app is not the only thing that decides the
  // device clock.
  const cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  const dayCount = Math.floor((last - cursor) / MS_PER_DAY) + 1;
  if (dayCount > MAX_FILLED_DAYS) return [...series];

  const filled: ReportSeriesPoint[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = new Date(cursor + i * MS_PER_DAY).toISOString().slice(0, 10);
    filled.push(byDay.get(date) ?? { date, amount: 0, count: 0 });
  }

  return filled;
}

export interface SeriesHighlights {
  /** The best trading day in the range, or `null` when nothing was sold. */
  bestDay: ReportSeriesPoint | null;
  /** Days in the range with at least one sale. */
  tradingDays: number;
  /** Mean across trading days only — averaging in closed days understates it. */
  averagePerTradingDay: Paise;
}

/**
 * Derives the highlights shown alongside the chart.
 *
 * `averagePerTradingDay` deliberately divides by days that had sales rather than
 * by calendar days: a merchant closed on Sunday has not earned less per day, and
 * dividing by 7 would tell them they had.
 */
export function computeSeriesHighlights(series: readonly ReportSeriesPoint[]): SeriesHighlights {
  let bestDay: ReportSeriesPoint | null = null;
  let tradingDays = 0;
  let total = 0;

  for (const point of series) {
    total += point.amount;
    if (point.count > 0) tradingDays += 1;
    if (bestDay === null || point.amount > bestDay.amount) bestDay = point;
  }

  // A range where nothing sold has no "best" day to report.
  if (bestDay !== null && bestDay.amount === 0) bestDay = null;

  return {
    bestDay,
    tradingDays,
    averagePerTradingDay: tradingDays > 0 ? Math.round(total / tradingDays) : 0,
  };
}
