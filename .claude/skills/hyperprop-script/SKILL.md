---
name: hyperprop-script
description: >-
  Write custom chart indicators for the Hyperprop trading terminal using
  Hyperprop Script (JavaScript). Use when building, porting, or debugging a
  Hyperprop indicator or script, when converting a TradingView Pine Script to
  Hyperprop, or when the user mentions Hyperprop Script, the Hyperprop script
  editor, or custom indicators on Hyperprop charts.
---

# Writing Hyperprop Script indicators

Hyperprop Script is **plain JavaScript**, not Pine. A script declares its
settings at the top level and defines one function, `compute`, that receives
the full bar series and returns everything to draw. There is no per-bar
execution model and no persistent state between runs — `compute` is a pure
function of `(bars, inputs)`.

Scripts are created in the web terminal: **Indicators → My scripts → Create
script**. Errors never break the chart; they render as a red inline message in
the pane. Scripts sync to the user's other devices (including mobile)
automatically.

## The contract

```js
// Top level: declare settings. The settings dialog is generated from these.
const length = input.int('Length', 14, { min: 1, max: 500 });
const color  = input.color('Line color', '#f59e0b');

// Called on every data change with the FULL series.
function compute(bars, inputs, hp) {
  // bars: Array<{ time: Date, o, h, l, c, v? }>
  // inputs: resolved settings values (rarely needed — the declared consts
  //         above already hold live values)
  // hp: TA helper bundle (see below)
  return {
    plots: [ /* required key, may be [] */ ],
    boxes: [], labels: [], lines: [], markers: [], bg: [],   // all optional
    range: { min: 0, max: 100 },   // optional: fix a separate pane's scale
    guides: [30, 70],              // optional: dashed horizontal levels
    decimals: 2,                   // optional: axis/legend precision
  };
}
```

Pane type is chosen at save time: **overlay** (drawn over price, y = price)
or **separate** (own pane below price, y = the script's own value scale).

## Input declarations

All return the resolved live value. `opts` = `{ key?, min?, max?, step? }`.
Keys default to a slug of the label; pass `key` to keep saved settings stable
across label renames.

| Declaration | Returns |
|---|---|
| `input.int(label, default, opts?)` | integer |
| `input.float(label, default, opts?)` | number |
| `input.bool(label, default?)` | boolean |
| `input.color(label, default)` | color string (hex or `rgba()`) |
| `input.string(label, default?)` | string |
| `input.select(label, default, choices)` | string (`choices`: `string[]` or `{value,label}[]`) |
| `input.source(label?, default?)` | one of `open/high/low/close/hl2/hlc3/ohlc4` |

## TA helpers (`hp`)

All series helpers take and return `Array<number | null>` aligned to `bars`.
Nulls mark "no value yet" — always null-check before arithmetic.

| Helper | Notes |
|---|---|
| `hp.sma / ema / rma / stdev (values, length)` | moving averages / deviation |
| `hp.highest / lowest (values, length)` | rolling extremes |
| `hp.change(values, length = 1)` | difference vs N bars back |
| `hp.atr(bars, length)` | takes **bars**, not values |
| `hp.rsi(values, length)` | 0–100 |
| `hp.linreg(values, length)` | least-squares regression value (Pine `ta.linreg` offset 0) |
| `hp.cum(values)` | running sum |
| `hp.vwap(bars)` | day-anchored VWAP (resets on UTC date change) |
| `hp.pivothigh / pivotlow (values, left, right = left)` | pivot VALUE emitted **at the pivot bar itself** (`null` elsewhere). Unlike Pine, which reports it `right` bars later — a pivot at index `p` is only knowable from bar `p + right` onward; account for that in signal logic. |
| `hp.crossover / crossunder (a, b)` | returns `boolean[]`; `b` may be a series or a constant |

Anything else is ordinary JavaScript — write your own loops and math freely.

## Drawing primitives

X coordinates are **bar indices** into `bars`. Fractional values and indices
past the last bar are fine (the axis extrapolates), so zones and rays can
extend into the future. Y is a price (overlay) or the script's own value
(separate pane). Boxes and `bg` bands render **under** the series; lines,
markers, and labels render **on top**. Everything clips to the pane. Hard cap:
**2000 items per type** — return only what is currently visible/alive, never
the full history.

```js
boxes:   [{ x1, y1, x2, y2, bg?, border?, borderWidth?, text?, textColor? }]
labels:  [{ x, y, text, color?, textColor?, anchor?, size? }]
         // anchor: 'up' (bubble above point) | 'down' | 'left' | 'right' | 'center'
lines:   [{ x1, y1, x2, y2, color?, width?, style? }]   // style: solid|dashed|dotted
markers: [{ x, y, shape?, color?, text?, textColor? }]
         // y: number, or 'above'/'below' → anchors to the bar's high/low
         // shape: triangle-up|triangle-down|circle|square|arrow-up|arrow-down
bg:      [{ x1, x2, color }]   // vertical band, full pane height
```

Use `rgba()` colors for translucent zone fills. Plots:

```js
plots: [{ title?, values, color?, width?, style?: 'line' | 'histogram', negativeColor? }]
```

## Hard limits — design around these

- **1000 ms execution budget** per `compute`, enforced with loop guards. A
  script that exceeds it is circuit-broken until edited. Keep hot loops
  O(bars); avoid O(bars²) rescans.
- **Synchronous only.** No `async`, no `fetch`, no timers — `compute` must
  return its result directly.
- **Single symbol.** Scripts only receive the chart's own bars. No
  cross-symbol or cross-timeframe data (Pine `request.security` cannot be
  ported).
- **No main-series restyling.** Pine `plotcandle` / `barcolor` have no
  equivalent.
- **No persistence.** Model "current state" by replaying the rules over the
  series inside `compute` (see the signal recipe).

## Recipes

### Oscillator (separate pane)

```js
const length = input.int('Length', 14, { min: 2, max: 100 });
function compute(bars, inputs, hp) {
  const rsi = hp.rsi(bars.map(b => b.c), length);
  return {
    plots: [{ title: 'RSI', values: rsi, color: '#ab47bc' }],
    range: { min: 0, max: 100 },
    guides: [30, 70],
  };
}
```

### Zones / order blocks (overlay, boxes + markers)

The core pattern for supply/demand, FVG, and session-level indicators: build
each zone's lifecycle (created / mitigated), then emit boxes only for zones
still alive at the last bar.

```js
const lookback = input.int('Lookback (bars)', 10, { min: 3, max: 50 });
function compute(bars, inputs, hp) {
  const highs = bars.map(b => b.h), lows = bars.map(b => b.l);
  const ph = hp.pivothigh(highs, lookback), pl = hp.pivotlow(lows, lookback);
  const boxes = [], last = bars.length - 1;
  for (let p = 0; p < bars.length; p += 1) {
    if (pl[p] == null && ph[p] == null) continue;
    const bull = pl[p] != null;
    const top = highs[p], bottom = lows[p];
    let mitigated = null;
    for (let j = p + lookback; j <= last; j += 1) {
      if (bull ? lows[j] < bottom : highs[j] > top) { mitigated = j; break; }
    }
    if (mitigated != null) continue; // only zones still alive
    boxes.push({
      x1: p, y1: top, x2: last + 20, y2: bottom, // extends into the future
      bg: bull ? 'rgba(0,200,83,0.18)' : 'rgba(211,47,47,0.18)',
      border: bull ? '#00c853' : '#d32f2f',
      text: bull ? 'demand' : 'supply',
    });
  }
  return { plots: [], boxes };
}
```

### Signal engine (entry/SL/TP with history)

Pine keeps `var` state across bars; here, replay the state machine in one
sequential loop. One active signal at a time; finished signals become faded
markers.

```js
let active = null; const history = [];
for (let i = 1; i < bars.length; i += 1) {
  if (active) {
    const slHit = active.bull ? lows[i] <= active.sl : highs[i] >= active.sl;
    const tpHit = active.bull ? highs[i] >= active.tp : lows[i] <= active.tp;
    if (slHit || tpHit) { history.push(active); active = null; }
  }
  if (!active && /* entry condition at bar i */ false) {
    const entry = closes[i], sl = lows[i] - 3, tp = entry + (entry - sl) * 2;
    active = { bull: true, entry, sl, tp, bar: i };
  }
}
// history → translucent markers; active → dashed entry line + SL/TP lines
// + labels anchored at active.bar and active.bar + 55.
```

### Session shading (bg bands)

`Intl.DateTimeFormat` is available for timezone math:

```js
const fmt = new Intl.DateTimeFormat('en-US',
  { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
const minutesNY = t => {
  const p = fmt.formatToParts(t);
  return (Number(p.find(x => x.type === 'hour').value) % 24) * 60
       + Number(p.find(x => x.type === 'minute').value);
};
// Walk bars, open a band when entering the window, close it when leaving:
// bg.push({ x1: openBar, x2: closeBar, color: 'rgba(230,81,0,0.09)' })
// Limit to recent history (e.g. last ~900 bars) to stay under the 2000 cap.
```

## Porting from Pine Script

| Pine | Hyperprop Script |
|---|---|
| `input.int(14, "Length")` | `input.int('Length', 14, { min, max })` |
| `ta.sma/ema/rma/stdev/atr/rsi/linreg` | `hp.` equivalents (note `hp.atr(bars, len)`) |
| `ta.pivothigh(high, l, r)` | `hp.pivothigh(highs, l, r)` — value at the **pivot bar**, not confirmation bar |
| `ta.crossover / crossunder` | `hp.crossover / crossunder` → `boolean[]` |
| `close[3]` (history operator) | `closes[i - 3]` inside your own loop |
| `var x = …` + per-bar mutation | sequential `for` loop over bars inside `compute` |
| `box.new / label.new / line.new` | push to `boxes` / `labels` / `lines` arrays |
| `plotshape` | push to `markers` |
| `bgcolor` / session boxes | push to `bg` |
| `fill(p1, p2)` | no fill — plot the two boundary lines, or per-segment boxes |
| `plotcandle` / `barcolor` | not supported |
| `request.security` | not supported (single symbol only) |
| `alertcondition` | not supported (price alerts are a separate terminal feature) |
| `xloc.bar_time` timestamps | bar indices (extrapolate past the last bar for "future" x) |

Pine's per-bar drawing mutation (create → move → delete) collapses into one
question: **what should be visible right now?** Compute final state once.

## Workflow

1. Write the script (top-level `input.*` declarations + `compute`).
2. In the terminal: **Indicators → My scripts → Create script**, paste, choose
   **Overlay** or **Separate pane**, then **Save & add to chart**.
3. Compile or runtime errors appear inline in the pane in red — fix and
   resave. A budget-exceeded script stays disabled until edited.
4. Settings changes in the UI re-run `compute` live; verify inputs by watching
   the legend values update.
