# Code Standards

Read before opening any PR. CI enforces the mechanical rules; humans enforce the rest in review.

## General

- File names: kebab-case for JS/TS/Python/shell. Descriptive over short — `signals-rate-limiter.ts` beats `srl.ts`.
- Files stay under **200 lines** of code (excluding comments and blank lines). Split when you cross.
- One concept per file. Helper used by one caller belongs in that file; helper used by two+ moves out.
- No commented-out code. Delete it; git remembers.
- No `TODO` without a tracker reference or an explicit timeline.

## TypeScript

### Style
- `strict: true` in tsconfig. No `any` in checked-in code — use `unknown` + narrowing or `never`.
- ESM only. No CommonJS files.
- Imports: external first, then `@/...` aliases, then relative. One blank line between groups. No barrel `index.ts` files in `apps/api/src/routes/`.
- Async over `.then()` chains.

### Hono patterns
- Each route file exports a `Hono` instance, mounted in `src/index.ts`:
  ```ts
  // src/routes/v1/posts.ts
  export const postsRoutes = new OpenAPIHono()
    .openapi(createPostRoute, createPostHandler)
    .openapi(listPostsRoute, listPostsHandler)
  ```
- Handlers never touch Drizzle directly — they call repositories.
- Handlers never format errors directly — they `throw` typed errors.

### Zod
- Schemas live in `apps/api/src/schemas/<resource>-schema.ts`.
- One source schema per entity; derive request/response shapes via `.pick()` and `.omit()`.
- Schemas exported and re-used by MCP tools. No duplicated shapes.

### Repository pattern
```ts
// src/repositories/posts-repo.ts
export const postsRepo = {
  list: async (db: DB, ownerId: string, opts: ListOpts) => { ... },
  get: async (db: DB, ownerId: string, id: string) => { ... },
  create: async (db: DB, ownerId: string, input: CreatePost) => { ... },
}
```
- Every read/write function takes `ownerId` as the second arg. No exceptions.
- Repo returns plain objects or throws `NotFound`, `Conflict`, `Forbidden`.
- Tests target repositories, not handlers.

### Error types
```ts
// src/errors.ts
export class HttpError extends Error {
  constructor(public status: number, public type: string, public detail: string) {
    super(detail)
  }
}
export class NotFound extends HttpError { constructor(detail = 'Not found') { super(404, 'not-found', detail) } }
export class Conflict extends HttpError { ... }
// ...
```
Middleware translates `HttpError` → RFC 7807 response.

### Drizzle
- All queries through Drizzle query builder or `sql` template — never string concat.
- Migrations only via `drizzle-kit generate`. Hand-editing migration SQL allowed only for advisory locks / extension installs.
- Schema in `packages/db/src/schema/<resource>.ts`; one file per table family.

## Python (apps/bot)

### Style
- `uv` for dep management. `pyproject.toml` is the lockfile-adjacent truth.
- `ruff` for both lint and format. CI fails on `ruff check` or `ruff format --check`.
- Type hints on every public function. `mypy --strict` on `src/bot/` (best-effort).
- `pytest` with `pytest-asyncio` for async tests. Coverage target 70% on `bot/strategies/` and `bot/execution/`.

### Layout
```
apps/bot/src/bot/
  exchanges/      # ccxt wrappers, one per venue
  data/           # candle ingest, storage
  strategies/     # pure functions: candles -> signal
  execution/      # signal -> order (paper or live)
  notifier/       # telegram, email, webhooks
  journal/        # emits packages/knowledge/trade-journals/*
  config.py       # pydantic Settings from env
```

### Cross-language types
- Zod schemas in `packages/shared-types/src/` → JSON Schema via `zod-to-json-schema` → Pydantic via `datamodel-code-generator`.
- Generated Pydantic models in `apps/bot/src/bot/_generated/`. Never hand-edit.
- CI step verifies generated files are up to date.

### HTTP to API
- `httpx.AsyncClient` with a shared base instance.
- API key in `Authorization: Bearer ...`, loaded from env, never logged.
- Retry on 5xx and 429 with exponential backoff + jitter, max 3 attempts.

## Commits

Conventional commits, lowercase scope:

```
feat(api): add cursor pagination to /v1/posts
fix(bot): retry on ccxt RateLimitExceeded
docs(api-design): clarify webhook signature header
refactor(db): extract owner_id helper into repo base
test(signals): cover concurrent insert race
chore(ci): pin pnpm to 9.12
```

- No AI references in commit messages.
- Subject ≤ 72 chars.
- Body wraps at 80 chars; explains **why**, not what.
- Reference issues with `Refs #123`, never `Closes` (let humans close).

## Tests

- Unit tests next to source: `posts-repo.ts` + `posts-repo.test.ts`.
- Integration tests against a real Docker Postgres in `test/integration/`. Never mock the DB.
- One assertion per intent — many `expect()` calls per test is fine, just keep them on one behaviour.
- Test names: `describe('postsRepo.create')` → `it('throws Conflict on duplicate slug')`.
- No flaky tests; deterministic seeds, fixed timestamps via `vi.useFakeTimers()`.

## Comments

Default: write no comment. Only add one when:

- The **why** is non-obvious (hidden constraint, subtle invariant, workaround for a known bug).
- The reader would otherwise hit a wall.

Never:
- Restate what the code does (`// loop over posts`).
- Reference plans, phases, audit findings, or issue numbers in code (those belong in PRs / `plans/`).
- Leave multi-paragraph docstrings on private helpers.

Exception: public API surface (`packages/db/schema/*`, exported Zod schemas) gets a one-line description.

## Secrets

- Never commit `.env`, `.dev.vars`, `*.pem`, `*.key`. `.gitignore` enforces this; a pre-commit hook will too (Phase A.5).
- Production secrets via Wrangler `wrangler secret put` or VPS `/etc/fortunel/env` (mode 0600).
- Local dev: `.env.local`, untracked.

## Performance budget

- API handler: ≤ 50 ms median CPU at the edge.
- DB query: ≤ 20 ms p95. Log slow queries via `pg_stat_statements`.
- Cold start: ≤ 100 ms (Workers; measured via Wrangler dev tail).
- Web bundle: ≤ 100 KB JS per page (gzip).

## Pre-commit / pre-push

- Pre-commit: `pnpm lint` + `pnpm typecheck` (changed packages only via Turbo).
- Pre-push: `pnpm test` (changed packages only).
- Never `--no-verify` without explicit reason in the PR description.
