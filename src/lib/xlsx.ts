/**
 * Lecteur .xlsx minimal, sans dépendance : un classeur est un zip de fichiers XML.
 * On ne lit que ce dont « Compare ta conso » a besoin (feuilles, chaînes partagées,
 * valeurs des cellules) pour un export Enedis de quelques milliers de lignes.
 * La décompression passe par DecompressionStream('deflate-raw'), natif dans les
 * navigateurs récents et dans Node ; elle est injectable pour les tests.
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

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // le répertoire central se trouve depuis la fin : signature EOCD puis offset du répertoire
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new XlsxError("Ce fichier n'est pas un classeur .xlsx lisible.")
  const count = view.getUint16(eocd + 10, true)
  const dirOffset = view.getUint32(eocd + 16, true)
  if (dirOffset === 0xffffffff) throw new XlsxError('Classeur trop volumineux (zip64).')
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let p = dirOffset
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) throw new XlsxError('Répertoire zip corrompu.')
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength))
    entries.push({ name, method, compressedSize, localOffset })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  inflateRaw: InflateRaw,
): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const p = entry.localOffset
  if (view.getUint32(p, true) !== SIG_LOCAL) throw new XlsxError('Entrée zip corrompue.')
  const nameLength = view.getUint16(p + 26, true)
  const extraLength = view.getUint16(p + 28, true)
  const start = p + 30 + nameLength + extraLength
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return inflateRaw(data)
  throw new XlsxError('Méthode de compression zip non prise en charge.')
}

const parseXml = (bytes: Uint8Array): Document =>
  new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')

const byTag = (root: Document | Element, tag: string): Element[] =>
  Array.from(root.getElementsByTagNameNS('*', tag))

/** « B7 » → 1 (index de colonne, base 0). */
function columnIndex(ref: string): number {
  let index = 0
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break
    index = index * 26 + (ch.charCodeAt(0) - 64)
  }
  return index - 1
}

function cellValue(cell: Element, sharedStrings: readonly string[]): CellValue {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') {
    return byTag(cell, 't')
      .map((t) => t.textContent)
      .join('')
  }
  const raw = byTag(cell, 'v')[0]?.textContent ?? null
  if (raw === null) return null
  if (type === 's') return sharedStrings[Number(raw)] ?? null
  if (type === 'str' || type === 'e') return raw
  if (type === 'b') return raw === '1' ? 'VRAI' : 'FAUX'
  const n = Number(raw)
  return Number.isFinite(n) ? n : raw
}

function sheetRows(doc: Document, sharedStrings: readonly string[]): CellValue[][] {
  const rows: CellValue[][] = []
  for (const row of byTag(doc, 'row')) {
    // les lignes vides ne sont pas écrites : l'attribut r donne la vraie position (base 1)
    const r = Number(row.getAttribute('r'))
    const index = Number.isInteger(r) && r > 0 ? r - 1 : rows.length
    while (rows.length < index) rows.push([])
    const cells: CellValue[] = []
    for (const cell of byTag(row, 'c')) {
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

export async function readXlsx(
  buffer: ArrayBuffer,
  inflateRaw: InflateRaw = inflateWithStreams,
): Promise<Sheet[]> {
  const bytes = new Uint8Array(buffer)
  const entries = new Map(readEntries(bytes).map((e) => [e.name, e] as const))
  const need = (name: string): ZipEntry => {
    const entry = entries.get(name)
    if (entry === undefined) throw new XlsxError(`Classeur incomplet : ${name} manquant.`)
    return entry
  }
  const read = async (entry: ZipEntry) => parseXml(await readEntry(bytes, entry, inflateRaw))

  const workbook = await read(need('xl/workbook.xml'))
  const rels = await read(need('xl/_rels/workbook.xml.rels'))
  const targetById = new Map(
    byTag(rels, 'Relationship').map((r) => [
      r.getAttribute('Id') ?? '',
      resolveTarget(r.getAttribute('Target') ?? ''),
    ]),
  )
  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const sharedStrings =
    sharedEntry === undefined
      ? []
      : byTag(await read(sharedEntry), 'si').map((si) =>
          byTag(si, 't')
            .map((t) => t.textContent)
            .join(''),
        )

  const sheets: Sheet[] = []
  for (const sheet of byTag(workbook, 'sheet')) {
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

/** Signature zip : les quatre premiers octets d'un .xlsx. */
export function looksLikeXlsx(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}
