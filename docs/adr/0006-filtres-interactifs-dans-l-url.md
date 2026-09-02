# ADR-0006 : Filtres interactifs, état porté par l'URL

Date : 2026-09-02 · Statut : Accepté

## Contexte

Le tableau de bord portait déjà quatre interactions (période de la colonne du temps,
filières masquables, période de l'Explorateur, sélection de territoire), chacune dans
un `useState` local. Trois limites en découlaient : un lien partagé ne transmettait
jamais la vue regardée, le retour arrière du navigateur quittait la page au lieu de
défaire un critère, et chaque nouveau critère aurait dupliqué sa plomberie dans le
composant qui le porte.

Le besoin : rendre l'application réellement interactive, c'est-à-dire ajouter des
critères sélectionnables sans multiplier les états dispersés.

## Décisions

1. **Un modèle de filtres unique, pur et sérialisable** (`src/lib/filters.ts`) :
   période, filières affichées, maturité des mesures. Aucune dépendance à React, donc
   testable directement (`parseFilters`, `serializeFilters`, `applyFilters`,
   `toggleWithFloor`). Les composants ne font plus que du rendu.

2. **L'URL est la source de vérité**, pas un état React synchronisé après coup. Le
   hook `useFilters` lit `window.location.search` via `useSyncExternalStore` et écrit
   par `history.pushState`. On gagne le lien partageable, le retour arrière qui défait
   un critère, et un rechargement qui rouvre la même vue. Un critère à sa valeur par
   défaut n'est pas écrit : l'URL nue reste nue.

3. **Pas de routeur.** L'application est une page unique ; react-router coûterait une
   dépendance et un découpage de routes pour un seul écran. L'API History suffit, avec
   un événement interne (`courant:filters`) puisque `pushState` ne notifie personne.
   Si une seconde page apparaît, cette décision sera à revoir.

4. **Lecture tolérante, écriture stricte.** Une URL bricolée à la main (valeur
   inconnue, ensemble vide) retombe sur le défaut sans jamais lever ni vider l'écran.
   L'écriture, elle, est canonique : ordre d'empilement des filières, paramètres
   omis quand ils valent le défaut.

5. **Un point écarté est masqué, jamais supprimé** (règle 5 du projet). `applyFilters`
   met les mesures à null en gardant l'horodatage : l'axe du temps conserve ses trous
   et aucune continuité n'est inventée entre deux instants éloignés. Le filtre annonce
   toujours combien de points il écarte, et un filtre qui ne laisse rien affiche un
   message explicite au lieu d'un graphe vide qui passerait pour une panne.

6. **Le critère va au bon étage.** La période change le jeu de données récupéré : elle
   entre dans la `queryKey` TanStack. Les filières et la maturité restreignent des
   données déjà chargées : elles sont appliquées côté client, sans requête. Un critère
   mal placé coûterait un aller-retour réseau à chaque clic.

7. **Portée assumée des critères.** Ils portent sur les séries temporelles affichées
   (courbe, mix, sparklines). Les KPI et le gros chiffre viennent du dernier point
   publié (`v_national_latest`) et restent la mesure la plus fraîche disponible. La
   maturité ne s'applique qu'aux séries nationales : les vues régionales et métropoles
   ne publient pas ce champ.

8. **La période est partagée par toute la page.** La colonne du temps et l'Explorateur
   portent chacun leur sélecteur, mais pilotent le même critère : deux contrôles, un
   seul état. L'Explorateur garde son repli local (30 j retombe sur 7 j pour une
   métropole, dont l'historique s'arrête là).

## Conséquences

- Ajouter un critère revient à étendre `Filters` plus ses tests, et à poser un
  `ToggleChip` ou un `SegmentedControl` : la plomberie n'est plus à réécrire.
- `RangeSelector` devient un habillage de `SegmentedControl` ; sa signature publique
  ne change pas.
- Les tests de composants doivent remettre l'URL à zéro entre deux cas, l'état ne
  vivant plus dans React.
- Reste à faire, hors périmètre de cette décision : le territoire dans l'URL (il
  demande de résoudre le nom du territoire à partir des données chargées), la métrique
  de la carte, et les seuils (CO2, écart aux prévisions), qui mettront en évidence
  plutôt qu'ils ne masqueront.
