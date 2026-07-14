# weakpolviz

Interactive canvas visualization of **polarized** and **weak polarized** relations on
admissible Hodge–Deligne diamonds (the degeneration graphs `R(h)`, `R_k(h)`, `R_k^∘(h)`
from *Hodge Adjacency Conditions for Singularities*).

Self-contained, no build step — plain HTML + CSS + a few `<script>` files. Open
`index.html` over any static server (it must be served, not opened as `file://`, because
KaTeX is loaded from a CDN and the scripts are separate files).

## Run

Any static file server pointed at this folder, e.g.

```
python3 -m http.server 8100     # then open http://localhost:8100/
```

(In this repo the parent `.claude/launch.json` already serves the enclosing directory on
port 8099, so the app is also reachable at `http://localhost:8099/weakpolviz/`.)

## Layout

```
index.html        markup + <script> load order; no inline JS
css/style.css     all styles
js/model.js       pure combinatorics — a JS port of ds.sage (possibilities, degenerations,
                  basisOf, isDiagram, computeGraph). No DOM, no shared UI state.
js/render.js      canvas + camera + drawing primitives (grid, cells, piles, drawMorph).
js/weak.js        weak relations R_k / R_k^∘ : the quotient mod the black box B_k, the
                  matrix-box rendering, and its controls.
js/app.js         shared state, tree/graph layout, transport (play/step), the render loop,
                  tree/graph drawing, interaction, view buttons, hint text, and boot.
```

The four scripts are classic (non-module) and share one global scope; load order in
`index.html` is `model → render → weak → app` (app boots the animation loop last).

## Views

- **tree** — the degeneration tree; hover a node to replay its `sl₂×sl₂` pivot, or ▶ to grow.
- **graph** — the relations DAG `R(h)`; layout selectable in the ☰ menu (force / layered / radial).
- **poset** — the Hasse diagram, when the relation is a poset.
- **weak** — quotient `R_k(h)` mod the black box `B_k`; `∘` toggles the circ subgraph `R_k^∘`.
## Pol-side toggles (flush-left toolbar buttons)

These are **orthogonal**: `prim` chooses the *numbers*, `matrix` chooses the *shape*, so the
four combinations (diamond/matrix × full/primitive) all render. All three explode away in weak.

- **prim** — show each node's primitive (Lefschetz) Hodge numbers `P^{p,q} = h^{p,q} − h^{p-1,q-1}`
  (zero above the middle weight) instead of the full `h^{p,q}`. `primitivePart` in `model.js` is a
  port of `ds.sage`'s `P(M)`. Works in tree/graph/poset.
- **matrix** — draw every pol node as its upright weight matrix (the weak rendering, minus the box)
  instead of a diamond; grow/hover animate in the matrix frame. Applies in pol *and* pol+prim.
- **decomposition panel** — opens a pannable panel on the left half unpacking the KPR/Lefschetz sum
  `◇ = Σ_{w=0}^{r} Σ_{a=0}^{r−w} P_w(−a)` from [KPR, Thm. 5.18] as a grid: one **row per primitive
  weight `w`**, one **column per Tate twist `a`**. Each `P_w(−a)` is a *whole slice* on `p+q = w+2a`
  (not a single cell); the cells sum back to the diamond. Works in every pol view (with or without
  prim) and does **not** force the matrix shape. Hover any node to re-focus. The shaded **`a = 0`
  column** (the pile bottoms `P_w`) is exactly **`P(◇)`** — the same primitive numbers `prim` shows.
  `primitiveGrid` in `model.js` builds the grid; the panel + camera live in the `pp*` block of `app.js`.

## History

Refactored out of the single-file `polarized-relations.html` (which remains in the parent
directory and is now superseded by this project).
