import type { Settlement, Transaction } from '@models/index';
import { buildStatementCsv, statementFileName, type StatementLabels } from './statementExport';

/**
 * Settlement statement CSV.
 *
 * Two things are load-bearing: the money must render as plain 2-decimal rupee
 * figures a spreadsheet can sum, and untrusted text must not become an Excel
 * formula — settlement statements get opened by accountants.
 */

const labels: StatementLabels = {
  date: 'Date',
  time: 'Time',
  txnId: 'Transaction ID',
  utr: 'UTR',
  mode: 'Mode',
  status: 'Status',
  gross: 'Amount (INR)',
  fee: 'Fee (INR)',
  net: 'Net (INR)',
  total: 'Total',
  modeLabels: { upi_qr: 'UPI QR', card: 'Card' },
  statusLabels: { success: 'Received', failed: 'Failed' },
};

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 'stl_day_3',
    status: 'settled',
    grossAmount: 250_000,
    feeAmount: 2_360,
    netAmount: 247_640,
    utr: 'HDFCN700012345',
    transactionCount: 2,
    bankAccountMasked: 'XXXXXXXX4321',
    createdAt: '2026-08-20T10:00:00.000Z',
    settledAt: '2026-08-21T06:30:00.000Z',
    ...overrides,
  };
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_1',
    amount: 150_000,
    currency: 'INR',
    status: 'success',
    mode: 'upi_qr',
    fee: 0,
    netAmount: 150_000,
    createdAt: '2026-08-20T09:15:00.000Z',
    ...overrides,
  };
}

describe('buildStatementCsv structure', () => {
  it('emits a header, one row per transaction, and a totals row', () => {
    const csv = buildStatementCsv(settlement(), [txn(), txn({ id: 'txn_2' })], labels);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(4); // header + 2 rows + totals
    expect(lines[0]).toBe('Date,Time,Transaction ID,UTR,Mode,Status,Amount (INR),Fee (INR),Net (INR)');
    expect(lines[3]).toContain('Total');
  });

  it('uses CRLF line endings for Excel', () => {
    const csv = buildStatementCsv(settlement(), [txn()], labels);
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
  });

  it('renders paise as plain 2-decimal rupee figures a spreadsheet can sum', () => {
    const csv = buildStatementCsv(settlement(), [txn({ amount: 150_050, netAmount: 150_050 })], labels);

    expect(csv).toContain('1500.50');
    // No currency glyph — Excel's default import mangles it.
    expect(csv).not.toContain('\u20B9');
  });

  it('takes the totals from the settlement record, not by re-summing rows', () => {
    // Deliberately inconsistent: one row of ₹100 against a ₹2,500 batch. A
    // reconciler must be able to SEE the discrepancy, not have it silently fixed.
    const csv = buildStatementCsv(settlement(), [txn({ amount: 10_000, netAmount: 10_000 })], labels);
    const totalsLine = csv.split('\r\n').at(-1)!;

    expect(totalsLine).toContain('2500.00'); // gross from the batch
    expect(totalsLine).toContain('2476.40'); // net from the batch
  });

  it('localizes mode and status via the supplied labels', () => {
    const csv = buildStatementCsv(settlement(), [txn({ mode: 'card', status: 'failed' })], labels);
    expect(csv).toContain('Card');
    expect(csv).toContain('Failed');
  });

  it('falls back to the raw enum when a label is missing', () => {
    const csv = buildStatementCsv(settlement(), [txn({ mode: 'wallet' })], labels);
    expect(csv).toContain('wallet');
  });

  it('leaves the UTR column empty when a transaction has none', () => {
    const csv = buildStatementCsv(settlement(), [txn({ utr: undefined })], labels);
    const row = csv.split('\r\n')[1]!;
    // Date,Time,Id,UTR(empty),...
    expect(row.split(',')[3]).toBe('');
  });
});

describe('CSV escaping and injection safety', () => {
  it('quotes and escapes a field containing a comma or quote', () => {
    const csv = buildStatementCsv(
      settlement(),
      [txn({ id: 'txn,with"comma' })],
      labels,
    );
    expect(csv).toContain('"txn,with""comma"');
  });

  it('neutralises a leading = so Excel does not evaluate it as a formula', () => {
    const csv = buildStatementCsv(settlement(), [txn({ id: '=SUM(A1:A9)' })], labels);

    // Prefixed with an apostrophe, so it renders as text.
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).not.toMatch(/,=SUM/);
  });

  it.each(['+cmd', '-2+3', '@import'])('neutralises the formula prefix in %s', (value) => {
    const csv = buildStatementCsv(settlement(), [txn({ id: value })], labels);
    expect(csv).toContain(`'${value}`);
  });

  it('does not mangle an ordinary value', () => {
    const csv = buildStatementCsv(settlement(), [txn({ id: 'txn_abc123' })], labels);
    expect(csv).toContain('txn_abc123');
    expect(csv).not.toContain("'txn_abc123");
  });
});

describe('statementFileName', () => {
  it('uses the settled date and a filesystem-safe id', () => {
    expect(statementFileName(settlement())).toBe('settlement-statement-2026-08-21-stl_day_3.csv');
  });

  it('falls back to the created date for an unsettled batch', () => {
    const name = statementFileName(settlement({ status: 'processing', settledAt: undefined }));
    expect(name).toBe('settlement-statement-2026-08-20-stl_day_3.csv');
  });

  it('strips characters that are unsafe in a filename', () => {
    const name = statementFileName(settlement({ id: 'stl/../etc passwd' }));
    expect(name).not.toContain('/');
    expect(name).not.toContain(' ');
  });
});
