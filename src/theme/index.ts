import { Platform, ViewStyle } from 'react-native';
import { colors } from './colors';
import { spacing, radius, MIN_TOUCH_TARGET, hitSlop } from './spacing';
import { typography, fontSize, fontWeight, lineHeight, MAX_AMOUNT_FONT_SCALE } from './typography';

/**
 * Elevation kept deliberately shallow: heavy shadows are expensive to composite
 * on the low-end Android devices targeted in Section 2 / NFR 5.1.
 *
 * Three platform branches, for concrete reasons:
 *   - android: `elevation` maps to the native shadow the platform already draws.
 *   - web:     `boxShadow`. React Native Web has deprecated the `shadow*` props
 *              in favour of it; passing them logs a deprecation warning on every
 *              card render, which drowns out real warnings in the browser console.
 *   - default (iOS): the `shadow*` props, which remain the supported API there.
 */
export interface ShadowSet {
  card: ViewStyle;
  raised: ViewStyle;
}

/**
 * Pure platform → shadow-style mapping.
 *
 * Exported as a function rather than resolved inline with `Platform.select` so the
 * per-platform output is directly assertable in tests. `Platform.select` resolves
 * at module load, which would otherwise force tests into module-registry mocking
 * to check a branch other than the host platform's.
 */
export function buildShadow(os: string): ShadowSet {
  if (os === 'android') {
    return { card: { elevation: 2 }, raised: { elevation: 6 } };
  }

  if (os === 'web') {
    return {
      card: { boxShadow: '0px 2px 8px rgba(17, 24, 39, 0.08)' },
      raised: { boxShadow: '0px 6px 16px rgba(17, 24, 39, 0.16)' },
    };
  }

  // iOS and anything else: the shadow* props remain the supported API.
  return {
    card: {
      shadowColor: '#111827',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    raised: {
      shadowColor: '#111827',
      shadowOpacity: 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
  };
}

export const shadow: ShadowSet = buildShadow(Platform.OS);

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
