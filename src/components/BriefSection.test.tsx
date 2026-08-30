import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DailyBrief } from '../lib/api.ts'
import { BriefSection } from './BriefSection.tsx'

const brief: DailyBrief = {
  day: '2026-08-29',
  body: 'Samedi 29 août, la consommation électrique française a atteint une moyenne de 39,4 GW.',
  model: 'mistral-small-latest',
  generated_at: '2026-08-30T05:30:00+00:00',
}

describe('BriefSection', () => {
  it('affiche le brief avec sa provenance et sa date de rédaction', () => {
    render(<BriefSection brief={brief} status="success" />)
    expect(screen.getByText(/39,4 GW/)).toBeInTheDocument()
    expect(
      screen.getByText(/Rédigé par IA \(Mistral\) à partir des données RTE de la veille/),
    ).toBeInTheDocument()
    expect(screen.getByText(/samedi 29 août/)).toBeInTheDocument()
  })

  it("sans brief publié, dit quand le premier arrivera plutôt que d'inventer", () => {
    render(<BriefSection brief={null} status="success" />)
    expect(
      screen.getByText('Le premier brief sera rédigé demain matin vers 07 h 30.'),
    ).toBeInTheDocument()
  })

  it('pendant le chargement, la rubrique reste silencieuse', () => {
    const { container } = render(<BriefSection brief={null} status="pending" />)
    expect(container.textContent).not.toMatch(/premier brief/)
  })
})
