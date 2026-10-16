# 0024. Settings are one resource with no id, loaded once by the web app

- Status: Accepted. The settings endpoint was replaced by the settings row in the row store ([0029](0029-generic-row-store-and-two-builds.md)).
- Date: 2026-10-14

## Context

The week start day and the default currency are app-wide settings (requirements §4). The `core.settings` table already keeps a single live row ([0003](0003-schema-per-module.md), [0007](0007-offline-ready-data-conventions.md)). The API conventions ([0017](0017-api-conventions.md)) are written for collections: `PUT /{resource}/{id}` with a client-generated id. A single row doesn't fit that shape. Also, several forms need the default currency, and the settings screen has only two plain choices.

## Decision

**API**

- `GET /api/v1/core/settings` returns `{ weekStartDay, defaultCurrency, updatedAt }`. Until the settings are first saved, it returns the defaults (Monday, TWD) with `updatedAt: null`, so a fresh database needs no seed row.
- `PUT /api/v1/core/settings` replaces every setting and returns `200` with the result. There is no id in the route, no `201`, and no `DELETE`. The row is written with one `INSERT … ON CONFLICT` on the single-row index, so a retry or two devices saving at once never creates a second row.
- The routes sit under `core`, like the table, and the code is in `apps/api/src/core/`. Finance reads the week start straight from the table, as before.
- `weekStartDay` is an ISO day (1 = Monday … 7 = Sunday). `ISO_WEEKDAYS` in `libs/shared-types` lists the values.

**Web**

- `AppSettings` (a root service) holds the settings in a signal. The shell loads them once at start, so forms read the default currency without a request of their own. The defaults apply until the settings arrive or if loading fails.
- New accounts and new income or expense entries start in the default currency. An entry falls back to the account's currency when the account can't take the default ([0016](0016-record-currency-and-account-currency.md)). Budgets, reports and batch entry stay in TWD.
- `/settings` (a link on the home masthead) is a screen, not a form. The two settings are selects that **save as soon as they change**, with a "Settings saved." toast. A failed save puts the stored value back. The selects are disabled until the stored settings are known, so a save can't overwrite them with the defaults. This is the "small choices with no typed input" case in [0022](0022-forms-are-routes.md).
- The same screen lists the category tree. Categories open as form routes: `/settings/categories/new?parent=` and `/settings/categories/:id`.

## Consequences

- One small, documented exception to the PUT-by-id rule. The .NET port maps it to a plain `GET` and `PUT` on one route.
- The settings are read once per app start. A change made on another device shows after a reload, which is enough for a single user.
- A later setting adds one field to both DTOs and one row to the screen.
