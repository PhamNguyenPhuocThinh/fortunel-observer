import { describe, expect, it } from 'vitest'

describe('apps/api smoke', () => {
  it('wires vitest + tsconfig + workspace deps', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs under strict TS (noUncheckedIndexedAccess on)', () => {
    const xs: readonly number[] = [1, 2, 3]
    const first = xs[0]
    expect(first).toBe(1)
  })
})
