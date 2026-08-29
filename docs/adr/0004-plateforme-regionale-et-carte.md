# ADR-0004 : Plateforme régionale, carte par code INSEE, crons serveur

Date : 2026-08-29 · Statut : Accepté

## Contexte

La Phase 3 ajoute la dimension régionale (carte choroplèthe, panneau de détail, flux
frontaliers), les métropoles et l'interactivité du dashboard. Plusieurs choix structurants
ont été faits en chemin, dont deux déviations par rapport au pattern posé en ADR-0003.

## Décisions

1. **Thermique régional agrégé, tco/tch non stockés.** Le dataset régional détaille
   thermique par combustible et fournit des taux de couverture/charge (`tco_*`, `tch_*`).
   Nous stockons un champ `thermique` agrégé et ignorons les taux : aucun écran n'en a
   besoin, et le free tier Supabase impose de la sobriété (24 mois régionaux = 453 696
   lignes). Si un écran futur les réclame, ils se recalculent depuis la source par
   backfill ciblé.

2. **Backfill régional exécuté côté serveur** (SQL `DO` + `extensions.http_get` +
   `urlencode`), pas par n8n. Les exécutions manuelles n8n se coincent sur les gros
   payloads (moteur d'exécution manuelle, constaté à répétition : timeouts et exécutions
   zombies), alors que le chemin cron/production est fiable. Le backfill one-shot vit
   donc dans la base, journalisé dans `ingestion_runs` comme le reste. Les deltas
   horaires restent dans n8n (WF2 min 17, WF3 min 22), fidèles à l'ADR-0003.

3. **Rafraîchissement des marts dans pg_cron** (minute 25, migration 0013), retiré des
   workflows n8n. Le refresh dépassait le timeout HTTP de PostgREST dans le nœud n8n ;
   pg_cron l'exécute dans la base sans HTTP, et un seul refresh sert les trois flux
   d'ingestion au lieu de trois appels concurrents.

4. **La carte joint données et fond par code INSEE, jamais par libellé.**
   `geo.nameProperty = 'code'` côté ECharts, `region_code` comme clé des données, et un
   référentiel `REGION_NAMES` (13 régions) pour l'affichage, dont la synchronisation
   avec le GeoJSON embarqué est verrouillée par un test. Un accent ou une apostrophe
   qui diverge entre ODRÉ et le GeoJSON ne peut donc plus casser la teinte en silence.
   La teinte passe par `geo.regions` (itemStyle par région) car l'itemStyle par datum
   d'une série `map` avec `geoIndex` n'est pas fiable.

5. **`setOption` en fusion, jamais en remplacement.** `notMerge: true` remettait le
   dataZoom à zéro à chaque refetch de 60 s : le zoom de l'utilisateur ne survivait
   jamais une minute. Le composant EChart applique `{ replaceMerge: ['series'] }`
   (l'état interne survit, une filière masquée disparaît vraiment) et les options sont
   mémoïsées côté appelants.

## Conséquences

- Le contrat régional est volontairement plus étroit que la source ; les champs écartés
  restent récupérables par backfill.
- Deux chemins d'exécution coexistent (n8n pour les deltas, base pour les one-shots
  lourds et le refresh) ; `ingestion_runs` reste le journal unique.
- Le GeoJSON embarqué et `REGION_NAMES` évoluent ensemble, sous test.
