export const OUTPUT_LIMIT = 200;
export const GAP = 44;
export const copy = value => JSON.parse(JSON.stringify(value));
export const PALETTE = ['#d85555', '#397bd5', '#ebc33f', '#37a58c', '#ac68c6', '#e58b40', '#6670bc', '#a17c58'];
export const CHAIN_HUE_DECAY = .15;

export function closure(model) {
  const ids = model.nodes.map(n => n.id), index = new Map(ids.map((id, i) => [id, i]));
  const r = ids.map((_, i) => ids.map((__, j) => i === j));
  for (const [a, b] of model.edges) r[index.get(a)][index.get(b)] = true;
  for (let k = 0; k < ids.length; k++) for (let i = 0; i < ids.length; i++) if (r[i][k]) {
    for (let j = 0; j < ids.length; j++) r[i][j] ||= r[k][j];
  }
  return { ids, r, index, le: (a, b) => r[index.get(a)]?.[index.get(b)] ?? false };
}

export function covers(model, order = closure(model)) {
  const { ids, r } = order;
  return ids.flatMap((a, i) => ids.flatMap((b, j) => i !== j && r[i][j] && !ids.some((_, k) => k !== i && k !== j && r[i][k] && r[k][j]) ? [[a, b]] : []));
}

// j is irreducible iff some q is above all strict predecessors of j, but not j.
// This includes every minimal point unless the poset has a least element.
export function irreducibles(model, order = closure(model)) {
  return order.ids.filter(j => {
    const below = order.ids.filter(x => x !== j && order.le(x, j));
    return order.ids.some(q => !order.le(j, q) && below.every(x => order.le(x, q)));
  });
}

function freshPigment(index) {
  if (index < PALETTE.length) return PALETTE[index];
  const h = ((index - PALETTE.length) * 137.508 + 18) % 360, s = .56, l = .51;
  const a = s * Math.min(l, 1 - l);
  return '#' + [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  }).join('');
}

export function withPigments(model) {
  const next = copy(model), generators = new Set(irreducibles(next));
  const used = new Set(next.nodes.map(n => n.pigment).filter(Boolean));
  let index = 0;
  for (const n of next.nodes) if (generators.has(n.id) && !n.pigment) {
    let pigment;
    do { pigment = freshPigment(index++); } while (used.has(pigment));
    n.pigment = pigment; used.add(pigment);
  }
  return next;
}

// Weighted pigment concentrations in a simplified Kubelka–Munk reflectance model.
// Mix the complete set once, rather than recursively mixing pairwise results.
export function mixPigments(hexes, weights = hexes.map(() => 1)) {
  if (!hexes.length) return '#ffffff';
  if (weights.length !== hexes.length || weights.some(w => !Number.isFinite(w) || w < 0) || !weights.some(w => w > 0)) throw Error('Pigment weights must be nonnegative, with a positive total.');
  if (hexes.length === 1) return hexes[0];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return '#' + [1, 3, 5].map(offset => {
    const ks = hexes.reduce((sum, hex, i) => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      const r = Math.max(.0001, v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return sum + weights[i] * (1 - r) ** 2 / (2 * r);
    }, 0) / totalWeight;
    const r = 1 / (1 + ks + Math.sqrt(ks * ks + 2 * ks));
    const v = r <= .0031308 ? 12.92 * r : 1.055 * r ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

export function coloring(model, order = closure(model)) {
  const generators = irreducibles(model, order), byId = new Map(model.nodes.map(n => [n.id, n]));
  const hues = new Map(order.ids.map(id => [id, generators.filter(j => order.le(j, id))]));
  const weights = new Map(order.ids.map(id => {
    const members = hues.get(id), depths = new Map();
    function depth(j) {
      if (!depths.has(j)) depths.set(j, Math.max(0, ...members.filter(k => k !== j && order.le(j, k)).map(k => 1 + depth(k))));
      return depths.get(j);
    }
    // Only comparable generators suppress each other. In a powerset all
    // generators are atoms, so every weight remains 1, preserving its colors.
    return [id, members.map(j => CHAIN_HUE_DECAY ** depth(j))];
  }));
  const fills = new Map(order.ids.map(id => [id, mixPigments(hues.get(id).map(j => byId.get(j).pigment), weights.get(id))]));
  return { generators, hues, weights, fills };
}

// Every chain has a unique minimum. Count by that minimum using ALL strict
// comparisons, not only covers; this includes chains that skip levels.
export function chainCount(model, limit = OUTPUT_LIMIT, order = closure(model)) {
  if (model.nodes.length > limit) return limit + 1;
  const memo = new Map();
  function count(id) {
    if (!memo.has(id)) {
      let total = 1;
      for (const q of order.ids) if (q !== id && order.le(id, q)) {
        total = Math.min(limit + 1, total + count(q));
        if (total > limit) break;
      }
      memo.set(id, total);
    }
    return memo.get(id);
  }
  let total = 0;
  for (const id of order.ids) { total += count(id); if (total > limit) return limit + 1; }
  return total;
}

export function rootSystem(model, limit = OUTPUT_LIMIT, order = closure(model)) {
  const count = chainCount(model, limit, order);
  if (count > limit) return { count, exceeded: true, nodes: [], edges: [] };
  const nodes = [], edges = [], sorted = [...model.nodes].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  function extend(chain, parent = null) {
    const id = JSON.stringify(chain), node = { id, chain, minimum: chain[0], parent, x: 0, y: 0 };
    nodes.push(node);
    if (parent) edges.push([id, parent]);
    for (const n of sorted) if (n.id !== chain[0] && order.le(n.id, chain[0])) extend([n.id, ...chain], id);
  }
  for (const n of sorted) extend([n.id]);
  return layoutRootSystem({ count, exceeded: false, nodes, edges });
}

export function layoutRootSystem(forest, { width = 700, height = 500, spacing = 56 } = {}) {
  if (!forest.nodes.length) return forest;
  const nodes = forest.nodes.map(n => ({ ...n, x: 0, y: (n.chain.length - 1) * 86 }));
  const children = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) if (n.parent) children.get(n.parent).push(n);
  const components = nodes.filter(n => !n.parent).map(root => {
    let cursor = 0; const members = [];
    function place(n) {
      members.push(n); const below = children.get(n.id);
      if (!below.length) { n.x = cursor; cursor += spacing; }
      else { below.forEach(place); n.x = (below[0].x + below.at(-1).x) / 2; }
    }
    place(root);
    return { members, width: cursor, height: Math.max(...members.map(n => n.y)) + 44 };
  });
  // Stable ties retain the input's horizontal order. Size means node count.
  components.sort((a, b) => b.members.length - a.members.length);
  function pack(budget) {
    const rows = []; let row = { items: [], width: 0, height: 0 };
    for (const component of components) {
      const gap = row.items.length ? 35 : 0;
      if (row.items.length && row.width + gap + component.width > budget) {
        rows.push(row); row = { items: [], width: 0, height: 0 };
      }
      const x = row.width + (row.items.length ? 35 : 0);
      row.items.push({ component, x }); row.width = x + component.width; row.height = Math.max(row.height, component.height);
    }
    rows.push(row);
    const w = Math.max(...rows.map(r => r.width)), h = rows.reduce((sum, r) => sum + r.height, 0) + (rows.length - 1) * 65;
    return { rows, scale: Math.min(Math.max(1, width - 80) / w, Math.max(1, height - 100) / h) };
  }
  const single = pack(Infinity), budgets = new Set([Math.max(...components.map(c => c.width)), Math.max(1, width - 80) / .55]);
  let prefix = 0;
  for (const c of components) { prefix += (prefix ? 35 : 0) + c.width; budgets.add(prefix); }
  let best = single;
  for (const budget of budgets) {
    const candidate = pack(budget);
    if (candidate.scale > best.scale + .001 || (Math.abs(candidate.scale - best.scale) <= .001 && candidate.rows.length < best.rows.length)) best = candidate;
  }
  // Prefer a shared horizontal baseline if points remain reasonably readable,
  // even when wrapping would make them somewhat larger.
  const layout = single.scale >= Math.min(.55, best.scale * .7) ? single : best;
  let y = 0;
  for (const row of layout.rows) {
    for (const { component, x } of row.items) for (const n of component.members) { n.x += x; n.y += y; }
    y += row.height + 65;
  }
  return { ...forest, nodes };
}

export function enforceLayout(model) {
  const next = copy(model), byId = new Map(next.nodes.map(n => [n.id, n])), done = new Set();
  const uppers = new Map(next.nodes.map(n => [n.id, []]));
  next.edges.forEach(([a, b]) => uppers.get(a).push(b));
  function place(id) {
    if (done.has(id)) return byId.get(id).y;
    const n = byId.get(id);
    for (const b of uppers.get(id)) n.y = Math.max(n.y, place(b) + GAP);
    done.add(id); return n.y;
  }
  next.nodes.forEach(n => place(n.id)); return next;
}

export function constrainPosition(model, id, x, y, snap = false) {
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  let min = -Infinity, max = Infinity;
  for (const [a, b] of model.edges) {
    if (a === id) min = Math.max(min, byId.get(b).y + GAP);
    if (b === id) max = Math.min(max, byId.get(a).y - GAP);
  }
  const step = snap ? 25 : 1;
  return { x: Math.round(x / step) * step, y: Math.max(min, Math.min(max, Math.round(y / step) * step)) };
}

export function addRelation(model, a, b) {
  const order = closure(model);
  if (!order.index.has(a) || !order.index.has(b)) throw Error('Unknown point.');
  if (a === b) throw Error('Choose two different points.');
  if (order.le(b, a)) throw Error('This relation would create a cycle.');
  if (order.le(a, b)) throw Error('This relation is already implied.');
  const next = copy(model); next.edges.push([a, b]); next.edges = covers(next);
  return withPigments(enforceLayout(next));
}

export function removeNode(model, id) {
  const order = closure(model), next = copy(model);
  next.nodes = next.nodes.filter(n => n.id !== id);
  next.edges = next.nodes.flatMap(a => next.nodes.flatMap(b => a.id !== b.id && order.le(a.id, b.id) ? [[a.id, b.id]] : []));
  next.edges = covers(next); return withPigments(next);
}

export function arrange(model) {
  const next = copy(model), order = closure(next), memo = new Map();
  function rank(id) {
    if (!memo.has(id)) memo.set(id, Math.max(0, ...order.ids.filter(q => q !== id && order.le(q, id)).map(q => rank(q) + 1)));
    return memo.get(id);
  }
  const height = Math.max(0, ...order.ids.map(rank));
  for (let level = 0; level <= height; level++) {
    const row = next.nodes.filter(n => rank(n.id) === level).sort((a, b) => a.x - b.x);
    row.forEach((n, i) => { n.x = 250 + (i - (row.length - 1) / 2) * 85; n.y = 60 + (height - level) * 110; });
  }
  return next;
}

export const empty = () => ({ format: 'godel-studio', version: 1, title: 'Untitled poset', nodes: [], edges: [] });

export function example(kind = 'boolean2') {
  const m = empty();
  if (kind.startsWith('boolean')) {
    const size = Number(kind.slice(7)), total = 2 ** size;
    m.title = `Powerset of a ${size}-element set`;
    for (let mask = 0; mask < total; mask++) {
      const members = Array.from({ length: size }, (_, i) => i).filter(i => mask & 2 ** i);
      m.nodes.push({ id: `p${mask}`, label: members.length ? `{${members.map(i => String.fromCharCode(97 + i)).join(',')}}` : '∅', x: mask * 40, y: 0, pigment: null });
      for (let bit = 0; bit < size; bit++) if (!(mask & 2 ** bit)) m.edges.push([`p${mask}`, `p${mask | 2 ** bit}`]);
    }
  } else {
    const size = kind === 'chain8' ? 8 : 4;
    m.title = kind === 'antichain' ? 'Four-point antichain' : `${size}-point chain`;
    m.nodes = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, label: String.fromCharCode(97 + i), x: i * 80, y: 0, pigment: null }));
    if (kind !== 'antichain') m.edges = m.nodes.slice(1).map((n, i) => [m.nodes[i].id, n.id]);
  }
  return withPigments(arrange(m));
}

export function validate(input) {
  if (!input || !['godel-studio', 'poset-studio'].includes(input.format) || input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw Error('Choose a Free Gödel algebras dually or Poset Studio JSON file.');
  // Every input point yields a singleton chain. Beyond 200 points, no output
  // can fit; reject larger files before cubic order validation.
  if (input.nodes.length > OUTPUT_LIMIT) throw Error('Each input point produces a singleton chain. More than 200 input points cannot fit the output limit.');
  const ids = new Set();
  const next = empty(); next.title = typeof input.title === 'string' ? input.title.slice(0, 100) : next.title;
  for (const n of input.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 150 || ids.has(n.id) || typeof n.label !== 'string' || n.label.length > 80 || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000 || (input.format === 'godel-studio' && n.pigment != null && !/^#[0-9a-f]{6}$/i.test(n.pigment))) throw Error('The file contains an invalid or duplicate point.');
    ids.add(n.id); next.nodes.push({ id: n.id, label: n.label, x: n.x, y: n.y, pigment: input.format === 'godel-studio' ? n.pigment ?? null : null });
  }
  for (const e of input.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !ids.has(e[0]) || !ids.has(e[1]) || e[0] === e[1]) throw Error('The file contains an invalid relation.');
    next.edges.push([...e]);
  }
  const order = closure(next);
  if (order.r.some((row, i) => row.some((v, j) => i !== j && v && order.r[j][i]))) throw Error('The relations contain a cycle.');
  next.edges = covers(next, order);
  return withPigments(enforceLayout(next));
}
