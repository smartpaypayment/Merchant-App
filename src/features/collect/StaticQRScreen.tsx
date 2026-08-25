import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { EmptyState, ErrorState, QRDisplay, QRDisplaySkeleton, Screen } from '@components/index';
import { merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { queryKeys } from '@app/providers/queryClient';
import { useAuthStore } from '@store/authStore';
import { ScreenHeader } from './ScreenHeader';

/**
 * Section 6.6 mode A — My Static QR.
 *
 * "Shows merchant's fixed UPI QR (VPA), merchant name, Share and Download."
 *
 * The QR payload is cached with a long `staleTime` and never garbage-collected,
 * because a merchant's static VPA does not change and this screen must render
 * from cache when offline — Section 11 requires static QR to stay usable with no
 * connectivity, which is only true if the payload is already on the device.
 */
export function StaticQRScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const merchant = useAuthStore((s) => s.merchant);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.staticQr,
    queryFn: merchantApi.getStaticQr,
    // The VPA is effectively immutable; treat the cached payload as fresh.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: (count, err) => !(err instanceof ApiError && err.code === 'kyc_incomplete') && count < 2,
  });

  /**
   * A merchant who has not finished the bank step has no VPA yet, so there is no
   * QR to show. That is a product state, not an error — route them back to
   * finishing verification instead of showing a failure.
   */
  const isKycIncomplete = error instanceof ApiError && error.code === 'kyc_incomplete';

  return (
    <Screen scroll testID="static-qr-screen">
      <ScreenHeader title={t('collect.staticQr.title')} onBack={() => navigation.goBack()} />

      {isLoading ? (
        <View style={styles.centered}>
          <QRDisplaySkeleton />
        </View>
      ) : isKycIncomplete ? (
        <EmptyState
          icon="shield-outline"
          title={t('collect.staticQr.noQrTitle')}
          body={t('collect.staticQr.noQrBody')}
        />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <View style={styles.content}>
          <Text style={styles.instruction}>{t('collect.staticQr.instruction')}</Text>

          <QRDisplay
            payload={data.qrPayload}
            merchantName={data.merchantName || merchant?.businessName}
            caption={`${t('collect.staticQr.vpaLabel')}: ${data.vpa}`}
            size={240}
            showActions
            shareMessage={data.qrPayload}
            testID="static-qr-display"
          />

          <View style={styles.offlineNote}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.success} />
            <Text style={styles.offlineNoteText}>{t('collect.staticQr.offlineUsable')}</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', paddingTop: spacing.xl },
  content: { alignItems: 'center', paddingTop: spacing.md },
  instruction: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 300,
  },
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
