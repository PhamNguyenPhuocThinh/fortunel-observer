# Project Roadmap

Living document. Each phase's checklist is the source of truth for what "done" means at that stage.

**Last reviewed:** 2026-05-26

## Phase status legend

- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[-]` — Cut from scope (note why inline)

---

## Phase A — Backend Core (Week 1-4)

Goal: deployable REST API on Workers with auth, CRUD, OpenAPI, rate limit.

### Repo + tooling
- [x] Monorepo skeleton (Turborepo + pnpm workspaces)
- [x] `infra/dev/docker-compose.yml` (Postgres + TimescaleDB + Adminer)
- [x] `.env.example` + secrets discipline (.gitignore)
- [x] CI: `ci-ts.yml` skeleton (lint, typecheck, test)
- [ ] CI: `ci-python.yml` skeleton (deferred until Phase D)
- [ ] Pre-commit hook (`lefthook` or `husky` + `lint-staged`)
- [ ] `packages/config/` — shared eslint + tsconfig + prettier

### API foundation
- [ ] `apps/api` Hono + `@hono/zod-openapi` scaffold
- [ ] Scalar UI at `/docs`, OpenAPI at `/openapi.json`
- [ ] `apps/api/wrangler.toml` with dev/staging/prod envs
- [ ] Healthcheck `/healthz` (db ping)
- [ ] Structured logging middleware (pino-style JSON)
- [ ] Error middleware (RFC 7807 envelope)
- [ ] Sentry integration

### Data layer
- [ ] `packages/db` Drizzle schema for User, ApiKey, Project, Post, ContactMessage
- [ ] Drizzle migrations setup + initial migration committed
- [ ] Neon staging + prod branches provisioned
- [ ] `@neondatabase/serverless` driver wired

### Auth
- [ ] Better Auth setup (email/password + GitHub OAuth)
- [ ] API key issuance (`POST /v1/api-keys`) — argon2 hashed at rest
- [ ] Auth middleware (session) + API key middleware (bearer)
- [ ] Scope enforcement on protected routes

### Resource CRUD
- [ ] Users (read self, update self, list — admin only)
- [ ] Projects (full CRUD, owner-scoped)
- [ ] Posts (full CRUD, draft/published states)
- [ ] ContactMessages (POST public, list owner-only)

### Cross-cutting
- [ ] Rate limit middleware (Cloudflare KV, 100 req/min/key)
- [ ] CORS middleware (env-driven whitelist)
- [ ] Cursor pagination helper
- [ ] Field selection (`?fields=`) + expand (`?expand=`) helpers

### Tests
- [ ] Unit tests for repositories (Docker Postgres in CI)
- [ ] Integration tests for at least one full route (Posts CRUD)
- [ ] Coverage gate: 70% on `src/repositories/` and `src/middleware/`

### Deploy
- [ ] Deploy to Workers staging via Actions on `main` push
- [ ] Deploy to Workers prod via manual workflow_dispatch
- [ ] Smoke test workflow runs post-deploy

---

## Phase A.5 — Knowledge Layer (parallel with A)

Goal: structural scaffold for the AI content pipeline; no execution yet.

- [ ] `packages/knowledge/` directories: `strategies/`, `trade-journals/`, `concepts/`, `performance/`
- [ ] `packages/knowledge/README.md` — schema and conventions
- [ ] Zod frontmatter schemas per artifact type
- [ ] `apps/api/scripts/generate-llms-txt.ts` — derive `docs/llms.txt` from OpenAPI
- [ ] `docs/ai-content-guide.md` populated with examples (3-5 reference posts)
- [ ] `content/templates/` — at least 3 templates (long-form post, weekly digest, retro)

---

## Phase B — Agent Surface (Week 5)

Goal: agents are first-class citizens.

- [ ] `apps/mcp-server` standalone package
- [ ] MCP tools wrap REST endpoints via shared repositories
- [ ] stdio transport (for desktop clients)
- [ ] HTTP/SSE transport mounted at `/mcp` on API (for cloud clients)
- [ ] `docs/llms.txt` validates against [llmstxt.org](https://llmstxt.org)
- [ ] `docs/llms-full.txt` expanded reference
- [ ] `/agent.md` route with worked usage examples
- [ ] Scoped API key permissions enforced in MCP and REST
- [ ] Webhook subscribe / unsubscribe / list endpoints
- [ ] Webhook delivery with HMAC signing + retry queue

---

## Phase C — Frontend (Week 6-8)

Goal: live personal brand site backed entirely by the API.

- [ ] `apps/web` Astro 5 + React islands + Tailwind v4 + shadcn/ui
- [ ] Pages: `/`, `/about`, `/work`, `/blog`, `/blog/[slug]`, `/contact`
- [ ] All data via `PUBLIC_API_URL` fetch — no DB import in web
- [ ] Better Auth client SDK for owner-only routes (e.g. `/dashboard` stub)
- [ ] Contact form posts to `POST /v1/contact`
- [ ] Dark mode toggle persisted via `localStorage`
- [ ] Responsive at 320 px, 768 px, 1280 px breakpoints
- [ ] AA accessibility (verified with axe + manual keyboard nav)
- [ ] RSS feed at `/feed.xml`
- [ ] Sitemap at `/sitemap.xml`
- [ ] Cloudflare Web Analytics token wired
- [ ] Custom domain on Cloudflare Pages

---

## Phase D — Trading Bot + DB Migration (Month 2-3)

Goal: VPS-hosted Docker stack with bot running signals, DB migrated off Neon.

### Infrastructure
- [ ] VPS provisioned (Hetzner CX22 SG/HK)
- [ ] `infra/prod-vps/docker-compose.yml` deployed (Postgres + TimescaleDB + Redis + Caddy + Bot)
- [ ] Caddy auto-TLS for `api.fortunel.dev` reverse proxy targets
- [ ] Cloudflare Hyperdrive binding active for Workers → VPS Postgres
- [ ] `pg-backup.sh` cron daily 03:00 → encrypted (age) → R2
- [ ] Restore drill runbook + first successful drill
- [ ] Netdata installed and accessible behind Caddy auth

### DB migration
- [ ] Schema parity verified (Neon vs VPS)
- [ ] Dry-run migration with `pg_dump | psql` on staging
- [ ] Cutover runbook executed (see `infra/migration/neon-to-vps.md`)
- [ ] TimescaleDB extension enabled
- [ ] `candle` hypertable created with chunk policy

### Bot
- [ ] `apps/bot` Python skeleton (uv + ruff + pytest)
- [ ] Dockerfile multi-stage build
- [ ] `ccxt` adapter for chosen exchange
- [ ] OHLCV ingestion writes to `candle` hypertable
- [ ] One strategy implemented + backtested via `vectorbt`
- [ ] Signal-only mode (no live orders)
- [ ] Bot posts signals to `POST /v1/signals` via API key
- [ ] Telegram notifier
- [ ] Bot emits `trade-journal` artifacts to `packages/knowledge/trade-journals/`
- [ ] `/app` dashboard React island showing recent signals

---

## Phase E — Content Pipeline (Month 3+)

Goal: AI-assisted weekly content generated from `packages/knowledge/`.

- [ ] Cron job (Cloudflare Cron Trigger) weekly Saturday 09:00
- [ ] Draft generator reads knowledge artifacts + templates + `docs/ai-content-guide.md`
- [ ] Drafts saved to `content/drafts/YYYY-MM-DD-<slug>.md`
- [ ] Editor UI for human review (Astro + Better Auth)
- [ ] Publish flow moves draft → `content/blog/` → `POST /v1/posts`
- [ ] RSS auto-refreshes; webhook fires `post.published`

---

## Open product questions

Cross-link with `docs/project-overview-pdr.md` §"Open product questions". Resolve as decisions are made:

- [ ] Domain name?
- [ ] Pillar topics for blog?
- [ ] Target exchange?
- [ ] Site language(s)?  → English (decided 2026-05-26)
- [ ] Email service? → Resend (decided 2026-05-26)
- [ ] Telegram bot username?
- [ ] VPS provider? → Hetzner preferred (deployment-guide.md)
- [ ] VPS region?

---

## Recent history

- **2026-05-26** — Scaffolding committed. Docs, infra, CI, workspace stubs in place. Phase A planning to follow.
