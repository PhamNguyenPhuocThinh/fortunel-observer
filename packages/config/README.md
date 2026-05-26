# @fortunel/config

Shared lint/type/format config. Imported by every workspace package so behavior is consistent.

## Phase A exports (planned)

- `eslint/base.js` — shared ESLint flat config (TS, import order, no-floating-promises)
- `eslint/api.js` — extends base, adds Cloudflare Workers globals
- `eslint/web.js` — extends base, adds Astro + React
- `tsconfig/base.json` — strict, ES2022, isolatedModules, noUncheckedIndexedAccess
- `tsconfig/workers.json` — extends base, Workers types
- `tsconfig/node.json` — extends base, Node 22 types
- `prettier.config.js` — 2-space, single quotes, no semi-colons-at-end (TS only — Python uses ruff)

## Rule

If a setting needs to differ per workspace, override in that workspace's local config — don't fork the shared one.
