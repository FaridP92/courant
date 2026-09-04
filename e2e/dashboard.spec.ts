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

// Les signaux vivent au jour civil Paris : les fixtures suivent la date réelle du test
// (le reste des fixtures vit sur une journée fictive de janvier, sans interaction).
const parisDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 24 * 3600 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
const ecowattHours = (hvalue: number) => Array.from({ length: 24 }, (_, pas) => ({ pas, hvalue }))
const ecowatt = [
  { day: parisDay(0), dvalue: 1, hours: ecowattHours(1) },
  {
    day: parisDay(1),
    dvalue: 2,
    hours: ecowattHours(1).map((h) => (h.pas === 18 || h.pas === 19 ? { ...h, hvalue: 2 } : h)),
  },
  { day: parisDay(2), dvalue: 1, hours: ecowattHours(1) },
  { day: parisDay(3), dvalue: 1, hours: ecowattHours(0) },
].map((d) => ({ ...d, message: 'x', generated_at: new Date(BASE_TS).toISOString() }))

const tempo = {
  today: parisDay(0),
  season_start: '2025-09-01',
  today_color: 'BLUE',
  today_updated_at: new Date(BASE_TS).toISOString(),
  tomorrow_color: 'RED',
  tomorrow_updated_at: new Date(BASE_TS).toISOString(),
  red_days_used: 3,
  white_days_used: 11,
  blue_days_used: 120,
}

const REGION_FIXTURE_NAMES: Record<string, string> = {
  '11': 'Île-de-France',
  '84': 'Auvergne-Rhône-Alpes',
  '53': 'Bretagne',
}

const regionalSeriesFor = (code: string) =>
  Array.from({ length: 24 }, (_, i) => ({
    region_code: code,
    region_name: REGION_FIXTURE_NAMES[code] ?? code,
    ts: new Date(BASE_TS - (23 - i) * 30 * 60 * 1000).toISOString(),
    consommation: 4800 + i * 20,
    thermique: 200,
    nucleaire: 3000,
    eolien: 400,
    solaire: 100,
    hydraulique: 800,
    pompage: -50,
    bioenergies: 100,
    ech_physiques: 600,
  }))

const regionCodeFromUrl = (url: string) => /region_code=eq\.([0-9]+)/.exec(url)?.[1] ?? '84'

async function mockApi(page: Page) {
  await page.route('**/rest/v1/v_national_latest**', (route) => route.fulfill({ json: [latest] }))
  await page.route('**/rest/v1/v_national_24h**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_national_7d**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_national_30d**', (route) => route.fulfill({ json: points }))
  await page.route('**/rest/v1/v_regional_latest**', (route) => route.fulfill({ json: regions }))
  await page.route('**/rest/v1/v_metropoles_6h**', (route) => route.fulfill({ json: metros }))
  await page.route('**/rest/v1/v_ecowatt**', (route) => route.fulfill({ json: ecowatt }))
  await page.route('**/rest/v1/v_tempo**', (route) => route.fulfill({ json: [tempo] }))
  await page.route('**/rest/v1/v_regional_24h**', (route) =>
    route.fulfill({ json: regionalSeriesFor(regionCodeFromUrl(route.request().url())) }),
  )
  await page.route('**/rest/v1/v_regional_7d**', (route) =>
    route.fulfill({ json: regionalSeriesFor(regionCodeFromUrl(route.request().url())) }),
  )
  await page.route('**/rest/v1/v_regional_30d**', (route) =>
    route.fulfill({ json: regionalSeriesFor(regionCodeFromUrl(route.request().url())) }),
  )
  await page.route('**/rest/v1/v_brief**', (route) =>
    route.fulfill({
      json: [
        {
          day: parisDay(-1),
          body: "La journée d'hier a été calme sur le réseau électrique français.",
          model: 'mistral-small-latest',
          generated_at: new Date(BASE_TS).toISOString(),
        },
      ],
    }),
  )
  await page.route('**/rest/v1/v_trv_current**', (route) =>
    route.fulfill({
      json: [
        {
          option: 'BASE',
          p_souscrite: 6,
          date_debut: '2026-08-01',
          fixed_ht: 142.68,
          fixed_ttc: 189.98,
          prices_ht: { base: 0.1348 },
          prices_ttc: { base: 0.1985 },
          source_url: 'https://www.cre.fr/x.csv',
          updated_at: new Date(BASE_TS).toISOString(),
        },
        {
          option: 'HPHC',
          p_souscrite: 6,
          date_debut: '2026-08-01',
          fixed_ht: 150,
          fixed_ttc: 200,
          prices_ht: { hp: 0.15, hc: 0.11 },
          prices_ttc: { hp: 0.2081, hc: 0.1635 },
          source_url: 'https://www.cre.fr/x.csv',
          updated_at: new Date(BASE_TS).toISOString(),
        },
        {
          option: 'TEMPO',
          p_souscrite: 6,
          date_debut: '2026-08-01',
          fixed_ht: 142.68,
          fixed_ttc: 189.98,
          prices_ht: {
            hp_bleu: 0.1,
            hc_bleu: 0.1,
            hp_blanc: 0.1,
            hc_blanc: 0.1,
            hp_rouge: 0.5,
            hc_rouge: 0.1,
          },
          prices_ttc: {
            hp_bleu: 0.1654,
            hc_bleu: 0.1356,
            hp_blanc: 0.1921,
            hc_blanc: 0.1536,
            hp_rouge: 0.7295,
            hc_rouge: 0.1615,
          },
          source_url: 'https://www.cre.fr/x.csv',
          updated_at: new Date(BASE_TS).toISOString(),
        },
      ],
    }),
  )
  await page.route('**/rest/v1/v_tempo_calendar**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/v_supplier_offers_current**', (route) =>
    route.fulfill({
      json: [
        {
          supplier: 'Octopus Energy',
          offer: 'Eco-conso',
          option: 'BASE',
          p_souscrite: 6,
          fixed_ttc: 165.24,
          prices_ttc: { base: 0.1873 },
          pricing_type: 'fixe',
          price_locked_until: '2027-08-31',
          green: true,
          source_url: 'https://example.invalid/octopus-grille.pdf',
          grid_date: '2026-08-01',
          checked_at: new Date(BASE_TS).toISOString(),
        },
      ],
    }),
  )
  await page.route('**/api/chat', (route) => {
    const body = route.request().postDataJSON() as { question?: string }
    const question = body.question ?? ''
    if (/m\u00e9t\u00e9o|meteo/i.test(question)) {
      return route.fulfill({
        json: {
          answer:
            'Je ne couvre que les donn\u00e9es \u00e9lectriques publiques du tableau de bord.',
        },
      })
    }
    return route.fulfill({
      json: {
        answer: 'La France exporte 11,3 GW en ce moment.',
        sql: 'select 1 limit 1',
        rowCount: 1,
      },
    })
  })
  await page.route('**/rest/v1/v_metropoles_7d**', (route) => {
    const epci = /epci_code=eq\.([^&]+)/.exec(route.request().url())?.[1]
    return route.fulfill({ json: metros.filter((m) => m.epci_code === epci) })
  })
}

test.describe('Dashboard avec données mockées', () => {
  test('affiche les KPI, le gros chiffre et les deux graphes', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'Courant' })).toBeVisible()
    // valeurs déterministes de la fixture : conso index 95 = 55013 MW (KPI + héro)
    await expect(
      page.locator('section[aria-label^="Indicateurs clés"]').getByText('55,0'),
    ).toBeVisible()
    await expect(
      page
        .locator('section[aria-label="Consommation et mix de production dans le temps"]')
        .getByText('55,0'),
    ).toBeVisible()
    // part nucléaire 42000 / 59900 (le KPI ; l'Explorateur a sa propre jauge à 70 %)
    await expect(
      page.locator('section[aria-label^="Indicateurs clés"]').getByText(/^70\s?%$/),
    ).toBeVisible()
    await expect(page.getByText('+1,9')).toBeVisible()
    await expect(page.getByText('la France exporte', { exact: true })).toBeVisible()
    await expect(page.getByText(/vs prévision J-1/)).toBeVisible()
    await expect(page.getByText(/données du jeudi 15 janvier/).first()).toBeVisible()
    // ECharts a réellement monté ses canvas (héro, mix, carte ; ECharts peut en créer
    // plusieurs par graphe, on vérifie donc un plancher)
    await expect
      .poll(async () => page.locator('canvas').count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(3)
    await expect(page.getByText(/Bioénergies/)).toBeVisible()
    // le brief du matin est affiché avec sa provenance
    await expect(page.getByText(/journée d'hier a été calme/)).toBeVisible()
    await expect(page.getByText(/Rédigé par IA \(Mistral\)/)).toBeVisible()
    // un mapping cassé produirait des NaN : garde générique
    await expect(page.getByText(/NaN/)).toHaveCount(0)
  })

  test('badge « En direct » et fraîcheur présents dans le header', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    const header = page.locator('header')
    // le lien de navigation s'appelle aussi « En direct » : on vise la pastille
    const live = header.locator('.chip', { hasText: 'En direct' })
    await expect(live).toBeVisible()
    await expect(live).toContainText('données du jeudi 15 janvier')
    // la navigation par rubriques mène au comparateur
    await expect(header.getByRole('link', { name: 'Ma facture' })).toHaveAttribute(
      'href',
      '#compare',
    )
  })

  test("l'interactivité répond : période, filière masquable, exports, métropoles", async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    // sélecteur de période de la colonne du temps (l'Explorateur a le sien)
    const timeColumn = page.locator(
      'section[aria-label="Consommation et mix de production dans le temps"]',
    )
    const btn7d = timeColumn.getByRole('button', { name: '7 j' })
    await expect(btn7d).toHaveAttribute('aria-pressed', 'false')
    await btn7d.click()
    await expect(btn7d).toHaveAttribute('aria-pressed', 'true')
    // la période est partagée : l'Explorateur affiche le même intitulé, on cadre donc
    // l'attente sur la colonne du temps
    await expect(timeColumn.getByText(/7 jours en moyenne horaire/)).toBeVisible()

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

  test('les signaux Ecowatt et Tempo parlent les couleurs officielles, dérivées des données', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const signals = page.locator('article[aria-label="Signaux Ecowatt et Tempo"]')
    await expect(signals).toBeVisible()
    // Ecowatt : demain tendu 18-20 h, mot et phrase dérivés des heures mockées
    await expect(signals.getByText('Tendu', { exact: true })).toBeVisible()
    await expect(
      signals.getByText(/Demain : système électrique tendu entre 18 h et 20 h/),
    ).toBeVisible()
    // Tempo : aujourd'hui bleu, demain rouge annoncé avec son implication tarifaire
    await expect(signals.getByText("Aujourd'hui")).toBeVisible()
    await expect(signals.getByText('Bleu', { exact: true })).toBeVisible()
    await expect(signals.getByText('Rouge', { exact: true })).toBeVisible()
    await expect(signals.getByText(/Demain jour rouge : électricité plus chère/)).toBeVisible()
    await expect(signals.getByText(/3 rouges · 11 blancs · 120 bleus/)).toBeVisible()

    // clic sur le jour tendu : le détail heure par heure se déplie avec son résumé
    const tenseTile = signals.getByRole('button', { name: /Tendu/ })
    await expect(tenseTile).toHaveAttribute('aria-expanded', 'false')
    await tenseTile.click()
    await expect(tenseTile).toHaveAttribute('aria-expanded', 'true')
    await expect(signals.getByText(/: tendu entre 18 h et 20 h$/)).toBeVisible()
  })

  test("l'Explorateur filtre par territoire et se relie à la carte", async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const explorer = page.locator('#explorer')
    // France par défaut : les trois jauges nationales
    await expect(explorer.getByRole('img', { name: /^Renouvelables :/ })).toBeVisible()
    await expect(explorer.getByRole('img', { name: /^Autonomie :/ })).toBeVisible()

    // sélection d'une région : série, jauges et mix du territoire
    await explorer.getByLabel('Territoire').selectOption('region:84')
    await expect(explorer.getByText('Consommation · Auvergne-Rhône-Alpes')).toBeVisible()
    await expect(explorer.getByText('Mix de production du territoire')).toBeVisible()
    // autonomie régionale de la fixture v_regional_latest : 3960 / 6000 = 66 %
    await expect(explorer.getByRole('img', { name: 'Autonomie : 66 %' })).toBeVisible()

    // le pont carte vers Explorateur : sélection régionale au clavier puis « Creuser »
    // (le bouton est sr-only tant qu'il n'a pas le focus : on passe par le clavier réel)
    await page.getByRole('button', { name: 'Bretagne' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /Creuser dans l'Explorateur/ }).click()
    await expect(explorer.getByText('Consommation · Bretagne')).toBeVisible()
  })

  test('Compare ta conso : saisie manuelle, abonnement et total au tarif réglementé', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const compare = page.locator('section[aria-label="Compare ta facture"]')
    await compare.getByLabel('Consommation annuelle (kWh)').fill('4500')
    // 189,98 + 4500 × 0,1985 = 1 083,23 ; l'abonnement a sa propre colonne
    const base = compare.getByRole('row', { name: /Tarif Bleu Base/ })
    await expect(base).toContainText('189,98')
    await expect(base).toContainText('1 083,23')
    // Tempo dit pourquoi il manque plutôt que d'inventer
    await expect(compare.getByRole('row', { name: /Tempo/ })).toContainText('courbe de charge')
    // l'offre de marché mockée est moins chère : elle passe en tête, avec l'écart pour le TRV
    const octopus = compare.getByRole('row', { name: /Octopus Energy/ })
    await expect(octopus).toContainText('Le moins cher')
    await expect(octopus).toContainText('1 008,09')
    await expect(base).toContainText('+75,14')
  })

  test('Compare ta conso : import Enedis lu localement, coûts sur la période du fichier', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const compare = page.locator('section[aria-label="Compare ta facture"]')
    await compare.getByRole('button', { name: 'Importer mon export Enedis' }).click()
    // quatre pas de 30 min à 1 000 W = 2 kWh, le fichier reste dans le navigateur
    const csv = [
      'horodate ISO fin de pas;puissance moyenne (W)',
      '2026-01-05T00:30:00+01:00;1000',
      '2026-01-05T01:00:00+01:00;1000',
      '2026-01-05T01:30:00+01:00;1000',
      '2026-01-05T02:00:00+01:00;1000',
    ].join('\n')
    await compare.getByLabel(/Fichier Enedis/).setInputFiles({
      name: 'Enedis_Conso_Heure.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })

    await expect(compare.getByText(/2,0 kWh sur 2 h/)).toBeVisible()
    await expect(compare.getByRole('row', { name: /Tarif Bleu Base/ })).toContainText('€')
    await expect(compare.getByText(/abonnement au prorata/)).toBeVisible()
    // calendrier Tempo mocké vide : la ligne Tempo le dit au lieu d'inventer
    await expect(compare.getByRole('row', { name: /Tempo/ })).toContainText(
      'calendrier Tempo indisponible',
    )
  })

  test('Compare ta conso : classeur Excel quotidien lu localement, fourchettes honnêtes', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const compare = page.locator('section[aria-label="Compare ta facture"]')
    await compare.getByRole('button', { name: 'Importer mon export Enedis' }).click()
    await compare
      .getByLabel(/Fichier Enedis/)
      .setInputFiles('src/lib/__fixtures__/enedis-daily.xlsx')

    await expect(compare.getByText(/kWh sur 6 jours mesurés/)).toBeVisible()
    await expect(compare.getByRole('row', { name: /Tarif Bleu Base/ })).toContainText('€')
    // pas de courbe : heures creuses en fourchette, jamais une valeur inventée
    await expect(compare.getByRole('row', { name: /Heures creuses/ })).toContainText(' à ')
    await expect(compare.getByText(/en fourchette/)).toBeVisible()
  })

  test('le chat répond aux questions et refuse honnêtement hors périmètre', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const chat = page.locator('section[aria-label="Pose ta question"]')
    await expect(chat).toBeVisible()
    // happy path : une question suggérée, réponse et requête SQL transparente
    await chat.getByRole('button', { name: 'La France exporte-t-elle en ce moment ?' }).click()
    await expect(chat.getByText('La France exporte 11,3 GW en ce moment.')).toBeVisible()
    await expect(chat.getByText('voir la requête SQL')).toBeVisible()
    // refus d'une question hors périmètre, sans requête SQL affichée
    await chat.getByLabel('Ta question').fill('Quelle météo demain à Lyon ?')
    await chat.getByRole('button', { name: 'Demander' }).click()
    await expect(
      chat.getByText('Je ne couvre que les données électriques publiques du tableau de bord.'),
    ).toBeVisible()
    expect(await chat.getByText('voir la requête SQL').count()).toBe(1)
  })

  test("les critères vivent dans l'URL : partage par lien, retour arrière, remise à zéro", async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const timeColumn = page.locator(
      'section[aria-label="Consommation et mix de production dans le temps"]',
    )
    await timeColumn.getByRole('button', { name: '7 j' }).click()
    await page.getByRole('button', { name: /^Hydraulique/ }).click()
    await expect(page).toHaveURL(/range=7d/)
    await expect(page).toHaveURL(/fuels=/)

    // un rechargement (donc un lien partagé) rouvre exactement la même vue
    await page.reload()
    await expect(timeColumn.getByRole('button', { name: '7 j' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: /^Hydraulique/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // la période vaut pour toute la page, Explorateur compris
    await expect(page.locator('#explorer').getByRole('button', { name: '7 j' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // le retour arrière du navigateur défait le dernier critère
    await page.goBack()
    await expect(page.getByRole('button', { name: /^Hydraulique/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // la fixture est en temps réel : écarter cette maturité ne laisse aucune mesure,
    // et le tableau de bord le dit au lieu d'afficher un graphe vide
    await page.getByRole('button', { name: 'Temps réel' }).click()
    await expect(page.getByText('Aucune mesure ne correspond aux critères choisis.')).toBeVisible()

    await page.getByRole('button', { name: 'Réinitialiser' }).click()
    await expect(page).toHaveURL(/:4173\/$/)
    await expect(timeColumn.getByRole('button', { name: '24 h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('territoire, métrique de la carte et seuil CO2 voyagent aussi dans le lien', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/?territory=region:84&map=autonomie&co2=30')

    // territoire : la série et le libellé viennent des données, pas du lien
    const explorer = page.locator('#explorer')
    await expect(explorer.getByText('Consommation · Auvergne-Rhône-Alpes')).toBeVisible()
    await expect(explorer.getByLabel('Territoire')).toHaveValue('region:84')

    // carte : la teinte suit la métrique demandée
    await expect(page.getByText(/teinte = autonomie/)).toBeVisible()
    // exact : le nom du fichier d'export porte lui aussi la métrique
    await expect(page.getByRole('button', { name: 'Autonomie', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // seuil CO2 : la fixture est à 32 g/kWh, les 96 pas dépassent le palier 30
    await expect(page.getByText('CO2 : 96 pas au-dessus de 30 g/kWh, pointe 32')).toBeVisible()

    // et chaque changement repart dans l'URL
    await page.getByRole('button', { name: 'Solde' }).click()
    await expect(page).toHaveURL(/map=echanges/)
    await explorer.getByLabel('Territoire').selectOption('region:53')
    await expect(page).toHaveURL(/territory=region:53/)
    await expect(explorer.getByText('Consommation · Bretagne')).toBeVisible()
  })

  test('deux territoires se superposent, et le lien les emporte', async ({ page }) => {
    await mockApi(page)
    await page.goto('/?territory=region:84')

    const explorer = page.locator('#explorer')
    await expect(explorer.getByText('Consommation · Auvergne-Rhône-Alpes')).toBeVisible()

    await explorer.getByLabel('Comparer').selectOption('region:53')
    await expect(page).toHaveURL(/compare=region:53/)
    // la légende nomme les deux courbes et rappelle ce qui reste au principal
    await expect(explorer.getByRole('button', { name: /retirer Bretagne/i })).toBeVisible()
    await expect(
      explorer.getByText(/jauges et statistiques restent celles de Auvergne-Rhône-Alpes/),
    ).toBeVisible()

    // un rechargement rouvre la comparaison à l'identique
    await page.reload()
    await expect(explorer.getByRole('button', { name: /retirer Bretagne/i })).toBeVisible()

    // et le retrait la défait, dans la vue comme dans l'URL
    await explorer.getByRole('button', { name: /retirer Bretagne/i }).click()
    await expect(page).not.toHaveURL(/compare=/)
    await expect(explorer.getByRole('button', { name: /retirer Bretagne/i })).toHaveCount(0)
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
