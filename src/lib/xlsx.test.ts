import { describe, expect, it, vi } from 'vitest'
import { enedisCurveXlsx, enedisDailyXlsx } from './__fixtures__/enedisXlsx.ts'
import { inflateWithStreams, looksLikeXlsx, readXlsx, XlsxError } from './xlsx.ts'

/** Zip « stored » (sans compression) construit à la main : assez pour notre lecteur,
 * qui ignore les CRC. Sert aux classeurs synthétiques volumineux. */
function storedZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(content)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 0, true) // stored
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)
    offset += local.length
  }
  const dirSize = centrals.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, dirSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, eocd]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let p = 0
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  return out.buffer
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

function workbookWithRows(rowsXml: string): ArrayBuffer {
  return storedZip({
    'xl/workbook.xml': `<workbook ${NS} ${R_NS}><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>${rowsXml}</sheetData></worksheet>`,
  })
}

const corrupt = (buffer: ArrayBuffer, patch: (bytes: Uint8Array) => void): ArrayBuffer => {
  const copy = new Uint8Array(buffer.slice(0))
  patch(copy)
  return copy.buffer
}

describe('readXlsx', () => {
  it('lit les feuilles, les chaînes partagées et les nombres, aux vraies positions de ligne', async () => {
    const sheets = await readXlsx(enedisDailyXlsx())
    expect(sheets.map((s) => s.name)).toEqual(["Page d'accueil", 'Export Consommation Quotidienne'])
    const daily = sheets[1]
    // les lignes vides ne sont pas écrites dans le classeur : l'attribut r fait foi
    expect(daily?.rows[7]?.[0]).toBe('Point Référence Mesure (PRM) : ')
    expect(daily?.rows[7]?.[3]).toBe('Consommation Quotidienne')
    expect(daily?.rows[13]).toEqual(['Date', 'Valeur (en kWh)'])
    expect(daily?.rows[14]).toEqual(['01/01/2026', 6.329])
    expect(daily?.rows[16]).toEqual(['03/01/2026', 'NA'])
  })

  it('passe par la décompression injectée et donne le même résultat que la native', async () => {
    const spy = vi.fn(inflateWithStreams)
    const [native, injected] = await Promise.all([
      readXlsx(enedisCurveXlsx()),
      readXlsx(enedisCurveXlsx(), spy),
    ])
    expect(spy).toHaveBeenCalled()
    expect(injected).toEqual(native)
    expect(native[1]?.rows[14]).toEqual(['2026-01-05T00:30:00+01:00', 1200])
  })

  it('lit un zip sans compression, des cellules inlineStr et des colonnes au-delà de Z', async () => {
    const sheets = await readXlsx(
      workbookWithRows(
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Bonjour</t></is></c><c r="AA2"><v>1.5</v></c></row>',
      ),
    )
    const row = sheets[0]?.rows[1]
    expect(row?.[0]).toBe('Bonjour')
    expect(row?.[26]).toBe(1.5)
    expect(sheets[0]?.rows[0]).toEqual([])
  })

  it('reste linéaire sur un an de courbe de charge (17 520 lignes)', async () => {
    let xml = ''
    for (let i = 1; i <= 17_520; i += 1) {
      xml += `<row r="${String(i)}"><c r="A${String(i)}" t="inlineStr"><is><t>2026-01-01T00:30:00+01:00</t></is></c><c r="B${String(i)}"><v>${String(i)}</v></c></row>`
    }
    const started = performance.now()
    const sheets = await readXlsx(workbookWithRows(xml))
    const elapsed = performance.now() - started
    expect(sheets[0]?.rows).toHaveLength(17_520)
    expect(sheets[0]?.rows[17_519]?.[1]).toBe(17_520)
    expect(elapsed).toBeLessThan(3_000)
  })

  it("refuse ce qui n'est pas un classeur", async () => {
    const junk = new TextEncoder().encode('Horodate;Valeur\n2026-01-05T00:30:00+01:00;1200').buffer
    expect(looksLikeXlsx(junk)).toBe(false)
    expect(looksLikeXlsx(enedisDailyXlsx())).toBe(true)
    await expect(readXlsx(junk)).rejects.toBeInstanceOf(XlsxError)
  })

  it('ne lève jamais autre chose que XlsxError, quel que soit l octet corrompu', async () => {
    const base = enedisDailyXlsx()
    const bytes = new Uint8Array(base)
    // offset du répertoire central (EOCD + 16) envoyé hors du fichier
    const eocd = bytes.length - 22
    const badDir = corrupt(base, (b) => {
      new DataView(b.buffer).setUint32(eocd + 16, 0x7fffff00, true)
    })
    await expect(readXlsx(badDir)).rejects.toBeInstanceOf(XlsxError)
    // flux deflate de xl/workbook.xml (une entrée effectivement lue) écrasé
    const badDeflate = corrupt(base, (b) => {
      const view = new DataView(b.buffer)
      const dec = new TextDecoder()
      for (let i = 0; i + 30 < b.length; i += 1) {
        if (view.getUint32(i, true) !== 0x04034b50) continue
        const nameLength = view.getUint16(i + 26, true)
        const extraLength = view.getUint16(i + 28, true)
        if (dec.decode(b.subarray(i + 30, i + 30 + nameLength)) !== 'xl/workbook.xml') continue
        const start = i + 30 + nameLength + extraLength
        b.fill(0xff, start, start + 20)
        return
      }
      throw new Error('entrée xl/workbook.xml introuvable dans la fixture')
    })
    await expect(readXlsx(badDeflate)).rejects.toBeInstanceOf(XlsxError)
    // fichier tronqué : plus d'EOCD
    await expect(readXlsx(base.slice(0, base.byteLength - 300))).rejects.toBeInstanceOf(XlsxError)
  })
})
