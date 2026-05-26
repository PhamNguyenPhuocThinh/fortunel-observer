# Project Changelog

All notable changes to `fortunel-observer`. Newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning starts at `0.1.0`; bump major on breaking API changes (`/v2`).

---

## [Unreleased]

### Added
- **Phase A.1 — Workspace bootstrap (2026-05-26):** `@fortunel/config` now ships real shared configs — ESLint flat (`base`, `workers`), tsconfig (`base`, `workers`, `node`), Prettier, and a staged `vitest.base.ts`. Every TS workspace (`apps/{api,web,mcp-server}`, `packages/{db,shared-types}`) extends the shared tsconfig, re-exports the shared ESLint config, and declares `@fortunel/config` as a workspace dep. `pnpm install / lint / typecheck / test` all run real commands (echo only on the config package itself). Root `.npmrc` adopts `shamefully-hoist=true` so tooling (eslint, typescript-eslint, vitest, prettier) lives once at the repo root.
- Smoke test at `apps/api/src/__tests__/smoke.test.ts` (2 assertions) so `pnpm test` exercises the real Vitest path.
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
