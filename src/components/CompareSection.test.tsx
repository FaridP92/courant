import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TempoCalendarDay, TrvTariff } from '../lib/api.ts'
import { enedisDailyXlsx } from '../lib/__fixtures__/enedisXlsx.ts'
import { CompareSection } from './CompareSection.tsx'

const tariff = (
  option: TrvTariff['option'],
  fixed_ttc: number,
  prices_ttc: Record<string, number>,
  p_souscrite = 6,
): TrvTariff => ({
  option,
  p_souscrite,
  date_debut: '2026-08-01',
  fixed_ht: fixed_ttc / 1.3,
  fixed_ttc,
  prices_ht: prices_ttc,
  prices_ttc,
  source_url: 'https://www.cre.fr/fileadmin/Documents/Open_data/Marches_de_detail/Option_Base.csv',
  updated_at: '2026-09-01T00:00:00Z',
})

const TEMPO_PRICES = {
  hp_bleu: 0.1654,
  hc_bleu: 0.1356,
  hp_blanc: 0.1921,
  hc_blanc: 0.1536,
  hp_rouge: 0.7295,
  hc_rouge: 0.1615,
}

const tariffs: TrvTariff[] = [
  tariff('BASE', 229.68, { base: 0.1985 }),
  tariff('BASE', 288.12, { base: 0.1985 }, 9),
  tariff('HPHC', 237.34, { hp: 0.2081, hc: 0.1635 }),
  tariff('TEMPO', 189.98, TEMPO_PRICES),
]

const calendar: TempoCalendarDay[] = [
  { day: '2026-01-05', color: 'BLUE' },
  { day: '2026-01-06', color: 'RED' },
]

const CSV = [
  'Identifiant PRM;12345678901234;',
  'horodate ISO fin de pas;puissance moyenne (W)',
  // deux mesures consécutives fixent le pas à 30 min ; la première ne pèse rien
  '2026-01-05T12:00:00+01:00;0',
  '2026-01-05T12:30:00+01:00;2000',
  '2026-01-05T23:30:00+01:00;4000',
  '2026-01-06T18:30:00+01:00;6000',
].join('\n')

const importFile = async (file: File) => {
  fireEvent.click(screen.getByRole('button', { name: /Importer mon export Enedis/ }))
  fireEvent.change(screen.getByLabelText(/Fichier Enedis/), { target: { files: [file] } })
  await waitFor(() => {
    expect(screen.queryByRole('table') ?? screen.queryByRole('alert')).not.toBeNull()
  })
}

const importCsv = (text: string) =>
  importFile(new File([text], 'Enedis_Conso_Heure.csv', { type: 'text/csv' }))

const dailyXlsxFile = () => new File([enedisDailyXlsx()], 'Export_energie_Consommation.xlsx')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CompareSection', () => {
  it('saisie manuelle : Base et abonnement affichés, Tempo dit honnêtement pourquoi il manque', () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    expect(screen.getByText(/Saisis ta consommation/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.change(screen.getByLabelText('Consommation annuelle (kWh)'), {
      target: { value: '4500' },
    })
    // 229,68 + 4500 × 0,1985 = 1 122,93
    const base = screen.getByRole('row', { name: /Tarif Bleu Base/ })
    expect(base).toHaveTextContent(/229,68/)
    expect(base).toHaveTextContent(/1.122,93/)
    expect(screen.getByRole('columnheader', { name: 'Coût kWh' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Tempo/ })).toHaveTextContent(/courbe de charge/)
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(/cochez/)
  })

  it('la puissance souscrite change l abonnement', () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    fireEvent.change(screen.getByLabelText('Consommation annuelle (kWh)'), {
      target: { value: '4500' },
    })
    fireEvent.change(screen.getByLabelText('Puissance souscrite'), { target: { value: '9' } })
    expect(screen.getByRole('row', { name: /Tarif Bleu Base/ })).toHaveTextContent(/288,12/)
  })

  it('6 kVA est la puissance par défaut même si la grille commence à 3 kVA', () => {
    render(
      <CompareSection
        tariffs={[tariff('BASE', 120, { base: 0.1985 }, 3), ...tariffs]}
        tariffsStatus="success"
        calendar={calendar}
      />,
    )
    expect(screen.getByLabelText('Puissance souscrite')).toHaveValue('6')
  })

  it('la puissance affichée est toujours celle calculée, même sans 6 kVA dans les grilles', () => {
    render(
      <CompareSection
        tariffs={[tariff('BASE', 288.12, { base: 0.1985 }, 9)]}
        tariffsStatus="success"
        calendar={calendar}
      />,
    )
    expect(screen.getByLabelText('Puissance souscrite')).toHaveValue('9')
    fireEvent.change(screen.getByLabelText('Consommation annuelle (kWh)'), {
      target: { value: '4500' },
    })
    expect(screen.getByRole('row', { name: /Tarif Bleu Base/ })).toHaveTextContent(/288,12/)
  })

  it('saisie HP/HC connue : le tarif heures creuses se calcule et Base suit la somme', () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    fireEvent.change(screen.getByLabelText('Consommation annuelle (kWh)'), {
      target: { value: '4500' },
    })
    fireEvent.click(screen.getByLabelText(/Je connais ma répartition/))
    // la case cochée sans kWh saisis : Base garde le total, HP/HC demande la saisie
    expect(screen.getByRole('row', { name: /Tarif Bleu Base/ })).toHaveTextContent(/1.122,93/)
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(/saisissez/)

    fireEvent.change(screen.getByLabelText('Heures pleines (kWh)'), { target: { value: '3000' } })
    fireEvent.change(screen.getByLabelText('Heures creuses (kWh)'), { target: { value: '1500' } })
    // 237,34 + 3000 × 0,2081 + 1500 × 0,1635 = 1 106,89
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(/1.106,89/)
  })

  it('import Enedis : période réelle, Tempo exact jour par jour, aucune requête réseau', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    await importCsv(CSV)

    // 1 kWh HP bleu + 2 kWh HC bleu + 3 kWh HP rouge = 6 kWh, du 5/1 11:30 au 6/1 18:30 : 31 h
    expect(screen.getByText(/6,0 kWh sur 31 h,/)).toBeInTheDocument()
    const tempo = screen.getByRole('row', { name: /Tempo/ })
    // énergie : 1 × 0,1654 + 2 × 0,1356 + 3 × 0,7295 = 2,63 ; abonnement 31 h : 189,98 × (31/24) / 365 = 0,67
    expect(tempo).toHaveTextContent(/2,63/)
    expect(tempo).toHaveTextContent(/0,67/)
    expect(screen.getByText(/ne quitte jamais votre navigateur/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('une plage heures creuses vide bloque le tarif HP/HC sans toucher à Tempo (22 h-6 h fixes)', async () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    await importCsv(CSV)
    fireEvent.change(screen.getByLabelText('Heures creuses de'), { target: { value: '06:00' } })
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(
      /plage d'heures creuses invalide/,
    )
    expect(screen.getByRole('row', { name: /Tempo/ })).toHaveTextContent(/2,63/)
  })

  it('import illisible : message honnête, aucun tableau', async () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    await importCsv('Horodate;Valeur\n2026-01-05T00:00:00+01:00;5')
    expect(screen.getByRole('alert')).toHaveTextContent(/pas un export Enedis reconnu/)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('jours hors calendrier Tempo : le coût Tempo est refusé, pas estimé', async () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={[]} />)
    await importCsv(CSV)
    expect(screen.getByRole('row', { name: /Tempo/ })).toHaveTextContent(
      /calendrier Tempo indisponible/,
    )
    expect(screen.getByRole('row', { name: /Tarif Bleu Base/ })).toHaveTextContent(/€/)
  })

  it('export quotidien Excel : Base exact, HP/HC et Tempo en fourchette, plages HC masquées', async () => {
    const fullCalendar: TempoCalendarDay[] = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-01-0${String(i + 1)}`,
      color: i === 6 ? 'RED' : 'BLUE',
    }))
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={fullCalendar} />)
    await importFile(dailyXlsxFile())

    // 6 jours mesurés sur 7 (le 3 janvier est « NA ») : 27,565 kWh
    expect(
      screen.getByText(
        /27,6 kWh sur 6 jours mesurés \(période de 7 jours civils, 1 jour sans donnée, 1 ligne écartée\)/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Énergie sur les 6 jours mesurés, abonnement sur les 7 jours/),
    ).toBeInTheDocument()
    // Base exact : 229,68 × 7 / 365 = 4,40 ; 27,565 × 0,1985 = 5,47
    const base = screen.getByRole('row', { name: /Tarif Bleu Base/ })
    expect(base).toHaveTextContent(/4,40/)
    expect(base).toHaveTextContent(/5,47/)
    // HP/HC : 27,565 × 0,1635 = 4,51 à 27,565 × 0,2081 = 5,74
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(/4,51 € à 5,74 €/)
    // Tempo : couleurs connues, part HP/HC inconnue : une fourchette aussi
    expect(screen.getByRole('row', { name: /Tempo/ })).toHaveTextContent(/ à /)
    expect(screen.getByText(/en fourchette/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Heures creuses de')).toBeNull()
  })

  it('export quotidien hors calendrier Tempo : la fourchette Tempo est refusée, pas devinée', async () => {
    render(<CompareSection tariffs={tariffs} tariffsStatus="success" calendar={calendar} />)
    await importFile(dailyXlsxFile())
    expect(screen.getByRole('row', { name: /Tempo/ })).toHaveTextContent(
      /hors du calendrier Tempo connu/,
    )
    expect(screen.getByRole('row', { name: /Heures creuses/ })).toHaveTextContent(/ à /)
  })

  it('pendant le chargement, la rubrique ne prétend pas que les grilles manquent', () => {
    render(<CompareSection tariffs={[]} tariffsStatus="pending" calendar={[]} />)
    expect(screen.getByText(/Chargement des grilles/)).toBeInTheDocument()
    expect(screen.queryByText(/indisponible/)).toBeNull()
  })

  it('grilles indisponibles : la rubrique le dit au lieu d afficher des prix vides', () => {
    render(<CompareSection tariffs={[]} tariffsStatus="error" calendar={[]} />)
    expect(screen.getByText(/Grilles tarifaires indisponibles/)).toBeInTheDocument()
  })
})
