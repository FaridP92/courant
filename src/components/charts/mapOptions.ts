/**
 * Options de la carte : choroplèthe des régions (séquentiel une teinte, l'accent)
 * et flux frontaliers animés par particules directionnelles, construites en pur.
 * Les données régionales viennent de v_regional_latest, les flux frontaliers du
 * dernier point national (ech_comm_*, négatif = la France exporte).
 */
import type { NationalLatest, RegionalLatest } from '../../lib/api.ts'
import { regionalAutonomy, regionalRenewableShare } from '../../lib/energy.ts'
import { mapMetricOption, type MapMetric } from '../../lib/filters.ts'
import { formatGigawatts, formatSignedGigawatts, formatWholePercent } from '../../lib/format.ts'
import { accent, ink, surfaces } from '../../lib/palette.ts'

export const REGIONS_MAP_NAME = 'regions-metropole'
const IMPORT_COLOR = '#678c9f'
/** Surface des fonds sans donnée : une métrique incalculable ne se déguise pas en zéro. */
const NEUTRAL_AREA = '#12212a'

interface MetricRender {
  value: (region: RegionalLatest) => number | null
  format: (value: number) => string
  /** Le solde d'échanges a deux sens : la teinte porte le signe (cyan export, gris import),
   * jamais le vert ou le rouge, réservés aux signaux Ecowatt et Tempo. */
  signed: boolean
}

const METRIC_RENDER: Record<MapMetric, MetricRender> = {
  consommation: {
    value: (region) => region.consommation,
    format: (value) => `${formatGigawatts(value)} GW`,
    signed: false,
  },
  renouvelables: {
    value: regionalRenewableShare,
    format: (value) => `${formatWholePercent(value)} %`,
    signed: false,
  },
  autonomie: {
    value: regionalAutonomy,
    format: (value) => `${formatWholePercent(value)} %`,
    signed: false,
  },
  echanges: {
    value: (region) => (region.ech_physiques === null ? null : -region.ech_physiques),
    format: (value) => `${formatSignedGigawatts(value)} GW`,
    signed: true,
  },
}

/** Échelle ancrée sur le maximum observé, plancher à 1 : les parts (0 à 1) se lisent
 * donc sur 100 %, les puissances en MW sur la région la plus forte. */
function areaTint(value: number | null, anchor: number, signed: boolean): string {
  if (value === null) return NEUTRAL_AREA
  const intensity = Math.abs(value) / anchor
  return signed && value < 0
    ? `rgba(103, 140, 159, ${String(0.12 + intensity * 0.43)})`
    : `rgba(46, 230, 255, ${String(0.1 + intensity * 0.45)})`
}

export function metricName(metric: MapMetric): string {
  return mapMetricOption(metric).name
}

/** Description accessible : la métrique, puis sa valeur région par région. */
export function mapAriaLabel(regions: readonly RegionalLatest[], metric: MapMetric): string {
  const render = METRIC_RENDER[metric]
  const values = regions.map((region) => {
    const value = render.value(region)
    return `${region.region_name} ${value === null ? 'non disponible' : render.format(value)}`
  })
  return `Carte de France : ${metricName(metric).toLowerCase()} par région (du plus clair au plus foncé) et flux d'échanges aux frontières. ${values.join(', ')}.`
}

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
  metric: MapMetric = 'consommation',
): MapChartOption {
  const render = METRIC_RENDER[metric]
  const values = regions.map((r) => render.value(r))
  const anchor = Math.max(1, ...values.filter((v): v is number => v !== null).map(Math.abs))

  // name = code INSEE : c'est la clé de jointure avec le fond de carte (nameProperty)
  const regionData = regions.map((r, index) => ({
    name: r.region_code,
    value: values[index] ?? null,
    code: r.region_code,
    region_name: r.region_name,
    balance: r.ech_physiques === null ? null : -r.ech_physiques,
  }))

  // avec geoIndex, la teinte fiable passe par geo.regions (pas par itemStyle de série)
  const geoRegions = regions.map((r, index) => ({
    name: r.region_code,
    itemStyle: {
      areaColor: areaTint(values[index] ?? null, anchor, render.signed),
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
      itemStyle: { areaColor: NEUTRAL_AREA, borderColor: surfaces.lineStrong, borderWidth: 0.8 },
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
        name: metricName(metric),
        type: 'map',
        geoIndex: 0,
        data: regionData,
        tooltip: {
          formatter: (params: {
            name: string
            data?: { value: number | null; balance: number | null; region_name: string }
          }) => {
            const d = params.data
            // params.name porte le code INSEE : on affiche toujours le libellé humain
            if (d === undefined) {
              return `${escapeHtml(REGION_NAMES[params.name] ?? params.name)} : données indisponibles`
            }
            const measure = d.value === null ? 'n.d.' : render.format(d.value)
            // le solde figure déjà dans la mesure quand c'est lui la métrique choisie
            const balance =
              metric === 'echanges' || d.balance === null
                ? ''
                : `<br/>${d.balance >= 0 ? 'exporte' : 'importe'} ${formatGigawatts(Math.abs(d.balance))} GW`
            return `<b>${escapeHtml(d.region_name)}</b><br/>${metricName(metric)} : ${measure}${balance}`
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
