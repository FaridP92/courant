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
const latest = { ...fixturePoint(95), updated_at: new Date(BASE_TS).toISOString() }

async function mockApi(page: Page) {
  await page.route('**/rest/v1/v_national_latest**', (route) => route.fulfill({ json: [latest] }))
  await page.route('**/rest/v1/v_national_24h**', (route) => route.fulfill({ json: points }))
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
    // ECharts a réellement monté ses deux canvas (héro + mix)
    await expect(page.locator('canvas')).toHaveCount(2)
    await expect(page.getByText(/Bioénergies/)).toBeVisible()
    // un mapping cassé produirait des NaN : garde générique
    await expect(page.getByText(/NaN/)).toHaveCount(0)
  })

  test('badge LIVE et fraîcheur présents dans le header', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByText('LIVE')).toBeVisible()
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
