import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { z } from 'zod';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PrimaryButton,
  Screen,
  StatusBadge,
  TextField,
} from '@components/index';
import { miscApi } from '@api/index';
import { ApiError } from '@api/errors';
import { queryKeys } from '@app/providers/queryClient';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { dateParts } from '@utils/date';
import { track } from '@utils/analytics';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import type { SupportTicket, TicketStatus } from '@models/api';
import { filterFaqs } from './faqSearch';
import {
  CONTACTS_ARE_PLACEHOLDERS,
  NODAL_OFFICER,
  RBI_PORTAL_URL,
  SUPPORT_PHONE,
  supportPhoneUrl,
  supportWhatsappUrl,
} from './supportContacts';

/** The FAQ set in the language bundles: `support.faq.q1..q6` / `a1..a6`. */
const FAQ_COUNT = 6;
const FAQ_INDEXES = Array.from({ length: FAQ_COUNT }, (_, i) => i + 1);

const TICKET_TONE: Record<TicketStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
};

const ticketSchema = z.object({
  subject: z.string().trim().min(1, 'support.subjectRequired'),
  body: z.string().trim().min(1, 'support.bodyRequired'),
});
type TicketFormValues = z.infer<typeof ticketSchema>;

/**
 * Section 6.17 Help & Support.
 *
 * Searchable FAQ, contact actions, ticket raising and history, and the
 * grievance-escalation matrix.
 *
 * ## The FAQ is searched, not categorised
 *
 * Six questions do not need a taxonomy — a merchant with a problem types a word
 * ("refund", "settlement") rather than guessing which folder it was filed under.
 * The filter matches both question and answer text, so searching "PIN" finds the
 * refund answer that mentions it even though the question does not.
 *
 * ## Answers are already-localized text, matched as such
 *
 * The search runs over `t(...)` output rather than the key names, so it works
 * identically in all eight languages instead of only matching English.
 */
export function SupportScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [raiseVisible, setRaiseVisible] = useState(false);

  /* --------------------------------- FAQ ---------------------------------- */

  const faqs = useMemo(
    () =>
      FAQ_INDEXES.map((index) => ({
        index,
        question: t(`support.faq.q${index}`),
        answer: t(`support.faq.a${index}`),
      })),
    [t],
  );

  const matchingFaqs = useMemo(() => filterFaqs(faqs, query), [faqs, query]);

  /* -------------------------------- tickets -------------------------------- */

  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets,
    queryFn: miscApi.listTickets,
  });

  const tickets = ticketsQuery.data?.items ?? [];

  const createTicket = useMutation({
    mutationFn: (values: TicketFormValues) =>
      miscApi.createTicket({ subject: values.subject.trim(), body: values.body.trim() }),
    onSuccess: (ticket) => {
      // Section 14 event. Only the status is reported — the subject and body are
      // merchant-written free text and could contain anything.
      track('support_ticket_raised', { status: ticket.status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      setRaiseVisible(false);
      Alert.alert(t('support.raised'));
    },
  });

  /* ------------------------------- contacts -------------------------------- */

  /**
   * Opens a `tel:`/`https:` target, telling the merchant what to dial if the
   * handoff fails. A silently-dead button on a support screen is the worst place
   * to leave someone, so the fallback names the number instead.
   */
  const openUrl = useCallback(
    async (url: string, fallbackValue: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(t('support.contactFailed', { value: fallbackValue }));
      }
    },
    [t],
  );

  const showTicketSkeleton = ticketsQuery.isLoading && tickets.length === 0;
  const showTicketError = ticketsQuery.isError && tickets.length === 0;
  const showTicketEmpty =
    !ticketsQuery.isLoading && !ticketsQuery.isError && tickets.length === 0;

  return (
    <Screen scroll testID="support-screen">
      <ScreenHeader title={t('support.title')} onBack={() => navigation.goBack()} />

      <TextField
        label=""
        placeholder={t('support.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        iconRight="search"
        returnKeyType="search"
        autoCorrect={false}
        testID="support-search"
      />

      {/* ---------------------------- FAQ ---------------------------- */}
      <Text style={styles.sectionTitle}>{t('support.faqTitle')}</Text>

      {matchingFaqs.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={t('support.faqEmptyTitle')}
          body={t('support.faqEmptyBody')}
          compact
        />
      ) : (
        <View style={styles.card}>
          {matchingFaqs.map((faq, position) => (
            <FaqRow
              key={faq.index}
              question={faq.question}
              answer={faq.answer}
              expanded={expanded === faq.index}
              bordered={position > 0}
              onToggle={() => setExpanded(expanded === faq.index ? null : faq.index)}
              testID={`support-faq-${faq.index}`}
            />
          ))}
        </View>
      )}

      {/* -------------------------- Contact us -------------------------- */}
      <Text style={styles.sectionTitle}>{t('support.contactTitle')}</Text>
      <View style={styles.card}>
        <ContactRow
          icon="call-outline"
          label={t('support.callCta')}
          body={t('support.callBody')}
          onPress={() => void openUrl(supportPhoneUrl(), SUPPORT_PHONE)}
          testID="support-call"
        />
        <ContactRow
          icon="logo-whatsapp"
          label={t('support.whatsappCta')}
          body={t('support.whatsappBody')}
          onPress={() => void openUrl(supportWhatsappUrl(), SUPPORT_PHONE)}
          bordered
          testID="support-whatsapp"
        />
      </View>

      {/* ---------------------------- Tickets ---------------------------- */}
      <Text style={styles.sectionTitle}>{t('support.ticketsTitle')}</Text>

      {showTicketSkeleton ? <ListSkeleton count={2} /> : null}

      {showTicketError ? (
        <ErrorState
          error={ticketsQuery.error}
          onRetry={() => void ticketsQuery.refetch()}
          compact
        />
      ) : null}

      {showTicketEmpty ? (
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title={t('support.ticketsEmptyTitle')}
          body={t('support.ticketsEmptyBody')}
          compact
        />
      ) : null}

      {tickets.length > 0 ? (
        <View style={styles.card}>
          {tickets.map((ticket, position) => (
            <TicketRow key={ticket.id} ticket={ticket} bordered={position > 0} />
          ))}
        </View>
      ) : null}

      <PrimaryButton
        label={t('support.raiseCta')}
        onPress={() => {
          createTicket.reset();
          setRaiseVisible(true);
        }}
        disabled={!isOnline}
        iconLeft="create-outline"
        fullWidth
        style={styles.cta}
        testID="support-raise"
      />

      {!isOnline ? <Text style={styles.offlineNote}>{t('support.offlineNote')}</Text> : null}

      {/* --------------------------- Grievance --------------------------- */}
      <Text style={styles.sectionTitle}>{t('support.grievance.title')}</Text>
      <Text style={styles.sectionBody}>{t('support.grievance.body')}</Text>

      <View style={styles.card}>
        <EscalationLevel
          step="1"
          title={t('support.grievance.level1Title')}
          body={t('support.grievance.level1Body')}
        />

        <EscalationLevel
          step="2"
          title={t('support.grievance.level2Title')}
          body={t('support.grievance.level2Body')}
          bordered
        >
          <View style={styles.officerBlock}>
            <OfficerLine label={t('support.grievance.officerLabel')} value={NODAL_OFFICER.name} />
            <OfficerLine label={t('support.grievance.emailLabel')} value={NODAL_OFFICER.email} />
            <OfficerLine label={t('support.grievance.phoneLabel')} value={NODAL_OFFICER.phone} />
          </View>
        </EscalationLevel>

        <EscalationLevel
          step="3"
          title={t('support.grievance.level3Title')}
          body={t('support.grievance.level3Body')}
          bordered
        >
          <Pressable
            onPress={() => void openUrl(RBI_PORTAL_URL, RBI_PORTAL_URL)}
            accessibilityRole="link"
            accessibilityLabel={t('support.grievance.rbiPortalCta')}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            testID="support-rbi-portal"
          >
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={styles.linkButtonText}>{t('support.grievance.rbiPortalCta')}</Text>
          </Pressable>
        </EscalationLevel>
      </View>

      {/*
        Shown only while the contact details above are placeholders, so the warning
        disappears by itself when real ones are configured rather than becoming a
        permanent piece of furniture nobody reads.
      */}
      {CONTACTS_ARE_PLACEHOLDERS ? (
        <View style={styles.placeholderNote}>
          <Ionicons name="construct-outline" size={16} color={colors.warning} />
          <Text style={styles.placeholderNoteText}>
            {t('support.grievance.placeholderNote')}
          </Text>
        </View>
      ) : null}

      <RaiseTicketSheet
        visible={raiseVisible}
        isSubmitting={createTicket.isPending}
        error={createTicket.error}
        onSubmit={(values) => createTicket.mutate(values)}
        onClose={() => {
          createTicket.reset();
          setRaiseVisible(false);
        }}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/** Collapsible FAQ entry. */
function FaqRow({
  question,
  answer,
  expanded,
  bordered,
  onToggle,
  testID,
}: {
  question: string;
  answer: string;
  expanded: boolean;
  bordered: boolean;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <View style={bordered ? styles.rowBordered : undefined}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={question}
        accessibilityState={{ expanded }}
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
        style={({ pressed }) => [styles.faqHeader, pressed && styles.pressedSurface]}
        testID={testID}
      >
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textTertiary}
        />
      </Pressable>

      {expanded ? (
        <Text style={styles.faqAnswer} testID={`${testID}-answer`}>
          {answer}
        </Text>
      ) : null}
    </View>
  );
}

function ContactRow({
  icon,
  label,
  body,
  onPress,
  bordered = false,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  body: string;
  onPress: () => void;
  bordered?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${body}`}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [
        styles.contactRow,
        bordered && styles.rowBordered,
        pressed && styles.pressedSurface,
      ]}
      testID={testID}
    >
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

/**
 * A ticket row is deliberately not tappable: there is no ticket-thread screen in
 * Section 6.17, and the row already shows everything the API returns.
 */
function TicketRow({ ticket, bordered }: { ticket: SupportTicket; bordered: boolean }) {
  const { t } = useTranslation();
  const { day, monthKey, year } = dateParts(ticket.createdAt);

  return (
    <View style={[styles.ticketRow, bordered && styles.rowBordered]}>
      <View style={styles.ticketText}>
        <Text style={styles.ticketSubject} numberOfLines={2}>
          {ticket.subject}
        </Text>
        <Text style={styles.ticketDate}>{`${day} ${t(monthKey)} ${year}`}</Text>
      </View>
      <StatusBadge label={t(`support.ticketStatus.${ticket.status}`)} tone={TICKET_TONE[ticket.status]} size="sm" />
    </View>
  );
}

function EscalationLevel({
  step,
  title,
  body,
  bordered = false,
  children,
}: {
  step: string;
  title: string;
  body: string;
  bordered?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.level, bordered && styles.rowBordered]}>
      <View style={styles.levelStep}>
        <Text style={styles.levelStepText}>{step}</Text>
      </View>
      <View style={styles.levelText}>
        <Text style={styles.levelTitle}>{title}</Text>
        <Text style={styles.levelBody}>{body}</Text>
        {children}
      </View>
    </View>
  );
}

function OfficerLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.officerLine}>
      <Text style={styles.officerLabel}>{label}</Text>
      <Text style={styles.officerValue} selectable>
        {value}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Raise ticket                                                               */
/* -------------------------------------------------------------------------- */

function RaiseTicketSheet({
  visible,
  isSubmitting,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (values: TicketFormValues) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { control, handleSubmit, formState, reset } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    mode: 'onSubmit',
    defaultValues: { subject: '', body: '' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const fieldError = (key: keyof TicketFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  const apiError = error instanceof ApiError ? error : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.cancel')} />

      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('support.raiseTitle')}</Text>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.sheetBody}>
          <Controller
            control={control}
            name="subject"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('support.subjectLabel')}
                placeholder={t('support.subjectPlaceholder')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldError('subject')}
                editable={!isSubmitting}
                testID="support-subject-input"
              />
            )}
          />

          <Controller
            control={control}
            name="body"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('support.bodyLabel')}
                placeholder={t('support.bodyPlaceholder')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldError('body')}
                multiline
                numberOfLines={4}
                editable={!isSubmitting}
                testID="support-body-input"
              />
            )}
          />

          {apiError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorBannerText}>
                {t(apiError.i18nKey, { defaultValue: t('errors.unknown') })}
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            label={t('support.raiseSubmit')}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
            fullWidth
            style={styles.cta}
            testID="support-raise-submit"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  sectionBody: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  pressedSurface: { backgroundColor: colors.surfaceAlt },

  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  faqQuestion: { ...typography.bodyMedium, color: colors.text, flex: 1 },
  faqAnswer: {
    ...typography.small,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    lineHeight: 21,
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 8,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: { flex: 1 },
  contactLabel: { ...typography.body, color: colors.text },
  contactBody: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  ticketText: { flex: 1 },
  ticketSubject: { ...typography.bodyMedium, color: colors.text },
  ticketDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  level: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  levelStep: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelStepText: { ...typography.captionMedium, color: colors.primary },
  levelText: { flex: 1 },
  levelTitle: { ...typography.bodyMedium, color: colors.text },
  levelBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  officerBlock: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.xxs,
  },
  officerLine: { flexDirection: 'row', gap: spacing.xs },
  officerLabel: { ...typography.caption, color: colors.textTertiary, width: 92 },
  officerValue: { ...typography.caption, color: colors.text, flex: 1 },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  linkButtonText: { ...typography.smallMedium, color: colors.primary },

  placeholderNote: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  placeholderNoteText: { ...typography.caption, color: colors.warning, flex: 1 },

  cta: { marginTop: spacing.md },
  offlineNote: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.bodyLarge, color: colors.text, flex: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: spacing.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorBannerText: { ...typography.small, color: colors.error, flex: 1 },
});
