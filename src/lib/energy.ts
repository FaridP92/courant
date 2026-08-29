/**
 * Sélecteurs métier sur un point éCO2mix national.
 * Conventions (documentées dans docs/adr/0003) :
 * - les parts s'expriment en fraction de la production totale, comme sur éCO2mix ;
 * - le pompage (négatif, stockage) n'est pas une production : exclu du total ;
 * - ech_physiques est négatif quand la France exporte ; l'UI raisonne export-positif.
 * Honnêteté : si l'entrée ne permet pas un calcul exact (filière manquante,
 * échanges absents), on renvoie null. Jamais de zéro inventé.
 */
import type { NationalPoint } from './api.ts'

const GENERATION_FIELDS = [
  'nucleaire',
  'hydraulique',
  'eolien',
  'solaire',
  'gaz',
  'fioul',
  'charbon',
  'bioenergies',
] as const satisfies readonly (keyof NationalPoint)[]

export function productionTotalMw(point: NationalPoint): number | null {
  let total = 0
  for (const field of GENERATION_FIELDS) {
    const value = point[field]
    if (value === null) return null
    total += value
  }
  return total > 0 ? total : null
}

export function nuclearShare(point: NationalPoint): number | null {
  const total = productionTotalMw(point)
  if (total === null || point.nucleaire === null) return null
  return point.nucleaire / total
}

export function renewablesShare(point: NationalPoint): number | null {
  const total = productionTotalMw(point)
  if (
    total === null ||
    point.hydraulique === null ||
    point.eolien === null ||
    point.solaire === null ||
    point.bioenergies === null
  ) {
    return null
  }
  return (point.hydraulique + point.eolien + point.solaire + point.bioenergies) / total
}

export function exchangeBalanceMw(point: Pick<NationalPoint, 'ech_physiques'>): number | null {
  return point.ech_physiques === null ? null : -point.ech_physiques
}

/** Champs de production d'un point régional (thermique agrégé, cf. ADR-0004). */
interface RegionalGeneration {
  consommation?: number | null
  thermique: number | null
  nucleaire: number | null
  eolien: number | null
  solaire: number | null
  hydraulique: number | null
  bioenergies: number | null
}

const REGIONAL_GENERATION_FIELDS = [
  'nucleaire',
  'thermique',
  'hydraulique',
  'eolien',
  'solaire',
  'bioenergies',
] as const satisfies readonly (keyof RegionalGeneration)[]

export function regionalProductionTotalMw(point: RegionalGeneration): number | null {
  let total = 0
  for (const field of REGIONAL_GENERATION_FIELDS) {
    const value = point[field]
    if (value === null) return null
    total += value
  }
  return total > 0 ? total : null
}

export function regionalRenewableShare(point: RegionalGeneration): number | null {
  const total = regionalProductionTotalMw(point)
  if (
    total === null ||
    point.hydraulique === null ||
    point.eolien === null ||
    point.solaire === null ||
    point.bioenergies === null
  ) {
    return null
  }
  return (point.hydraulique + point.eolien + point.solaire + point.bioenergies) / total
}

/** Production locale rapportée à la consommation locale (peut dépasser 1 : la
 * région exporte alors son excédent vers ses voisines). */
export function regionalAutonomy(point: RegionalGeneration): number | null {
  const total = regionalProductionTotalMw(point)
  const conso = point.consommation
  if (total === null || conso === null || conso === undefined || conso <= 0) return null
  return total / conso
}

/** Autonomie nationale : même garde que l'équivalent régional. */
export function nationalAutonomy(point: NationalPoint & { consommation: number }): number | null {
  const total = productionTotalMw(point)
  if (total === null || point.consommation <= 0) return null
  return total / point.consommation
}
