import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { Screen } from '@components/index';
import { useAuthStore } from '@store/authStore';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import type { CollectStackParamList } from '@app/navigation/types';

type Nav = NativeStackNavigationProp<CollectStackParamList, 'CollectPayment'>;

interface Mode {
  key: 'staticQr' | 'dynamicQr' | 'paymentLink';
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Requires connectivity — disabled when offline (Section 11). */
  needsNetwork: boolean;
}

/**
 * Section 6.6 Collect Payment Screen — the entry point for accepting money.
 *
 * Presents the three acceptance modes from the spec. Static QR is listed first
 * and deliberately stays enabled offline: Section 11 requires that "static QR
 * remains usable", and it is the mode a kirana merchant reaches for most.
 */
export function CollectPaymentScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isOnline } = useNetworkStatus();
  const merchant = useAuthStore((s) => s.merchant);

  const modes: Mode[] = [
    {
      key: 'staticQr',
      icon: 'qr-code',
      onPress: () => navigation.navigate('StaticQR'),
      needsNetwork: false,
    },
    {
      key: 'dynamicQr',
      icon: 'calculator-outline',
      onPress: () => navigation.navigate('AmountEntry', { mode: 'qr' }),
      needsNetwork: true,
    },
    {
      key: 'paymentLink',
      icon: 'link-outline',
      onPress: () => navigation.navigate('AmountEntry', { mode: 'link' }),
      needsNetwork: true,
    },
  ];

  return (
    <Screen scroll testID="collect-payment-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('collect.title')}</Text>
        <Text style={styles.subtitle}>{t('collect.subtitle')}</Text>
      </View>

      {merchant?.vpa ? (
        <View style={styles.vpaChip}>
          <Ionicons name="at-outline" size={14} color={colors.primary} />
          <Text style={styles.vpaText} numberOfLines={1} selectable>
            {merchant.vpa}
          </Text>
        </View>
      ) : null}

      <View style={styles.modeList}>
        {modes.map((mode) => {
          const disabled = mode.needsNetwork && !isOnline;

          return (
            <Pressable
              key={mode.key}
              onPress={mode.onPress}
              disabled={disabled}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              accessibilityLabel={t(`collect.modes.${mode.key}`)}
              accessibilityHint={
                disabled ? t('network.offlineActionDisabled') : t(`collect.modes.${mode.key}Body`)
              }
              style={({ pressed }) => [
                styles.modeCard,
                pressed && !disabled && styles.modeCardPressed,
                disabled && styles.modeCardDisabled,
              ]}
              testID={`collect-mode-${mode.key}`}
            >
              <View style={[styles.modeIcon, disabled && styles.modeIconDisabled]}>
                <Ionicons name={mode.icon} size={24} color={disabled ? colors.disabled : colors.primary} />
              </View>

              <View style={styles.modeBody}>
                <Text style={[styles.modeTitle, disabled && styles.textDisabled]}>
                  {t(`collect.modes.${mode.key}`)}
                </Text>
                <Text style={[styles.modeSubtitle, disabled && styles.textDisabled]}>
                  {disabled
                    ? t('network.offlineActionDisabled')
                    : t(`collect.modes.${mode.key}Body`)}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={disabled ? colors.disabled : colors.textTertiary}
              />
            </Pressable>
          );
        })}
      </View>

      {!isOnline ? (
        <View style={styles.offlineNote}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={styles.offlineNoteText}>{t('collect.staticQr.offlineUsable')}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.md, marginBottom: spacing.md },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs },
  vpaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
    maxWidth: '100%',
  },
  vpaText: { ...typography.caption, color: colors.primary, flexShrink: 1 },
  modeList: { gap: spacing.sm },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 24,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeCardPressed: { backgroundColor: colors.surfaceAlt },
  modeCardDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconDisabled: { backgroundColor: colors.disabledSurface },
  modeBody: { flex: 1 },
  modeTitle: { ...typography.bodyMedium, color: colors.text },
  modeSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  textDisabled: { color: colors.disabled },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
  },
  offlineNoteText: { ...typography.caption, color: colors.success, flex: 1 },
});
