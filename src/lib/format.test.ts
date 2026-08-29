import { describe, expect, it } from 'vitest'
import {
  formatFreshness,
  formatGigawatts,
  formatParisClock,
  formatParisDate,
  formatSignedGigawatts,
  formatSignedPercent,
  formatWholePercent,
} from './format.ts'

describe('formatGigawatts', () => {
  it('convertit des MW en GW avec une décimale, virgule française', () => {
    expect(formatGigawatts(71812)).toBe('71,8')
    expect(formatGigawatts(52000)).toBe('52,0')
  })

  it('reste prudent sous le gigawatt', () => {
    expect(formatGigawatts(940)).toBe('0,9')
  })
})

describe('formatSignedGigawatts', () => {
  it('affiche le signe explicite', () => {
    expect(formatSignedGigawatts(1907)).toBe('+1,9')
    expect(formatSignedGigawatts(-13007)).toBe('-13,0')
  })
})

describe('formatWholePercent', () => {
  it('arrondit une part en pourcentage entier', () => {
    expect(formatWholePercent(0.609)).toBe('61')
    expect(formatWholePercent(0.313)).toBe('31')
  })
})

describe('formatSignedPercent', () => {
  it('affiche un écart en pourcentage signé à une décimale', () => {
    expect(formatSignedPercent(0.0405)).toBe('+4,1 %')
    expect(formatSignedPercent(-0.012)).toBe('-1,2 %')
  })
})

describe('heures Europe/Paris', () => {
  it('convertit un instant UTC en heure de Paris, hiver comme été', () => {
    expect(formatParisClock('2026-01-15T18:00:00+00:00')).toBe('19:00')
    expect(formatParisClock('2026-07-15T18:00:00+00:00')).toBe('20:00')
  })

  it('formate la date du jour en français', () => {
    expect(formatParisDate('2026-01-28T18:12:00+00:00')).toBe('mercredi 28 janvier')
  })

  it('construit le libellé de fraîcheur du brief', () => {
    const sameEvening = new Date('2026-01-15T21:00:00+00:00')
    expect(formatFreshness('2026-01-15T18:00:00+00:00', sameEvening)).toBe('données de 19:00')
  })

  it("précise le jour quand la donnée n'est plus d'aujourd'hui", () => {
    const morningAfter = new Date('2026-01-16T07:00:00+00:00')
    expect(formatFreshness('2026-01-15T22:45:00+00:00', morningAfter)).toBe("données d'hier, 23:45")
    const twoDaysLater = new Date('2026-01-17T07:00:00+00:00')
    expect(formatFreshness('2026-01-15T22:45:00+00:00', twoDaysLater)).toBe(
      'données du jeudi 15 janvier, 23:45',
    )
  })
})
