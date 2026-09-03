# ADR-0008 : Mistral plutôt qu'Anthropic pour les fonctions IA

Date : 2026-08-30 (rédigé le 2026-09-03) · Statut : Accepté

## Contexte

Le brief du projet prévoyait Anthropic (ANTHROPIC_API_KEY) pour les deux
fonctions IA de la Phase 5 : le brief du matin et le chat « Pose ta question ».
Au moment de démarrer la phase, un credential Mistral Cloud actif existait déjà
dans n8n, alors qu'aucun compte API Anthropic n'était provisionné.

## Décision

Utiliser **Mistral** comme fournisseur IA du projet, en remplacement
d'Anthropic prévu au brief.

- Modèle : **mistral-small-latest**. Le tier du compte n'ouvre pas l'accès à
  mistral-large (erreur 403 `tier_not_allowed`, constatée le 2026-08-30) et
  quatre phrases de prose française n'exigent pas davantage.
- Brief du matin (WF8 n8n) : nœud Mistral Cloud Chat Model avec le credential
  existant.
- Chat à venir : fonction Vercel appelant l'API Mistral, clé `MISTRAL_API_KEY`
  en variable d'environnement serveur, jamais côté navigateur.

## Justification

1. **Un secret de moins à gérer** : la clé existe, elle est déjà dans n8n, et
   aucun nouveau compte facturé n'est à ouvrir.
2. **Qualité en français** : les modèles Mistral sont excellents sur de la
   prose française courte, le seul usage du projet.
3. **Coût négligeable** : un appel par jour pour le brief, quelques-uns par
   visiteur pour le futur chat, sur un modèle « small ».
4. Le brief prévoyait explicitement le modèle « paramétrable par variable
   d'environnement » : le principe est conservé, seul le fournisseur change.

## Garde-fous inchangés

Le choix du fournisseur ne modifie aucun garde-fou : les chiffres du brief
sont calculés en SQL (get_brief_facts) et le modèle n'écrit que la prose ;
le futur chat gardera la validation structurelle du SQL généré et le rôle
Postgres en lecture seule, quel que soit le modèle derrière.

## Conséquences

- ANTHROPIC_API_KEY disparaît du périmètre ; `MISTRAL_API_KEY` la remplace
  côté Vercel pour le chat.
- Si un usage futur exige un modèle plus capable, monter le tier du compte
  Mistral ou rebasculer de fournisseur reste une affaire de variable
  d'environnement et d'un nœud n8n.
