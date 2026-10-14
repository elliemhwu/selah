-- migrate:up

-- Records with lines (ADR 0013), dates and adjustments (ADR 0014).
CREATE TABLE finance.records (
  id                 UUID PRIMARY KEY DEFAULT uuidv7(),
  type               TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'adjustment')),
  -- Local wall-clock date and optional time, no time zone (ADR 0014).
  occurred_on        DATE NOT NULL,
  occurred_at        TIME,
  account_id         UUID NOT NULL REFERENCES finance.accounts (id),
  currency           core.currency_code NOT NULL DEFAULT 'TWD',
  -- Transfer only: the receiving account and the amount it receives.
  counter_account_id UUID REFERENCES finance.accounts (id),
  counter_amount     NUMERIC(14,2) CHECK (counter_amount > 0),
  -- Adjustment only: the balance the user entered. May be negative.
  target_balance     NUMERIC(14,2),
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,

  CHECK ((type = 'transfer') = (counter_account_id IS NOT NULL)),
  CHECK ((type = 'transfer') = (counter_amount IS NOT NULL)),
  CHECK (counter_account_id <> account_id),
  CHECK ((type = 'adjustment') = (target_balance IS NOT NULL))
);
CREATE INDEX records_occurred_on ON finance.records (occurred_on);
CREATE INDEX records_account_id ON finance.records (account_id);
CREATE INDEX records_counter_account_id ON finance.records (counter_account_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.records
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Amounts are always positive; the record type decides the direction.
-- Adjustments have no lines (ADR 0014).
CREATE TABLE finance.record_lines (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  record_id      UUID NOT NULL REFERENCES finance.records (id),
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  -- Always filled, so reports can sum one column. Equals amount for TWD.
  twd_amount     NUMERIC(14,2) NOT NULL CHECK (twd_amount > 0 AND twd_amount = trunc(twd_amount)),
  -- NULL for TWD records.
  fx_rate        NUMERIC(18,8) CHECK (fx_rate > 0),
  category_id    UUID REFERENCES finance.categories (id),
  budget_item_id UUID REFERENCES finance.budget_items (id),
  note           TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  CHECK (fx_rate IS NOT NULL OR twd_amount = amount)
);
CREATE INDEX record_lines_record_id ON finance.record_lines (record_id);
CREATE INDEX record_lines_category_id ON finance.record_lines (category_id);
CREATE INDEX record_lines_budget_item_id ON finance.record_lines (budget_item_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.record_lines
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Moves budget between items; never touches accounts (requirements §3.2).
-- 'reset' rows are computed in the MVP and only persisted by Close Week (beta).
CREATE TABLE finance.budget_transfers (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  kind         TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'reset')),
  occurred_on  DATE NOT NULL,
  occurred_at  TIME,
  from_item_id UUID NOT NULL REFERENCES finance.budget_items (id),
  -- NULL only for a reset that drops the leftover.
  to_item_id   UUID REFERENCES finance.budget_items (id),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  CHECK (to_item_id IS NOT NULL OR kind = 'reset'),
  CHECK (to_item_id <> from_item_id)
);
CREATE INDEX budget_transfers_occurred_on ON finance.budget_transfers (occurred_on);
CREATE INDEX budget_transfers_from_item_id ON finance.budget_transfers (from_item_id);
CREATE INDEX budget_transfers_to_item_id ON finance.budget_transfers (to_item_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_transfers
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP TABLE finance.budget_transfers;
DROP TABLE finance.record_lines;
DROP TABLE finance.records;
