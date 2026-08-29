import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EcowattDay, TempoSnapshot } from '../lib/api.ts'
import { SignalsSection } from './SignalsSection.tsx'

const hours24 = (hvalue: number) => Array.from({ length: 24 }, (_, pas) => ({ pas, hvalue }))

const ecowattDay = (day: string, dvalue: 1 | 2 | 3, hvalues = hours24(1)): EcowattDay => ({
  day,
  dvalue,
  message: 'x',
  generated_at: '2026-08-28T22:00:00+02:00',
  hours: hvalues,
})

const tempo: TempoSnapshot = {
  today: '2026-08-29',
  season_start: '2025-09-01',
  today_color: 'BLUE',
  today_updated_at: '2026-08-28T08:20:00+00:00',
  tomorrow_color: 'RED',
  tomorrow_updated_at: '2026-08-29T08:20:00+00:00',
  red_days_used: 22,
  white_days_used: 43,
  blue_days_used: 298,
}

const fourDays: EcowattDay[] = [
  ecowattDay('2026-08-29', 1),
  ecowattDay('2026-08-30', 2, [
    ...hours24(1).slice(0, 18),
    { pas: 18, hvalue: 2 },
    { pas: 19, hvalue: 2 },
    ...hours24(1).slice(20),
  ]),
  ecowattDay('2026-08-31', 1),
  ecowattDay('2026-09-01', 1),
]

describe('SignalsSection', () => {
  it('affiche 4 tuiles Ecowatt avec les mots officiels et la phrase des heures tendues', () => {
    render(
      <SignalsSection
        ecowatt={fourDays}
        ecowattStatus="success"
        tempo={tempo}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText('sam 29')).toBeInTheDocument()
    expect(screen.getByText('dim 30')).toBeInTheDocument()
    expect(screen.getAllByText('Vert')).toHaveLength(3)
    expect(screen.getByText('Tendu')).toBeInTheDocument()
    expect(
      screen.getByText(/Demain : système électrique tendu entre 18 h et 20 h/),
    ).toBeInTheDocument()
  })

  it('affiche Tempo aujourd hui, demain et les compteurs de saison', () => {
    render(
      <SignalsSection
        ecowatt={fourDays}
        ecowattStatus="success"
        tempo={tempo}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument()
    expect(screen.getByText('Bleu')).toBeInTheDocument()
    expect(screen.getByText('Demain')).toBeInTheDocument()
    expect(screen.getByText('Rouge')).toBeInTheDocument()
    expect(screen.getByText(/Demain jour rouge : électricité plus chère/)).toBeInTheDocument()
    // le millésime de la saison vient de season_start, jamais d'un texte figé
    expect(
      screen.getByText(/Saison depuis le 1er septembre 2025 : 22 rouges · 43 blancs · 298 bleus/),
    ).toBeInTheDocument()
  })

  it('demain non publié : la tuile dit « À venir », jamais une couleur inventée', () => {
    render(
      <SignalsSection
        ecowatt={fourDays}
        ecowattStatus="success"
        tempo={{ ...tempo, tomorrow_color: null }}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText('À venir')).toBeInTheDocument()
    expect(screen.getByText(/publiée par RTE vers 10 h 20/)).toBeInTheDocument()
  })

  it('dit honnêtement les indisponibilités par signal, sans faire disparaître la carte', () => {
    render(
      <SignalsSection
        ecowatt={[]}
        ecowattStatus="error"
        tempo={null}
        tempoStatus="error"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText('Signal Ecowatt indisponible pour le moment.')).toBeInTheDocument()
    expect(screen.getByText('Calendrier Tempo indisponible pour le moment.')).toBeInTheDocument()
  })

  it("pendant le chargement, aucune fausse indisponibilité n'est affichée", () => {
    render(
      <SignalsSection
        ecowatt={[]}
        ecowattStatus="pending"
        tempo={null}
        tempoStatus="pending"
        today="2026-08-29"
      />,
    )
    expect(screen.queryByText(/Ecowatt indisponible/)).toBeNull()
    expect(screen.queryByText(/Tempo indisponible/)).toBeNull()
  })

  it('le bloc Tempo affiche la fraîcheur de la publication RTE', () => {
    render(
      <SignalsSection
        ecowatt={fourDays}
        ecowattStatus="success"
        tempo={tempo}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText(/Publication RTE/)).toBeInTheDocument()
  })

  it('cliquer une tuile Ecowatt déplie le détail horaire du jour, re-cliquer le replie', () => {
    render(
      <SignalsSection
        ecowatt={fourDays}
        ecowattStatus="success"
        tempo={tempo}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    const tile = screen.getByRole('button', { name: /dim 30/ })
    expect(tile).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-expanded', 'true')
    expect(tile).toHaveAttribute('aria-controls', 'ecowatt-detail')
    // résumé dérivé des heures, préfixé par le jour (le distingue de la note générale)
    expect(screen.getByText(/dim 30 : tendu entre 18 h et 20 h/)).toBeInTheDocument()
    // la clé de lecture de la bande est présente
    expect(screen.getByText(/case vide : non publié/)).toBeInTheDocument()
    fireEvent.click(tile)
    expect(screen.queryByText(/dim 30 : tendu entre 18 h et 20 h/)).toBeNull()
  })

  it('une réponse vide après succès est aussi une indisponibilité (jamais de vert par défaut)', () => {
    render(
      <SignalsSection
        ecowatt={[]}
        ecowattStatus="success"
        tempo={null}
        tempoStatus="success"
        today="2026-08-29"
      />,
    )
    expect(screen.getByText('Signal Ecowatt indisponible pour le moment.')).toBeInTheDocument()
    expect(screen.getByText('Calendrier Tempo indisponible pour le moment.')).toBeInTheDocument()
  })
})
