# Explanation text (hint box)

Each file here is the hint-box blurb for one view/mode, editable as **Markdown + KaTeX**.
Changes show on the next page reload (files are fetched fresh, no cache-busting needed).

## Which file is shown

Non-weak views: `graph.md`, `poset.md`, `tree.md`.
Weak views (`weak` on): `weak-graph.md`, `weak-poset.md`, `weak-tree.md`.
Weak-circ (∘ on): `weak-circ-graph.md`, `weak-circ-poset.md`, `weak-circ-tree.md`,
and `weak-circ0.md` for the special case k = 0.

`mod-prim.md`, `mod-matrix.md`, `mod-decomp.md` are prepended when the prim / rotate /
decomposition modes are active.

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
