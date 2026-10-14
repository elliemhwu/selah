-- migrate:up

CREATE SCHEMA core;

-- Keeps updated_at current on every table (ADR 0007).
CREATE FUNCTION core.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Supported currencies (ADR 0006).
CREATE DOMAIN core.currency_code AS CHAR(3)
  CHECK (VALUE IN ('TWD', 'JPY', 'EUR', 'GBP', 'USD'));

-- App-wide settings. A single live row.
CREATE TABLE core.settings (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  -- ISO day of week: 1 = Monday … 7 = Sunday
  week_start_day   SMALLINT NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 1 AND 7),
  default_currency core.currency_code NOT NULL DEFAULT 'TWD',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX settings_single_row ON core.settings ((true)) WHERE deleted_at IS NULL;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.settings
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP SCHEMA core CASCADE;
