import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToggleChip } from './ToggleChip.tsx'

describe('ToggleChip', () => {
  it('annonce son état et bascule au clic', () => {
    const onToggle = vi.fn()
    render(<ToggleChip label="Éolien" pressed onToggle={onToggle} title="Masquer Éolien" />)

    const chip = screen.getByRole('button', { name: /Éolien/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveAttribute('title', 'Masquer Éolien')
    fireEvent.click(chip)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('affiche la valeur associée sans la rendre cliquable séparément', () => {
    render(<ToggleChip label="Nucléaire" pressed onToggle={noop} value="42,0" />)

    expect(screen.getByRole('button', { name: /Nucléaire 42,0/ })).toBeInTheDocument()
  })

  it('verrouillé : dit pourquoi, reste enfoncé et ignore le clic', () => {
    const onToggle = vi.fn()
    render(
      <ToggleChip
        label="Nucléaire"
        pressed
        onToggle={onToggle}
        lockedReason="Au moins une filière doit rester affichée"
      />,
    )

    const chip = screen.getByRole('button', { name: /Nucléaire/ })
    expect(chip).toHaveAttribute('aria-disabled', 'true')
    expect(chip).toHaveAttribute('title', 'Au moins une filière doit rester affichée')
    fireEvent.click(chip)

    expect(onToggle).not.toHaveBeenCalled()
    // neutralisé mais toujours atteignable au clavier : l'utilisateur peut lire le motif
    expect(chip).not.toBeDisabled()
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })
})

function noop() {
  return undefined
}
