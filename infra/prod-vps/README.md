# Production VPS stack

Self-hosted infrastructure for Phase D+. Hosts Postgres + TimescaleDB, Redis, the Python trading bot, and Caddy as reverse proxy.

The Cloudflare Workers API does NOT live on this VPS — it stays on Cloudflare. The Workers API reaches Postgres here via Cloudflare Hyperdrive.

## Before first boot

1. **Provision a VPS** (Hetzner CX22 recommended; SG/HK region for APAC). See [`docs/deployment-guide.md`](../../docs/deployment-guide.md) for OS hardening steps.
2. **Install Docker + Docker Compose plugin.**
3. **Clone this repo to `~/fortunel`.**
4. **Generate an age keypair on your laptop**, NOT on the VPS:
   ```bash
   age-keygen -o ~/age-key.txt
   # Public line starts with `# public key:` — copy that to AGE_PUBLIC_KEY below.
   # Private key stays on your laptop, off the VPS.
   ```
5. **Configure rclone** on the VPS for Cloudflare R2:
   ```bash
   rclone config  # add a remote named "r2" of type "S3 / Cloudflare R2"
   ```
6. **Copy environment templates and fill them in:**
   ```bash
   cp .env.example .env
   nano .env       # set DB_PASSWORD, AGE_PUBLIC_KEY
   cp .env.example .env.bot    # fill in bot-specific keys (exchange, telegram, API)
   ```
7. **Edit `Caddyfile`** — replace `<your-domain>` placeholders, generate basic-auth bcrypt hashes:
   ```bash
   docker run --rm caddy:2-alpine caddy hash-password
   ```
8. **Create local backup dir:**
   ```bash
   sudo mkdir -p /var/lib/fortunel/backups
   sudo chown $USER /var/lib/fortunel/backups
   ```

## Boot

```bash
cd ~/fortunel/infra/prod-vps
docker compose up -d
docker compose ps                 # all services should be "running" or "healthy"
docker compose logs -f postgres   # follow Postgres logs on first boot
```

Caddy issues TLS certificates on first request — make sure DNS A records point at the VPS and ports 80/443 are open in `ufw`.

## Backups

`backup/pg-backup.sh` runs as cron at 03:00 UTC daily:

```cron
0 3 * * * /home/fortunel/fortunel/infra/prod-vps/backup/pg-backup.sh >> /var/log/pg-backup.log 2>&1
```

It pipes `pg_dump` → `gzip` → `age -r $AGE_PUBLIC_KEY` → `rclone copyto r2:fortunel-backups/...`.

Encryption uses **only the public key** stored on the VPS. The private key lives on your laptop, so a VPS compromise leaks running data but not historical backups.

R2 lifecycle rule: delete objects older than 30 days. Set this in the Cloudflare dashboard.

## Restore drill

Run from your laptop, not the VPS:

```bash
# 1. Start a scratch postgres container locally
docker run -d --name pg-restore-test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=platform \
  -p 5433:5432 \
  timescale/timescaledb:2.17.2-pg16

# 2. Restore the latest backup for today's date
./backup/pg-restore.sh 2026-06-15 pg-restore-test platform

# 3. Smoke test
docker exec -it pg-restore-test psql -U postgres -d platform -c "\dt"

# 4. Tear down
docker rm -f pg-restore-test
```

Log every drill outcome to `backup/restore-log.md`. Drills happen monthly.

## Updating images

```bash
cd ~/fortunel
git pull
cd infra/prod-vps
docker compose pull
docker compose up -d
```

Image tags in `docker-compose.yml` are pinned — never `latest`. Bump via PR review.

## Tearing down (only for moves between VPS)

```bash
docker compose down       # stops services, preserves volumes
docker compose down -v    # DELETES VOLUMES (data). Take a final backup first.
```

## Connecting Workers via Hyperdrive

1. In the Cloudflare dashboard, create a Hyperdrive binding:
   - Origin: `tcp://<vps-public-ip>:5432`
   - User: `postgres`, password: `$DB_PASSWORD`, DB: `platform`, SSL: required.
2. Add binding to `apps/api/wrangler.toml`:
   ```toml
   [[env.prod.hyperdrive]]
   binding = "DB"
   id = "<hyperdrive-id>"
   ```
3. Restrict the Postgres `pg_hba.conf` to accept connections only from Hyperdrive egress IPs (Cloudflare publishes the list).

## See also

- [Neon → VPS migration runbook](../migration/neon-to-vps.md)
- [Deployment guide](../../docs/deployment-guide.md)
- [Local dev stack](../dev/README.md)
