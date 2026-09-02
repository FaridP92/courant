import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import type { MetropolePoint, NationalLatest, NationalRange, RegionalLatest } from '../lib/api.ts'
import { FRANCE_REF, type TerritoryRef } from '../lib/territory.ts'
import { ExplorerSection } from './ExplorerSection.tsx'

vi.mock('./charts/LazyEChart.tsx', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="echart" />
  ),
  ChartSlot: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const national = {
  ts: '2026-08-29T18:00:00+00:00',
  consommation: 50000,
  nucleaire: 30000,
  hydraulique: 8000,
  eolien: 6000,
  solaire: 4000,
  gaz: 1000,
  fioul: 0,
  charbon: 0,
  bioenergies: 1000,
  pompage: -500,
  ech_physiques: -8000,
  prevision_j1: null,
  prevision_j: null,
  taux_co2: 20,
  maturity: 'R',
} as unknown as NationalLatest

const region = (code: string, name: string): RegionalLatest => ({
  region_code: code,
  region_name: name,
  ts: '2026-08-29T18:00:00+00:00',
  maturity: 'R',
  consommation: 5000,
  thermique: 200,
  nucleaire: 3000,
  eolien: 400,
  solaire: 100,
  hydraulique: 800,
  pompage: -50,
  bioenergies: 100,
  ech_physiques: 600,
})

const metroPoint: MetropolePoint = {
  epci_code: '200046977',
  name: 'Métropole de Lyon',
  ts: '2026-08-29T18:00:00+00:00',
  consommation: 900,
}

const nationalSeries = [
  { ts: '2026-08-29T17:00:00+00:00', consommation: 48000 },
  { ts: '2026-08-29T18:00:00+00:00', consommation: 52000 },
]

const regionalSeries = [
  {
    region_code: '84',
    region_name: 'Auvergne-Rhône-Alpes',
    ts: '2026-08-29T17:00:00+00:00',
    consommation: 4800,
    thermique: 200,
    nucleaire: 3000,
    eolien: 400,
    solaire: 100,
    hydraulique: 800,
    pompage: -50,
    bioenergies: 100,
    ech_physiques: 600,
  },
  {
    region_code: '84',
    region_name: 'Auvergne-Rhône-Alpes',
    ts: '2026-08-29T18:00:00+00:00',
    consommation: 5200,
    thermique: 200,
    nucleaire: 3000,
    eolien: 400,
    solaire: 100,
    hydraulique: 800,
    pompage: -50,
    bioenergies: 100,
    ech_physiques: 600,
  },
]

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      // le stub respecte le filtre region_code : une régression qui interrogerait
      // la mauvaise région serait visible
      const regionCode = /region_code=eq\.(\d+)/.exec(url)?.[1]
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('v_regional_')
              ? regionalSeries.filter((p) => p.region_code === regionCode)
              : url.includes('v_metropoles_7d')
                ? [metroPoint]
                : nationalSeries,
          ),
      })
    }),
  )
}

function Harness({ initial = FRANCE_REF }: { initial?: TerritoryRef }) {
  const [territory, setTerritory] = useState<TerritoryRef>(initial)
  // la période vit dans les filtres de la page : le harness joue ce rôle ici
  const [range, setRange] = useState<NationalRange>('24h')
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <ExplorerSection
        regions={[region('11', 'Île-de-France'), region('84', 'Auvergne-Rhône-Alpes')]}
        metropoles={[metroPoint]}
        national={national}
        territory={territory}
        onTerritoryChange={setTerritory}
        range={range}
        onRangeChange={setRange}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExplorerSection', () => {
  it('France par défaut : jauges nationales et statistiques de période', async () => {
    stubApi()
    render(<Harness />)

    // renouvelables (8000+6000+4000+1000)/50000 = 38 % ; nucléaire 60 % ; autonomie 100 %
    expect(await screen.findByRole('img', { name: 'Renouvelables : 38 %' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Nucléaire : 60 %' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Autonomie : 100 %' })).toBeInTheDocument()
    // stats de la série stub : moyenne 50, pointe 52, creux 48
    expect(await screen.findByText(/Pointe/)).toBeInTheDocument()
    expect(screen.getByText(/52,0/)).toBeInTheDocument()
    expect(screen.getByText(/48,0/)).toBeInTheDocument()
  })

  it('sélectionner une région charge sa série et calcule ses jauges', async () => {
    stubApi()
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Territoire'), { target: { value: 'region:84' } })
    // autonomie régionale : 4600 / 5000 = 92 %
    expect(await screen.findByRole('img', { name: 'Autonomie : 92 %' })).toBeInTheDocument()
    expect(await screen.findByText('Mix de production du territoire')).toBeInTheDocument()
    expect(await screen.findByText(/5,2/)).toBeInTheDocument()
  })

  it('métropole : consommation seule, dit pourquoi les jauges manquent, 30 j désactivé', async () => {
    stubApi()
    render(<Harness initial={{ kind: 'metropole', code: '200046977' }} />)

    expect(
      await screen.findByText(/Production non publiée à l'échelle des métropoles/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Autonomie/ })).toBeNull()
    expect(screen.getByRole('button', { name: '30 j' })).toBeDisabled()
  })

  it('série vide : indisponibilité dite, jamais un graphe vide muet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })),
    )
    render(<Harness initial={{ kind: 'region', code: '84' }} />)

    expect(
      await screen.findByText('Série indisponible pour ce territoire sur cette période.'),
    ).toBeInTheDocument()
  })

  it('série non vide mais entièrement nulle : même indisponibilité honnête', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(regionalSeries.map((p) => ({ ...p, consommation: null }))),
        }),
      ),
    )
    render(<Harness initial={{ kind: 'region', code: '84' }} />)

    expect(
      await screen.findByText('Série indisponible pour ce territoire sur cette période.'),
    ).toBeInTheDocument()
  })
})
