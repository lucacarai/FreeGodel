# Free Gödel algebras dually

Draw a finite poset and inspect the root system dual to the Gödel algebra free over its dual distributive lattice.

Public destination: https://lucacarai.github.io/FreeGodel/. See the [publishing instructions](docs/DEPLOYMENT.md).

Run `npm start` and open http://127.0.0.1:4174/. Alternatively, run `node scripts/build.mjs` followed by `node server.mjs`. Run `npm test` or `node --test tests/*.test.mjs` for mathematical checks. No dependencies are required. `npm run build` creates the static `dist/` directory; all asset paths are relative.

## Construction

The output points are all nonempty chains. C ≤ D iff D is an upset in C. The unique upper cover of a nonsingleton chain removes its least element. Each singleton is the maximal point of a separate tree. Components are ordered by decreasing point count, with stable input order for ties. The layout adapts to the output canvas size and prefers one horizontal row whenever points remain readable; otherwise it wraps into rows in the same order. Resizing preserves the input and pinned inspection. Chain counting uses all strict comparisons and stops at 201 before enumeration; outputs exceeding 200 points are not generated. The input remains editable. A 200-point antichain is permitted; an eight-point chain exceeds the limit. Files with more than 200 input points are rejected because their singleton chains already exceed the output limit.

The input's join-irreducibles introduce base hues: j is irreducible iff it is not the least upper bound of all its strict predecessors. Each point p has the hue set J(P) ∩ ↓p. This is an order embedding into a powerset. A least point has the empty hue set and is white. Boolean lattices use their atoms as the hue generators. Each output chain inherits the color of its minimum. Constituents mix once at equal concentrations using a simplified Kubelka–Munk reflectance model. Different mathematical hue sets can produce similar displayed colors. Base hue assignments are stored with the input points and can be edited in the legend.

## Controls

- Move (V): drag points; comparable points cannot cross vertically. Drag empty space to pan either canvas. Wheel or buttons zoom independently.
- Point (N): click empty input space to add a point.
- Order (E): click lower then upper, or drag lower to upper. Cycles and implied relations are rejected; only covers are drawn.
- Hover a chain to highlight its members and minimum in the input and its suffix path in the output. Hover an input point to highlight chains with that minimum. Click to pin; moving away restores the pinned inspection. Escape clears selection.
- Select a point or cover and press Delete. Point deletion preserves the induced order. Output points cannot be edited.
- Ctrl+Z / Ctrl+Shift+Z: undo / redo. Changes persist locally when browser storage is available.
- Open accepts Free Gödel algebras dually JSON and Poset Studio JSON (source colors are replaced by automatic coloring). Save file stores input identities, coordinates, labels, and base hues. PNG exports include the complete selected diagram without hover or selection marks.

Sources: [Carai, Free algebras and coproducts in varieties of Gödel algebras](https://arxiv.org/abs/2406.05480); [Bhatta–Ramananda, A Note on Irreducible Elements in a Finite Poset](https://www.m-hikari.com/ija/ija-2010/ija-13-16-2010/ramanandaIJA13-16-2010.pdf).
