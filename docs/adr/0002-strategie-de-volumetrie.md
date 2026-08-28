# ADR-0002 : Stratégie de volumétrie Supabase

Date : 2026-08-28 · Statut : Accepté (validé par Farid au kickoff)

## Contexte

Le free tier Supabase est limité (500 Mo de base). Volumétrie réelle mesurée sur l'API ODRÉ
le 2026-08-28 :

| Dataset                   | Lignes    | Période                                      |
| ------------------------- | --------- | -------------------------------------------- |
| eco2mix-national-cons-def | 508 320   | 2012-01-01 à 2026-06-30                      |
| eco2mix-regional-cons-def | 2 839 104 | 2013-01-01 à 2026-06-30                      |
| eco2mix-national-tr       | 5 760     | 2026-07-01 à aujourd'hui (fenêtre glissante) |
| eco2mix-regional-tr       | 67 968    | idem, 12 régions                             |
| eco2mix-metropoles-tr     | 4 902 828 | historique long, métropoles                  |

Les datasets temps réel prennent le relais exactement là où les consolidés s'arrêtent :
la jonction est propre. Le régional complet (2,84 M de lignes larges) dépasserait
vraisemblablement le free tier une fois indexé.

## Décision

Hébergement : projet Supabase existant "Perso" (cwdickfefpobnsceubew), vidé et réaffecté à
Courant avec l'accord explicite de Farid (dump de sauvegarde des tables cs_* avant purge).
Le free tier n'autorise que 2 projets actifs et les deux slots sont occupés.

Rétention :

1. National : historique complet au quart d'heure depuis 2012 (environ 0,5 M de lignes).
2. Régional : quart d'heure sur 24 mois glissants (environ 0,84 M de lignes) ;
   au-delà, agrégats horaires et journaliers (vues matérialisées ou tables d'agrégats).
3. Métropoles : fenêtre glissante courte uniquement (sparklines temps réel) ; pas de backfill
   historique du dataset métropoles (4,9 M de lignes pour un usage purement décoratif).
4. Types compacts (smallint / integer / real quand la précision source le permet),
   index BRIN sur les colonnes temporelles des grosses tables.

## Garde-fous

- AVANT tout backfill : chiffrage précis (octets par ligne réels mesurés sur un échantillon
  chargé, marge index comprise) documenté en annexe de cet ADR.
- Aucune ressource payante sans accord explicite de Farid via l'outil de confirmation de
  coût du MCP Supabase.
- Si le chiffrage dépasse 80 % du free tier, réduction de la fenêtre régionale (12 mois)
  avant toute discussion de plan payant.

## Alternatives considérées

- Régional complet depuis 2013 au quart d'heure : rejeté (plan payant requis d'emblée).
- Fenêtre régionale 12 mois : gardé en solution de repli, perd la comparaison saisonnière N-1.
- Nouveau projet Supabase dédié : impossible en free tier (2 projets actifs déjà occupés).

## Annexe : chiffrage mesuré avant backfill (2026-08-29)

Mesure sur échantillon réel chargé (96 lignes du 2026-01-15, colonnes à largeur fixe) :

- Taille moyenne d'une ligne (pg_column_size) : 132 octets.
- Projection national complet 2012-2026 (~508 000 lignes) : environ 95 à 110 Mo,
  PK btree et marge de 15 % comprises (la formule "taille totale / 96 lignes" surestime
  car les minima de pages dominent sur un si petit échantillon).
- Free tier : 500 Mo. Le national complet en consomme environ 20 %, laissant une marge
  confortable pour le régional 24 mois (~110 Mo estimés, à mesurer en Phase 3),
  les agrégats et les vues matérialisées.

Verdict : GO pour le backfill national complet, sans plan payant.
