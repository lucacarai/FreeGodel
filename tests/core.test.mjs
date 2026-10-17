import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_LIMIT, copy, closure, covers, irreducibles, coloring, withPigments, mixPigments, chainCount, rootSystem, layoutRootSystem, addRelation, removeNode, validate, arrange, constrainPosition, empty, example } from '../src/core.mjs';

test('powersets use exactly their atoms as generators; bottom is white', () => {
  for (const size of [1, 2, 3]) {
    const model = example(`boolean${size}`), c = coloring(model);
    assert.deepEqual(c.generators, Array.from({ length: size }, (_, i) => `p${2 ** i}`));
    assert.equal(c.fills.get('p0'), '#ffffff');
    for (let mask = 0; mask < 2 ** size; mask++) assert.deepEqual(c.hues.get(`p${mask}`), c.generators.filter((_, i) => mask & 2 ** i));
  }
});

test('all nonempty chains, including skipped levels, appear with the correct suffix covers', () => {
  const model = example('chain'), output = rootSystem(model);
  assert.equal(output.count, 15); assert.equal(output.nodes.length, 15); assert.equal(output.edges.length, 11);
  const skip = output.nodes.find(n => JSON.stringify(n.chain) === JSON.stringify(['p0', 'p3']));
  assert.ok(skip); assert.equal(skip.parent, JSON.stringify(['p3']));
  for (const n of output.nodes) {
    assert.equal(n.minimum, n.chain[0]);
    assert.equal(n.parent, n.chain.length > 1 ? JSON.stringify(n.chain.slice(1)) : null);
    if (n.parent) assert.ok(output.nodes.find(q => q.id === n.parent).y < n.y);
  }
});

test('larger components are placed to the left regardless of input positions', () => {
  const model = example('chain'); model.nodes.forEach((n, i) => n.x = -i * 200);
  const forest = layoutRootSystem(rootSystem(model), { width: 1600, height: 500 });
  const roots = forest.nodes.filter(n => !n.parent).sort((a, b) => a.x - b.x);
  assert.deepEqual(roots.map(n => n.minimum), ['p3', 'p2', 'p1', 'p0']);
  assert.deepEqual(roots.map(root => forest.nodes.filter(n => n.chain.at(-1) === root.minimum).length), [8, 4, 2, 1]);
  assert.equal(new Set(roots.map(n => n.y)).size, 1);
});

test('resizing favors horizontal alignment while preserving chains, edges, and upward order', () => {
  const model = empty(); model.nodes = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, label: `${i}`, x: i * 60, y: 0, pigment: null }));
  const forest = rootSystem(model), before = JSON.stringify(forest);
  const narrow = layoutRootSystem(forest, { width: 260, height: 500 });
  const wide = layoutRootSystem(narrow, { width: 1600, height: 500 });
  assert.ok(new Set(narrow.nodes.map(n => n.y)).size > 1);
  assert.equal(new Set(wide.nodes.map(n => n.y)).size, 1);
  assert.equal(JSON.stringify(forest), before);
  assert.deepEqual(wide.nodes.map(({ x, y, ...n }) => n), forest.nodes.map(({ x, y, ...n }) => n));
  assert.deepEqual(wide.edges, forest.edges);
  const branched = layoutRootSystem(rootSystem(example('boolean3')), { width: 360, height: 500 });
  const byId = new Map(branched.nodes.map(n => [n.id, n]));
  for (const [a, b] of branched.edges) assert.ok(byId.get(a).y > byId.get(b).y);
  const roots = branched.nodes.filter(n => !n.parent).sort((a, b) => a.y - b.y || a.x - b.x);
  const sizes = roots.map(root => branched.nodes.filter(n => n.chain.at(-1) === root.minimum).length);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});

test('boundary is on output, allowing 200 isolated inputs but refusing to enumerate 201 chains', () => {
  const model = empty(); model.nodes = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, label: `${i}`, x: i, y: 0, pigment: null }));
  assert.equal(chainCount(model), 200); assert.equal(rootSystem(model).nodes.length, 200);
  assert.equal(rootSystem(example('chain8')).exceeded, true);
  assert.equal(rootSystem(example('chain8')).nodes.length, 0);
  assert.equal(rootSystem(example('chain8')).count, 201);
  assert.equal(chainCount(example('chain8'), 1000), 255);
  const chain7 = removeNode(example('chain8'), 'p7'); assert.equal(rootSystem(chain7).count, 127);
  const exact = empty(); exact.nodes = Array.from({ length: 199 }, (_, i) => ({ id: `p${i}`, label: `${i}`, x: i, y: 0, pigment: null }));
  exact.edges = [['p0', 'p1']]; assert.equal(rootSystem(exact).count, 200);
  exact.edges.push(['p2', 'p3']); assert.equal(rootSystem(exact).exceeded, true);
});

test('general posets use join irreducibles even with multiple lower covers', () => {
  // Two incomparable upper points have the same predecessors. Both must add a hue.
  const model = empty(); model.nodes = ['0', 'a', 'b', 'u', 'v'].map((id, i) => ({ id, label: id, x: i * 50, y: 0, pigment: null }));
  model.edges = [['0', 'a'], ['0', 'b'], ['a', 'u'], ['b', 'u'], ['a', 'v'], ['b', 'v']];
  const next = withPigments(model), c = coloring(next);
  assert.deepEqual(c.generators, ['a', 'b', 'u', 'v']);
  assert.deepEqual(c.hues.get('u'), ['a', 'b', 'u']);
  assert.deepEqual(c.hues.get('v'), ['a', 'b', 'v']);
});

test('singleton and empty inputs produce the expected white point and empty forest', () => {
  assert.equal(rootSystem(empty()).count, 0); assert.deepEqual(irreducibles(empty()), []);
  const m = empty(); m.nodes = [{ id: 'only', label: 'x', x: 0, y: 0, pigment: null }];
  assert.deepEqual(coloring(m).hues.get('only'), []); assert.equal(coloring(m).fills.get('only'), '#ffffff');
  assert.equal(rootSystem(m).nodes.length, 1);
});

test('exhaustive five-point DAG inputs: coloring embeds the order and chains match a brute-force oracle', () => {
  const n = 5, possible = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) possible.push([`${i}`, `${j}`]);
  for (let mask = 0; mask < 2 ** possible.length; mask++) {
    const m = empty(); m.nodes = Array.from({ length: n }, (_, i) => ({ id: `${i}`, label: `${i}`, x: i * 10, y: 0, pigment: null }));
    m.edges = possible.filter((_, i) => mask & 2 ** i);
    const model = withPigments(m), order = closure(model), c = coloring(model), output = rootSystem(model);
    for (const a of order.ids) for (const b of order.ids) assert.equal(c.hues.get(a).every(j => c.hues.get(b).includes(j)), order.le(a, b), `hue inclusion: ${mask}, ${a}, ${b}`);
    const chains = [];
    for (let subset = 1; subset < 2 ** n; subset++) {
      const chain = order.ids.filter((_, i) => subset & 2 ** i);
      if (chain.every(a => chain.every(b => order.le(a, b) || order.le(b, a)))) chains.push(JSON.stringify(chain));
    }
    assert.equal(chainCount(model), chains.length);
    assert.deepEqual(output.nodes.map(q => q.id).sort(), chains.sort());
    const outOrder = closure({ nodes: output.nodes, edges: output.edges });
    for (const a of output.nodes) for (const b of output.nodes) {
      const tail = a.chain.some((_, i) => JSON.stringify(a.chain.slice(i)) === b.id);
      assert.equal(outOrder.le(a.id, b.id), tail);
    }
  }
});

test('paint mixing is independent of ordering and preserves white and pure hues', () => {
  assert.equal(mixPigments([]), '#ffffff'); assert.equal(mixPigments(['#d85555']), '#d85555');
  assert.equal(mixPigments(['#d85555', '#397bd5', '#ebc33f']), mixPigments(['#ebc33f', '#d85555', '#397bd5']));
  assert.match(mixPigments(['#000000', '#ffffff']), /^#[0-9a-f]{6}$/);
  assert.equal(mixPigments(['#ffffff', '#ffffff']), '#ffffff');
});

test('edits reject cycles, preserve induced order on deletion, and maintain vertical order', () => {
  const m = example(), original = JSON.stringify(m);
  assert.throws(() => addRelation(m, 'p3', 'p0'), /cycle/); assert.throws(() => addRelation(m, 'p0', 'p3'), /implied/);
  assert.equal(JSON.stringify(m), original);
  const added = addRelation(m, 'p1', 'p2'); assert.deepEqual(added.edges, [['p0', 'p1'], ['p1', 'p2'], ['p2', 'p3']]);
  const removed = removeNode(example('chain'), 'p1'); assert.ok(closure(removed).le('p0', 'p2')); assert.ok(removed.edges.some(([a, b]) => a === 'p0' && b === 'p2'));
  const arranged = arrange(added), byId = new Map(arranged.nodes.map(q => [q.id, q]));
  for (const [a, b] of arranged.edges) assert.ok(byId.get(a).y > byId.get(b).y);
  assert.ok(constrainPosition(m, 'p1', 900, -10000).y > m.nodes.find(q => q.id === 'p3').y);
  assert.ok(constrainPosition(m, 'p1', 900, 10000).y < m.nodes.find(q => q.id === 'p0').y);
});

test('base hue identities survive order edits, moves, relabeling, and file roundtrips', () => {
  const m = example(), pigments = m.nodes.map(n => n.pigment);
  const next = addRelation(m, 'p1', 'p2'); assert.equal(next.nodes[1].pigment, pigments[1]); assert.equal(next.nodes[2].pigment, pigments[2]);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(m))), m);
  const legacy = { ...copy(m), format: 'poset-studio', colorMode: 'nonpersistent', nodes: m.nodes.map(n => ({ ...n, hues: 7 })) };
  assert.deepEqual(validate(legacy), m);
});

test('imports reject malformed orders and repair inverted coordinates', () => {
  const m = example(); m.edges.push(['p3', 'p0']); assert.throws(() => validate(m), /cycle/);
  const duplicate = example(); duplicate.nodes[1].id = duplicate.nodes[0].id; assert.throws(() => validate(duplicate), /duplicate/);
  const missing = example(); missing.edges.push(['unknown', 'p1']); assert.throws(() => validate(missing), /invalid relation/);
  const pigment = example(); pigment.nodes[1].pigment = 'red'; assert.throws(() => validate(pigment), /invalid/);
  const large = empty(); large.nodes = Array.from({ length: OUTPUT_LIMIT + 1 }, (_, i) => ({ id: `${i}`, label: `${i}`, x: i, y: 0 })); assert.throws(() => validate(large), /200/);
  const inverted = example(); inverted.nodes.forEach(n => n.y = 0); const repaired = validate(inverted), byId = new Map(repaired.nodes.map(n => [n.id, n]));
  for (const [a, b] of repaired.edges) assert.ok(byId.get(a).y > byId.get(b).y);
  assert.equal(rootSystem(validate(example('chain8'))).exceeded, true);
});
