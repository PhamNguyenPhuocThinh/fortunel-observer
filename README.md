# fortunel-observer

Agent-first, headless platform powering a solopreneur stack: personal brand site, REST/MCP API, and trading bot. Single-tenant V1 with multi-tenant-ready DNA.

## Architecture in one sentence

API is the product. UI, MCP server, and trading bot are all clients of the same versioned REST surface.

## Quick start (dev)

Prereqs: Node 22+, pnpm 9+, Docker, Python 3.12+ (Phase D only).

```bash
pnpm install
pnpm db:up                  # starts Postgres + Adminer (Docker)
cp .env.example .env.local  # fill in placeholders
pnpm dev                    # turbo runs all apps in dev mode
```

- API: http://localhost:8787
- API docs (Scalar): http://localhost:8787/docs
- OpenAPI spec: http://localhost:8787/openapi.json
- Adminer: http://localhost:8080

## Layout

```
apps/
  api/          TypeScript + Hono - REST + MCP source of truth
  web/          Astro + React islands (Phase C)
  mcp-server/   Standalone MCP wrapper of API
  bot/          Python trading bot (Phase D)
packages/
  db/           Drizzle schema + migrations (single source of truth)
  shared-types/ Zod schemas -> JSON Schema -> Pydantic models
  knowledge/    Structured markdown for AI content pipeline
  config/       Shared eslint, tsconfig, prettier
content/        blog/, drafts/, templates/ (published via API)
infra/          Docker compose, Caddy, backup scripts
docs/           PDR, architecture, API design, runbooks
plans/          Implementation plans per phase
```

## Build order

Phase A (Backend) -> A.5 (Knowledge) -> B (Agent surface) -> C (Frontend) -> D (Bot + DB migrate) -> E (Content pipeline).

See [docs/project-roadmap.md](docs/project-roadmap.md) for the full plan and [docs/project-overview-pdr.md](docs/project-overview-pdr.md) for product context.

## Documentation index

- [docs/project-overview-pdr.md](docs/project-overview-pdr.md) - what we are building and why
- [docs/system-architecture.md](docs/system-architecture.md) - how it fits together
- [docs/api-design.md](docs/api-design.md) - REST + MCP contract rules
- [docs/code-standards.md](docs/code-standards.md) - TS + Python conventions
- [docs/deployment-guide.md](docs/deployment-guide.md) - prod runbooks
- [docs/project-roadmap.md](docs/project-roadmap.md) - phase checklists
- [docs/ai-content-guide.md](docs/ai-content-guide.md) - tone + AI draft rules
- [docs/llms.txt](docs/llms.txt) - AI consumer entry point

## License

GPL-3.0-only. See [LICENSE](LICENSE).
