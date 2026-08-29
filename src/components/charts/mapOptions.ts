/**
 * Options de la carte : choroplèthe des régions (séquentiel une teinte, l'accent)
 * et flux frontaliers animés par particules directionnelles, construites en pur.
 * Les données régionales viennent de v_regional_latest, les flux frontaliers du
 * dernier point national (ech_comm_*, négatif = la France exporte).
 */
import type { NationalLatest, RegionalLatest } from '../../lib/api.ts'
import { formatGigawatts } from '../../lib/format.ts'
import { accent, ink, surfaces } from '../../lib/palette.ts'

export const REGIONS_MAP_NAME = 'regions-metropole'
const IMPORT_COLOR = '#678c9f'

/** Référentiel INSEE des régions métropolitaines : la jointure carte-données passe par le
 * code (stable), jamais par le libellé (un accent ou une apostrophe qui diverge entre le
 * GeoJSON et ODRÉ casserait la teinte en silence). Synchronisation avec le GeoJSON
 * embarqué vérifiée par mapOptions.test.ts. */
export const REGION_NAMES: Record<string, string> = {
  '11': 'Île-de-France',
  '24': 'Centre-Val de Loire',
  '27': 'Bourgogne-Franche-Comté',
  '28': 'Normandie',
  '32': 'Hauts-de-France',
  '44': 'Grand Est',
  '52': 'Pays de la Loire',
  '53': 'Bretagne',
  '75': 'Nouvelle-Aquitaine',
  '76': 'Occitanie',
  '84': 'Auvergne-Rhône-Alpes',
  '93': "Provence-Alpes-Côte d'Azur",
  '94': 'Corse',
}

/** Le tooltip ECharts injecte du HTML : tout libellé issu des données est échappé. */
const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

interface BorderFlow {
  name: string
  field: keyof Pick<
    NationalLatest,
    | 'ech_comm_angleterre'
    | 'ech_comm_espagne'
    | 'ech_comm_italie'
    | 'ech_comm_suisse'
    | 'ech_comm_allemagne_belgique'
  >
  inside: [number, number]
  outside: [number, number]
}

// points d'ancrage frontaliers (lon, lat), côté France puis côté voisin
const BORDER_FLOWS: readonly BorderFlow[] = [
  {
    name: 'Grande-Bretagne',
    field: 'ech_comm_angleterre',
    inside: [1.6, 50.9],
    outside: [0.4, 52.0],
  },
  { name: 'Espagne', field: 'ech_comm_espagne', inside: [0.4, 42.7], outside: [-0.6, 41.5] },
  { name: 'Italie', field: 'ech_comm_italie', inside: [6.9, 45.1], outside: [8.4, 44.6] },
  { name: 'Suisse', field: 'ech_comm_suisse', inside: [6.6, 46.5], outside: [8.1, 46.8] },
  {
    name: 'Allemagne-Belgique',
    field: 'ech_comm_allemagne_belgique',
    inside: [6.2, 49.6],
    outside: [7.6, 50.8],
  },
]

export interface MapChartOption {
  animation: boolean
  geo: object
  tooltip: object
  series: object[]
}

export function buildMapOption(
  regions: readonly RegionalLatest[],
  national: NationalLatest | null,
  selectedCode: string | null,
  reduceMotion: boolean,
): MapChartOption {
  const maxConso = Math.max(1, ...regions.map((r) => r.consommation))

  // name = code INSEE : c'est la clé de jointure avec le fond de carte (nameProperty)
  const regionData = regions.map((r) => ({
    name: r.region_code,
    value: r.consommation,
    code: r.region_code,
    region_name: r.region_name,
    balance: r.ech_physiques === null ? null : -r.ech_physiques,
  }))

  // avec geoIndex, la teinte fiable passe par geo.regions (pas par itemStyle de série)
  const geoRegions = regions.map((r) => ({
    name: r.region_code,
    itemStyle: {
      areaColor: `rgba(46, 230, 255, ${String(0.1 + (r.consommation / maxConso) * 0.45)})`,
      borderColor: r.region_code === selectedCode ? accent : surfaces.lineStrong,
      borderWidth: r.region_code === selectedCode ? 2 : 0.8,
    },
  }))

  const flows =
    national === null
      ? []
      : BORDER_FLOWS.flatMap((flow) => {
          const value = national[flow.field]
          if (value === null || value === 0) return []
          const exporting = value < 0
          return [
            {
              name: `${flow.name} · ${exporting ? 'export' : 'import'} ${formatGigawatts(Math.abs(value))} GW`,
              coords: exporting ? [flow.inside, flow.outside] : [flow.outside, flow.inside],
              value: Math.abs(value),
              lineStyle: { color: exporting ? accent : IMPORT_COLOR },
            },
          ]
        })

  return {
    animation: false,
    geo: {
      map: REGIONS_MAP_NAME,
      nameProperty: 'code',
      roam: false,
      aspectScale: 0.8,
      // Corse et fonds sans donnée : surface neutre
      itemStyle: { areaColor: '#12212a', borderColor: surfaces.lineStrong, borderWidth: 0.8 },
      regions: geoRegions,
      emphasis: { disabled: true },
      select: { disabled: true },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(10, 18, 22, 0.94)',
      borderColor: surfaces.line,
      textStyle: { color: ink.mid, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 },
    },
    series: [
      {
        name: 'Consommation régionale',
        type: 'map',
        geoIndex: 0,
        data: regionData,
        tooltip: {
          formatter: (params: {
            name: string
            data?: { value: number; balance: number | null; region_name: string }
          }) => {
            const d = params.data
            // params.name porte le code INSEE : on affiche toujours le libellé humain
            if (d === undefined) {
              return `${escapeHtml(REGION_NAMES[params.name] ?? params.name)} : données indisponibles`
            }
            const balance =
              d.balance === null
                ? ''
                : `<br/>${d.balance >= 0 ? 'exporte' : 'importe'} ${formatGigawatts(Math.abs(d.balance))} GW`
            return `<b>${escapeHtml(d.region_name)}</b><br/>${formatGigawatts(d.value)} GW consommés${balance}`
          },
        },
      },
      {
        name: 'Flux frontaliers',
        type: 'lines',
        coordinateSystem: 'geo',
        data: flows,
        lineStyle: { width: 1.6, opacity: 0.7, curveness: 0.2 },
        effect: reduceMotion
          ? { show: false }
          : {
              show: true,
              period: 3,
              trailLength: 0.55,
              symbol: 'arrow',
              symbolSize: 5,
              color: ink.hi,
            },
        label: {
          show: true,
          position: 'end',
          formatter: (p: { name: string }) => p.name.split(' · ')[0] ?? '',
          color: ink.low,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 9,
        },
        tooltip: { formatter: (p: { name: string }) => p.name },
      },
    ],
  }
}
