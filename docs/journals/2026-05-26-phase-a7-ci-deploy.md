# Phase A.7 CI Green + Workers Staging Deploy — Code-Only Scope Complete

**Date**: 2026-05-26
**Severity**: Medium
**Component**: `.github/workflows/` (deploy.yml, ci-ts.yml) + `docs/deployment-guide.md`
**Status**: Code-complete (manual ops deferred)

## What Shipped

Split `.github/workflows/deploy.yml` into two sequential jobs: `migrate` (runs `pnpm --filter @fortunel/db migrate` against staging DB) → `deploy` (gated on `needs: migrate` + `if: success()`, runs wrangler-action@v3 + smoke test). Smoke test now has a 3×/5s retry-with-backoff loop to tolerate Worker cold-start latency (~2–3s on first invocation). Added migration step to `.github/workflows/ci-ts.yml` between typecheck and test, exercising the real migration path against a TimescaleDB service container on every PR; CI now catches schema drift or broken migrations before merge. Rewrote `docs/deployment-guide.md` with full two-job split explanation + failure semantics + "Re-run failed jobs" vs "Re-run all jobs" guidance. Added "Secret rotation" subsection with a three-bucket reference table (GitHub repo secrets, Cloudflare Worker secrets, non-sensitive vars) and a 5-step procedure (generate → stage → promote → revoke → audit-log). Created `docs/incidents/secret-rotation.md` stub (was referenced, did not exist). Updated plan frontmatter: `phase-07-ci-deploy.md` status marked `code-complete`, with a note flagging what's deferred to manual ops. Plan.md Phase 7 row now shows 🟡 (partial). Typecheck ✓, lint ✓, tests 94/94 ✓. Not yet committed.

**Time spent**: ~3.5h of 8h Phase A.7 budget. Most friction was thinking through the H2 finding (double approval prompt on prod) and deciding not to restructure YAML.

## The Brutal Truth

This phase is all paper. Not one of these workflows has actually run. The deploy job has never talked to Cloudflare. The smoke test has never hit staging. Phase A.7 is "done" in the same sense that a blueprint is done before the crew shows up.

The real discovery is the H2 finding from code review: splitting migrate and deploy into two jobs introduces a GitHub Environment approval race. With a prod environment protection rule (require reviews before deploy), the workflow will prompt a reviewer to approve the `migrate` job, then — if the reviewer steps away or the approval expires — prompt again for the `deploy` job, potentially leaving the schema ahead of code and the code unable to ship. The YAML split optimizes for atomicity (schema and code advance together, no half-state) but breaks the approval UX on top of it. I documented the problem and two mitigations in the deployment guide but didn't restructure the YAML because the fix requires wired Cloudflare/GitHub config that's out of scope this round. That's honest: I know the smell exists, I chose the trade-off, I documented it.

The other finding I deferred: adding a defensive `pg_isready` poll before CI migrate (H3). The TimescaleDB image already has `--health-cmd "pg_isready -U dev"` health-check gating the job start. Pre-emptive polling code violates YAGNI. If CI flakes on schema changes, the next journal entry should note this bet lost.

## Technical Details

- **`.github/workflows/deploy.yml` refactor**: Single `deploy-api` job split into `migrate` (outputs `migration_log` artifact for debugging) → `deploy` (consumes artifacts, gated on `success()`, runs wrangler-action@v3). Deploy job has conditional: `if: success() && github.event_name == 'push' && github.ref == 'refs/heads/main'` (staging auto-deploy only on main; manual trigger also respected). Smoke test: `curl -s -m 10 https://staging.api.fortunel.dev/healthz | jq .status` with `max-attempts: 3, retry-delay: 5s, retry: curl-transient` (catches 5xx + network timeout, skips 404). Entire deploy job runs with `concurrency: group: 'deploy-staging', cancel-in-progress: false` (serializes deploys, prevents race).
- **`.github/workflows/ci-ts.yml` addition**: `migrate` step added between `typecheck` and `test`, runs `pnpm --filter @fortunel/db migrate` against the existing `postgres` service (same container as unit tests use). Service container health-checks as before: `--health-cmd "pg_isready -U dev"` + `--health-options "--interval=10s --timeout=5s --retries=5"`. Migration runs with `NODE_ENV=test` (ensures test DB URL from `.env.test` is used). If migration fails, the entire CI workflow fails (no skip); this is intentional — schema breakage blocks merge.
- **`docs/deployment-guide.md` rewrite**: Replaced the terse "Deploy API" section (3 lines) with 40+ lines covering: manual ops still deferred (Neon branch provisioning, KV namespace creation, GitHub OAuth app registration, `wrangler secret put`), two-job anatomy with timing, "Re-run failed jobs" (reruns the failed job from the start, preserving schema) vs "Re-run all jobs" (reruns entire workflow, safe if only code failed), GitHub Environment approval UX caveat (H2), and the three-bucket secret table. Secret rotation procedure: (1) Generate new secret (rotate key in upstream system), (2) Stage in Cloudflare (via wrangler secrets or Workers UI), (3) Update code if needed, (4) Promote (toggle toggle/env var to use new secret), (5) Revoke old secret + log in incident tracker. Added "Next steps" linking to `docs/incidents/secret-rotation.md` for logging a real rotation event.
- **`docs/incidents/secret-rotation.md` stub**: Header with format spec ("| Date | Secret | Action | By |"), example row (YYYY-MM-DD, `TURNSTILE_SECRET_KEY`, "staged", username), and a note that this log is append-only and read by on-call for audit.
- **`plans/.../phase-07-ci-deploy.md`** frontmatter: status line changed from `status: in-progress` to `status: code-complete, code_completed: 2026-05-26`. Added section at end: **"Deferred Manual Ops"** explaining that secrets, OAuth app, KV namespace, and Neon branch setup are scheduled for a separate manual session (out of scope for code-only Phase A.7). Phase.md row in plan.md now shows 🟡 (code done, manual pending).

## What We Tried

1. **Single `deploy-api` job with inline migration + deploy steps.** Red-team revision flagged atomic-state risk: if migration succeeds but deploy fails (wrangler timeout, etc.), schema is ahead of code. If deploy succeeds and migration step wasn't there, old code talks to new schema. Split into two jobs with explicit gate (`needs: migrate` + `if: success()`). Atomicity is now the workflow's contract, not hope.
2. **Skipping CI migration step to save time.** Realized CI would never exercise the real migration path. Added the step so schema changes are caught on every PR before merge. Trade-off: ~10s slower CI. Accepted.
3. **Defensive `pg_isready` poll in CI before migrate.** Reviewed code shows the TimescaleDB service container already gates the job via health-check. Pre-emptive polling is YAGNI. Documented as a "if CI flakes, revisit" bet.
4. **Single approval prompt for the whole flow.** GitHub Environment protection rules don't allow gating specific jobs within a workflow — only the entire workflow. The H2 finding (double prompt on split jobs) is real and documented but requires restructuring the approval model (perhaps: approval at push time, not job time). Out of scope for Phase A.7 code-only.
5. **Smoke test without retry.** Workers cold-starts can take 2–3s, especially on first request. Added 3×/5s retry-with-backoff with transient error detection (network timeouts, 5xx). Fail-closed: any 2xx response is success, anything else is a failure (no 404 skip).

## Root Cause Analysis

The H2 approval race is a second-order effect of the atomicity fix. Splitting jobs prevents half-state (schema only, or code only), but on top of a GitHub Environment approval rule, it creates an UX problem where the reviewer is prompted twice and the approval window between the two prompts can lapse. The fix is not simpler YAML — it's a change in the deployment *model*: either adopt pipeline approval (reviewers approve the entire deployment plan at push time, workflow executes without further gates) or restructure the workflow so approval gates the entire `[migrate, deploy]` bundle at once (requires custom approval action, not built-in). Deferred because it depends on non-code setup (wiring the custom action or adoption of a new approval strategy with stakeholders).

The CI migration step was missing because the original plan had migration logic only in the deploy workflow. That was fine for a single-job design. Split jobs necessitate proving the migration path independently in CI, or staging deploys could fail silently (if the migration step is only in the deploy job and doesn't run until staging is live). Adding it to CI closes the gap.

## Lessons Learned

- **Atomicity and UX are separate contracts.** The two-job split improves deployment atomicity (no half-state) but introduces approval UX friction (double prompts). Documenting the trade-off is not a workaround — it's honesty about what the split costs. A future Phase B session should revisit the approval model, not pretend the split is free.
- **Migrations are deployment tests, not just DB schema changes.** CI didn't exercise the migration path until now. Adding it to ci-ts.yml revealed that CI should fail if migrations break — not just at staging, but at review time. This prevents "deploy PR that breaks migrations and doesn't discover it until staging is hit."
- **Retry logic matters for external calls.** The 3×/5s retry in the smoke test is not a kludge — it's the contract between the workflow and Workers cold-start latency. Without it, the smoke test would flake on first deploy or after Workers auto-scaling events. Documenting the retry strategy (transient errors only, not 4xx) prevents a future reviewer from "simplifying" it.
- **Deferred manual ops still need a placeholder.** Not including secret setup, KV provisioning, and OAuth app creation in Phase A.7 is fine (user de-scoped). But the deployment guide must flag what's still missing, so an operator doesn't start following the guide and hit a wall when `wrangler secret put` is needed. The stub file + the "Deferred Manual Ops" section in the plan both do this.
- **Health-checks reduce the need for defensive code.** The TimescaleDB image's pg_isready gate means the migrate step doesn't need a pre-flight check. YAGNI applies: don't add defensive code where a health-check already provides the invariant.

## Next Steps

- **Manual ops session**: Neon branch provisioning, Cloudflare KV namespace + KV setup, GitHub OAuth app registration, `wrangler secret put` for all secrets. After this, a staging deploy can actually run.
- **Real staging deploy**: Trigger the workflow (manual push or re-run from Actions), verify smoke test passes, confirm `staging.api.fortunel.dev/healthz` returns 200 and schema is in sync.
- **Approval model review (Phase B)**: If the double-prompt problem surfaces in practice, revisit the approval strategy (pipeline approval vs custom gate).
- **Carry-forward**: Add a contact-route integration test that exercises both `/v1/contact` and `/v1/contact/` to lock in the trailing-slash bypass behavior (flagged in Phase A.6, still pending).
- **Carry-forward**: Consider a typed wrapper around Drizzle queries that requires `ownerId` at the type level for tenant-scoped table writes (flagged in Phase A.6, prevents "repo author forgot the ownerId predicate" footgun).
