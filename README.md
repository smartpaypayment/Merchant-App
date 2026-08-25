# MerchantOne — Indian Merchant App

React Native (Expo) + TypeScript implementation of `App-PRD-Merchant-App.md`.

Runs **end-to-end against an in-memory mock backend**, so no live API is required.

## Status against PRD Section 16 (Build Order)

| Step | Scope | Status |
|---|---|---|
| 1 | Project scaffold, theme, navigation shell, i18n, API client + interceptors | ✅ Complete |
| 2 | Auth flow (Login → OTP → token storage) | ✅ Complete |
| 3 | Onboarding / KYC wizard | ✅ Complete |
| 4 | Home dashboard | ✅ Complete |
| 5 | Collect payment (static/dynamic QR, status, success + audio) | ✅ Complete |
| 6 | Transactions list + detail + refund | ✅ Complete |
| 7 | Settlements list + detail | ✅ Complete |
| 8 | Reports | ⬜ Navigable placeholder |
| 9 | Profile, settings, staff, support, notifications | 🟡 Notifications done; rest placeholder |
| 10 | Offline handling, security hardening, tests | 🟡 Foundations in place |

Placeholder screens are wired into the real Section 4 navigation map and state which
build step replaces them — every tab and route resolves, nothing crashes.

## Running

```bash
npm install
npm start          # then press 'a' for Android, or scan with Expo Go
npm run web        # browser preview
```

Verification:

```bash
npm run typecheck     # tsc --noEmit, strict
npm test              # 146 tests
npm run bundle:check  # production Android bundle
```

### Demo credentials (mock mode)

| Input | Result |
|---|---|
| Mobile `9876543210` | Existing approved merchant → lands on Home with 14 days of history |
| Any other valid mobile | New user → runs the full KYC wizard |
| OTP | `123456` (also the Aadhaar eKYC OTP) |
| Account number ending `0000` | Penny-drop verification failure |
| PAN `AAAAA0000A` | PAN verification failure |

Mock mode is controlled by `extra.useMockApi` in `app.json`. Setting it to `false`
points the same client at `extra.apiBaseUrl` — the interceptor chain is unchanged.

## Architecture notes

**Money.** Every amount is an integer count of paise end to end (PRD §8). Rupee
strings are produced only by `AmountDisplay` / `@utils/money`. Indian digit grouping
(`₹12,34,567.50`) is hand-rolled rather than delegated to `Intl.NumberFormat`,
because Hermes on some Android 8 builds ships without full ICU and would silently
fall back to Western 3-digit grouping. A round-trip test asserts zero float drift.

**Mock API as a transport, not a stub.** `mockAdapter` is installed as the Axios
`adapter`, so token injection, 401 → refresh-once → logout, and error normalization
all execute in mock mode exactly as against a real server. Going live is a config
flag, not a refactor.

**Navigation is derived from state.** `RootNavigator` picks its branch from session
status and `kycStatus` rather than imperative `navigate` calls. A merchant who quits
mid-KYC resumes in the wizard on next launch, and logout instantly unmounts the
authenticated tree.

**Localization.** English is the canonical bundle; a `Widen<typeof en>` type forces
the other seven languages to match its key tree, so a missing translation is a
compile error rather than a runtime fallback. All 8 bundles are at key parity.

**Offline.** React Query's cache is persisted to AsyncStorage. The dashboard treats
"offline with cached data" as a success state with a banner, not an error.

**Security.** Tokens live in `expo-secure-store` (Keystore/Keychain); the Aadhaar
number is held in component state only and never written to the KYC draft.

**Settlement statements are CSV, not PDF — deliberately.** CSV opens in Excel and
Google Sheets, which is what actually gets reconciled against a bank statement. A
compliant PDF statement carries registered entity details, GSTIN and a fee
breakdown that must match the platform's system of record for an audit, so it has
to be rendered server-side and fetched as a signed URL rather than assembled on
device where it could drift. `shareStatement` is the seam for that. The CSV writer
also neutralises leading `=`/`+`/`-`/`@` so a payer-supplied note can't become an
Excel formula — these files get opened by accountants.

**Instant settlement fees are fetched, never computed client-side.** The quote
endpoint returns net, fee, GST-on-fee and payout, and the UI renders all four. That
keeps pricing a backend concern and makes §4.4's fee transparency literal. The
arithmetic guarantees `payout + totalFee === net` exactly, so the breakdown always
reconciles against the bank credit.

**Re-auth for money movement.** Refunds are gated behind `ReauthSheet` (biometric,
falling back to an app PIN). The mutation only runs from the sheet's success
callback, so no single tap can move money. The PIN is stored as
`SHA-256(salt : pin)` with a per-PIN 16-byte salt, and guessing is capped at 5
attempts. The limitation is stated plainly in `appLock.ts`: one SHA-256 pass is not
a password KDF, and a 4-6 digit keyspace falls instantly to anyone who extracts
the record — what actually protects it is the hardware-backed keystore. A
production build should use a stretched KDF or have the PIN unwrap a
StrongBox-backed key.

**Payment status.** `usePaymentStatus` implements the §10 hybrid: poll every ~2.5s
while the QR is visible, stop dead on any terminal status, and dedupe by ref so a
duplicate push or a late poll cannot fire the success handler twice. Polling backs
off while the app is backgrounded and re-polls immediately on return — the most
likely moment for a completed payment. Poll errors do *not* end the watch, since a
merchant on flaky 2G would otherwise be stranded on a QR that may already be paid.
`notifyPaymentEvent(ref)` is the seam for the FCM handler.

**Audio confirmation.** Fires at *detection* time in `DynamicQRScreen`, not on
mount of the success screen, so the ~5s target in §15 does not include a screen
transition — and the merchant hears it without looking at the phone, which is the
point of the soundbox behaviour. Uses on-device TTS in the merchant's language;
the trade-off (no volume control, needs a TTS voice installed) and the
pre-recorded-clip alternative are documented in `audioConfirmation.ts`.

## Structure

Matches PRD Section 3:

```
src/
├── api/           # client + interceptors, per-domain modules, mocks/
├── app/           # navigation/, providers/
├── components/    # Section 7 reusable components
├── features/      # auth, onboarding, home, collect, transactions, …
├── hooks/         # useNetworkStatus, useCountdown
├── store/         # authStore, storage, secureStorage
├── models/        # Section 8 data models
├── utils/         # money, date, validators
├── localization/  # i18n + 8 language bundles
└── theme/         # colors, typography, spacing
```
