# Selah

A personal life management PWA, built module by module. The first module is **Finance**: budget planning, accounts and expense/income tracking.

> **Status:** requirements done, workspace not scaffolded yet. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout (planned)

```
apps/
  web/              Angular PWA
  api/              NestJS API (OpenAPI/Swagger; to be migrated to .NET later)
libs/
  shared-types/     DTOs and enums shared by web and api
  shared-utils/     Finance math as pure functions
  api-client/       HTTP client for the API
db/
  migrations/       SQL migrations (one Postgres schema per module)
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

| Tool | Version | Windows (winget) | Notes |
|---|---|---|---|
| Git | latest | `winget install Git.Git` | |
| Node.js | 24 LTS | `winget install OpenJS.NodeJS.LTS` | The exact version will be pinned in `.nvmrc` |
| pnpm | 10+ | `corepack enable` (bundled with Node 24) | Fallback: `npm i -g pnpm` |
| Docker Desktop | latest | `winget install Docker.DockerDesktop` | Runs PostgreSQL locally |
| GitHub CLI | latest | `winget install GitHub.cli` | Optional; used for PRs from the terminal |
| VS Code | latest | `winget install Microsoft.VisualStudioCode` | Recommended extensions will be listed in `.vscode/extensions.json` |

> The pnpm and Docker choices are *Proposed* in [ADR 0010](docs/decisions/0010-tooling-pnpm-docker.md). Update this table if that decision changes.

### 2. Clone the repo and configure git

```bash
git config --global user.name "Ellie Wu"
git config --global user.email "elliemhwu@gmail.com"

git clone <repo-url> selah
cd selah
git checkout develop
```

### 3. Run the app

> These steps only work after the workspace scaffold (roadmap phase 1). They describe the intended setup, and should be updated if the scaffold differs.

```bash
pnpm install                 # install dependencies
cp .env.example .env         # local config; never commit .env
docker compose up -d         # start PostgreSQL
pnpm db:migrate              # apply SQL migrations
pnpm nx serve api            # API + Swagger UI at http://localhost:3000/api/docs
pnpm nx serve web            # web app at http://localhost:4200
```

### 4. Working with Claude Code on a new machine

Claude Code's personal memory is stored per machine and **does not sync**. Everything a new session needs must be in the repo:

- [CLAUDE.md](CLAUDE.md): loaded automatically
- [docs/roadmap.md](docs/roadmap.md): where we left off
- [docs/decisions/](docs/decisions/): why things are the way they are

Before switching machines, commit and push your work branch.
