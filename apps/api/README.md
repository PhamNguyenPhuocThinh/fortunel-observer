# @fortunel/api

Agent-first REST API on Cloudflare Workers. See `docs/api-design.md` and `docs/system-architecture.md`.

## Phase A scaffold

This package is a stub. Phase A implementation will add:

- `src/index.ts` — Hono app entry, mounts `/v1/*`, `/openapi.json`, `/docs`, `/healthz`, `/mcp`
- `src/routes/v1/` — resource routes (posts, projects, contact, api-keys, signals)
- `src/middleware/` — auth (session + API key), rate-limit (KV), error envelope (RFC 7807), logger
- `src/repositories/` — tenant-scoped data access (every query filters `owner_id`)
- `src/schemas/` — Zod schemas → OpenAPI components → exported to `@fortunel/shared-types`
- `src/mcp/` — HTTP/SSE MCP transport mounted at `/mcp` (stdio variant lives in `apps/mcp-server`)

## Dev

```bash
pnpm install
cp .dev.vars.example .dev.vars   # add DATABASE_URL, BETTER_AUTH_SECRET, etc.
pnpm db:up                       # start local Postgres
pnpm --filter @fortunel/api dev  # wrangler dev on http://localhost:8787
```

## Deploy

```bash
pnpm --filter @fortunel/api deploy --env staging   # or --env prod
```

CI does this automatically on push to `main` for staging; prod is `workflow_dispatch` only. See `.github/workflows/deploy.yml`.
