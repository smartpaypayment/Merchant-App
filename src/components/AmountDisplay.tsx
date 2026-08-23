import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fontSize, fontWeight, MAX_AMOUNT_FONT_SCALE } from '@theme/index';
import type { Paise } from '@models/index';
import { formatPaise, formatPaiseCompact } from '@utils/money';

type AmountSize = 'sm' | 'md' | 'lg' | 'hero';
type Tone = 'default' | 'success' | 'error' | 'muted' | 'inverse';

export interface AmountDisplayProps {
  /** Integer paise — never a rupee float (Section 8 money rule). */
  amount: Paise;
  size?: AmountSize;
  tone?: Tone;
  /** Abbreviate to lakh/crore units. */
  compact?: boolean;
  /** Hide the `.00` decimals. */
  hideDecimals?: boolean;
  signDisplay?: 'auto' | 'always' | 'never';
  style?: StyleProp<TextStyle>;
  testID?: string;
}

const SIZE_STYLE: Record<AmountSize, TextStyle> = {
  sm: { fontSize: fontSize.small, lineHeight: 20 },
  md: { fontSize: fontSize.body, lineHeight: 24 },
  lg: { fontSize: fontSize.heading, lineHeight: 32 },
  hero: { fontSize: fontSize.amountHero, lineHeight: 48 },
};

const TONE_COLOR: Record<Tone, string> = {
  default: colors.text,
  success: colors.success,
  error: colors.error,
  muted: colors.textSecondary,
  inverse: colors.textInverse,
};

/**
 * Section 7 `AmountDisplay` — the single place rupee strings are produced for
 * display. Takes paise in, renders `₹1,23,456.50` out.
 *
 * `maxFontSizeMultiplier` is capped so a large OS font setting cannot push a
 * hero amount out of its card.
 */
export function AmountDisplay({
  amount,
  size = 'md',
  tone = 'default',
  compact = false,
  hideDecimals = false,
  signDisplay = 'auto',
  style,
  testID,
}: AmountDisplayProps) {
  const text = compact
    ? formatPaiseCompact(amount)
    : formatPaise(amount, { decimals: !hideDecimals, signDisplay });

  return (
    <Text
      testID={testID}
      style={[styles.base, SIZE_STYLE[size], { color: TONE_COLOR[tone] }, style]}
      maxFontSizeMultiplier={MAX_AMOUNT_FONT_SCALE}
      // Read out the full grouped figure rather than digit-by-digit.
      accessibilityLabel={text}
      numberOfLines={1}
      adjustsFontSizeToFit={size === 'hero'}
      minimumFontScale={0.7}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] },
});
