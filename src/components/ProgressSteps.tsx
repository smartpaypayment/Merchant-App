import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';

export interface ProgressStepsProps {
  /** 1-based index of the step being shown. */
  current: number;
  /** Localized labels, one per step. */
  labels: string[];
  /** Highest step already completed (0 = none). */
  completedThrough?: number;
}

/**
 * Progress indicator for the KYC wizard (Section 6.4: "Progress indicator across
 * steps").
 *
 * Completed steps show a tick rather than a number so progress is legible at a
 * glance to a low-literacy user, and the state is not conveyed by colour alone.
 */
export function ProgressSteps({ current, labels, completedThrough = 0 }: ProgressStepsProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {labels.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber <= completedThrough || stepNumber < current;
        const isCurrent = stepNumber === current;
        const isLast = index === labels.length - 1;

        return (
          <View key={label} style={styles.stepWrapper}>
            <View style={styles.stepRow}>
              <View
                style={[
                  styles.dot,
                  isCompleted && styles.dotCompleted,
                  isCurrent && styles.dotCurrent,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text style={[styles.dotLabel, isCurrent && styles.dotLabelCurrent]}>{stepNumber}</Text>
                )}
              </View>

              {!isLast ? (
                <View style={[styles.connector, isCompleted && styles.connectorCompleted]} />
              ) : null}
            </View>

            <Text
              style={[styles.label, (isCurrent || isCompleted) && styles.labelActive]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 28;

const styles = StyleSheet.create({
  container: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepWrapper: { flex: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCompleted: { backgroundColor: colors.success, borderColor: colors.success },
  dotCurrent: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  dotLabel: { ...typography.captionMedium, color: colors.textTertiary },
  dotLabelCurrent: { color: colors.primary },
  connector: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: spacing.xxs },
  connectorCompleted: { backgroundColor: colors.success },
  label: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xxs },
  labelActive: { color: colors.textSecondary, fontWeight: '600' },
});
