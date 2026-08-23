import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '@theme/index';
import { ApiError } from '@api/errors';
import { PrimaryButton } from './Button';

export interface ErrorStateProps {
  /** The caught error. `ApiError` codes resolve to `errors.<code>` i18n keys. */
  error?: unknown;
  /** Overrides the derived title. Must already be localized. */
  title?: string;
  /** Overrides the derived body. Must already be localized. */
  body?: string;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Section 7 `ErrorState`: error message + retry.
 *
 * Never renders `error.message` (raw server text, unlocalized). It resolves the
 * normalized `ApiError.code` to a localized string, falling back to a generic
 * message — satisfying Section 9's "map to user-friendly localized messages".
 */
export function ErrorState({ error, title, body, onRetry, compact = false }: ErrorStateProps) {
  const { t } = useTranslation();

  const derivedBody =
    body ?? (error instanceof ApiError ? t(error.i18nKey, { defaultValue: t('errors.unknown') }) : t('errors.unknown'));

  const isOffline = error instanceof ApiError && (error.code === 'offline' || error.code === 'network_error');

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.iconCircle}>
        <Ionicons name={isOffline ? 'cloud-offline-outline' : 'warning-outline'} size={compact ? 24 : 32} color={colors.error} />
      </View>
      <Text style={styles.title}>{title ?? t('errors.title')}</Text>
      <Text style={styles.body}>{derivedBody}</Text>
      {onRetry ? (
        <PrimaryButton label={t('common.retry')} onPress={onRetry} iconLeft="refresh" style={styles.cta} />
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
    backgroundColor: colors.errorLight,
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
    maxWidth: 320,
  },
  cta: { marginTop: spacing.lg, minWidth: 180 },
});
