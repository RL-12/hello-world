# London Sweep + IFVG + SMT — indicateur TradingView (Pine Script v6)

Fichier : [`london_sweep_ifvg_smt.pine`](./london_sweep_ifvg_smt.pine)

## Ce que fait l'indicateur

1. **Prise de liquidité de la session de Londres**
   Le plus haut et le plus bas de la session de Londres sont mémorisés à la fin de la session.
   Dès que le prix casse l'un de ces niveaux pendant la fenêtre de prise de liquidité
   (par défaut la session de New York), l'événement est marqué « Sweep London Low/High ».
   Si la bougie clôture de nouveau à l'intérieur de la plage, la mention « (rejet) » est ajoutée.

2. **SMT divergence sur pivots synchronisés (Nasdaq / S&P 500)**
   Modèle strict en deux étapes :
   - *Étape 1 — niveau synchronisé.* Un pivot haut (BSL, buyside liquidity) ou un pivot bas
     (SSL, sellside liquidity) n'est retenu que s'il est confirmé **sur la même barre** sur les
     deux symboles. Aucune tolérance.
   - *Étape 2 — désaccord de prise.* La SMT se déclenche quand **exactement un** des deux symboles
     prend le niveau (mèche au-delà). SMT haussière = divergence SSL, SMT baissière = divergence BSL.
   - *Temps réel (trailing).* Activé par défaut : la SMT est tracée dès la divergence, en ligne
     diagonale du niveau synchronisé à l'extrême de la bougie de prise, et suit les nouveaux
     extrêmes du graphique. Désactivé : elle n'est tracée qu'une fois confirmée.
   - *Confirmation (parquage).* Un nouveau pivot se forme sur le symbole du graphique dans le
     même sens (pivot bas pour une SMT SSL, pivot haut pour une SMT BSL). La ligne cesse de
     suivre et l'étiquette passe de « … » à « ✓ ».
   - *Invalidation.* Si les deux symboles finissent par prendre le niveau, ou si le prix dépasse
     l'extrême parqué, la SMT est supprimée.
   - *Lisibilité.* Nombre max de SMT visibles, dédoublonnage (une nouvelle SMT dans le même sens
     remplace une SMT non confirmée), sensibilité des pivots (Sensible 1 / Normal 4 / Strict 6).

3. **Inversion Fair Value Gap (IFVG), uniquement avec une SMT**
   Les FVG sont suivis en arrière-plan. Une inversion (FVG haussier clôturé en dessous → IFVG
   baissier ; FVG baissier clôturé au-dessus → IFVG haussier) n'est **tracée que si une SMT est
   active**, par défaut dans le même sens. Sans SMT, l'inversion est ignorée.
   Par défaut, les IFVG ne sont tracés que pendant la **session de New York** (09:30-16:00,
   fuseau de l'indicateur).
   Un IFVG est figé si le prix clôture de nouveau au-delà de la zone, s'il expire ou s'il
   s'éloigne du prix.
   **Retest** : une seule étiquette « 1er retest IFVG » par SMT, sur le premier IFVG autorisé par
   cette SMT que le prix vient retester, et uniquement pendant la session de New York. Les
   retests suivants ne sont pas affichés.

4. **Tableau récapitulatif** : session, London High/Low, liquidité prise, dernière SMT (sens,
   état, qui a pris et qui a tenu, niveau), nombre de niveaux synchronisés et de SMT actives,
   dernier IFVG, scores de confluence, statut.

5. **Alertes** (`alertcondition`), filtrables par session : sweep low/high, SMT détectée,
   confirmée, invalidée, IFVG formé, retest IFVG, setup complet 3/3.

## Score de confluence

| Élément | Haussier | Baissier |
|---|---|---|
| Sweep | London Low pris | London High pris |
| SMT | SMT haussière (SSL) active | SMT baissière (BSL) active |
| IFVG | IFVG haussier tracé **après** le sweep | IFVG baissier tracé **après** le sweep |

L'option « Exiger une SMT confirmée » impose une SMT parquée pour compter le point SMT et pour tracer les IFVG.

## Installation

1. TradingView → onglet **Éditeur Pine** → supprimer tout le contenu par défaut.
2. Coller le contenu de `london_sweep_ifvg_smt.pine`.
3. **Ajouter au graphique**. Timeframe intraday (1 min à 1 h).

## Paramètres principaux

| Paramètre | Défaut | Rôle |
|---|---|---|
| Session de Londres | `0200-0500` | Plage horaire de Londres (fuseau ci-dessous). |
| Fuseau horaire | `America/New_York` | Appliqué à toutes les sessions. |
| Fenêtre de prise de liquidité | `0500-1600` | Période pendant laquelle une cassure compte comme sweep. |
| Session de New York | `0930-1600` | Fenêtre des IFVG et du 1er retest IFVG. |
| Ne retenir que les SMT déclenchées pendant New York | désactivé | Activé : une SMT d'avant l'ouverture n'autorise aucun IFVG. |
| IFVG tracés uniquement pendant New York | activé | Une inversion hors session est ignorée. |
| Symbole corrélé automatique | activé | NQ/MNQ/NDX/US100 → `CME_MINI:ES1!` ; ES/MES/SPX/US500 → `CME_MINI:NQ1!`. |
| Sensibilité des pivots | Normal | Sensible = 1, Normal = 4, Strict = 6 barres de chaque côté. |
| SMT en temps réel | activé | Tracé dès la divergence avec trailing ; sinon tracé à la confirmation. |
| Nombre max de SMT visibles | `6` | Les plus anciennes sont retirées. |
| Dédoublonner | activé | Une nouvelle SMT remplace une SMT non confirmée du même sens. |
| Niveaux synchronisés suivis | `20` / `300` barres | Limite et expiration des niveaux BSL/SSL. |
| IFVG dans le sens de la SMT | activé | Sinon n'importe quelle SMT active suffit. |
| Taille mini du FVG (× ATR 14) | `0.3` | Filtre les petits gaps. |
| Expiration FVG / IFVG | `120` / `120` barres | Retire les zones anciennes. |
| Figer les zones éloignées (× ATR 14) | `8` | Évite que d'anciennes zones étirent l'échelle automatique. |
| Conserver les zones terminées | activé | Historique figé et atténué. |
| Limiter les alertes à une session | désactivé | Par défaut `0930-1600`. |

## Limites connues

- Les pivots du symbole corrélé sont calculés via `request.security` sur le même timeframe.
  Les barres des deux symboles doivent être alignées ; sur des marchés aux horaires différents,
  la condition « même barre de confirmation » peut ne jamais être satisfaite.
- Le symbole corrélé doit être accessible sur ton compte TradingView (données CME temps réel
  payantes ; sinon données différées).
- Sur la barre en cours, les états peuvent changer jusqu'à la clôture (repaint intra-barre
  normal, aucun repaint historique).
- La logique SMT est une réimplémentation d'après la description publique de l'indicateur
  « SMT Pro+ [TakingProphets] », pas une copie de son code (non accessible).
- Le script n'a pas été compilé hors de TradingView : aucun compilateur Pine n'existe hors
  de la plateforme.
- Ce n'est pas un conseil en investissement.
