# 0009. Git workflow: `feat/*` → `develop` → `main`

- Status: Accepted
- Date: 2026-10-05

## Context
The owner develops on more than one device and wants a reviewable history.

## Decision
- `main` holds release-ready code. `develop` is the integration branch.
- Each change gets its own `feat/` branch (or `fix/`, `docs/`, `chore/`), created from `develop`.
- Merges go through **GitHub PRs**: work branch → `develop`, then `develop` → `main`.
- Commit messages follow Conventional Commits.
- Line endings are normalized to LF through `.gitattributes`.

Details are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Consequences
- Before switching devices, push your work branch. Work-in-progress commits on `feat/*` are fine.
- AI assistants must not push, open PRs or merge without asking first.
