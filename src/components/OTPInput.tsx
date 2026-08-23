import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme/index';
import { digitsOnly } from '@utils/validators';

export interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the final digit is entered — enables auto-submit. */
  onComplete?: (value: string) => void;
  length?: number;
  hasError?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Section 7 `OTPInput` — a 6-box OTP field.
 *
 * Implemented as ONE hidden `TextInput` behind N visual boxes rather than N real
 * inputs. This is deliberate:
 *   - Android SMS autofill and `oneTimeCode` only populate a single field; a
 *     split-input implementation breaks the auto-read in Section 6.3.
 *   - Paste of a full code works naturally.
 *   - No cross-input focus juggling, which is where split OTP fields usually
 *     mishandle backspace.
 */
export function OTPInput({
  value,
  onChange,
  onComplete,
  length = 6,
  hasError = false,
  autoFocus = true,
  editable = true,
  testID,
  accessibilityLabel,
}: OTPInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!autoFocus) return;
    // Delay so the keyboard opens after the screen transition settles.
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const handleChange = (raw: string) => {
    const next = digitsOnly(raw).slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const boxes = useMemo(() => Array.from({ length }, (_, i) => i), [length]);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={styles.container}
      testID={testID}
    >
      {boxes.map((index) => {
        const char = value[index] ?? '';
        // Highlight the box the next digit will land in.
        const isActive = focused && (index === value.length || (value.length === length && index === length - 1));

        return (
          <View
            key={index}
            style={[
              styles.box,
              char ? styles.boxFilled : null,
              isActive ? styles.boxActive : null,
              hasError ? styles.boxError : null,
            ]}
          >
            <Text style={styles.digit} maxFontSizeMultiplier={1.3}>
              {char}
            </Text>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={length}
        editable={editable}
        // Section 6.3: "auto-read via SMS retriever if possible".
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        caretHidden
        style={styles.hiddenInput}
        accessibilityLabel={accessibilityLabel}
      />
    </Pressable>
  );
}

const BOX_SIZE = 48;

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  box: {
    flex: 1,
    maxWidth: BOX_SIZE + 6,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.error, backgroundColor: colors.errorLight },
  digit: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  // Covers the boxes so a tap anywhere focuses the real input, while staying
  // invisible and non-interactive to the eye.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
});
