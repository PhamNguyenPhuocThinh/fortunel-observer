/**
 * Cloudflare Turnstile verifier — toggle-ready.
 *
 * Behaviour:
 * - If `TURNSTILE_SECRET_KEY` is unset, verification is bypassed (returns
 *   `{ enforced: false, ok: true }`). Local dev and early staging stay
 *   friction-free until we obtain a real Turnstile site key.
 * - If set, the token is POSTed to siteverify. Missing / invalid token →
 *   `{ enforced: true, ok: false, error }`.
 *
 * Anti-spam belt-and-suspenders: the public contact endpoint additionally
 * applies an IP-keyed rate limit. Turnstile defends against single-shot
 * bot abuse; the rate limit caps human / distributed abuse.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult {
  enforced: boolean
  ok: boolean
  error?: string
}

export interface TurnstileVerifyOpts {
  secret: string | undefined
  token: string | undefined | null
  remoteIp?: string | null
}

interface SiteVerifyResponse {
  success: boolean
  'error-codes'?: string[]
}

export async function verifyTurnstile(opts: TurnstileVerifyOpts): Promise<TurnstileResult> {
  if (!opts.secret) return { enforced: false, ok: true }
  if (!opts.token) return { enforced: true, ok: false, error: 'missing-token' }
  const body = new URLSearchParams()
  body.set('secret', opts.secret)
  body.set('response', opts.token)
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp)
  let resp: Response
  try {
    resp = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    return { enforced: true, ok: false, error: 'siteverify-unreachable' }
  }
  if (!resp.ok) return { enforced: true, ok: false, error: `siteverify-${resp.status}` }
  const json = (await resp.json().catch(() => null)) as SiteVerifyResponse | null
  if (!json) return { enforced: true, ok: false, error: 'siteverify-bad-json' }
  if (!json.success) {
    const code = json['error-codes']?.[0] ?? 'invalid-token'
    return { enforced: true, ok: false, error: code }
  }
  return { enforced: true, ok: true }
}
