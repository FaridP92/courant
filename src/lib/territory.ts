/** Territoire explorable : la granularité s'arrête où s'arrêtent les données
 * RTE temps réel (nation, régions, métropoles ; pas de département ni commune). */

export type Territory =
  | { kind: 'france' }
  | { kind: 'region'; code: string; name: string }
  | { kind: 'metropole'; code: string; name: string }

/** Le territoire tel qu'il voyage dans l'URL : un code, sans libellé. Le nom vient
 * des données chargées (ADR-0007), jamais du lien. */
export type TerritoryRef =
  { kind: 'france' } | { kind: 'region'; code: string } | { kind: 'metropole'; code: string }

export const FRANCE: Territory = { kind: 'france' }
export const FRANCE_REF: TerritoryRef = { kind: 'france' }

export interface NamedCode {
  code: string
  name: string
}

export function territoryLabel(territory: Territory): string {
  if (territory.kind === 'france') return 'France entière'
  if (territory.name !== '') return territory.name
  // libellés pas encore chargés : on nomme le territoire par son code plutôt que
  // d'afficher un autre territoire ou un blanc
  return territory.kind === 'region' ? `Région ${territory.code}` : `Métropole ${territory.code}`
}

/** Clé stable pour un élément de formulaire (value du select) et pour l'URL. */
export function territoryKey(territory: Territory | TerritoryRef): string {
  return territory.kind === 'france' ? 'france' : `${territory.kind}:${territory.code}`
}

/** Codes attendus : INSEE régional (2 chiffres) et EPCI (9 chiffres). La liste blanche
 * garde un lien bricolé hors des requêtes PostgREST, en plus de leur échappement. */
const CODE_PATTERN = /^[A-Za-z0-9-]{1,24}$/

export function parseTerritoryRef(value: string): TerritoryRef | null {
  if (value === 'france') return FRANCE_REF
  const separator = value.indexOf(':')
  if (separator === -1) return null
  const kind = value.slice(0, separator)
  const code = value.slice(separator + 1)
  if (!CODE_PATTERN.test(code)) return null
  if (kind === 'region' || kind === 'metropole') return { kind, code }
  return null
}

/** Rattache un libellé au territoire demandé. Tant que les listes ne sont pas chargées,
 * le nom reste vide : le territoire demandé est conservé, jamais remplacé par un autre. */
export function resolveTerritory(
  ref: TerritoryRef,
  regions: readonly NamedCode[],
  metropoles: readonly NamedCode[],
): Territory {
  if (ref.kind === 'france') return FRANCE
  const source = ref.kind === 'region' ? regions : metropoles
  return {
    kind: ref.kind,
    code: ref.code,
    name: source.find((entry) => entry.code === ref.code)?.name ?? '',
  }
}
