# Precomputed-graph schema (what the app reads)

The app's in-memory graph object `G` is what `computeGraph(hvec)` returns in
[`js/model.js`](../js/model.js) (a port of `ds.sage`). Shipped files carry a **lean
subset**; everything else is reconstructed on load. This doc is the contract — the
precompute runner (`scratchpad/run.js` + `gworker.js`) writes exactly this.

## On-disk format

One file per Hodge vector, named by the vector itself (no key prefix):

```
data/graphs/1,2,2,1.json   →   { r, root, vertices, edges }
```

- `r` — weight = `hvec.length - 1`.
- `root` — index of the pure-diagonal vertex; `vertices[root] = diag(hvec)`.
- `vertices` — dense `(r+1)×(r+1)` integer matrices, one Hodge diamond `h^{p,q}` per vertex.
- `edges` — `[[a, b], …]`, directed: vertex `a` degenerates to vertex `b` (the graphs are
  usually **not** posets — an edge is a single-`c` degeneration, not a cover, so out-degrees
  can be large).

Nothing else is stored. **`moves`, `primVertices`, and `basis` are all reconstructed on
load** (below), so shipped files stay small and never go stale when those derived shapes change.

### Canonical example — `h = [1,2,1]`  (`data/graphs/1,2,1.json`)

```json
{"r":2,"root":0,
 "vertices":[[[1,0,0],[0,2,0],[0,0,1]],[[0,0,1],[0,2,0],[1,0,0]],[[0,1,0],[1,0,1],[0,1,0]]],
 "edges":[[0,1],[0,2],[2,1]]}
```

## What the app reconstructs on load  (`hydrateGraph` / `moveFor` in [`js/app.js`](../js/app.js))

| field | how it's rebuilt | when |
|-------|------------------|------|
| `primVertices[i]` | `primitivePart(vertices[i])` | on load |
| `basis` (per-`r` `{S,T,A,B,U,V,conj}`) | `basisOf(r)` — depends only on the weight | on load |
| `moves` (the coin `c`-vector for an edge) | `moveFor(node)`: one `degenerations(vertices[a])` search recovers the exact `c` for edge `a→b`, sparse `[[bi, c], …]` | lazily, per edge, only for the decomposition/pile animation |

The deduced `moves`' basis indices `bi` reference `coordsList(r)` / `basisOf` order
(`for w in 0..r, for l in 0..r, for k in 0..r: if l>=1 and l+2k<=w<=r`). Because moves are
deduced inside the app from `basisOf(r)`, this ordering is internal — a generator never emits it.

## How it's loaded  (`ensureGraph` in [`js/app.js`](../js/app.js))

```
in-memory graphCache  →  IndexedDB (db "weakpolviz", store "graphs")  →  fetch('data/graphs/<h>.json')  →  on-device worker compute
```

- Cache key: `gKey(hvec) = MODEL_V + '|' + hvec.join(',')` (currently `MODEL_V = 1`), e.g. `1|1,2,2,1`.
  The **on-disk filename has no `MODEL_V|` prefix** — it's just `hvec.join(',') + '.json'`.
- On a fetch hit the app hydrates (table above), then populates `graphCache` + IndexedDB.
- A miss (a weight we didn't ship) falls through to a worker compute, which the app then caches.

Bump `MODEL_V` only if `computeGraph`'s output changes; it invalidates every cached file.

## Invariants a generator MUST honor

1. **`root` is the pure diagonal** — `vertices[root] = diag(hvec)`.
2. **Consistent vertex indexing** — `edges` index the `vertices` list; vertex order is
   otherwise free. The `[1,2,1]` example above is a good unit test.

## What's shipped

Weights **≤ 6** (710 files, ~24 MB) ship in `data/graphs/`. Heavier graphs compute
on-device (and the graph view draws only a hovered/selected diamond's incident edges past
111 edges, to stay responsive). Files ship uncompressed; GitHub Pages gzips JSON on the
wire, so on-disk size only affects the repo, not transfer.
