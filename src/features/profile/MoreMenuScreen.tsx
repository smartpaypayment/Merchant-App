import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
  /** False for sections still to be built (Section 16 step 9). */
  available: boolean;
}

const MENU: readonly MenuItem[] = [
  { key: 'Reports', icon: 'bar-chart-outline', available: true },
  { key: 'Profile', icon: 'storefront-outline', available: false },
  { key: 'Staff', icon: 'people-outline', available: false },
  { key: 'Support', icon: 'help-buoy-outline', available: false },
  { key: 'Settings', icon: 'settings-outline', available: false },
] as const;

/** Maps a route name to its i18n key stem, e.g. `Reports` → `more.reports`. */
const i18nStem = (key: MenuItem['key']): string => `more.${key.charAt(0).toLowerCase()}${key.slice(1)}`;

/**
 * The "More" tab menu (Section 4: `More → MoreMenu → Reports, Profile, Staff,
 * Support, Settings`).
 *
 * Reports is live. The remaining four are marked with a "Soon" badge and explain
 * themselves when tapped, rather than being either invisible or silently inert —
 * a merchant should be able to see that the feature is coming and that their tap
 * registered. They become live in build step 9.
 */
export function MoreMenuScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const merchant = useAuthStore((s) => s.merchant);

  const openPending = () => {
    Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'));
  };

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
            onPress={() => (item.available ? navigation.navigate(item.key) : openPending())}
            accessibilityRole="button"
            accessibilityLabel={t(i18nStem(item.key))}
            accessibilityHint={
              item.available ? t(`${i18nStem(item.key)}Body`) : t('common.comingSoonBody')
            }
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.menuRow,
              index > 0 && styles.menuRowBordered,
              pressed && styles.menuRowPressed,
            ]}
            testID={`more-${item.key.toLowerCase()}`}
          >
            <View style={[styles.menuIcon, !item.available && styles.menuIconPending]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={item.available ? colors.primary : colors.textTertiary}
              />
            </View>

            <View style={styles.menuText}>
              <View style={styles.menuLabelRow}>
                <Text style={[styles.menuLabel, !item.available && styles.menuLabelPending]}>
                  {t(i18nStem(item.key))}
                </Text>
                {!item.available ? (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonBadgeText}>{t('more.comingSoonBadge')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.menuBody} numberOfLines={2}>
                {t(`${i18nStem(item.key)}Body`)}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color={item.available ? colors.textTertiary : colors.disabled}
            />
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
  menuIconPending: { backgroundColor: colors.surfaceAlt },
  menuText: { flex: 1 },
  menuLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  menuLabel: { ...typography.body, color: colors.text },
  menuLabelPending: { color: colors.textSecondary },
  soonBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  soonBadgeText: { ...typography.caption, color: colors.textTertiary, fontSize: 10 },
  menuBody: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
});
