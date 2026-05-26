import { describe, expect, it } from 'vitest'
import {
  conceptFrontmatterSchema,
  contentDraftFrontmatterSchema,
  performanceFrontmatterSchema,
  strategyFrontmatterSchema,
  tradeJournalFrontmatterSchema,
} from '../index'

describe('knowledge frontmatter schemas', () => {
  it('trade-journal accepts a realistic entry', () => {
    const parsed = tradeJournalFrontmatterSchema.safeParse({
      type: 'trade-journal',
      date: '2026-05-25',
      symbol: 'BTC-USDT',
      strategy: 'mean-reversion-rsi',
      entry: 67100.5,
      exit: 68250.0,
      pnl_pct: 1.71,
      hypothesis: 'RSI < 30 on 4h with no macro news → bounce to 20-EMA.',
      outcome: 'Bounce hit 20-EMA in 18h, stop never threatened.',
      lessons: ['Sized too small relative to confidence.', 'Exit was a touch early.'],
      tags: ['btc', 'rsi'],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.status).toBe('draft')
  })

  it('trade-journal rejects non-ISO date and missing required fields', () => {
    expect(
      tradeJournalFrontmatterSchema.safeParse({
        type: 'trade-journal',
        date: '05/25/2026',
        symbol: 'BTC',
        strategy: 's',
        entry: 1,
        exit: 1,
        pnl_pct: 0,
        hypothesis: 'h',
        outcome: 'o',
      }).success,
    ).toBe(false)

    expect(
      tradeJournalFrontmatterSchema.safeParse({
        type: 'trade-journal',
        date: '2026-05-25',
      }).success,
    ).toBe(false)
  })

  it('strategy enforces type literal and status enum', () => {
    expect(
      strategyFrontmatterSchema.safeParse({
        type: 'strategy',
        name: 'mean-reversion-rsi',
        params: { period: 14, oversold: 30 },
        assumptions: ['no major news in window'],
        regimes: ['range'],
        status: 'live',
      }).success,
    ).toBe(true)
    expect(
      strategyFrontmatterSchema.safeParse({
        type: 'strategy',
        name: 'x',
        status: 'wat',
      }).success,
    ).toBe(false)
  })

  it('concept requires name + summary', () => {
    expect(
      conceptFrontmatterSchema.safeParse({
        type: 'concept',
        name: 'regime-detection',
        summary: 'Classify markets as trend/range/chop before sizing.',
      }).success,
    ).toBe(true)
    expect(
      conceptFrontmatterSchema.safeParse({ type: 'concept', name: 'x' }).success,
    ).toBe(false)
  })

  it('performance: drawdown is non-positive, win_rate is 0..1', () => {
    expect(
      performanceFrontmatterSchema.safeParse({
        type: 'performance',
        period: '2026-W21',
        pnl: 423.5,
        drawdown_max: -82.1,
        win_rate: 0.57,
        sample_size: 14,
      }).success,
    ).toBe(true)
    expect(
      performanceFrontmatterSchema.safeParse({
        type: 'performance',
        period: '2026-W21',
        pnl: 0,
        drawdown_max: 50,
        win_rate: 0.5,
        sample_size: 1,
      }).success,
    ).toBe(false)
    expect(
      performanceFrontmatterSchema.safeParse({
        type: 'performance',
        period: '2026-W21',
        pnl: 0,
        drawdown_max: -1,
        win_rate: 1.5,
        sample_size: 1,
      }).success,
    ).toBe(false)
  })

  it('content-draft requires at least one source artifact', () => {
    expect(
      contentDraftFrontmatterSchema.safeParse({
        type: 'content-draft',
        generated_from: ['packages/knowledge/trade-journals/2026-05-25-btc.md'],
      }).success,
    ).toBe(true)
    expect(
      contentDraftFrontmatterSchema.safeParse({
        type: 'content-draft',
        generated_from: [],
      }).success,
    ).toBe(false)
  })
})
