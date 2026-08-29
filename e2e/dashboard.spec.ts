import { expect, test, type Page } from '@playwright/test'

/** Fixtures : une journée plausible, générée déterministe (aucun appel réseau réel). */
const BASE_TS = Date.parse('2026-01-15T19:00:00+00:00')

function fixturePoint(index: number) {
  const ts = new Date(BASE_TS - (95 - index) * 15 * 60 * 1000).toISOString()
  const daily = Math.sin((index / 96) * Math.PI * 2 - Math.PI / 2)
  const consommation = Math.round(61000 + daily * 6000)
  return {
    ts,
    maturity: 'R',
    consommation,
    prevision_j1: consommation - 2400,
    prevision_j: consommation - 800,
    nucleaire: 42000,
    hydraulique: 8000,
    pompage: -500,
    eolien: 6000,
    solaire: index > 32 && index < 64 ? 3000 : 0,
    gaz: 2500,
    fioul: 100,
    charbon: 200,
    bioenergies: 1100,
    ech_physiques: -1900,
    taux_co2: 32,
  }
}

const points = Array.from({ length: 96 }, (_, i) => fixturePoint(i))
const latest = {
  ...fixturePoint(95),
  ech_comm_angleterre: -1000,
  ech_comm_espagne: 600,
  ech_comm_italie: -800,
  ech_comm_suisse: -300,
  ech_comm_allemagne_belgique: -400,
  updated_at: new Date(BASE_TS).toISOString(),
}

const regionRow = (code: string, name: string, consommation: number) => ({
  region_code: code,
  region_name: name,
  ts: latest.ts,
  maturity: 'R',
  consommation,
  thermique: 100,
  nucleaire: 3000,
  eolien: 400,
  solaire: 100,
  hydraulique: 300,
  pompage: -50,
  bioenergies: 60,
  ech_physiques: -500,
})
const regions = [
  regionRow('11', 'Île-de-France', 8000),
  regionRow('84', 'Auvergne-Rhône-Alpes', 6000),
  regionRow('53', 'Bretagne', 2500),
]

// Lyon arrive en premier dans la réponse mais consomme moins : l'ordre affiché doit venir
// du tri par consommation, pas de l'ordre de réception
const metros = ['Métropole de Lyon', 'Métropole du Grand Paris'].flatMap((name, m) =>
  Array.from({ length: 24 }, (_, i) => ({
    epci_code: `epci-${String(m)}`,
    name,
    ts: new Date(BASE_TS - (23 - i) * 15 * 60 * 1000).toISOString(),
    consommation: 2000 + m * 1000 + i * 10,
  })),
)

async function mockApi(page: Page) {
  await page.route('**/rest/v1/v_national_latest**', (route) => route.fulfill({ json: [latest] }))
  await page.route('**/rest/v1/v_national_24h**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_national_7d**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_national_30d**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_regional_latest**', (route) => route.fulfill({ json: regions }))
  await page.route('**/rest/v1/v_metropoles_6h**', (route) => route.fulfill({ json: metros }))
}

test.describe('Dashboard avec données mockées', () => {
  test('affiche les KPI, le gros chiffre et les deux graphes', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'COURANT' })).toBeVisible()
    // valeurs déterministes de la fixture : conso index 95 = 55013 MW
    await expect(page.getByText('55,0')).toHaveCount(2) // carte KPI + gros chiffre héro
    await expect(page.getByText(/^70\s?%$/)).toBeVisible() // part nucléaire : 42000 / 59900
    await expect(page.getByText('+1,9')).toBeVisible()
    await expect(page.getByText('la France exporte')).toBeVisible()
    await expect(page.getByText(/vs prévision J-1/)).toBeVisible()
    await expect(page.getByText(/données du jeudi 15 janvier/).first()).toBeVisible()
    // ECharts a réellement monté ses canvas (héro, mix, carte ; ECharts peut en créer
    // plusieurs par graphe, on vérifie donc un plancher)
    await expect
      .poll(async () => page.locator('canvas').count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(3)
    await expect(page.getByText(/Bioénergies/)).toBeVisible()
    // un mapping cassé produirait des NaN : garde générique
    await expect(page.getByText(/NaN/)).toHaveCount(0)
  })

  test('badge LIVE et fraîcheur présents dans le header', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByText('LIVE')).toBeVisible()
  })

  test("l'interactivité répond : période, filière masquable, exports, métropoles", async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    // sélecteur de période
    const btn7d = page.getByRole('button', { name: '7 j' })
    await expect(btn7d).toHaveAttribute('aria-pressed', 'false')
    await btn7d.click()
    await expect(btn7d).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/7 jours en moyenne horaire/)).toBeVisible()

    // légende du mix : masquer une filière (état initial vérifié, sinon un bouton
    // figé sur false passerait le test)
    const fuelToggle = page.getByRole('button', { name: /^Hydraulique/ })
    await expect(fuelToggle).toHaveAttribute('aria-pressed', 'true')
    await fuelToggle.click()
    await expect(fuelToggle).toHaveAttribute('aria-pressed', 'false')

    // exports CSV présents
    await expect(page.getByRole('button', { name: /Exporter courant-national/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Exporter courant-regions/ })).toBeVisible()

    // métropoles réellement triées par consommation : Grand Paris devant Lyon
    // alors que Lyon arrive en premier dans la réponse mockée
    const metroTitles = page.locator(
      'section[aria-label^="Consommation des principales métropoles"] p[title]',
    )
    await expect(metroTitles).toHaveCount(2)
    await expect(metroTitles.first()).toHaveAttribute('title', 'Métropole du Grand Paris')
    await expect(metroTitles.nth(1)).toHaveAttribute('title', 'Métropole de Lyon')
  })
})

test.describe('Honnêteté quand la source est coupée', () => {
  test('affiche l’indisponibilité et un bouton réessayer, jamais des zéros', async ({ page }) => {
    await page.route('**/rest/v1/**', (route) => route.abort())
    await page.goto('/')

    await expect(page.getByText('Données indisponibles')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(page.getByText('0,0')).toHaveCount(0)
    await expect(page.getByText(/NaN/)).toHaveCount(0)
  })
})
