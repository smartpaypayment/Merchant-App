import { buildShadow } from './index';

/**
 * Verifies the per-platform shadow mapping.
 *
 * React Native Web logs a deprecation warning for any style containing
 * `shadowColor` / `shadowOpacity` / `shadowRadius` / `shadowOffset`. Those props
 * sit on shared card styles, so a single leaked branch produces a warning on every
 * render and buries genuine console output. These tests assert the web branch
 * emits `boxShadow` and none of the deprecated props.
 */

const DEPRECATED_SHADOW_PROPS = ['shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset'] as const;
const VARIANTS = ['card', 'raised'] as const;

describe('web', () => {
  const shadow = buildShadow('web');

  it.each(VARIANTS)('%s uses boxShadow', (variant) => {
    const style = shadow[variant] as Record<string, unknown>;
    expect(typeof style['boxShadow']).toBe('string');
  });

  it.each(VARIANTS)('%s carries none of the deprecated shadow props', (variant) => {
    const style = shadow[variant] as Record<string, unknown>;
    for (const deprecated of DEPRECATED_SHADOW_PROPS) {
      expect(style).not.toHaveProperty(deprecated);
    }
    // `elevation` is Android-only and meaningless on web.
    expect(style).not.toHaveProperty('elevation');
  });
});

describe('android', () => {
  const shadow = buildShadow('android');

  it.each(VARIANTS)('%s uses elevation only, letting the platform draw it', (variant) => {
    const style = shadow[variant] as Record<string, unknown>;

    expect(typeof style['elevation']).toBe('number');
    expect(style).not.toHaveProperty('boxShadow');
    for (const deprecated of DEPRECATED_SHADOW_PROPS) {
      expect(style).not.toHaveProperty(deprecated);
    }
  });

  it('keeps elevation shallow — deep shadows cost frames on low-end devices', () => {
    const card = shadow.card as { elevation: number };
    const raised = shadow.raised as { elevation: number };

    expect(card.elevation).toBeLessThanOrEqual(4);
    expect(raised.elevation).toBeLessThanOrEqual(8);
    expect(raised.elevation).toBeGreaterThan(card.elevation);
  });
});

describe('ios', () => {
  const shadow = buildShadow('ios');

  it.each(VARIANTS)('%s keeps the shadow* props, still the supported API there', (variant) => {
    const style = shadow[variant] as Record<string, unknown>;

    for (const expected of DEPRECATED_SHADOW_PROPS) {
      expect(style).toHaveProperty(expected);
    }
    expect(style).not.toHaveProperty('elevation');
    expect(style).not.toHaveProperty('boxShadow');
  });
});

describe('unknown platform', () => {
  it('falls back to the iOS-style shadow rather than returning nothing', () => {
    const style = buildShadow('windows').card as Record<string, unknown>;
    expect(style).toHaveProperty('shadowColor');
  });
});
