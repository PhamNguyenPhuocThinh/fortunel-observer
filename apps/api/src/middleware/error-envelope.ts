import type { Context, ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppBindings } from '../lib/context'

const TYPE_BASE = 'https://api.fortunel.dev/errors'

interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  instance: string
  request_id: string
}

function statusToSlug(status: number): { resource: string; slug: string } {
  if (status === 400) return { resource: 'request', slug: 'invalid' }
  if (status === 401) return { resource: 'auth', slug: 'unauthorized' }
  if (status === 403) return { resource: 'auth', slug: 'forbidden' }
  if (status === 404) return { resource: 'request', slug: 'not-found' }
  if (status === 405) return { resource: 'request', slug: 'method-not-allowed' }
  if (status === 409) return { resource: 'request', slug: 'conflict' }
  if (status === 422) return { resource: 'request', slug: 'unprocessable' }
  if (status === 429) return { resource: 'request', slug: 'rate-limited' }
  if (status >= 500) return { resource: 'server', slug: 'internal-error' }
  return { resource: 'request', slug: 'error' }
}

function buildProblem(c: Context<AppBindings>, status: number, title: string, detail?: string): Problem {
  const { resource, slug } = statusToSlug(status)
  return {
    type: `${TYPE_BASE}/${resource}/${slug}`,
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: c.req.path,
    request_id: c.get('requestId') ?? 'unknown',
  }
}

function jsonProblem(c: Context<AppBindings>, problem: Problem): Response {
  return new Response(JSON.stringify({ data: null, meta: null, errors: [problem] }), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const errorHandler: ErrorHandler<AppBindings> = (err, c) => {
  const logger = c.get('logger')

  if (err instanceof HTTPException) {
    const status = err.status
    const problem = buildProblem(c, status, err.message || 'Error')
    if (status >= 500) {
      logger?.error('http_exception', { status, msg: err.message })
    } else {
      logger?.warn('http_exception', { status, msg: err.message })
    }
    const fromException = err.getResponse?.()
    const headers = new Headers(fromException?.headers)
    headers.set('Content-Type', 'application/problem+json')
    return new Response(JSON.stringify({ data: null, meta: null, errors: [problem] }), {
      status,
      headers,
    })
  }

  logger?.error('unhandled_error', { msg: err.message, stack: err.stack })
  return jsonProblem(c, buildProblem(c, 500, 'Internal Server Error'))
}

export const notFoundHandler = (c: Context<AppBindings>): Response =>
  jsonProblem(c, buildProblem(c, 404, 'Not Found', `No route matches ${c.req.method} ${c.req.path}`))
