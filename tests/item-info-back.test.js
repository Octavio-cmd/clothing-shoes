#!/usr/bin/env node
// Item Info "← Regresar" → Item Type / Gender, plus type-specific state safety — focused permanent test.
//
//   node tests/item-info-back.test.js [path/to/app.js] [path/to/index.html]
//
// Runs fully offline: app.js is loaded in a Node vm sandbox with a small stub DOM. fetch / XHR /
// beacon / WebSocket, page reload/navigation, logout and every save/submit function are replaced
// by recorders, so nothing is saved, uploaded, written or sent. "Unchanged" checks compare
// against Preview main 9af8830 (hashes embedded below).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const revertItemInfoBack = require('./lib/revert-item-info-back.js');

const appPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app.js'));
const htmlPath = path.resolve(process.argv[3] || path.join(path.dirname(appPath), 'index.html'));
const APP = fs.readFileSync(appPath, 'utf8');
const HTML = fs.readFileSync(htmlPath, 'utf8');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// ── Baseline 9af8830 reference data ──────────────────────────
const BASE_APP_SHA = '1e3799b180e7e1fc7cbbf703773e7051a9f010bbfcb37f836ff0fece81250cce';
const BASE_GROUP_SHA = {
  sku: 'e24e8862301c0a8b1ca800516412ecb641513808636069c0b3cfd48b2c325026',
  title: 'c51da7c9105cc6624b875b8eb8ad2edca74cd63ebe6a3a39727a0c9a3e0b7083',
  description: '1d4f637091303e01a1dd5cc3e19db72fb4fe45ba28b93e9425a19bf3ec2200f9',
  photo: '872a3c85ecb344c512d363fb8c879da8dd4f38cae543ead7850cb2933b324903',
  sheets: '9df336e383fc8ae998e08232cb83106935b14367b9f17539f8883231b8c61018',
  ebay: '380b7c31d727fae973551a246b693520b919fcb04216c62d8202e8ac60b4d72b',
  api: '529b3673938a541504f2ff5b744996a5f3117ae2e9ca42fa8da8b411363598d4',
  login: '492567a630a5c5716a47a65fdd45980a71ae6d71839863cdbae721cfcd514f79',
  navigation: '457da4532e5ff4d31ecfa6572a5c37ab1fec0e152a2bf0100606def0aa7c91da',
};
const BASE_HOSTS_SHA = '549d74c74d8ea58265b55fdb71670568155ea4e68f679deeb07e50f6f5b848bf';
const BASE_CL_BRANDS_SRC = "const CL_BRANDS = ['Nike','Adidas','Under Armour','Champion','Puma','Reebok','New Balance',\n" +
  "  'Levi\\'s','Wrangler','Lee','Gap','Old Navy','H&M','Zara','Forever 21','American Eagle',\n" +
  "  'Hollister','Abercrombie','Calvin Klein','Tommy Hilfiger','Ralph Lauren','Polo Ralph Lauren','Lauren Ralph Lauren','Nautica',\n" +
  "  'Columbia','North Face','Carhartt','Patagonia','Carter\\'s','OshKosh','Other'];";
const EXPECTED_SHOE_BRANDS = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Skechers', 'Puma', 'Reebok', 'Under Armour',
  'ASICS', 'HOKA', 'On', 'Brooks', 'Saucony', 'Converse', 'Vans', 'Fila', 'Crocs', 'UGG', 'Timberland', 'Birkenstock',
  'Merrell', 'Salomon', 'K-Swiss', 'Keds', 'Mizuno', 'Havaianas', 'Steve Madden', 'Michael Kors', 'Clarks',
  'Dr. Martens', 'Cole Haan', 'Hey Dude', 'Ariat', 'Other'];

// Areas that must stay byte-identical to 9af8830 (top-level declarations).
const GROUPS = {
  sku: ['clGenSKU', 'clAutoSKU', 'clUpdateSKUDisplay', 'makeSKU'],
  title: ['clGeneratePreviewTitle', 'clGenerateEbayTitle', 'buildClothingTitle', 'clPrintLabel'],
  description: ['buildClothingDescHTML', 'buildClothingDesc', 'clCondText', 'clCondShort'],
  photo: ['PHOTO_SLOTS', 'clRenderPhotos', 'applyWhiteSquare', 'clTakePhoto', 'clCompressImage', 'clRemoveBackground',
    'removeBackgroundPixian', 'clUploadPhotoToImgBB', 'clUploadAllPhotos', 'clSaveImgbbKey', 'clTestImgbbKey',
    'openIndexedDB', 'saveToIndexedDB', 'getFromIndexedDB'],
  sheets: ['clSubmit', 'clSendToRegistroSheet', 'clSaveToSession', 'saveSheetsUrl', 'saveDriveUrl',
    'clExportEbayCSV', 'clShowExportOptions', 'clShowCsvFallback', 'saveClBulkToStorage'],
  ebay: ['clLookupBarcode', 'clLookupEbayURL', 'clBuildEbayRow', 'clBuildAspects', 'clBuildEbayCategory',
    'clGetEbayCategoryId', 'clGetConditionId', 'clDept', 'CL_SHIP_POLICY', 'CL_RET_POLICY', 'CL_PAY_POLICY'],
  api: ['SAVVY_API', 'savvyToken', 'savvyClaude'],
  login: ['doLogin', 'checkLogin', 'doLogout', 'savvyGuardarSesion', 'savvyBorrarSesion', 'savvySesionCaducada'],
  navigation: ['clGo', 'clUpdateProgress', 'clStep2Next', 'clSetCat', 'clSetBrand', 'clSetType', 'clBrandsForType', 'clInitSizeWheel'],
};

// ── helpers ──────────────────────────────────────────────────
const results = [];
function check(id, name, fn) {
  let ok = false, note = '';
  try { const r = fn(); ok = r === true || (r && r.ok === true); if (r && r.note) note = r.note; }
  catch (e) { note = String(e && e.message || e); }
  results.push({ id, name, ok, note });
}
function declSource(src, name) {
  const lines = src.split('\n'), out = [];
  const re = new RegExp('^(?:async function|function)\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(|^const\\s+' + name + '\\b');
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    const isFn = !lines[i].startsWith('const');
    let j = i;
    if (isFn) { while (j < lines.length && !/^}\s*;?\s*$/.test(lines[j])) j++; }
    else { while (j < lines.length && !/;\s*(\/\/.*)?$/.test(lines[j])) j++; }
    out.push(lines.slice(i, j + 1).join('\n'));
  }
  return out;
}
function groupSha(src, names) {
  return sha(names.map(n => { const d = declSource(src, n); if (!d.length) throw new Error('missing ' + n); return n + '\n' + d.join('\n'); }).join('\n\n'));
}
function hostsOf(s) { return [...new Set((s.match(/https?:\/\/[A-Za-z0-9.-]+/g) || []).map(u => u.toLowerCase()))].sort(); }

// ── sandbox: stub DOM, no network, spies on navigation/session/save ──
const events = [];  // everything that must NOT happen: network, reload, logout, saves
function classList(initial) {
  const set = new Set((initial || '').split(/\s+/).filter(Boolean));
  return { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)),
    toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; if (v) set.add(c); else set.delete(c); return v; },
    contains: c => set.has(c), toString: () => [...set].join(' ') };
}
function makeSandbox(extraGlobals) {
  const els = new Map(), parsed = new Map();
  function stubNode(store) {
    store = store || {};
    const fn = function () { return stubNode(); };
    return new Proxy(fn, {
      get(t, k) {
        if (k in store) return store[k];
        if (k === Symbol.toPrimitive) return () => '';
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k === 'querySelectorAll' || k === 'getElementsByClassName' || k === 'getElementsByTagName') return () => [];
        if (k === 'querySelector' || k === 'closest') return () => stubNode();
        if (k === 'length') return 0;
        if (k === 'innerHTML' || k === 'textContent' || k === 'value') return '';
        const v = stubNode(); store[k] = v; return v;
      },
      set(t, k, v) { store[k] = v; if (k === 'innerHTML') parsed.delete(store.id); return true; },
      apply() { return stubNode(); },
      construct() { return stubNode(); },
    });
  }
  const getEl = id => { if (!els.has(id)) els.set(id, stubNode({ id, style: {}, dataset: {}, classList: classList() })); return els.get(id); };
  // Minimal selector support for "#container [data-attr]": buttons parsed from the container's current innerHTML.
  function qsa(sel) {
    const m = /^#([\w-]+) \[data-([\w-]+)\]$/.exec(sel);
    if (!m) return [];
    const key = m[1] + '|' + m[2];
    if (!parsed.has(m[1])) parsed.set(m[1], new Map());
    const cache = parsed.get(m[1]);
    if (!cache.has(key)) {
      const html = String(getEl(m[1]).innerHTML || '');
      const camel = m[2].replace(/-(\w)/g, (_, c) => c.toUpperCase());
      cache.set(key, [...html.matchAll(new RegExp('<button class="([^"]*)"[^>]*? data-' + m[2] + '="([^"]*)"', 'g'))]
        .map(x => ({ dataset: { [camel]: x[2] }, classList: classList(x[1]) })));
    }
    return cache.get(key);
  }
  const document = stubNode({
    getElementById: getEl, querySelectorAll: qsa, querySelector: () => null,
    createElement: () => stubNode({ style: {}, dataset: {}, classList: classList() }),
    addEventListener: () => {}, body: stubNode(), head: stubNode(),
  });
  const mem = { savvy_session_demo: 'kept' };
  const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, clear: () => { events.push('storage.clear'); } };
  const rec = kind => function (u, o) { events.push(kind + ' ' + ((o && o.method) || 'GET')); return Promise.reject(new Error('network disabled in test')); };
  const locStore = { hostname: 'test.invalid', search: '', reload: () => events.push('location.reload'),
    assign: () => events.push('location.assign'), replace: () => events.push('location.replace') };
  const location = new Proxy(locStore, { get: (t, k) => (k === 'href' ? 'https://test.invalid/' : t[k]), set: (t, k, v) => { events.push('location.' + String(k) + '='); t[k] = v; return true; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document, localStorage, sessionStorage: localStorage, location,
    navigator: stubNode({ sendBeacon: rec('beacon'), userAgent: 'node-test' }),
    history: stubNode({ back: () => events.push('history.back'), go: () => events.push('history.go') }),
    fetch: rec('fetch'),
    XMLHttpRequest: function () { events.push('xhr'); return stubNode(); },
    WebSocket: function () { events.push('websocket'); return stubNode(); },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, scrollTo: () => {},
    alert() {}, confirm: () => false, prompt: () => null,
    indexedDB: stubNode(), Image: function () { return stubNode(); }, FileReader: function () { return stubNode(); },
    Blob: function () { return stubNode(); }, URL: stubNode(), atob: s => Buffer.from(s, 'base64').toString('binary'), btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Symbol, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  for (const g of extraGlobals) ctx[g] = stubNode();
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'app.js' });
  // Anything that would log out, reset the item, save, submit or upload is replaced by a recorder.
  for (const f of ['doLogout', 'savvyBorrarSesion', 'checkLogin', 'clSubmit', 'clSaveToSession', 'clSendToRegistroSheet',
    'clUploadAllPhotos', 'clUploadPhotoToImgBB', 'clExportEbayCSV', 'saveClBulkToStorage', 'clPrintLabel', 'clLookupBarcode', 'clLookupEbayURL']) {
    if (typeof ctx[f] === 'function') ctx[f] = function () { events.push('call ' + f); };
  }
  return { ctx, els, mem, getEl, run: code => vm.runInContext(code, ctx) };
}
function loadSandbox() {
  const extra = [];
  for (let i = 0; i < 40; i++) {
    try { return makeSandbox(extra); }
    catch (e) {
      const m = e && /^(\S+) is not defined$/.exec(String(e.message));
      if (!m || extra.includes(m[1])) throw e;
      extra.push(m[1]);
    }
  }
  throw new Error('too many undefined globals');
}

// ── run ─────────────────────────────────────────────────────
let S = null, loadErr = null;
try { S = loadSandbox(); } catch (e) { loadErr = e; }
events.length = 0;  // startup requests (blocked by the stub) are not part of the flows under test
const get = expr => S.run(expr);
const html = id => String(S.getEl(id).innerHTML || '');
const onScreen = id => S.getEl(id).classList.contains('on');
function runOnclick(code) {
  const btn = { classList: classList(), closest: () => ({ querySelectorAll: () => [] }), dataset: {} };
  S.ctx.__btn = btn;
  vm.runInContext('(function(){' + code.replace(/&quot;/g, '"') + '}).call(__btn)', S.ctx);
}
// Click a rendered <button> on a screen, found by its visible label.
function click(screenId, label) {
  const h = html(screenId);
  const re = new RegExp('<button class="[^"]*"[^>]*? onclick="([^"]*)"[^>]*>\\s*(?:<div[^>]*>[^<]*</div>\\s*)?(?:<div class="cond-lbl"[^>]*>)?' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<');
  const m = h.match(re);
  if (!m) throw new Error(`button "${label}" not found on ${screenId}`);
  runOnclick(m[1]);
}
const TYPE_LABEL = { clothing: 'Ropa', shoes: 'Zapatos' };
const GENDER_LABEL = { mens: "Men's", womens: "Women's", kids: 'Kids', unisex: 'Unisex' };
// Fresh item → type + gender → Continue → Item Info, with optional extra state.
function startItem(type, gender, state) {
  get('clRenderSKU()'); get('clGo(1)');
  click('cl-sku', TYPE_LABEL[type]);
  click('cl-sku', GENDER_LABEL[gender]);
  if (state) S.ctx.__state = state, get('Object.assign(cl, __state)');
  click('cl-sku', 'Continue →');
  if (get('cl.step') !== 2) throw new Error('did not reach Item Info');
}
function pressBack() {
  const m = html('cl-attr').match(/<button class="ag-btn" id="cl-attr-back-top" onclick="([^"]*)"[^>]*>← Regresar<\/button>/);
  if (!m) throw new Error('← Regresar not found on Item Info');
  runOnclick(m[1]);
}
function selOf(attr) {
  return S.ctx.document.querySelectorAll('#cl-sku [data-' + attr + ']').filter(b => b.classList.contains('sel')).map(b => Object.values(b.dataset)[0]);
}
// Item Info → Regresar → change type/gender → Continue; returns the resulting cl.
function roundTrip(type, gender, state, toType, toGender) {
  startItem(type, gender, state);
  pressBack();
  if (toType) click('cl-sku', TYPE_LABEL[toType]);
  if (toGender) click('cl-sku', GENDER_LABEL[toGender]);
  click('cl-sku', 'Continue →');
  return JSON.parse(get('JSON.stringify(cl)'));
}
function chips(listId) {
  const h = html('cl-attr'), i = h.indexOf('id="' + listId + '"');
  if (i < 0) return [];
  const block = h.slice(i, h.indexOf('</div>', i));
  return [...block.matchAll(/<button class="cl-chip[^"]*"[^>]*>([^<]*)<\/button>/g)].map(m => m[1]);
}

check(31, 'app.js parses (and inline <script> blocks in index.html)', () => {
  new vm.Script(APP, { filename: 'app.js' });
  [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach(m => new vm.Script(m[1]));
  if (loadErr) throw new Error('sandbox load failed: ' + loadErr.message);
  return true;
});
check(1, 'Item Info has a "← Regresar" button at the top', () => {
  startItem('clothing', 'mens');
  const h = html('cl-attr'), i = h.indexOf('← Regresar'), j = h.indexOf('id="brand-chips"');
  return { ok: i > 0 && j > 0 && i < j && /<button class="ag-btn" id="cl-attr-back-top"/.test(h), note: 'before BRAND: ' + (i > 0 && i < j) };
});
check(2, 'Regresar returns to the Item Type / Gender step', () => {
  startItem('shoes', 'womens'); pressBack();
  return get('cl.step') === 1 && onScreen('cl-sku') && !onScreen('cl-attr') && /ITEM TYPE/.test(html('cl-sku')) && /GENDER/.test(html('cl-sku'));
});
check(3, 'No page reload / navigation, and the item is not reset (same SKU, same in-progress item)', () => {
  startItem('clothing', 'womens', { color: 'Black', condition: 'GOOD', notes: 'n1' });
  S.ctx.__before = get('cl'); const sku = get('cl.sku'); const skuHtml = html('cl-sku'); events.length = 0;
  pressBack();
  return { ok: get('cl === __before') && get('cl.sku') === sku && html('cl-sku') === skuHtml && get('cl.color') === 'Black' && get('cl.condition') === 'GOOD' && get('cl.notes') === 'n1' && !events.some(e => /^location|^history/.test(e)), note: events.join(', ') };
});
check(4, 'No logout / session reset (login functions not called, stored session untouched)', () => {
  const snap = JSON.stringify(S.mem); events.length = 0;
  startItem('clothing', 'mens'); pressBack(); click('cl-sku', 'Continue →');
  return { ok: !events.some(e => /doLogout|savvyBorrarSesion|checkLogin|storage\.clear/.test(e)) && JSON.stringify(S.mem) === snap && S.mem.savvy_session_demo === 'kept', note: events.join(', ') };
});
check(5, 'No network call, save, submit, upload or write during Back / edit / Continue', () => {
  events.length = 0;
  roundTrip('clothing', 'mens', { brand: "Levi's", category: 'Jeans' }, 'shoes', 'womens');
  roundTrip('shoes', 'kids', { brand: 'HOKA', category: 'Boots', shoeWidth: 'Wide (D/W)' }, 'clothing');
  return { ok: events.length === 0, note: events.join(', ') || 'none' };
});
check(6, 'Current type is shown selected after Regresar', () => {
  startItem('shoes', 'mens'); S.ctx.document.querySelectorAll('#cl-sku [data-cl-type]').forEach(b => b.classList.remove('sel'));
  pressBack(); const a = selOf('cl-type');
  startItem('clothing', 'mens'); pressBack(); const b = selOf('cl-type');
  return { ok: a.join() === 'shoes' && b.join() === 'clothing', note: a + ' / ' + b };
});
check(7, 'Current gender is shown selected after Regresar', () => {
  startItem('clothing', 'kids'); S.ctx.document.querySelectorAll('#cl-sku [data-cl-gender]').forEach(b => b.classList.add('sel'));
  pressBack(); const a = selOf('cl-gender');
  return { ok: a.join() === 'kids' && get('cl.gender') === 'kids', note: a.join() };
});
check(8, 'Ropa -> Zapatos after Regresar (Item Info then shows shoe categories/brands/width)', () => {
  const c = roundTrip('clothing', 'mens', {}, 'shoes');
  return c.type === 'shoes' && chips('cat-chips').includes('Sneakers') && !chips('cat-chips').includes('Jeans') &&
    JSON.stringify(chips('brand-chips')) === JSON.stringify(EXPECTED_SHOE_BRANDS) && /id="shoewidth-sect" style="display:block"/.test(html('cl-attr'));
});
check(9, 'Zapatos -> Ropa after Regresar (Item Info then shows clothing categories/brands, no width)', () => {
  const c = roundTrip('shoes', 'womens', {}, 'clothing');
  return c.type === 'clothing' && chips('cat-chips').includes('Jeans') && !chips('cat-chips').includes('Sneakers') &&
    JSON.stringify(chips('brand-chips')) === JSON.stringify(Array.from(get('CL_BRANDS'))) && /id="shoewidth-sect" style="display:none"/.test(html('cl-attr'));
});
check(10, 'Gender can be changed after Regresar', () => {
  const c = roundTrip('clothing', 'mens', { brand: 'Nike', category: 'Hoodie', size: 'M' }, null, 'womens');
  return c.gender === 'womens' && c.brand === 'Nike' && c.category === 'Hoodie' && c.size === 'M';
});
check(11, 'Nike survives Ropa -> Regresar -> Zapatos', () => roundTrip('clothing', 'mens', { brand: 'Nike' }, 'shoes').brand === 'Nike');
check(12, "Levi's is cleared Ropa -> Regresar -> Zapatos", () => { const c = roundTrip('clothing', 'mens', { brand: "Levi's", brandCustom: "Levi's" }, 'shoes'); return c.brand === '' && c.brandCustom === ''; });
check(13, 'HOKA is cleared Zapatos -> Regresar -> Ropa', () => roundTrip('shoes', 'mens', { brand: 'HOKA' }, 'clothing').brand === '');
check(14, 'No replacement brand is auto-selected (every brand, both directions)', () => {
  const clothing = Array.from(get('CL_BRANDS'));
  for (const [from, to] of [['clothing', 'shoes'], ['shoes', 'clothing']]) {
    const dest = to === 'shoes' ? EXPECTED_SHOE_BRANDS : clothing;
    for (const b of [...new Set(clothing.concat(EXPECTED_SHOE_BRANDS))]) {
      const c = roundTrip(from, 'mens', { brand: b }, to);
      if (c.brand !== (dest.includes(b) ? b : '')) throw new Error(`${b} ${from}->${to} gave '${c.brand}'`);
    }
  }
  return true;
});
check(15, 'CL_SHOE_BRANDS is exactly the approved 34 values', () => JSON.stringify(Array.from(get('CL_SHOE_BRANDS'))) === JSON.stringify(EXPECTED_SHOE_BRANDS));
check(16, 'CL_BRANDS source unchanged', () => { const d = declSource(APP, 'CL_BRANDS'); return d.length === 1 && d[0] === BASE_CL_BRANDS_SRC; });
check(17, 'Shoe category cannot leak into Clothing (shared "Other" kept)', () => {
  const a = roundTrip('shoes', 'mens', { category: 'Boots' }, 'clothing'), b = roundTrip('shoes', 'mens', { category: 'Other' }, 'clothing');
  return { ok: a.category === '' && b.category === 'Other', note: `Boots→'${a.category}', Other→'${b.category}'` };
});
check(18, 'Clothing category (and its category-only fields) cannot leak into Shoes', () => {
  const a = roundTrip('clothing', 'womens', { category: 'Jeans', inseam: '32"', style: 'Skinny' }, 'shoes');
  const b = roundTrip('clothing', 'womens', { category: 'Dress', dressLength: 'Midi' }, 'shoes');
  const c = roundTrip('clothing', 'mens', { category: 'Jacket', outerMaterial: 'Wool' }, 'shoes');
  const d = roundTrip('clothing', 'womens', { category: 'Swimwear', swimStyle: 'Bikini' }, 'shoes');
  const e = roundTrip('clothing', 'mens', { category: 'Activewear Top', activity: 'Running' }, 'shoes');
  return a.category === '' && a.inseam === '' && a.style === 'Skinny' && b.category === '' && b.dressLength === '' &&
    c.outerMaterial === '' && d.swimStyle === '' && e.activity === '' && roundTrip('clothing', 'mens', { category: 'Other' }, 'shoes').category === 'Other';
});
check(19, 'Invalid size cannot leak across type/gender changes (valid sizes kept, never substituted)', () => {
  const r = [
    [roundTrip('clothing', 'mens', { size: 'M' }, 'shoes').size, ''],
    [roundTrip('clothing', 'mens', { size: '32' }, 'shoes').size, ''],
    [roundTrip('shoes', 'mens', { size: '10' }, 'clothing').size, ''],
    [roundTrip('shoes', 'kids', { size: '3Y' }, 'clothing').size, ''],
    [roundTrip('shoes', 'mens', { size: '10' }, null, 'kids').size, ''],
    [roundTrip('shoes', 'kids', { size: '3Y' }, null, 'womens').size, ''],
    [roundTrip('shoes', 'mens', { size: '9.5' }, null, 'womens').size, '9.5'],
    [roundTrip('clothing', 'mens', { size: 'XL' }, null, 'womens').size, 'XL'],
    [roundTrip('clothing', 'mens', { size: 'M' }, 'clothing').size, 'M'],
  ];
  const bad = r.map((x, i) => x[0] === x[1] ? null : `#${i}:'${x[0]}'≠'${x[1]}'`).filter(Boolean);
  return { ok: bad.length === 0, note: bad.join(' ') };
});
check(20, 'Shoe width cannot remain as an active Clothing value (kept within Shoes)', () => {
  const a = roundTrip('shoes', 'mens', { shoeWidth: 'Wide (D/W)' }, 'clothing');
  const b = roundTrip('shoes', 'mens', { shoeWidth: 'Wide (D/W)' }, null, 'womens');
  return { ok: !a.shoeWidth && b.shoeWidth === 'Wide (D/W)' && !/C:Width|Width=/.test(get('clBuildAspects()')), note: `→Ropa '${a.shoeWidth || ''}', gender-only '${b.shoeWidth}'` };
});
check(21, 'Incompatible defects / aspects cannot leak (shared defects and values kept)', () => {
  const shoeOnly = Array.from(get('CL_SHOE_DEFECTS')).filter(d => !Array.from(get('CL_DEFECTS')).includes(d));
  const clothOnly = Array.from(get('CL_DEFECTS')).filter(d => !Array.from(get('CL_SHOE_DEFECTS')).includes(d));
  const a = roundTrip('shoes', 'mens', { defects: [shoeOnly[0], 'Other'], color: 'Black', condition: 'GOOD' }, 'clothing');
  const b = roundTrip('clothing', 'mens', { defects: [clothOnly[0], 'Other'], category: 'Jeans', inseam: '30"' }, 'shoes');
  const aspects = get('clBuildAspects()'), title = get('buildClothingTitle()');
  return { ok: shoeOnly.length > 0 && clothOnly.length > 0 && JSON.stringify(a.defects) === '["Other"]' && a.color === 'Black' && a.condition === 'GOOD' &&
    JSON.stringify(b.defects) === '["Other"]' && /Type=Shoes/.test(aspects) && !/Jeans/.test(aspects) && !/Inseam|Jeans/.test(title), note: 'aspects ' + aspects };
});
check(22, 'Continue returns to Item Info after editing type/gender (same item, same SKU)', () => {
  startItem('clothing', 'mens', { brand: 'Nike' }); const sku = get('cl.sku'); S.ctx.__item = get('cl');
  pressBack(); click('cl-sku', 'Zapatos'); click('cl-sku', 'Kids'); click('cl-sku', 'Continue →');
  return get('cl.step') === 2 && onScreen('cl-attr') && !onScreen('cl-sku') && get('cl === __item') && get('cl.sku') === sku &&
    get('cl.type') === 'shoes' && get('cl.gender') === 'kids' && /id="brand-chips"/.test(html('cl-attr')) && chips('brand-chips').includes('HOKA');
});
const G = (id, name, key) => check(id, name, () => {
  if (!(key in BASE_GROUP_SHA)) return { ok: false, note: 'no baseline hash' };
  return groupSha(revertItemInfoBack(APP), GROUPS[key]) === BASE_GROUP_SHA[key];
});
G(23, 'SKU generation unchanged vs 9af8830', 'sku');
G(24, 'Title generation unchanged vs 9af8830', 'title');
G(25, 'Description generation unchanged vs 9af8830', 'description');
G(26, 'Photo code unchanged vs 9af8830', 'photo');
G(27, 'Sheets / write code unchanged vs 9af8830', 'sheets');
G(28, 'eBay code unchanged vs 9af8830', 'ebay');
check(29, 'API hosts unchanged vs 9af8830', () => sha(hostsOf(APP + HTML).join('\n')) === BASE_HOSTS_SHA && groupSha(revertItemInfoBack(APP), GROUPS.api) === BASE_GROUP_SHA.api);
check(30, 'TEST PREVIEW badge present in index.html', () => /<div id="env-preview-badge"[^>]*pointer-events:none[^>]*>🧪 TEST PREVIEW — CLOTHING &amp; SHOES<\/div>/.test(HTML));
G('login', 'Login/session code unchanged vs 9af8830', 'login');
G('nav', 'clGo / Step 2 validation / setters / size wheel unchanged vs 9af8830', 'navigation');
check('scope', 'Outside the Back-button feature edits, app.js is byte-identical to 9af8830', () => sha(revertItemInfoBack(APP)) === BASE_APP_SHA);

if (process.env.PRINT_BASELINE) {
  const g = {}; for (const k of Object.keys(GROUPS)) g[k] = groupSha(APP, GROUPS[k]);
  console.log(JSON.stringify({ app: sha(APP), groups: g, hosts: sha(hostsOf(APP + HTML).join('\n')) }, null, 1));
  process.exit(0);
}
results.sort((a, b) => (typeof a.id === 'number' ? a.id : 99) - (typeof b.id === 'number' ? b.id : 99));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.id}] ${r.name}${r.note ? '  (' + r.note + ')' : ''}`);
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails} passed, ${fails} failed  —  ${path.relative(process.cwd(), appPath) || appPath}`);
process.exit(fails ? 1 : 0);
