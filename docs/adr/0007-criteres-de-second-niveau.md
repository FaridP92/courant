# ADR-0007 : Territoire, métrique de carte et seuil CO2

Date : 2026-09-02 · Statut : Accepté

## Contexte

L'ADR-0006 a posé le socle : un modèle de critères unique, porté par l'URL, avec la
période, les filières et la maturité. Il laissait trois extensions hors périmètre,
justement parce qu'elles posaient chacune une question que le socle ne tranchait pas :
que fait-on d'un critère dont le libellé n'est pas dans l'URL, d'un critère à deux
sens qui appelle des couleurs interdites, et d'un critère qui ne restreint rien ?

## Décisions

1. **Le territoire voyage par référence, pas par libellé.** L'URL porte
   `territory=region:84` : un genre et un code, jamais un nom. Le nom vient des données
   chargées (`resolveTerritory`), pour la raison qui fonde tout le projet : un libellé
   dans un lien serait une donnée non vérifiée, réaffichée telle quelle. Tant que les
   listes n'ont pas répondu, le territoire demandé reste sélectionné et se nomme par son
   code (« Région 84 ») : on n'affiche jamais un autre territoire à la place, et on ne
   laisse jamais un blanc.

2. **Les codes passent une liste blanche** avant toute requête. Ils sont déjà échappés
   à la construction de l'URL PostgREST ; le filtre en amont garde un lien bricolé hors
   des appels réseau plutôt que de compter sur une seule ligne de défense.

3. **La métrique de la carte est un critère comme un autre**, pas un état local de la
   carte : elle vit dans l'URL, donc un lien transmet aussi la lecture choisie
   (consommation, part renouvelable, autonomie, solde d'échanges).

4. **Le solde d'échanges se lit en cyan et bleu-gris**, jamais en vert et rouge. Une
   grandeur signée appelle spontanément une échelle divergente rouge/vert, que la règle 9
   réserve aux signaux Ecowatt et Tempo : le cyan (export) et le bleu-gris (import)
   reprennent la convention déjà employée par les flux frontaliers de la même carte.

5. **Échelles de teinte ancrées honnêtement.** Les parts (0 à 1) se lisent sur 100 %,
   les puissances sur le maximum observé, avec un plancher commun à 1 qui produit les
   deux comportements sans cas particulier. Une métrique incalculable donne une surface
   neutre et un « n.d. » en infobulle, jamais un zéro.

6. **Le seuil CO2 met en évidence, il ne masque pas.** C'est la différence de nature
   avec la maturité : écarter une mesure parce qu'elle est provisoire se défend, écarter
   une mesure parce qu'elle est haute serait mentir sur la période. Les plages
   au-dessus du seuil sont ombrées d'un voile neutre, la série garde tous ses points, et
   la légende chiffre ce que les zones couvrent (ou dit que rien ne dépasse).

7. **Un trou referme la plage de dépassement.** `exceedanceBands` ne relie jamais deux
   dépassements par-dessus une donnée absente : la plage est bornée par des mesures
   réelles, comme les courbes le sont déjà par `connectNulls: false`.

8. **Paliers plutôt que curseur.** Trois paliers (30, 50, 80 g/kWh) cadrés sur
   l'intensité carbone française observée : un curseur écrirait dans l'historique de
   navigation à chaque pixel et demanderait un anti-rebond, pour une précision dont
   personne n'a besoin ici. Si un usage réel réclame la valeur continue, ce sera à
   revoir avec l'anti-rebond et une écriture en `replaceState`.

## Conséquences

- Les quatre critères de l'ADR-0006 et les trois d'ici partagent le même modèle, le
  même hook et les mêmes contrôles : ajouter le suivant reste une entrée dans `Filters`
  plus ses tests.
- La carte, l'Explorateur et la colonne du temps n'ont plus d'état d'interface propre :
  tout ce qui se choisit se partage.
- `buildMapOption` et `buildHeroChartOption` prennent leur critère en argument optionnel,
  avec la valeur par défaut d'avant : les tests existants ont continué de passer sans
  retouche.
- Restaient à faire : les seuils d'écart aux prévisions, la comparaison de plusieurs
  territoires et l'export qui ne portait le critère que dans son nom de fichier. Les
  trois ont suivi, avec les questions qu'ils posaient : voir l'addendum ci-dessous.

## Addendum : comparaison de territoires et exports (2026-09-02)

9. **Comparer, ce n'est pas changer de territoire.** L'URL porte un territoire
   principal et jusqu'à deux comparaisons (`compare=region:11,region:53`). Les jauges,
   les statistiques et le mix restent ceux du principal, et l'interface le dit sous le
   graphe : superposer des courbes sans dire à quoi se rapportent les chiffres autour
   serait la meilleure façon de faire lire une valeur pour une autre.

10. **Deux comparaisons au plus.** Au-delà, les courbes se lisent moins bien qu'elles
    n'informent, et chaque territoire ajoute trois requêtes. Le plafond tient aussi
    côté lecture d'URL : une liste plus longue est tronquée, jamais rejetée. Il permet
    surtout d'appeler `useTerritorySeries` un nombre fixe de fois, donc de garder des
    hooks stables d'un rendu à l'autre.

11. **L'aire ne se remplit qu'à une seule courbe.** Superposées, des aires translucides
    se cachent l'une l'autre et faussent la comparaison : au-delà d'une courbe, seuls
    les traits restent, chacun avec sa couleur nommée dans la légende. Les teintes de
    comparaison viennent de la palette validée et ne portent aucun sens de filière dans
    ce graphe, qui n'en trace aucune.

12. **Un export s'explique de lui-même.** Les lignes sont construites au même endroit
    (`src/lib/exports.ts`), sous tests : la maturité accompagne chaque mesure nationale,
    de sorte qu'une ligne vidée par un critère dit pourquoi elle est vide ; le nom du
    territoire accompagne chaque ligne territoriale ; l'export de la carte ajoute les
    grandeurs qu'elle sait teinter. L'export reste celui du territoire principal : mêler
    deux territoires dans un fichier à colonnes différentes produirait un CSV bancal.
