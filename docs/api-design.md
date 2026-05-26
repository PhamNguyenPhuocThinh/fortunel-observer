# API Design

The REST API is the product. Every rule here is a hard contract — clients (web, MCP server, bot, third-party agents) depend on it.

## URL conventions

- Versioning in path: `/v1/...`. Bump major (`/v2`) only on breaking changes.
- Resource-oriented, lowercase plural nouns: `/v1/posts`, `/v1/projects`, `/v1/signals`.
- Sub-resources: `/v1/projects/:projectId/posts`.
- Actions that don't fit CRUD use POST to a verb endpoint: `/v1/strategies/:id/backtest`.
- No trailing slashes.

## HTTP verbs

| Verb | Semantics |
|---|---|
| GET | Read; safe; idempotent. Never mutates. |
| POST | Create or trigger non-idempotent action. |
| PUT | Replace entire resource (rare — prefer PATCH). |
| PATCH | Partial update. Default for mutations. |
| DELETE | Idempotent removal. |

## Status codes

| Code | Use |
|---|---|
| 200 | Success with body |
| 201 | Created (POST) — include `Location` header |
| 204 | Success no body (DELETE, idempotent no-op) |
| 400 | Validation error (Zod failure) — RFC 7807 |
| 401 | Missing/invalid credentials |
| 403 | Authenticated but not authorized for resource |
| 404 | Resource not found OR not owned by caller (same response, no leak) |
| 409 | Conflict (uniqueness violation, optimistic-lock fail) |
| 422 | Semantic validation failure (well-formed but rejected) |
| 429 | Rate limited — include `Retry-After` |
| 500 | Unexpected; logged + Sentry; opaque body to caller |

## Response envelope

Every JSON response uses this shape:

```json
{
  "data": { ... } | [ ... ] | null,
  "meta": { "cursor": "...", "total": 42 } | null,
  "errors": null | [ ... ]
}
```

- `data` always present, may be null on error.
- `meta` carries pagination, cursors, counts. Null for single-resource responses.
- `errors` null on success, array of RFC 7807 problem objects on error.

## Errors (RFC 7807)

`Content-Type: application/problem+json`.

```json
{
  "data": null,
  "meta": null,
  "errors": [
    {
      "type": "https://api.fortunel.dev/errors/validation",
      "title": "Validation failed",
      "status": 400,
      "detail": "field 'email' is required",
      "instance": "/v1/users",
      "extensions": {
        "issues": [
          { "path": ["email"], "message": "Required", "code": "invalid_type" }
        ]
      }
    }
  ]
}
```

All formatting happens in `apps/api/src/middleware/error.ts`. Handlers throw typed errors; middleware translates. No ad-hoc error JSON anywhere else.

## Pagination

Cursor-based only. Offset pagination is forbidden (breaks under inserts).

Request:
```
GET /v1/posts?limit=20&cursor=eyJpZCI6...
```

Response:
```json
{
  "data": [...],
  "meta": {
    "cursor": "eyJpZCI6...",   // null when no next page
    "limit": 20
  },
  "errors": null
}
```

Defaults: `limit=20`, max `limit=100`. Cursor opaque to client (base64 of `{id, ts}`).

## Field selection and expansion

- `?fields=id,title,published_at` — narrows response. Always include `id`.
- `?expand=author,tags` — joins relations server-side (single round trip). Allowed expand keys declared per route in OpenAPI.

## Filtering and sorting

- Simple equality: `?status=published`.
- Range with suffix: `?created_at[gte]=2026-01-01&created_at[lt]=2026-02-01`.
- Sort: `?sort=-published_at,title` (`-` = desc).

Complex queries belong in dedicated endpoints, not query-string DSLs.

## Authentication

Two parallel mechanisms — they never mix in one request.

### Session (humans, web UI)
- Better Auth issues HttpOnly Secure SameSite=Lax cookie on login.
- Cookie verified by `src/middleware/auth.ts` on each request.

### API key (machines: bot, MCP, integrations)
- Header: `Authorization: Bearer <key>`.
- Key issued via `POST /v1/api-keys`. One-shot reveal — the raw key appears only in the create response. We store argon2 hash.
- Scopes declared per key: `posts:read`, `posts:write`, `signals:write`, `*:read`, `*:*`.
- Middleware rejects requests where the key lacks the route's required scope.

## MCP tool mapping

Every material REST endpoint has one MCP tool with identical semantics. Naming: `<verb>_<resource>` snake_case.

| REST | MCP tool |
|---|---|
| `POST /v1/posts` | `create_post` |
| `GET /v1/posts` | `list_posts` |
| `GET /v1/posts/:id` | `get_post` |
| `PATCH /v1/posts/:id` | `update_post` |
| `DELETE /v1/posts/:id` | `delete_post` |
| `GET /v1/signals` | `list_signals` |
| `POST /v1/strategies/:id/backtest` | `backtest_strategy` |
| `POST /v1/knowledge` | `ingest_knowledge` |
| `GET /v1/knowledge` | `list_knowledge` |
| `POST /v1/content/drafts` | `generate_draft` |

Each tool's `description` field in MCP is a one-paragraph plain-English explanation written for an LLM consumer, including:
- What the tool does and when to use it.
- Required arguments with examples.
- What it returns and how to interpret.

## OpenAPI quality bar

Every route declared via `@hono/zod-openapi` must have:

1. `summary` — one short line.
2. `description` — paragraph explaining intent + side effects.
3. `tags` — domain grouping (Posts, Projects, Signals, Auth, ...).
4. `request.body` example.
5. `responses` covering 200/4xx with example payloads.
6. `security` — scope requirements when API key auth applies.

Spec served at `/openapi.json`. Scalar UI at `/docs`. CI fails on missing `summary`/`description`.

## Webhooks (Phase B)

- Subscribe: `POST /v1/webhooks` with `{ url, events: ["post.published", "signal.created"] }`.
- Delivery: POST to subscriber URL with `X-Fortunel-Signature: sha256=<hex>` HMAC of body using subscriber's signing secret (returned once on create, like API keys).
- Retry: exponential backoff up to 24h, then dead-lettered.
- Body: `{ event, occurred_at, data }` — no PII beyond what the event semantically requires.

## Versioning policy

- Breaking change = path bump to `/v2`. Old `/v1` runs in parallel for 90 days minimum.
- Additive changes (new fields, new endpoints, new optional query params) are not breaking. Clients must ignore unknown fields.
- Deprecation: `Deprecation: true` + `Sunset` headers on doomed endpoints for ≥ 30 days before removal.

## Rate limiting

- Default: 100 req/min/key, sliding window in Cloudflare KV.
- Headers on every response:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 87`
  - `X-RateLimit-Reset: 1716760800`
- 429 includes `Retry-After: <seconds>`.

## CORS

- Whitelist origins explicitly per env (no `*`).
- Web origin in `CORS_ALLOWED_ORIGINS` env var (comma-separated).
- API keys can also call from any origin — CORS only constrains browser clients.
