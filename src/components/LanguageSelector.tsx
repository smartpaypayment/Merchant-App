import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { SUPPORTED_LANGUAGES } from '@localization/resources';
import { setLanguage } from '@localization/i18n';

export interface LanguageSelectorProps {
  /** `pill` for the compact header control; `list` for the settings screen. */
  variant?: 'pill' | 'list';
  onChanged?: (code: string) => void;
}

/**
 * Section 7 `LanguageSelector`.
 *
 * Options are always rendered in their own native script (हिन्दी, தமிழ், …) — a
 * merchant who cannot read the current UI language must still be able to find
 * their own. This is why the picker is placed on the Login screen: language has
 * to be switchable *before* the merchant is committed to a flow they can't read.
 */
export function LanguageSelector({ variant = 'pill', onChanged }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const activeCode = i18n.language;
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === activeCode) ?? SUPPORTED_LANGUAGES[0]!;

  const handleSelect = async (code: string) => {
    setOpen(false);
    await setLanguage(code);
    onChanged?.(code);
  };

  const rows = (
    <FlatList
      data={SUPPORTED_LANGUAGES}
      keyExtractor={(item) => item.code}
      renderItem={({ item }) => {
        const selected = item.code === activeCode;
        return (
          <Pressable
            onPress={() => void handleSelect(item.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          >
            <View style={styles.optionBody}>
              <Text style={styles.nativeName}>{item.nativeName}</Text>
              <Text style={styles.englishName}>{item.englishName}</Text>
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
          </Pressable>
        );
      }}
    />
  );

  if (variant === 'list') return <View style={styles.listContainer}>{rows}</View>;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={active.englishName}
        style={({ pressed }) => [styles.pill, pressed && styles.optionPressed]}
      >
        <Ionicons name="language-outline" size={16} color={colors.primary} />
        <Text style={styles.pillLabel}>{active.nativeName}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.primary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {rows}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  pillLabel: { ...typography.smallMedium, color: colors.primary },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  listContainer: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionPressed: { opacity: 0.7 },
  optionBody: { flex: 1 },
  nativeName: { ...typography.bodyMedium, color: colors.text },
  englishName: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
});
