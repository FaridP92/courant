# Requêtes SQL de démonstration (Phase 1)

Exécutées le 2026-08-29 sur le projet Supabase de Courant, avec des données réelles RTE/ODRÉ
(journée du 15 janvier 2026 et les deux journées de changement d'heure 2025 chargées en
échantillon ; l'historique complet arrive avec le backfill WF6).

## 1. Le dernier point complet (ce que verra le bandeau LIVE)

```sql
select ts, consommation, nucleaire, eolien, solaire, taux_co2, ech_physiques
from public.v_national_latest;
```

Résultat : `2026-01-15 22:30 UTC · 60 873 MW · nucléaire 49 765 · éolien 16 814 · solaire 0
· 25 g/kWh · échanges -13 007 MW (la France exporte)`.

## 2. Agrégats journaliers (journée Europe/Paris, énergies en MWh)

```sql
select day_paris, avg_consommation_mw, max_consommation_mw, energy_mwh,
       nuclear_mwh, wind_mwh, solar_mwh, avg_co2_g_kwh, net_physical_exchange_mwh
from public.v_national_daily
order by day_paris desc;
```

Résultat pour le 2026-01-15 : moyenne 62 305 MW, pointe 69 324 MW, énergie 1 495 GWh,
CO2 moyen 33 g/kWh, solde exportateur.

## 3. Records historiques, calculés, jamais codés en dur

```sql
select record_key, label_fr, ts, value, unit from public.v_national_records;
```

Sur l'échantillon : pointe de consommation 69 324 MW le 15 janvier à 19:30 (heure de Paris),
record solaire 10 158 MW à 13:00. Ces records deviendront la "machine à remonter le temps"
(Phase 6) une fois l'historique 2012-2026 chargé.

## 4. Validation des jours de changement d'heure (test exigé par le brief)

```sql
select (ts at time zone 'Europe/Paris')::date as day_paris,
       count(*) as points
from ingest.eco2mix_national
where (ts at time zone 'Europe/Paris')::date in ('2025-03-30', '2025-10-26')
group by 1 order by 1;
```

| Jour                      | Points | Attendu            | Verdict                                                                         |
| ------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------- |
| 2025-03-30 (jour de 23 h) | 92     | 92                 | OK : les 4 doublons UTC publiés par la source sont dédupliqués                  |
| 2025-10-26 (jour de 25 h) | 96     | 96 publiés par RTE | OK : la source ne publie qu'une occurrence de 02:00-02:45, on stocke fidèlement |

Détail dans l'ADR-0003 : le stockage en UTC rend ces journées triviales à requêter,
toute l'ambiguïté est traitée à l'ingestion.

## 5. Un quart d'heure sous toutes ses coutures

```sql
select * from ingest.eco2mix_national where ts = '2026-01-15T11:00:00Z';
```

Midi heure de Paris, un 15 janvier : 67 534 MW consommés, 49 834 MW de nucléaire,
9 060 MW de solaire, 33 g de CO2 par kWh, et 3 225 MW qui filent vers l'Allemagne-Belgique.

## 6. Observabilité des ingestions

```sql
select workflow, started_at, finished_at, status, rows_upserted, watermark_ts
from ingest.ingestion_runs
order by id desc limit 10;
```

Alimentée par WF1 (horaire) et WF6 (backfill) via la RPC `log_ingestion_run`, qui renvoie
aussi le nombre d'échecs consécutifs pour déclencher l'alerte email.
