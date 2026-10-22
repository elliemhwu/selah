# 0031. Publish the app when a release is created, not on every merge into main

- Status: Accepted
- Date: 2026-10-22
- Changes: [0027](0027-backups-and-hosting.md) (the Pages workflow ran on every push to `main`)

## Context

Since [0027](0027-backups-and-hosting.md), every push to `main` published the app to GitHub Pages. The owner wants to try a version on a phone and a laptop for several days before calling it a release, and to choose the moment it goes out.

## Decision

**Decided by the owner (2026-10-22)**

- **Publishing a GitHub release publishes the app.** The Pages workflow runs on `release: published` and builds the release's tag. Merging `develop` into `main` no longer publishes by itself.
- Releases are tagged `vMAJOR.MINOR.PATCH` from `main`.

**Chosen during the discussion**

- The workflow refuses a tag that isn't on `main`, so a release can't publish unmerged work.
- The `github-pages` environment allows deployments from `main` and from tags matching `v*`.
- It can still be run by hand (`workflow_dispatch`) on a release tag, to publish again after a failed run.

## Consequences

- `main` can hold a merged version that isn't published yet; Pages shows the latest release.
- A release is two steps: merge `develop` into `main`, then create the release (with notes) on `main`.
