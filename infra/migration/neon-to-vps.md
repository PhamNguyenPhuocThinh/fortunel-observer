# Neon → VPS Postgres Migration Runbook

When to run this: end of Phase D, after the VPS Docker stack is healthy and the bot has been talking to a fresh Postgres in staging mode.

## Pre-flight (T-7 days)

- [ ] VPS Docker stack live, all health checks green.
- [ ] `pg-backup.sh` cron has produced at least 3 daily backups uploaded to R2.
- [ ] One full restore drill executed successfully (see `infra/prod-vps/README.md`).
- [ ] Cloudflare Hyperdrive binding created in CF dashboard, pointing at VPS Postgres.
- [ ] `wrangler.toml` updated with Hyperdrive binding in a feature branch (not yet merged).
- [ ] Read traffic patterns reviewed; identify any long-running endpoints to disable during the cutover window.
- [ ] Announce maintenance window: aim for 30 minutes; expect 10-15 minutes of actual downtime for traffic.

## Pre-flight (T-1 hour)

- [ ] Run a final `pg_dump` from Neon to a local file. Verify size and row counts vs prod expectations.
- [ ] Re-confirm VPS disk has > 3× expected dump size free.
- [ ] Have rollback path ready: previous `wrangler.toml` (Neon binding) on a branch.
- [ ] Snapshot Neon project (Neon native point-in-time recovery — keep for 24h).

## Cutover (T-0)

### 1. Stop writes

Set Worker API into read-only mode:

```bash
# Toggle a Wrangler env var; the API has a middleware that 503s on writes
# when READ_ONLY=true.
wrangler secret put READ_ONLY --env prod
# value: true
```

Verify by hitting a write endpoint — should return 503 with a Retry-After header.

### 2. Drain in-flight work

- Wait 60 seconds for in-flight requests to complete.
- Pause the bot: `docker compose stop bot` on the VPS.

### 3. Dump Neon

From an operator machine (not the VPS, to keep the network path short):

```bash
NEON_URL="postgres://<user>:<pass>@<host>.neon.tech/<db>?sslmode=require"
pg_dump "$NEON_URL" --no-owner --clean --if-exists -Fc -f neon-cutover.dump
ls -lh neon-cutover.dump
```

### 4. Restore to VPS Postgres

```bash
# Copy dump to VPS
scp neon-cutover.dump fortunel@vps:/tmp/

# On VPS, restore into the running container
docker exec -i fortunel-postgres pg_restore \
  -U postgres -d platform --clean --if-exists --no-owner \
  /tmp/neon-cutover.dump

# Smoke: rough row counts on critical tables
docker exec -it fortunel-postgres psql -U postgres -d platform <<'SQL'
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'api_keys', count(*) FROM api_keys;
SQL
```

Compare counts to Neon (run the same query against Neon if still reachable).

### 5. Enable TimescaleDB extension (if not already from init)

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
-- If candle table will be created later as part of Phase D, no further
-- action needed now. If it already exists as a plain table, convert:
-- SELECT create_hypertable('candle', 'time', if_not_exists => TRUE,
--   migrate_data => TRUE);
```

### 6. Flip the API to Hyperdrive

```bash
# Merge the wrangler.toml change to main
git checkout main && git merge feat/hyperdrive-cutover && git push

# CI will deploy. Or do it manually:
pnpm --filter @fortunel/api deploy --env prod
```

Verify:

```bash
curl -fsS https://api.fortunel.dev/healthz
# Expect 200, "ok"
```

### 7. Exit read-only mode

```bash
wrangler secret put READ_ONLY --env prod
# value: false
```

### 8. Resume bot

```bash
ssh fortunel@vps "docker compose -f ~/fortunel/infra/prod-vps/docker-compose.yml start bot"
```

### 9. Smoke tests

- [ ] `GET /v1/posts?limit=5` returns expected count.
- [ ] `POST /v1/contact` succeeds (test message).
- [ ] Bot logs show successful signal post.
- [ ] Workers Tail shows no error spike.
- [ ] Sentry shows no new error types.

## Rollback

If anything fails after step 6 but before traffic stabilizes:

1. Revert the wrangler.toml merge: `git revert <sha> && git push`.
2. CI re-deploys with Neon binding.
3. `wrangler secret put READ_ONLY` → `false`.
4. Investigate the VPS-side failure offline.

Data written between step 7 and rollback would be on the VPS but not Neon — but in read-only mode there should be none. If READ_ONLY was off too long, run the cutover delta:

```bash
# Pull the delta from VPS, replay into Neon. Document inline in the
# post-mortem when this happens.
```

## Post-cutover (T+24h)

- [ ] Neon kept on standby for 7 days (do NOT delete the project).
- [ ] Confirm 24h of backups landed in R2 from the VPS.
- [ ] Confirm no rate-limit warnings from Hyperdrive in CF dashboard.
- [ ] Write a journal entry in `docs/incidents/` even if it went smoothly — a successful migration is documentation worth keeping.

## Post-cutover (T+7 days)

- [ ] Decommission Neon project (after explicit go/no-go).
- [ ] Remove Neon connection from `.env.example` (or mark deprecated).
- [ ] Update `docs/deployment-guide.md` to drop "Phase A-C" qualifiers where they no longer apply.
