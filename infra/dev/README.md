# Local dev infrastructure

Docker Compose stack: Postgres (with TimescaleDB) + Adminer. Boot once, leave running, your laptop survives.

## Quick start

From the repo root:

```bash
pnpm db:up       # starts services in background
pnpm db:logs     # follow Postgres logs
pnpm db:psql     # interactive shell into platform_dev
pnpm db:down     # stop (preserves data)
pnpm db:reset    # DROP everything and reboot (use sparingly)
```

## What you get

| Service | Port | Purpose |
|---|---|---|
| Postgres 16 + TimescaleDB 2.17 | 5432 | Primary data store |
| Adminer | 8080 | Web SQL UI at http://localhost:8080 |

Default credentials: user `dev`, password `dev`, db `platform_dev`.

Connection string (already in `.env.example`):
```
DATABASE_URL=postgres://dev:dev@localhost:5432/platform_dev
```

## Why TimescaleDB in dev when Neon prod cannot run it?

Phase D introduces a `candle` hypertable for time-series OHLCV data. Once we migrate the DB off Neon onto the VPS (Phase D), TimescaleDB will be live in prod too. Running it locally from day one means Phase D code paths can be tested without setting up the VPS first. Phase A-C tables (User, Project, Post, etc.) do not depend on TimescaleDB — the extension just sits idle.

## Extensions enabled on first boot

See `init-scripts/01-extensions.sql`:

- `timescaledb` — Phase D hypertables.
- `pg_stat_statements` — slow query inspection.
- `pgcrypto` — UUID generation, `gen_random_uuid()`.

The init script runs only on a fresh data volume. If you need to add an extension after the fact, run it manually via `pnpm db:psql`.

## Resetting state

```bash
pnpm db:reset
```

This `docker compose down -v` + `up` cycle: the volume `fortunel_postgres_dev` is deleted and recreated. Use when migrations get into a bad state or when you want to test the bootstrap path.

## Backups (dev)

We do not back up dev data. The data is rebuildable from migrations + seed scripts (Phase A.5).

## See also

- [Production VPS stack](../prod-vps/README.md) — Phase D+ equivalent on a real server.
- [Neon → VPS migration runbook](../migration/neon-to-vps.md).
- [Deployment guide](../../docs/deployment-guide.md).
