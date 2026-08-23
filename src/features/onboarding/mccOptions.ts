import type { MccOption } from '@models/kyc';

/**
 * Merchant Category Code options for the Section 6.4 Step 1 dropdown.
 *
 * Codes are real ISO 18245 MCCs so the value sent to the acquirer is meaningful;
 * labels are i18n keys, never display strings. The list is deliberately short and
 * phrased in everyday terms ("Grocery / Kirana store") rather than exposing the
 * full MCC taxonomy, which a kirana owner has no way to navigate.
 */
export const MCC_OPTIONS: readonly MccOption[] = [
  { code: '5411', labelKey: 'kyc.mcc.grocery' },
  { code: '5812', labelKey: 'kyc.mcc.restaurant' },
  { code: '5651', labelKey: 'kyc.mcc.apparel' },
  { code: '5732', labelKey: 'kyc.mcc.electronics' },
  { code: '5912', labelKey: 'kyc.mcc.pharmacy' },
  { code: '7230', labelKey: 'kyc.mcc.salon' },
  { code: '5200', labelKey: 'kyc.mcc.hardware' },
  { code: '8999', labelKey: 'kyc.mcc.services' },
  { code: '8299', labelKey: 'kyc.mcc.education' },
  { code: '4789', labelKey: 'kyc.mcc.transport' },
  { code: '5964', labelKey: 'kyc.mcc.online' },
  { code: '5999', labelKey: 'kyc.mcc.other' },
] as const;
