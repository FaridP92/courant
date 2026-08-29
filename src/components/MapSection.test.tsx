import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RegionalLatest } from '../lib/api.ts'
import { MapSection } from './MapSection.tsx'

// jsdom sans canvas : le graphe est testé à part, ici on couvre les états et le clavier
vi.mock('./charts/LazyEChart.tsx', () => ({
  EChart: () => <div data-testid="echart" />,
  ChartSlot: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const region = (code: string, name: string, consommation: number): RegionalLatest => ({
  region_code: code,
  region_name: name,
  ts: '2026-08-29T10:00:00+00:00',
  maturity: 'R',
  consommation,
  thermique: 100,
  nucleaire: 3000,
  eolien: 500,
  solaire: 200,
  hydraulique: 400,
  pompage: -50,
  bioenergies: 80,
  ech_physiques: -1200,
})

function renderMap(
  regions: readonly RegionalLatest[],
  regionsStatus: 'pending' | 'error' | 'success',
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MapSection regions={regions} national={null} regionsStatus={regionsStatus} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubGeoFetch(pendingForever = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (pendingForever ? new Promise(() => undefined) : Promise.reject(new Error('geo')))),
  )
}

describe('MapSection : états honnêtes', () => {
  it("distingue la panne des données régionales d'un simple chargement", () => {
    stubGeoFetch()
    renderMap([], 'error')
    expect(screen.getByText('Données régionales indisponibles')).toBeInTheDocument()
  })

  it('une réponse vide après succès est une indisponibilité, pas un chargement infini', () => {
    stubGeoFetch()
    renderMap([], 'success')
    expect(screen.getByText('Données régionales indisponibles')).toBeInTheDocument()
  })

  it('affiche le chargement uniquement quand la requête est réellement en cours', () => {
    stubGeoFetch()
    renderMap([], 'pending')
    expect(screen.getByText('Chargement de la carte...')).toBeInTheDocument()
  })
})

describe('MapSection : sélection au clavier', () => {
  it('chaque région a un bouton focusable qui ouvre puis referme le panneau de détail', async () => {
    stubGeoFetch()
    const user = userEvent.setup()
    renderMap([region('11', 'Île-de-France', 8000), region('53', 'Bretagne', 2500)], 'success')

    const button = screen.getByRole('button', { name: 'Île-de-France' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    // le panneau s'ouvre et le focus se déplace sur son titre
    const title = await screen.findByRole('heading', { level: 3, name: 'Île-de-France' })
    expect(title).toHaveFocus()
    expect(screen.getByText(/8,0/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fermer le détail de la région' }))
    expect(screen.queryByRole('heading', { level: 3, name: 'Île-de-France' })).toBeNull()
    // le focus revient sur le bouton de la région, jamais perdu sur body
    expect(button).toHaveFocus()
  })
})
