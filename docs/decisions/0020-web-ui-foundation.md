# 0020. Web UI foundation: Angular Material, i18n, app structure

- Status: Accepted
- Date: 2026-10-07

## Context

Phase 5 builds the Angular PWA. Every screen needs the same building blocks: form controls, dialogs, date pickers, a navigation shell, and money and date display. The owner mainly uses the app on a phone. The UI is in English for now, but other languages may follow.

## Decision

**Components and theme**

- **Angular Material** (with the CDK) supplies components and theming. The theme is Material 3, set once with `mat.theme()` in `styles.scss`, and it follows the system light or dark mode. Custom styles use the `--mat-sys-*` tokens, never hard-coded colours.
- The layout is mobile first: a top app bar and a bottom navigation bar with Home, Records, Budget, Review and Accounts. Record entry opens in a dialog, which is full screen on narrow screens.

**i18n**

- **`@angular/localize` from day one.** Template text uses `i18n` attributes and code uses `$localize`, so no user-facing string is hard-coded outside them. The source locale is `en-US`, and it is the only one built for now.
- `pnpm nx run web:extract-i18n` writes `apps/web/src/locale/messages.xlf`. Re-run it after changing UI text and commit the file. Adding a language means adding a translation file and a `locales` entry, with no code changes.
- Numbers and dates are formatted with the app's `LOCALE_ID`, never a fixed format.

**Structure**

- Screens live in `app/finance/<feature>/` and are lazy-loaded per route. API calls live in `app/finance/data/`, one service per resource, typed with `@selah/api-client` ([0015](0015-api-client-generation.md)). Components read data through signals (`httpResource`) and call service methods for writes.
- Forms use typed reactive forms. New rows get client-generated UUIDs (`crypto.randomUUID()`, [0017](0017-api-conventions.md)).
- Problem Details errors ([0017](0017-api-conventions.md)) appear on the matching form fields when `errors` names them, and in a snack bar otherwise.

**Money and dates**

- Money stays a decimal string from the API to the screen ([0006](0006-money-representation.md)). Display passes the string to `Intl.NumberFormat`, which formats decimal strings exactly, with the currency's decimals from `displayDecimals()`. Any arithmetic (sums, FX) goes through `libs/shared-utils`.
- "Today" is the device's local calendar date ([0014](0014-record-dates-and-adjustments.md)), from one helper, so tests can fix it.

## Consequences

- Material components are accessible and work well on phones (dialogs, date pickers, touch targets) without building them. The app looks like Material unless the theme is customised further.
- Every UI string costs one `i18n` marker. In return, translating the app later is a data change.
- Material adds bundle size. The production budget (500 kB warning, 1 MB error) still applies, and feature routes are lazy-loaded to stay within it.
