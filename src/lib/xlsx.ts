/**
 * Lecteur .xlsx minimal, sans dépendance : un classeur est un zip de fichiers XML.
 * On ne lit que ce dont « Compare ta conso » a besoin (feuilles, chaînes partagées,
 * valeurs des cellules) pour un export Enedis de quelques milliers de lignes.
 * La décompression passe par DecompressionStream('deflate-raw'), natif dans les
 * navigateurs récents et dans Node ; elle est injectable pour les tests.
 * Contrat : toute lecture impossible lève XlsxError, jamais une autre erreur.
 */

export type CellValue = string | number | null

export interface Sheet {
  name: string
  /** Lignes denses : la cellule absente vaut null. */
  rows: CellValue[][]
}

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

export class XlsxError extends Error {}

const CORRUPT = 'Classeur illisible ou corrompu.'

export const inflateWithStreams: InflateRaw = async (data) => {
  // copie dans un tampon ArrayBuffer : le flux refuse les vues sur SharedArrayBuffer
  const chunk = new Uint8Array(data)
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(chunk)
      controller.close()
    },
  })
  const inflated = source.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(inflated).arrayBuffer())
}

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localOffset: number
}

/** Lecture bornée : un offset tiré du fichier ne doit jamais sortir du tampon. */
class BoundedView {
  private readonly bytes: Uint8Array
  private readonly view: DataView
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  get length(): number {
    return this.bytes.length
  }
  private check(offset: number, size: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > this.bytes.length) {
      throw new XlsxError(CORRUPT)
    }
  }
  u16(offset: number): number {
    this.check(offset, 2)
    return this.view.getUint16(offset, true)
  }
  u32(offset: number): number {
    this.check(offset, 4)
    return this.view.getUint32(offset, true)
  }
  slice(offset: number, size: number): Uint8Array {
    this.check(offset, size)
    return this.bytes.subarray(offset, offset + size)
  }
}

function readEntries(view: BoundedView): ZipEntry[] {
  // le répertoire central se trouve depuis la fin : signature EOCD puis offset du répertoire
  let eocd = -1
  for (let i = view.length - 22; i >= Math.max(0, view.length - 65_557); i -= 1) {
    if (view.u32(i) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new XlsxError("Ce fichier n'est pas un classeur .xlsx lisible.")
  const count = view.u16(eocd + 10)
  const dirOffset = view.u32(eocd + 16)
  if (dirOffset === 0xffffffff) throw new XlsxError('Classeur trop volumineux (zip64).')
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let p = dirOffset
  for (let i = 0; i < count; i += 1) {
    if (view.u32(p) !== SIG_CENTRAL) throw new XlsxError(CORRUPT)
    const method = view.u16(p + 10)
    const compressedSize = view.u32(p + 20)
    const nameLength = view.u16(p + 28)
    const extraLength = view.u16(p + 30)
    const commentLength = view.u16(p + 32)
    const localOffset = view.u32(p + 42)
    const name = decoder.decode(view.slice(p + 46, nameLength))
    entries.push({ name, method, compressedSize, localOffset })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readEntry(
  view: BoundedView,
  entry: ZipEntry,
  inflateRaw: InflateRaw,
): Promise<Uint8Array> {
  const p = entry.localOffset
  if (view.u32(p) !== SIG_LOCAL) throw new XlsxError(CORRUPT)
  const nameLength = view.u16(p + 26)
  const extraLength = view.u16(p + 28)
  const data = view.slice(p + 30 + nameLength + extraLength, entry.compressedSize)
  if (entry.method === 0) return data
  if (entry.method !== 8) throw new XlsxError('Méthode de compression zip non prise en charge.')
  try {
    return await inflateRaw(data)
  } catch {
    throw new XlsxError('Classeur illisible ou corrompu (décompression).')
  }
}

function parseXml(bytes: Uint8Array): Document {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new XlsxError(CORRUPT)
  return doc
}

/** Premier élément du document portant ce nom local, tout espace de noms confondu. */
const firstByTag = (root: Document | Element, tag: string): Element | null =>
  root.getElementsByTagNameNS('*', tag)[0] ?? null

const allByTag = (root: Document | Element, tag: string): Element[] =>
  Array.from(root.getElementsByTagNameNS('*', tag))

/** Enfants directs d'un nom local donné, par chaînage de frères : sous jsdom,
 * getElementsByTagName et l'indexation de `children` sur des milliers de lignes
 * sont quadratiques ; firstElementChild / nextElementSibling reste linéaire. */
function children(parent: Element, localName: string): Element[] {
  const out: Element[] = []
  for (let el = parent.firstElementChild; el !== null; el = el.nextElementSibling) {
    if (el.localName === localName) out.push(el)
  }
  return out
}

/** « B7 » → 1 (index de colonne, base 0). */
function columnIndex(ref: string): number {
  let index = 0
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break
    index = index * 26 + (ch.charCodeAt(0) - 64)
  }
  return index - 1
}

const textOf = (el: Element): string =>
  allByTag(el, 't')
    .map((t) => t.textContent)
    .join('')

function cellValue(cell: Element, sharedStrings: readonly string[]): CellValue {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') return textOf(cell)
  const raw = children(cell, 'v')[0]?.textContent ?? null
  if (raw === null) return null
  if (type === 's') return sharedStrings[Number(raw)] ?? null
  if (type === 'str' || type === 'e') return raw
  if (type === 'b') return raw === '1' ? 'VRAI' : 'FAUX'
  const n = Number(raw)
  return Number.isFinite(n) ? n : raw
}

function sheetRows(doc: Document, sharedStrings: readonly string[]): CellValue[][] {
  const rows: CellValue[][] = []
  const sheetData = firstByTag(doc, 'sheetData')
  if (sheetData === null) return rows
  for (const row of children(sheetData, 'row')) {
    // les lignes vides ne sont pas écrites : l'attribut r donne la vraie position (base 1)
    const r = Number(row.getAttribute('r'))
    const index = Number.isInteger(r) && r > 0 ? r - 1 : rows.length
    while (rows.length < index) rows.push([])
    const cells: CellValue[] = []
    for (const cell of children(row, 'c')) {
      const ref = cell.getAttribute('r') ?? ''
      const col = ref === '' ? cells.length : columnIndex(ref)
      while (cells.length < col) cells.push(null)
      cells[col] = cellValue(cell, sharedStrings)
    }
    rows[index] = cells
  }
  return rows
}

/** Résout une cible de relation en chemin d'entrée zip (« worksheets/sheet1.xml » → « xl/worksheets/sheet1.xml »). */
const resolveTarget = (target: string): string =>
  target.startsWith('/') ? target.slice(1) : `xl/${target}`

async function readWorkbook(view: BoundedView, inflateRaw: InflateRaw): Promise<Sheet[]> {
  const entries = new Map(readEntries(view).map((e) => [e.name, e] as const))
  const need = (name: string): ZipEntry => {
    const entry = entries.get(name)
    if (entry === undefined) throw new XlsxError(`Classeur incomplet : ${name} manquant.`)
    return entry
  }
  const read = async (entry: ZipEntry) => parseXml(await readEntry(view, entry, inflateRaw))

  const workbook = await read(need('xl/workbook.xml'))
  const rels = await read(need('xl/_rels/workbook.xml.rels'))
  const targetById = new Map(
    allByTag(rels, 'Relationship').map((r) => [
      r.getAttribute('Id') ?? '',
      resolveTarget(r.getAttribute('Target') ?? ''),
    ]),
  )
  const sharedEntry = entries.get('xl/sharedStrings.xml')
  let sharedStrings: string[] = []
  if (sharedEntry !== undefined) {
    const sst = firstByTag(await read(sharedEntry), 'sst')
    sharedStrings = sst === null ? [] : children(sst, 'si').map(textOf)
  }

  const sheets: Sheet[] = []
  for (const sheet of allByTag(workbook, 'sheet')) {
    const id =
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      ) ??
      sheet.getAttribute('r:id') ??
      ''
    const target = targetById.get(id)
    if (target === undefined) continue
    const doc = await read(need(target))
    sheets.push({ name: sheet.getAttribute('name') ?? '', rows: sheetRows(doc, sharedStrings) })
  }
  if (sheets.length === 0) throw new XlsxError('Classeur sans feuille lisible.')
  return sheets
}

export async function readXlsx(
  buffer: ArrayBuffer,
  inflateRaw: InflateRaw = inflateWithStreams,
): Promise<Sheet[]> {
  try {
    return await readWorkbook(new BoundedView(new Uint8Array(buffer)), inflateRaw)
  } catch (error) {
    // le contrat du module : une seule classe d'erreur, quel que soit l'octet fautif
    throw error instanceof XlsxError ? error : new XlsxError(CORRUPT)
  }
}

/** Signature zip : les quatre premiers octets d'un .xlsx. */
export function looksLikeXlsx(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}
