# @fortunel/db

Drizzle ORM schema + migrations. **Single source of truth for the data model.**

## Phase A scope

- `src/schema/` — one file per resource (`users.ts`, `api-keys.ts`, `projects.ts`, `posts.ts`, `contact-messages.ts`)
- `src/index.ts` — re-exports schema + a `createClient(databaseUrl)` helper
- `drizzle.config.ts` — points at Neon/Postgres via `DATABASE_URL`
- `migrations/` — generated SQL files, committed
- Scripts: `db:generate` (Drizzle Kit generate), `db:migrate` (apply pending), `db:studio` (Drizzle Studio)

## Phase D additions

- `src/schema/candles.ts` — TimescaleDB hypertable (created via raw SQL in migration, since Drizzle doesn't model hypertables natively)
- `src/schema/signals.ts`, `orders.ts`, `strategies.ts`, `data-sources.ts`
- `src/schema/knowledge-artifacts.ts`, `content-drafts.ts`

## Rule

**Every table has `owner_id`.** No exceptions. Repository pattern in `apps/api` enforces tenant scoping; never query `db.select()` directly from a route handler.
