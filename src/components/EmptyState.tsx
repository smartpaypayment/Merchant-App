import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { PrimaryButton } from './Button';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Already-localized title. */
  title: string;
  /** Already-localized body. */
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  compact?: boolean;
}

/** Section 7 `EmptyState`: icon + message + optional CTA. */
export function EmptyState({
  icon = 'documents-outline',
  title,
  body,
  ctaLabel,
  onCtaPress,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={compact ? 24 : 32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <PrimaryButton label={ctaLabel} onPress={onCtaPress} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  compact: { paddingVertical: spacing.lg },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.bodyLarge, color: colors.text, textAlign: 'center' },
  body: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 300,
  },
  cta: { marginTop: spacing.lg, minWidth: 200 },
});
