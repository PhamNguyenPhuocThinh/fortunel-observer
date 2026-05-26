/**
 * Structural guard: routes/v1/*.ts must never import drizzle-orm directly.
 *
 * The repository layer owns all Drizzle calls so owner-scoping is enforced
 * by construction. A route that reaches into Drizzle bypasses that guarantee
 * and is a footgun for tenancy bleed.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROUTES_DIR = join(__dirname, '..', 'routes', 'v1')

describe('routes/v1 layer', () => {
  it('does not import drizzle-orm or @fortunel/db directly', () => {
    const offenders: string[] = []
    for (const file of readdirSync(ROUTES_DIR)) {
      if (!file.endsWith('.ts')) continue
      const src = readFileSync(join(ROUTES_DIR, file), 'utf8')
      if (/from\s+['"]drizzle-orm['"]/.test(src)) offenders.push(`${file}: imports drizzle-orm`)
      if (/from\s+['"]@fortunel\/db['"]/.test(src)) offenders.push(`${file}: imports @fortunel/db`)
    }
    expect(offenders).toEqual([])
  })
})
