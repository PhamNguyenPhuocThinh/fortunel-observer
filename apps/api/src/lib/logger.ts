type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug: (msg: string, fields?: Record<string, unknown>) => void
  info: (msg: string, fields?: Record<string, unknown>) => void
  warn: (msg: string, fields?: Record<string, unknown>) => void
  error: (msg: string, fields?: Record<string, unknown>) => void
  child: (extra: Record<string, unknown>) => Logger
}

export function createLogger(opts: {
  level: Level
  base?: Record<string, unknown>
}): Logger {
  const threshold = ORDER[opts.level]
  const base = opts.base ?? {}

  function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
    if (ORDER[level] < threshold) return
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...(fields ?? {}),
    }
    const line = JSON.stringify(entry)
    if (level === 'error' || level === 'warn') {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (extra) => createLogger({ level: opts.level, base: { ...base, ...extra } }),
  }
}
