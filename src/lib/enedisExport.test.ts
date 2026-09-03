import { describe, expect, it } from 'vitest'
import { enedisCurveXlsx, enedisDailyXlsx } from './__fixtures__/enedisXlsx.ts'
import {
  parseEnedisBuffer,
  parseEnedisCsv,
  parseEnedisRows,
  parseEnedisXlsx,
} from './enedisExport.ts'

const fixture = (name: string): ArrayBuffer =>
  name === 'enedis-daily.xlsx' ? enedisDailyXlsx() : enedisCurveXlsx()

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

describe('parseEnedisCsv : courbe de charge', () => {
  it('lit la courbe de charge 30 min : puissance moyenne (W) → kWh, horodatée au début du pas', () => {
    const outcome = parseEnedisCsv(CURVE_30MIN)
    if (!outcome.ok) throw new Error(outcome.reason)
    if (outcome.result.kind !== 'curve') throw new Error('courbe attendue')
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
    expect(outcome.result.kind).toBe('curve')
    expect(outcome.result.totalKwh).toBeCloseTo(1.0, 6)
  })

  it('accepte une énergie en Wh par pas sans la multiplier par la durée', () => {
    const outcome = parseEnedisCsv(PREAMBLE_FORMAT.replace('Comptage Brut;W', 'Comptage Brut;Wh'))
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
    if (outcome.result.kind !== 'curve') throw new Error('courbe attendue')
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
    if (outcome.result.kind !== 'curve') throw new Error('courbe attendue')
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
    if (outcome.result.kind !== 'curve') throw new Error('courbe attendue')
    expect(outcome.result.stepMinutes).toBe(30)
    expect(outcome.result.totalKwh).toBeCloseTo(1.6, 6)
  })

  it("refuse un fichier dont l'unité est inconnue plutôt que de deviner", () => {
    const outcome = parseEnedisCsv('Horodate;Valeur\n2026-01-05T00:00:00+01:00;12345')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/courbe de charge/)
  })

  it('refuse une production, même bien formée', () => {
    const outcome = parseEnedisCsv(
      PREAMBLE_FORMAT.replace(';Consommation;', ';Production;').replace(
        'Courbe de charge',
        'Production horaire',
      ),
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/production/)
  })

  it('refuse un fichier vide ou sans en-tête reconnu', () => {
    const empty = parseEnedisCsv('')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.reason).toMatch(/export Enedis/)
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

describe('export quotidien', () => {
  it('lit le classeur Enedis « Consommation Quotidienne » : kWh par jour, NA écarté et compté', async () => {
    const outcome = await parseEnedisXlsx(fixture('enedis-daily.xlsx'))
    if (!outcome.ok) throw new Error(outcome.reason)
    if (outcome.result.kind !== 'daily') throw new Error('quotidien attendu')
    expect(outcome.result.days).toHaveLength(6)
    expect(outcome.result.days[0]).toEqual({ day: '2026-01-01', kwh: 6.329 })
    expect(outcome.result.skippedRows).toBe(1)
    expect(outcome.result.firstDay).toBe('2026-01-01')
    expect(outcome.result.lastDay).toBe('2026-01-07')
    expect(outcome.result.dayCount).toBe(7)
    expect(outcome.result.totalKwh).toBeCloseTo(6.329 + 3.217 + 4.966 + 3.655 + 3.636 + 5.762, 6)
  })

  it('lit aussi la courbe 30 min quand elle vient en classeur', async () => {
    const outcome = await parseEnedisXlsx(fixture('enedis-curve.xlsx'))
    if (!outcome.ok) throw new Error(outcome.reason)
    if (outcome.result.kind !== 'curve') throw new Error('courbe attendue')
    expect(outcome.result.readings).toHaveLength(3)
    expect(outcome.result.totalKwh).toBeCloseTo(1.3, 6)
  })

  it('comprend les dates au format série Excel et refuse une production quotidienne', () => {
    const rows = [
      [
        'Point Référence Mesure (PRM) : ',
        '00000000000000',
        'Type de comptage : ',
        'Consommation Quotidienne',
      ],
      ['Date', 'Valeur (en kWh)'],
      [46023, 2.5], // 2026-01-01
      [46024, 1.5],
    ]
    const outcome = parseEnedisRows(rows)
    if (!outcome.ok) throw new Error(outcome.reason)
    if (outcome.result.kind !== 'daily') throw new Error('quotidien attendu')
    expect(outcome.result.days.map((d) => d.day)).toEqual(['2026-01-01', '2026-01-02'])

    const production = parseEnedisRows([
      ['Type de comptage : ', 'Production Quotidienne'],
      ['Date', 'Valeur (en kWh)'],
      ['01/01/2026', 2.5],
    ])
    expect(production.ok).toBe(false)
    if (!production.ok) expect(production.reason).toMatch(/production/)
  })

  it('dédoublonne les jours et refuse une unité incohérente (W pour un total quotidien)', () => {
    const dup = parseEnedisRows([
      ['Date', 'Valeur (en kWh)'],
      ['01/01/2026', 2.5],
      ['01/01/2026', 9],
      ['02/01/2026', '1,5'],
    ])
    if (!dup.ok) throw new Error(dup.reason)
    expect(dup.result.totalKwh).toBeCloseTo(4.0, 6)
    expect(dup.result.skippedRows).toBe(1)
    expect(
      parseEnedisRows([
        ['Date', 'Valeur (en W)'],
        ['01/01/2026', 2.5],
      ]).ok,
    ).toBe(false)
  })
})

describe('refus honnêtes issus de la revue', () => {
  it('refuse une production signalée seulement par la colonne « Grandeur metier »', () => {
    const outcome = parseEnedisCsv(PREAMBLE_FORMAT.replace(';Consommation;', ';Production;'))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/production/)
  })

  it('refuse un fichier composite (bloc quotidien puis bloc courbe) au lieu d en perdre un', () => {
    const text = [
      'Type de comptage : ;Consommation Quotidienne',
      'Date;Valeur (en kWh)',
      '01/03/2026;5',
      '02/03/2026;7',
      '',
      HEADER,
      '2026-03-03T00:30:00+01:00;1200',
      '2026-03-03T01:00:00+01:00;800',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/composite/)
  })

  it('refuse des horodatages de courbe en numéro de série Excel (fuseau inconnu), avec un message dédié', () => {
    const outcome = parseEnedisRows([
      ['horodate ISO fin de pas', 'valeur (en kWh)'],
      [46027.020833, 0.6],
      [46027.041666, 0.4],
    ])
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/dates Excel numériques/)
  })

  it('un numéro de série date-heure garde le jour de sa partie entière', () => {
    const outcome = parseEnedisRows([
      ['Date', 'Valeur (en kWh)'],
      [46023.54, 1],
      [46024.9, 2],
    ])
    if (!outcome.ok) throw new Error(outcome.reason)
    if (outcome.result.kind !== 'daily') throw new Error('quotidien attendu')
    expect(outcome.result.days.map((d) => d.day)).toEqual(['2026-01-01', '2026-01-02'])
  })
})

describe('parseEnedisBuffer', () => {
  it('reconnaît un classeur à sa signature zip et un CSV au texte', async () => {
    const xlsx = await parseEnedisBuffer(fixture('enedis-daily.xlsx'))
    expect(xlsx.ok && xlsx.result.kind).toBe('daily')
    const csv = await parseEnedisBuffer(new TextEncoder().encode(CURVE_30MIN).buffer)
    expect(csv.ok && csv.result.kind).toBe('curve')
  })
})
