import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { LanguageSelector, ReauthSheet, Screen, SecondaryButton } from '@components/index';
import { merchantApi } from '@api/index';
import { useAuthStore } from '@store/authStore';
import { clearPin, getBiometricCapability, hasPin, type BiometricCapability } from '@store/appLock';
// The language itself is persisted by `LanguageSelector` (which calls `setLanguage`
// before invoking `onChanged`); this screen only mirrors the choice to the server.
import { SUPPORTED_LANGUAGES } from '@localization/resources';
import type { MerchantPreferences } from '@models/index';
import { ScreenHeader } from '@features/collect/ScreenHeader';

/**
 * Section 6.16 Settings Screen.
 *
 * Language, audio confirmation, notification preferences, app lock and logout.
 * Changes are applied optimistically and pushed with `PATCH /merchant/preferences`;
 * the language choice is additionally persisted locally by `setLanguage` so it
 * survives a cold start before the profile loads.
 *
 * ## Two things this screen deliberately does not offer
 *
 * **An announcement volume slider.** Section 6.16 lists volume, and
 * `MerchantPreferences.audioConfirmation.volume` exists in the model, but the
 * announcement is produced by `expo-speech`, which exposes no volume control — it
 * follows the device media volume. Rendering a slider that moved nothing would be
 * a lie about what the app can do, so the screen states where the volume actually
 * comes from instead. The field stays in the model for the pre-recorded-clip
 * implementation described in `audioConfirmation.ts`, which can honour it.
 *
 * **A theme toggle.** The design system is light-only: `theme/colors.ts` is a
 * static palette imported directly by every component. Dark mode is not a toggle,
 * it is a second palette plus a context to thread it through and a re-verification
 * of every contrast ratio against the Section 13 accessibility requirement. That
 * is its own piece of work, so the section says what the app does today rather
 * than offering a switch with nothing behind it.
 */
export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();

  const merchant = useAuthStore((s) => s.merchant);
  const setMerchant = useAuthStore((s) => s.setMerchant);
  const logout = useAuthStore((s) => s.logout);

  const [biometric, setBiometric] = useState<BiometricCapability | null>(null);
  const [pinExists, setPinExists] = useState(false);
  const [reauthVisible, setReauthVisible] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const refreshSecurityState = useCallback(async () => {
    const [capability, exists] = await Promise.all([getBiometricCapability(), hasPin()]);
    setBiometric(capability);
    setPinExists(exists);
  }, []);

  useEffect(() => {
    void refreshSecurityState();
  }, [refreshSecurityState]);

  /* ------------------------------ preferences ------------------------------ */

  const savePreferences = useMutation({
    mutationFn: (next: Partial<MerchantPreferences>) => merchantApi.updatePreferences(next),
    onSuccess: (preferences) => {
      if (merchant) setMerchant({ ...merchant, preferences });
      setSaveError(false);
    },
    onError: () => setSaveError(true),
  });

  const preferences = merchant?.preferences;

  /**
   * Applies a preference change locally first, then persists.
   *
   * Optimistic because a toggle that waits on a round-trip feels broken on a slow
   * connection; the store is corrected from the server response either way, and a
   * failure surfaces an inline message rather than silently reverting.
   */
  const updatePreferences = useCallback(
    (next: Partial<MerchantPreferences>) => {
      if (!merchant || !preferences) return;
      setMerchant({ ...merchant, preferences: { ...preferences, ...next } });
      savePreferences.mutate(next);
    },
    [merchant, preferences, setMerchant, savePreferences],
  );

  const setAudioEnabled = (enabled: boolean) => {
    if (!preferences) return;
    updatePreferences({ audioConfirmation: { ...preferences.audioConfirmation, enabled } });
  };

  const setAudioLanguage = (language: string) => {
    if (!preferences) return;
    updatePreferences({ audioConfirmation: { ...preferences.audioConfirmation, language } });
  };

  const setNotification = (key: keyof MerchantPreferences['notifications'], value: boolean) => {
    if (!preferences) return;
    updatePreferences({ notifications: { ...preferences.notifications, [key]: value } });
  };

  /**
   * Changing the app language also moves the announcement language when the two
   * were in step. A merchant switching the app to Tamil almost certainly wants to
   * be told "500 ரூபாய் கிடைத்தது" too, but an explicitly different announcement
   * language is left alone.
   */
  const handleLanguageChange = (code: string) => {
    if (!preferences) return;
    const followsApp = preferences.audioConfirmation.language === preferences.language;

    updatePreferences({
      language: code,
      ...(followsApp
        ? { audioConfirmation: { ...preferences.audioConfirmation, language: code } }
        : {}),
    });
  };

  /* -------------------------------- app lock ------------------------------- */

  const startPinChange = () => {
    if (pinExists) {
      // Prove ownership of the current PIN before replacing it.
      setReauthVisible(true);
    } else {
      void beginPinSetup();
    }
  };

  /**
   * Clearing the stored PIN makes `ReauthSheet` fall into its inline setup flow,
   * which is the same create-and-confirm UI used the first time. Reusing it keeps
   * one implementation of PIN entry rather than a second, near-identical one here.
   */
  const beginPinSetup = async () => {
    await clearPin();
    setPinExists(false);
    setReauthVisible(true);
  };

  const confirmLogout = () => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logoutCta'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const audioLanguageName =
    SUPPORTED_LANGUAGES.find((l) => l.code === preferences?.audioConfirmation.language)?.nativeName ??
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.nativeName ??
    '';

  return (
    <Screen scroll testID="settings-screen">
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      {saveError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>{t('settings.saveFailed')}</Text>
        </View>
      ) : null}

      {/* ------------------------------ Language ----------------------------- */}
      <Text style={styles.sectionTitle}>{t('settings.languageTitle')}</Text>
      <Text style={styles.sectionBody}>{t('settings.languageBody')}</Text>
      <LanguageSelector variant="list" onChanged={handleLanguageChange} />

      {/* ------------------------------- Audio ------------------------------- */}
      <Text style={styles.sectionTitle}>{t('settings.audioTitle')}</Text>
      <View style={styles.card}>
        <ToggleRow
          label={t('settings.audioEnabledLabel')}
          body={t('settings.audioEnabledBody')}
          value={preferences?.audioConfirmation.enabled ?? true}
          onValueChange={setAudioEnabled}
          testID="settings-audio-toggle"
        />

        {preferences?.audioConfirmation.enabled ? (
          <View style={[styles.row, styles.rowBordered]}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{t('settings.audioLanguageLabel')}</Text>
              <Text style={styles.rowBody}>{audioLanguageName}</Text>
            </View>
            <AudioLanguagePicker
              current={preferences.audioConfirmation.language}
              onSelect={setAudioLanguage}
            />
          </View>
        ) : null}
      </View>
      <Text style={styles.footnote}>{t('settings.audioVolumeNote')}</Text>

      {/* --------------------------- Notifications --------------------------- */}
      <Text style={styles.sectionTitle}>{t('settings.notificationsTitle')}</Text>
      <View style={styles.card}>
        <ToggleRow
          label={t('settings.pushLabel')}
          value={preferences?.notifications.push ?? true}
          onValueChange={(v) => setNotification('push', v)}
          testID="settings-push-toggle"
        />
        <ToggleRow
          label={t('settings.smsLabel')}
          value={preferences?.notifications.sms ?? true}
          onValueChange={(v) => setNotification('sms', v)}
          bordered
        />
        <ToggleRow
          label={t('settings.whatsappLabel')}
          value={preferences?.notifications.whatsapp ?? false}
          onValueChange={(v) => setNotification('whatsapp', v)}
          bordered
        />
      </View>

      {/* ------------------------------ Security ----------------------------- */}
      <Text style={styles.sectionTitle}>{t('settings.securityTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('settings.pinLabel')}</Text>
            <Text style={styles.rowBody}>
              {pinExists ? t('settings.pinSetBody') : t('settings.pinNotSetBody')}
            </Text>
          </View>
          <Pressable
            onPress={startPinChange}
            accessibilityRole="button"
            accessibilityLabel={pinExists ? t('settings.pinChangeCta') : t('settings.pinSetCta')}
            style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}
            testID="settings-pin-action"
          >
            <Text style={styles.inlineActionText}>
              {pinExists ? t('settings.pinChangeCta') : t('settings.pinSetCta')}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.row, styles.rowBordered]}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('settings.biometricLabel')}</Text>
            <Text style={styles.rowBody}>
              {biometric?.available
                ? t('settings.biometricAvailableBody')
                : t('settings.biometricUnavailableBody')}
            </Text>
          </View>
          {/*
            Read-only state, not a toggle. Biometrics are used automatically when
            the OS reports an enrolled fingerprint or face; there is nothing for
            the app to switch on, and enrolment happens in system settings.
          */}
          <Ionicons
            name={biometric?.available ? 'checkmark-circle' : 'remove-circle-outline'}
            size={22}
            color={biometric?.available ? colors.success : colors.textTertiary}
          />
        </View>
      </View>

      {/* ----------------------------- Appearance ---------------------------- */}
      <Text style={styles.sectionTitle}>{t('settings.themeTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowBody}>{t('settings.themeLightOnly')}</Text>
        </View>
      </View>

      {/* -------------------------------- About ------------------------------ */}
      <Text style={styles.sectionTitle}>{t('settings.aboutTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.versionLabel')}</Text>
          <Text style={styles.rowValue}>{appVersion}</Text>
        </View>
      </View>

      <SecondaryButton
        label={t('settings.logoutCta')}
        onPress={confirmLogout}
        iconLeft="log-out-outline"
        fullWidth
        style={styles.logoutCta}
        testID="settings-logout"
      />

      <ReauthSheet
        visible={reauthVisible}
        reason={pinExists ? t('settings.pinReauthReason') : t('settings.pinSetBody')}
        onSuccess={() => {
          setReauthVisible(false);

          if (pinExists) {
            // Ownership proven — now clear and re-enter through the setup flow.
            void beginPinSetup();
          } else {
            void refreshSecurityState();
            Alert.alert(t('settings.pinChanged'));
          }
        }}
        onCancel={() => {
          setReauthVisible(false);
          void refreshSecurityState();
        }}
      />
    </Screen>
  );
}

/** Compact language picker for the announcement language. */
function AudioLanguagePicker({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (code: string) => void;
}) {
  const { t } = useTranslation();

  const cycle = () => {
    // A full sheet for a secondary setting is heavy; this steps through the
    // shipped languages, which is enough for a field the merchant sets once.
    const index = SUPPORTED_LANGUAGES.findIndex((l) => l.code === current);
    const next = SUPPORTED_LANGUAGES[(index + 1) % SUPPORTED_LANGUAGES.length]!;
    onSelect(next.code);
  };

  return (
    <Pressable
      onPress={cycle}
      accessibilityRole="button"
      accessibilityLabel={t('settings.audioLanguageLabel')}
      style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}
      testID="settings-audio-language"
    >
      <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
      <Text style={styles.inlineActionText}>{t('common.edit')}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  body,
  value,
  onValueChange,
  bordered = false,
  testID,
}: {
  label: string;
  body?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  bordered?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.row, bordered && styles.rowBordered]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {body ? <Text style={styles.rowBody}>{body}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.surface}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  sectionBody: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text },
  rowBody: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  rowValue: { ...typography.smallMedium, color: colors.text },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  inlineActionText: { ...typography.smallMedium, color: colors.primary },
  pressed: { opacity: 0.7 },
  footnote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  logoutCta: { marginTop: spacing.xl },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
});
