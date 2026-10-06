# Selah

A personal life management PWA, built module by module. The first module is **Finance**: budget planning, accounts and expense/income tracking.

> **Status:** workspace scaffolded and database schema in place; finance features not built yet. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout

```
apps/
  web/              Angular PWA
  api/              NestJS API (OpenAPI/Swagger; to be migrated to .NET later)
libs/
  shared-types/     DTOs and enums shared by web and api
  shared-utils/     Finance math as pure functions
  api-client/       HTTP client for the API
db/
  migrations/       SQL migrations, run by dbmate (one Postgres schema per module)
docs/               Requirements, decisions (ADRs), roadmap
```

## Documentation

- [docs/roadmap.md](docs/roadmap.md): current status and next steps
- [docs/finance/requirements.md](docs/finance/requirements.md): Finance MVP requirements
- [docs/decisions/](docs/decisions/): architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits, PRs
- [CLAUDE.md](CLAUDE.md): short project context for AI assistants

## Setting up a new machine

### 1. Install the prerequisites

| Tool           | Version | Windows (winget)                            | macOS (Homebrew)                         | Notes                                                                                |
| -------------- | ------- | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Git            | latest  | `winget install Git.Git`                    | `brew install git`                       |                                                                                      |
| Node.js        | 24 LTS  | `winget install OpenJS.NodeJS.LTS`          | `nvm install` (reads `.nvmrc`)           | Pinned in `.nvmrc` and `package.json#engines`                                        |
| pnpm           | 12      | `corepack enable`                           | `corepack enable`                        | Corepack ships with Node 24 and picks the version from `package.json#packageManager` |
| Docker Desktop | latest  | `winget install Docker.DockerDesktop`       | `brew install --cask docker`             | Runs PostgreSQL locally                                                              |
| GitHub CLI     | latest  | `winget install GitHub.cli`                 | `brew install gh`                        | Optional; used for PRs from the terminal                                             |
| VS Code        | latest  | `winget install Microsoft.VisualStudioCode` | `brew install --cask visual-studio-code` | Recommended extensions are in `.vscode/extensions.json`                              |

> The Node, pnpm and Docker choices come from [ADR 0010](docs/decisions/0010-tooling-pnpm-docker.md). Update this table if that decision changes.

### 2. Clone the repo and configure git

```bash
git config --global user.name "Ellie Wu"
git config --global user.email "elliemhwu@gmail.com"

git clone <repo-url> selah
cd selah
git checkout develop
```

### 3. Run the app

```bash
pnpm install                 # install dependencies
cp .env.example .env         # local config; never commit .env
pnpm db:up                   # start PostgreSQL 18 in Docker and wait until it's healthy
pnpm db:migrate              # apply SQL migrations (dbmate)
pnpm start                   # API on :3000 and web on :4200 (proxies /api to the API)
```

- Web app: http://localhost:4200
- Swagger UI: http://localhost:3000/api/docs
- Health check: http://localhost:4200/api/v1/health

### 4. Everyday commands

| Command                                                   | What it does                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm start`                                              | Serve the API and web app with reload                                                                                                  |
| `pnpm nx run-many -t typecheck build test lint`           | Type-check, build, test and lint everything                                                                                            |
| `pnpm nx test shared-utils`                               | Run one project's tests (watch mode in a terminal)                                                                                     |
| `pnpm db:new <name>`                                      | Create a new migration in `db/migrations/`                                                                                             |
| `pnpm db:migrate` / `pnpm db:rollback` / `pnpm db:status` | Apply, undo the last, or list migrations                                                                                               |
| `pnpm db:codegen`                                         | Regenerate the Kysely table types from the running database. Run after every migration.                                                |
| `pnpm openapi`                                            | Regenerate `apps/api/openapi.json` (the API contract) and the typed client in `libs/api-client`. Run after changing endpoints or DTOs. |
| `pnpm db:down`                                            | Stop PostgreSQL. Data stays in the Docker volume.                                                                                      |

### 5. Working with Claude Code on a new machine

Claude Code's personal memory is stored per machine and **does not sync**. Everything a new session needs must be in the repo:

- [CLAUDE.md](CLAUDE.md): loaded automatically
- [docs/roadmap.md](docs/roadmap.md): where we left off
- [docs/decisions/](docs/decisions/): why things are the way they are

Before switching machines, commit and push your work branch.
