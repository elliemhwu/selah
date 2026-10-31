-- migrate:up

-- The Planner module (docs/selah-planner-framework.md, ADR 0033). A task is a
-- living plan; its records are what actually happened along the way. Status,
-- slipped, overdue and a queue's next task are calculated, never stored
-- (ADR 0011). Plans and due dates are calendar days (DATE); moments are
-- TIMESTAMPTZ.
CREATE SCHEMA planner;

-- A life domain: 工作, 學習, 信仰.
CREATE TABLE planner.areas (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  position    DOUBLE PRECISION NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.areas
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- An optional layer between an area and its projects, such as a job. Groups can nest.
CREATE TABLE planner.project_groups (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  area_id         UUID NOT NULL REFERENCES planner.areas (id),
  parent_group_id UUID REFERENCES planner.project_groups (id),
  name            TEXT NOT NULL CHECK (btrim(name) <> ''),
  position        DOUBLE PRECISION NOT NULL,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX project_groups_area_id ON planner.project_groups (area_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.project_groups
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- A container of tasks. A queue's tasks are done in order and never get a plan.
CREATE TABLE planner.projects (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  area_id     UUID NOT NULL REFERENCES planner.areas (id),
  group_id    UUID REFERENCES planner.project_groups (id),
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  mode        TEXT NOT NULL DEFAULT 'list' CHECK (mode IN ('list', 'queue')),
  position    DOUBLE PRECISION NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX projects_area_id ON planner.projects (area_id);
CREATE INDEX projects_group_id ON planner.projects (group_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.projects
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- A task. No project means the Inbox. The plan is a day, a week (its first
-- day) or a month (its 1st); "later" means unplanned on purpose.
CREATE TABLE planner.tasks (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  project_id     UUID REFERENCES planner.projects (id),
  title          TEXT NOT NULL CHECK (btrim(title) <> ''),
  notes          TEXT,
  position       DOUBLE PRECISION NOT NULL,
  due_date       DATE,
  plan_start     DATE,
  plan_grain     TEXT CHECK (plan_grain IN ('day', 'week', 'month')),
  later          BOOLEAN NOT NULL DEFAULT false,
  prioritized_on DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT tasks_plan_whole CHECK ((plan_start IS NULL) = (plan_grain IS NULL)),
  CONSTRAINT tasks_later_unplanned CHECK (NOT (later AND plan_start IS NOT NULL))
);
CREATE INDEX tasks_project_id ON planner.tasks (project_id);
CREATE INDEX tasks_plan_start ON planner.tasks (plan_start);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.tasks
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- A Study-now block: queues and tasks worked through from one start time.
CREATE TABLE planner.sessions (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT sessions_ends_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.sessions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- What a session draws from: a queue ("its next task") or one task.
CREATE TABLE planner.session_items (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  session_id UUID NOT NULL REFERENCES planner.sessions (id),
  project_id UUID REFERENCES planner.projects (id),
  task_id    UUID REFERENCES planner.tasks (id),
  position   DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT session_items_one_source CHECK (num_nonnulls(project_id, task_id) = 1)
);
CREATE INDEX session_items_session_id ON planner.session_items (session_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.session_items
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- What happened to a task: worked on it, done, or let go. occurred_on is the
-- local day; occurred_at is null when only the day is known ("done yesterday").
CREATE TABLE planner.task_records (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  task_id     UUID NOT NULL REFERENCES planner.tasks (id),
  kind        TEXT NOT NULL CHECK (kind IN ('worked_on', 'done', 'let_go')),
  occurred_on DATE NOT NULL,
  occurred_at TIMESTAMPTZ,
  session_id  UUID REFERENCES planner.sessions (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX task_records_task_id ON planner.task_records (task_id);
-- A task ends at most once: one live done or let-go record.
CREATE UNIQUE INDEX task_records_one_outcome ON planner.task_records (task_id)
  WHERE kind <> 'worked_on' AND deleted_at IS NULL;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.task_records
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Append-only history of plan changes and record corrections, for reflecting
-- later. Values are short text: '2026-11-04/day', 'later', a date, or null.
CREATE TABLE planner.change_log (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  entity     TEXT NOT NULL CHECK (entity IN ('task', 'task_record')),
  entity_id  UUID NOT NULL,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX change_log_entity_id ON planner.change_log (entity_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planner.change_log
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- migrate:down

DROP SCHEMA planner CASCADE;
