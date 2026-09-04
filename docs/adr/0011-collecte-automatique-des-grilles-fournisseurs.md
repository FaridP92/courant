# ADR-0011 : collecte automatique des grilles tarifaires des fournisseurs

Date : 2026-09-04. Statut : accepté. Complète l'ADR-0009.

## Contexte

Le comparateur doit afficher, à côté du tarif réglementé, ce que paierait un particulier
chez les principaux fournisseurs de marché. Le commanditaire a exclu toute saisie
manuelle des grilles (« c'est mort, il faut automatiser la récupération des tarifs »),
et le projet interdit tout chiffre inventé : chaque prix affiché doit venir d'un document
public du fournisseur, daté et cité.

Une recherche contradictoire (un agent par fournisseur, un vérificateur par fournisseur,
lecture des PDF officiels) a établi le 4 septembre 2026 les documents en vigueur : EDF
(Zen Fixe, Vert Électrique, Vert Électrique Régional, Zen Online), Plenitude (Plenifix
1 an), Ekwateur (prix fixe, variantes européenne et française), Octopus Energy (OctoEco
Fixe Base et HP/HC, OctoTempo), Alpiq (Stable, Référence, Sérénité), OHM Énergie
(Classique, Fixe 2 ans, Premi'Ohm, Week-End), Engie et TotalEnergies (voir le journal
de recherche). Vattenfall ne vend plus d'électricité aux particuliers en France.

Ces grilles sont des PDF (parfois plusieurs offres par document, cellules fusionnées
quand un prix vaut pour plusieurs puissances) ou une page HTML (Ekwateur). Une
extraction en texte brut perd la structure des tableaux ; les URL de certains PDF
changent à chaque révision (Octopus sur un CDN à empreinte, OHM avec le mois dans le
chemin).

## Décision

1. **Un workflow n8n hebdomadaire (WF10)** lit chaque source publique et remplace la
   grille de chaque fournisseur en base via la RPC `ingest_supplier_offers_raw`
   (migration 0023, complétée par 0024).
2. **Les PDF passent par l'OCR documentaire de Mistral avec annotation structurée** :
   l'appel `/v1/ocr` reçoit un schéma JSON strict (offres, type de prix, date de
   grille, blocage, une ligne par puissance et par option) et rend le document déjà
   structuré, cellules fusionnées comprises. Testé sur la grille EDF Zen Fixe : 17 lignes
   exactes en 17 secondes, identiques à la lecture humaine.
3. **Les pages HTML passent par le chat Mistral en sortie JSON stricte** sur le texte
   nettoyé de la page, avec le même schéma.
4. **Découverte des URL instables** : le workflow lit la page légale d'Octopus et y
   trouve les PDF de grille courants ; les autres URL sont stables ou datées dans le
   chemin et surveillées par l'alerte.
5. **Trois garde-fous côté base** : contrôles de plausibilité (abonnement 30 à 3 000 €
   par an, kWh 0,05 à 1,50 €, puissance 3 à 36 kVA, options cohérentes), remplacement
   complet par fournisseur seulement quand tous ses documents ont été lus (un document
   en échec conserve la grille précédente), texte source de chaque valeur conservé.
6. **Périmètre** : offres à prix fixe, offres définies comme une remise sur le tarif
   réglementé, offres à prix révisable non indexé. Les offres indexées sur un indice de
   marché sont exclues (leur coût n'est pas calculable sans hypothèse).
7. **Journal et alerte** comme WF1 à WF9 : `log_ingestion_run`, courriel après trois
   échecs consécutifs (une URL changée est la cause la plus probable).

## Ce que la mise en service a appris (4 septembre 2026)

- L'annotation OCR est exacte sur les grilles simples (EDF, Plenitude, TotalEnergies,
  Engie Adapt) mais invente des puissances sur les grilles qui listent chaque kVA de 3 à
  36 avec des prix en cellules fusionnées (Alpiq, OHM), confond les colonnes HT et TTC
  (Octopus) et n'est pas déterministe d'un passage à l'autre. L'OCR a aussi altéré un
  chiffre (0,196798 lu 0,198798).
- Le PDF est donc envoyé en base64 (Mistral ne le télécharge plus lui-même), lu **deux
  fois** ; les passages sont fusionnés et toute discordance rejette le document. Chaque
  chiffre annoté doit figurer tel quel dans la couche texte du PDF, qui porte les chiffres
  exacts.
- Une fiche qui ne publie que la part fourniture (Engie « Elec Référence 3 ans ») passait
  les contrôles de forme : d'où une **plausibilité relative au tarif réglementé** lu dans
  `v_trv_current` (abonnement à ±40 %, kWh entre 0,6 et 1,6 fois le TRV), et une offre
  annoncée « remise sur le TRV » ne peut pas coter le TRV lui-même.
- Une grille à deux colonnes pour une même offre (TotalEnergies Access : « identiques au
  tarif réglementé » et « remisés pendant trois ans ») est ambiguë : elle est rejetée tant
  que l'annotation ne distingue pas les deux variantes.
- Les offres Tempo (six prix) ne sont pas représentables dans une grille Base / HP-HC et
  sont exclues.
- L'annotation confond parfois la date de la grille et la fin du blocage de prix
  (TotalEnergies : « jusqu'au 2 septembre 2026 » pour une grille datée du 2 septembre).
  Une fin de blocage n'est donc retenue que pour une offre à prix fixe, à au moins 60
  jours et au plus quatre ans devant la date du run ; sinon la ligne est publiée sans
  échéance.
- Le remplacement se fait **par document** (migration 0025) : une fiche lue remplace ses
  offres, une fiche en échec conserve les précédentes, une fiche retirée des sources est
  purgée. Le run est un succès dès qu'un document est publié ; les documents en échec sont
  listés dans le journal sans déclencher l'alerte.
- Premier passage complet : 152 lignes publiées (EDF Zen Fixe, Vert Électrique, Vert
  Électrique Régional ; Engie Elec Adapt 1 an ; Plenitude Plenifix 1 an ; TotalEnergies
  Verte Fixe, Standard Fixe, Classique, Online), toutes identiques à la vérité terrain
  établie par la recherche contradictoire. Alpiq, OHM Énergie et Octopus Energy restent
  non publiés tant que leurs grilles ne passent pas les contrôles ; Ekwateur (page HTML)
  attend une lecture dédiée.

## Conséquences

- Le comparateur affiche, pour chaque offre, la date de la grille et le lien vers le
  document ; l'état « offres indisponibles » reste possible et honnête.
- Le coût de collecte est marginal (une vingtaine de pages OCR par semaine).
- Une nouvelle offre ou un nouveau fournisseur se déclare dans la liste des sources du
  WF10 ; une offre retirée du document disparaît de la base au run suivant.
- La règle 6 du projet (pas de scraping) reste amendée par l'ADR-0009 pour ces documents
  publics à vocation d'information tarifaire.
