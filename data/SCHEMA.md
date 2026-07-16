# Precomputed-graph schema (what the app reads)

The app's graph object `G` is exactly what `computeGraph(hvec)` returns in
[`js/model.js`](../js/model.js) (itself a port of `ds.sage`). A precompute
generator (Python/Rust) must emit the same shape. This doc is the contract.

## Where it's loaded

- In-memory cache `graphCache`, keyed by `gKey(hvec) = MODEL_V + '|' + hvec.join(',')`
  (currently `MODEL_V = 1`, e.g. `1|1,2,2,1`).
- Persisted per user in IndexedDB: db `weakpolviz`, store `graphs`, same key → the `G` object (structured-clone).
- **No server-fetch path exists yet.** To consume shipped files we add one step to
  `ensureGraph`: memory → IndexedDB → **`fetch('data/graphs/<key>.json')`** → worker-compute.
  On a hit we hydrate (below) and populate `graphCache` + IndexedDB.

Bump `MODEL_V` only if this schema changes; it invalidates every cached/shipped file.

## The object

`vertices` are dense `(r+1)×(r+1)` integer matrices (the Hodge diamond `h^{p,q}`).
Sparse matrices are `[[i, j, value], …]` (row, col, value; zeros omitted).

```
G = {
  r:            int,                 // weight = hvec.length - 1
  root:         int,                 // vertex index of the pure diagonal; MUST be the diag(hvec) vertex
  vertices:     [ dense(r+1,r+1) ],  // one Hodge diamond per vertex
  primVertices: [ dense(r+1,r+1) ],  // primitivePart(vertices[i]); DERIVABLE (see below)
  edges:        [ [a, b] ],          // directed: vertex a degenerates to vertex b
  moves:        [ [[bi, c], …] ],    // parallel to edges: the coin move, sparse (basis index bi, count c>0)
  basis:        [ { S,T,A,B,U,V: sparse, conj: bool } ]   // depends ONLY on r; DERIVABLE (see below)
}
```

### Canonical example — `h = [1,2,1]` (`gKey = "1|1,2,1"`)

```json
{"r":2,"root":0,
 "vertices":[[[1,0,0],[0,2,0],[0,0,1]],[[0,0,1],[0,2,0],[1,0,0]],[[0,1,0],[1,0,1],[0,1,0]]],
 "primVertices":[[[1,0,0],[0,2,0],[0,0,1]],[[0,0,0],[0,1,0],[1,0,0]],[[0,0,0],[1,0,0],[0,1,0]]],
 "edges":[[0,1],[0,2],[2,1]],
 "moves":[[[2,1]],[[1,1]],[[0,1]]],
 "basis":[{"S":[[0,1,1],[1,0,1],[1,2,1],[2,1,1]],"T":[[0,2,1],[1,1,2],[2,0,1]],"conj":false,
           "A":[[0,1,1],[1,0,1],[1,2,1],[2,1,1]],"B":[[0,1,1],[1,0,1],[1,2,1],[2,1,1]],
           "U":[[0,2,1],[1,1,2],[2,0,1]],"V":[[0,2,1],[1,1,2],[2,0,1]]}, … ]}
```

## Invariants the generator MUST honor

1. **`root` is the pure diagonal.** `vertices[root] = diag(hvec)`. Vertex order is
   otherwise free, as long as `edges`, `moves`, `vertices`, `primVertices` all index the
   same vertex list consistently (`moves[e]` ↔ `edges[e]`, `primVertices[i]` ↔ `vertices[i]`).

2. **`moves` basis indices `bi` reference `coordsList(r)` order** — the enumeration in
   `basisOf` / `coordsList`: `for w in 0..r, for l in 0..r, for k in 0..r: if l>=1 and l+2k<=w<=r`,
   pushing `(l,k,w)`. `basis` must be that same list in that order, and `moves`' `bi`
   indexes into it. **This is the one easy thing to get wrong in a port — verify the
   basis enumeration order matches exactly** (the `[1,2,1]` example above is a good unit test:
   its 3 basis entries and its 3 moves `[[2,1]] [[1,1]] [[0,1]]` must line up).

## Ship lean, hydrate on load (recommended)

Two fields are pure functions and need not be shipped:

- **`primVertices[i] = primitivePart(vertices[i])`** — drop it; recompute on load.
- **`basis` depends only on `r`**, not on `h` — identical across every `h` of a weight.
  Ship it **once per weight** as `data/basis/<r>.json`, not inside each graph.

So the on-disk layout is:

```
data/graphs/1|1,2,2,1.json   →  { r, root, vertices, edges, moves }   // lean, per h
data/basis/6.json            →  [ {S,T,A,B,U,V,conj}, … ]             // once per weight
```

On a fetch hit the app hydrates: `G.primVertices = vertices.map(primitivePart)` and
`G.basis = <basis/r.json>` (both already exist in `model.js`). Measured effect (browser):

| h              | V   | E   | full JSON | lean JSON |
|----------------|-----|-----|-----------|-----------|
| `1,2,2,1`      | 8   | 14  | 2.5 KB    | 0.6 KB    |
| `1,1,1,1,1,1`  | 8   | 8   | 8.5 KB    | 0.8 KB    |
| `1,2,3,3,2,1`  | 54  | 253 | 20.9 KB   | 9.4 KB    |

The basis dominates small graphs, so per-weight sharing + dropping `primVertices` is a big
win (≈4–10× on small graphs; the ratio shrinks as the vertex/edge count grows).

Files ship uncompressed; GitHub Pages (Fastly) gzips JSON on the wire, so on-disk size only
affects the repo, not transfer.
