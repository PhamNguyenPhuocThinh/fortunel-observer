import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  COMMIT_SHA: z.string().default('dev'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(100000).default(100),
  DATABASE_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
})

type ParsedEnv = z.infer<typeof envSchema>

export type RuntimeEnv = ParsedEnv & {
  RATE_LIMIT?: KVNamespace
  SESSION_CACHE?: KVNamespace
}

const cache = new WeakMap<object, ParsedEnv>()

export function parseEnv(raw: Record<string, unknown>): ParsedEnv {
  const cached = cache.get(raw)
  if (cached) return cached
  const parsed = envSchema.parse(raw)
  // Fail fast on misconfigured deploys. In dev the API still boots without a
  // DB so unit tests and local exploration work, but staging/production must
  // surface the gap immediately rather than 500-ing the first /v1 request.
  if (parsed.NODE_ENV !== 'development' && !parsed.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when NODE_ENV is staging or production')
  }
  cache.set(raw, parsed)
  return parsed
}

export function corsOrigins(env: ParsedEnv): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
