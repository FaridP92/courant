import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe("App (page d'attente Phase 0)", () => {
  it('affiche le nom du projet en titre principal', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /courant/i })).toBeInTheDocument()
  })

  it('propose le lien vers la maquette du command center', () => {
    render(<App />)
    const link = screen.getByRole('link', { name: /maquette/i })
    expect(link).toHaveAttribute('href', '/design/maquette.html')
  })

  it("annonce honnêtement qu'aucune donnée n'est branchée", () => {
    render(<App />)
    expect(screen.getByText(/aucune donnée branchée/i)).toBeInTheDocument()
  })
})
