import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { KycStatusBadge, Screen } from '@components/index';
import { useAuthStore } from '@store/authStore';
import type { MoreStackParamList } from '@app/navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreMenu'>;

interface MenuItem {
  key: keyof Pick<MoreStackParamList, 'Reports' | 'Profile' | 'Staff' | 'Support' | 'Settings'>;
  icon: keyof typeof Ionicons.glyphMap;
}

const MENU: readonly MenuItem[] = [
  { key: 'Reports', icon: 'bar-chart-outline' },
  { key: 'Profile', icon: 'storefront-outline' },
  { key: 'Staff', icon: 'people-outline' },
  { key: 'Support', icon: 'help-buoy-outline' },
  { key: 'Settings', icon: 'settings-outline' },
] as const;

/** Maps a route name to its i18n key stem, e.g. `Reports` → `more.reports`. */
const i18nStem = (key: MenuItem['key']): string => `more.${key.charAt(0).toLowerCase()}${key.slice(1)}`;

/**
 * The "More" tab menu (Section 4: `More → MoreMenu → Reports, Profile, Staff,
 * Support, Settings`).
 *
 * All five destinations are live as of build step 9. The "Soon" badge and the
 * per-item `available` flag that carried the menu through steps 7–8 are gone
 * rather than left behind as a branch that can no longer be false — Section 16
 * step 10 adds no further rows here.
 */
export function MoreMenuScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const merchant = useAuthStore((s) => s.merchant);

  return (
    <Screen scroll testID="more-menu-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('more.title')}</Text>
      </View>

      {/* Business identity, so the merchant can confirm which account they are in. */}
      {merchant ? (
        <View style={styles.identityCard}>
          <View style={styles.identityAvatar}>
            <Ionicons name="storefront" size={22} color={colors.primary} />
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>
              {merchant.businessName || t('common.appName')}
            </Text>
            {merchant.vpa ? (
              <Text style={styles.identityVpa} numberOfLines={1} selectable>
                {merchant.vpa}
              </Text>
            ) : null}
          </View>
          <KycStatusBadge status={merchant.kycStatus} />
        </View>
      ) : null}

      <View style={styles.menuCard}>
        {MENU.map((item, index) => (
          <Pressable
            key={item.key}
            onPress={() => navigation.navigate(item.key)}
            accessibilityRole="button"
            accessibilityLabel={t(i18nStem(item.key))}
            accessibilityHint={t(`${i18nStem(item.key)}Body`)}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.menuRow,
              index > 0 && styles.menuRowBordered,
              pressed && styles.menuRowPressed,
            ]}
            testID={`more-${item.key.toLowerCase()}`}
          >
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{t(i18nStem(item.key))}</Text>
              <Text style={styles.menuBody} numberOfLines={2}>
                {t(`${i18nStem(item.key)}Body`)}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.heading, color: colors.text },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  identityAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1 },
  identityName: { ...typography.bodyMedium, color: colors.text },
  identityVpa: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuRowPressed: { backgroundColor: colors.surfaceAlt },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1 },
  menuLabel: { ...typography.body, color: colors.text },
  menuBody: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
});
