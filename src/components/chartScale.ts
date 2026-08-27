/**
 * Chart scale and bar geometry.
 *
 * Kept pure and separate from `Chart.tsx` so the maths is directly testable — a
 * bar chart that silently mis-scales is the kind of bug that looks fine in a
 * screenshot and misleads a merchant about which day they earned most.
 *
 * All input values are integer paise. Output coordinates are floats, because they
 * are pixel positions and never round-trip back into a stored amount.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BarLayout {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridLine {
  y: number;
  /** Integer paise value this line represents. */
  value: number;
}

export interface ChartGeometry {
  plot: Rect;
  bars: BarLayout[];
  gridLines: GridLine[];
  /** Top of the value axis, after rounding up to a readable number. */
  maxValue: number;
  /** Spacing between grid lines, in paise. */
  step: number;
}

export interface ChartGeometryOptions {
  width: number;
  height: number;
  /** Room for the y-axis labels. */
  paddingLeft?: number;
  /** Room for the x-axis labels. */
  paddingBottom?: number;
  paddingTop?: number;
  paddingRight?: number;
  /** Fraction of each slot left empty between bars, 0..0.9. */
  barGapRatio?: number;
  /** Number of grid lines to aim for, excluding the zero baseline. */
  targetTicks?: number;
}

/** Steps that produce human-readable axis labels. */
const NICE_MULTIPLIERS = [1, 2, 2.5, 5, 10] as const;

/**
 * Rounds an axis maximum up to a value with a readable step size.
 *
 * Picking `max` as the raw data maximum would put the tallest bar flush against
 * the top edge and label the axis with an arbitrary number like ₹8,347.
 */
export function computeNiceMax(rawMax: number, targetTicks = 4): { maxValue: number; step: number } {
  const ticks = Math.max(1, Math.floor(targetTicks));

  // A flat or empty series still needs a non-zero axis so the renderer has a
  // finite scale to divide by; callers show an empty state in that case.
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return { maxValue: ticks, step: 1 };
  }

  const roughStep = rawMax / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  const multiplier = NICE_MULTIPLIERS.find((candidate) => candidate >= normalized) ?? 10;
  // Amounts are paise, so a fractional step would label the axis with fractions
  // of a paisa.
  const step = Math.max(1, Math.round(multiplier * magnitude));

  return { maxValue: Math.ceil(rawMax / step) * step, step };
}

/**
 * Lays out one bar per value plus the grid lines behind them.
 *
 * Bars are positioned by slot rather than by cumulative offset, so rounding
 * cannot accumulate and leave the last bar misaligned with its x-axis label.
 */
export function computeChartGeometry(
  values: readonly number[],
  options: ChartGeometryOptions,
): ChartGeometry {
  const {
    width,
    height,
    paddingLeft = 44,
    paddingBottom = 22,
    paddingTop = 8,
    paddingRight = 4,
    barGapRatio = 0.3,
    targetTicks = 4,
  } = options;

  const plot: Rect = {
    left: paddingLeft,
    top: paddingTop,
    // Clamped at 0 so a chart rendered before layout settles cannot produce
    // negative geometry.
    width: Math.max(0, width - paddingLeft - paddingRight),
    height: Math.max(0, height - paddingTop - paddingBottom),
  };

  const rawMax = values.length > 0 ? Math.max(...values) : 0;
  const { maxValue, step } = computeNiceMax(rawMax, targetTicks);

  const gridLines: GridLine[] = [];
  for (let value = 0; value <= maxValue; value += step) {
    gridLines.push({
      value,
      y: plot.top + plot.height * (1 - value / maxValue),
    });
  }

  const gap = Math.min(0.9, Math.max(0, barGapRatio));
  const slot = values.length > 0 ? plot.width / values.length : 0;
  // A minimum width keeps a 30-day range from rendering invisible hairlines.
  const barWidth = values.length > 0 ? Math.max(2, slot * (1 - gap)) : 0;

  const bars: BarLayout[] = values.map((value, index) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const barHeight = plot.height * (safe / maxValue);

    return {
      index,
      x: plot.left + index * slot + (slot - barWidth) / 2,
      y: plot.top + plot.height - barHeight,
      width: barWidth,
      height: barHeight,
    };
  });

  return { plot, bars, gridLines, maxValue, step };
}

/**
 * Chooses which x-axis labels to draw.
 *
 * Labelling all 30 days of a month overlaps into unreadable mush, so this returns
 * a set of indices spread across the range, always including the first and last.
 */
export function selectLabelIndices(count: number, maxLabels = 4): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const indices = new Set<number>([0, count - 1]);
  const interior = maxLabels - 2;

  for (let i = 1; i <= interior; i += 1) {
    indices.add(Math.round((i * (count - 1)) / (interior + 1)));
  }

  return [...indices].sort((a, b) => a - b);
}
