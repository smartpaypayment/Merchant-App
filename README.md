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
| 8 | Reports | ✅ Complete |
| 9 | Profile, settings, staff, support, notifications | ✅ Complete |
| 10 | Offline handling, security hardening, tests | ✅ Complete |

Every screen in the Section 4 navigation map is now implemented — there are no
placeholder screens left, and the "Soon" badges are gone from the More menu.

## Running

```bash
npm install
npm start          # then press 'a' for Android, or scan with Expo Go
npm run web        # browser preview
```

Verification:

```bash
npm run typecheck     # tsc --noEmit, strict
npm test              # 338 tests
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

**React Query had to be taught what "online" means.** Its default detection reads
`navigator.onLine`, which does not exist on React Native, so the library believed it
was permanently online: `refetchOnReconnect` never fired and retries burned their
backoff against a dead radio. `queryLifecycle.ts` bridges `onlineManager` to NetInfo
through the same subscription the offline banner uses, so the two cannot disagree.

That fix required `networkMode: 'offlineFirst'` to land safely. Under the default
`'online'` mode a correctly-wired `onlineManager` parks an offline query in
`fetchStatus: 'paused'`, which reads as `isLoading === false`, `isError === false`,
`data === undefined` — and every list screen here renders that as **empty**. An
offline merchant with a cold cache would have been told "No settlements yet" instead
of "you are offline": a worse bug than the one being fixed. `'offlineFirst'` lets the
first attempt run, so a real failure still surfaces as `network_error`, while retries
wait for connectivity. Mutations use the same mode for a different reason: under
`'online'` an offline write is paused indefinitely, which is an implicit write queue,
and a deferred "remove this staff member" landing hours later is a security problem.

**Logout deletes both query caches.** `queryClient.clear()` was previously wired only
to the 401 path, so tapping "Log out" in Settings left transactions, settlements,
dashboard figures and the profile in memory *and* on disk under `cache.reactQuery`,
where the next launch would restore them — for whoever signed in next. On a shared
counter phone that is a real disclosure. `logout()` now owns the whole teardown so
the two paths cannot drift, and `sessionPurge.test.ts` guards it.

**The KYC draft is split by sensitivity, not redacted.** The draft is saved after
every step so a merchant on flaky 2G resumes without retyping — but it was writing
the PAN and the full bank account number to plain AsyncStorage, while its own comment
claimed only non-sensitive data was kept. Dropping those two fields would have been
the one-line fix and would have defeated the point, since they are the longest and
most error-prone values on the form. Instead `kycDraftStorage.ts` splits at the
storage boundary: progress, IFSC, holder name and GSTIN stay in AsyncStorage, the two
secrets go to the Keystore, and load reassembles them. The Aadhaar number is still
never persisted at all.

**App lock is enforced, with a deliberately generous grace period.** Section 12's
"PIN + biometric" was half-built: `ReauthSheet` gated refunds and bank changes, but
nothing locked the app, so a valid token put whoever picked the phone up straight on
Home. `lockManager.ts` locks on cold start always, and on return from background only
after five minutes. That window is the difference between a feature merchants keep
and one they switch off — a shop owner flips to their UPI app or the camera dozens of
times an hour. The last-active time is held in memory only: persisting it would add a
tamper surface for no gain, since cold start locks unconditionally. `LockScreen`
replaces the authenticated tree rather than covering it, so the day's takings are not
sitting rendered behind a sheet, and it always offers "Forgot your PIN?" → log out,
because a forgotten PIN must not brick access to a merchant's money.

**The PIN cooldown is persisted; the PIN hash is deliberately not stretched.** The
attempt counter used to be a module-level variable, so force-quitting reset it — a
two-second action that made the five-attempt limit decorative against exactly the
threat it exists to stop. It is now in secure storage with an escalating cooldown
(30s → 2min → 10min → 30min, capped) that expires on its own, which also removes the
original objection to persisting it. Key stretching was considered and rejected on
the arithmetic: `expo-crypto` exposes no KDF, so iterations mean native bridge
round-trips, and the few hundred affordable on a 2GB phone take a 4-digit brute force
from 10⁴ to 10⁷ hashes — still under a second for an attacker, in exchange for a
visible stall before every refund. Full reasoning is in `appLock.ts`; the real fixes
are a native KDF or having the PIN unwrap a StrongBox key.

**Screen-capture blocking is scoped, not blanket.** `FLAG_SECURE` via
`expo-screen-capture` covers the PIN pad, the KYC identity/bank steps and the profile
bank form — which on Android also keeps them out of the app-switcher thumbnail. It is
deliberately **not** applied to the QR screens: merchants legitimately screenshot
their static QR to print it or send it over WhatsApp, and blocking that would break a
real workflow to protect a payment address that is meant to be public. The hook is
reference counted, because `preventScreenCaptureAsync` is a single global switch and
a `ReauthSheet` closing over a protected form would otherwise silently unprotect it.

**`sensitive` on `TextField`, not `secureTextEntry`.** PAN, Aadhaar and account-number
fields turn off autofill, autocomplete, autocorrect and the spell-check dictionary,
which on some Android keyboards learns typed strings and resurfaces them in other
apps. They stay visible on purpose: a merchant needs to check an 18-digit account
number against their passbook, and masking it just pushes people to type it into a
notes app first. Shoulder-surfing is handled where it actually matters — the PIN pad,
which renders dots and never numerals.

## Release checklist

Known items deliberately deferred, each documented at its call site:

| Item | Where |
|---|---|
| Replace the placeholder grievance contacts and clear the flag | `src/features/support/supportContacts.ts` |
| Flip `extra.useMockApi` to `false` | `app.json` |
| Certificate pinning (needs `prebuild`; would break the Expo Go workflow) | — |
| Native KDF for the app PIN, or a StrongBox-backed key | `src/store/appLock.ts` |
| Server-rendered signed-URL PDF statements | `shareStatement` / `shareReport` |
| UTC day-key attribution for reports (backend) | `src/features/reports/` |

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

**Grievance contacts are placeholders, and the app says so.** `supportContacts.ts`
holds the support line, nodal officer and RBI portal target. RBI's redressal
requirement is that a *named, reachable* officer is published, so inventing one
would be worse than publishing none — a merchant would call a dead number believing
they had escalated. `CONTACTS_ARE_PLACEHOLDERS` is therefore `true`, the screen
renders a warning while it stays true, and `supportContacts.test.ts` asserts the flag
and the values move together so the warning can neither be dropped early nor outlive
the fake numbers. The email uses the RFC 2606 `.invalid` TLD so it cannot reach
someone else's inbox.

**Settings offers no theme toggle and no announcement volume slider.** Both are
listed in §6.16, and both would have been switches wired to nothing. `expo-speech`
exposes no volume — the announcement follows device media volume, which the screen
states instead. Dark mode is not a toggle either: `theme/colors.ts` is a static
palette imported directly by ~40 files, so it needs a second palette, a context to
thread it, and re-verification of every §13 contrast ratio. The
`audioConfirmation.volume` field stays in the model for the pre-recorded-clip path
that could honour it. Biometrics are shown read-only for the same reason — the OS
owns enrolment, there is nothing for the app to switch.

**A bank-account change is not an ordinary profile edit.** Redirecting the
settlement account redirects every future rupee, so §6.14's MFA requirement is
implemented literally: the form holds its values, `ReauthSheet` gates them, and the
mutation runs only from the sheet's success callback. The penny drop re-runs and the
raw account number is never stored — a test asserts it appears nowhere in the
merchant object. Ordinary business details save directly. PAN and mobile are
read-only: PAN is bound to the KYC record and the mobile is the login identity, so
an editable box that silently failed would be worse than no box.

**Staff gets a `PATCH` the PRD's endpoint table omits.** §6.15 asks for "edit role"
while §9 lists only GET/POST/DELETE. Remove-and-re-add would churn the member's id
and detach any activity attributed to them, so `PATCH /staff/{id}` was added.
Duplicate mobiles return 409 with `details.field`, which the screen attaches to the
input rather than a banner — the merchant's next action is to fix that one box.
Staff writes are blocked offline rather than queued: these are authorisation
changes, and deferring "remove the cashier" would leave a dismissed employee able to
collect until the phone found signal.

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
