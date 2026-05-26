# @fortunel/web

Personal brand site — Astro 5 + React islands + Tailwind v4 + shadcn/ui. Phase C deliverable.

## Status

Stub. Phase C will scaffold:

- `astro.config.mjs` with `@astrojs/react`, `@astrojs/tailwind`, `@astrojs/sitemap`, `@astrojs/rss`
- Pages: `/`, `/about`, `/work`, `/blog`, `/blog/[slug]`, `/contact`
- React islands for the dashboard (`/app`) added in Phase D
- Auth via Better Auth SDK pointed at `apps/api`
- All data fetched from REST API — **never** read from DB directly

## Rule

Headless contract: deleting this app must not break any feature. Web is one client of the API, not the API.

## Deploy

Cloudflare Pages, custom domain `fortunel.dev` (placeholder). Build command `pnpm --filter @fortunel/web build`, output `dist/`.
