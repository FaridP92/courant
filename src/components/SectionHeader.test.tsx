import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionHeader } from './SectionHeader.tsx'

describe('SectionHeader', () => {
  it('rend un titre de niveau 2 en casse normale, un sous-titre et les commandes', () => {
    render(
      <SectionHeader
        title="Consommation nationale"
        subtitle="Réalisé et prévisions RTE, au quart d'heure."
        actions={<button type="button">Exporter</button>}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Consommation nationale' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/prévisions RTE/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeInTheDocument()
  })

  it('peut descendre au niveau 3 sans sous-titre', () => {
    render(<SectionHeader title="Mix de production" as="h3" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Mix de production' })).toBeInTheDocument()
  })
})
