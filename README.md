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
| 5 | Collect payment (static/dynamic QR, status, success + audio) | ⬜ Navigable placeholder |
| 6 | Transactions list + detail + refund | ⬜ Navigable placeholder |
| 7 | Settlements list + detail | ⬜ Navigable placeholder |
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
npm test              # 52 tests
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
