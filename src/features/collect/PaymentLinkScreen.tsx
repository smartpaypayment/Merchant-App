import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { AmountDisplay, GhostButton, PrimaryButton, Screen, SecondaryButton } from '@components/index';
import { formatPaise } from '@utils/money';
import type { CollectStackParamList } from '@app/navigation/types';
import { ScreenHeader } from './ScreenHeader';

type Nav = NativeStackNavigationProp<CollectStackParamList, 'PaymentLink'>;
type Route = RouteProp<CollectStackParamList, 'PaymentLink'>;

/**
 * Section 6.6 mode C — Payment Link.
 *
 * "Enter amount + optional note → POST /payments/link → shareable link → share
 * via WhatsApp/SMS (native share sheet)."
 *
 * Share and Copy are both offered rather than share alone: the native sheet is
 * the fast path, but merchants routinely paste links into an app the sheet does
 * not surface, or into a message they are already composing.
 */
export function PaymentLinkScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { url, amount } = params;

  const [copied, setCopied] = useState(false);

  const shareMessage = t('collect.link.shareMessage', { amount: formatPaise(amount), url });

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    // Revert the confirmation so the button is reusable without leaving the screen.
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch {
      /* Sheet dismissed. */
    }
  };

  return (
    <Screen scroll testID="payment-link-screen">
      <ScreenHeader title={t('collect.link.title')} onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="link" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('collect.link.createdTitle')}</Text>
        <Text style={styles.body}>{t('collect.link.createdBody')}</Text>
        <AmountDisplay amount={amount} size="lg" style={styles.amount} />
      </View>

      <View style={styles.linkCard}>
        <Ionicons name="globe-outline" size={18} color={colors.textTertiary} />
        <Text style={styles.linkText} numberOfLines={2} selectable testID="payment-link-url">
          {url}
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={t('collect.link.shareVia')}
          onPress={() => void share()}
          iconLeft="logo-whatsapp"
          size="lg"
          fullWidth
          testID="payment-link-share"
        />
        <SecondaryButton
          label={copied ? t('collect.link.copied') : t('collect.link.copy')}
          onPress={() => void copy()}
          iconLeft={copied ? 'checkmark' : 'copy-outline'}
          fullWidth
          style={styles.secondaryAction}
          testID="payment-link-copy"
        />
        <GhostButton
          label={t('collect.link.newLink')}
          onPress={() => navigation.replace('AmountEntry', { mode: 'link' })}
          fullWidth
          style={styles.secondaryAction}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.lg },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.md },
  body: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
    maxWidth: 300,
  },
  amount: { marginTop: spacing.md },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { ...typography.small, color: colors.primary, flex: 1 },
  actions: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
});
