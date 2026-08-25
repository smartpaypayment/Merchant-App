import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, MIN_TOUCH_TARGET } from '@theme/index';

export interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when `value` reaches `length`. */
  onComplete?: (value: string) => void;
  /** Number of slots to render. */
  length: number;
  hasError?: boolean;
  disabled?: boolean;
  /** Shows a biometric key in the lower-left slot. */
  onBiometricPress?: () => void;
  biometricIcon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

/**
 * Section 7 `PinPad` — PIN entry for sensitive actions (Section 12).
 *
 * Entered digits render as filled dots, never as numerals: this pad is used at a
 * shop counter with customers standing across it, so the PIN must not be readable
 * over the merchant's shoulder.
 *
 * The pad is self-contained rather than reusing `AmountInput`'s keypad because the
 * semantics differ — fixed length, masked, auto-submitting, and with a biometric
 * affordance in place of the decimal key.
 */
export function PinPad({
  value,
  onChange,
  onComplete,
  length,
  hasError = false,
  disabled = false,
  onBiometricPress,
  biometricIcon = 'finger-print',
  testID,
}: PinPadProps) {
  const slots = useMemo(() => Array.from({ length }, (_, i) => i), [length]);

  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    const next = value + digit;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.dots}>
        {slots.map((index) => {
          const filled = index < value.length;
          return (
            <View
              key={index}
              style={[styles.dot, filled && styles.dotFilled, hasError && styles.dotError]}
            />
          );
        })}
      </View>

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <PadKey key={digit} onPress={() => press(digit)} disabled={disabled} testID={testID ? `${testID}-key-${digit}` : undefined}>
            <Text style={styles.keyLabel} allowFontScaling={false}>
              {digit}
            </Text>
          </PadKey>
        ))}

        {/* Lower-left: biometric shortcut, or an inert spacer to keep the grid. */}
        {onBiometricPress ? (
          <PadKey onPress={onBiometricPress} disabled={disabled} accessibilityLabel="biometric" testID={testID ? `${testID}-biometric` : undefined}>
            <Ionicons name={biometricIcon} size={26} color={colors.primary} />
          </PadKey>
        ) : (
          <View style={styles.key} />
        )}

        <PadKey onPress={() => press('0')} disabled={disabled} testID={testID ? `${testID}-key-0` : undefined}>
          <Text style={styles.keyLabel} allowFontScaling={false}>
            0
          </Text>
        </PadKey>

        <PadKey onPress={backspace} disabled={disabled} accessibilityLabel="delete" testID={testID ? `${testID}-key-del` : undefined}>
          <Ionicons name="backspace-outline" size={24} color={colors.text} />
        </PadKey>
      </View>
    </View>
  );
}

function PadKey({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      android_ripple={{ color: 'rgba(0,0,0,0.10)', borderless: true }}
      style={({ pressed }) => [styles.key, pressed && !disabled && styles.keyPressed]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, minHeight: DOT + 4 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotError: { borderColor: colors.error },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: 300, alignSelf: 'center' },
  key: {
    width: '33.333%',
    height: Math.max(MIN_TOUCH_TARGET + 12, 60),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyPressed: { backgroundColor: colors.surfaceAlt },
  keyLabel: { fontSize: 26, lineHeight: 34, fontWeight: '600', color: colors.text },
});
