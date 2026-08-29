/** Territoire explorable : la granularité s'arrête où s'arrêtent les données
 * RTE temps réel (nation, régions, métropoles ; pas de département ni commune). */

export type Territory =
  | { kind: 'france' }
  | { kind: 'region'; code: string; name: string }
  | { kind: 'metropole'; code: string; name: string }

export const FRANCE: Territory = { kind: 'france' }

export function territoryLabel(territory: Territory): string {
  return territory.kind === 'france' ? 'France entière' : territory.name
}

/** Clé stable pour un élément de formulaire (value du select). */
export function territoryKey(territory: Territory): string {
  return territory.kind === 'france' ? 'france' : `${territory.kind}:${territory.code}`
}
