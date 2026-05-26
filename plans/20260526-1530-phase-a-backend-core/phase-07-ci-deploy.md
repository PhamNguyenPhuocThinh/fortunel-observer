---
phase: 7
title: "CI green + Workers staging deploy"
status: pending
priority: P1
effort: "6h"
dependencies: [6]
---

# Phase 7: CI green + Workers staging deploy

## Overview

Make every step in `.github/workflows/{ci-ts,ci-python,deploy}.yml` actually do real work and pass. End state: a fresh PR triggers lint + typecheck + tests, and a push to `main` deploys `apps/api` to `staging.api.fortunel.dev` with smoke tests asserting `/healthz`, `/openapi.json`, `/docs` all return 200.

> **Red-team revision:** the original draft ran `migrate` and `wrangler deploy` in the same job → a half-completed migration leaves prod stuck with schema ahead of code (or vice-versa). Split into two sequential jobs with explicit failure handling: `migrate` job runs Drizzle, `deploy` job runs only on `migrate.result == success`. On migrate failure, the old Worker keeps serving and a maintainer is paged via workflow status — no half-state.

## Requirements

- Functional: CI ts workflow runs against the real workspaces (no `echo` stubs)
- Functional: CI ts spins up TimescaleDB service container, runs Drizzle migrations, runs integration tests against it
- Functional: CI checks shared-types codegen drift (re-run codegen, diff against committed Pydantic)
- Functional: `deploy.yml` deploys to staging on push to main; prod is `workflow_dispatch` only
- Functional: migrate and deploy are separate jobs; deploy gated by `needs: migrate` + `if: success()`
- Functional: deploy smoke step asserts the three URLs return 200
- Non-functional: full CI run <8 min cold; <3 min warm (cache hit)

## Architecture

```
.github/workflows/
├── ci-ts.yml           # lint, typecheck, test, codegen:check
├── ci-python.yml       # ruff, mypy (best-effort), pytest
└── deploy.yml          # build, migrate (against Neon staging branch), wrangler deploy, smoke
```

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL` (Neon staging branch — read-write for migrations)
- `BETTER_AUTH_SECRET` (set via `wrangler secret put`, not in workflow)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (same)

GitHub Environments: `staging` (auto-deploy on main), `prod` (manual approval).

## Related Code Files

**Modify:**
- `.github/workflows/ci-ts.yml` — replace `pnpm test` with a sequence: install → migrate → test; add codegen:check step
- `.github/workflows/deploy.yml` — already drafted in scaffolding; tune secrets section + smoke list
- `apps/api/wrangler.toml` — verify staging/prod env blocks have correct routes
- `docs/deployment-guide.md` — update "first-time setup" with concrete commands once executed

**Create:**
- `.github/workflows/preview.yml` (optional, P3) — PR preview deploys to Workers `*.workers.dev` URL

## Implementation Steps

1. Provision a Neon project; create `prod` and `staging` branches. Save connection strings.
2. Create three Cloudflare KV namespaces: dev, staging, prod for both `RATE_LIMIT` and `SESSION_CACHE`. Paste IDs into wrangler.toml.
3. Create three GitHub OAuth apps (from Phase 5). Note their client IDs.
4. Add GitHub Secrets to repo settings: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`.
5. Manually push secrets to Workers: `wrangler secret put BETTER_AUTH_SECRET --env staging` etc.
6. Update `ci-ts.yml`: add `pnpm --filter @fortunel/db migrate` step using the test Postgres service; add `pnpm --filter @fortunel/shared-types codegen:check`.
7. Trigger a no-op PR — verify CI green end-to-end.
8. Merge to main — verify `deploy.yml` runs, deploys, and smoke test passes against `staging.api.fortunel.dev`.
9. Manual: `wrangler deploy --env prod` via `workflow_dispatch` once. Verify `api.fortunel.dev/healthz` returns 200.
10. Document the secret-rotation procedure in `docs/deployment-guide.md`.

## Success Criteria

- [ ] PR triggers `ci-ts` workflow; all jobs green
- [ ] `ci-ts` spins up Postgres service, runs migrations, integration tests pass
- [ ] `ci-ts` codegen:check step fails on intentional Pydantic drift (validate the check works)
- [ ] Push to main triggers `deploy.yml`; deploys to `staging.api.fortunel.dev`
- [ ] Smoke test confirms `/healthz`, `/openapi.json`, `/docs` all 200 in staging
- [ ] Manual prod deploy via `workflow_dispatch` succeeds
- [ ] CI total time <8 min cold

## Risk Assessment

- **Risk:** Secrets misconfiguration locks us out. **Mitigation:** Cloudflare account has multiple admin emails; secrets documented in deploy guide; never delete a working secret without storing the value elsewhere first.
- **Risk:** Neon staging branch costs creep. **Mitigation:** Neon's branch-on-write means staging shares storage with prod until written to; cost negligible until volume grows. Documented in deployment guide.
- **Risk:** Migration failure mid-deploy leaves prod in inconsistent state. **Mitigation:** Phase A migrations are additive-only; never drop columns in same deploy as a code change that depends on the new shape. Document migration discipline in code-standards.
- **Risk:** Smoke test flakiness from cold-start latency. **Mitigation:** retry-with-backoff in the curl loop (3x with 5s sleep) before failing the deploy.
- **Risk:** Workflow YAML drift between staging and prod. **Mitigation:** single workflow file with `environment` input; no duplication.
