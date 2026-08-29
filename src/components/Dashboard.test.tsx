import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NationalLatest, NationalPoint } from '../lib/api.ts'
import { Dashboard } from './Dashboard.tsx'

// ECharts a besoin d'un vrai canvas : en jsdom on le remplace par un bloc inerte,
// les options des graphes sont testées à part (chartOptions.test.ts).
vi.mock('./charts/EChart.tsx', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="echart" />
  ),
}))

const latest: NationalLatest = {
  ts: '2026-01-15T18:00:00+00:00',
  maturity: 'C',
  consommation: 61200,
  prevision_j1: 58800,
  prevision_j: 60900,
  nucleaire: 42000,
  hydraulique: 8000,
  pompage: -500,
  eolien: 6000,
  solaire: 1000,
  gaz: 2500,
  fioul: 100,
  charbon: 200,
  bioenergies: 1100,
  ech_physiques: -1900,
  taux_co2: 32,
  updated_at: '2026-01-15T18:05:00+00:00',
}

const points: NationalPoint[] = [
  { ...latest, ts: '2026-01-15T17:30:00+00:00', consommation: 60100 },
  { ...latest, ts: '2026-01-15T17:45:00+00:00', consommation: 60800 },
  latest,
]

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  )
}

function stubApi(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(handler(url)) }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Dashboard branché sur les vues publiques', () => {
  it('affiche les KPI calculés depuis le dernier point complet', async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    // la consommation apparaît deux fois : carte KPI et gros chiffre héro
    expect(await screen.findAllByText('61,2')).toHaveLength(2)
    expect(screen.getByText('69')).toBeInTheDocument() // part du nucléaire : 42000 / 60900
    expect(screen.getByText('+1,9')).toBeInTheDocument()
    expect(screen.getByText('la France exporte')).toBeInTheDocument()
    expect(screen.getByText('+4,1 %')).toBeInTheDocument()
    expect(screen.getAllByText(/données du jeudi 15 janvier, 19:00/).length).toBeGreaterThan(0)
  })

  it('garde la marque et la légende des huit filières', async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    expect(screen.getByRole('heading', { level: 1, name: 'COURANT' })).toBeInTheDocument()
    expect(await screen.findByText(/Hydraulique/)).toBeInTheDocument()
    for (const label of [/Bioénergies/, /Fioul/]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("affiche n.d. plutôt qu'un zéro inventé quand la télémétrie est partielle", async () => {
    const partial = { ...latest, ech_physiques: null, hydraulique: null }
    const futureTail: NationalPoint[] = [
      ...points,
      // queue de prévision pure comme la vue 24 h en produit (retard RTE)
      {
        ...latest,
        ts: '2026-01-15T18:15:00+00:00',
        consommation: null,
        nucleaire: null,
        taux_co2: null,
      },
    ]
    stubApi((url) => (url.includes('v_national_latest') ? [partial] : futureTail))
    renderDashboard()

    expect(await screen.findByText('échanges indisponibles')).toBeInTheDocument()
    expect(screen.getByText('télémétrie incomplète')).toBeInTheDocument()
    expect(screen.getAllByText('n.d.').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('+0,0')).not.toBeInTheDocument()
    expect(screen.queryByText(/la France exporte/)).not.toBeInTheDocument()
  })

  it('dit honnêtement quand la source ne répond pas, sans afficher de zéros', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('réseau coupé'))),
    )
    renderDashboard()

    expect(await screen.findByText('Données indisponibles')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.queryByText('0,0')).not.toBeInTheDocument()
  })
})
