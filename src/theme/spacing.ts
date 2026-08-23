/** Spacing scale per App-PRD Section 5: 4 / 8 / 12 / 16 / 24 / 32. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Section 5 / 13: "large touch targets (min 48dp)".
 * Every pressable in the app must be at least this tall.
 */
export const MIN_TOUCH_TARGET = 48;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
