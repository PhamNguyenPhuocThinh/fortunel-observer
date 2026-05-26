import { describe, expect, it } from 'vitest'
import { validate } from '@scalar/openapi-parser'
import { buildApp } from '../index'

const baseEnv = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'error',
  CORS_ALLOWED_ORIGINS: 'http://localhost:4321',
  COMMIT_SHA: 'test-sha',
}

describe('GET /openapi.json', () => {
  it('emits a structurally valid OpenAPI 3.1 document', async () => {
    const app = buildApp()
    const res = await app.request('/openapi.json', { method: 'GET' }, baseEnv)
    expect(res.status).toBe(200)
    const doc = (await res.json()) as Record<string, unknown>

    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toBeTruthy()
    expect(doc.paths).toBeTruthy()
    expect((doc.paths as Record<string, unknown>)['/healthz']).toBeTruthy()

    const result = await validate(doc)
    if (!result.valid) {
      throw new Error(`OpenAPI invalid: ${JSON.stringify(result.errors, null, 2)}`)
    }
    expect(result.valid).toBe(true)
    expect(result.version).toBe('3.1')
  })

  it('registers the bearerApiKey security scheme', async () => {
    const app = buildApp()
    const res = await app.request('/openapi.json', { method: 'GET' }, baseEnv)
    const doc = (await res.json()) as {
      components?: { securitySchemes?: Record<string, { type: string; scheme: string }> }
    }
    expect(doc.components?.securitySchemes?.bearerApiKey?.scheme).toBe('bearer')
  })
})

describe('GET /docs', () => {
  it('serves Scalar HTML', async () => {
    const app = buildApp()
    const res = await app.request('/docs', { method: 'GET' }, baseEnv)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('openapi.json')
  })
})
