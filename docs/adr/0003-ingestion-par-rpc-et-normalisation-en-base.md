# ADR-0003 : Ingestion par RPC PostgREST et normalisation en base

Date : 2026-08-29 · Statut : Accepté

## Contexte

n8n doit écrire dans Supabase sans exposer les schémas internes ni gérer de mapping fragile.
PostgREST (l'API REST de Supabase) n'expose que le schéma `public` par défaut, et le free
tier ne justifie pas d'edge function dédiée pour un simple upsert.

## Décision

1. **Écritures tunnelisées par RPC** : n8n appelle des fonctions SQL `security definer`
   du schéma public (`ingest_eco2mix_national_raw`, `get_eco2mix_national_watermark`,
   `log_ingestion_run`, `refresh_national_marts`), dont l'exécution est révoquée pour
   `anon` et `authenticated` et accordée au seul `service_role`. Les schémas `ingest`
   et `marts` ne sont pas exposés à l'API.
2. **Normalisation côté base** : n8n transmet les enregistrements ODRÉ tels quels ;
   la RPC mappe les champs, blinde les casts (`ingest.safe_int` : nombres, chaînes
   numériques, sinon NULL pour "ND", "-", vide) et déduplique par `ts`. La logique de
   mapping est ainsi versionnée dans les migrations, testable en SQL, et unique.
3. **Garde de maturité** : un point `R` (temps réel) ne peut jamais écraser un point
   `C` (consolidé) ni `D` (définitif) ; l'inverse est toujours permis.
4. **Lectures du front** : vues minces `public.v_*` en lecture seule pour `anon`,
   par besoin d'écran, au-dessus de `marts`.
5. **Backfill par exports mensuels JSON** : le brief prescrit les exports CSV complets ;
   nous utilisons le même endpoint `/exports` en JSON, découpé par mois (environ 176
   appels one-shot). Même esprit (zéro pagination de l'API records, quota intact),
   parsing sans étape CSV, mémoire bornée côté n8n, et reprise sur erreur au mois près.

## Faits mesurés ayant motivé la décision (introspection et tests réels)

- Le dataset consolidé type `ech_comm_allemagne_belgique` et `gaz_cogen` en **texte**
  (valeurs non numériques possibles) : d'où les casts blindés.
- La consommation du consolidé est au pas 30 min (48 points/jour), la production au pas
  15 min : d'où les agrégats en moyenne x durée plutôt qu'en somme/4.
- Passage à l'heure d'été (30 mars 2025) : la source publie l'heure locale inexistante
  02:00-02:45 avec le même UTC que 03:00-03:45 (valeurs identiques) ; sans déduplication,
  l'upsert échoue ("cannot affect row a second time"). Attrapé par le test DST avant backfill.
- Passage à l'heure d'hiver (26 octobre 2025) : la source ne publie que 96 lignes pour un
  jour de 25 h (la première occurrence de 02:00-02:45 n'existe pas chez RTE). On stocke
  fidèlement ce qui est publié, on n'invente rien.

## Exception d'identifiants (documentée)

Les colonnes de mesures reprennent les noms exacts des champs ODRÉ (`consommation`,
`eolien`, `taux_co2`...), en dérogation à la règle "identifiants en anglais" : c'est un
contrat de source généré par introspection, et le futur chat SQL (Phase 5) traduira des
questions en français vers ces mêmes noms. Les identifiants structurels (ts, maturity,
schémas, vues, fonctions) restent en anglais.

## Conséquences

- n8n ne contient aucune logique de mapping : transport, orchestration, journal, alerte.
- Tout changement de schéma ODRÉ se traite dans une migration unique.
- L'extension `http` (installée pour l'échantillonnage serveur) reste disponible pour
  les contrôles ponctuels ; elle n'est pas utilisée par les flux de production.
