import { describe, expect, it } from 'vitest'
import geojson from '../../../public/geo/regions-metropole.json'
import type { NationalLatest, RegionalLatest } from '../../lib/api.ts'
import { paletteFor } from '../../lib/palette.ts'
import { buildMapOption, REGION_NAMES } from './mapOptions.ts'

const LIGHT = paletteFor('light')

const region = (code: string, name: string, consommation: number): RegionalLatest => ({
  region_code: code,
  region_name: name,
  ts: '2026-08-29T10:00:00+00:00',
  maturity: 'R',
  consommation,
  thermique: 100,
  nucleaire: 3000,
  eolien: 500,
  solaire: 200,
  hydraulique: 400,
  pompage: -50,
  bioenergies: 80,
  ech_physiques: -1200,
})

const national = {
  ech_comm_angleterre: -1000,
  ech_comm_espagne: 800,
  ech_comm_italie: -1200,
  ech_comm_suisse: 0,
  ech_comm_allemagne_belgique: null,
} as unknown as NationalLatest

interface MapTooltipFormatter {
  tooltip: {
    formatter: (params: {
      name: string
      data?: { value: number; balance: number | null; region_name: string }
    }) => string
  }
}

describe('buildMapOption', () => {
  const regions = [region('11', 'Île-de-France', 8000), region('84', 'Auvergne-Rhône-Alpes', 4000)]
  const option = buildMapOption(regions, national, '84', false)

  it('joint données et fond de carte par code INSEE, jamais par libellé', () => {
    expect((option.geo as { nameProperty: string }).nameProperty).toBe('code')
    const geoRegions = (option.geo as { regions: { name: string }[] }).regions
    expect(geoRegions.map((r) => r.name)).toEqual(['11', '84'])
    const data = (option.series[0] as { data: { name: string }[] }).data
    expect(data.map((d) => d.name)).toEqual(['11', '84'])
  })

  it('teinte séquentielle via geo.regions : opacité proportionnelle à la consommation', () => {
    const geoRegions = (
      option.geo as { regions: { name: string; itemStyle: { areaColor: string } }[] }
    ).regions
    expect(geoRegions.find((r) => r.name === '11')?.itemStyle.areaColor).toContain('0.55')
    expect(geoRegions.find((r) => r.name === '84')?.itemStyle.areaColor).toContain('0.325')
  })

  it('surligne la région sélectionnée', () => {
    const geoRegions = (
      option.geo as { regions: { name: string; itemStyle: { borderWidth: number } }[] }
    ).regions
    expect(geoRegions.find((r) => r.name === '84')?.itemStyle.borderWidth).toBe(2)
    expect(geoRegions.find((r) => r.name === '11')?.itemStyle.borderWidth).toBe(0.8)
  })

  it('le tooltip affiche le libellé humain, échappé, jamais le code brut', () => {
    const formatter = (option.series[0] as unknown as MapTooltipFormatter).tooltip.formatter
    const html = formatter({
      name: '84',
      data: { value: 4000, balance: 1200, region_name: 'Auvergne-Rhône-Alpes <b>xss</b>' },
    })
    expect(html).toContain('Auvergne-Rhône-Alpes &lt;b&gt;xss&lt;/b&gt;')
    expect(html).not.toContain('<b>xss</b>')
    expect(html).toContain('4,0 GW')
  })

  it('une région du fond sans donnée est nommée via le référentiel INSEE, pas par son code', () => {
    const formatter = (option.series[0] as unknown as MapTooltipFormatter).tooltip.formatter
    expect(formatter({ name: '94' })).toBe('Corse : données indisponibles')
  })

  it('le référentiel des libellés couvre exactement les codes du GeoJSON embarqué', () => {
    for (const feature of geojson.features) {
      expect(REGION_NAMES[feature.properties.code]).toBe(feature.properties.name)
    }
    expect(Object.keys(REGION_NAMES)).toHaveLength(geojson.features.length)
  })

  it('trace les flux dans le sens du courant et ignore les frontières nulles ou muettes', () => {
    const flows = (option.series[1] as { data: { name: string; coords: number[][] }[] }).data
    // Suisse à 0 et Allemagne-Belgique null : absents ; 3 flux restants
    expect(flows).toHaveLength(3)
    const gb = flows.find((f) => f.name.startsWith('Grande-Bretagne'))
    expect(gb?.name).toContain('export 1,0 GW')
    // export : de la France (lon 1.6) vers le large
    expect(gb?.coords[0]?.[0]).toBe(1.6)
    const es = flows.find((f) => f.name.startsWith('Espagne'))
    expect(es?.name).toContain('import 0,8 GW')
    // import : du voisin vers la France
    expect(es?.coords[1]?.[0]).toBe(0.4)
  })

  it('coupe les particules animées quand le système préfère moins de mouvement', () => {
    const still = buildMapOption(regions, national, null, true)
    expect((still.series[1] as { effect: { show: boolean } }).effect.show).toBe(false)
    expect((option.series[1] as { effect: { show: boolean } }).effect.show).toBe(true)
  })
})

describe('buildMapOption : métrique choisie', () => {
  const regions = [region('11', 'Île-de-France', 8000), region('84', 'Auvergne-Rhône-Alpes', 4000)]

  const areaColor = (option: ReturnType<typeof buildMapOption>, code: string) =>
    (option.geo as { regions: { name: string; itemStyle: { areaColor: string } }[] }).regions.find(
      (r) => r.name === code,
    )?.itemStyle.areaColor ?? ''

  const tooltipHtml = (option: ReturnType<typeof buildMapOption>, code: string) => {
    const series = option.series[0] as unknown as MapTooltipFormatter & {
      data: { name: string; value: number; balance: number | null; region_name: string }[]
    }
    const data = series.data.find((d) => d.name === code)
    return series.tooltip.formatter({ name: code, ...(data === undefined ? {} : { data }) })
  }

  it("l'autonomie se lit en pourcentage, pas en gigawatts", () => {
    // production 4280 (nucléaire 3000, thermique 100, hydro 400, éolien 500, solaire 200,
    // bio 80) sur 4000 consommés : 107 % pour Auvergne-Rhône-Alpes
    const option = buildMapOption(regions, national, null, false, 'autonomie')

    expect(tooltipHtml(option, '84')).toContain('%')
    expect(tooltipHtml(option, '84')).not.toContain('GW consommés')
  })

  it("le solde d'échanges distingue export et import par la teinte, jamais par le vert ou le rouge", () => {
    const mixed = [
      { ...region('11', 'Île-de-France', 8000), ech_physiques: 1200 },
      { ...region('84', 'Auvergne-Rhône-Alpes', 4000), ech_physiques: -2400 },
    ]
    const option = buildMapOption(mixed, national, null, false, 'echanges')

    // export (ech_physiques négatif) : teinte de l'accent ; import : bleu-gris
    expect(areaColor(option, '84')).toContain(LIGHT.accentRgb)
    expect(areaColor(option, '11')).not.toContain(LIGHT.accentRgb)
    expect(areaColor(option, '11')).toContain(LIGHT.importFlowRgb)
    expect(tooltipHtml(option, '84')).toContain('+2,4 GW')
  })

  it('une métrique indisponible donne une surface neutre et le dit', () => {
    const incomplete = [{ ...region('11', 'Île-de-France', 8000), eolien: null }]
    const option = buildMapOption(incomplete, national, null, false, 'renouvelables')

    expect(areaColor(option, '11')).toBe(LIGHT.neutralArea)
    expect(tooltipHtml(option, '11')).toContain('n.d.')
  })

  it('la consommation reste la métrique par défaut, teinte inchangée', () => {
    const option = buildMapOption(regions, national, null, false)

    expect(areaColor(option, '11')).toContain('0.55')
    expect(tooltipHtml(option, '11')).toContain('8,0 GW')
  })
})
