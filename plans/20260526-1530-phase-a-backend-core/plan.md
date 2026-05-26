---
title: Phase A — Backend Core
created: 2026-05-26
status: in_progress
mode: hard
scope: project
phases: 8
estimated_hours: 76
estimated_weeks: 5-7 (at 10-15h/week)
blockedBy: []
blocks: []
---

# Phase A — Backend Core

Build the agent-first headless API: Hono on Cloudflare Workers, Drizzle on Neon Postgres, Better Auth + API keys, RFC 7807 envelope, OpenAPI 3.1 + Scalar `/docs`, KV rate limiting, real CI + staging deploy.

Headless contract: every capability available via REST under `/v1/*`; UI consumes the API like any other client. Single-tenant V1 but every row carries `owner_id`.

## Phases

| # | Title | Priority | Effort | Depends on |
|---|-------|----------|--------|------------|
| 1 | [Workspace bootstrap](phase-01-workspace-bootstrap.md) ✅ | P1 | 6h | — |
| 2 | [DB foundation](phase-02-db-foundation.md) ✅ | P1 | 10h | 1 |
| 3 | [Shared types](phase-03-shared-types.md) ✅ | P1 | 6h | 1 |
| 4 | [API foundation](phase-04-api-foundation.md) ✅ | P1 | 10h | 2, 3 |
| 5 | [Auth surface](phase-05-auth-surface.md) | P1 | 24h | 2, 3, 4 |
| 6 | [Repository pattern + CRUD](phase-06-crud-resources.md) | P1 | 10h | 5 |
| 7 | [CI green + Workers deploy](phase-07-ci-deploy.md) | P1 | 6h | 6 |
| 8 | [Knowledge layer (A.5 parallel)](phase-08-knowledge-layer-a5.md) | P2 | 4h | 3 |

Phase 8 runs in parallel with 4-6 — does not gate Workers deploy.

## Research

- [Better Auth on Cloudflare Workers](research/better-auth-workers.md) — production-ready with caveats; disable `cookieCache`, use neon-http driver
- [Hono + @hono/zod-openapi + Scalar](research/hono-openapi-scalar.md) — pin `@hono/zod-openapi@0.16.0`, single root app + route factories

## Key Locked Decisions (non-negotiable)

From the brief + bootstrap clarifications. Re-confirm with user before changing any of these.

- TS + Hono + Drizzle + Better Auth on Cloudflare Workers
- Neon Postgres prod (Phase A-C); Docker TimescaleDB local dev (always); Hyperdrive + VPS in Phase D
- `owner_id` on every entity; repository pattern enforces scoping (route handlers never call Drizzle directly)
- Zod is the source of truth → JSON Schema → Pydantic codegen for bot
- Response envelope `{ data, meta, errors }`; errors as RFC 7807 with Content-Type `application/problem+json`
- Cursor-only pagination
- KV-backed rate limit (100 req/min/key) — homegrown, not Better Auth's plugin (issue #7586)

## Definition of Done (Phase A)

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` green on a fresh clone
- [ ] `apps/api` deployed to `staging.api.fortunel.dev`
- [ ] `/healthz`, `/openapi.json`, `/docs` all return 200 in staging
- [ ] User can sign up via email/password and via GitHub OAuth
- [ ] User can mint an API key with scopes and call `POST /v1/projects` with it
- [ ] All CRUD endpoints (Users self, Projects, Posts, ContactMessages) enforce `owner_id` scoping
- [ ] Rate limit returns 429 with `Retry-After` after threshold
- [ ] OpenAPI doc validates against the 3.1 spec
- [ ] Generated JSON Schema artifacts exist for every resource schema and drift-check passes in CI (Pydantic codegen deferred to Phase D)

## Open Questions

1. ~~API key scope vocabulary~~ — **RESOLVED (validation session 1):** coarse `resource:verb` + `*:*`. Vocabulary = `posts:read|write`, `projects:read|write`, `contact:read|write`, `signals:read|write`, `*:*`. Codified in `apps/api/src/auth/scopes.ts` + `packages/shared-types/src/primitives.ts`.
2. ~~/docs prod gate~~ — **RESOLVED (validation session 1):** public on prod. Agent-first surface; Scalar UI + `/openapi.json` both unauthenticated on `api.fortunel.dev`.
3. **Cursor format** — opaque base64-JSON cursor `{id, created_at}` or single-column ULID? Influences Phase 6 implementation. *Not blocking; default to base64-JSON unless raised at Phase 6 kickoff.*
4. ~~Field selection scope~~ — **RESOLVED (red-team revision):** `?fields=`, `?sort=`, filter ops deferred to V2. Phase 6 ships list+cursor only.
5. ~~Domain-error code namespace~~ — **RESOLVED (validation session 1):** path style `https://api.fortunel.dev/errors/{resource}/{slug}` for the `type` URI. Will eventually resolve to a public error catalog page.

## Validation Log

### Session 1 — 2026-05-26
4 questions asked, all recommended options accepted.

| # | Question | Decision |
|---|----------|----------|
| 1 | API key scope vocab | Coarse `resource:verb` + `*:*` (vocabulary listed in Open Q1 above) |
| 2 | Email verification at sign-up | Skip in Phase A. Sign-up creates active user. Revisit if real users invited. |
| 3 | `/docs` on prod | Public. Part of agent-first contract. |
| 4 | RFC 7807 `type` URI | Path style: `https://api.fortunel.dev/errors/{resource}/{slug}` |

### Whole-Plan Consistency Sweep — 2026-05-26
- Phase 5 frontmatter notes updated: scope vocab no longer a blocker; email-verification explicitly out of scope.
- Phase 4 problem-details middleware spec updated with the path-style `type` URI format.
- Phase 4 docs route confirmed public; no auth middleware on `/docs` or `/openapi.json`.
- Open Questions 1, 2, 4, 5 marked resolved.
- No remaining contradictions across plan.md + 8 phase files.

## Risk Register (top 5)

| Risk | Severity | Mitigation |
|---|---|---|
| Better Auth `cookieCache` bug #4203 | Med | Disabled explicitly in Phase 5; documented in code comment |
| scrypt CPU budget on Workers (~2s for password verify) | High | Cache the user/session lookup; do not re-verify on every request — session cookie carries the proof |
| Bundle exceeds 1MB compressed limit | Low | Researcher measured ≈70KB gzipped baseline; budget is fine |
| Drizzle + Neon serverless tagged-template conflict | Med | Use `neon-http` driver (not native `@neondatabase/serverless` Pool) |
| OpenAPI drift between TS types and JSON Schema | Med | Codegen check in CI (`pnpm shared-types:codegen --check`); fails CI on drift. Pydantic deferred to Phase D. |
| Unauth `POST /v1/contact` is a spam pipe | High | IP-keyed KV rate-limit (5/hour) + Cloudflare Turnstile verification on this endpoint (Phase 6 revision) |
| Migration runs in same job as deploy → half-state on failure | High | Split into `migrate` + `deploy` jobs gated by `needs:` + `if: success()` (Phase 7 revision) |
| Better Auth session = Postgres-per-request without our cache | High | Own KV write-through session cache in `auth/session-cache.ts` (Phase 5 revision) |

## Red-team revisions applied (2026-05-26)

Adversarial review surfaced 15 findings (3 Critical, 4 High, 6 Medium, 2 Low). Verdict: **revise-then-ship.** Critical + High items applied inline above. Summary:

- Phase 2: driver decision needs 1h spike (Workers `nodejs_compat` ≠ TCP); fallback split-driver (neon-http on Workers, postgres-js for Node tooling).
- Phase 3: Pydantic codegen deferred to Phase D; JSON Schema artifacts only in Phase A.
- Phase 5: dep 3 added; effort 12h → 24h (realistic); own KV session cache required (Better Auth `cookieCache` broken); split into 5a/5b if execution prefers.
- Phase 6: contact endpoint protections (Turnstile + IP rate-limit); YAGNI cuts on `?fields=` / `?sort=` / filter ops (deferred to V2).
- Phase 7: migration atomicity via two jobs.
- Phase 4: real OpenAPI 3.1 validation (`openapi-spec-validator`) + concurrent rate-limit test.
- Phase 8: `--check` advisory (warn, do not fail) until generator is stable.
- Open Question 1 (scope vocabulary) promoted from "defer" to **blocks Phase 5 start**.
