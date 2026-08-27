import {
  computeChartGeometry,
  computeNiceMax,
  selectLabelIndices,
} from './chartScale';

/**
 * Chart geometry.
 *
 * A mis-scaled bar chart looks plausible in a screenshot while telling the
 * merchant the wrong thing about which day they earned most, so the scale and the
 * bar heights are pinned here rather than eyeballed.
 */

describe('computeNiceMax', () => {
  it('rounds up to a readable step rather than hugging the data maximum', () => {
    // ₹83.47 of sales should not label the axis with 8347.
    const { maxValue, step } = computeNiceMax(8347, 4);

    expect(maxValue).toBeGreaterThanOrEqual(8347);
    expect(maxValue % step).toBe(0);
    // The tallest bar must not sit flush against the top edge.
    expect(maxValue).toBeGreaterThan(8347);
  });

  it('produces a max that is an exact multiple of the step', () => {
    for (const rawMax of [1, 7, 99, 100, 1234, 55_555, 1_00_000, 98_76_543]) {
      const { maxValue, step } = computeNiceMax(rawMax);
      expect(maxValue % step).toBe(0);
      expect(maxValue).toBeGreaterThanOrEqual(rawMax);
    }
  });

  it('never returns a fractional step, since values are integer paise', () => {
    for (const rawMax of [1, 3, 9, 12, 37, 250, 999]) {
      const { step, maxValue } = computeNiceMax(rawMax);
      expect(Number.isInteger(step)).toBe(true);
      expect(Number.isInteger(maxValue)).toBe(true);
      expect(step).toBeGreaterThan(0);
    }
  });

  it('returns a usable non-zero axis for an empty or flat-zero series', () => {
    // Guards against dividing by zero in the renderer.
    for (const rawMax of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { maxValue, step } = computeNiceMax(rawMax);
      expect(maxValue).toBeGreaterThan(0);
      expect(step).toBeGreaterThan(0);
    }
  });

  it('keeps the tick count near the target', () => {
    const { maxValue, step } = computeNiceMax(10_000, 4);
    const ticks = maxValue / step;
    expect(ticks).toBeGreaterThanOrEqual(3);
    expect(ticks).toBeLessThanOrEqual(6);
  });
});

describe('computeChartGeometry', () => {
  const options = { width: 340, height: 180 };

  it('gives the tallest bar the full plot height', () => {
    const { bars, plot, maxValue } = computeChartGeometry([1000, 5000, 2500], options);

    const tallest = bars[1]!;
    // The tallest value scales to maxValue, not necessarily the full height,
    // because the axis is rounded up.
    expect(tallest.height).toBeCloseTo(plot.height * (5000 / maxValue), 5);
    expect(tallest.height).toBeLessThanOrEqual(plot.height);
  });

  it('scales bar heights proportionally to their values', () => {
    const { bars } = computeChartGeometry([1000, 2000, 4000], options);

    // 2x the value must be 2x the height.
    expect(bars[1]!.height).toBeCloseTo(bars[0]!.height * 2, 5);
    expect(bars[2]!.height).toBeCloseTo(bars[0]!.height * 4, 5);
  });

  it('anchors every bar to the baseline', () => {
    const { bars, plot } = computeChartGeometry([1000, 9000, 300], options);
    const baseline = plot.top + plot.height;

    for (const bar of bars) {
      expect(bar.y + bar.height).toBeCloseTo(baseline, 5);
    }
  });

  it('gives a zero-value day a zero-height bar', () => {
    const { bars } = computeChartGeometry([5000, 0, 2000], options);
    expect(bars[1]!.height).toBe(0);
  });

  it('keeps bars inside the plot area', () => {
    const { bars, plot } = computeChartGeometry([100, 200, 300, 400, 500], options);

    for (const bar of bars) {
      expect(bar.x).toBeGreaterThanOrEqual(plot.left - 0.001);
      expect(bar.x + bar.width).toBeLessThanOrEqual(plot.left + plot.width + 0.001);
      expect(bar.y).toBeGreaterThanOrEqual(plot.top - 0.001);
    }
  });

  it('spaces bars evenly without accumulating rounding drift', () => {
    const { bars } = computeChartGeometry(Array.from({ length: 30 }, () => 1000), options);

    const firstGap = bars[1]!.x - bars[0]!.x;
    const lastGap = bars[29]!.x - bars[28]!.x;
    // Slot-based positioning means the last gap matches the first exactly.
    expect(lastGap).toBeCloseTo(firstGap, 6);
  });

  it('enforces a minimum bar width so a long range stays visible', () => {
    const { bars } = computeChartGeometry(Array.from({ length: 200 }, () => 500), options);
    expect(bars[0]!.width).toBeGreaterThanOrEqual(2);
  });

  it('puts grid lines at exact step multiples, spanning zero to max', () => {
    const { gridLines, maxValue, step } = computeChartGeometry([1000, 8000], options);

    expect(gridLines[0]!.value).toBe(0);
    expect(gridLines.at(-1)!.value).toBe(maxValue);
    for (const line of gridLines) {
      expect(line.value % step).toBe(0);
    }
  });

  it('places the zero grid line on the baseline and the max at the top', () => {
    const { gridLines, plot } = computeChartGeometry([1000], options);

    expect(gridLines[0]!.y).toBeCloseTo(plot.top + plot.height, 5);
    expect(gridLines.at(-1)!.y).toBeCloseTo(plot.top, 5);
  });

  it('handles an empty series without producing NaN', () => {
    const { bars, gridLines, plot } = computeChartGeometry([], options);

    expect(bars).toEqual([]);
    expect(gridLines.length).toBeGreaterThan(0);
    expect(Number.isFinite(plot.width)).toBe(true);
  });

  it('clamps to non-negative geometry when measured smaller than its padding', () => {
    // Can happen on the first frame before layout resolves.
    const { plot } = computeChartGeometry([100], { width: 10, height: 10 });
    expect(plot.width).toBeGreaterThanOrEqual(0);
    expect(plot.height).toBeGreaterThanOrEqual(0);
  });

  it('treats a negative or non-finite value as zero rather than inverting a bar', () => {
    const { bars } = computeChartGeometry([1000, -500, Number.NaN], options);
    expect(bars[1]!.height).toBe(0);
    expect(bars[2]!.height).toBe(0);
  });
});

describe('selectLabelIndices', () => {
  it('labels every point when there are few', () => {
    expect(selectLabelIndices(3, 4)).toEqual([0, 1, 2]);
  });

  it('always includes the first and last point', () => {
    const indices = selectLabelIndices(30, 4);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(29);
  });

  it('caps the number of labels so they cannot overlap', () => {
    expect(selectLabelIndices(30, 4).length).toBeLessThanOrEqual(4);
    expect(selectLabelIndices(365, 4).length).toBeLessThanOrEqual(4);
  });

  it('returns sorted, unique indices', () => {
    const indices = selectLabelIndices(30, 4);
    expect([...new Set(indices)]).toEqual(indices);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it('handles an empty series', () => {
    expect(selectLabelIndices(0)).toEqual([]);
  });
});
