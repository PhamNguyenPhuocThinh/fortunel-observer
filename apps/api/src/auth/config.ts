/**
 * Better Auth instance — email/password + GitHub OAuth.
 *
 * Built per-request and cached against the env binding (each Worker isolate
 * sees a single env object). neon-http is stateless so re-binding is cheap,
 * but instantiating the BA handler is not — hence the WeakMap.
 *
 * Caveats codified here:
 *   - `cookieCache: { enabled: false }` — BA bug #4203 keeps expired cookies
 *     live. We use our own KV-backed session cache (see session-cache.ts).
 *   - Drizzle schema uses plural table names; `usePlural: true` maps them.
 *   - No `verifications` table exists. Email verification, password reset, and
 *     OTP plugins are intentionally disabled for Phase A.
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createClient, type Database } from '@fortunel/db'
import * as schema from '@fortunel/db'

interface AuthEnv {
  DATABASE_URL?: string
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

export type Auth = ReturnType<typeof buildAuth>

interface AuthBundle {
  auth: Auth
  db: Database
}

const cache = new WeakMap<object, AuthBundle>()

function buildAuth(db: Database, env: AuthEnv) {
  const options: BetterAuthOptions = {
    secret: env.BETTER_AUTH_SECRET ?? 'dev-insecure-secret-change-me',
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      // Phase A: no email verification gate. Sign-up creates an active user.
      requireEmailVerification: false,
    },
    session: {
      // Bug #4203 — disable BA's built-in cookie cache. We layer our own
      // KV write-through cache in auth/session-cache.ts.
      cookieCache: { enabled: false },
    },
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : undefined,
  }
  return betterAuth(options)
}

export function getAuth(env: Record<string, unknown>): AuthBundle {
  const cached = cache.get(env)
  if (cached) return cached
  const url = (env as AuthEnv).DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set; cannot initialize Better Auth')
  }
  const db = createClient(url)
  const auth = buildAuth(db, env as AuthEnv)
  const bundle: AuthBundle = { auth, db }
  cache.set(env, bundle)
  return bundle
}
