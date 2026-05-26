# bot

Trading bot. Python 3.12, `uv`, ruff, pytest, ccxt, pandas, vectorbt, TA-Lib. Phase D deliverable.

Runs as a long-lived Docker container on the VPS — never on Workers.

## Status

Stub. Phase D will add:

- `src/bot/exchanges/` — ccxt wrappers (Binance first)
- `src/bot/data/` — candle ingestion → TimescaleDB hypertables
- `src/bot/strategies/` — one strategy (RSI-divergence) backtested via vectorbt
- `src/bot/execution/` — signal-only mode first, then paper-trade
- `src/bot/notifier/` — Telegram pings
- `src/bot/journal/` — emit `trade-journal-*.md` artifacts into `packages/knowledge/trade-journals/`
- `src/bot/_generated/` — Pydantic models codegen'd from Zod schemas in `packages/shared-types`

Bot talks to the API over HTTP (`POST /v1/signals`), never directly to the DB except for time-series candle writes.

## Local dev

```bash
cd apps/bot
uv sync
uv run pytest
uv run python -m bot.main --paper   # not yet implemented
```

## Container

`docker compose -f infra/prod-vps/docker-compose.yml up -d bot` once the VPS is provisioned.
