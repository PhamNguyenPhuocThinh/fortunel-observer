# AI Content Guide

This document teaches AI drafters (Claude, ChatGPT, custom agents) how to write content **for this brand**. It is read by humans when reviewing drafts and by AI when generating them. If you don't like the tone of a generated draft, fix this guide first, then regenerate.

## Tone

- **Direct.** Subject + verb + object. Cut hedging adverbs ("very", "really", "just").
- **Concrete.** Numbers over adjectives. "p95 latency dropped from 340 ms to 110 ms" — not "much faster".
- **Honest about trade-offs.** If a choice has a downside, name it. Readers trust writers who admit cost.
- **Calm.** No exclamation marks (except in code). No "game-changer", no "revolutionary".

## Structure

Every long-form post:

1. **TL;DR** — 2-4 sentences at the very top. Reader should be able to skip the rest and still leave with the main idea.
2. **Hook** — one paragraph framing the problem. Specific, not abstract. "I lost 3 hours debugging X" beats "developers often struggle with Y".
3. **Body** — H2 sections, each with a clear claim in the heading. Code blocks for code, tables for comparisons, blockquotes for pull-quotes.
4. **Takeaway** — one paragraph. What the reader should remember in a week.

Short posts (< 600 words) may skip the TL;DR but still need a Takeaway.

## Banned phrases

These are auto-flagged in draft review. Rewrite or cut.

- "In conclusion," / "To summarize,"
- "It's important to note that"
- "At the end of the day,"
- "Game-changer", "revolutionary", "next-level", "10x"
- "Crushing it", "leveling up"
- "Effortlessly", "seamlessly", "robust" (without measurement)
- "Best practice" without a citation or measurement
- Em-dashes used as commas (we use them sparingly)
- Emoji in body copy. Headings only, and only when the emoji genuinely disambiguates (rare).

## Required phrases

- When stating "fastest" / "cheapest" / "best", include the measurement window and what was compared.
- When recommending a tool, name the alternative we ruled out and why.

## Code blocks

- Always specify the language: ```ts, ```bash, ```sql.
- Real, runnable snippets. No `// ... rest of the code` ellipses unless explicitly marking a known omission with `// (logging omitted for brevity)`.
- Outputs labelled: `# output:` comment on the line before stdout.

## Source material

AI drafters read from:

- `packages/knowledge/strategies/` — trading strategy specs.
- `packages/knowledge/trade-journals/` — executed trades with hypothesis + outcome.
- `packages/knowledge/concepts/` — technical write-ups (architectures, algorithms).
- `packages/knowledge/performance/` — weekly bot performance dumps.
- `content/templates/` — post archetypes (digest, retro, deep dive).

A draft must cite at least one specific artifact by file path. No artifact, no draft.

## Drafting workflow

```
[ knowledge/ + templates/ + this guide ]
                 |
                 v
       AI generates content/drafts/YYYY-MM-DD-<slug>.md
                 |
                 v
       Human reviews, edits, fixes voice
                 |
                 v
       Move to content/blog/  ->  POST /v1/posts  ->  publish
```

The AI never writes directly to `content/blog/`. Drafts always pass through human review.

## Examples to imitate

Populate this list with 3-5 of **your own** best posts as exemplars. Until then, here is the spec for what to imitate:

- *(placeholder)* `content/blog/example-deep-dive.md` — long-form technical deep dive structure.
- *(placeholder)* `content/blog/example-weekly-digest.md` — weekly trade-journal digest structure.
- *(placeholder)* `content/blog/example-retro.md` — incident retro structure.

When real examples exist, replace the placeholders and tell the drafter "imitate the cadence and section structure of these three posts".

## Length norms

| Type | Word count | Reading time |
|---|---|---|
| Weekly digest | 400-700 | 2-4 min |
| Deep dive | 1200-2500 | 6-12 min |
| Incident retro | 800-1500 | 4-7 min |
| Quick note | 200-400 | 1-2 min |

Drafts outside these bands need an explicit reason in the frontmatter `length_justification:` field.

## Frontmatter required

```yaml
---
title: "..."
slug: "..."
type: "deep-dive | digest | retro | note"
draft_date: 2026-05-26
generated_from:
  - packages/knowledge/trade-journals/2026-05-25-btc-long.md
  - packages/knowledge/performance/2026-w21-summary.md
status: draft   # draft | reviewing | ready | published
ai_model: "claude-opus-4-7"
length_justification: ""
---
```

## When AI should refuse to draft

- Less than 2 cited artifacts available for the requested topic.
- Topic outside the established pillars (until pillar topics are decided, this check is paused).
- Source artifacts contradict each other and no `concepts/` entry resolves the conflict.

A refused draft writes a `content/drafts/_refused-YYYY-MM-DD-<reason>.md` stub explaining what was missing.
