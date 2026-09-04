# ADR-0010 : thème jour par défaut, salle de contrôle en option

Date : 2026-09-04. Statut : accepté.

## Contexte

La première version de Courant reprenait la maquette de Phase 0 : une « salle de
contrôle » sombre, dense, aux libellés en petites capitales monospace. Le retour du
commanditaire, après plusieurs semaines d'usage, est sans appel : austère, basique,
pas accueillante, à l'opposé des sites grand public qu'il cite en référence (fond
clair, grands titres en casse normale, cartes blanches à ombre douce, navigation par
rubriques, accent coloré franc).

Le public visé est le grand public curieux et les ménages qui comparent leur facture,
pas des opérateurs de réseau.

## Décision

1. **Le thème jour devient le défaut** : fond clair, cartes blanches, encre marine,
   accent bleu électrique (`#1f5af5`), titres Archivo en casse normale, corps IBM Plex
   Sans 15 px. La monospace est réservée aux chiffres.
2. **Le thème nuit reste disponible** (bascule dans l'en-tête, choix mémorisé en
   localStorage, préférence système respectée sans choix explicite). Il conserve les
   tokens d'origine.
3. **Un seul jeu de tokens, deux valeurs** : `src/styles/tokens.css` définit le jour
   dans `@theme` et surcharge le nuit sous `[data-theme='dark']`. Les noms de tokens
   sont conservés (`abyss` = fond de page, `panel` = carte) pour ne pas réécrire tous
   les composants. Le thème est posé avant le premier rendu par un script inline pour
   éviter tout flash.
4. **Les graphes suivent le thème** : `src/lib/palette.ts` expose `paletteFor(theme)`
   et les constructeurs d'options ECharts reçoivent le thème en paramètre.
5. **Un vocabulaire de composants partagé** (`.panel`, `.section-title`, `.eyebrow`,
   `.chip`, `.btn-primary`, `.btn-secondary`, `SectionHeader`) remplace les classes
   répétées dans chaque rubrique.
6. **La page s'ouvre sur une accroche** (titre, une phrase, deux actions) et une
   navigation par rubriques collée en haut : le lecteur sait où il est et où aller.

## Palette filières en thème jour

Les teintes éCO2mix ont été recalées pour le fond clair et vérifiées par un script
maison (contraste WCAG contre la carte et le fond, lightness OKLab, distance OKLab
entre filières adjacentes dans l'ordre d'empilement, avec simulation deutéranopie et
protanopie) : toutes les paires adjacentes dépassent 8 en simulation daltonienne et
15 en vision normale (bioénergies / charbon : 15,8). Détail dans
`docs/design/palette-validation.md`. Vert, orange et rouge restent réservés aux signaux
Ecowatt et Tempo.

## Conséquences

- La maquette statique de Phase 0 (`public/design/maquette.html`) documente le thème
  nuit, plus le défaut. Elle n'est pas réécrite.
- Les tests unitaires et E2E ne dépendent d'aucune couleur codée en dur : les
  assertions passent par `paletteFor('light')`.
- Le contraste du texte est vérifié sur les trois surfaces du thème jour (`ink-40`
  atteint 5,1:1 sur blanc, 4,75:1 sur le fond de page).
