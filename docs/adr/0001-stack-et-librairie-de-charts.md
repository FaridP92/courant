# ADR-0001 : Stack technique et librairie de charts

Date : 2026-08-28 · Statut : Accepté

## Contexte

Courant est un command center temps réel de l'électricité française : séries temporelles au
quart d'heure depuis 2012, carte régionale, temps réel rafraîchi toutes les 60 secondes,
thème sombre exigeant, double vocation grand public et portfolio. Le brief impose la stack
front et demande une recommandation charts justifiée.

## Décision

1. Front : Vite + React 19 + TypeScript strict maximal + Tailwind CSS 4 (imposé par le brief).
2. Serveur : fonctions serverless Vercel (/api) pour tout ce qui touche un secret
   (Anthropic, Supabase service role). Aucun secret côté client.
3. Base : Supabase Postgres, schémas ingest (brut) et marts (exposition). Ingestion : n8n.
4. Data fetching : TanStack Query, revalidation 60 s, badge de fraîcheur.
5. Charts : Apache ECharts.
6. Lint : ESLint + typescript-eslint en strictTypeChecked + stylisticTypeChecked + jsx-a11y
   (le template Vite 8 livre oxlint, retiré : pas de règles type-aware, donc pas le
   "niveau maximum" exigé).
7. Tests : Vitest + Testing Library (unitaire, intégration), Playwright (E2E, desktop + mobile).

## Justification du choix ECharts

- Rendu canvas performant sur séries longues (14 ans de quarts d'heure en replay,
  zone héro 24 h à 96 points par série et plusieurs séries superposées).
- Thèmes sombres aboutis et thémables par tokens (couleurs pilotées par nos variables CSS).
- Aires empilées, lignes multiples, sparklines, choroplèthes (module geo/map avec GeoJSON
  des régions) : tous les besoins du brief couverts par une seule librairie, y compris la
  carte de Phase 3 sans dépendance supplémentaire.
- Accessibilité : options aria intégrées, complétées par nos alternatives textuelles.

## Alternatives considérées

- Recharts : API React agréable mais rendu SVG, limite sur les longues séries et le replay.
- visx : très flexible, mais coût de développement élevé pour chaque type de vue (carte incluse).
- uPlot : le plus rapide, mais pas de carte, thème et interactions à construire entièrement.
- D3 pur : puissance maximale, coût maximal ; non justifié pour un projet solo phasé.

## Conséquences

- Une seule dépendance de visualisation à maîtriser, chargée en lazy (code splitting par vue)
  pour préserver le budget Lighthouse >= 90.
- Les couleurs de séries proviennent exclusivement de src/styles/tokens.css (palette validée,
  voir docs/design/palette-validation.md).
- Ce choix sera confronté à la réalité en Phase 2 (dashboard v1) ; toute remise en cause
  passera par un nouvel ADR.
