import { describe, expect, it } from 'vitest'
import { seriesStats, trimTrailingGaps, windowFromLast } from './stats.ts'

const point = (ts: string, consommation: number | null) => ({ ts, consommation })

describe('seriesStats', () => {
  it('calcule moyenne, pointe et creux avec leurs horodatages', () => {
    const stats = seriesStats([
      point('2026-08-29T10:00:00+00:00', 4000),
      point('2026-08-29T10:30:00+00:00', 6000),
      point('2026-08-29T11:00:00+00:00', 5000),
    ])
    expect(stats).toEqual({
      average: 5000,
      peak: { value: 6000, ts: '2026-08-29T10:30:00+00:00' },
      low: { value: 4000, ts: '2026-08-29T10:00:00+00:00' },
      count: 3,
    })
  })

  it('ignore les trous (null) sans les compter comme des zéros', () => {
    const stats = seriesStats([
      point('2026-08-29T10:00:00+00:00', 4000),
      point('2026-08-29T10:30:00+00:00', null),
      point('2026-08-29T11:00:00+00:00', 6000),
    ])
    expect(stats?.average).toBe(5000)
    expect(stats?.count).toBe(2)
  })

  it('rend null sans aucun point exploitable : rien à afficher, rien à inventer', () => {
    expect(seriesStats([])).toBeNull()
    expect(seriesStats([point('2026-08-29T10:00:00+00:00', null)])).toBeNull()
  })
})

describe('trimTrailingGaps', () => {
  it('coupe la queue de valeurs nulles (prévisions pures), garde les trous internes', () => {
    expect(
      trimTrailingGaps([
        point('t1', 4000),
        point('t2', null),
        point('t3', 5000),
        point('t4', null),
        point('t5', null),
      ]),
    ).toEqual([point('t1', 4000), point('t2', null), point('t3', 5000)])
  })

  it('une série entièrement nulle devient vide : rien à afficher', () => {
    expect(trimTrailingGaps([point('t1', null)])).toEqual([])
    expect(trimTrailingGaps([])).toEqual([])
  })
})

describe('windowFromLast', () => {
  const pts = [
    point('2026-08-27T10:00:00+00:00', 900),
    point('2026-08-29T10:00:00+00:00', 950),
    point('2026-08-29T18:00:00+00:00', 1000),
  ]

  it('garde la fenêtre ancrée sur le dernier point, jamais sur l horloge', () => {
    expect(windowFromLast(pts, 26)).toEqual(pts.slice(1))
  })

  it('série vide ou point unique : comportement stable', () => {
    const only = point('2026-08-29T18:00:00+00:00', 1000)
    expect(windowFromLast([], 26)).toEqual([])
    expect(windowFromLast([only], 26)).toEqual([only])
  })
})
