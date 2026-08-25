import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import QRCodeSvg from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { colors, radius, shadow, spacing, typography } from '@theme/index';
import { SecondaryButton } from './Button';

/** `toDataURL` is exposed on the QR instance but is absent from the package types. */
interface QRCodeRef {
  toDataURL: (callback: (base64: string) => void) => void;
}

export interface QRDisplayProps {
  /** The UPI intent string to encode. */
  payload: string;
  /** Merchant name shown beneath the code. */
  merchantName?: string;
  /** Secondary caption, e.g. the VPA or the amount. */
  caption?: string;
  size?: number;
  /** Renders Share / Download actions. */
  showActions?: boolean;
  /** Text shared alongside the image (falls back to the payload). */
  shareMessage?: string;
  /** Dims the code, used while a dynamic QR is expired. */
  dimmed?: boolean;
  testID?: string;
}

/**
 * Section 7 `QRDisplay` — renders a QR plus share/download.
 *
 * The PNG for share/download comes from the SVG's own `toDataURL`, so there is no
 * view-shot dependency and the exported image is crisp at any size rather than
 * being a screen-resolution screenshot.
 *
 * Error correction is set to `M`: `H` would survive more damage but packs the
 * modules tighter, and a printed static QR on a shop counter is read at distance
 * in poor light, where module size matters more than redundancy.
 */
export function QRDisplay({
  payload,
  merchantName,
  caption,
  size = 220,
  showActions = false,
  shareMessage,
  dimmed = false,
  testID,
}: QRDisplayProps) {
  const { t } = useTranslation();
  const qrRef = useRef<QRCodeRef | null>(null);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);

  /** Writes the QR to a cache file and returns its uri. */
  const writePng = useCallback(
    (): Promise<string | null> =>
      new Promise((resolve) => {
        const instance = qrRef.current;
        if (!instance) {
          resolve(null);
          return;
        }

        instance.toDataURL((base64) => {
          try {
            const dir = new Directory(Paths.cache, 'qr');
            if (!dir.exists) dir.create({ intermediates: true });

            const file = new File(dir, `merchant-qr-${Date.now()}.png`);
            file.create({ overwrite: true });
            // `toDataURL` yields bare base64 with no data-uri prefix.
            file.write(base64, { encoding: 'base64' });
            resolve(file.uri);
          } catch {
            resolve(null);
          }
        });
      }),
    [],
  );

  const handleShare = useCallback(async () => {
    setBusy('share');
    try {
      const uri = await writePng();

      if (uri && (await Sharing.isAvailableAsync())) {
        // Image share: what a merchant actually wants to send on WhatsApp.
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('common.share') });
        return;
      }

      // Fallback to a text share when the image could not be produced.
      await Share.share({ message: shareMessage ?? payload });
    } catch {
      /* User dismissed the sheet, or sharing is unavailable. */
    } finally {
      setBusy(null);
    }
  }, [payload, shareMessage, t, writePng]);

  const handleDownload = useCallback(async () => {
    setBusy('download');
    try {
      const uri = await writePng();
      if (!uri) return;

      // Android has no writable public "Downloads" path without SAF or the media
      // library, so the save is routed through the share sheet, which lets the
      // merchant pick Files/Drive/Photos. That is the honest cross-platform
      // behaviour rather than silently writing to a sandbox the merchant cannot
      // browse to.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('common.download'),
          UTI: 'public.png',
        });
      }
    } catch {
      /* no-op */
    } finally {
      setBusy(null);
    }
  }, [t, writePng]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.card, dimmed && styles.dimmed]}>
        <QRCodeSvg
          value={payload}
          size={size}
          backgroundColor={colors.surface}
          color={colors.text}
          ecl="M"
          quietZone={8}
          getRef={(ref: unknown) => {
            qrRef.current = ref as QRCodeRef | null;
          }}
        />
      </View>

      {merchantName ? (
        <Text style={styles.merchantName} numberOfLines={1}>
          {merchantName}
        </Text>
      ) : null}
      {caption ? (
        <Text style={styles.caption} numberOfLines={1} selectable>
          {caption}
        </Text>
      ) : null}

      {showActions ? (
        <View style={styles.actions}>
          <SecondaryButton
            label={t('common.share')}
            onPress={() => void handleShare()}
            loading={busy === 'share'}
            iconLeft="share-social-outline"
            style={styles.actionButton}
            testID="qr-share-button"
          />
          <SecondaryButton
            label={t('common.download')}
            onPress={() => void handleDownload()}
            loading={busy === 'download'}
            iconLeft="download-outline"
            style={styles.actionButton}
            testID="qr-download-button"
          />
        </View>
      ) : null}
    </View>
  );
}

/** Placeholder while a dynamic QR is being generated. */
export function QRDisplaySkeleton({ size = 220 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={[styles.card, styles.skeletonCard, { width: size + 32, height: size + 32 }]}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={t('a11y.loading')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  skeletonCard: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.35 },
  merchantName: { ...typography.bodyMedium, color: colors.text, marginTop: spacing.sm },
  caption: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' },
  actionButton: { flex: 1 },
});
