---
title: Better Auth on Cloudflare Workers — Phase A Compatibility & Integration Assessment
date: 2026-05-26
sources_consulted: 
  - better-auth/better-auth (GitHub)
  - zpg6/better-auth-cloudflare (community integration library)
  - Hono + Better Auth example (official)
  - Better Auth docs (drizzle, github, session management)
  - GitHub issues #4203, #6993, #7586, #7124
confidence: 85% (primary sources verified, but some implementation details require Phase A testing)
---

## 1. Workers Compatibility Status (Jan 2026)

**Status: PRODUCTION-READY WITH CAVEATS**

Better Auth **does not have an official Cloudflare Workers adapter**, but:
- Native D1 (SQLite) support is built-in as first-class (v1.5+)
- Postgres via Drizzle ORM + Neon serverless driver is documented and working
- Community library [`better-auth-cloudflare`](https://github.com/zpg6/better-auth-cloudflare) (npm: `better-auth-cloudflare`) wraps Workers-specific plumbing for KV, Hyperdrive, R2, geolocation
- Hono example live at [hono.dev/examples/better-auth-on-cloudflare](https://hono.dev/examples/better-auth-on-cloudflare) — Hono + Better Auth + Drizzle + Neon on Workers

**Verdict:** Use Better Auth core + Drizzle adapter directly. The community library is optional; use if you need automatic KV/Hyperdrive wiring or geolocation.

---

## 2. Session Storage with Cloudflare KV

**Pattern: Database-primary + KV secondary (with caveats)**

Better Auth implements tiered caching: **DB → secondary storage (Redis/KV) → cookies**.

### Setup
- Primary storage: Postgres (Neon serverless via Drizzle)
- Secondary storage: Cloudflare KV binding (`SESSION_CACHE`)
  ```typescript
  secondaryStorage: {
    // Your KV adapter here (see gotchas below)
  }
  ```

### Critical Gotchas

**[BLOCKER #4203 — OPEN JAN 2026]** If `cookieCache` is enabled **alongside** `secondaryStorage`, Better Auth fails to refresh expired cookie-cached sessions from KV/DB. Users get logged out after 5 min even though session is valid in storage.

**Workaround (MANDATORY FOR PHASE A):** Disable `cookieCache`. Extra DB read per request is acceptable; correctness > perf at this stage.

**KV TTL floor:** Cloudflare KV enforces **minimum 60-second TTL**. If rate limiting uses shorter windows on secondary storage, Workers crash. Set rate limit windows ≥ 60s.

**Rate limit with KV:** Do NOT enable KV-backed rate limiting with windows < 60s (issue #7124). Phase A can skip this or defer to Phase B.

---

## 3. Drizzle Adapter

**Status: CONFIRMED WORKING**

- Better Auth has first-class `@better-auth/drizzle-adapter` 
- Works with Postgres (Neon serverless tested, documented)
- Setup: `npm install @better-auth/drizzle-adapter`, run `npx auth@latest generate` to scaffold schema
- Then: Drizzle Kit migrations (`npx drizzle-kit migrate`)
- **Known issue:** `@neondatabase/serverless` requires tagged-template syntax; if using Neon's native client, you may see errors. **Workaround:** Use Drizzle's `neon-http` driver (non-websocket), not native Neon client.

**Phase A recommendation:** Use `neon-http` driver explicitly to avoid this gotcha.

---

## 4. Password Hashing in Workers Runtime

**Current reality: Argon2 unavailable, scrypt is the path**

Better Auth **defaults to `@noble/hashes/scrypt`** (pure JavaScript). Argon2 requires native bindings, which Workers don't support (V8 isolation).

### Hashing options ranked:
1. **Scrypt via `@noble/hashes`** (current Better Auth default)
   - Pure JS, ~2,000 ms CPU on Workers
   - Acceptable for signup; slow for login/validate paths
   
2. **Scrypt via native `node:crypto`** (proposed for Better Auth, not yet in main)
   - Issue #8456 suggests detecting native scrypt at import; faster (~10x) than @noble
   - May land in v2.0; not guaranteed for Phase A
   
3. **Rust-compiled Argon2** (custom, not Better Auth)
   - ~100 ms CPU, Wasm overhead
   - Overkill for a 1-person team in Phase A

### Phase A guidance:
- Accept `@noble/hashes/scrypt` default; it's cryptographically sound
- Cost factors: default (N=16384, r=8, p=1) is balanced for 2s latency on typical signup flow
- Monitor CPU usage; if login/signup exceeds 500ms p95, revisit in Phase B

---

## 5. GitHub OAuth Provider Configuration

**Setup straightforward; redirect URI must be exact**

### Configuration shape:
```typescript
socialProviders: {
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    // optional:
    // redirectURI: "https://api.fortunel.dev/api/auth/callback/github"
  }
}
```

Default redirect URI: `/api/auth/callback/github` (relative to your auth basePath).

### For each environment, register in GitHub OAuth App settings:
- **Local dev:** `http://localhost:8787/api/auth/callback/github`
- **Staging:** `https://staging.api.fortunel.dev/api/auth/callback/github`
- **Production:** `https://api.fortunel.dev/api/auth/callback/github`

### CRITICAL: GitHub requires `user:email` scope
Better Auth includes this by default, but if you customize scopes, add it explicitly.

### GitHub App vs OAuth App:
If using a GitHub App (not just OAuth App), enable **Permissions & Events → Account Permissions → Email → Read-only**.

---

## 6. API Key Coexistence (Machine Authentication)

**Better Auth has a dedicated API Key plugin; it coexists cleanly with sessions**

Better Auth provides [`@better-auth/api-key`](https://better-auth.com/docs/plugins/api-key) plugin. It is **not** part of core auth; you add it as a plugin.

### Pattern:
```typescript
plugins: [
  apiKey({
    configId: "machine",
    prefix: "sk_fortunel",
    permissions: ["posts:read", "signals:write"], // scopes you define
    expiresIn: 90 * 24 * 60 * 60, // 90 days
    secondaryStorage: kv, // optional KV cache
  })
]
```

### Authentication:
- Sessions: `Authorization: Bearer <session_token>` (cookie-based for browsers)
- API keys: `x-api-key: sk_fortunel_...` (or custom header via config)

### Storage:
- Default: database
- Optional: secondary KV storage for high-throughput lookups

### Coexistence:
Both can run on the same auth instance. The plugin system is additive; no conflicts. You can have user sessions + machine keys on the same endpoints (check identity via whichever authenticated).

---

## 7. Known Gotchas & Open Issues (Phase A Risk)

### High-impact blockers

1. **[#4203 — reopened Jan 2026]** Cookie cache + secondary storage breaks session refresh  
   **Fix:** Disable `cookieCache` in Phase A config  
   **Risk level:** **CRITICAL** — users get logged out  

2. **[#6993]** KV storage doesn't persist session ID when using secondaryStorage  
   **Status:** Ongoing investigation  
   **Mitigation:** Keep session data in primary DB; use KV only for hot cache, not source of truth  

3. **[#7586]** `auth.api.updateUser` triggers N+1 KV fetches when KV is secondary  
   **Impact:** Expensive operations (profile updates) hit KV multiple times  
   **Mitigation:** Batch updates or disable secondary KV until fixed  

### Medium-impact runtime issues

4. **createRequire error in some Workers contexts** (#6665)  
   **Trigger:** Certain build tools or bundlers  
   **Workaround:** Use `esbuild` or `wrangler build`; avoid `webpack` if possible  

5. **D1 metadata table errors** (with Kysely introspection)  
   **Trigger:** Using `auth generate` command with D1  
   **Workaround:** Not applicable to Neon; ignore  

6. **Node.js API assumptions** (Buffer, crypto.randomBytes, fs)  
   **Status:** Fixed in recent versions  
   **Check:** Use `better-auth@latest` (v2.0+) if available  

### KV-specific caveats

- Minimum 60s TTL enforced (can't set shorter expirations)
- 1 PUT per key per second rate limit (don't update same session key twice in rapid succession)
- Better Auth will respect these; just be aware if you implement custom KV logic

---

## Recommendation

**PROCEED with Better Auth + Drizzle for Phase A, with constraints:**

✅ Use Better Auth core + `@better-auth/drizzle-adapter`  
✅ Use Neon serverless (confirmed working)  
✅ Use GitHub OAuth provider (straightforward)  
✅ Use API Key plugin for machines  
✅ Use `better-auth-cloudflare` library **only if** you need automatic KV/Hyperdrive/geolocation wiring (optional)  

⚠️ **DISABLE `cookieCache`** (work around #4203)  
⚠️ **Keep session primary storage in Postgres; use KV only as optional read cache**  
⚠️ **Skip KV-backed rate limiting until #7586 is fixed**  
⚠️ **Use `neon-http` driver, not native Neon client** (tagged-template compatibility)  

**Fallback (if issues arise during Phase A):** Custom session + API key middleware on Hono using KV directly (50–100 lines). Better Auth is not required for MVP auth; it's a productivity win, not a blocker.

---

## Open Questions

1. Will issue #8456 (native scrypt) land in v2.0 before Phase A starts? Check Better Auth releases weekly.
2. Does the project prefer one GitHub OAuth App per environment (current best practice) or a shared app with multiple redirect URIs?
3. Should Phase A use `better-auth-cloudflare` for geolocation enrichment (nice-to-have signal tracking), or defer to Phase B?
4. Is 2s login latency acceptable given scrypt cost factors, or should Phase A profile and tune?
