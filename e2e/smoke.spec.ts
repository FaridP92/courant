import { expect, test } from '@playwright/test'

test.describe('Parcours minimal Phase 0', () => {
  test("la page d'accueil charge avec le titre Courant", async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Courant/)
    await expect(page.getByRole('heading', { level: 1, name: /courant/i })).toBeVisible()
  })

  test('la maquette statique du command center est servie', async ({ page }) => {
    await page.goto('/design/maquette.html')
    // Marqueurs discriminants : le fallback SPA de vite preview renvoie index.html
    // sur les chemins inconnus, un simple mot "maquette" ne prouverait rien.
    await expect(page).toHaveTitle(/maquette du command center/i)
    await expect(page.getByText('Maquette statique · Phase 0')).toBeVisible()
  })
})
