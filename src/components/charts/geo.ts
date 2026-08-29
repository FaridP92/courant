import { echarts } from './echartsSetup.ts'

/** Enregistre un GeoJSON pour les séries type map (idempotent). */
export function registerGeoMap(name: string, geoJson: object): void {
  echarts.registerMap(name, geoJson as Parameters<typeof echarts.registerMap>[1])
}
