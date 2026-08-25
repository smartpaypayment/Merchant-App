import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import type { Paise } from '@models/index';
import { formatPaiseForInput, RUPEE_SYMBOL } from '@utils/money';

export interface AmountInputProps {
  /** Current value in integer paise. */
  value: Paise;
  onChange: (paise: Paise) => void;
  /** Localized hint under the amount (e.g. a limit warning). */
  helper?: string;
  /** Localized error; turns the amount red. */
  error?: string;
  /** Upper bound in paise; presses that would exceed it are ignored. */
  maxAmount?: Paise;
  onKeyPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;
type Key = (typeof KEYS)[number];

/** Hard ceiling: ₹2,00,000 is the NPCI per-transaction UPI cap. */
const UPI_MAX_PAISE = 2_00_000_00;

/**
 * Section 7 `AmountInput` — numeric keypad amount entry (Section 6.6 mode B).
 *
 * A custom in-screen keypad rather than the system numeric keyboard, for two
 * reasons: the keys can be sized well above the 48dp minimum for fast one-handed
 * entry at a counter, and the amount stays visible instead of being covered by
 * the OS keyboard on a short screen.
 *
 * State is held as integer paise by the parent. Digits are appended by arithmetic
 * on the paise value, never by string concatenation on a rupee float — so there
 * is no point at which a fractional rupee can exist (Section 8).
 *
 * Entry model: digits shift in from the right, like a till. Typing 5-0-0 gives
 * ₹5.00 → ₹50.00 → ₹500.00. `.` is accepted but is a no-op, since the shifting
 * model already handles paise; it is present because merchants reach for it.
 */
function AmountInputBase({
  value,
  onChange,
  helper,
  error,
  maxAmount,
  onKeyPress,
  disabled = false,
  testID,
}: AmountInputProps) {
  const ceiling = Math.min(maxAmount ?? UPI_MAX_PAISE, UPI_MAX_PAISE);

  const handleKey = useCallback(
    (key: Key) => {
      if (disabled) return;
      onKeyPress?.();

      if (key === 'del') {
        // Shift right, dropping the last digit.
        onChange(Math.floor(value / 10));
        return;
      }
      if (key === '.') return;

      const next = value * 10 + Number(key);
      // Silently ignore presses that would breach the cap rather than letting the
      // merchant type a number the server will reject.
      if (next > ceiling) return;
      onChange(next);
    },
    [disabled, onChange, onKeyPress, value, ceiling],
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.display}>
        <Text style={[styles.symbol, !!error && styles.amountError]} allowFontScaling={false}>
          {RUPEE_SYMBOL}
        </Text>
        <Text
          style={[styles.amount, !!error && styles.amountError]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={1.2}
          accessibilityLabel={formatPaiseForInput(value)}
          testID={testID ? `${testID}-value` : undefined}
        >
          {formatPaiseForInput(value)}
        </Text>
      </View>

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}

      <View style={styles.keypad}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => handleKey(key)}
            disabled={disabled}
            android_ripple={{ color: 'rgba(0,0,0,0.10)', borderless: false }}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'delete' : key}
            style={({ pressed }) => [styles.key, pressed && !disabled && styles.keyPressed]}
            testID={testID ? `${testID}-key-${key}` : undefined}
          >
            {key === 'del' ? (
              <Ionicons name="backspace-outline" size={24} color={colors.text} />
            ) : (
              <Text style={styles.keyLabel} allowFontScaling={false}>
                {key}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'stretch' },
  display: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    gap: spacing.xxs,
  },
  symbol: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.text },
  amount: {
    fontSize: 44,
    lineHeight: 54,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  amountError: { color: colors.error },
  helperText: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  errorText: { ...typography.caption, color: colors.error, textAlign: 'center' },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  key: {
    // 3 across; height well above the 48dp minimum for at-the-counter speed.
    width: '33.333%',
    height: Math.max(MIN_TOUCH_TARGET + 16, 64),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyPressed: { backgroundColor: colors.surfaceAlt },
  keyLabel: { fontSize: 26, lineHeight: 34, fontWeight: '600', color: colors.text },
});

export const AmountInput = memo(AmountInputBase);
