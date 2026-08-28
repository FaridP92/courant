# Courant : conventions du projet

Command center temps réel de l'électricité française. Données RTE via ODRÉ, ingestion n8n,
stockage Supabase, front Vite/React/TS sur Vercel. Brief complet : ../PROMPT_Claude_Code_Courant.md
(hors repo).

## Règles non négociables

1. TDD systématique : le test s'écrit avant le code (Vitest + Testing Library, Playwright en E2E).
2. TypeScript strict maximal, ESLint strictTypeChecked, zéro `any` non justifié.
3. Code et identifiants en anglais ; contenus UI et documentation produit en français.
4. Typographie : aucun tiret long (U+2013/2014/2015), nulle part. `pnpm check:typo` fait foi.
5. Aucune donnée inventée dans l'UI : source indisponible = affichage honnête, jamais de chiffres simulés.
6. Aucun scraping : APIs et exports officiels uniquement.
7. Conventional Commits, commits atomiques. Secrets uniquement en variables d'environnement.
8. Une décision structurante = un ADR dans docs/adr/.
9. Vert / orange / rouge réservés aux signaux Ecowatt et Tempo. Filières : conventions éCO2mix.
10. Avant d'annoncer une tâche terminée : `pnpm verify` (lint + types + typo + format + tests + build).

## Commandes

- `pnpm dev` : serveur de développement
- `pnpm verify` : toutes les vérifications locales (à lancer avant tout commit)
- `pnpm test:e2e` : Playwright (nécessite `pnpm build` au préalable)

## Structure

- `src/styles/tokens.css` : design tokens, source de vérité unique
- `public/design/maquette.html` : maquette statique validée en Phase 0 (exclue de Prettier)
- `docs/adr/` : décisions d'architecture
- `scripts/` : outillage (check typographique...)
- `e2e/` : tests Playwright
