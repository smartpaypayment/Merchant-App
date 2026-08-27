import type { KycDraft } from '@models/kyc';
import { secureStorage, SecureKeys } from './secureStorage';
import { storage, StorageKeys } from './storage';

/**
 * Split persistence for the resumable KYC draft (Section 6.4 + Section 12).
 *
 * ## The problem this solves
 *
 * The draft is written after every wizard step so a merchant on flaky 2G, or one
 * who force-quits, resumes without retyping. But two of the fields it carried are
 * exactly the kind Section 12 says must not sit in plain storage: the **PAN** and
 * the **full bank account number**. They were being written to AsyncStorage under
 * `kyc.draft` in cleartext, readable by anything with access to the app sandbox —
 * while `useKycDraft`'s own comment claimed "only non-sensitive progress data is
 * kept". That claim was true for the Aadhaar number (which is genuinely never
 * persisted) and false for these two.
 *
 * ## Why splitting rather than redacting
 *
 * Dropping the two fields would have been the one-line fix, but it would defeat
 * the point of the draft: the merchant would resume the wizard and have to retype
 * the two longest, most error-prone values on the form — a 10-character PAN and an
 * up-to-18-digit account number. Instead the draft is split at the storage
 * boundary: progress and non-secret fields stay in AsyncStorage, the two secrets
 * go to the Keystore/Keychain via `expo-secure-store`, and `loadKycDraft`
 * reassembles them. Resumability is unchanged; the secrets are encrypted at rest.
 *
 * ## Known limitation
 *
 * On web, `expo-secure-store` has no secure enclave and `secureStorage` falls back
 * to an `insecure.`-prefixed AsyncStorage key. So on the browser preview this is
 * no stronger than before. That is a property of the web target, which is a
 * development convenience here and not a shipping surface — the same caveat is
 * documented on `secureStorage` itself.
 */

/** The fields held back from AsyncStorage. */
export interface SensitiveKycFields {
  pan?: string;
  accountNumber?: string;
}

/** Placeholder written into the AsyncStorage copy in place of a secret. */
const REDACTED = '';

function split(draft: KycDraft): { safe: KycDraft; sensitive: SensitiveKycFields } {
  const sensitive: SensitiveKycFields = {};
  const safe: KycDraft = { ...draft };

  if (draft.identity) {
    // GSTIN stays in the clear: it is a publicly searchable business identifier,
    // not a secret, and keeping it avoids a second Keystore round-trip.
    if (draft.identity.pan) sensitive.pan = draft.identity.pan;
    safe.identity = { ...draft.identity, pan: REDACTED };
  }

  if (draft.bankAccount) {
    // IFSC and holder name are not secrets — the account number is.
    if (draft.bankAccount.accountNumber) sensitive.accountNumber = draft.bankAccount.accountNumber;
    safe.bankAccount = { ...draft.bankAccount, accountNumber: REDACTED };
  }

  return { safe, sensitive };
}

function merge(safe: KycDraft, sensitive: SensitiveKycFields): KycDraft {
  const merged: KycDraft = { ...safe };

  if (merged.identity && sensitive.pan) {
    merged.identity = { ...merged.identity, pan: sensitive.pan };
  }
  if (merged.bankAccount && sensitive.accountNumber) {
    merged.bankAccount = { ...merged.bankAccount, accountNumber: sensitive.accountNumber };
  }

  return merged;
}

async function readSensitive(): Promise<SensitiveKycFields> {
  const raw = await secureStorage.getItem(SecureKeys.kycSensitive);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SensitiveKycFields;
  } catch {
    return {};
  }
}

/** Loads the draft, reassembling the secrets from the Keystore. */
export async function loadKycDraft(): Promise<KycDraft | null> {
  const safe = await storage.getObject<KycDraft>(StorageKeys.kycDraft);
  if (!safe) return null;
  return merge(safe, await readSensitive());
}

/** Persists the draft, routing the PAN and account number to the Keystore. */
export async function saveKycDraft(draft: KycDraft): Promise<void> {
  const { safe, sensitive } = split(draft);

  await storage.setObject(StorageKeys.kycDraft, safe);

  if (sensitive.pan || sensitive.accountNumber) {
    await secureStorage.setItem(SecureKeys.kycSensitive, JSON.stringify(sensitive));
  } else {
    // Nothing secret left to hold — don't leave a stale record behind.
    await secureStorage.deleteItem(SecureKeys.kycSensitive);
  }
}

/**
 * Removes both halves.
 *
 * Called on logout and once KYC is submitted. Both halves must go together: a
 * leftover Keystore record would otherwise re-attach a previous merchant's PAN to
 * a fresh draft on a shared device.
 */
export async function clearKycDraft(): Promise<void> {
  await Promise.all([
    storage.remove(StorageKeys.kycDraft),
    secureStorage.deleteItem(SecureKeys.kycSensitive),
  ]);
}
