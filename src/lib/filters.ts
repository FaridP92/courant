/**
 * Modèle de filtres du tableau de bord : pur, sérialisable, testable sans React.
 * L'URL porte l'état complet des critères (ADR-0006) : un lien partagé rouvre la même
 * vue, et un critère absent de l'URL vaut son défaut.
 * Honnêteté (règle 5) : un point écarté par un filtre est masqué, jamais supprimé de
 * la série. L'axe du temps garde ses trous au lieu d'inventer une continuité entre
 * deux instants éloignés.
 */
import type { NationalPoint, NationalRange } from './api.ts'
import { FUELS, type FuelSeries } from './palette.ts'
import { FRANCE_REF, parseTerritoryRef, territoryKey, type TerritoryRef } from './territory.ts'

export type FuelKey = FuelSeries['key']
/** Maturité éCO2mix : R temps réel, C consolidée, D définitive. */
export type Maturity = NationalPoint['maturity']

export interface Filters {
  readonly range: NationalRange
  /** Territoire de l'Explorateur, par code : le libellé vient des données chargées. */
  readonly territory: TerritoryRef
  /** Filières affichées dans le mix ; au moins une, toujours. */
  readonly fuels: ReadonlySet<FuelKey>
  /** Maturités retenues ; au moins une, toujours. */
  readonly maturity: ReadonlySet<Maturity>
}

const RANGES: readonly NationalRange[] = ['24h', '7d', '30d']

/** Ordre canonique des filières : celui de l'empilement du mix, pas celui des clics. */
export const FUEL_KEYS: readonly FuelKey[] = FUELS.map((fuel) => fuel.key)

export interface MaturityOption {
  value: Maturity
  label: string
  hint: string
}

export const MATURITIES: readonly MaturityOption[] = [
  { value: 'R', label: 'Temps réel', hint: 'Mesures brutes, publiées en continu par RTE' },
  { value: 'C', label: 'Consolidées', hint: 'Mesures revues, corrigées des aléas de collecte' },
  { value: 'D', label: 'Définitives', hint: 'Mesures définitives, plus révisées' },
]

const MATURITY_VALUES: readonly Maturity[] = MATURITIES.map((option) => option.value)

export const DEFAULT_FILTERS: Filters = {
  range: '24h',
  territory: FRANCE_REF,
  fuels: new Set(FUEL_KEYS),
  maturity: new Set(MATURITY_VALUES),
}

/** Lecture tolérante : une valeur inconnue est ignorée, un ensemble vide retombe sur
 * le défaut. Une URL bricolée à la main ne doit jamais vider le tableau de bord. */
function parseSet<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: ReadonlySet<T>,
): ReadonlySet<T> {
  if (raw === null) return fallback
  const wanted = new Set(raw.split(',').map((value) => value.trim()))
  const kept = allowed.filter((value) => wanted.has(value))
  return kept.length === 0 ? fallback : new Set(kept)
}

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const range = params.get('range')
  return {
    range: RANGES.find((value) => value === range) ?? DEFAULT_FILTERS.range,
    territory: parseTerritoryRef(params.get('territory') ?? '') ?? DEFAULT_FILTERS.territory,
    fuels: parseSet(params.get('fuels'), FUEL_KEYS, DEFAULT_FILTERS.fuels),
    maturity: parseSet(params.get('maturity'), MATURITY_VALUES, DEFAULT_FILTERS.maturity),
  }
}

/** null quand tout est sélectionné : le paramètre disparaît alors de l'URL. */
function serializeSet<T extends string>(
  values: ReadonlySet<T>,
  allowed: readonly T[],
): string | null {
  if (values.size >= allowed.length) return null
  return allowed.filter((value) => values.has(value)).join(',')
}

/** Ne sérialise que ce qui s'écarte du défaut. Les valeurs sont des identifiants ASCII :
 * pas d'échappement, l'URL reste lisible et partageable telle quelle. */
export function serializeFilters(filters: Filters): string {
  const parts: string[] = []
  if (filters.range !== DEFAULT_FILTERS.range) parts.push(`range=${filters.range}`)
  if (filters.territory.kind !== 'france')
    parts.push(`territory=${territoryKey(filters.territory)}`)
  const fuels = serializeSet(filters.fuels, FUEL_KEYS)
  if (fuels !== null) parts.push(`fuels=${fuels}`)
  const maturity = serializeSet(filters.maturity, MATURITY_VALUES)
  if (maturity !== null) parts.push(`maturity=${maturity}`)
  return parts.join('&')
}

export function isDefaultFilters(filters: Filters): boolean {
  return serializeFilters(filters) === ''
}

/** Bascule une valeur en garantissant l'invariant « au moins une sélection » :
 * retirer la dernière rend l'ensemble inchangé (l'UI le dit au lieu de l'ignorer). */
export function toggleWithFloor<T>(current: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(current)
  if (next.has(value)) {
    if (next.size <= 1) return current
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}

/** Les mesures d'un point, hors horodatage et maturité qui restent toujours lisibles. */
const MEASURE_FIELDS = [
  'consommation',
  'prevision_j1',
  'prevision_j',
  'nucleaire',
  'hydraulique',
  'pompage',
  'eolien',
  'solaire',
  'gaz',
  'fioul',
  'charbon',
  'bioenergies',
  'ech_physiques',
  'taux_co2',
] as const

function maskPoint(point: NationalPoint): NationalPoint {
  const masked: NationalPoint = { ...point }
  for (const field of MEASURE_FIELDS) masked[field] = null
  return masked
}

export interface FilteredSeries {
  readonly points: readonly NationalPoint[]
  /** Points qui portent encore une consommation après filtrage. */
  readonly kept: number
  readonly total: number
}

export function applyFilters(points: readonly NationalPoint[], filters: Filters): FilteredSeries {
  let kept = 0
  const filtered = points.map((point) => {
    if (!filters.maturity.has(point.maturity)) return maskPoint(point)
    if (point.consommation !== null) kept += 1
    return point
  })
  return { points: filtered, kept, total: points.length }
}
