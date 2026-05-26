import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z, type ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

import * as shared from '../src/index'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const outDir = resolve(pkgRoot, 'json-schema')

const isZodSchema = (value: unknown): value is ZodTypeAny =>
  value instanceof z.ZodType

const camelToKebab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const fileNameFor = (exportName: string) => {
  const base = exportName.endsWith('Schema')
    ? exportName.slice(0, -'Schema'.length)
    : exportName
  return `${camelToKebab(base)}.json`
}

const collectSchemas = (): Array<{ name: string; schema: ZodTypeAny }> => {
  const entries: Array<{ name: string; schema: ZodTypeAny }> = []
  for (const [name, value] of Object.entries(shared)) {
    if (!name.endsWith('Schema')) continue
    if (!isZodSchema(value)) {
      throw new Error(
        `Export "${name}" matches *Schema convention but is not a ZodType. ` +
          `Either rename it or make it a Zod schema so drift detection covers it.`,
      )
    }
    entries.push({ name, schema: value })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

const writeSchemas = async (dir: string) => {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const schemas = collectSchemas()
  if (schemas.length === 0) throw new Error('No *Schema exports found')
  for (const { name, schema } of schemas) {
    const json = zodToJsonSchema(schema, { name, target: 'jsonSchema7' })
    const fileName = fileNameFor(name)
    await writeFile(join(dir, fileName), `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  }
  return schemas.map(({ name }) => fileNameFor(name))
}

const readAll = async (dir: string) => {
  if (!existsSync(dir)) return new Map<string, string>()
  const files = await readdir(dir)
  const out = new Map<string, string>()
  for (const f of files.sort()) {
    out.set(f, await readFile(join(dir, f), 'utf8'))
  }
  return out
}

const runCheck = async () => {
  const tempDir = resolve(pkgRoot, '.json-schema-check')
  await writeSchemas(tempDir)
  const committed = await readAll(outDir)
  const fresh = await readAll(tempDir)
  await rm(tempDir, { recursive: true, force: true })

  const diffs: string[] = []
  const allFiles = new Set([...committed.keys(), ...fresh.keys()])
  for (const f of [...allFiles].sort()) {
    const a = committed.get(f)
    const b = fresh.get(f)
    if (a === undefined) diffs.push(`+ ${f} (missing on disk; run codegen)`)
    else if (b === undefined) diffs.push(`- ${f} (stale; delete via regen)`)
    else if (a !== b) diffs.push(`~ ${f} (drift; run codegen)`)
  }
  if (diffs.length > 0) {
    console.error('JSON Schema drift detected:')
    for (const d of diffs) console.error(`  ${d}`)
    process.exit(1)
  }
  console.log(`✓ ${committed.size} JSON Schema artifacts up to date`)
}

const runGenerate = async () => {
  const files = await writeSchemas(outDir)
  console.log(`✓ Wrote ${files.length} JSON Schema files to ${outDir}`)
}

const isCheck = process.argv.includes('--check')
const main = isCheck ? runCheck : runGenerate
main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
