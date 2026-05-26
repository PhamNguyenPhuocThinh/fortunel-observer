# System Architecture

## One-screen overview

```
                +-------------------+
   Visitors --->|   Astro web      |---+
                |  (Cloudflare      |   |
                |    Pages)         |   |
                +-------------------+   |
                                        |
   AI agents -->+-------------------+   |     +-------------------+
   (Claude,     |   MCP server     |---+---->|  REST API         |
    n8n, ...)   | (apps/mcp-server) |         | (Hono on          |
                +-------------------+         |  Cloudflare       |
                                              |  Workers)         |
   Bot --------> POST /v1/signals ----------->|                   |
   (Python,                                   +---------+---------+
    Docker on                                           |
    VPS, Phase D)                                       |
                                              +---------v---------+
                                              | Postgres          |
                                              | (Neon -> VPS in   |
                                              |   Phase D)        |
                                              | + TimescaleDB     |
                                              +-------------------+
```

## Layers

### 1. API (apps/api) - source of truth

- Hono on Cloudflare Workers.
- Routes: `src/routes/v1/{users,projects,posts,contact,signals,...}.ts` — one file per resource.
- Middleware: `src/middleware/{auth,api-key,rate-limit,logging,error}.ts`.
- Repositories: `src/repositories/{users,projects,...}-repo.ts` — every query goes through here. Repositories scope by `owner_id`. To go multi-tenant later, change one line per repo.
- MCP namespace: `src/mcp/{tools.ts,server.ts}` — re-uses repositories so MCP and REST never diverge.
- OpenAPI: every route declared via `@hono/zod-openapi` — spec generated, never hand-written.

### 2. Data (packages/db)

- Drizzle schema in `packages/db/src/schema/` is the single source of truth.
- Migrations via `drizzle-kit` in `packages/db/migrations/`.
- Same schema, two connection strategies:
  - Dev: Docker Postgres + TimescaleDB (`infra/dev/docker-compose.yml`).
  - Phase A-C prod: Neon via `@neondatabase/serverless`.
  - Phase D+ prod: VPS Postgres via Cloudflare Hyperdrive (TCP pool on edge).
- Workers pick the driver via `DATABASE_URL` shape detection.

### 3. Agent surface (apps/mcp-server, apps/api)

- MCP server lives in `apps/mcp-server` as a separate package so it can run two ways:
  - Local stdio for desktop clients (Claude Desktop, etc.).
  - HTTP/SSE transport mounted at `/mcp` on the API for cloud clients.
- Every MCP tool is a thin wrapper that:
  1. Validates input with the same Zod schema as the REST endpoint.
  2. Calls the same repository function the REST handler calls.
  3. Returns structured JSON (`{ data, meta, errors }`).
- `llms.txt` is auto-generated from the OpenAPI spec by `apps/api/scripts/generate-llms-txt.ts`.

### 4. Web (apps/web)

- Astro 5 + React islands + Tailwind v4 + shadcn/ui.
- Fetches data via the REST API only. The web app has no `DATABASE_URL`.
- Better Auth SDK handles session cookies; API key flow is for machines, not the web.

### 5. Bot (apps/bot)

- Python 3.12, `uv` for deps, `ruff` for lint, `pytest` for tests.
- Reads candles via `ccxt`, runs strategies via `vectorbt`, posts signals to API.
- Reads/writes to Postgres for time-series via `psycopg`, but business state writes go through REST API to keep the API authoritative.
- Pydantic v2 models generated from Zod via `packages/shared-types` (Zod → JSON Schema → Pydantic).

## Deployment matrix

| Component | Phase A-C | Phase D+ |
|---|---|---|
| API | Cloudflare Workers | Cloudflare Workers |
| Web | Cloudflare Pages | Cloudflare Pages |
| DB | Neon (managed) | Docker on VPS + Hyperdrive binding |
| Cache / KV | Cloudflare KV | KV + Redis (Docker on VPS) |
| Bot | — | Docker on VPS |
| Object storage | Cloudflare R2 | Cloudflare R2 |
| Reverse proxy | — | Caddy on VPS (auto HTTPS) |
| Secrets | Wrangler / Doppler | Wrangler / Doppler / VPS `.env` |
| CI/CD | GitHub Actions | + deploy SSH to VPS |
| Observability | Workers Analytics + Sentry | + Netdata on VPS |

## Key trade-offs

### Why Hono on Workers (not Node + Fly)?

- $0 free tier, p95 < 200 ms global.
- Forces clean, stateless handlers from day 1.
- Cost: cold-start work for heavy deps (mitigated — current deps tree fits comfortably).

### Why Neon first, VPS later?

- Phase A-C: managed eliminates DBA overhead while velocity matters most.
- Phase D: the VPS exists anyway for the bot — colocating Postgres saves $$ and gives full Postgres feature set (e.g. `pg_stat_statements`, custom extensions beyond what Neon ships).
- Migration cost: bounded by `DATABASE_URL` indirection. `pg_dump | psql` + Hyperdrive cutover = ~5 minutes downtime.

### Why TimescaleDB only in Phase D?

- Neon does not support the TimescaleDB extension. Candle / hypertable tables are Phase D work — no Phase A-C dependency on Timescale.
- Dev Docker uses `timescale/timescaledb:latest-pg16` so Phase D code can be tested locally from day 1 without touching Neon.

### Why MCP server in a separate package?

- MCP stdio transport cannot run on Workers (no `process.stdin`).
- Separating the package lets us ship stdio for desktop use and SSE/HTTP for cloud use without ifdef-style branching in the API.

### Why repository pattern?

- Single point to add `owner_id` scoping today and `tenant_id` later.
- Single point to add caching, query telemetry, or read replicas without touching route handlers.

## Cross-cutting concerns

| Concern | Mechanism |
|---|---|
| Validation | Zod schemas at every boundary (HTTP, MCP, bot ingest). |
| Errors | RFC 7807 `application/problem+json` envelope; `src/middleware/error.ts` is the only place to format. |
| Logging | Pino-style structured JSON to `console.log` (Workers ingests). |
| Tracing | Workers Trace headers + Sentry breadcrumbs. |
| Tenant scoping | Repository functions take `ownerId` argument. Routes derive `ownerId` from auth context. |
| Rate limit | Cloudflare KV bucket keyed by API key (Phase A); Redis from Phase D. |
| Secrets | Never in repo. `.env.example` lists keys with empty values. |

## Data flow examples

### A visitor reads the blog

```
GET fortunel.dev/blog
  -> Cloudflare Pages serves SSG Astro page
  -> Astro fetched POSTS at build time from /v1/posts?published=true
```

### Bot posts a signal

```
Bot (VPS)
  -> POST https://api.fortunel.dev/v1/signals  (Bearer <api-key>)
  -> Hono auth middleware validates API key
  -> Hono handler calls signalRepo.create({ ownerId, ... })
  -> Drizzle writes to Postgres
  -> 201 Created with signal record
  -> async: webhook fanout, Telegram notifier (separate worker)
```

### Claude (MCP) lists projects

```
Claude Desktop
  -> stdio -> apps/mcp-server -> tool: list_projects
  -> Calls projectRepo.list({ ownerId }) (same function REST uses)
  -> Returns { data: [...] } structured response
```

## Threat model summary

See `docs/code-standards.md` for input validation rules and `docs/deployment-guide.md` for prod hardening. High-risk surfaces:

- API key issuance flow (one-shot reveal, hashed at rest).
- Webhook delivery (HMAC-signed, retried with jitter, no PII in body).
- Bot → API channel (mTLS optional Phase D; Bearer API key with `signals:write` scope only).
- Backups (encrypted at rest via `age`, R2 bucket private).
