// Source-level interaction checks in an in-memory DOM. These do not replace
// a browser's layout, hit testing, pointer capture, or PNG rendering checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as core from '../src/core.mjs';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this.events = new Map(); this._text = ''; this.checked = false; this.disabled = false; this.hidden = false; this.clientWidth = 700; this.clientHeight = 500; this.captured = new Set(); }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (key === 'checked') this.checked = true;
    if (key === 'id') this.id = String(value);
    if (key === 'value') this.value = String(value);
  }
  getAttribute(key) { return this.attrs[key]; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get classList() {
    return { toggle: (name, on) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)); if (on) names.add(name); else names.delete(name); this.className = [...names].join(' '); }, contains: name => this.className.split(/\s+/).includes(name) };
  }
  append(...nodes) { for (const n of nodes) { n.parentElement = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children.forEach(n => n.parentElement = null); this.children = []; this._text = ''; this.append(...nodes); }
  contains(n) { return this === n || this.children.some(c => c.contains(n)); }
  matches(s) { return s.startsWith('#') ? this.id === s.slice(1) : s.startsWith('.') ? this.classList.contains(s.slice(1)) : s.startsWith('[') ? Object.hasOwn(this.attrs, s.slice(1, -1)) : this.tagName === s.toUpperCase(); }
  querySelectorAll(selector) { const selectors = selector.split(',').map(s => s.trim()), result = []; const walk = n => { for (const c of n.children) { if (selectors.some(s => c.matches(s))) result.push(c); walk(c); } }; walk(this); return result; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s); }
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(fn); }
  emit(type, properties = {}) {
    const e = { target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...properties };
    const pending = []; let current = this;
    do { for (const fn of current.events.get(type) || []) pending.push(fn(e)); if (current['on' + type]) pending.push(current['on' + type](e)); current = current.parentElement; } while (current && !e.stopped && !['pointerenter', 'pointerleave'].includes(type));
    return Promise.all(pending);
  }
  getBBox() { return { x: 0, y: 0, width: 500, height: 400 }; }
  getScreenCTM() { return { a: 1, d: 1, inverse() { return this; } }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function launch(saved = null) {
  const document = new Element('document'), stack = [document];
  const source = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const voids = new Set(['meta', 'link', 'input', 'br']);
  for (const match of source.matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attributes, slash] = match;
    if (close) { if (stack.at(-1).tagName === tag.toUpperCase()) stack.pop(); continue; }
    const n = new Element(tag); for (const attr of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) n.setAttribute(attr[1], attr[2] ?? '');
    stack.at(-1).append(n); if (!voids.has(tag) && !slash) stack.push(n);
  }
  document.body = document.querySelector('body'); document.activeElement = document.body;
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag);
  document.createTextNode = value => { const n = new Element('text-node'); n.textContent = value; return n; };
  document.elementFromPoint = () => document.pointerTarget || document.body;
  const storage = new Map(saved ? [['godel-studio-v1', JSON.stringify(saved)]] : []), window = new Element('window');
  const observers = [];
  class ResizeObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } }
  const context = vm.createContext({ ...core, document, window, crypto: { randomUUID }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, requestAnimationFrame: fn => fn(), ResizeObserver, DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } }, setTimeout, Blob, URL, console });
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
  vm.runInContext(app, context, { filename: 'app.mjs' });
  const $ = id => document.getElementById(id);
  const point = (panel, id) => $(panel + '-canvas').querySelectorAll('.point').find(n => n.dataset.id === id);
  const stored = () => JSON.parse(storage.get('godel-studio-v1'));
  const resizeOutput = (width, height) => { $('output-canvas').clientWidth = width; $('output-canvas').clientHeight = height; observers.forEach(observer => observer.callback()); };
  return { $, document, window, point, stored, resizeOutput };
}

test('app initializes a colored diamond with eleven chains and two base hues', () => {
  const { $ } = launch();
  assert.equal($('input-count').textContent, '4 points');
  assert.equal($('output-count').textContent, '11 elements');
  assert.equal($('hue-count').textContent, '2 hues');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 11);
});

test('chain-length number and All checkbox save, undo, and remember the number across switching and reloading', async () => {
  const model = core.example('chain'), { $, stored } = launch(model);
  assert.equal($('all-chain-lengths').checked, true);
  assert.equal($('max-chain-length').disabled, true); assert.equal($('max-chain-length').value, 'All');
  assert.equal($('max-chain-length').getAttribute('type'), 'text');
  $('all-chain-lengths').checked = false; await $('all-chain-lengths').emit('change');
  assert.equal($('max-chain-length').disabled, false); assert.equal($('max-chain-length').value, '1');
  assert.equal($('max-chain-length').getAttribute('type'), 'number'); assert.equal($('output-count').textContent, '4 elements');
  $('max-chain-length').value = '2'; await $('max-chain-length').emit('change');
  assert.equal($('output-count').textContent, '10 elements'); assert.equal(stored().maxChainLength, 2);
  assert.deepEqual(stored().nodes, model.nodes); assert.deepEqual(stored().edges, model.edges);
  assert.ok($('output-canvas').querySelectorAll('.point').every(n => JSON.parse(n.dataset.id).length <= 2));
  await $('undo').emit('click'); assert.equal($('max-chain-length').value, '1'); assert.equal($('output-count').textContent, '4 elements');
  await $('redo').emit('click'); assert.equal($('max-chain-length').value, '2');
  $('all-chain-lengths').checked = true; await $('all-chain-lengths').emit('change');
  assert.equal($('max-chain-length').disabled, true); assert.equal($('max-chain-length').value, 'All');
  assert.equal($('output-count').textContent, '15 elements'); assert.equal(stored().maxChainLength, null); assert.equal(stored().lastChainLength, 2);
  const reloaded = launch(stored()); assert.equal(reloaded.$('all-chain-lengths').checked, true); assert.equal(reloaded.$('max-chain-length').value, 'All'); assert.equal(reloaded.$('max-chain-length').disabled, true);
  reloaded.$('all-chain-lengths').checked = false; await reloaded.$('all-chain-lengths').emit('change'); assert.equal(reloaded.$('max-chain-length').value, '2'); assert.equal(reloaded.$('output-count').textContent, '10 elements');
  $('all-chain-lengths').checked = false; await $('all-chain-lengths').emit('change');
  $('examples').value = 'boolean3'; await $('examples').emit('change');
  assert.equal($('max-chain-length').value, '2'); assert.equal($('output-count').textContent, '27 elements');
  await $('delete-poset').emit('click'); assert.equal($('max-chain-length').value, '2'); assert.equal($('output-count').textContent, '0 elements');
});

test('length restriction recovers an oversized output and All restores the limit warning', async () => {
  const { $ } = launch(core.example('chain8'));
  assert.equal($('output-count').textContent, 'More than 200 elements');
  $('all-chain-lengths').checked = false; await $('all-chain-lengths').emit('change');
  $('max-chain-length').value = '4'; await $('max-chain-length').emit('change');
  assert.equal($('output-count').textContent, '162 elements'); assert.equal($('output-notice').hidden, true);
  $('all-chain-lengths').checked = true; await $('all-chain-lengths').emit('change');
  assert.equal($('output-count').textContent, 'More than 200 elements'); assert.equal($('output-notice').hidden, false);
});

test('invalid chain-length numbers leave the saved restriction and diagram intact', async () => {
  const { $, stored } = launch();
  $('all-chain-lengths').checked = false; await $('all-chain-lengths').emit('change');
  $('max-chain-length').value = '2'; await $('max-chain-length').emit('change');
  const before = stored();
  for (const value of ['', '0', '-2', '1.5', 'invalid', '9007199254740992']) {
    $('max-chain-length').value = value; await $('max-chain-length').emit('change');
    assert.deepEqual(stored(), before); assert.equal($('output-count').textContent, '9 elements');
    assert.equal($('max-chain-length').getAttribute('aria-invalid'), 'true'); assert.match($('status').textContent, /positive whole number/);
  }
  $('max-chain-length').value = '1000'; await $('max-chain-length').emit('change');
  assert.equal($('output-count').textContent, '11 elements'); assert.equal($('max-chain-length').getAttribute('aria-invalid'), 'false');
  assert.equal($('status').textContent, ''); assert.equal(stored().maxChainLength, 1000);
});

test('canvas resize reflows components without changing the input, history, or pinned chain', async () => {
  const model = core.empty(); model.nodes = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, label: `${i}`, x: i * 60, y: 0, pigment: null }));
  const { $, point, stored, resizeOutput } = launch(core.withPigments(model)), before = stored();
  await point('output', '["p3"]').emit('keydown', { key: 'Enter' });
  const levels = () => new Set($('output-canvas').querySelectorAll('.point').map(n => n.getAttribute('transform').match(/translate\([^ ]+ ([^)]+)\)/)[1]));
  resizeOutput(260, 500); assert.ok(levels().size > 1);
  resizeOutput(1600, 500); assert.equal(levels().size, 1);
  assert.ok(point('output', '["p3"]').classList.contains('pinned'));
  assert.equal($('undo').disabled, true); assert.deepEqual(stored(), before);
  const view = $('output-canvas').getAttribute('viewBox'); resizeOutput(1600, 500);
  assert.equal($('output-canvas').getAttribute('viewBox'), view);
});

test('hover links chains to their members and minimum; leaving restores pinned inspection', async () => {
  const { $, point } = launch(); const chain = point('output', JSON.stringify(['p0', 'p1', 'p3']));
  await chain.emit('pointerenter');
  assert.ok(point('input', 'p0').classList.contains('minimum'));
  assert.ok(point('input', 'p1').classList.contains('related'));
  assert.ok(point('input', 'p2').classList.contains('dim'));
  assert.match($('inspector-content').textContent, /Chain size: 3/);
  await chain.emit('keydown', { key: 'Enter' });
  await point('input', 'p2').emit('pointerenter');
  assert.ok(point('output', JSON.stringify(['p2', 'p3'])).classList.contains('related'));
  await point('input', 'p2').emit('pointerleave');
  assert.match($('inspector-content').textContent, /Chain size: 3/);
  assert.ok(point('input', 'p0').classList.contains('minimum'));
});

test('repeated hover preserves canvas elements and viewboxes and shows no inspector hue chips', async () => {
  const { $, point } = launch(), input = point('input', 'p1'), output = point('output', '["p0","p1","p3"]');
  const inputView = $('input-canvas').getAttribute('viewBox'), outputView = $('output-canvas').getAttribute('viewBox');
  await output.emit('keydown', { key: 'Enter' });
  for (let i = 0; i < 10; i++) {
    await input.emit('pointerenter');
    assert.equal($('inspector-content').textContent, '{a}');
    assert.equal($('inspector-content').querySelectorAll('.chip').length, 0);
    await input.emit('pointerleave');
    assert.match($('inspector-content').textContent, /Chain size: 3/);
    assert.equal($('inspector-content').querySelectorAll('.chips').length, 0);
    assert.equal(point('input', 'p1'), input); assert.equal(point('output', '["p0","p1","p3"]'), output);
    assert.equal($('input-canvas').getAttribute('viewBox'), inputView);
    assert.equal($('output-canvas').getAttribute('viewBox'), outputView);
  }
});

test('over-limit example hides the entire forest; undo restores the prior output', async () => {
  const { $ } = launch();
  $('file').files = [{ size: 1000, text: async () => JSON.stringify(core.example('chain8')) }];
  await $('file').emit('change');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 0);
  assert.equal($('output-count').textContent, 'More than 200 elements');
  assert.equal($('output-notice').hidden, false);
  assert.match($('output-message').textContent, /Remove points or order relations/);
  await $('undo').emit('click');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 11);
  await $('redo').emit('click');
  assert.equal($('output-canvas').querySelectorAll('.point').length, 0);
});

test('blank, point creation, click-to-connect, invalid relation, deletion, and undo run through app handlers', async () => {
  const { $, document, point, stored } = launch();
  await $('delete-poset').emit('click');
  assert.equal($('input-count').textContent, '0 points');
  assert.equal($('output-count').textContent, '0 elements');
  assert.equal($('delete-poset').disabled, true);
  await $('undo').emit('click'); assert.equal($('output-count').textContent, '11 elements');
  await $('blank').emit('click'); await $('add-first').emit('click');
  await $('input-canvas').emit('pointerdown', { clientX: 240, clientY: 100 });
  let m = stored(); assert.equal(m.nodes.length, 2); const [a, b] = m.nodes.map(n => n.id);
  await document.querySelectorAll('[data-tool]').find(n => n.dataset.tool === 'order').emit('click');
  await point('input', a).emit('keydown', { key: 'Enter' }); await point('input', b).emit('keydown', { key: 'Enter' });
  m = stored(); assert.deepEqual(m.edges, [[a, b]]); assert.equal($('output-canvas').querySelectorAll('.point').length, 3);
  await point('input', b).emit('keydown', { key: 'Enter' }); await point('input', a).emit('keydown', { key: 'Enter' });
  assert.match($('status').textContent, /cycle/);
  await document.querySelectorAll('[data-tool]').find(n => n.dataset.tool === 'move').emit('click');
  await point('input', a).emit('keydown', { key: 'Enter' });
  const input = $('point-label'); assert.ok(input); input.value = '<test label>'; await input.emit('change');
  assert.equal(stored().nodes.find(n => n.id === a).label, '<test label>');
  await $('delete').emit('click'); assert.equal(stored().nodes.length, 1);
  await $('undo').emit('click'); assert.equal(stored().nodes.length, 2);
});

test('source pointer handlers support drag-to-connect and cancel drops on empty space', async () => {
  const model = core.example('antichain'), { $, document, point, stored } = launch(model);
  await document.querySelectorAll('[data-tool]').find(n => n.dataset.tool === 'order').emit('click');
  await point('input', 'p0').emit('pointerdown', { clientX: 0, clientY: 200 });
  document.pointerTarget = point('input', 'p1');
  await $('input-canvas').emit('pointermove', { clientX: 100, clientY: 80 });
  await $('input-canvas').emit('pointerup', { clientX: 100, clientY: 80 });
  assert.deepEqual(stored().edges, [['p0', 'p1']]);
  await point('input', 'p2').emit('pointerdown'); document.pointerTarget = null;
  await $('input-canvas').emit('pointermove', { clientX: 30, clientY: 50 });
  await $('input-canvas').emit('pointerup', { clientX: 30, clientY: 50 });
  assert.deepEqual(stored().edges, [['p0', 'p1']]); assert.match($('status').textContent, /cancelled/);
});

test('saved source reloads and Poset Studio import generates the uncolored order anew', async () => {
  const { $, stored } = launch(); const input = core.example('boolean3'); input.format = 'poset-studio'; input.nodes.forEach(n => n.hues = 7);
  $('file').files = [{ size: 1000, text: async () => JSON.stringify(input) }]; await $('file').emit('change');
  assert.equal($('input-count').textContent, '8 points'); assert.equal($('hue-count').textContent, '3 hues');
  assert.equal($('output-count').textContent, '51 elements');
  const reloaded = launch(stored()); assert.equal(reloaded.$('output-count').textContent, '51 elements');
});
