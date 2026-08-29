import { describe, expect, it } from 'vitest'
import type { MetropolePoint } from './api.ts'
import { groupMetropoles } from './metropoles.ts'

const point = (
  epci: string,
  name: string,
  ts: string,
  consommation: number | null,
): MetropolePoint => ({ epci_code: epci, name, ts, consommation })

describe('groupMetropoles', () => {
  it('regroupe par code EPCI et trie chaque série par horodatage, même à réception désordonnée', () => {
    // PostgREST ne garantit pas l'ordre : lignes volontairement mélangées
    const rows = [
      point('200054781', 'Métropole du Grand Paris', '2026-01-15T18:30:00+00:00', 6200),
      point('200046977', 'Métropole de Lyon', '2026-01-15T18:30:00+00:00', 1100),
      point('200054781', 'Métropole du Grand Paris', '2026-01-15T18:00:00+00:00', 6000),
      point('200046977', 'Métropole de Lyon', '2026-01-15T18:00:00+00:00', 1300),
      point('200054781', 'Métropole du Grand Paris', '2026-01-15T18:15:00+00:00', 6100),
    ]
    const metros = groupMetropoles(rows)
    expect(metros.map((m) => m.name)).toEqual(['Métropole du Grand Paris', 'Métropole de Lyon'])
    // la valeur "instantanée" est bien le dernier point dans le temps, pas le dernier reçu
    expect(metros[0]?.latest).toBe(6200)
    expect(metros[0]?.values).toEqual([6000, 6100, 6200])
    expect(metros[1]?.latest).toBe(1100)
  })

  it("un libellé qui change en cours de fenêtre ne scinde pas la métropole : l'EPCI fait foi", () => {
    const rows = [
      point('200054781', 'Métropole du Grand Paris', '2026-01-15T18:00:00+00:00', 6000),
      point('200054781', 'Grand Paris', '2026-01-15T18:15:00+00:00', 6100),
    ]
    const metros = groupMetropoles(rows)
    expect(metros).toHaveLength(1)
    expect(metros[0]?.values).toEqual([6000, 6100])
  })

  it('garde les 6 plus consommatrices, triées, et saute les séries entièrement nulles', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      point(
        `epci-${String(i)}`,
        `Métropole ${String(i)}`,
        '2026-01-15T18:00:00+00:00',
        (i + 1) * 100,
      ),
    )
    rows.push(point('epci-muette', 'Métropole muette', '2026-01-15T18:00:00+00:00', null))
    const metros = groupMetropoles(rows)
    expect(metros).toHaveLength(6)
    expect(metros[0]?.name).toBe('Métropole 7')
    expect(metros.some((m) => m.name === 'Métropole muette')).toBe(false)
  })

  it('ignore les trous en fin de série pour la valeur instantanée, sans inventer de zéro', () => {
    const rows = [
      point('200046977', 'Métropole de Lyon', '2026-01-15T18:00:00+00:00', 1300),
      point('200046977', 'Métropole de Lyon', '2026-01-15T18:15:00+00:00', null),
    ]
    const metros = groupMetropoles(rows)
    expect(metros[0]?.latest).toBe(1300)
    // la sparkline garde le trou : il ne devient jamais un zéro
    expect(metros[0]?.values).toEqual([1300, null])
  })
})
