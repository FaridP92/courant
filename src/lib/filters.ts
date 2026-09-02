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
  /** Grandeur qui donne sa teinte à la choroplèthe régionale. */
  readonly mapMetric: MapMetric
  /** Territoire de l'Explorateur, par code : le libellé vient des données chargées. */
  readonly territory: TerritoryRef
  /** Filières affichées dans le mix ; au moins une, toujours. */
  readonly fuels: ReadonlySet<FuelKey>
  /** Maturités retenues ; au moins une, toujours. */
  readonly maturity: ReadonlySet<Maturity>
  /** Seuil d'intensité carbone en g/kWh : met en évidence les pas au-dessus, sans
   * jamais les masquer (une pointe carbone reste une mesure, pas un défaut). */
  readonly co2Threshold: number | null
  /** Seuil d'écart au programme J-1, en points de pourcentage. Même principe :
   * mise en évidence des pas où réalisé et prévision divergent. */
  readonly deviationThreshold: number | null
}

const RANGES: readonly NationalRange[] = ['24h', '7d', '30d']

export type MapMetric = 'consommation' | 'renouvelables' | 'autonomie' | 'echanges'

export interface MapMetricOption {
  value: MapMetric
  /** Libellé court du segment. */
  label: string
  /** Nom complet, utilisé en infobulle et dans la description accessible. */
  name: string
  title: string
  /** Complément de l'intitulé de la carte : « teinte = ... ». */
  hint: string
}

const CONSUMPTION_METRIC: MapMetricOption = {
  value: 'consommation',
  label: 'Conso',
  name: 'Consommation',
  title: 'Consommation régionale du dernier point publié',
  hint: 'consommation',
}

export const MAP_METRICS: readonly MapMetricOption[] = [
  CONSUMPTION_METRIC,
  {
    value: 'renouvelables',
    label: 'Renouv.',
    name: 'Part renouvelable',
    title: 'Part des renouvelables dans la production de la région',
    hint: 'part renouvelable',
  },
  {
    value: 'autonomie',
    label: 'Autonomie',
    name: 'Autonomie',
    title: 'Production locale rapportée à la consommation locale',
    hint: 'autonomie',
  },
  {
    value: 'echanges',
    label: 'Solde',
    name: "Solde d'échanges",
    title: "Solde d'échanges de la région : positif quand elle exporte",
    hint: "solde d'échanges",
  },
]

const MAP_METRIC_VALUES: readonly MapMetric[] = MAP_METRICS.map((option) => option.value)

export function mapMetricOption(metric: MapMetric): MapMetricOption {
  return MAP_METRICS.find((option) => option.value === metric) ?? CONSUMPTION_METRIC
}

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

/** Paliers proposés, cadrés sur l'intensité carbone française observée (g/kWh). */
export const CO2_THRESHOLDS: readonly number[] = [30, 50, 80]

/** Paliers d'écart au programme J-1, en pourcentage. */
export const DEVIATION_THRESHOLDS: readonly number[] = [2, 5, 10]

export const DEFAULT_FILTERS: Filters = {
  range: '24h',
  mapMetric: 'consommation',
  territory: FRANCE_REF,
  fuels: new Set(FUEL_KEYS),
  maturity: new Set(MATURITY_VALUES),
  co2Threshold: null,
  deviationThreshold: null,
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
    mapMetric:
      MAP_METRIC_VALUES.find((value) => value === params.get('map')) ?? DEFAULT_FILTERS.mapMetric,
    fuels: parseSet(params.get('fuels'), FUEL_KEYS, DEFAULT_FILTERS.fuels),
    maturity: parseSet(params.get('maturity'), MATURITY_VALUES, DEFAULT_FILTERS.maturity),
    co2Threshold: CO2_THRESHOLDS.find((value) => String(value) === params.get('co2')) ?? null,
    deviationThreshold:
      DEVIATION_THRESHOLDS.find((value) => String(value) === params.get('ecart')) ?? null,
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
  if (filters.mapMetric !== DEFAULT_FILTERS.mapMetric) parts.push(`map=${filters.mapMetric}`)
  const fuels = serializeSet(filters.fuels, FUEL_KEYS)
  if (fuels !== null) parts.push(`fuels=${fuels}`)
  const maturity = serializeSet(filters.maturity, MATURITY_VALUES)
  if (maturity !== null) parts.push(`maturity=${maturity}`)
  if (filters.co2Threshold !== null) parts.push(`co2=${String(filters.co2Threshold)}`)
  if (filters.deviationThreshold !== null) parts.push(`ecart=${String(filters.deviationThreshold)}`)
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
