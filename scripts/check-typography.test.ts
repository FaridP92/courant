// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findForbiddenDashes, isCheckedFile } from './check-typography.ts'

describe('findForbiddenDashes', () => {
  it('flags an em dash (U+2014)', () => {
    const hits = findForbiddenDashes('un texte \u2014 avec tiret long')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ line: 1, codePoint: 'U+2014' })
  })

  it('flags an en dash (U+2013)', () => {
    const hits = findForbiddenDashes('pages 12\u201324')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.codePoint).toBe('U+2013')
  })

  it('flags a horizontal bar (U+2015)', () => {
    const hits = findForbiddenDashes('citation \u2015 auteur')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.codePoint).toBe('U+2015')
  })

  it('reports the correct line and column on multiline input', () => {
    const hits = findForbiddenDashes('ligne un\nabc \u2014 def')
    expect(hits[0]).toMatchObject({ line: 2, column: 5 })
  })

  it('accepts simple hyphens, middle dots and clean French text', () => {
    const clean = 'tiret simple - accepte · rien à signaler, gros-porteur'
    expect(findForbiddenDashes(clean)).toHaveLength(0)
  })

  it('flags every occurrence, not just the first', () => {
    const hits = findForbiddenDashes('\u2014 a \u2013 b \u2014')
    expect(hits).toHaveLength(3)
  })
})

describe('isCheckedFile', () => {
  it('checks source, style, doc and config files', () => {
    for (const f of [
      'src/App.tsx',
      'docs/adr/0001-stack.md',
      'index.html',
      'src/index.css',
      'ci.yml',
    ]) {
      expect(isCheckedFile(f), f).toBe(true)
    }
  })

  it('checks extensionless text files like LICENSE', () => {
    expect(isCheckedFile('LICENSE')).toBe(true)
    expect(isCheckedFile('some/dir/LICENSE')).toBe(true)
  })

  it('ignores lockfiles, binaries and images', () => {
    for (const f of ['pnpm-lock.yaml', 'logo.png', 'font.woff2', 'archive.zip']) {
      expect(isCheckedFile(f), f).toBe(false)
    }
  })
})
