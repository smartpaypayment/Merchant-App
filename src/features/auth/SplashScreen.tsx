import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '@theme/index';

/**
 * Section 6.1 Splash Screen.
 *
 * "Shows: Logo, loads auth state. States: Loading only."
 *
 * Purely presentational — the token check lives in `authStore.bootstrap()`, which
 * `RootNavigator` kicks off. This screen is what the merchant sees while that
 * runs, and it unmounts as soon as the session status resolves.
 */
export function SplashScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.logoMark}>
        <Text style={styles.logoGlyph} allowFontScaling={false}>
          {'\u20B9'}
        </Text>
      </View>

      <Text style={styles.wordmark}>{t('common.appName')}</Text>
      <Text style={styles.tagline}>{t('auth.splash.tagline')}</Text>

      <ActivityIndicator
        size="small"
        color={colors.textInverse}
        style={styles.spinner}
        accessibilityLabel={t('a11y.loading')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logoMark: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: { fontSize: 48, lineHeight: 56, fontWeight: '700', color: colors.primary },
  wordmark: { ...typography.heading, color: colors.textInverse, marginTop: spacing.md },
  tagline: { ...typography.small, color: 'rgba(255,255,255,0.85)', marginTop: spacing.xxs },
  spinner: { marginTop: spacing.xl },
});
