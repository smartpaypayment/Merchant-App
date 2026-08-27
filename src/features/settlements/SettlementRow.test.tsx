import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Settlement } from '@models/index';
import { SettlementRow } from './SettlementRow';

/**
 * Regression test for a real bug: "Settle now" was originally nested inside the
 * card's own `Pressable`. On React Native Web that renders `<button>` inside
 * `<button>` (invalid DOM, which React reports as an error), and on any platform
 * it makes the two touch targets overlap so which handler fires is an
 * implementation detail rather than a stated intent.
 *
 * The assertion that matters most is `does NOT open the batch`: with the controls
 * nested, pressing "Settle now" could also trigger the row.
 *
 * Note: `render` is asynchronous in React Native Testing Library v14 and must be
 * awaited, otherwise every query runs against an unresolved promise.
 */

// Keys are returned verbatim so assertions do not depend on copy.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 'stl_1',
    status: 'processing',
    grossAmount: 250_000,
    feeAmount: 0,
    netAmount: 250_000,
    transactionCount: 3,
    bankAccountMasked: 'XXXXXXXX4321',
    createdAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

async function setup(overrides: Partial<Settlement> = {}, isOnline = true) {
  const onPress = jest.fn();
  const onInstantSettle = jest.fn();

  await render(
    <SettlementRow
      settlement={settlement(overrides)}
      onPress={onPress}
      onInstantSettle={onInstantSettle}
      isOnline={isOnline}
    />,
  );

  return { onPress, onInstantSettle };
}

describe('SettlementRow', () => {
  it('renders the batch summary as its own pressable', async () => {
    await setup();
    expect(screen.getByTestId('settlement-row-stl_1')).toBeTruthy();
    expect(screen.getByTestId('settlement-amount-stl_1')).toBeTruthy();
  });

  it('opens the batch when the summary is pressed', async () => {
    const { onPress, onInstantSettle } = await setup();

    fireEvent.press(screen.getByTestId('settlement-row-stl_1'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onInstantSettle).not.toHaveBeenCalled();
  });

  it('does NOT open the batch when "Settle now" is pressed', async () => {
    const { onPress, onInstantSettle } = await setup();

    fireEvent.press(screen.getByTestId('settlement-instant-stl_1'));

    expect(onInstantSettle).toHaveBeenCalledTimes(1);
    // The regression: with the controls nested, this would also have fired.
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the two controls as siblings, not nested', async () => {
    await setup();

    const summary = screen.getByTestId('settlement-row-stl_1');
    const instant = screen.getByTestId('settlement-instant-stl_1');

    // Walk up from the instant button; the summary must not be an ancestor.
    const ancestors: unknown[] = [];
    let node = instant.parent;
    while (node) {
      ancestors.push(node);
      node = node.parent;
    }
    expect(ancestors).not.toContain(summary);
  });

  it('offers "Settle now" while the money has not landed', async () => {
    await setup({ status: 'processing' });
    expect(screen.queryByTestId('settlement-instant-stl_1')).toBeTruthy();
  });

  it.each(['settled', 'failed'] as const)('hides "Settle now" for a %s batch', async (status) => {
    await setup({ status, ...(status === 'settled' ? { utr: 'HDFCN1' } : {}) });
    expect(screen.queryByTestId('settlement-instant-stl_1')).toBeNull();
  });

  it('disables "Settle now" when offline and does not fire the handler', async () => {
    const { onInstantSettle } = await setup({}, false);

    fireEvent.press(screen.getByTestId('settlement-instant-stl_1'));

    // Section 11: connectivity-dependent actions are disabled offline.
    expect(onInstantSettle).not.toHaveBeenCalled();
  });

  it('shows the UTR for a settled batch', async () => {
    await setup({ status: 'settled', utr: 'HDFCN700012345' });
    expect(screen.getByText(/HDFCN700012345/)).toBeTruthy();
  });
});
