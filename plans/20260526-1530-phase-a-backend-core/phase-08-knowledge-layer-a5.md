---
phase: 8
title: "Knowledge layer (A.5 parallel)"
status: pending
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 8: Knowledge layer (A.5 parallel)

## Overview

Lay down the source-material substrate that Phase E (auto content pipeline) and Phase D (bot journals) will consume. Frontmatter schemas, three content templates, and an `llms.txt` regeneration script. Pure scaffolding — no AI calls yet.

Runs in parallel with phases 4-6. Does not block Workers deploy.

## Requirements

- Functional: frontmatter Zod schemas exist for each knowledge type (trade-journal | strategy | concept | performance) and for blog post drafts
- Functional: three content templates under `content/templates/`
- Functional: `pnpm docs:llms` regenerates `docs/llms.txt` from current repo state
- Non-functional: schemas live in `@fortunel/shared-types` so bot + API + content tooling share them
- Non-functional: regen script is idempotent (running twice produces no diff)

## Architecture

```
packages/shared-types/src/knowledge/
├── trade-journal.ts            # frontmatter shape: type, date, symbol, strategy, entry, exit, pnl_pct, hypothesis, outcome, lessons
├── strategy.ts                 # type, name, params, assumptions, regimes, status
├── concept.ts                  # type, name, summary, related_concepts, sources
├── performance.ts              # type, period, pnl, drawdown_max, win_rate, sample_size
└── content-draft.ts            # type, generated_from[], status, source_material_refs[]

content/templates/
├── blog-post.md                # generic essay template
├── weekly-recap.md             # synthesizes last week's trade-journals + performance
└── trade-thesis.md             # one-trade deep-dive template

scripts/
└── generate-llms-txt.ts        # reads repo + docs + packages → emits docs/llms.txt
```

## Related Code Files

**Create:**
- All files in tree above
- `packages/shared-types/src/knowledge/index.ts` re-exporter
- `scripts/generate-llms-txt.ts`

**Modify:**
- `packages/shared-types/src/index.ts` — re-export knowledge schemas
- Root `package.json` — `docs:llms` script
- `.github/workflows/ci-ts.yml` — add `pnpm docs:llms --check` as **advisory** (warn on drift, do not fail the build — see revision note below)

## Implementation Steps

1. Define knowledge frontmatter schemas in `@fortunel/shared-types/src/knowledge/`. Each one mirrors the example in the brief.
2. Write three templates. Use stable, opinionated structure (TL;DR + Hook + Body + Takeaway per `docs/ai-content-guide.md`).
3. Write `scripts/generate-llms-txt.ts`:
   - Read existing `docs/llms.txt` structure
   - Walk `docs/`, `packages/`, `apps/` for new endpoints/resources/concepts
   - Emit a normalized llms.txt per llmstxt.org spec
   - `--check` mode: regenerate to stdout and diff against committed file; exit non-zero on diff
4. Add CI step to assert llms.txt is fresh
5. Sanity test: write a fake trade-journal file in `packages/knowledge/trade-journals/`, parse it through the Zod schema, assert it validates

## Success Criteria

- [ ] All five frontmatter schemas exported from `@fortunel/shared-types`
- [ ] Three templates exist under `content/templates/` and read sensibly
- [ ] `pnpm docs:llms` regenerates `docs/llms.txt` with no diff (idempotent)
- [ ] CI `--check` step fails on intentional manual edits to llms.txt
- [ ] A fake trade-journal validates through the Zod schema
- [ ] None of the knowledge work blocks the Phase A Workers deploy

## Risk Assessment

- **Risk:** Schemas over-specified before real bot usage. **Mitigation:** keep V1 schemas minimal — only fields the brief explicitly listed; expand when Phase D writes actual journals.
- **Risk:** llms.txt regen script becomes maintenance burden. **Mitigation:** keep generator dumb — string templates over fragile AST parsing. Acceptable for the script to be a 50-line file.
- **Risk (red-team):** strict `--check` in CI breaks unrelated PRs every time docs change. **Mitigation:** emit drift warning + non-zero summary but exit 0. Promote to hard-fail only after the generator has been stable for 4 weeks.
- **Risk:** Templates create a quality floor that's hard to escape. **Mitigation:** mark templates as starting points, not contracts; `docs/ai-content-guide.md` has the real quality bar.
- **Risk:** AI content guide exemplars still empty. **Mitigation:** flag for the user — they must seed 3-5 best posts before Phase E runs. Out of scope for Phase A.
