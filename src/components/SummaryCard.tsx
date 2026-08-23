import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@theme/index';
import type { Paise } from '@models/index';
import { AmountDisplay } from './AmountDisplay';

export interface SummaryCardProps {
  /** Localized label. */
  label: string;
  /** Integer paise. Omit and pass `value` for non-money metrics. */
  amount?: Paise;
  /** Pre-formatted non-money value (e.g. a transaction count). */
  value?: string;
  caption?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'brand';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Section 7 `SummaryCard` — dashboard metric tile. */
export function SummaryCard({
  label,
  amount,
  value,
  caption,
  icon,
  tone = 'default',
  onPress,
  style,
  testID,
}: SummaryCardProps) {
  const isBrand = tone === 'brand';

  const content = (
    <>
      <View style={styles.header}>
        <Text style={[styles.label, isBrand && styles.labelBrand]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? (
          <Ionicons name={icon} size={18} color={isBrand ? colors.textInverse : colors.textTertiary} />
        ) : null}
      </View>

      {amount !== undefined ? (
        <AmountDisplay
          amount={amount}
          size="lg"
          tone={isBrand ? 'inverse' : 'default'}
          style={styles.value}
        />
      ) : (
        <Text style={[styles.plainValue, isBrand && styles.labelBrand]}>{value}</Text>
      )}

      {caption ? (
        <Text style={[styles.caption, isBrand && styles.captionBrand]} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
        style={({ pressed }) => [
          styles.card,
          isBrand && styles.cardBrand,
          pressed && styles.pressed,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.card, isBrand && styles.cardBrand, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardBrand: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.9 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xxs },
  label: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  labelBrand: { color: colors.textInverse },
  value: { marginTop: spacing.xs },
  plainValue: { ...typography.heading, color: colors.text, marginTop: spacing.xs },
  caption: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xxs },
  captionBrand: { color: 'rgba(255,255,255,0.85)' },
});
