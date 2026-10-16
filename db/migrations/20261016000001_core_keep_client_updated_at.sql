-- migrate:up

-- The app sets updated_at itself when it changes a row, and the row store
-- (ADR 0029) saves that value as it is. Only stamp now() when an update
-- leaves updated_at unchanged, such as a line or plan item replaced with its
-- record or version.
CREATE OR REPLACE FUNCTION core.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION core.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
