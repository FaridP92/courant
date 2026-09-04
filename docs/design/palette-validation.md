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

## Thème jour (ADR-0010, 2026-09-04)

Le validateur du skill dataviz n'étant pas disponible dans la session, la palette jour a
été vérifiée par un script équivalent (contraste WCAG, lightness OKLab, distance OKLab
entre paires adjacentes, simulation deutéranopie et protanopie, Machado 2009).

Ordre d'empilement : nucléaire `#c8930c`, hydraulique `#2e7bc9`, gaz `#c7477a`,
éolien `#1b9aae`, solaire `#d4791a`, bioénergies `#0f7a48`, charbon `#3f4e5e`,
fioul `#8e63b5`.

| Paire adjacente         | Normal | Deutéranopie | Protanopie |
| ----------------------- | ------ | ------------ | ---------- |
| nucléaire / hydraulique | 30,6   | 31,6         | 26,7       |
| hydraulique / gaz       | 25,1   | 16,0         | 12,9       |
| gaz / éolien            | 26,7   | 8,0          | 15,4       |
| éolien / solaire        | 24,8   | 20,1         | 17,8       |
| solaire / bioénergies   | 25,2   | 18,7         | 9,4        |
| bioénergies / charbon   | 15,8   | 12,4         | 14,6       |
| charbon / fioul         | 19,8   | 17,1         | 16,2       |

Cibles : 8 minimum en simulation daltonienne, 15 minimum en vision normale (distance
OKLab multipliée par 100). Encres : `ink-40` (`#5f6f82`) donne 5,1:1 sur blanc et
4,75:1 sur le fond de page ; l'accent `#1f5af5` donne 5,5:1 sur blanc.
