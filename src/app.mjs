import { OUTPUT_LIMIT, copy, closure, covers, coloring, withPigments, rootSystem, layoutRootSystem, constrainPosition, addRelation, removeNode, arrange, empty, example, validate } from './core.mjs';

const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
const canvases = { input: $('input-canvas'), output: $('output-canvas') };
const views = { input: { x: 0, y: 0, w: 500, h: 500 }, output: { x: 0, y: 0, w: 700, h: 500 } };
const storageKey = 'godel-studio-v1';
let model = example(), order, colors, forest, undo = [], redo = [], tool = 'move';
let selected = null, hover = null, source = null, gesture = null, startupError = '', exporting = false;
let outputWidth = 0, outputHeight = 0;
try { const saved = localStorage.getItem(storageKey); if (saved) model = validate(JSON.parse(saved)); }
catch { startupError = 'The saved drawing could not be opened. Use Open to load a file.'; }

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function html(tag, className, text) {
  const n = document.createElement(tag); if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
const inputNode = id => model.nodes.find(n => n.id === id);
const outputNode = id => forest.nodes.find(n => n.id === id);
const label = id => inputNode(id)?.label || id;
const chainText = chain => '[' + chain.map(label).join(' < ') + ']';
const info = () => hover || (selected?.type !== 'edge' ? selected : null);

function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(model)); $('saved').textContent = 'Saved on this device'; }
  catch { $('saved').textContent = 'Use Save file to keep this drawing'; }
}
function rebuild() {
  order = closure(model); colors = coloring(model, order); forest = rootSystem(model, OUTPUT_LIMIT, order);
  layoutOutput();
}
function layoutOutput() {
  outputWidth = canvases.output.clientWidth; outputHeight = canvases.output.clientHeight;
  const spacing = $('chain-labels').checked ? Math.max(56, ...forest.nodes.map(n => chainText(n.chain).length * 7.5 + 24)) : 56;
  forest = layoutRootSystem(forest, { width: outputWidth, height: outputHeight, spacing });
}
function resizeOutput() {
  const { clientWidth: width, clientHeight: height } = canvases.output;
  if (!width || !height || (width === outputWidth && height === outputHeight)) return;
  if (gesture?.panel === 'output') cancelGesture();
  layoutOutput(); drawPanel('output'); refreshInteraction(); fit('output');
}
function commit(next, text = '', fitInput = false) {
  next = withPigments(next);
  if (JSON.stringify(next) === JSON.stringify(model)) return;
  undo.push(copy(model)); if (undo.length > 100) undo.shift(); redo = []; model = next;
  hover = null;
  if (selected?.panel === 'input' && selected.type !== 'edge' && !inputNode(selected.id)) selected = null;
  if (selected?.panel === 'output') selected = null;
  source = null; persist(); rebuild(); render(); fit('output'); if (fitInput) fit('input');
  if (text) status(text);
}
function history(back) {
  const from = back ? undo : redo, to = back ? redo : undo; if (!from.length) return;
  cancelGesture(); to.push(copy(model)); model = from.pop(); selected = hover = source = null;
  persist(); rebuild(); render(); fit('input'); fit('output'); status(back ? 'Edit undone.' : 'Edit restored.');
}

function updateView(panel) {
  const v = views[panel]; canvases[panel].setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}
function points(panel) { return panel === 'input' ? model.nodes : forest.nodes; }
function fit(panel) {
  const nodes = points(panel), svg = canvases[panel], ratio = Math.max(.1, svg.clientWidth / Math.max(1, svg.clientHeight));
  if (!nodes.length) { views[panel] = { x: 0, y: 0, w: 500 * ratio, h: 500 }; updateView(panel); return; }
  let minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
  let minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y));
  const box = svg.querySelector('.points').getBBox();
  minX = Math.min(minX, box.x); maxX = Math.max(maxX, box.x + box.width);
  minY = Math.min(minY, box.y); maxY = Math.max(maxY, box.y + box.height);
  let w = Math.max(panel === 'input' ? 300 : 380, maxX - minX + 80), h = Math.max(320, maxY - minY + 100);
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  views[panel] = { x: (minX + maxX - w) / 2, y: (minY + maxY - h) / 2, w, h }; updateView(panel);
}
function position(event, panel) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(canvases[panel].getScreenCTM().inverse());
}
function zoom(panel, factor, at = null) {
  const v = views[panel], w = v.w * factor, h = v.h * factor;
  if (w < 65 || w > 100000) return;
  const p = at || { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  views[panel] = { x: p.x - (p.x - v.x) * factor, y: p.y - (p.y - v.y) * factor, w, h }; updateView(panel);
}

function drawPanel(panel) {
  const svg = canvases[panel], nodes = points(panel), byId = new Map(nodes.map(n => [n.id, n]));
  const edgeLayer = svg.querySelector('.edges'), pointLayer = svg.querySelector('.points');
  edgeLayer.replaceChildren(); pointLayer.replaceChildren();
  const edges = panel === 'input' ? model.edges : forest.edges;
  for (const [a, b] of edges) {
    const n = byId.get(a), m = byId.get(b), attrs = { x1: n.x, y1: n.y, x2: m.x, y2: m.y };
    const line = svgEl('line', { ...attrs, class: 'edge', 'data-a': a, 'data-b': b }); edgeLayer.append(line);
    if (panel === 'input') {
      const hit = svgEl('line', { ...attrs, class: 'edge-hit', role: 'button', tabindex: 0, 'aria-label': `Cover ${label(a)} < ${label(b)}`, 'data-a': a, 'data-b': b });
      const choose = () => { if (tool !== 'move') return; selected = { panel, type: 'edge', a, b }; hover = source = null; refreshInteraction(); status('Delete removes the selected cover.'); };
      hit.addEventListener('click', e => { e.stopPropagation(); choose(); });
      hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      edgeLayer.append(hit);
    }
  }
  for (const n of nodes) {
    const minimum = panel === 'input' ? n.id : n.minimum;
    const text = panel === 'input' ? n.label : chainText(n.chain);
    const group = svgEl('g', { class: 'point', transform: `translate(${n.x} ${n.y})`, 'data-id': n.id, role: 'button', tabindex: 0, 'aria-label': `${panel === 'input' ? 'Point' : 'Chain'} ${text}` });
    group.append(svgEl('title', {}, text), svgEl('circle', { r: 21, class: 'hit' }), svgEl('circle', { r: 17, class: 'ring' }), svgEl('circle', { r: 22, class: 'minimum-ring' }), svgEl('circle', { r: 9.5, fill: colors.fills.get(minimum), class: 'core' }));
    if ((panel === 'input' && $('input-labels').checked) || (panel === 'output' && $('chain-labels').checked)) {
      group.append(svgEl('text', { x: 15, y: -14 }, text));
    }
    group.addEventListener('pointerenter', () => { if (!gesture && !(panel === 'input' && tool === 'order' && source)) setHover({ panel, id: n.id }); });
    group.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
    group.addEventListener('focus', () => { if (!gesture) setHover({ panel, id: n.id }); });
    group.addEventListener('blur', () => { if (!gesture) setHover(null); });
    group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(panel, n.id); } });
    group.addEventListener('pointerdown', e => startPointGesture(e, panel, n.id));
    pointLayer.append(group);
  }
}

function render() {
  $('input-count').textContent = `${model.nodes.length} point${model.nodes.length === 1 ? '' : 's'}`;
  $('output-count').textContent = forest.exceeded ? 'More than 200 elements' : `${forest.count} element${forest.count === 1 ? '' : 's'}`;
  $('output-count').style.color = forest.exceeded ? '#a05640' : '';
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  $('delete-poset').disabled = !model.nodes.length;
  $('input-empty').hidden = !!model.nodes.length;
  $('output-notice').hidden = !forest.exceeded && !!model.nodes.length;
  $('output-notice').classList.toggle('limit-error', forest.exceeded);
  $('output-message').textContent = forest.exceeded ? 'This poset produces more than 200 points. Remove points or order relations to display the root system.' : 'Add points to construct the root system.';
  document.querySelectorAll('[data-export]').forEach(b => b.disabled = exporting || !points(b.dataset.export).length);
  drawPanel('input'); drawPanel('output'); drawLegend(); refreshInteraction();
}
function setHover(value) {
  if (hover?.panel === value?.panel && hover?.id === value?.id) return;
  hover = value; refreshInteraction();
}
function refreshInteraction() {
  const active = info(), members = new Set(), outputPath = new Set(); let minimum = null;
  if (active?.panel === 'input' && inputNode(active.id)) { members.add(active.id); minimum = active.id; }
  if (active?.panel === 'output') {
    const chain = outputNode(active.id)?.chain;
    if (chain) { chain.forEach(id => members.add(id)); minimum = chain[0]; for (let i = 0; i < chain.length; i++) outputPath.add(JSON.stringify(chain.slice(i))); }
  }
  for (const [panel, svg] of Object.entries(canvases)) {
    for (const g of svg.querySelectorAll('.point')) {
      const id = g.dataset.id, n = panel === 'output' ? outputNode(id) : null;
      const related = panel === 'input' ? members.has(id) : active?.panel === 'input' ? n.minimum === minimum : outputPath.has(id);
      g.classList.toggle('related', !!active && related);
      g.classList.toggle('dim', !!active && !related);
      g.classList.toggle('minimum', panel === 'input' && !!active && id === minimum);
      g.classList.toggle('pinned', selected?.panel === panel && selected.id === id);
      g.classList.toggle('source', panel === 'input' && source === id);
    }
    for (const line of svg.querySelectorAll('.edge')) {
      const a = line.dataset.a, b = line.dataset.b;
      const related = panel === 'input' ? members.has(a) && members.has(b) : outputPath.has(a) && outputPath.has(b);
      line.classList.toggle('dim', !!active && !related);
      line.classList.toggle('active', !!active && related);
      line.classList.toggle('selected', panel === 'input' && selected?.type === 'edge' && selected.a === a && selected.b === b);
    }
  }
  $('clear-selection').disabled = !selected && !source;
  $('delete').disabled = !selected || selected.panel !== 'input';
  drawInspector(active);
}

function drawInspector(active) {
  const box = $('inspector-content');
  // Do not interrupt typing when pointer/focus events refresh the highlights.
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && active?.panel === 'input' && document.activeElement.dataset.id === active.id) return;
  box.replaceChildren();
  if (!active) {
    if (selected?.type === 'edge') box.append(html('div', 'inspect-title', `${label(selected.a)} < ${label(selected.b)}`), html('p', '', 'Selected cover relation.'));
    else box.append(html('p', '', 'Hover or select a point.'));
    return;
  }
  const n = active.panel === 'input' ? inputNode(active.id) : outputNode(active.id); if (!n) return;
  const minimum = active.panel === 'input' ? n.id : n.minimum;
  box.append(html('div', 'inspect-title', active.panel === 'input' ? label(n.id) : chainText(n.chain)));
  if (active.panel === 'input') {
    if (selected?.panel === 'input' && selected.id === n.id && !hover) {
      const row = html('div', 'label-edit'), lab = html('label', '', 'Label'), input = html('input');
      lab.htmlFor = 'point-label'; input.id = 'point-label'; input.dataset.id = n.id; input.value = n.label; input.maxLength = 80;
      input.addEventListener('change', () => { const next = copy(model); next.nodes.find(q => q.id === n.id).label = input.value.trim() || n.label; commit(next, 'Point renamed.'); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); }); row.append(lab, input); box.append(row);
    }
  } else {
    box.append(html('div', 'inspect-line', `Least element: ${label(minimum)} · Chain size: ${n.chain.length}`));
    if (n.parent) box.append(html('div', 'inspect-line', `Upper cover: ${chainText(outputNode(n.parent).chain)}`));
    else box.append(html('div', 'inspect-line', 'Singleton chain · maximal point'));
  }
}
function drawLegend() {
  const list = $('hue-list'); list.replaceChildren(); $('hue-count').textContent = `${colors.generators.length} hues`;
  for (const id of colors.generators) {
    const item = html('div', 'hue-item'), color = html('input'), button = html('button', '', label(id));
    color.type = 'color'; color.value = inputNode(id).pigment; color.setAttribute('aria-label', `Base hue introduced at ${label(id)}`); color.title = `Change hue at ${label(id)}`;
    color.addEventListener('change', () => {
      if (model.nodes.some(n => n.id !== id && n.pigment === color.value)) { color.value = inputNode(id).pigment; status('Choose a hue different from the other base hues.', true); return; }
      const next = copy(model); next.nodes.find(n => n.id === id).pigment = color.value; commit(next, 'Base hue changed.');
    });
    button.setAttribute('aria-label', `Select hue point ${label(id)}`); button.onclick = () => { hover = null; selected = { panel: 'input', id }; refreshInteraction(); };
    item.append(color, button); list.append(item);
  }
  if (!colors.generators.length) list.append(html('p', '', model.nodes.length ? 'No base hues. The least point is white.' : 'Add points to assign base hues.'));
}

function activate(panel, id) {
  hover = null;
  if (panel === 'input' && tool === 'order') {
    if (!source) { source = id; selected = { panel, id }; refreshInteraction(); status(`Lower point: ${label(id)}. Choose an upper point.`); return; }
    try { const next = addRelation(model, source, id); selected = { panel, id }; commit(next, 'Relation added.', true); }
    catch (error) { status(error.message, true); refreshInteraction(); }
  } else { selected = { panel, id }; refreshInteraction(); }
}
function setTool(next) {
  cancelGesture(); tool = next; source = null; hover = null; document.body.dataset.tool = next;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === next));
  $('order-preview').replaceChildren(); refreshInteraction();
  status({ move: 'Drag points to move. Hover to inspect; click to pin.', point: 'Click empty space to add a point.', order: 'Connect the lower point to the upper point by clicking or dragging.' }[next]);
}
function addPoint(x, y) {
  if (model.nodes.length >= OUTPUT_LIMIT) { status('200 input points already produce at least 200 output points.', true); return; }
  const next = copy(model), step = $('snap').checked ? 25 : 1;
  let i = 0, name; do { name = i < 26 ? String.fromCharCode(97 + i) : `p${i + 1}`; i++; } while (next.nodes.some(n => n.label === name));
  const id = crypto.randomUUID();
  next.nodes.push({ id, label: name, x: Math.round(x / step) * step, y: Math.round(y / step) * step, pigment: null });
  selected = { panel: 'input', id }; commit(next, `Point ${name} added.`);
}
function deleteSelection() {
  if (selected?.panel !== 'input') return;
  let next;
  if (selected.type === 'edge') { next = copy(model); next.edges = next.edges.filter(([a, b]) => a !== selected.a || b !== selected.b); next.edges = covers(next); }
  else next = removeNode(model, selected.id);
  selected = hover = null; commit(next, 'Selection deleted.');
}
function clearSelection() { cancelGesture(); selected = hover = source = null; $('order-preview').replaceChildren(); refreshInteraction(); }

function startPointGesture(e, panel, id) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const p = position(e, panel), n = (panel === 'input' ? inputNode(id) : outputNode(id));
  gesture = { panel, id, kind: panel === 'input' && tool === 'order' ? 'order' : panel === 'input' && tool === 'move' ? 'move' : 'choose', pointer: e.pointerId, px: e.clientX, py: e.clientY, dx: p.x - n.x, dy: p.y - n.y, start: panel === 'input' && tool === 'move' ? copy(model) : null, moved: false };
  canvases[panel].setPointerCapture(e.pointerId);
}
function pointUnder(e, panel) {
  const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('.point');
  return g && canvases[panel].contains(g) ? g.dataset.id : null;
}
function preview(end, target) {
  const layer = $('order-preview'); layer.replaceChildren(); if (!source) return;
  const n = inputNode(source), q = target ? inputNode(target) : end;
  if (n && q) layer.append(svgEl('line', { x1: n.x, y1: n.y, x2: q.x, y2: q.y, class: 'preview-line' }));
}
function cancelGesture() {
  if (!gesture) return;
  const g = gesture; gesture = null;
  if (g.kind === 'move' && g.moved) { model = g.start; drawPanel('input'); }
  if (canvases[g.panel].hasPointerCapture(g.pointer)) canvases[g.panel].releasePointerCapture(g.pointer);
  $('order-preview').replaceChildren();
}
for (const [panel, svg] of Object.entries(canvases)) {
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.point') || e.target.closest('.edge-hit')) return;
    if (panel === 'input' && tool === 'point') { const p = position(e, panel); addPoint(p.x, p.y); return; }
    gesture = { panel, kind: 'pan', pointer: e.pointerId, px: e.clientX, py: e.clientY, view: { ...views[panel] }, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!gesture) { if (panel === 'input' && tool === 'order' && source) preview(position(e, panel), pointUnder(e, panel)); return; }
    const g = gesture; if (g.panel !== panel || g.pointer !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.px, e.clientY - g.py) < 4) return;
    g.moved = true; hover = null;
    if (g.kind === 'move') {
      const p = position(e, panel), n = inputNode(g.id), next = constrainPosition(model, g.id, p.x - g.dx, p.y - g.dy, $('snap').checked);
      Object.assign(n, next); selected = { panel, id: g.id }; drawPanel('input'); refreshInteraction();
    } else if (g.kind === 'order') { source = g.id; refreshInteraction(); preview(position(e, panel), pointUnder(e, panel)); }
    else if (g.kind === 'pan') {
      const matrix = svg.getScreenCTM();
      views[panel] = { ...g.view, x: g.view.x - (e.clientX - g.px) / matrix.a, y: g.view.y - (e.clientY - g.py) / matrix.d }; updateView(panel);
    }
  });
  svg.addEventListener('pointerup', e => {
    const g = gesture; if (!g || g.pointer !== e.pointerId || g.panel !== panel) return;
    const target = pointUnder(e, panel); gesture = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    $('order-preview').replaceChildren();
    if (g.kind === 'move' && g.moved) {
      if (JSON.stringify(model) !== JSON.stringify(g.start)) { undo.push(g.start); if (undo.length > 100) undo.shift(); redo = []; persist(); rebuild(); render(); }
      else refreshInteraction();
    } else if (g.kind === 'order' && g.moved) {
      if (target && target !== g.id) { source = g.id; activate(panel, target); }
      else { source = null; refreshInteraction(); status('Connection cancelled.'); }
    } else if (g.id && !g.moved) activate(panel, g.id);
    else if (g.kind === 'pan' && !g.moved) clearSelection();
  });
  svg.addEventListener('pointercancel', () => { cancelGesture(); source = null; refreshInteraction(); });
  svg.addEventListener('lostpointercapture', () => { if (gesture?.panel === panel) { cancelGesture(); source = null; refreshInteraction(); } });
  svg.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoom(panel, e.deltaY > 0 ? 1.12 : 1 / 1.12, position(e, panel)); }, { passive: false });
}

function fileName(suffix) { return (model.title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poset') + suffix; }
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = html('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function download() { saveBlob(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }), fileName('.json')); status('File saved.'); }
async function downloadPng(panel) {
  if (exporting || !points(panel).length) return;
  exporting = true; document.querySelectorAll('[data-export]').forEach(b => b.disabled = true);
  let url;
  try {
    const svg = canvases[panel], box = svg.querySelector('.points').getBBox();
    const bounds = { x: box.x - 30, y: box.y - 30, width: Math.ceil(box.width + 60), height: Math.ceil(box.height + 60) };
    const clone = svg.cloneNode(true); clone.setAttribute('xmlns', NS); clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`); clone.setAttribute('width', bounds.width); clone.setAttribute('height', bounds.height);
    clone.querySelectorAll('defs, .canvas-bg, .hit, .ring, .minimum-ring, .edge-hit, #order-preview, title').forEach(n => n.remove());
    clone.querySelectorAll('.point').forEach(n => n.setAttribute('class', 'point')); clone.querySelectorAll('.edge').forEach(n => n.setAttribute('class', 'edge'));
    const style = svgEl('style', {}, '.edge{stroke:#80917a;stroke-width:1.8}.core{stroke:#536a50;stroke-width:1.6}.point text{font:italic 14px Georgia,serif;fill:#4e6549;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}');
    clone.prepend(style, svgEl('rect', { ...bounds, fill: '#ffffff' }));
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Could not render the PNG.')); image.src = url; });
    const scale = Math.min(2, 4096 / bounds.width, 4096 / bounds.height), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(bounds.width * scale)); canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw Error('Could not create the PNG.');
    saveBlob(blob, fileName(panel === 'input' ? '-input.png' : '-root-system.png')); status('PNG saved.');
  } catch (error) { status(error.message, true); }
  finally { if (url) URL.revokeObjectURL(url); exporting = false; document.querySelectorAll('[data-export]').forEach(b => b.disabled = !points(b.dataset.export).length); }
}

document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => fit(b.dataset.fit));
document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const [panel, dir] = b.dataset.zoom.split(':'); zoom(panel, dir === 'in' ? .8 : 1.25); });
document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => downloadPng(b.dataset.export));
$('clear-selection').onclick = clearSelection; $('delete').onclick = deleteSelection;
$('undo').onclick = () => history(true); $('redo').onclick = () => history(false);
$('arrange').onclick = () => commit(arrange(model), 'Points arranged.', true);
function clearPoset() { clearSelection(); commit(empty(), 'Click empty space to add a point.', true); setTool('point'); }
$('blank').onclick = clearPoset;
$('delete-poset').onclick = clearPoset;
$('add-first').onclick = () => { const v = views.input; addPoint(v.x + v.w / 2, v.y + v.h / 2); };
$('examples').onchange = e => { if (!e.target.value) return; selected = null; commit(example(e.target.value), 'Example loaded.', true); e.target.value = ''; setTool('move'); };
$('input-labels').onchange = () => { drawPanel('input'); refreshInteraction(); };
$('chain-labels').onchange = () => { rebuild(); drawPanel('output'); refreshInteraction(); fit('output'); };
$('save').onclick = download; $('open').onclick = () => $('file').click();
$('file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (file.size > 2_000_000) throw Error('Choose a file smaller than 2 MB.'); const next = validate(JSON.parse(await file.text())); selected = null; commit(next, 'Poset opened.', true); setTool('move'); }
  catch (error) { status(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message, true); }
  e.target.value = '';
};
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); download(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); history(e.key.toLowerCase() === 'z' && !e.shiftKey); return; }
  if (e.key === 'Escape') { clearSelection(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
  const shortcuts = { v: 'move', n: 'point', e: 'order' }; if (shortcuts[e.key.toLowerCase()]) setTool(shortcuts[e.key.toLowerCase()]);
});
rebuild(); render(); setTool('move'); requestAnimationFrame(() => { fit('input'); fit('output'); });
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeOutput).observe(canvases.output);
else window.addEventListener('resize', resizeOutput);
if (startupError) status(startupError, true);
