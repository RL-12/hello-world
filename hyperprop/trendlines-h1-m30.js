// Trendlines H1 + 30m (multi-timeframe) — Hyperprop Script
// Pane: Overlay
//
// Hyperprop ne fournit que les bougies du graphique (pas de request.security).
// Le script reconstruit donc lui-même les bougies H1 et 30m à partir des
// bougies affichées (5m, 1m, 15m...), détecte les pivots sur ces bougies
// reconstruites, puis trace les trendlines sur le graphique courant.
// Résultat : les trendlines H1/30m restent visibles quand on descend en 5m.

const showH1 = input.bool('Afficher trendlines H1', true);
const showM30 = input.bool('Afficher trendlines 30m', true);
const pivotLen = input.int('Pivot (bougies HTF de chaque côté)', 5, { key: 'pivotLen', min: 2, max: 30 });
const maxLines = input.int('Trendlines max par côté et par UT', 3, { key: 'maxLines', min: 1, max: 10 });
const extendBars = input.int('Prolongement à droite (bougies)', 50, { key: 'extendBars', min: 0, max: 500 });
const showBroken = input.bool('Afficher les trendlines cassées', false);
const showTags = input.bool('Afficher les étiquettes H1 / 30m', true);
const colH1Res = input.color('H1 résistance', '#ef5350');
const colH1Sup = input.color('H1 support', '#26a69a');
const colM30Res = input.color('30m résistance', '#ff9800');
const colM30Sup = input.color('30m support', '#42a5f5');

const H1_MS = 60 * 60 * 1000;
const M30_MS = 30 * 60 * 1000;

// Plus petit écart entre deux bougies consécutives = unité de temps du graphique.
function chartStepMs(bars) {
  let step = Infinity;
  for (let i = Math.max(1, bars.length - 300); i < bars.length; i += 1) {
    const d = +bars[i].time - +bars[i - 1].time;
    if (d > 0 && d < step) step = d;
  }
  return step;
}

// Regroupe les bougies du graphique en bougies de tfMs (alignées sur l'UTC).
// hIdx / lIdx = index de la bougie du graphique qui a fait le plus haut / bas,
// pour ancrer la trendline exactement sur la mèche en 5m.
function resample(bars, tfMs) {
  const agg = [];
  let cur = null;
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const key = Math.floor(+b.time / tfMs);
    if (!cur || cur.key !== key) {
      cur = { key, h: b.h, l: b.l, c: b.c, last: i, hIdx: i, lIdx: i };
      agg.push(cur);
    } else {
      if (b.h > cur.h) { cur.h = b.h; cur.hIdx = i; }
      if (b.l < cur.l) { cur.l = b.l; cur.lIdx = i; }
      cur.c = b.c;
      cur.last = i;
    }
  }
  return agg;
}

// Trendlines d'un côté (résistance = pivots hauts descendants,
// support = pivots bas montants), calculées sur les bougies HTF clôturées.
function buildLines(agg, closedN, isRes, hp) {
  const vals = [];
  for (let i = 0; i < closedN; i += 1) vals.push(isRes ? agg[i].h : agg[i].l);
  const piv = isRes ? hp.pivothigh(vals, pivotLen, pivotLen) : hp.pivotlow(vals, pivotLen, pivotLen);
  const pivots = [];
  for (let p = 0; p < closedN; p += 1) if (piv[p] != null) pivots.push(p);

  const out = [];
  for (let j = 1; j < pivots.length; j += 1) {
    const b = pivots[j];
    // Relie le nouveau pivot au pivot précédent valide le plus proche (4 max).
    for (let k = j - 1; k >= Math.max(0, j - 4); k -= 1) {
      const a = pivots[k];
      const ya = vals[a], yb = vals[b];
      if (isRes ? !(yb < ya) : !(yb > ya)) continue;
      const xa = isRes ? agg[a].hIdx : agg[a].lIdx;
      const xb = isRes ? agg[b].hIdx : agg[b].lIdx;
      if (xb <= xa) continue;
      const slope = (yb - ya) / (xb - xa);
      const at = (x) => ya + slope * (x - xa);
      const beyond = (m) => (isRes ? agg[m].c > at(agg[m].last) : agg[m].c < at(agg[m].last));

      // Aucune clôture HTF ne doit traverser la ligne entre les deux pivots.
      let valid = true;
      for (let m = a + 1; m < b; m += 1) if (beyond(m)) { valid = false; break; }
      if (!valid) continue;

      // Cassure = première clôture HTF au-delà de la ligne après le 2e pivot.
      let brokeAt = null;
      for (let m = b + 1; m < closedN; m += 1) if (beyond(m)) { brokeAt = m; break; }

      out.push({ xa, ya, at, broken: brokeAt != null, xEnd: brokeAt != null ? agg[brokeAt].last : null });
      break;
    }
  }
  return out;
}

function drawTf(bars, hp, tfMs, tag, colRes, colSup, width, lines, labels) {
  const last = bars.length - 1;
  const step = chartStepMs(bars);
  if (step > tfMs) {
    labels.push({
      x: last, y: bars[last].h, anchor: 'up', size: 'small',
      text: `${tag} indisponible : UT du graphique supérieure à ${tag}`,
      color: 'rgba(120,120,120,0.85)', textColor: '#ffffff',
    });
    return;
  }
  const agg = resample(bars, tfMs);
  // La dernière bougie HTF est encore en formation, sauf si la bougie
  // courante du graphique la termine.
  const lastAgg = agg[agg.length - 1];
  const closedLast = +bars[last].time + step >= (lastAgg.key + 1) * tfMs;
  const closedN = closedLast ? agg.length : agg.length - 1;

  for (const isRes of [true, false]) {
    const all = buildLines(agg, closedN, isRes, hp);
    const color = isRes ? colRes : colSup;
    const active = all.filter((l) => !l.broken).slice(-maxLines);
    for (const l of active) {
      const x2 = last + extendBars;
      lines.push({ x1: l.xa, y1: l.ya, x2, y2: l.at(x2), color, width, style: 'solid' });
      if (showTags) {
        labels.push({
          x: last + 1, y: l.at(last + 1), anchor: 'right', size: 'small',
          text: `${tag} ${isRes ? 'R' : 'S'}`, color, textColor: '#ffffff',
        });
      }
    }
    if (showBroken) {
      for (const l of all.filter((x) => x.broken).slice(-maxLines)) {
        lines.push({ x1: l.xa, y1: l.ya, x2: l.xEnd, y2: l.at(l.xEnd), color, width: 1, style: 'dotted' });
      }
    }
  }
}

function compute(bars, inputs, hp) {
  const lines = [], labels = [];
  if (bars.length < 2) return { plots: [], lines, labels };
  if (showH1) drawTf(bars, hp, H1_MS, 'H1', colH1Res, colH1Sup, 2, lines, labels);
  if (showM30) drawTf(bars, hp, M30_MS, '30m', colM30Res, colM30Sup, 1, lines, labels);
  return { plots: [], lines, labels };
}
