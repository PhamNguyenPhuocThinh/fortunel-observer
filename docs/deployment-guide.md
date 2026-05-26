# Deployment Guide

Runbooks for the two production topologies: managed (Phase A-C) and hybrid VPS (Phase D+).

## Environments

| Env | Purpose | URL pattern |
|---|---|---|
| `dev` | Local Docker + `wrangler dev` | `http://localhost:8787` |
| `staging` | Pre-prod on Workers + Neon branch | `https://staging.api.fortunel.dev` |
| `prod` | Live | `https://api.fortunel.dev` |

Each env has its own Wrangler `[env.<name>]` block, its own KV namespaces, its own R2 bucket, and (Phase D+) its own Hyperdrive binding.

## Phase A-C: Managed stack

### One-time setup

1. **Cloudflare account**
   - Create account, register domain (or transfer existing DNS to CF).
   - Generate API token with `Workers Scripts:Edit`, `Workers KV:Edit`, `R2:Edit`, `Pages:Edit`.
   - Save to GitHub Actions secrets as `CLOUDFLARE_API_TOKEN`.

2. **Neon**
   - Create project; create `prod` branch and `staging` branch (Neon branches are free up to a quota).
   - Copy connection strings into Wrangler secrets:
     ```
     wrangler secret put DATABASE_URL --env prod
     wrangler secret put DATABASE_URL --env staging
     ```

3. **Resend**
   - Verify sending domain (DKIM, SPF, DMARC records added via CF DNS).
   - Generate API key, store as Wrangler secret `RESEND_API_KEY`.

4. **GitHub OAuth app**
   - Register OAuth app pointing at `https://api.fortunel.dev/auth/callback/github`.
   - Store `GITHUB_CLIENT_ID` (var) and `GITHUB_CLIENT_SECRET` (secret) in Wrangler.

5. **KV + R2**
   ```
   wrangler kv:namespace create RATE_LIMIT --env prod
   wrangler kv:namespace create SESSION_CACHE --env prod
   wrangler r2 bucket create fortunel-assets-prod
   ```
   Paste the returned IDs into `apps/api/wrangler.toml`.

### Deploy API

CI auto-deploys on push to `main`:
```yaml
# .github/workflows/deploy.yml
- name: Deploy API
  run: pnpm --filter @fortunel/api deploy --env prod
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```
Manual: `pnpm --filter @fortunel/api deploy --env prod`.

### Deploy Web (Cloudflare Pages)

Connect the repo in the CF Pages dashboard:
- Build command: `pnpm --filter @fortunel/web build`
- Build output dir: `apps/web/dist`
- Root dir: `/`
- Env vars: `PUBLIC_API_URL=https://api.fortunel.dev`

Pages deploys on push to `main` automatically.

### Run migrations

```bash
# Dev (Docker):
pnpm --filter @fortunel/db migrate

# Staging / prod (Neon):
DATABASE_URL=$NEON_PROD_URL pnpm --filter @fortunel/db migrate
```

Run from GitHub Actions deploy job after Wrangler deploy succeeds. Wrap in advisory lock if multiple workers might race (`SELECT pg_advisory_lock(123)`).

### Rollback

- Wrangler stores previous deploys: `wrangler rollback --env prod`.
- Pages: revert in the dashboard, or push a revert commit.
- DB: migrations are forward-only. Schema-breaking rollouts ship as two PRs (additive → backfill → cut over → remove old).

## Phase D+: VPS hybrid stack

### One-time VPS setup

Recommended: Hetzner CX22 (~€4.5/mo, 2 vCPU / 4 GB RAM / 40 GB SSD), region SG/HK preferred for latency to APAC exchanges. Contabo and Vultr are alternates.

```bash
# As root, fresh Ubuntu 24.04 LTS:
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin ufw fail2ban unattended-upgrades

# SSH hardening
sed -i 's/^#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Unattended security upgrades
dpkg-reconfigure -plow unattended-upgrades
```

Create non-root user `fortunel`, add SSH key, add to `docker` group, log out as root from here on.

### Deploy the prod stack

```bash
# As fortunel@vps:
git clone git@github.com:<you>/fortunel-observer.git ~/fortunel
cd ~/fortunel/infra/prod-vps
cp .env.example .env  # fill in DB_PASSWORD, AGE_PUBLIC_KEY, R2 keys, etc.

# Caddyfile: edit domains
nano Caddyfile

# Boot
docker compose up -d
docker compose ps
```

Caddy auto-provisions TLS via Let's Encrypt on first request. Confirm:
```bash
curl -I https://api.fortunel.dev/healthz
```

### Cloudflare Hyperdrive cutover

1. Create a Hyperdrive binding in CF dashboard pointing at `tcp://<vps-ip>:5432` with the DB password (CF encrypts at rest).
2. Add the binding to `apps/api/wrangler.toml`:
   ```toml
   [[env.prod.hyperdrive]]
   binding = "DB"
   id = "<hyperdrive-id>"
   ```
3. Migration runbook: see [infra/migration/neon-to-vps.md](../infra/migration/neon-to-vps.md).

### Backups

```bash
# Cron entry on VPS (sudo crontab -e):
0 3 * * * /home/fortunel/fortunel/infra/prod-vps/backup/pg-backup.sh >> /var/log/pg-backup.log 2>&1
```

- Daily 03:00 VPS time.
- Encrypted with `age`, recipient public key only on VPS.
- Uploaded to `r2://fortunel-backups/platform-YYYY-MM-DD.sql.gz.age`.
- 30-day retention via R2 lifecycle rule.

### Restore drill (monthly)

```bash
# On a scratch VPS or local machine:
rclone copy r2:fortunel-backups/platform-YYYY-MM-DD.sql.gz.age ./
age -d -i ~/.config/age/keys.txt platform-YYYY-MM-DD.sql.gz.age | gunzip > restore.sql
psql -U postgres -d staging < restore.sql
# Run smoke tests against staging.
```

Document the drill in `infra/prod-vps/backup/restore-log.md`.

### Monitoring

- Netdata (free) on `https://vps.fortunel.dev:19999` (Caddy proxy + basic auth) for host + Docker metrics.
- Cloudflare Workers Analytics for API request volume + p95 latency.
- Sentry (free tier) for unhandled exceptions in API + bot.
- Telegram bot pushes alerts for: disk > 80%, Docker container restart loop, backup failure.

### Docker updates

Monthly window:
```bash
cd ~/fortunel
git pull
cd infra/prod-vps
docker compose pull
docker compose up -d
```

Always pin image tags in `docker-compose.yml` — never `latest` in prod files. Update tags via PR review.

## Smoke tests after any deploy

Run from a workstation:
```bash
# Health
curl -fsS https://api.fortunel.dev/healthz

# Auth
curl -fsS -X POST https://api.fortunel.dev/v1/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"..."}'

# API key path
curl -fsS https://api.fortunel.dev/v1/projects \
  -H "Authorization: Bearer $FORTUNEL_TEST_KEY"

# Docs reachable
curl -fsS -o /dev/null https://api.fortunel.dev/docs
curl -fsS -o /dev/null https://api.fortunel.dev/openapi.json
```

Automate as a post-deploy GitHub Actions step.

## Incident runbook

1. **Confirm** — reproduce on staging or against `/healthz`.
2. **Communicate** — log incident in `docs/incidents/YYYY-MM-DD-slug.md`.
3. **Mitigate** — rollback before forward-fix. Wrangler rollback is one command.
4. **Diagnose** — Sentry + Workers Tail + Netdata.
5. **Fix forward** — PR with regression test.
6. **Post-mortem** — append to the incident doc: timeline, root cause, prevention.

No blameless lip service — the post-mortem only counts if it lists a concrete change to code, config, or process.
