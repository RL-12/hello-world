# London Sweep + IFVG + SMT — indicateur TradingView (Pine Script v6)

Fichier : [`london_sweep_ifvg_smt.pine`](./london_sweep_ifvg_smt.pine)

## Ce que fait l'indicateur

Il combine trois concepts de la méthodologie ICT sur un graphique intraday :

1. **Prise de liquidité de la session de Londres**
   Le plus haut et le plus bas de la session de Londres sont mémorisés à la fin de la session.
   Dès que le prix casse l'un de ces niveaux pendant la fenêtre de prise de liquidité
   (par défaut la session de New York), l'événement est marqué « Sweep London Low/High ».
   Si la bougie clôture de nouveau à l'intérieur de la plage, la mention « (rejet) » est ajoutée.

2. **Inversion Fair Value Gap (IFVG)**
   Un FVG classique (gap entre la bougie 1 et la bougie 3) est suivi tant qu'il n'est pas invalidé.
   - FVG haussier clôturé **en dessous** → devient un **IFVG baissier** (résistance).
   - FVG baissier clôturé **au-dessus** → devient un **IFVG haussier** (support).
   Un IFVG est supprimé si le prix clôture de nouveau au-delà de la zone. Le premier retour du prix
   dans la zone est marqué « Retest IFVG ».

3. **SMT divergence Nasdaq / S&P 500**
   Sur la barre où l'un des deux indices prend la liquidité de Londres et l'autre ne la prend pas,
   une divergence SMT est signalée (haussière sur les lows, baissière sur les highs).
   Si le second indice prend finalement la même liquidité plus tard dans la session, la SMT
   passe en « Invalidé » dans le tableau.

4. **Tableau récapitulatif** : état de la session, London High/Low, liquidité prise, SMT,
   dernier IFVG, score de confluence haussier et baissier (0 à 3), statut.

5. **Alertes** (`alertcondition`) : sweep low/high, SMT, IFVG formé, retest IFVG, setup complet 3/3.

## Score de confluence

| Élément | Haussier | Baissier |
|---|---|---|
| Sweep | London Low pris | London High pris |
| SMT | Divergence haussière valide | Divergence baissière valide |
| IFVG | IFVG haussier formé **après** le sweep | IFVG baissier formé **après** le sweep |

Le statut passe à « SETUP HAUSSIER 3/3 » ou « SETUP BAISSIER 3/3 » quand les trois éléments sont réunis.

## Installation

1. Ouvrir TradingView → onglet **Éditeur Pine** en bas du graphique.
2. Coller le contenu de `london_sweep_ifvg_smt.pine`.
3. Cliquer sur **Ajouter au graphique**.
4. Utiliser un timeframe intraday (1 min à 1 h). En daily ou plus, le tableau affiche un avertissement.

## Paramètres principaux

| Paramètre | Défaut | Rôle |
|---|---|---|
| Session de Londres | `0200-0500` | Plage horaire de Londres (fuseau ci-dessous). 02:00-05:00 New York = London killzone. |
| Fuseau horaire | `America/New_York` | Fuseau appliqué aux deux sessions. |
| Fenêtre de prise de liquidité | `0500-1600` | Période pendant laquelle une cassure compte comme sweep. |
| Symbole corrélé automatique | activé | NQ/NDX/US100 → `CME_MINI:ES1!` ; ES/SPX/US500 → `CME_MINI:NQ1!`. |
| Symbole corrélé (manuel) | `CME_MINI:ES1!` | Utilisé si l'automatique est désactivé ou si le ticker n'est pas reconnu. |
| Taille mini du FVG (× ATR 14) | `0` | Filtre les petits gaps. |
| Nombre max de FVG suivis | `30` | Limite mémoire / lisibilité. |
| Expiration FVG non inversé | `300` barres | Supprime les FVG jamais inversés. |

## Limites connues

- La SMT est évaluée sur la barre du sweep et sur les sweeps de la même session. Elle ne détecte
  pas les divergences entre swings intermédiaires hors des niveaux de Londres.
- Les données du symbole corrélé proviennent de `request.security` sur le même timeframe.
  Le symbole corrélé doit être accessible sur ton compte TradingView (les données CME temps réel
  sont payantes ; sans abonnement, TradingView fournit des données différées).
- Le script n'a pas été compilé hors de TradingView : aucun compilateur Pine n'existe hors
  de la plateforme. Toute erreur de compilation doit être signalée avec le message exact.
- Ce n'est pas un conseil en investissement. L'indicateur ne fait que visualiser des conditions
  techniques.
