import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Paise } from '@models/index';

/**
 * Shared CSV primitives for the settlement statement (Section 6.11) and the sales
 * report (Section 6.13).
 *
 * Extracted so the escaping rules, the money formatting and the BOM handling exist
 * once. These files are opened by accountants in Excel, and each of the three has a
 * non-obvious requirement that is easy to get subtly wrong per-caller:
 *
 *  - **Formula injection.** A field beginning `=`, `+`, `-` or `@` is evaluated as
 *    a formula by Excel. Payer notes and transaction references flow into these
 *    files, so every field is neutralised.
 *  - **Money.** Amounts are integer paise internally and must be written as bare
 *    2-decimal rupee figures a spreadsheet can sum. No `₹` glyph, because Excel's
 *    default CP1252 import mangles it — the unit goes in the column header.
 *  - **Encoding.** A UTF-8 BOM makes Excel read the file as UTF-8, so localized
 *    headers and Indic script survive instead of becoming mojibake.
 */

/** Renders integer paise as a bare 2-decimal rupee figure for a spreadsheet cell. */
export function paiseToCsvAmount(paise: Paise): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Escapes a CSV field and neutralises Excel formula prefixes.
 *
 * The formula guard prepends an apostrophe, which Excel treats as "render the rest
 * as text" and does not display.
 */
export function csvField(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsFormulaGuard ? `'${value}` : value;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Joins pre-escaped-or-raw fields into a CSV row. */
export const csvRow = (fields: readonly string[]): string => fields.map(csvField).join(',');

/** CRLF, because Excel is the primary consumer and handles it most reliably. */
export const CSV_LINE_BREAK = '\r\n';

export type CsvExportResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'write_failed' | 'sharing_unavailable' };

/**
 * Writes a CSV to cache and opens the share sheet.
 *
 * Routed through sharing rather than written to a public directory: Android has no
 * writable public Downloads path without SAF or the media library, so the share
 * sheet is what actually lets the merchant put the file somewhere they can reach
 * (Drive, Files, or straight to their accountant on WhatsApp).
 */
export async function shareCsv(
  fileName: string,
  contents: string,
  dialogTitle: string,
  subdirectory: string,
): Promise<CsvExportResult> {
  let uri: string;

  try {
    const dir = new Directory(Paths.cache, subdirectory);
    if (!dir.exists) dir.create({ intermediates: true });

    const file = new File(dir, fileName);
    file.create({ overwrite: true });
    file.write(`\uFEFF${contents}`, { encoding: 'utf8' });
    uri = file.uri;
  } catch {
    return { ok: false, reason: 'write_failed' };
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'sharing_unavailable' };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle,
      UTI: 'public.comma-separated-values-text',
    });
    return { ok: true, uri };
  } catch {
    // Dismissing the share sheet is not a failure; the file was written.
    return { ok: true, uri };
  }
}
