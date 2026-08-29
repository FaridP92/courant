import { describe, expect, it } from 'vitest'
import { buildSparkline } from './sparkline.ts'

const box = { width: 100, height: 30 }

describe('buildSparkline', () => {
  it('trace un chemin normalisé couvrant la boîte quand la série est pleine', () => {
    const paths = buildSparkline([0, 50, 100], box)
    expect(paths?.linePath.startsWith('M0')).toBe(true)
    expect(paths?.linePath).toContain('L100')
  })

  it('ignore les trous (null) sans les inventer', () => {
    const paths = buildSparkline([10, null, 30], box)
    expect(paths?.linePath.split('L')).toHaveLength(2)
  })

  it("referme l'aire à l'abscisse du dernier point réel, jamais au bord de la boîte", () => {
    // scénario retard RTE : la moitié droite de la fenêtre est vide
    const paths = buildSparkline([10, 20, 15, 25, null, null, null, null], box)
    expect(paths).not.toBeNull()
    // dernier point réel : index 3 sur 8 valeurs, x = 3/7 * 100 = 42.9
    expect(paths?.areaPath).toContain('L42.9 30')
    expect(paths?.areaPath).not.toContain('L100 30')
    expect(paths?.areaPath.endsWith('L0.0 30Z')).toBe(true)
  })

  it('renvoie null sous deux points valides', () => {
    expect(buildSparkline([42], box)).toBeNull()
    expect(buildSparkline([null, null], box)).toBeNull()
  })

  it('reste stable quand la série est plate', () => {
    const paths = buildSparkline([5, 5, 5], box)
    expect(paths?.linePath).not.toContain('NaN')
  })
})
