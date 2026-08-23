import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { PrimaryButton, Screen, SecondaryButton, KycStatusBadge } from '@components/index';
import { useAuthStore } from '@store/authStore';
import { formatPaise } from '@utils/money';
import { PROGRESSIVE_KYC_DAILY_LIMIT } from '@api/mocks/db';
import { useKycDraft } from './useKycDraft';

/**
 * Section 6.4 Step 5 — Done.
 * "Success + 'Generate my QR' CTA."
 *
 * Two variants, driven by `kycStatus`:
 *   - `approved`      → full success, straight to the QR.
 *   - `pending_review` → submitted but under review; the merchant can still
 *     collect, so we state the progressive-KYC daily cap explicitly rather than
 *     leaving them to discover it when a payment is rejected.
 *
 * Both CTAs simply clear the draft: the root gate re-evaluates `kycStatus` and
 * swaps in the main tabs, so no manual navigation is needed.
 */
export function KycDoneScreen() {
  const { t } = useTranslation();
  const merchant = useAuthStore((s) => s.merchant);
  const refreshMerchant = useAuthStore((s) => s.refreshMerchant);
  const { clear } = useKycDraft();

  const isApproved = merchant?.kycStatus === 'approved';

  /**
   * Clearing the draft is what releases the merchant from the onboarding branch:
   * `RootNavigator` keys off `kycStatus`, which is already `approved` or
   * `pending_review` by this point, so a refresh is enough to move on.
   */
  const finish = async () => {
    await clear();
    await refreshMerchant();
  };

  return (
    <Screen scroll testID="kyc-done">
      <View style={styles.content}>
        <View style={[styles.iconCircle, isApproved ? styles.iconSuccess : styles.iconPending]}>
          <Ionicons
            name={isApproved ? 'checkmark-circle' : 'time-outline'}
            size={48}
            color={isApproved ? colors.success : colors.info}
          />
        </View>

        <Text style={styles.title}>
          {isApproved ? t('kyc.done.title') : t('kyc.done.pendingTitle')}
        </Text>
        <Text style={styles.subtitle}>
          {isApproved ? t('kyc.done.subtitle') : t('kyc.done.pendingSubtitle')}
        </Text>

        {merchant ? (
          <View style={styles.badgeRow}>
            <KycStatusBadge status={merchant.kycStatus} />
          </View>
        ) : null}

        {merchant?.vpa ? (
          <View style={styles.vpaCard}>
            <Text style={styles.vpaLabel}>{t('kyc.done.vpaLabel')}</Text>
            <Text style={styles.vpaValue} selectable>
              {merchant.vpa}
            </Text>
          </View>
        ) : null}

        {!isApproved ? (
          <View style={styles.limitNote}>
            <Ionicons name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.limitText}>
              {t('kyc.done.limitsNote', {
                limit: formatPaise(PROGRESSIVE_KYC_DAILY_LIMIT, { decimals: false }),
              })}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={t('kyc.done.generateQr')}
          onPress={() => void finish()}
          iconLeft="qr-code-outline"
          size="lg"
          fullWidth
          testID="kyc-done-generate-qr"
        />
        <SecondaryButton
          label={t('kyc.done.goHome')}
          onPress={() => void finish()}
          fullWidth
          style={styles.secondaryCta}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingTop: spacing.xl, flex: 1 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSuccess: { backgroundColor: colors.successLight },
  iconPending: { backgroundColor: colors.infoLight },
  title: { ...typography.heading, color: colors.text, marginTop: spacing.lg, textAlign: 'center' },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  badgeRow: { marginTop: spacing.md },
  vpaCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  vpaLabel: { ...typography.caption, color: colors.textTertiary },
  vpaValue: { ...typography.bodyMedium, color: colors.primary, marginTop: spacing.xxs },
  limitNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  limitText: { ...typography.caption, color: colors.info, flex: 1 },
  actions: { paddingBottom: spacing.lg },
  secondaryCta: { marginTop: spacing.sm },
});
