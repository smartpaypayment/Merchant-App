import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { GhostButton, PinPad } from '@components/index';
import {
  authenticateBiometric,
  getBiometricCapability,
  getPinLength,
  loadLockState,
  PIN_LENGTH_BOUNDS,
  verifyPin,
  type BiometricCapability,
} from '@store/appLock';
import { useAuthStore } from '@store/authStore';
import { useLockManager } from '@store/lockManager';
import { useCountdown } from '@hooks/useCountdown';
import { useSensitiveScreen } from '@hooks/useSensitiveScreen';

/**
 * Full-screen app lock (Section 12).
 *
 * Mounted by `RootNavigator` in place of the authenticated tree whenever
 * `lockManager` says the app is locked, rather than presented as a modal over it.
 * That distinction is the whole point: a modal leaves the real screen mounted and
 * rendered underneath, so the day's takings would still be visible behind the
 * sheet and in the app-switcher thumbnail.
 *
 * ## The escape hatch is mandatory
 *
 * A merchant who forgets their PIN must be able to get back in, or the app is
 * bricked and their money is unreachable. "Forgot PIN? Log out" clears the session
 * and returns them to the OTP flow, where possession of the registered SIM is the
 * recovery credential. That is a deliberate trade: it means the lock protects
 * *data at rest on the device*, not the account itself — an attacker who also
 * controls the SIM is out of scope here and is handled by OTP.
 */
export function LockScreen() {
  const { t } = useTranslation();
  const unlock = useLockManager((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const businessName = useAuthStore((s) => s.merchant?.businessName);

  // FLAG_SECURE while the lock is up: keeps the unlock screen out of screenshots
  // and blanks the app-switcher thumbnail on Android.
  useSensitiveScreen();

  const [pin, setPin] = useState('');
  const [pinLength, setPinLength] = useState<number>(PIN_LENGTH_BOUNDS.min);
  const [biometric, setBiometric] = useState<BiometricCapability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const cooldown = useCountdown(0);

  /** Starts (or restarts) the visible cooldown for a lockout. */
  const beginCooldown = useCallback(
    (remainingMs: number) => {
      setIsLockedOut(true);
      cooldown.restart(Math.ceil(remainingMs / 1000));
    },
    [cooldown],
  );

  const runBiometric = useCallback(async () => {
    const result = await authenticateBiometric(t('appLock.screenTitle'), t('appLock.usePin'));

    if (result === 'success') {
      unlock();
      return;
    }
    if (result === 'failed') setError(t('appLock.biometricFailed'));
    // 'cancelled' and 'fallback' both just leave the PIN pad in place — there is
    // nowhere to dismiss to from a lock screen.
  }, [t, unlock]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [capability, length, lockState] = await Promise.all([
        getBiometricCapability(),
        getPinLength(),
        loadLockState(),
      ]);
      if (cancelled) return;

      setBiometric(capability);
      setPinLength(length ?? PIN_LENGTH_BOUNDS.min);

      if (lockState.isLockedOut) {
        beginCooldown(lockState.lockoutRemainingMs);
        return;
      }
      // Offer biometrics straight away — it is the fast path, and the merchant is
      // usually unlocking mid-transaction.
      if (capability.available) void runBiometric();
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount; `runBiometric`/`beginCooldown` are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the lockout when the countdown reaches zero.
  useEffect(() => {
    if (isLockedOut && cooldown.secondsLeft === 0) {
      setIsLockedOut(false);
      setError(null);
    }
  }, [isLockedOut, cooldown.secondsLeft]);

  const handleComplete = async (entered: string) => {
    const result = await verifyPin(entered);

    if (result.ok) {
      unlock();
      return;
    }

    setPin('');

    if (result.reason === 'locked_out') {
      beginCooldown(result.lockoutRemainingMs ?? 0);
      return;
    }
    if (result.reason === 'no_pin') {
      // The PIN vanished from under us (cleared in Settings on another path):
      // there is nothing to verify against, so releasing the lock is correct.
      unlock();
      return;
    }
    setError(t('appLock.pinIncorrect', { count: result.remainingAttempts }));
  };

  const confirmLogout = () => {
    Alert.alert(t('appLock.forgotPinConfirmTitle'), t('appLock.forgotPinConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logoutCta'),
        style: 'destructive',
        onPress: () => {
          // Release the lock first: logout unmounts this tree, and a lock left set
          // would immediately cover the Login screen.
          unlock();
          void logout();
        },
      },
    ]);
  };

  const lockoutMessage = cooldown.secondsLeft >= 60
    ? t('appLock.lockedOutMinutes', { count: Math.ceil(cooldown.secondsLeft / 60) })
    : t('appLock.lockedOutSeconds', { count: cooldown.secondsLeft });

  return (
    <SafeAreaView style={styles.container} testID="lock-screen">
      <View style={styles.header}>
        <View style={styles.lockCircle}>
          <Ionicons name="lock-closed" size={26} color={colors.primary} />
        </View>

        <Text style={styles.title}>{t('appLock.screenTitle')}</Text>

        {/* Which account is being unlocked — a shared counter phone may have had
            a different merchant signed in. */}
        {businessName ? (
          <Text style={styles.business} numberOfLines={1}>
            {businessName}
          </Text>
        ) : null}

        <Text style={styles.body}>{t('appLock.screenBody')}</Text>
      </View>

      {isLockedOut ? (
        <View style={styles.lockedOut} accessibilityRole="alert">
          <Ionicons name="time-outline" size={20} color={colors.error} />
          <Text style={styles.lockedOutText}>{lockoutMessage}</Text>
        </View>
      ) : (
        <PinPad
          value={pin}
          onChange={(next) => {
            setPin(next);
            if (error) setError(null);
          }}
          onComplete={(entered) => void handleComplete(entered)}
          length={pinLength}
          hasError={!!error}
          {...(biometric?.available ? { onBiometricPress: () => void runBiometric() } : {})}
          biometricIcon={biometric?.type === 'face' ? 'scan-outline' : 'finger-print'}
          testID="lock-pinpad"
        />
      )}

      {error && !isLockedOut ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <GhostButton
          label={t('appLock.forgotPinCta')}
          onPress={confirmLogout}
          testID="lock-logout"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.md },
  business: { ...typography.smallMedium, color: colors.primary, marginTop: spacing.xxs },
  body: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 300,
  },
  lockedOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
  },
  lockedOutText: { ...typography.small, color: colors.error, flex: 1 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error },
  footer: { alignItems: 'center', marginTop: spacing.xl },
});
