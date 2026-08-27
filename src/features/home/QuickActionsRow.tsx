import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';

interface QuickAction {
  key: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

/**
 * Section 6.5 quick actions row: My QR, Payment Link, Reports, Refund.
 *
 * Each tile is a 4-up grid item rather than a horizontal scroller so all four are
 * visible without discovery — these are the merchant's most frequent jumps and a
 * hidden fourth item would go unused.
 */
export function QuickActionsRow() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  const actions: QuickAction[] = [
    {
      key: 'myQr',
      labelKey: 'home.quickActions.myQr',
      icon: 'qr-code-outline',
      // Straight to the static QR: this is the one-tap "show my code" path.
      onPress: () =>
        navigation.navigate('Main', { screen: 'Collect', params: { screen: 'StaticQR' } }),
    },
    {
      key: 'paymentLink',
      labelKey: 'home.quickActions.paymentLink',
      icon: 'link-outline',
      onPress: () =>
        navigation.navigate('Main', {
          screen: 'Collect',
          params: { screen: 'AmountEntry', params: { mode: 'link' } },
        }),
    },
    {
      key: 'reports',
      labelKey: 'home.quickActions.reports',
      icon: 'bar-chart-outline',
      // Straight to Reports rather than the More menu — this is a one-tap path.
      onPress: () => navigation.navigate('Main', { screen: 'More', params: { screen: 'Reports' } }),
    },
    {
      key: 'refund',
      labelKey: 'home.quickActions.refund',
      icon: 'return-down-back-outline',
      onPress: () =>
        navigation.navigate('Main', {
          screen: 'Transactions',
          params: { screen: 'TransactionsList' },
        }),
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('home.quickActions.title')}</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={t(action.labelKey)}
            android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={action.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {t(action.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  title: { ...typography.bodyMedium, color: colors.text, marginBottom: spacing.xs },
  grid: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  label: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
