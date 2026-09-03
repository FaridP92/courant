import { describe, expect, it } from 'vitest'
import { parseEnedisCsv } from './enedisCsv.ts'

const HEADER = 'horodate ISO fin de pas;puissance moyenne (W)'

const CURVE_30MIN = [
  'Identifiant PRM;12345678901234;Type de donnees;Courbe de charge;',
  HEADER,
  '2026-01-05T00:30:00+01:00;1200',
  '2026-01-05T01:00:00+01:00;800',
  '2026-01-05T01:30:00+01:00;600',
].join('\r\n')

/** Disposition « Mes mesures » : préambule à colonnes nommées, puis Horodate;Valeur. */
const PREAMBLE_FORMAT = [
  '﻿Identifiant PRM;Type de donnees;Date de debut;Date de fin;Grandeur physique;Grandeur metier;Etape metier;Unite',
  '12345678901234;Courbe de charge;2026-01-05;2026-01-06;Energie active;Consommation;Comptage Brut;W',
  'Horodate;Valeur',
  '2026-01-05T00:30:00+01:00;1200',
  '2026-01-05T01:00:00+01:00;800',
].join('\r\n')

describe('parseEnedisCsv', () => {
  it('lit la courbe de charge 30 min : puissance moyenne (W) → kWh, horodatée au début du pas', () => {
    const outcome = parseEnedisCsv(CURVE_30MIN)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.kind).toBe('curve')
    expect(outcome.result.stepMinutes).toBe(30)
    // 1200 W pendant 30 min = 0,6 kWh, sur le pas qui COMMENCE à 00:00
    expect(outcome.result.readings[0]).toEqual({ ts: '2026-01-04T23:00:00.000Z', kwh: 0.6 })
    expect(outcome.result.readings).toHaveLength(3)
    expect(outcome.result.totalKwh).toBeCloseTo(0.6 + 0.4 + 0.3, 6)
    expect(outcome.result.skippedRows).toBe(0)
    expect(outcome.result.from).toBe('2026-01-04T23:00:00.000Z')
    // la fin de période est la FIN du dernier pas : 1 h 30 couverte
    expect(outcome.result.to).toBe('2026-01-05T00:30:00.000Z')
  })

  it('lit la disposition à préambule (BOM, Unite en colonne, Horodate;Valeur)', () => {
    const outcome = parseEnedisCsv(PREAMBLE_FORMAT)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.stepMinutes).toBe(30)
    expect(outcome.result.totalKwh).toBeCloseTo(1.0, 6)
  })

  it('accepte une énergie en Wh par pas sans la multiplier par la durée', () => {
    const text = PREAMBLE_FORMAT.replace('Comptage Brut;W', 'Comptage Brut;Wh')
    const outcome = parseEnedisCsv(text)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.totalKwh).toBeCloseTo(2.0, 6)
  })

  it('tolère les décimales françaises et ignore les lignes vides ou malformées en les comptant', () => {
    const text = [
      HEADER,
      '2026-01-05T00:30:00+01:00;1200,5',
      '',
      'pas une ligne',
      '2026-01-05T01:00:00+01:00;',
      '2026-01-05T01:30:00+01:00;600',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.readings).toHaveLength(2)
    expect(outcome.result.skippedRows).toBe(2)
    expect(outcome.result.readings[0]?.kwh).toBeCloseTo(0.60025, 6)
  })

  it('écarte les puissances négatives et les horodatages en double, en les comptant', () => {
    const text = [
      HEADER,
      '2026-01-05T00:30:00+01:00;1200',
      '2026-01-05T01:00:00+01:00;-4000',
      '2026-01-05T01:30:00+01:00;600',
      '2026-01-05T01:30:00+01:00;600',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.readings).toHaveLength(2)
    expect(outcome.result.skippedRows).toBe(2)
    expect(outcome.result.totalKwh).toBeCloseTo(0.9, 6)
  })

  it('refuse un fichier au pas irrégulier plutôt que d appliquer un pas faux à tout', () => {
    const text = [
      HEADER,
      '2026-01-05T00:30:00+01:00;1200',
      '2026-01-05T01:00:00+01:00;800',
      '2026-01-05T01:01:00+01:00;5',
      '2026-01-05T01:30:00+01:00;600',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/irrégulier/)
  })

  it('tolère les trous (mesures manquantes) sans changer le pas', () => {
    const text = [
      HEADER,
      '2026-01-05T00:30:00+01:00;1200',
      '2026-01-05T01:00:00+01:00;800',
      '2026-01-05T05:00:00+01:00;600',
      '2026-01-05T05:30:00+01:00;600',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.stepMinutes).toBe(30)
    expect(outcome.result.totalKwh).toBeCloseTo(1.6, 6)
  })

  it("refuse un fichier dont l'unité est inconnue plutôt que de deviner", () => {
    const outcome = parseEnedisCsv('Horodate;Valeur\n2026-01-05T00:00:00+01:00;12345')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/courbe de charge/)
  })

  it('refuse une consommation quotidienne même quand l unité est connue', () => {
    const text = PREAMBLE_FORMAT.replace('Courbe de charge', 'Consommation quotidienne')
    const outcome = parseEnedisCsv(text)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/courbe de charge/)
  })

  it('refuse un fichier vide ou sans en-tête reconnu', () => {
    const empty = parseEnedisCsv('')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.reason).toMatch(/courbe de charge/)
    expect(parseEnedisCsv('a;b;c\n1;2;3').ok).toBe(false)
  })

  it("refuse une courbe d'un seul point : impossible de connaître le pas", () => {
    const outcome = parseEnedisCsv(`${HEADER}\n2026-01-05T00:30:00+01:00;1200`)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/Trop peu/)
  })

  it('refuse un fichier sans aucune consommation positive', () => {
    const outcome = parseEnedisCsv(
      `${HEADER}\n2026-01-05T00:30:00+01:00;0\n2026-01-05T01:00:00+01:00;0`,
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/positive/)
  })
})
