import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { Screen } from '@components/index';

/**
 * Placeholder for screens scheduled in later Section 16 steps (5-9).
 *
 * These exist so the Section 4 navigation map is fully wired and walkable now —
 * every tab and route resolves to a real screen rather than crashing on a missing
 * component. Each is replaced by its real implementation in its build step; the
 * `step` prop states which one, so nothing here is mistaken for finished work.
 */
export function PlaceholderScreen({
  titleKey,
  icon = 'construct-outline',
  step,
}: {
  titleKey: string;
  icon?: keyof typeof Ionicons.glyphMap;
  step: string;
}) {
  const { t } = useTranslation();

  return (
    <Screen testID={`placeholder-${titleKey}`}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <Text style={styles.body}>{t('common.comingSoonBody')}</Text>
        <View style={styles.stepPill}>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.md },
  body: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs, textAlign: 'center' },
  stepPill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepText: { ...typography.caption, color: colors.textTertiary },
});
