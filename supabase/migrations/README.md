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

Conventions : colonnes de mesures aux noms exacts des champs ODRÉ (contrat de source,
introspection du 2026-08-28, voir ADR-0003) ; identifiants structurels en anglais.
