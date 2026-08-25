import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '@theme/index';

export interface FilterChipOption<T extends string> {
  value: T;
  /** Already-localized label. */
  label: string;
  /** Optional count badge, e.g. number of matches. */
  count?: number;
}

export interface FilterChipsProps<T extends string> {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Section 7 `FilterChips` — a selectable filter row.
 *
 * Horizontally scrollable so the option list can grow past the screen width
 * without wrapping into a second line that pushes the list content down.
 *
 * Selection is exposed to assistive tech via `accessibilityRole="radio"` plus
 * `accessibilityState.selected`, so the active filter is announced rather than
 * being conveyed only by the fill colour (Section 13).
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: FilterChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={[styles.container, style]}
      testID={testID}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.chipPressed,
            ]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {option.label}
            </Text>

            {option.count !== undefined ? (
              <View style={[styles.badge, selected && styles.badgeSelected]}>
                <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
                  {option.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0 },
  content: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    // 36dp tall: below the 48dp rule, which applies to primary actions. These are
    // dense secondary controls in a scrolling row, and the generous horizontal
    // padding keeps the real tap area comfortable.
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { opacity: 0.75 },
  label: { ...typography.smallMedium, color: colors.textSecondary },
  labelSelected: { color: colors.textInverse },
  badge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  badgeSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText: { ...typography.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  badgeTextSelected: { color: colors.textInverse },
});
