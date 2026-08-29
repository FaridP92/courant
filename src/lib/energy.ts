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

export function exchangeBalanceMw(point: NationalPoint): number | null {
  return point.ech_physiques === null ? null : -point.ech_physiques
}
