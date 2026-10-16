# Contributing / Development Workflow

## Branches

| Branch | Purpose | Updated by |
|---|---|---|
| `main` | Release-ready code | PR from `develop` only |
| `develop` | Integration branch | PRs from work branches |
| `feat/<name>` | New features | Direct commits |
| `fix/<name>` | Bug fixes | Direct commits |
| `docs/<name>`, `chore/<name>` | Docs or tooling only | Direct commits |

Use short kebab-case names that mention the module where relevant, e.g. `feat/finance-schema`, `feat/finance-record-form`.

## Flow

```bash
git checkout develop && git pull
git checkout -b feat/<name>
# ...work, commit...
git push -u origin feat/<name>
# Open a PR: feat/<name> → develop. Merge after review.

# Releasing:
# Open a PR: develop → main.
```

- Never commit directly to `main` or `develop`, and never force-push them.
- Delete work branches after they are merged.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

feat(finance): add budget transfer endpoint
fix(web): correct rollover display on week boundary
docs(finance): update requirements for multi-currency
chore: bump Nx
```

- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`.
- **Scopes:** a module (`finance`) or a project (`web`, `api`, `shared-utils`, …).

## Pull requests

Each PR description should say:

- what changed and why
- links to the requirement or ADR it relates to
- how it was tested

Update [docs/roadmap.md](docs/roadmap.md) in the same PR when a milestone moves.

## Line endings

[.gitattributes](.gitattributes) makes git store LF line endings. On Windows, leave `core.autocrlf` unset or set it to `false`, so git doesn't fight `.gitattributes`.
