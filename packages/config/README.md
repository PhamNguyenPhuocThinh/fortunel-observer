# @fortunel/config

Shared lint/type/format config. Imported by every workspace package so behavior is consistent.

## Exports

- `@fortunel/config/eslint/base` — shared ESLint flat config (TS + recommended rules + consistent type imports)
- `@fortunel/config/eslint/workers` — extends base, adds Cloudflare Workers + browser globals
- `@fortunel/config/tsconfig/base` — strict, ES2022, isolatedModules, noUncheckedIndexedAccess
- `@fortunel/config/tsconfig/workers` — extends base, adds Workers types + Hono JSX
- `@fortunel/config/tsconfig/node` — extends base, adds Node 22 types
- `@fortunel/config/prettier` — 2-space, single quotes, no trailing semicolons (TS only — Python uses ruff)
- `vitest.base.ts` — staged for Phase 4 wiring; not yet exported (no consumer until API tests land)

## Usage

Each workspace's `tsconfig.json`:

```json
{ "extends": "@fortunel/config/tsconfig/workers" }
```

Each workspace's `eslint.config.js`:

```js
export { default } from '@fortunel/config/eslint/workers'
```

## Rule

If a setting needs to differ per workspace, override in that workspace's local config — don't fork the shared one.

## Hoisting note

Tooling (`eslint`, `typescript-eslint`, `vitest`, etc.) is installed at the repo root and hoisted via `.npmrc` (`shamefully-hoist=true`). The configs in this package import those tools by bare specifier.
