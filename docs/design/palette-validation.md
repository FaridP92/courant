# Validation de la palette filières (fond sombre)

Date : 2026-08-28 · Outil : validateur du skill dataviz (6 checks, OKLab/OKLCH)

## Démarche

Les teintes de départ sont les conventions éCO2mix (repères connus du public), imposées par
le brief. Chaque teinte a été recalée en OKLCH (teinte conservée, luminosité et chroma
ajustées) pour entrer dans la bande sombre du validateur : L dans [0.48, 0.67], chroma >= 0.10,
contraste >= 3:1 sur surface sombre.

## Résultat (ordre d'empilement du mix : nucléaire, hydraulique, gaz, éolien, solaire, bioénergies, charbon, fioul)

| Filière            | éCO2mix approx. | Validée (sombre) |
| ------------------ | --------------- | ---------------- |
| Nucléaire          | #f2c249         | #b58c15          |
| Hydraulique        | #58a4e0         | #287ab5          |
| Gaz                | #e4636d         | #c65860          |
| Éolien             | #82d9c6         | #2ca893          |
| Solaire            | #ff9d45         | #c06a01          |
| Bioénergies        | #63bf8f         | #0f8354          |
| Charbon            | #a98a5b         | #9e6d04          |
| Fioul              | #b07fd6         | #986eb9          |
| Pompage            | #38648f         | #31679a          |
| Échanges (imports) | #8fa3ad         | #678c9f          |

## Verdict du validateur

- Bande de luminosité : PASS (8/8)
- Plancher de chroma : PASS (8/8)
- Séparation daltonisme (paires adjacentes) : WARN, pire paire bioénergies/solaire ΔE 6.1
  (protan), dans la bande 6-8 autorisée UNIQUEMENT avec encodage secondaire.
- Plancher vision normale : PASS (pire paire 15.9, seuil 15)
- Contraste vs surface : PASS (8/8 >= 3:1)

## Obligation d'encodage secondaire (à respecter dans toute vue empilée)

Le WARN daltonisme impose, partout où ces couleurs se touchent :

1. un écart de 2 px couleur surface entre segments empilés ;
2. une légende toujours présente et des labels directs sur les filières majeures ;
3. jamais d'information portée par la couleur seule (règle d'accessibilité du brief).

Toute évolution de palette repasse par le validateur avant merge.
