# ADR-0009 : « Compare ta conso », calcul local et collecte automatisée des grilles

Date : 2026-09-03 · Statut : Accepté

## Contexte

Le propriétaire du produit souhaite qu'un visiteur puisse comparer sa propre
consommation aux offres des principaux fournisseurs : « avec cette
consommation, voici ce que vous paieriez chez... », abonnement inclus. Deux
contraintes du brief se heurtent à ce besoin : la sobriété RGPD (aucune donnée
personnelle collectée) et la règle 6 (« aucun scraping »), alors qu'il n'existe
aucune API des offres de marché.

## Décisions

1. **La consommation ne quitte jamais le navigateur.** Deux entrées : la
   saisie manuelle (kWh annuels, ou HP et HC séparés, et puissance souscrite),
   qui suffit aux options Base et HP/HC ; ou le dépôt de l'export CSV de
   l'espace client Enedis, qui permet en plus le calcul Tempo exact. Parsing et
   calculs sont exécutés côté client. Aucun envoi, aucun stockage, aucun
   identifiant (le PRM présent dans le fichier n'est ni conservé ni affiché).
   Le PDL seul ne donnant accès à rien sans consentement Enedis Data Connect,
   cette voie est la seule compatible avec « pas de compte, rien de stocké ».
   Ce qui ne peut pas être calculé depuis une saisie manuelle (Tempo sans
   courbe de charge) est dit tel quel, jamais estimé sur un profil type.

2. **Les tarifs réglementés viennent de l'open data de la CRE** (fichiers
   Option_Base, Option_HPHC, Option_Tempo, historique depuis 2012) : source
   officielle, structurée, sans extraction. Le calcul Tempo s'appuie sur le
   calendrier réel des couleurs déjà en base (ADR-0005) : le coût Tempo est
   exact jour par jour sur l'année de l'utilisateur, pas une moyenne.

3. **Amendement de la règle 6.** La récupération automatisée est autorisée
   pour les seuls **documents réglementaires publics d'information
   précontractuelle** que les fournisseurs sont tenus de publier (fiches
   descriptives et grilles tarifaires au format normé par la CRE), sous
   conditions : cadence faible (hebdomadaire), cache, respect du robots.txt et
   des conditions d'utilisation vérifiés à l'ajout de chaque source, attribution
   et lien vers le document source à côté de chaque prix affiché. Les
   comparateurs tiers (dont celui du Médiateur, base protégée sans API) ne sont
   jamais des sources.

4. **Extraction par IA, validée avant publication.** Les grilles PDF sont
   lues par le modèle (Mistral, ADR-0008) vers un JSON strict ; une grille n'est
   publiée que si elle passe les bornes de plausibilité (prix du kWh dans une
   fourchette, HP supérieur à HC, écart borné avec la grille précédente). Sinon
   la dernière grille valide reste affichée avec sa date, et une alerte part.

5. **Ce qu'on refuse de calculer.** Les offres à prix indexé, dynamique ou
   révisable en cours de contrat sont signalées comme non comparables plutôt
   qu'estimées. Les remises de bienvenue et promotions ne sont pas prises en
   compte, et l'écran le dit.

6. **Périmètre initial** : tarifs réglementés Base / HP-HC / Tempo, puis neuf
   fournisseurs de marché : EDF, Engie, TotalEnergies, Vattenfall, Octopus
   Energy, Ekwateur, Alpiq, OHM Énergie, Plenitude.

## Conséquences

- L'écran affiche pour chaque offre : abonnement annuel, coût des kWh, total
  TTC, date de la grille et lien source ; mentions « estimation indicative,
  hors promotions » et renvoi vers le comparateur officiel du Médiateur pour
  la décision finale.
- Comparaison à titre d'information (aucune vente, aucune affiliation) ; les
  principes de la comparaison loyale s'appliquent : objective, vérifiable,
  sans logo ni dénigrement.
- Une nouvelle famille de workflows n8n (collecte CRE, collecte fiches) suit
  le patron journal + alerte des ingestions existantes.
