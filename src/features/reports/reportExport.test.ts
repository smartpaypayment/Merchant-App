import type { ReportSeriesPoint, ReportsResponse } from '@models/api';
import {
  buildGstSummaryCsv,
  buildReportCsv,
  reportFileName,
  type GstSummaryLabels,
  type ReportExportLabels,
} from './reportExport';

/**
 * Report exports.
 *
 * The GST summary is the one to watch: it must never read as a tax invoice, and
 * it must carry its own disclaimer, because the file gets emailed on to an
 * accountant with no surrounding UI.
 */

const reportLabels: ReportExportLabels = {
  date: 'Date',
  sales: 'Sales (INR)',
  count: 'Payments',
  total: 'Total',
  period: 'Period',
  generated: 'Generated',
};

const gstLabels: GstSummaryLabels = {
  field: 'Field',
  value: 'Value',
  businessName: 'Business name',
  gstin: 'GSTIN',
  periodFrom: 'Period from',
  periodTo: 'Period to',
  totalSales: 'Total sales (INR)',
  txnCount: 'Number of payments',
  note: 'Note',
  noteValue: 'Summary of payments received. Not a tax invoice.',
};

function report(overrides: Partial<ReportsResponse> = {}): ReportsResponse {
  return {
    from: '2026-08-17T00:00:00.000Z',
    to: '2026-08-19T23:59:59.999Z',
    totalSales: 250_000,
    txnCount: 4,
    avgTicketSize: 62_500,
    topPaymentMode: 'upi_qr',
    series: [],
    ...overrides,
  };
}

const series: ReportSeriesPoint[] = [
  { date: '2026-08-17', amount: 150_000, count: 2 },
  { date: '2026-08-18', amount: 0, count: 0 },
  { date: '2026-08-19', amount: 100_000, count: 2 },
];

describe('buildReportCsv', () => {
  it('includes a provenance header with the period and generation time', () => {
    const csv = buildReportCsv(report(), series, reportLabels);

    expect(csv).toContain('Period,2026-08-17 to 2026-08-19');
    expect(csv).toContain('Generated,');
  });

  it('writes one row per day, including days with no sales', () => {
    const csv = buildReportCsv(report(), series, reportLabels);
    const lines = csv.split('\r\n');

    // A zero day must be an explicit 0 row, not an omission — an accountant
    // reconciling the period needs to see the shop was shut, not find a gap.
    expect(lines).toContain('2026-08-18,0.00,0');
    expect(lines).toContain('2026-08-17,1500.00,2');
    expect(lines).toContain('2026-08-19,1000.00,2');
  });

  it('renders paise as plain 2-decimal rupee figures with no currency glyph', () => {
    const csv = buildReportCsv(report(), series, reportLabels);
    expect(csv).toContain('1500.00');
    expect(csv).not.toContain('\u20B9');
  });

  it('takes totals from the report record, not by re-summing rows', () => {
    // Deliberately inconsistent: rows sum to 2500 but the record says 9999.
    const csv = buildReportCsv(report({ totalSales: 999_900, txnCount: 9 }), series, reportLabels);
    const totalsLine = csv.split('\r\n').at(-1)!;

    expect(totalsLine).toBe('Total,9999.00,9');
  });

  it('handles an empty series without producing a malformed file', () => {
    const csv = buildReportCsv(report({ totalSales: 0, txnCount: 0 }), [], reportLabels);
    const lines = csv.split('\r\n');

    expect(lines).toContain('Date,Sales (INR),Payments');
    expect(lines.at(-1)).toBe('Total,0.00,0');
  });

  it('uses CRLF line endings for Excel', () => {
    expect(buildReportCsv(report(), series, reportLabels)).toContain('\r\n');
  });
});

describe('buildGstSummaryCsv', () => {
  const merchant = { businessName: 'Sharma General Store', gstin: '27ABCDE1234F1Z5' };

  it('emits a key/value sheet with the GSTIN and period totals', () => {
    const csv = buildGstSummaryCsv(report(), merchant, gstLabels);

    expect(csv).toContain('Field,Value');
    expect(csv).toContain('Business name,Sharma General Store');
    expect(csv).toContain('GSTIN,27ABCDE1234F1Z5');
    expect(csv).toContain('Period from,2026-08-17');
    expect(csv).toContain('Period to,2026-08-19');
    expect(csv).toContain('Total sales (INR),2500.00');
    expect(csv).toContain('Number of payments,4');
  });

  it('carries the not-a-tax-invoice disclaimer inside the file itself', () => {
    // The file travels beyond the app, so the caveat has to travel with it.
    const csv = buildGstSummaryCsv(report(), merchant, gstLabels);
    expect(csv).toContain('Not a tax invoice');
  });

  it('leaves the GSTIN blank rather than inventing one when none is on file', () => {
    const csv = buildGstSummaryCsv(report(), { businessName: 'Test Store' }, gstLabels);
    expect(csv).toContain('GSTIN,');
    expect(csv).not.toMatch(/GSTIN,\S/);
  });

  it('escapes a business name containing a comma', () => {
    const csv = buildGstSummaryCsv(
      report(),
      { businessName: 'Sharma Stores, Nashik' },
      gstLabels,
    );
    expect(csv).toContain('"Sharma Stores, Nashik"');
  });

  it('neutralises a formula prefix in the business name', () => {
    const csv = buildGstSummaryCsv(report(), { businessName: '=cmd()' }, gstLabels);
    expect(csv).toContain("'=cmd()");
  });
});

describe('reportFileName', () => {
  it('names the file after the period', () => {
    expect(reportFileName(report(), 'sales-report')).toBe(
      'sales-report-2026-08-17-to-2026-08-19.csv',
    );
  });

  it('strips characters that are unsafe in a filename', () => {
    const name = reportFileName(report(), 'sales/../report file');
    expect(name).not.toContain('/');
    expect(name).not.toContain(' ');
  });
});
