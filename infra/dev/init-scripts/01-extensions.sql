-- Runs once on first container boot (Postgres ignores it on subsequent
-- boots while the data volume exists - that's expected).
--
-- Phase D adds the candle hypertable; the extension is provisioned now so
-- dev environments match prod-on-VPS from day one.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
