-- migrate:up

CREATE SCHEMA finance;

-- Where money really is. Balances are derived, never stored (ADR 0011).
CREATE TABLE finance.accounts (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL
                  CHECK (type IN ('cash', 'bank', 'credit_card', 'stored_value', 'gift_card')),
  currency        core.currency_code NOT NULL DEFAULT 'TWD',
  -- May be negative, e.g. a credit card that starts with debt.
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX accounts_name_unique ON finance.accounts (name) WHERE deleted_at IS NULL;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.accounts
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Optional category tree, independent of the budget plan.
CREATE TABLE finance.categories (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  parent_id  UUID REFERENCES finance.categories (id),
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (parent_id <> id)
);
CREATE UNIQUE INDEX categories_name_unique ON finance.categories (parent_id, name)
  NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE INDEX categories_parent_id ON finance.categories (parent_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.categories
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP SCHEMA finance CASCADE;
