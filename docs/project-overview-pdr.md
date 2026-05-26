# Project Overview - Product Development Requirements

## What this is

`fortunel-observer` is a personal platform for a Vietnamese solopreneur to:

1. Run a personal brand site (authority, lead generation, blog).
2. Operate a personal crypto trading bot (data ingest, signal generation, eventually execution).
3. Expose every capability above as a first-class API surface — REST for humans, MCP for AI agents, webhooks for integrations.

It is **not** a SaaS for other users (yet). Single-tenant V1 with multi-tenant-ready DNA so the refactor cost stays bounded (~2-3 weeks) if a paying-customer use case appears later.

## Core philosophy

| Pillar | Rule |
|---|---|
| Agent-first | Every capability has REST + MCP entry. No UI-only features. |
| Headless | UI is one client; deleting `apps/web` must not break any feature. |
| Tenancy-ready | Every entity has `owner_id` (rename → `tenant_id` later). Repository pattern hides the join. |
| Pragmatic ownership | Managed services to ship V0 fast, self-host once stable. |
| Knowledge-as-code | Bot writes structured artifacts; AI drafts content from them; human edits and publishes. |
| YAGNI / KISS / DRY | Ship V0 before scaling. Polyglot only where it earns its keep. |

## Who uses this

| Persona | Channel | Phase |
|---|---|---|
| Owner (the solopreneur) | Web dashboard, CLI, MCP client | All |
| AI agent (Claude, custom GPT, n8n) | MCP server + REST + API key | B+ |
| Visitor | Astro web (read-only) | C+ |
| Trading bot | REST POST signals/orders | D+ |
| Future paying user | Same REST + MCP, scoped API key | (if ever) |

## Success criteria

### Phase A (Backend Core, week 1-4)
- REST API live on Cloudflare Workers, custom domain.
- OpenAPI 3.1 spec auto-generated, served at `/openapi.json`, rendered by Scalar at `/docs`.
- Auth: Better Auth (email/pass + GitHub OAuth) + API key issuance with scopes.
- CRUD for User, Project, Post, ContactMessage.
- Rate limiting via Cloudflare KV (100 req/min/key).
- All errors RFC 7807 compliant.
- p95 latency < 200 ms at the edge.
- > 70% test coverage on logic layers.

### Phase B (Agent Surface, week 5)
- MCP server with one tool per material endpoint.
- `llms.txt` and `llms-full.txt` published, validating against [llmstxt.org](https://llmstxt.org).
- `/agent.md` with worked examples.
- Webhook subscription API for events.

### Phase C (Frontend, week 6-8)
- Astro site live with `/`, `/about`, `/work`, `/blog`, `/contact`.
- Lighthouse: Performance ≥ 95, SEO 100, A11y ≥ 95.
- Dark mode, responsive, AA accessibility.
- Contact form posts to `POST /v1/contact`. No direct DB access from web.
- RSS + sitemap + Cloudflare Analytics.

### Phase D (Bot + DB Migration, month 2-3)
- VPS Docker stack (Postgres + TimescaleDB + Redis + Bot + Caddy) live.
- DB migrated Neon → VPS via Cloudflare Hyperdrive.
- Daily encrypted `pg_dump` to R2; restore drilled monthly.
- Bot ingests OHLCV via `ccxt`, backtests one strategy via `vectorbt`.
- Signal-only mode; signals posted to API; Telegram notifier active.
- Bot emits `trade-journal` artifacts to `packages/knowledge/`.

### Phase E (Content pipeline, month 3+)
- Weekly cron generates a content draft from `packages/knowledge/` + `content/templates/` guided by `docs/ai-content-guide.md`.
- Human-review editor UI for drafts.
- Publish flow from `content/blog/` to API to web.

## Non-functional requirements

| Aspect | Target |
|---|---|
| API p95 latency | < 200 ms (edge) |
| Uptime | 99% |
| Lighthouse (web) | Perf ≥ 95, SEO 100, A11y ≥ 95 |
| Test coverage | > 70% logic layers |
| DB backup RPO (D+) | ≤ 24 h |
| DB backup RTO (D+) | < 1 h |
| Budget | $0/mo phases A-C, ~$5-8/mo from D |
| Time investment | 10-15 h/week |

## Security baseline

- API keys hashed with argon2 at rest.
- HTTPS only, HSTS.
- CORS whitelist (no `*`).
- Zod validation at every endpoint boundary.
- Drizzle parameterized queries only (no string concat).
- Rate limit per API key.
- Secrets in Wrangler / Doppler / VPS `.env`; never committed.
- Phase D+: Postgres bound to internal Docker network only — public exposure only via Hyperdrive tunnel.
- Phase D+: VPS firewall (ufw) restricts inbound to 22 (key-only), 80, 443.
- Backups encrypted with `age` before R2 upload.

## Constraints

- Solo developer, 10-15 h/week.
- Budget cap as above.
- TS intermediate, Python beginner-intermediate, Docker basic, DBA beginner.
- Trading bot is **personal only** in Phase 1 (no fund management for others — legal scope).

## Out of scope (V1)

- Multi-tenant billing.
- Public sign-up for the platform.
- Mobile native apps.
- Real-money trade execution for third parties.
- AI inference inside the API (use external APIs from clients/agents).

## Open product questions

- Domain name?
- Pillar topics for blog (3-5)?
- Target exchange (Binance / Bybit / OKX)?
- VPS provider (Hetzner / Contabo / Vultr) and region (SG / HK / EU)?
- Telegram bot handle?

Track answers in `docs/project-roadmap.md` once decided.
