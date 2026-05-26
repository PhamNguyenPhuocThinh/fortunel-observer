# syntax=docker/dockerfile:1.7
# Phase D stub. Fleshed out when bot implementation lands.

FROM python:3.12-slim AS base

# System deps for TA-Lib + numpy/pandas wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      ca-certificates \
      libta-lib0 \
  && rm -rf /var/lib/apt/lists/*

# uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv

WORKDIR /app

# Cache deps separately from source
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project || uv sync

COPY src ./src

# Bot writes journal artifacts to a mounted volume from the host
ENV BOT_JOURNAL_DIR=/data/knowledge

CMD ["uv", "run", "python", "-m", "bot.main"]
