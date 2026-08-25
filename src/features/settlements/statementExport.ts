import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Paise, Settlement, Transaction } from '@models/index';
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

/** Renders integer paise as a bare 2-decimal rupee figure for a spreadsheet cell. */
function paiseToCsvAmount(paise: Paise): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Escapes a CSV field.
 *
 * Also neutralises the leading `=`, `+`, `-` and `@` characters that Excel
 * interprets as a formula — a payer-supplied note reaching a spreadsheet is a
 * CSV-injection vector, and settlement statements get opened by accountants.
 */
function csvField(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsFormulaGuard ? `'${value}` : value;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

const csvRow = (fields: readonly string[]): string => fields.map(csvField).join(',');

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

export type StatementExportResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'write_failed' | 'sharing_unavailable' };

/**
 * Writes the statement to cache and opens the share sheet.
 *
 * Routed through the share sheet rather than written to a public directory:
 * Android has no writable public Downloads path without SAF or the media library,
 * so sharing is what actually lets the merchant put the file somewhere they can
 * reach (Drive, Files, WhatsApp to their accountant).
 */
export async function shareStatement(
  fileName: string,
  contents: string,
  dialogTitle: string,
): Promise<StatementExportResult> {
  let uri: string;

  try {
    const dir = new Directory(Paths.cache, 'statements');
    if (!dir.exists) dir.create({ intermediates: true });

    const file = new File(dir, fileName);
    file.create({ overwrite: true });
    // A BOM makes Excel read the file as UTF-8, so localized headers and Indic
    // script in notes survive instead of becoming mojibake.
    file.write(`\uFEFF${contents}`, { encoding: 'utf8' });
    uri = file.uri;
  } catch {
    return { ok: false, reason: 'write_failed' };
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'sharing_unavailable' };
    }
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle, UTI: 'public.comma-separated-values-text' });
    return { ok: true, uri };
  } catch {
    // The user dismissing the share sheet is not a failure; the file exists.
    return { ok: true, uri };
  }
}
