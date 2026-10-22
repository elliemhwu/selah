-- migrate:up

-- The Journal module (docs/selah-journal-framework.md, ADR 0030). Content
-- tables link to each other directly; there is no hub table. Bodies live
-- only in their own column, with no derived copies, so they can be
-- encrypted later.
CREATE SCHEMA journal;

-- What actually happened: a life event that journals, comments and photos gather around.
CREATE TABLE journal.moments (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  date       DATE NOT NULL,
  title      TEXT NOT NULL CHECK (btrim(title) <> ''),
  summary    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX moments_date ON journal.moments (date);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON journal.moments
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- The raw writing. Many journals can belong to one moment, or to none.
CREATE TABLE journal.journals (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  moment_id      UUID REFERENCES journal.moments (id),
  written_at     TIMESTAMPTZ NOT NULL,
  -- How sure written_at is, for imported entries with guessed dates.
  date_precision TEXT NOT NULL DEFAULT 'day'
                 CHECK (date_precision IN ('day', 'month', 'season', 'year')),
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX journals_moment_id ON journal.journals (moment_id);
CREATE INDEX journals_written_at ON journal.journals (written_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON journal.journals
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- A later reply to a journal or to a moment, in one table so a year's
-- replies are one query.
CREATE TABLE journal.comments (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  journal_id UUID REFERENCES journal.journals (id),
  moment_id  UUID REFERENCES journal.moments (id),
  written_at TIMESTAMPTZ NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT comments_one_target CHECK (num_nonnulls(journal_id, moment_id) = 1)
);
CREATE INDEX comments_journal_id ON journal.comments (journal_id);
CREATE INDEX comments_moment_id ON journal.comments (moment_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON journal.comments
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- What God would say to a journal, with an optional verse.
CREATE TABLE journal.god_notes (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  journal_id UUID NOT NULL REFERENCES journal.journals (id),
  written_at TIMESTAMPTZ NOT NULL,
  body       TEXT NOT NULL,
  verse_ref  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX god_notes_journal_id ON journal.god_notes (journal_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON journal.god_notes
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP SCHEMA journal CASCADE;
