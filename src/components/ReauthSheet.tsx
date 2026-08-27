import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '@theme/index';
import {
  authenticateBiometric,
  getBiometricCapability,
  getPinLength,
  hasPin,
  isValidPinFormat,
  PIN_LENGTH_BOUNDS,
  setPin,
  verifyPin,
  type BiometricCapability,
} from '@store/appLock';
import { useSensitiveScreen } from '@hooks/useSensitiveScreen';
import { GhostButton } from './Button';
import { PinPad } from './PinPad';

export interface ReauthSheetProps {
  visible: boolean;
  /** Localized reason shown to the merchant, e.g. "Confirm this refund". */
  reason: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type Phase = 'checking' | 'biometric' | 'pin' | 'setup_pin' | 'confirm_pin';

/**
 * Re-authentication gate for sensitive actions (Section 12: "require re-auth for
 * sensitive actions (bank change, refund)").
 *
 * Flow:
 *   1. If biometrics are enrolled → prompt immediately; PIN pad is the fallback.
 *   2. Else if a PIN exists → PIN pad.
 *   3. Else → set a PIN inline (enter + confirm), then treat that as the
 *      authorisation for this action.
 *
 * Step 3 exists so a merchant is never blocked from refunding by not having
 * configured an app lock yet. Deferring them to Settings to create a PIN, then
 * making them navigate back and restart the refund, would be the kind of dead end
 * that gets worked around by disabling the protection entirely.
 */
export function ReauthSheet({ visible, reason, onSuccess, onCancel }: ReauthSheetProps) {
  const { t } = useTranslation();

  // A PIN pad is on screen while this is open (Section 12).
  useSensitiveScreen(visible);

  const [phase, setPhase] = useState<Phase>('checking');
  const [pin, setPinValue] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [pinLength, setPinLength] = useState(4);
  const [biometric, setBiometric] = useState<BiometricCapability | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Fires the OS biometric prompt, falling back to the PIN pad. */
  const runBiometric = useCallback(async () => {
    const result = await authenticateBiometric(reason, t('common.cancel'));

    if (result === 'success') {
      onSuccess();
      return;
    }
    if (result === 'cancelled') {
      onCancel();
      return;
    }
    // 'fallback' or 'failed' → let them use the PIN instead.
    const exists = await hasPin();
    setPhase(exists ? 'pin' : 'setup_pin');
    if (result === 'failed') setError(t('appLock.biometricFailed'));
  }, [reason, t, onSuccess, onCancel]);

  // Decide the entry phase each time the sheet opens.
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setPin('');
    setFirstPin('');
    setError(null);
    setPhase('checking');

    void (async () => {
      const [capability, existingLength] = await Promise.all([getBiometricCapability(), getPinLength()]);
      if (cancelled) return;

      setBiometric(capability);
      setPinLength(existingLength ?? PIN_LENGTH_BOUNDS.min);

      if (capability.available) {
        setPhase('biometric');
        void runBiometric();
      } else if (existingLength !== null) {
        setPhase('pin');
      } else {
        setPhase('setup_pin');
      }
    })();

    return () => {
      cancelled = true;
    };
    // `runBiometric` is stable for a given `reason`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePinComplete = async (entered: string) => {
    const result = await verifyPin(entered);

    if (result.ok) {
      onSuccess();
      return;
    }

    setPinValue('');
    if (result.reason === 'locked_out') {
      setError(t('appLock.lockedOut'));
    } else if (result.reason === 'no_pin') {
      setPhase('setup_pin');
    } else {
      setError(t('appLock.pinIncorrect', { count: result.remainingAttempts }));
    }
  };

  const handleSetupComplete = (entered: string) => {
    setFirstPin(entered);
    setPinValue('');
    setError(null);
    setPhase('confirm_pin');
  };

  const handleConfirmComplete = async (entered: string) => {
    if (entered !== firstPin) {
      setPinValue('');
      setFirstPin('');
      setError(t('appLock.pinMismatch'));
      setPhase('setup_pin');
      return;
    }

    const saved = await setPin(entered);
    if (!saved) {
      setError(t('appLock.pinTooShort', { min: PIN_LENGTH_BOUNDS.min }));
      setPinValue('');
      setPhase('setup_pin');
      return;
    }
    onSuccess();
  };

  const isSetupFlow = phase === 'setup_pin' || phase === 'confirm_pin';
  const activeLength = isSetupFlow ? PIN_LENGTH_BOUNDS.min : pinLength;

  const title =
    phase === 'setup_pin'
      ? t('appLock.setupTitle')
      : phase === 'confirm_pin'
        ? t('appLock.confirmTitle')
        : t('appLock.title');

  const body = isSetupFlow ? t('appLock.setupBody', { min: PIN_LENGTH_BOUNDS.min }) : reason;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('a11y.close')} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={22} color={colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>

        {phase === 'checking' || phase === 'biometric' ? (
          <View style={styles.biometricState}>
            <Ionicons
              name={biometric?.type === 'face' ? 'scan-outline' : 'finger-print'}
              size={48}
              color={colors.primary}
            />
            <Text style={styles.biometricHint}>{t('appLock.biometricPrompt')}</Text>
            <GhostButton label={t('appLock.usePin')} onPress={() => setPhase('pin')} />
          </View>
        ) : (
          <>
            <PinPad
              value={pin}
              onChange={(next) => {
                setPinValue(next);
                if (error) setError(null);
              }}
              onComplete={(entered) => {
                if (phase === 'pin') void handlePinComplete(entered);
                else if (phase === 'setup_pin') handleSetupComplete(entered);
                else void handleConfirmComplete(entered);
              }}
              length={activeLength}
              hasError={!!error}
              {...(biometric?.available && phase === 'pin'
                ? { onBiometricPress: () => void runBiometric() }
                : {})}
              biometricIcon={biometric?.type === 'face' ? 'scan-outline' : 'finger-print'}
              testID="reauth-pinpad"
            />

            {/*
              During setup the PIN may be longer than the minimum, so an explicit
              submit is needed — `onComplete` only fires at the minimum length.
            */}
            {isSetupFlow && pin.length >= PIN_LENGTH_BOUNDS.min ? (
              <GhostButton
                label={t('common.continue')}
                onPress={() => {
                  if (phase === 'setup_pin') handleSetupComplete(pin);
                  else void handleConfirmComplete(pin);
                }}
                disabled={!isValidPinFormat(pin)}
              />
            ) : null}
          </>
        )}

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          </View>
        ) : null}

        <GhostButton label={t('common.cancel')} onPress={onCancel} fullWidth style={styles.cancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.bodyLarge, color: colors.text, marginTop: spacing.sm },
  body: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
    maxWidth: 300,
  },
  biometricState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  biometricHint: { ...typography.small, color: colors.textSecondary, textAlign: 'center' },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.error },
  cancel: { marginTop: spacing.sm },
});
