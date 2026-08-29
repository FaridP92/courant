import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gauge } from './Gauge.tsx'

describe('Gauge', () => {
  it('affiche le libellé, la valeur et porte un nom accessible complet', () => {
    render(
      <Gauge label="Part renouvelable" fraction={0.35} valueText="35 %" hint="de la production" />,
    )
    expect(screen.getByRole('img', { name: 'Part renouvelable : 35 %' })).toBeInTheDocument()
    expect(screen.getByText('35 %')).toBeInTheDocument()
    expect(screen.getByText('de la production')).toBeInTheDocument()
  })

  it("sans donnée, la jauge dit n.d. plutôt qu'un zéro inventé", () => {
    render(<Gauge label="Autonomie" fraction={null} valueText="n.d." />)
    expect(screen.getByRole('img', { name: 'Autonomie : n.d.' })).toBeInTheDocument()
    expect(screen.getByText('n.d.')).toBeInTheDocument()
  })

  it('une fraction au-delà de 1 remplit la jauge sans mentir sur la valeur affichée', () => {
    render(<Gauge label="Autonomie" fraction={1.85} valueText="185 %" />)
    expect(screen.getByRole('img', { name: 'Autonomie : 185 %' })).toBeInTheDocument()
    expect(screen.getByText('185 %')).toBeInTheDocument()
  })
})
