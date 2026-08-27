import type { Settlement, Transaction } from '@models/index';
import { csvRow, paiseToCsvAmount, shareCsv, type CsvExportResult } from '@utils/csv';
import { toDateKey } from '@utils/date';

/**
 * Settlement statement export (Section 6.11: "Download statement (PDF/Excel)",
 * PRD SET-3).
 *
 * ## Format: CSV, not PDF
 *
 * This produces a CSV, which opens directly in Excel and Google Sheets and is what
 * a merchant or their accountant actually reconciles against a bank statement.
 *
 * PDF is deliberately **not** generated on-device. A compliant settlement
 * statement carries the entity's registered details, GSTIN and fee breakdown, and
 * must match what the platform can produce on demand for an audit — that document
 * has to be rendered server-side and fetched as a signed URL, not assembled in the
 * client where it could drift from the system of record. Adding a device-side PDF
 * writer would ship a heavy dependency to produce a document that is not the
 * authoritative one. When the backend exposes it, the client work is a fetch and a
 * share, reusing `shareStatement` below.
 *
 * ## Money
 *
 * Amounts are stored as integer paise and converted to a fixed 2-decimal rupee
 * string **only** when writing the file, because that is what a spreadsheet
 * expects. `INR` is stated in the column headers rather than emitting a `₹` glyph,
 * which Excel's default CP1252 import mangles.
 */

/** Column labels, supplied by the caller so the file is localized. */
export interface StatementLabels {
  date: string;
  time: string;
  txnId: string;
  utr: string;
  mode: string;
  status: string;
  gross: string;
  fee: string;
  net: string;
  total: string;
  /** Localized mode/status values, keyed by the raw enum value. */
  modeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
}

/*
 * The CSV primitives (escaping, formula-injection guard, money formatting, BOM and
 * file sharing) live in `@utils/csv` and are shared with the sales report export.
 */

/**
 * Builds the CSV body for one settlement batch.
 *
 * Exported separately from the file write so the content is unit-testable without
 * touching the filesystem.
 */
export function buildStatementCsv(
  settlement: Settlement,
  transactions: readonly Transaction[],
  labels: StatementLabels,
): string {
  const header = csvRow([
    labels.date,
    labels.time,
    labels.txnId,
    labels.utr,
    labels.mode,
    labels.status,
    labels.gross,
    labels.fee,
    labels.net,
  ]);

  const rows = transactions.map((txn) => {
    const created = new Date(txn.createdAt);
    return csvRow([
      toDateKey(txn.createdAt),
      `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`,
      txn.id,
      txn.utr ?? '',
      labels.modeLabels[txn.mode] ?? txn.mode,
      labels.statusLabels[txn.status] ?? txn.status,
      paiseToCsvAmount(txn.amount),
      paiseToCsvAmount(txn.fee),
      paiseToCsvAmount(txn.netAmount),
    ]);
  });

  // Totals come from the settlement record, not from re-summing the rows: the
  // batch is the system of record, and a mismatch between the two is exactly what
  // a reconciler needs to be able to see.
  const totals = csvRow([
    labels.total,
    '',
    '',
    settlement.utr ?? '',
    '',
    '',
    paiseToCsvAmount(settlement.grossAmount),
    paiseToCsvAmount(settlement.feeAmount),
    paiseToCsvAmount(settlement.netAmount),
  ]);

  // CRLF: Excel is the primary consumer and handles it most reliably.
  return [header, ...rows, totals].join('\r\n');
}

/** `settlement-statement-2026-08-23-stl_day_3.csv` */
export function statementFileName(settlement: Settlement): string {
  const datePart = toDateKey(settlement.settledAt ?? settlement.createdAt);
  const idPart = settlement.id.replace(/[^a-zA-Z0-9_-]/g, '');
  return `settlement-statement-${datePart}-${idPart}.csv`;
}

export type StatementExportResult = CsvExportResult;

/** Writes the statement to cache and opens the share sheet. */
export function shareStatement(
  fileName: string,
  contents: string,
  dialogTitle: string,
): Promise<StatementExportResult> {
  return shareCsv(fileName, contents, dialogTitle, 'statements');
}
