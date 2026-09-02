import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NationalLatest, NationalPoint, RegionalLatest } from '../lib/api.ts'
import { Dashboard } from './Dashboard.tsx'

// ECharts a besoin d'un vrai canvas : en jsdom on le remplace par un bloc inerte,
// les options des graphes sont testées à part (chartOptions.test.ts).
vi.mock('./charts/EChart.tsx', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="echart" />
  ),
  registerGeoMap: () => undefined,
}))

// La carte a sa propre plomberie (GeoJSON, registerMap) : testée à part
vi.mock('./MapSection.tsx', () => ({
  MapSection: () => <div data-testid="map-section" />,
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
  ech_comm_angleterre: -1000,
  ech_comm_espagne: 500,
  ech_comm_italie: -900,
  ech_comm_suisse: -300,
  ech_comm_allemagne_belgique: -200,
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
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('v_regional_latest') ||
              url.includes('v_metropoles_6h') ||
              url.includes('v_ecowatt') ||
              url.includes('v_tempo') ||
              url.includes('v_brief')
              ? []
              : handler(url),
          ),
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  // les filtres vivent dans l'URL : chaque test repart d'une page nue
  window.history.replaceState(null, '', '/')
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

  it('dit honnêtement quand les métropoles ne remontent rien, sans faire disparaître la rubrique', async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    expect(await screen.findByText(/métropoles indisponible/)).toBeInTheDocument()
  })

  it('les signaux Ecowatt et Tempo indisponibles restent des rubriques visibles et honnêtes', async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    expect(
      await screen.findByText('Signal Ecowatt indisponible pour le moment.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Calendrier Tempo indisponible pour le moment.')).toBeInTheDocument()
  })

  it('la dernière filière visible ne peut pas être masquée et le dit', async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    const nuclear = await screen.findByRole('button', { name: /^Nucléaire/ })
    for (const label of [
      /^Hydraulique/,
      /^Éolien/,
      /^Solaire/,
      /^Gaz/,
      /^Fioul/,
      /^Charbon/,
      /^Bioénergies/,
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
    }
    expect(nuclear).toHaveAttribute('aria-disabled', 'true')
    expect(nuclear).toHaveAttribute('title', 'Au moins une filière doit rester affichée')
    // le clic sur un bouton neutralisé ne change rien
    fireEvent.click(nuclear)
    expect(nuclear).toHaveAttribute('aria-pressed', 'true')
    // les filières masquées restent réaffichables
    expect(screen.getByRole('button', { name: /^Hydraulique/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
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

describe('Filtres du tableau de bord', () => {
  // la colonne du temps et l'Explorateur portent chacun un sélecteur de période :
  // les requêtes de période sont donc toujours cadrées sur une section
  const timeColumn = () =>
    within(screen.getByRole('region', { name: 'Consommation et mix de production dans le temps' }))

  it("la période, les filières et la maturité voyagent dans l'URL", async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()
    await screen.findAllByText('61,2')

    fireEvent.click(timeColumn().getByRole('button', { name: '7 j' }))
    expect(window.location.search).toBe('?range=7d')

    fireEvent.click(screen.getByRole('button', { name: /^Hydraulique/ }))
    expect(window.location.search).toContain('fuels=')
    expect(window.location.search).not.toContain('hydraulique')

    fireEvent.click(screen.getByRole('button', { name: 'Consolidées' }))
    expect(window.location.search).toContain('maturity=R,D')
  })

  it('une URL portant des critères rouvre exactement la même vue', async () => {
    window.history.replaceState(null, '', '/?range=7d&fuels=nucleaire,eolien')
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()
    await screen.findAllByText('61,2')

    expect(timeColumn().getByRole('button', { name: '7 j' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Hydraulique/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /^Nucléaire/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it("la période choisie vaut aussi pour l'Explorateur : un seul critère, deux vues", async () => {
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()
    await screen.findAllByText('61,2')

    fireEvent.click(timeColumn().getByRole('button', { name: '30 j' }))

    const explorer = within(screen.getByRole('region', { name: 'Explorateur par territoire' }))
    expect(explorer.getByRole('button', { name: '30 j' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("un critère qui écarte toute la série le dit, au lieu d'un graphe vide", async () => {
    // la fixture est consolidée : ne garder que le temps réel ne laisse aucune mesure
    window.history.replaceState(null, '', '/?maturity=R')
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    expect(
      await screen.findByText('Aucune mesure ne correspond aux critères choisis.'),
    ).toBeInTheDocument()
    // le graphe héro disparaît au profit du message ; l'Explorateur garde sa propre
    // série, qui ne porte pas la maturité (vues régionales et métropoles)
    expect(timeColumn().queryByRole('img', { name: /Courbe de consommation/ })).toBeNull()
  })

  it('revenir au défaut nettoie les critères et rétablit la vue', async () => {
    window.history.replaceState(null, '', '/?range=7d&maturity=R')
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()

    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser' }))

    expect(window.location.search).toBe('')
    expect(timeColumn().getByRole('button', { name: '24 h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText('Aucune mesure ne correspond aux critères choisis.')).toBeNull()
  })

  it('le filtre de maturité dit combien de points il écarte', async () => {
    const mixed: NationalPoint[] = points.map((point, index) => ({
      ...point,
      maturity: index === 0 ? 'R' : 'C',
    }))
    window.history.replaceState(null, '', '/?maturity=C')
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : mixed))
    renderDashboard()

    expect(await screen.findByText('2 points sur 3')).toBeInTheDocument()
  })
})

describe("Territoire porté par l'URL", () => {
  const regionRow: RegionalLatest = {
    region_code: '84',
    region_name: 'Auvergne-Rhône-Alpes',
    ts: latest.ts,
    maturity: 'C',
    consommation: 6000,
    thermique: 100,
    nucleaire: 3000,
    eolien: 400,
    solaire: 100,
    hydraulique: 300,
    pompage: -50,
    bioenergies: 60,
    ech_physiques: -500,
  }

  const explorer = () => within(screen.getByRole('region', { name: 'Explorateur par territoire' }))

  function stubWithRegions() {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.includes('v_national_latest')
                ? [latest]
                : url.includes('v_regional_latest')
                  ? [regionRow]
                  : url.includes('v_metropoles') ||
                      url.includes('v_ecowatt') ||
                      url.includes('v_tempo') ||
                      url.includes('v_brief')
                    ? []
                    : points,
            ),
        }),
      ),
    )
  }

  it("changer de territoire écrit le critère dans l'URL", async () => {
    stubWithRegions()
    renderDashboard()
    await screen.findAllByText('61,2')

    fireEvent.change(await explorer().findByLabelText('Territoire'), {
      target: { value: 'region:84' },
    })

    expect(window.location.search).toBe('?territory=region:84')
    expect(await explorer().findByText('Consommation · Auvergne-Rhône-Alpes')).toBeInTheDocument()
  })

  it('un lien vers un territoire rouvre ce territoire, libellé résolu depuis les données', async () => {
    window.history.replaceState(null, '', '/?territory=region:84')
    stubWithRegions()
    renderDashboard()
    await screen.findAllByText('61,2')

    expect(await explorer().findByText('Consommation · Auvergne-Rhône-Alpes')).toBeInTheDocument()
    expect(explorer().getByLabelText('Territoire')).toHaveValue('region:84')
  })

  it('libellés pas encore chargés : le code fait foi, jamais un autre territoire', async () => {
    window.history.replaceState(null, '', '/?territory=region:84')
    // v_regional_latest ne répond rien : aucune liste de libellés
    stubApi((url) => (url.includes('v_national_latest') ? [latest] : points))
    renderDashboard()
    await screen.findAllByText('61,2')

    expect(await explorer().findByText('Consommation · Région 84')).toBeInTheDocument()
    expect(explorer().getByLabelText('Territoire')).toHaveValue('region:84')
  })
})
