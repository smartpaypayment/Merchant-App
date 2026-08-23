import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '@theme/index';
import type { KycStatus, SettlementStatus, TxnStatus } from '@models/index';

type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
  error: { bg: colors.errorLight, fg: colors.error },
  info: { bg: colors.infoLight, fg: colors.info },
  neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary },
};

/** Section 7 `StatusBadge` — coloured status pill. */
export function StatusBadge({
  label,
  tone,
  size = 'md',
}: {
  label: string;
  tone: BadgeTone;
  size?: 'sm' | 'md';
}) {
  const palette = TONE_STYLE[tone];
  return (
    <View style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: palette.bg }]}>
      <Text
        style={[size === 'sm' ? typography.caption : typography.captionMedium, { color: palette.fg }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </View>
  );
}

const TXN_TONE: Record<TxnStatus, BadgeTone> = {
  success: 'success',
  pending: 'warning',
  failed: 'error',
  refunded: 'info',
  partially_refunded: 'info',
};

export function TransactionStatusBadge({ status, size }: { status: TxnStatus; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      label={t(`transactions.status.${status}`, { defaultValue: status })}
      tone={TXN_TONE[status]}
      {...(size ? { size } : {})}
    />
  );
}

const KYC_TONE: Record<KycStatus, BadgeTone> = {
  not_started: 'neutral',
  in_progress: 'warning',
  pending_review: 'info',
  approved: 'success',
  rejected: 'error',
};

export function KycStatusBadge({ status, size }: { status: KycStatus; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <StatusBadge label={t(`kyc.status.${status}`)} tone={KYC_TONE[status]} {...(size ? { size } : {})} />
  );
}

const SETTLEMENT_TONE: Record<SettlementStatus, BadgeTone> = {
  pending: 'warning',
  processing: 'info',
  settled: 'success',
  failed: 'error',
};

export function SettlementStatusBadge({ status, size }: { status: SettlementStatus; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      label={t(`settlements.status.${status}`, { defaultValue: status })}
      tone={SETTLEMENT_TONE[status]}
      {...(size ? { size } : {})}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeSm: { paddingHorizontal: spacing.xxs, paddingVertical: 2 },
});
