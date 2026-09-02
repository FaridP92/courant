import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl.tsx'

const options = [
  { value: 'a', label: 'A', title: 'Option A' },
  { value: 'b', label: 'B', title: 'Option B' },
] as const

describe('SegmentedControl', () => {
  it("annonce le groupe, l'option active et son intitulé", () => {
    render(
      <SegmentedControl label="Période affichée" options={options} value="a" onChange={noop} />,
    )

    expect(screen.getByRole('group', { name: 'Période affichée' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('title', 'Option B')
  })

  it("remonte le choix de l'utilisateur", () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl label="Période affichée" options={options} value="a" onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'B' }))

    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('une option indisponible est neutralisée et dit pourquoi', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Période affichée"
        options={options}
        value="a"
        onChange={onChange}
        disabled={{ b: 'Historique limité à 7 jours' }}
      />,
    )

    const b = screen.getByRole('button', { name: 'B' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('title', 'Historique limité à 7 jours')
    fireEvent.click(b)
    expect(onChange).not.toHaveBeenCalled()
  })
})

function noop() {
  return undefined
}
