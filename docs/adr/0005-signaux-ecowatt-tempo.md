# ADR-0005 : Signaux Ecowatt et Tempo, archive au fil de l'eau

Date : 2026-08-29 · Statut : Accepté

## Contexte

La Phase 4 branche les deux API authentifiées de RTE (portail data.rte-france.com,
OAuth2 client credentials, secrets uniquement dans n8n) : Ecowatt v5 (signal de
sobriété J..J+3) et Tempo Like Supply Contract v1.1 (calendrier tarifaire). Le
contrat a été vérifié par introspection réelle et par le guide utilisateur officiel
v5.0.0 avant toute ligne de schéma.

## Décisions

1. **Sémantique hvalue v5 respectée à la lettre.** Depuis la v5, le pas horaire
   Ecowatt vaut 0 à 3, où **0 signifie « vert + production décarbonée »** (et non
   une absence de donnée). Le stockage garde la valeur brute ; l'UI n'utilise le
   vert/orange/rouge que pour 1/2/3 et convertit les fenêtres à 0 en message
   positif (« électricité particulièrement bas carbone... »), dérivé des données.

2. **Archive au fil de l'eau, jamais de purge.** Chaque snapshot J..J+3 est
   upserté ; les jours passés restent en base (~9k lignes/an). Un pas horaire
   absent d'un snapshot n'efface jamais un pas déjà stocké : le jour courant est
   publié partiellement par RTE (l'exemple officiel commence au pas 7), l'effacer
   perdrait le début de journée.

3. **Tempo backfillé depuis septembre 2014** (12 saisons, une requête par fenêtre
   de 360 jours). L'historique alimente les compteurs de saison et les futures
   statistiques. Fait notable stocké tel quel : **le 17 août 2025 est absent du
   calendrier officiel RTE** (vérifié par appel ciblé), on ne comble pas.

4. **Compteurs sans quota affiché.** L'UI montre les jours tirés depuis le
   1er septembre (comptés dans nos données) mais n'affirme aucun total « sur 22 »
   ou « sur 43 » : la fiche RTE dit 20 rouges / 40 blancs, l'historique réel des
   12 saisons donne 22 / 43 partout sauf 2019-2020 (18 / 47), et rien ne garantit
   la constance. On n'affiche que ce que la donnée prouve.

5. **Fenêtre servie au front minimale.** v_ecowatt expose J..J+3 (heures en
   jsonb trié), v_tempo une ligne : aujourd'hui, demain (null tant que non
   publié, l'UI dit « À venir »), compteurs de saison. La saison bascule
   côté SQL (1er septembre), pas côté client.

## Conséquences

- Le vert/orange/rouge entre enfin dans l'UI, strictement cantonné à ces signaux.
- WF4 (min 32) et WF5 (min 37) suivent le patron WF1-WF3 (upsert via RPC
  service_role, journal, alerte après 3 échecs) ; le quota Ecowatt (1 appel/15 min)
  laisse une marge x4 au cron horaire.
- Les phrases de synthèse sont entièrement dérivées des données stockées ; si un
  signal manque, la rubrique le dit au lieu d'afficher un vert par défaut.
