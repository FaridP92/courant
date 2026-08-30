# Migrations Supabase (miroir)

Les migrations sont appliquées sur le projet Supabase de Courant via le MCP Supabase
(`apply_migration`) et recopiées ici à l'identique pour la traçabilité du portfolio et la
reproductibilité. L'ordre des fichiers est l'ordre d'application.

| Fichier                             | Objet                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| 0001_ingest_marts_foundation.sql    | Schémas ingest et marts, table nationale, journal, RPC d'écriture verrouillées service_role  |
| 0002_raw_ingest_rpc.sql             | Normalisation des enregistrements ODRÉ bruts côté base (casts blindés ND)                    |
| 0003_marts_national_v1.sql          | Vues marts (dernier point complet, journalier, records) et surface API publique v_*          |
| 0004_fix_daily_energy_formula.sql   | Énergie journalière en moyenne x 24 h (consommation au pas 30 min dans le consolidé)         |
| 0005_log_run_consecutive_errors.sql | log_ingestion_run v2 : compte les échecs consécutifs (alerte email n8n)                      |
| 0006_dedupe_dst_duplicates.sql      | Déduplication des doublons UTC du passage à l'heure d'été (bug réel attrapé par le test DST) |

| 0007_anchor_24h_window.sql | Fenêtre 24 h ancrée sur le dernier point complet (20 h + 4 h de prévisions) |
| 0008_unify_complete_predicate.sql | Prédicat de complétude unifié (conso + nucléaire + CO2) |
| 0009_regional_metropoles_foundation.sql | Tables régionales et métropoles, RPC d'ingestion, référentiel régions |
| 0010_regional_marts_v1.sql | Marts régionaux, v_regional_latest, v_metropoles_6h, refresh_marts |
| 0011_national_range_views.sql | Vues de période 7 j / 30 j (moyenne horaire) pour le sélecteur |
| 0012_latest_border_exchanges.sql | Échanges commerciaux par frontière exposés dans v_national_latest |
| 0013_pg_cron_refresh_marts.sql | Rafraîchissement horaire des marts via pg_cron (minute 25) |
| 0014_watermark_realised_only.sql | Watermarks limités au réalisé : les prévisions J+1 ne gèlent plus le delta |
| 0015_ecowatt_tempo_foundation.sql | Signaux Ecowatt (jours + heures) et calendrier Tempo, RPC et vues v_ecowatt / v_tempo |
| 0016_explorer_territory_series.sql | Séries par territoire pour l'Explorateur : v_regional_24h/7d/30d, v_metropoles_7d |
| 0017_anchor_territory_windows.sql | Fenêtres régionales ancrées sur le dernier point publié, grants alignés |
| 0018_daily_brief_foundation.sql | Brief du matin : faits SQL de la veille, table des briefs, RPC et v_brief |

Conventions : colonnes de mesures aux noms exacts des champs ODRÉ (contrat de source,
introspection du 2026-08-28, voir ADR-0003) ; identifiants structurels en anglais.
