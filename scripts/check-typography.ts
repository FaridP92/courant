/**
 * Typography guard: the project forbids long dashes everywhere
 * (code, UI copy, docs). Only the simple hyphen "-" is allowed.
 * Forbidden: U+2013 (en dash), U+2014 (em dash), U+2015 (horizontal bar).
 *
 * Runs natively with Node >= 24 (type stripping): `node scripts/check-typography.ts`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const FORBIDDEN = /[\u2013\u2014\u2015]/

const CHECKED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.md',
  '.json',
  '.yml',
  '.yaml',
  '.svg',
  '.txt',
  '.sql',
])

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.vercel',
])

const IGNORED_FILES = new Set(['pnpm-lock.yaml'])

export interface DashHit {
  line: number
  column: number
  codePoint: string
}

export function findForbiddenDashes(text: string): DashHit[] {
  const hits: DashHit[] = []
  const lines = text.split('\n')
  for (const [index, lineText] of lines.entries()) {
    for (const match of lineText.matchAll(new RegExp(FORBIDDEN, 'g'))) {
      const code = match[0].codePointAt(0) ?? 0
      hits.push({
        line: index + 1,
        column: match.index + 1,
        codePoint: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
      })
    }
  }
  return hits
}

export function isCheckedFile(filePath: string): boolean {
  const base = filePath.split('/').at(-1) ?? filePath
  if (IGNORED_FILES.has(base)) return false
  return CHECKED_EXTENSIONS.has(extname(base).toLowerCase())
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) walk(full, files)
    } else if (isCheckedFile(full)) {
      files.push(full)
    }
  }
  return files
}

function main(): void {
  const root = process.cwd()
  let failures = 0
  for (const file of walk(root)) {
    const hits = findForbiddenDashes(readFileSync(file, 'utf8'))
    for (const hit of hits) {
      failures += 1
      console.error(
        `${relative(root, file)}:${String(hit.line)}:${String(hit.column)} tiret long interdit (${hit.codePoint})`,
      )
    }
  }
  if (failures > 0) {
    console.error(
      `\n${String(failures)} tiret(s) long(s) interdit(s). Remplacer par un tiret simple "-".`,
    )
    process.exit(1)
  }
  console.log('Typographie OK : aucun tiret long dans le projet.')
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
