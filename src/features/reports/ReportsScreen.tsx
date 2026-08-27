import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import {
  AmountDisplay,
  Chart,
  DateRangePicker,
  EmptyState,
  ErrorState,
  resolvePreset,
  Screen,
  SecondaryButton,
  Skeleton,
  SummaryCard,
  type ChartPoint,
  type DateRange,
} from '@components/index';
import { useAuthStore } from '@store/authStore';
import { formatPaise } from '@utils/money';
import { dateParts } from '@utils/date';
import { track } from '@utils/analytics';
import type { RootStackParamList } from '@app/navigation/types';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import { useReports, resolveReportRange } from './useReports';
import { computeSeriesHighlights, fillSeriesGaps } from './reportSeries';
import {
  buildGstSummaryCsv,
  buildReportCsv,
  reportFileName,
  shareReport,
} from './reportExport';

type ExportKind = 'report' | 'gst';

/**
 * Section 6.13 Reports Screen.
 *
 * Date range selector, sales trend chart, key stats, export, and a GST entry point.
 * Handles loading (chart skeleton), loaded, empty (no data in range) and error.
 *
 * The default range is the last 7 days rather than all time: a merchant opening
 * Reports almost always wants "how has this week been", and an all-time default
 * would render a year of bars nobody asked for.
 */
export function ReportsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const merchant = useAuthStore((s) => s.merchant);

  const [range, setRange] = useState<DateRange>(() => resolvePreset('last7'));
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useReports(range);

  /**
   * Zero-fills days the endpoint omitted. Without this a week with sales on three
   * days renders three adjacent bars, implying three consecutive trading days.
   */
  const series = useMemo(() => {
    if (!data) return [];
    const { from, to } = resolveReportRange(range);
    return fillSeriesGaps(data.series, from, to);
  }, [data, range]);

  const highlights = useMemo(() => computeSeriesHighlights(series), [series]);

  const chartData = useMemo<ChartPoint[]>(
    () =>
      series.map((point) => {
        const { day, monthKey } = dateParts(`${point.date}T00:00:00.000Z`);
        const short = `${day} ${t(monthKey)}`;
        return {
          value: point.amount,
          label: short,
          fullLabel: short,
          detail: t('reports.txnCount') + ': ' + point.count,
        };
      }),
    [series, t],
  );

  /* ------------------------------- exports -------------------------------- */

  const exportSalesReport = useCallback(async () => {
    if (!data) return;
    setExporting('report');
    setExportError(null);

    try {
      const csv = buildReportCsv(data, series, {
        date: t('reports.export.colDate'),
        sales: t('reports.export.colSales'),
        count: t('reports.export.colCount'),
        total: t('reports.export.totalsLabel'),
        period: t('reports.export.periodLabel'),
        generated: t('reports.export.generatedLabel'),
      });

      const result = await shareReport(
        reportFileName(data, 'sales-report'),
        csv,
        t('reports.export.fileName'),
      );

      if (!result.ok) {
        setExportError(t('reports.export.failed'));
        return;
      }
      track('report_exported', { kind: 'sales_report', format: 'csv', days: series.length });
    } finally {
      setExporting(null);
    }
  }, [data, series, t]);

  const exportGstSummary = useCallback(async () => {
    if (!data || !merchant) return;
    setExporting('gst');
    setExportError(null);

    try {
      const csv = buildGstSummaryCsv(
        data,
        { businessName: merchant.businessName, ...(merchant.gstin ? { gstin: merchant.gstin } : {}) },
        {
          field: t('reports.gst.colField'),
          value: t('reports.gst.colValue'),
          businessName: t('reports.gst.rowBusiness'),
          gstin: t('reports.gst.rowGstin'),
          periodFrom: t('reports.gst.rowPeriodFrom'),
          periodTo: t('reports.gst.rowPeriodTo'),
          totalSales: t('reports.gst.rowTotalSales'),
          txnCount: t('reports.gst.rowTxnCount'),
          note: t('reports.gst.rowNote'),
          noteValue: t('reports.gst.noteValue'),
        },
      );

      const result = await shareReport(
        reportFileName(data, 'gst-summary'),
        csv,
        t('reports.gst.fileName'),
      );

      if (!result.ok) {
        setExportError(t('reports.export.failed'));
        return;
      }
      track('report_exported', { kind: 'gst_summary', format: 'csv' });
    } finally {
      setExporting(null);
    }
  }, [data, merchant, t]);

  const goCollect = useCallback(() => {
    navigation.navigate('Main', { screen: 'Collect', params: { screen: 'CollectPayment' } });
  }, [navigation]);

  const hasSales = !!data && data.txnCount > 0;

  return (
    <Screen scroll testID="reports-screen">
      <ScreenHeader title={t('reports.title')} onBack={() => navigation.goBack()} />

      <View style={styles.rangeRow}>
        <DateRangePicker
          value={range}
          onChange={setRange}
          // "All time" is dropped here: a report needs a bounded period, and the
          // preset list keeps a genuine long-range option in "Last 30 days".
          presets={['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom']}
          testID="reports-date-range"
        />
      </View>

      {isLoading && !data ? (
        <View style={styles.skeletonBlock}>
          {/* Chart skeleton, as Section 6.13 specifies for the loading state. */}
          <Skeleton width="100%" height={248} borderRadius={radius.lg} />
          <View style={styles.skeletonStats}>
            <Skeleton width="48%" height={86} borderRadius={radius.lg} />
            <Skeleton width="48%" height={86} borderRadius={radius.lg} />
          </View>
        </View>
      ) : isError && !data ? (
        <ErrorState error={error} title={t('reports.errorTitle')} onRetry={() => void refetch()} />
      ) : !hasSales ? (
        <EmptyState
          icon="bar-chart-outline"
          title={t('reports.emptyTitle')}
          body={t('reports.emptyBody')}
          ctaLabel={t('reports.emptyCta')}
          onCtaPress={goCollect}
        />
      ) : data ? (
        <>
          {/* ------------------------------ Chart ----------------------------- */}
          <Text style={styles.sectionTitle}>{t('reports.chartTitle')}</Text>
          <Chart
            data={chartData}
            height={190}
            hint={t('reports.chartHint')}
            accessibilityLabel={`${t('reports.chartA11y')}. ${t('reports.totalSales')}: ${formatPaise(data.totalSales)}`}
            testID="reports-chart"
          />

          {/* ------------------------------ Stats ----------------------------- */}
          <Text style={styles.sectionTitle}>{t('reports.statsTitle')}</Text>
          <View style={styles.statsRow}>
            <SummaryCard
              label={t('reports.totalSales')}
              amount={data.totalSales}
              icon="trending-up-outline"
              tone="brand"
            />
            <SummaryCard
              label={t('reports.txnCount')}
              value={String(data.txnCount)}
              icon="receipt-outline"
            />
          </View>
          <View style={[styles.statsRow, styles.statsRowSpaced]}>
            <SummaryCard
              label={t('reports.avgTicket')}
              amount={data.avgTicketSize}
              icon="calculator-outline"
            />
            <SummaryCard
              label={t('reports.topMode')}
              value={t(`transactions.mode.${data.topPaymentMode}`)}
              icon="star-outline"
            />
          </View>

          {/* --------------------------- Highlights --------------------------- */}
          <View style={styles.highlightCard}>
            {highlights.bestDay ? (
              <HighlightRow
                icon="trophy-outline"
                label={t('reports.bestDay')}
                value={`${dateParts(`${highlights.bestDay.date}T00:00:00.000Z`).day} ${t(dateParts(`${highlights.bestDay.date}T00:00:00.000Z`).monthKey)}`}
                amount={highlights.bestDay.amount}
              />
            ) : null}
            <HighlightRow
              icon="calendar-outline"
              label={t('reports.tradingDays')}
              value={String(highlights.tradingDays)}
              bordered={!!highlights.bestDay}
            />
            <HighlightRow
              icon="stats-chart-outline"
              label={t('reports.avgPerTradingDay')}
              amount={highlights.averagePerTradingDay}
              bordered
            />
          </View>

          {/* ----------------------------- Export ----------------------------- */}
          <SecondaryButton
            label={exporting === 'report' ? t('reports.export.preparing') : t('reports.export.cta')}
            onPress={() => void exportSalesReport()}
            loading={exporting === 'report'}
            disabled={exporting !== null}
            iconLeft="download-outline"
            fullWidth
            style={styles.exportCta}
            testID="reports-export"
          />
          <Text style={styles.formatNote}>{t('reports.export.formatNote')}</Text>

          {/* ------------------------------- GST ------------------------------ */}
          <Text style={styles.sectionTitle}>{t('reports.gst.title')}</Text>
          <View style={styles.gstCard}>
            {merchant?.gstin ? (
              <>
                <View style={styles.gstinRow}>
                  <Text style={styles.gstinLabel}>{t('reports.gst.gstinLabel')}</Text>
                  <Text style={styles.gstinValue} selectable>
                    {merchant.gstin}
                  </Text>
                </View>
                <Text style={styles.gstBody}>{t('reports.gst.summaryBody')}</Text>
                <SecondaryButton
                  label={exporting === 'gst' ? t('reports.export.preparing') : t('reports.gst.summaryCta')}
                  onPress={() => void exportGstSummary()}
                  loading={exporting === 'gst'}
                  disabled={exporting !== null}
                  iconLeft="document-text-outline"
                  fullWidth
                  style={styles.gstCta}
                  testID="reports-gst-export"
                />
              </>
            ) : (
              <>
                <Text style={styles.gstNoGstinTitle}>{t('reports.gst.noGstinTitle')}</Text>
                <Text style={styles.gstBody}>{t('reports.gst.noGstinBody')}</Text>
              </>
            )}

            {/*
              Stated plainly: payment records cannot produce a compliant tax
              invoice. Better to say so here than to let a merchant believe this
              export satisfies a filing requirement.
            */}
            <View style={styles.gstNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.info} />
              <Text style={styles.gstNoteText}>{t('reports.gst.invoiceNote')}</Text>
            </View>
          </View>

          {exportError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{exportError}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function HighlightRow({
  icon,
  label,
  value,
  amount,
  bordered = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  amount?: number;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.highlightRow, bordered && styles.highlightRowBordered]}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.highlightLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.highlightValue}>
        {value ? <Text style={styles.highlightValueText}>{value}</Text> : null}
        {amount !== undefined ? <AmountDisplay amount={amount} size="sm" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', marginBottom: spacing.md },
  skeletonBlock: { gap: spacing.md },
  skeletonStats: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statsRowSpaced: { marginTop: spacing.sm },
  highlightCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  highlightRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  highlightLabel: { ...typography.small, color: colors.textSecondary, flex: 1 },
  highlightValue: { alignItems: 'flex-end', gap: 2 },
  highlightValueText: { ...typography.smallMedium, color: colors.text },
  exportCta: { marginTop: spacing.lg },
  formatNote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  gstCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  gstinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  gstinLabel: { ...typography.caption, color: colors.textTertiary },
  gstinValue: { ...typography.smallMedium, color: colors.text, fontVariant: ['tabular-nums'] },
  gstNoGstinTitle: { ...typography.bodyMedium, color: colors.text, marginBottom: spacing.xxs },
  gstBody: { ...typography.small, color: colors.textSecondary },
  gstCta: { marginTop: spacing.md },
  gstNote: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
  },
  gstNoteText: { ...typography.caption, color: colors.info, flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
});
