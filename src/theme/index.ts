import { Platform, ViewStyle } from 'react-native';
import { colors } from './colors';
import { spacing, radius, MIN_TOUCH_TARGET, hitSlop } from './spacing';
import { typography, fontSize, fontWeight, lineHeight, MAX_AMOUNT_FONT_SCALE } from './typography';

/**
 * Elevation kept deliberately shallow: heavy shadows are expensive to composite
 * on the low-end Android devices targeted in Section 2 / NFR 5.1.
 */
export const shadow = {
  card: Platform.select<ViewStyle>({
    android: { elevation: 2 },
    default: {
      shadowColor: '#111827',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
  })!,
  raised: Platform.select<ViewStyle>({
    android: { elevation: 6 },
    default: {
      shadowColor: '#111827',
      shadowOpacity: 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
  })!,
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  fontSize,
  fontWeight,
  lineHeight,
  shadow,
  minTouchTarget: MIN_TOUCH_TARGET,
  hitSlop,
  maxAmountFontScale: MAX_AMOUNT_FONT_SCALE,
} as const;

export type Theme = typeof theme;

export { colors, spacing, radius, typography, fontSize, fontWeight, lineHeight, MIN_TOUCH_TARGET, hitSlop, MAX_AMOUNT_FONT_SCALE };
