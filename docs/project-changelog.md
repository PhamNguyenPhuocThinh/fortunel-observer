# Project Changelog

All notable changes to `fortunel-observer`. Newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning starts at `0.1.0`; bump major on breaking API changes (`/v2`).

---

## [Unreleased]

### Added
- Initial monorepo scaffolding (Turborepo + pnpm workspaces).
- `docs/` baseline: PDR, architecture, API design, code standards, deployment guide, roadmap, AI content guide, `llms.txt`, `llms-full.txt`.
- `infra/dev/` Docker Compose for local Postgres + TimescaleDB + Adminer.
- `infra/prod-vps/` stub: Docker Compose, Caddyfile, encrypted backup script.
- `infra/migration/neon-to-vps.md` runbook.
- GitHub Actions workflows: `ci-ts.yml`, `ci-python.yml`, `deploy.yml`.
- Workspace stubs for `apps/{api,web,mcp-server,bot}` and `packages/{db,shared-types,knowledge,config}`.
- Root configs: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`, `.gitignore`, `.editorconfig`, `.nvmrc`.

### Decisions logged
- 2026-05-26 — Site language: English.
- 2026-05-26 — Email provider: Resend.
- 2026-05-26 — Repo name kept as `fortunel-observer`.
- 2026-05-26 — VPS provider preference: Hetzner (placeholder; revisit before Phase D).

---

## [0.1.0] — TBD

Initial release once Phase A is feature-complete and deployed to prod.
