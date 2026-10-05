# Finance Module — MVP Requirements

Status: **agreed** (2026-10-05). Single user, running locally; deployment comes later.

The module separates two layers of money:

- **Account layer** — where money really is (cash, banks, cards).
- **Budget layer** — where money is meant to go (the plan and its envelopes).

A record can touch one layer or both. For example, lunch paid in cash lowers the Cash account and the Food budget, an ATM withdrawal touches accounts only, and a budget transfer touches budgets only. The **Plan → Record** pattern links the two layers.

---

## 1. Accounts

- Types: `cash`, `bank`, `credit_card`, `stored_value` (e.g. a transport card), `gift_card`.
- Each account has a currency (default TWD) and an opening balance.
- The balance is **derived**: opening balance + the sum of the account's records.
- A credit card expense counts **when you swipe**. Paying the card bill is a **transfer** from the bank to the card.

## 2. Records

| Type         | Accounts                                                                                                                         | Budget                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `income`     | + one account                                                                                                                    | links to an Income plan item |
| `expense`    | − one account                                                                                                                    | optional budget item         |
| `transfer`   | − from-account, + to-account                                                                                                     | none                         |
| `adjustment` | set the balance to an actual value; the difference is calculated ([ADR 0014](../decisions/0014-record-dates-and-adjustments.md)) | none                         |

- **Structure:** a record has one or more **lines**.
  - The record holds the shared fields: date/time, type, account(s), currency, note.
  - Each line holds amount, category, budget item and note.
  - A normal entry has one line. A split receipt has several.
  - Reports total **lines**, not records.
- **Category:** optional, from a separate category tree. When a line has no category, the UI shows its budget item instead.
- **Currency:**
  - Every record has a currency (default TWD). The UI always shows a currency button labelled `TWD` that opens the full list when tapped.
  - Supported currencies: **TWD, JPY, EUR, GBP, USD**.
  - A foreign-currency line stores its original amount **and** its TWD amount. The rate field is pre-filled with the last rate used for that currency and can be edited.
  - A record's currency must equal its account's currency, unless the account is TWD ([ADR 0016](../decisions/0016-record-currency-and-account-currency.md)).
  - Transfers store both the amount out and the amount in, so currency exchanges keep the exact rate.
  - Budgets are always in TWD.
- **Ways to enter records:**
  - **From a plan item:** amount, category and item are pre-filled; all fields stay editable.
  - **Under a budget:** only the budget item is pre-filled.
  - **Batch entry:** several records in one form, for catching up on past days.
  - **Checklist batch create:** select several plan items (parents or children); a batch form opens pre-filled with the planned amounts; adjust each line (e.g. this month's electricity bill) and save them all.

## 3. Budget plan

- **Versions:**
  - A plan has versions, each taking effect from a chosen month. Old versions are kept read-only.
  - Plans are typically revised annually, half-yearly, or when the salary structure changes.
  - Plan items keep a **stable identity across versions**, so reports can compare "Food" between versions.
- **Sections, in order:**
  1. **Income** — expected income
  2. **Government** — government insurance, income tax, health insurance, etc.
  3. _Remaining amount = the allocation base_
  4. **Offerings**, **Savings**, **Expenses**
- **Item tree:** any item may have an optional parent item. Item depth is not fixed.
- **Cadence:**
  - `daily`, `weekly`, `monthly`
  - `yearly`, in a chosen month (e.g. a year-end bonus, dividends)
  - `one_time`, on a date
  - A monthly amount can be **overridden for a specific month**.
- **Amounts:**
  - Each item is anchored to either a **fixed amount** or a **percentage of a base**.
  - In the editor, changing either field updates the other.
  - When the base changes, percentage-anchored items are recalculated and fixed items keep their amount.
  - The default base is income after government expenses; the backend supports other bases.
  - Percentages are shown mainly at section and top level. Sub-items focus on amounts.
- **Converting cadences** for monthly totals: `monthly = weekly × 52 / 12`, `daily × days in the month`.
- **Plans and records are stored independently.** They are compared only in the review views.

### 3.1 Rollover

- Rollover is set per item. When it's on, leftover or overspend carries into the next period, e.g. daily food of 185 with 150 spent leaves 210 available the next day.
- Each rollover item has:
  - a `reset_cycle`: `never` / `week` / `month` / `year`
  - an `on_reset` action: **drop** the leftover, or **carry it into** another budget item
- Example setup:
  - Daily Food: resets at week end and carries into Weekly Allowance.
  - Weekly Allowance: never resets.
  - Some monthly items also roll over.
- **The week start day** is a user setting.
- **How resets are calculated:**
  - A reset is computed by a pure function in `libs/shared-utils`, not created by a scheduled job.
  - In reports it appears as a **budget transfer of kind `reset`**, dated at the end of the period, so every leftover stays visible in reports.
  - Because resets are computed, editing a past record updates the numbers that depend on it.
  - Persisting (locking) resets is part of the Close Week beta below.

### 3.2 Budget transfers

- A budget transfer moves an amount between budget items. It **never touches accounts**.
  - Example: 500 of leftover allowance moved to Travel or Savings.
- It has a date/time and a kind: `manual`, or `reset` (computed in the MVP).
- In the form, the period defaults to the previous month.

## 4. Views

- **Home screen:**
  - What's left in every rollover budget
  - This period's **recurring checklist**: recorded / not yet recorded, with tap-to-record
  - A quick "+" button
- **Monthly review:**
  - Plan vs. actual per item: expected vs. received for income, budget vs. spent for the other sections.
  - Yearly and one-time items appear marked as such, with the yearly total and the amount so far this year.
- **Budget editor:** sections, item tree, cadence, amount/percentage, rollover settings, plan versions.
- **Records:** a list filtered by date, account, category and budget item; the entry form; batch entry.
- **Accounts:** the list with derived balances; transfers; adjustments.
- **Settings:** week start day, default currency.

## 5. Beta (after MVP)

- **Close Week / Close Month:** review the computed resets, adjust them, and persist them as `reset` transfers that lock the period.

## 6. Out of scope

Tax filing, multiple users and sharing, Moze import, investments, loans, receipt photos, live exchange rates, offline sync.

## 7. Technical notes

- **Offline-ready schema:** client-generated UUIDs, `created_at` / `updated_at` on every row, soft deletes.
- **Finance math** (rounding, percentage splits, cadence conversion, rollover and reset calculation, FX) lives in `libs/shared-utils` as pure functions, so it can be ported to C# later.
- **API:** OpenAPI/Swagger from day one, for the planned migration of `apps/api` to .NET.
