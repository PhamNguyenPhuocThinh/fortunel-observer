import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const docsDir = resolve(repoRoot, 'docs')
const outFile = resolve(docsDir, 'llms.txt')

const TITLE = 'fortunel-observer'
const TAGLINE =
  "Agent-first headless platform: a solopreneur's personal brand site, REST + MCP API, and trading bot. " +
  'Single-tenant V1 with multi-tenant-ready data model. API is the product — UI, MCP, and bot are all clients of the same versioned surface.'
const INTRO =
  'Stack: TypeScript (Hono) on Cloudflare Workers, Drizzle on Postgres (Neon → VPS), Astro 5 web, Python trading bot.'

const DOC_SECTIONS: Array<{ title: string; files: string[] }> = [
  {
    title: 'Architecture',
    files: ['system-architecture.md', 'api-design.md', 'code-standards.md'],
  },
  {
    title: 'Product',
    files: ['project-overview-pdr.md', 'project-roadmap.md', 'ai-content-guide.md'],
  },
  {
    title: 'Operations',
    files: ['deployment-guide.md', 'project-changelog.md'],
  },
]

const OPTIONAL_FILES = ['llms-full.txt']

const readH1AndIntro = async (
  absPath: string,
): Promise<{ title: string; description: string }> => {
  if (!existsSync(absPath)) return { title: '', description: '' }
  const text = await readFile(absPath, 'utf8')
  const lines = text.split(/\r?\n/)
  let title = ''
  let descLines: string[] = []
  let sawH1 = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!sawH1) {
      const m = /^#\s+(.+?)\s*$/.exec(line)
      if (m) {
        title = m[1]
        sawH1 = true
      }
      continue
    }
    if (line === '') {
      if (descLines.length > 0) break
      continue
    }
    if (line.startsWith('#')) break
    descLines.push(line)
    if (descLines.join(' ').length > 200) break
  }
  const description = firstSentence(descLines.join(' ').replace(/\s+/g, ' '))
  return { title, description }
}

const firstSentence = (s: string): string => {
  const trimmed = s.trim()
  if (trimmed === '') return ''
  const m = /^(.+?[.!?])(\s|$)/.exec(trimmed)
  return (m ? m[1] : trimmed).slice(0, 200)
}

const titleFromFilename = (filename: string): string =>
  filename
    .replace(/\.[^.]+$/, '')
    .split('-')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')

type Section = { title: string; items: string[] }

const buildDocSection = async (
  title: string,
  files: string[],
): Promise<Section> => {
  const items: string[] = []
  for (const file of files) {
    const abs = resolve(docsDir, file)
    const { title: h1, description } = await readH1AndIntro(abs)
    const linkText = h1 !== '' ? h1 : titleFromFilename(file)
    const tail = description !== '' ? `: ${description}` : ''
    items.push(`- [${linkText}](${file})${tail}`)
  }
  return { title, items }
}

const buildOptionalSection = async (): Promise<Section> => {
  const items: string[] = []
  for (const file of OPTIONAL_FILES) {
    const abs = resolve(docsDir, file)
    if (!existsSync(abs)) continue
    items.push(`- [${file}](${file}): expanded reference for deeper AI context.`)
  }
  return { title: 'Optional', items }
}

const listWorkspaceDir = async (
  relDir: string,
): Promise<Array<{ name: string; relPath: string }>> => {
  const absDir = resolve(repoRoot, relDir)
  if (!existsSync(absDir)) return []
  const entries = await readdir(absDir, { withFileTypes: true })
  const out: Array<{ name: string; relPath: string }> = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const pkgJson = resolve(absDir, e.name, 'package.json')
    if (!existsSync(pkgJson)) continue
    const pkg = JSON.parse(await readFile(pkgJson, 'utf8')) as {
      name?: string
      description?: string
    }
    const name = pkg.name ?? e.name
    out.push({ name, relPath: `${relDir}/${e.name}` })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

const buildWorkspaceSection = async (
  title: string,
  relDir: string,
): Promise<Section> => {
  const entries = await listWorkspaceDir(relDir)
  const items: string[] = []
  for (const { name, relPath } of entries) {
    const readmePath = resolve(repoRoot, relPath, 'README.md')
    const pkgJsonPath = resolve(repoRoot, relPath, 'package.json')
    let description = ''
    if (existsSync(readmePath)) {
      const { description: readmeDesc } = await readH1AndIntro(readmePath)
      description = readmeDesc
    }
    if (description === '' && existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8')) as {
        description?: string
      }
      description = pkg.description ?? ''
    }
    const tail = description !== '' ? `: ${description}` : ''
    items.push(`- [${name}](${relPath})${tail}`)
  }
  return { title, items }
}

const renderSection = (s: Section): string => {
  if (s.items.length === 0) return ''
  return `## ${s.title}\n\n${s.items.join('\n')}\n`
}

const renderLlmsTxt = async (): Promise<string> => {
  const docSections: Section[] = []
  for (const { title, files } of DOC_SECTIONS) {
    docSections.push(await buildDocSection(title, files))
  }
  const packages = await buildWorkspaceSection('Packages', 'packages')
  const apps = await buildWorkspaceSection('Apps', 'apps')
  const optional = await buildOptionalSection()

  const parts: string[] = []
  parts.push(`# ${TITLE}\n`)
  parts.push(`> ${TAGLINE}\n`)
  parts.push(`${INTRO}\n`)
  for (const s of docSections) {
    const rendered = renderSection(s)
    if (rendered !== '') parts.push(rendered)
  }
  const pkgRendered = renderSection(packages)
  if (pkgRendered !== '') parts.push(pkgRendered)
  const appsRendered = renderSection(apps)
  if (appsRendered !== '') parts.push(appsRendered)
  const optRendered = renderSection(optional)
  if (optRendered !== '') parts.push(optRendered)

  return parts.join('\n')
}

const runGenerate = async (): Promise<void> => {
  const content = await renderLlmsTxt()
  await writeFile(outFile, content, 'utf8')
  console.log(`✓ Wrote ${outFile}`)
}

const runCheck = async (): Promise<void> => {
  const fresh = await renderLlmsTxt()
  const committed = existsSync(outFile) ? await readFile(outFile, 'utf8') : ''
  if (fresh === committed) {
    console.log('✓ docs/llms.txt is up to date')
    return
  }
  console.error('docs/llms.txt drift detected — run `pnpm docs:llms` and commit.')
  const freshLines = fresh.split('\n')
  const committedLines = committed.split('\n')
  const max = Math.max(freshLines.length, committedLines.length)
  let shown = 0
  for (let i = 0; i < max && shown < 20; i += 1) {
    if (freshLines[i] !== committedLines[i]) {
      console.error(`  L${i + 1}: committed=${JSON.stringify(committedLines[i] ?? '')}`)
      console.error(`         fresh    =${JSON.stringify(freshLines[i] ?? '')}`)
      shown += 1
    }
  }
  process.exit(1)
}

const isCheck = process.argv.includes('--check')
const main = isCheck ? runCheck : runGenerate
main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
