-- migrate:up

-- Plan versioning with stable item identity (ADR 0012).
-- Budget figures are always whole TWD (ADR 0006).

CREATE TABLE finance.budget_plan_versions (
  id                   UUID PRIMARY KEY DEFAULT uuidv7(),
  -- First day of the month the version takes effect.
  effective_from_month DATE NOT NULL CHECK (EXTRACT(DAY FROM effective_from_month) = 1),
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE UNIQUE INDEX budget_plan_versions_month_unique
  ON finance.budget_plan_versions (effective_from_month) WHERE deleted_at IS NULL;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_plan_versions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Stable identity. Record lines point here, never at a version.
CREATE TABLE finance.budget_items (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  -- Fixed for the item's lifetime; moving sections means a new item.
  section    TEXT NOT NULL
             CHECK (section IN ('income', 'government', 'offering', 'saving', 'expense')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_items
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- An item as it is in one plan version. No row = not in that version.
CREATE TABLE finance.budget_item_versions (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  plan_version_id  UUID NOT NULL REFERENCES finance.budget_plan_versions (id),
  budget_item_id   UUID NOT NULL REFERENCES finance.budget_items (id),
  name             TEXT NOT NULL,
  -- Parent within this version's tree (stable id).
  parent_item_id   UUID REFERENCES finance.budget_items (id),

  cadence          TEXT NOT NULL
                   CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly', 'one_time')),
  cadence_month    SMALLINT CHECK (cadence_month BETWEEN 1 AND 12),
  cadence_date     DATE,

  -- Only the anchored value is stored; the other is calculated.
  anchor           TEXT NOT NULL CHECK (anchor IN ('amount', 'percent')),
  amount           NUMERIC(14,2) CHECK (amount >= 0 AND amount = trunc(amount)),
  -- Percentage points, e.g. 12.5 = 12.5%.
  percent          NUMERIC(7,4) CHECK (percent >= 0 AND percent <= 100),
  percent_base     TEXT NOT NULL DEFAULT 'net_income'
                   CHECK (percent_base IN ('net_income', 'gross_income')),

  -- Rollover (requirements §3.1).
  rollover         BOOLEAN NOT NULL DEFAULT false,
  reset_cycle      TEXT CHECK (reset_cycle IN ('never', 'week', 'month', 'year')),
  on_reset         TEXT CHECK (on_reset IN ('drop', 'carry')),
  carry_to_item_id UUID REFERENCES finance.budget_items (id),

  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,

  CHECK (parent_item_id <> budget_item_id),
  CHECK ((cadence = 'yearly') = (cadence_month IS NOT NULL)),
  CHECK ((cadence = 'one_time') = (cadence_date IS NOT NULL)),
  CHECK (
    (anchor = 'amount'  AND amount  IS NOT NULL AND percent IS NULL) OR
    (anchor = 'percent' AND percent IS NOT NULL AND amount  IS NULL)
  ),
  CHECK (
    (NOT rollover AND reset_cycle IS NULL AND on_reset IS NULL) OR
    (rollover AND reset_cycle = 'never' AND on_reset IS NULL) OR
    (rollover AND reset_cycle <> 'never' AND on_reset IS NOT NULL)
  ),
  CHECK ((on_reset IS NOT DISTINCT FROM 'carry') = (carry_to_item_id IS NOT NULL)),
  CHECK (carry_to_item_id <> budget_item_id)
);
CREATE UNIQUE INDEX budget_item_versions_unique
  ON finance.budget_item_versions (plan_version_id, budget_item_id) WHERE deleted_at IS NULL;
CREATE INDEX budget_item_versions_budget_item_id ON finance.budget_item_versions (budget_item_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_item_versions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- A different amount for one specific month.
CREATE TABLE finance.budget_item_overrides (
  id                     UUID PRIMARY KEY DEFAULT uuidv7(),
  budget_item_version_id UUID NOT NULL REFERENCES finance.budget_item_versions (id),
  month                  DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  amount                 NUMERIC(14,2) NOT NULL CHECK (amount >= 0 AND amount = trunc(amount)),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);
CREATE UNIQUE INDEX budget_item_overrides_unique
  ON finance.budget_item_overrides (budget_item_version_id, month) WHERE deleted_at IS NULL;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_item_overrides
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP TABLE finance.budget_item_overrides;
DROP TABLE finance.budget_item_versions;
DROP TABLE finance.budget_items;
DROP TABLE finance.budget_plan_versions;
