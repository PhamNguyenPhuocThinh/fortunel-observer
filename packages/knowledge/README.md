# packages/knowledge

Source material for the AI content pipeline. Bot writes here, humans edit here, the content drafter reads from here. See `docs/ai-content-guide.md` for tone and structure rules.

## Layout

```
strategies/        — long-form notes about why a strategy was tried, what it assumes, when it fails
trade-journals/    — one file per closed trade, frontmatter + freeform notes (bot auto-emits, human appends)
concepts/          — durable mental models (market regimes, risk frameworks, indicators-in-context)
performance/       — periodic numerical snapshots (weekly P&L, drawdown, win rate)
```

## Frontmatter contract

Every file MUST start with a YAML frontmatter block. Required fields vary by type — see the Zod schemas in `@fortunel/shared-types` once they exist. Common fields:

```yaml
---
type: trade-journal | strategy | concept | performance
date: 2026-05-26          # ISO 8601
owner_id: <uuid>          # tenant scoping, future-proofing
tags: [btc, rsi]
status: draft | published | archived
---
```

## What does NOT belong here

- Published blog posts → `content/blog/`
- AI drafts awaiting review → `content/drafts/`
- Code, secrets, credentials, API responses

## Why split source material from published content?

Knowledge is raw evidence with full context (numbers, hypotheses, what was wrong). Published content is the cleaned narrative. Mixing them corrupts both: source loses honesty, content loses readability.
