# Explanation text (hint box)

Each file here is the hint-box blurb for one view/mode, editable as **Markdown + KaTeX**.
Changes show on the next page reload (files are fetched fresh, no cache-busting needed).

## Which file is shown

Non-weak views: `graph.md`, `poset.md`, `tree.md`.
Weak views (`weak` on): `weak-graph.md`, `weak-poset.md`, `weak-tree.md`.
Weak-circ (∘ on): `weak-circ-graph.md`, `weak-circ-poset.md`, `weak-circ-tree.md`,
and `weak-circ0.md` for the special case k = 0.

`mod-prim.md`, `mod-matrix.md`, `mod-decomp.md` are prepended when the prim / rotate /
decomposition modes are active. On the tree view, prim or rotate replaces the base tree
blurb (they own the message); the decomposition panel likewise replaces the base blurb,
since its "what it is" text lives on the panel.

### Decomposition panel

Everything written in the panel is editable here (the `-prim` variant is used in prim
mode, i.e. pol+prim; the other otherwise):

- `decomp-title.md` / `decomp-title-prim.md` — the header equation at the top of the
  panel. `[[r]]` is the weight. The focused diamond is drawn on a canvas appended right
  after, so keep these to a single line and end with `=`.
- `decomp-panel.md` / `decomp-panel-prim.md` — the explanation at the bottom.

The grid's own labels (`w = 0`, `a = 1`, `P_w(−a)`, `Σₐ`) are painted straight onto the
canvas at computed positions, so they are **not** markdown — they live in `ppLabel` /
`ppHeaderSum` in `js/app.js`.

## Formatting

- **Markdown**: `**bold**`, `*italic*`, `` `code` ``, lists, links — standard CommonMark.
- **Math**: inline `$…$` and display `$$…$$`, rendered with KaTeX. Underscores and
  asterisks inside `$…$` are safe (math is protected from Markdown).

## Template variables

Written as `[[name]]`, substituted before rendering (safe inside `$…$`):

| var         | meaning                                   |
|-------------|-------------------------------------------|
| `[[k]]`     | current black-box level k                 |
| `[[k1]]`    | k + 1                                      |
| `[[km1]]`   | k − 1                                      |
| `[[r]]`     | weight r (= length(h) − 1)                 |
| `[[boxK]]`  | black box coords, e.g. `[3,\,3]^2`         |
| `[[boxRel]]`| relative box coords, e.g. `[2,\,4]^2`      |

Example: `the black box $B_{[[k]]} = [[boxK]]$` → `the black box $B_2 = [3,\,3]^2$`.
