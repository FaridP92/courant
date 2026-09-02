/**
 * Lignes des exports CSV : un seul endroit décide de ce que le fichier contient.
 * Le fichier emporte ce que la vue affiche, critères compris, et il s'explique de
 * lui-même : la maturité accompagne les mesures nationales, le nom du territoire
 * accompagne chaque ligne territoriale. Une grandeur incalculable reste vide,
 * jamais ramenée à zéro (règle 5).
 */
import type { NationalPoint, RegionalLatest, RegionalPoint } from './api.ts'
import type { CsvValue } from './csv.ts'
import { regionalAutonomy, regionalRenewableShare } from './energy.ts'

export type ExportRow = Record<string, CsvValue>

const percent = (fraction: number | null): number | null =>
  fraction === null ? null : Math.round(fraction * 100)

export function nationalExportRows(points: readonly NationalPoint[]): ExportRow[] {
  return points.map((p) => ({
    ts: p.ts,
    maturite: p.maturity,
    consommation_mw: p.consommation,
    prevision_j1_mw: p.prevision_j1,
    prevision_j_mw: p.prevision_j,
    nucleaire_mw: p.nucleaire,
    hydraulique_mw: p.hydraulique,
    eolien_mw: p.eolien,
    solaire_mw: p.solaire,
    gaz_mw: p.gaz,
    fioul_mw: p.fioul,
    charbon_mw: p.charbon,
    bioenergies_mw: p.bioenergies,
    ech_physiques_mw: p.ech_physiques,
    taux_co2_g_kwh: p.taux_co2,
  }))
}

export function regionalExportRows(points: readonly RegionalPoint[]): ExportRow[] {
  return points.map((p) => ({
    territoire: p.region_name,
    ts: p.ts,
    consommation_mw: p.consommation,
    nucleaire_mw: p.nucleaire,
    hydraulique_mw: p.hydraulique,
    eolien_mw: p.eolien,
    solaire_mw: p.solaire,
    bioenergies_mw: p.bioenergies,
    thermique_mw: p.thermique,
    pompage_mw: p.pompage,
    ech_physiques_mw: p.ech_physiques,
  }))
}

/** Série d'un territoire qui ne publie que sa consommation (métropoles, France). */
export function territoryExportRows(
  points: readonly { ts: string; consommation: number | null }[],
  territoryName: string,
): ExportRow[] {
  return points.map((p) => ({
    territoire: territoryName,
    ts: p.ts,
    consommation_mw: p.consommation,
  }))
}

/** Export de la carte : les colonnes brutes plus les grandeurs que la carte sait teinter. */
export function mapExportRows(regions: readonly RegionalLatest[]): ExportRow[] {
  return regions.map((r) => ({
    territoire: r.region_name,
    ts: r.ts,
    consommation_mw: r.consommation,
    part_renouvelable_pct: percent(regionalRenewableShare(r)),
    autonomie_pct: percent(regionalAutonomy(r)),
    solde_export_mw: r.ech_physiques === null ? null : -r.ech_physiques,
    nucleaire_mw: r.nucleaire,
    hydraulique_mw: r.hydraulique,
    eolien_mw: r.eolien,
    solaire_mw: r.solaire,
    bioenergies_mw: r.bioenergies,
    thermique_mw: r.thermique,
  }))
}
