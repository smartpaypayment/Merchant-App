import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '@theme/index';

export interface ScreenHeaderProps {
  /** Already-localized title. */
  title: string;
  onBack?: () => void;
  /** Rendered on the trailing edge, e.g. a cancel action. */
  trailing?: React.ReactNode;
}

/**
 * Compact in-screen header for pushed routes.
 *
 * The Collect stack runs with `headerShown: false` so each screen controls its
 * own chrome — the QR screens need the full height for the code, and a native
 * header would eat 56dp of it.
 */
export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.back')}
          style={styles.button}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.button} />
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {trailing ?? <View style={styles.button} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.bodyLarge, color: colors.text, flex: 1, textAlign: 'center' },
});
