import type { ReportSeriesPoint, ReportsResponse } from '@models/api';
import type { Merchant, Paise } from '@models/index';
import { csvField, paiseToCsvAmount, shareCsv, type CsvExportResult } from '@utils/csv';
import { toDateKey } from '@utils/date';

/**
 * Report exports (Section 6.13: "Export button (PDF/Excel), GST invoice
 * generation entry"; PRD DASH-4).
 *
 * Two exports, both CSV:
 *
 * 1. **Sales report** — one row per day plus a totals row. This is the artefact a
 *    merchant hands their accountant or drops into a spreadsheet.
 *
 * 2. **GST summary** — the period totals alongside the merchant's GSTIN, as a
 *    key/value sheet. This is what the Section 6.13 "GST invoice generation entry"
 *    can honestly produce from payment records.
 *
 * ## What this is not
 *
 * It is **not** a GST tax invoice. A compliant tax invoice requires the customer's
 * name and GSTIN, an HSN/SAC code per line item, the taxable value and the
 * CGST/SGST/IGST split, and an invoice number from a gapless series. None of that
 * exists in a UPI payment record — a QR payment carries an amount and a payer VPA,
 * nothing more. Deriving one would mean inventing tax data, which is worse than
 * not offering it. Per-payment invoices belong to the invoicing feature (DASH-5),
 * where line items are actually captured. The export states this on its face so a
 * merchant cannot mistake it for a filing document.
 *
 * PDF is likewise deferred for the reason documented in `settlements/statementExport.ts`.
 */

export interface ReportExportLabels {
  date: string;
  sales: string;
  count: string;
  total: string;
  period: string;
  generated: string;
}

/**
 * Builds the daily sales CSV.
 *
 * Takes the pre-filled series so zero-sale days appear as explicit `0` rows rather
 * than being silently absent — an accountant reconciling a month needs to see that
 * Sunday was ₹0, not that Sunday is missing.
 */
export function buildReportCsv(
  report: ReportsResponse,
  series: readonly ReportSeriesPoint[],
  labels: ReportExportLabels,
): string {
  const rows: string[] = [];

  // Provenance header: which period, and when it was produced.
  rows.push([csvField(labels.period), csvField(`${toDateKey(report.from)} to ${toDateKey(report.to)}`)].join(','));
  rows.push([csvField(labels.generated), csvField(new Date().toISOString())].join(','));
  rows.push('');

  rows.push([csvField(labels.date), csvField(labels.sales), csvField(labels.count)].join(','));

  for (const point of series) {
    rows.push([csvField(point.date), paiseToCsvAmount(point.amount), String(point.count)].join(','));
  }

  // Totals come from the report record rather than by re-summing the rows, so a
  // discrepancy between the two stays visible.
  rows.push(
    [csvField(labels.total), paiseToCsvAmount(report.totalSales), String(report.txnCount)].join(','),
  );

  return rows.join('\r\n');
}

export interface GstSummaryLabels {
  field: string;
  value: string;
  businessName: string;
  gstin: string;
  periodFrom: string;
  periodTo: string;
  totalSales: string;
  txnCount: string;
  note: string;
  noteValue: string;
}

/** Builds the GST period summary as a two-column key/value sheet. */
export function buildGstSummaryCsv(
  report: ReportsResponse,
  merchant: Pick<Merchant, 'businessName' | 'gstin'>,
  labels: GstSummaryLabels,
): string {
  const pairs: [string, string][] = [
    [labels.businessName, merchant.businessName],
    [labels.gstin, merchant.gstin ?? ''],
    [labels.periodFrom, toDateKey(report.from)],
    [labels.periodTo, toDateKey(report.to)],
    [labels.totalSales, paiseToCsvAmount(report.totalSales)],
    [labels.txnCount, String(report.txnCount)],
    // Stated in the file itself, so it survives being emailed on to an accountant.
    [labels.note, labels.noteValue],
  ];

  return [
    [csvField(labels.field), csvField(labels.value)].join(','),
    ...pairs.map(([key, val]) => [csvField(key), csvField(val)].join(',')),
  ].join('\r\n');
}

const fileSafe = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '');

export function reportFileName(report: ReportsResponse, prefix: string): string {
  return `${fileSafe(prefix)}-${toDateKey(report.from)}-to-${toDateKey(report.to)}.csv`;
}

/** Writes and shares a report CSV. Thin wrapper so screens stay declarative. */
export function shareReport(
  fileName: string,
  contents: string,
  dialogTitle: string,
): Promise<CsvExportResult> {
  return shareCsv(fileName, contents, dialogTitle, 'reports');
}

export type { Paise };
