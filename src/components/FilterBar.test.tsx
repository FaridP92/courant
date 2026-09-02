import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FILTERS, type Filters } from '../lib/filters.ts'
import { FilterBar } from './FilterBar.tsx'

function setup(overrides: Partial<Filters> = {}, counts = { kept: 96, total: 96 }) {
  const onChange = vi.fn()
  const onReset = vi.fn()
  render(
    <FilterBar
      filters={{ ...DEFAULT_FILTERS, ...overrides }}
      onChange={onChange}
      onReset={onReset}
      kept={counts.kept}
      total={counts.total}
    />,
  )
  return { onChange, onReset }
}

describe('FilterBar', () => {
  it('affiche la période et les trois maturités, toutes retenues par défaut', () => {
    setup()

    expect(screen.getByRole('group', { name: 'Période affichée' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Maturité des mesures' })).toBeInTheDocument()
    for (const label of ['Temps réel', 'Consolidées', 'Définitives']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('change la période sans toucher aux autres critères', () => {
    const { onChange } = setup()

    fireEvent.click(screen.getByRole('button', { name: '7 j' }))

    expect(onChange).toHaveBeenCalledWith({ range: '7d' })
  })

  it('retirer une maturité remonte le nouvel ensemble', () => {
    const { onChange } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Consolidées' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const patch = onChange.mock.calls[0]?.[0] as Partial<Filters>
    expect([...(patch.maturity ?? [])]).toEqual(['R', 'D'])
  })

  it('la dernière maturité retenue est verrouillée et dit pourquoi', () => {
    const { onChange } = setup({ maturity: new Set(['R']) })

    const last = screen.getByRole('button', { name: 'Temps réel' })
    expect(last).toHaveAttribute('aria-disabled', 'true')
    expect(last).toHaveAttribute('title', 'Au moins une maturité doit rester retenue')
    fireEvent.click(last)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('dit combien de points le filtre écarte, sans les faire disparaître en silence', () => {
    setup({ maturity: new Set(['R']) }, { kept: 84, total: 96 })

    expect(screen.getByText('84 points sur 96')).toBeInTheDocument()
  })

  it("ne compte rien quand aucun point n'est écarté", () => {
    setup()

    expect(screen.queryByText(/points sur/)).toBeNull()
  })

  it("ne propose le retour au défaut que lorsqu'un critère s'en écarte", () => {
    setup()

    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).toBeNull()
  })

  it('réinitialise tous les critères sur demande', () => {
    const { onReset } = setup({ range: '7d' })

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('FilterBar : seuil CO2', () => {
  it('propose les paliers, aucun seuil par défaut', () => {
    setup()

    expect(screen.getByRole('group', { name: "Seuil d'intensité CO2" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'aucun' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '50' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('poser un palier remonte le seuil en g/kWh', () => {
    const { onChange } = setup()

    fireEvent.click(screen.getByRole('button', { name: '50' }))

    expect(onChange).toHaveBeenCalledWith({ co2Threshold: 50 })
  })

  it('revenir à aucun retire le seuil', () => {
    const { onChange } = setup({ co2Threshold: 50 })

    fireEvent.click(screen.getByRole('button', { name: 'aucun' }))

    expect(onChange).toHaveBeenCalledWith({ co2Threshold: null })
  })
})
