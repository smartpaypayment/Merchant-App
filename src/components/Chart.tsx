import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect as SvgRect, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing, typography } from '@theme/index';
import type { Paise } from '@models/index';
import { formatPaise, formatPaiseCompact } from '@utils/money';
import { computeChartGeometry, selectLabelIndices } from './chartScale';

export interface ChartPoint {
  /** Value in integer paise. */
  value: Paise;
  /** Short axis label, e.g. `23 Aug`. */
  label: string;
  /** Longer label for the selected-bar readout. */
  fullLabel?: string;
  /** Secondary detail for the readout, e.g. transaction count. */
  detail?: string;
}

export interface ChartProps {
  data: readonly ChartPoint[];
  height?: number;
  /** Accessible summary of the whole chart. */
  accessibilityLabel?: string;
  /** Localized hint shown before any bar is selected. */
  hint?: string;
  testID?: string;
}

/**
 * Section 7 `Chart` — the reusable sales trend chart (Section 6.13).
 *
 * ## Why bars, and why hand-rolled
 *
 * Bars rather than a line: daily takings are discrete events, and a line implies a
 * continuous quantity between days that does not exist. Bars also make "which day
 * was best" a glance rather than a reading exercise.
 *
 * Built directly on `react-native-svg` (already a dependency for QR rendering)
 * instead of Victory Native or a Skia-based library. Those bring a large native
 * footprint for features this screen does not need, and Section 2 targets 2GB
 * Android devices with a lean APK. The scale maths lives in `chartScale.ts` and is
 * unit-tested, which is where charting libraries actually earn their keep.
 *
 * ## Interaction
 *
 * Tapping a bar selects it and shows the exact figure above the chart. This exists
 * because the y-axis is necessarily approximate — a merchant who wants to know
 * precisely what Tuesday brought in should not have to interpolate against grid
 * lines.
 */
export function Chart({ data, height = 200, accessibilityLabel, hint, testID }: ChartProps) {
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const values = useMemo(() => data.map((point) => point.value), [data]);

  const geometry = useMemo(
    () => computeChartGeometry(values, { width, height }),
    [values, width, height],
  );

  const labelIndices = useMemo(() => new Set(selectLabelIndices(data.length, 4)), [data.length]);

  const selected = selectedIndex !== null ? data[selectedIndex] : undefined;

  return (
    <View style={styles.container} testID={testID}>
      {/* Readout sits above the chart so selecting a bar does not shift the
          chart itself, which would move the bar out from under the finger. */}
      <View style={styles.readout}>
        {selected ? (
          <>
            <Text style={styles.readoutValue}>{formatPaise(selected.value)}</Text>
            <Text style={styles.readoutLabel} numberOfLines={1}>
              {selected.fullLabel ?? selected.label}
              {selected.detail ? ` · ${selected.detail}` : ''}
            </Text>
          </>
        ) : hint ? (
          <Text style={styles.readoutHint}>{hint}</Text>
        ) : null}
      </View>

      <View
        onLayout={onLayout}
        style={[styles.plotWrapper, { height }]}
        accessibilityRole="image"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* Grid lines and their value labels. */}
            <G>
              {geometry.gridLines.map((line) => (
                <G key={line.value}>
                  <Line
                    x1={geometry.plot.left}
                    y1={line.y}
                    x2={geometry.plot.left + geometry.plot.width}
                    y2={line.y}
                    stroke={line.value === 0 ? colors.borderStrong : colors.border}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={geometry.plot.left - 6}
                    y={line.y + 4}
                    fontSize={10}
                    fill={colors.textTertiary}
                    textAnchor="end"
                  >
                    {formatPaiseCompact(line.value)}
                  </SvgText>
                </G>
              ))}
            </G>

            {/* Bars. */}
            <G>
              {geometry.bars.map((bar) => {
                const isSelected = bar.index === selectedIndex;
                const point = data[bar.index]!;
                const isEmptyDay = point.value === 0;

                return (
                  <SvgRect
                    key={bar.index}
                    x={bar.x}
                    // A zero-height rect is invisible; a 2px stub shows the day
                    // existed and had no sales, which is different from missing.
                    y={isEmptyDay ? bar.y - 2 : bar.y}
                    width={bar.width}
                    height={isEmptyDay ? 2 : bar.height}
                    rx={Math.min(3, bar.width / 2)}
                    fill={
                      isEmptyDay
                        ? colors.border
                        : isSelected
                          ? colors.primaryDark
                          : colors.primary
                    }
                  />
                );
              })}
            </G>

            {/* Sparse x-axis labels. */}
            <G>
              {geometry.bars.map((bar) =>
                labelIndices.has(bar.index) ? (
                  <SvgText
                    key={`label-${bar.index}`}
                    x={bar.x + bar.width / 2}
                    y={geometry.plot.top + geometry.plot.height + 14}
                    fontSize={10}
                    fill={colors.textTertiary}
                    textAnchor="middle"
                  >
                    {data[bar.index]!.label}
                  </SvgText>
                ) : null,
              )}
            </G>
          </Svg>
        ) : null}

        {/*
          Touch targets are separate overlay views rather than SVG press handlers:
          an 8px-wide bar is far below the 48dp minimum, so each slot gets a
          full-height target spanning its share of the width. That makes a thin bar
          selectable without making the bar itself wider.
        */}
        {width > 0 ? (
          <View style={[styles.touchLayer, { left: geometry.plot.left, width: geometry.plot.width }]}>
            {data.map((point, index) => (
              <Pressable
                key={`touch-${index}`}
                onPress={() => setSelectedIndex(index === selectedIndex ? null : index)}
                accessibilityRole="button"
                accessibilityLabel={`${point.fullLabel ?? point.label}, ${formatPaise(point.value)}`}
                style={styles.touchSlot}
                testID={testID ? `${testID}-bar-${index}` : undefined}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  // Fixed height so the chart does not jump when a bar is selected or cleared.
  readout: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  readoutValue: { ...typography.bodyLarge, color: colors.text },
  readoutLabel: { ...typography.caption, color: colors.textSecondary },
  readoutHint: { ...typography.caption, color: colors.textTertiary },
  plotWrapper: { position: 'relative' },
  touchLayer: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  touchSlot: { flex: 1 },
});
