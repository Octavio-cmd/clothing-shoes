#!/usr/bin/env node
// Shoe-specific brand list (CL_SHOE_BRANDS) — focused permanent test.
//
//   node tests/shoe-brands.test.js [path/to/app.js] [path/to/index.html]
//
// Defaults to the app.js / index.html next to this folder. Runs fully offline:
// app.js is loaded in a Node vm sandbox with a stub DOM; fetch / XHR / beacon /
// WebSocket are replaced by recorders, so nothing is saved, uploaded or sent.
// "Unchanged" checks compare against baseline 2c9d66c (hashes embedded below).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const appPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app.js'));
const htmlPath = path.resolve(process.argv[3] || path.join(path.dirname(appPath), 'index.html'));
const APP = fs.readFileSync(appPath, 'utf8');
const HTML = fs.readFileSync(htmlPath, 'utf8');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// ── Baseline 2c9d66c reference data ──────────────────────────
const BASE_APP_SHA = '6e768e61ccff1f99e3d0d6078b694634952572a9901a737545b36cdc625d77cb';
const BASE_CL_BRANDS_SRC = "const CL_BRANDS = ['Nike','Adidas','Under Armour','Champion','Puma','Reebok','New Balance',\n" +
  "  'Levi\\'s','Wrangler','Lee','Gap','Old Navy','H&M','Zara','Forever 21','American Eagle',\n" +
  "  'Hollister','Abercrombie','Calvin Klein','Tommy Hilfiger','Ralph Lauren','Polo Ralph Lauren','Lauren Ralph Lauren','Nautica',\n" +
  "  'Columbia','North Face','Carhartt','Patagonia','Carter\\'s','OshKosh','Other'];";
const BASE_GROUP_SHA = {
  categories: 'cbee2e5cd80b4a01f91fcfd15c1f608555404f8a15f5f24a2f9cd12f97bfaba9',
  sizes: '0fbc62da633f6ab0f5b35128384502df09958205c1e9b70308997fa2b1c8f714',
  width: 'a36321eec01d12b91e0684a405b59363f9efc73416f62249790d4e165800302b',
  defects: '16fc053acdb2fe7df3ae029ab208ee0bc71a2307e9528b2dead44f2726bc1655',
  sku: 'e24e8862301c0a8b1ca800516412ecb641513808636069c0b3cfd48b2c325026',
  title: 'c51da7c9105cc6624b875b8eb8ad2edca74cd63ebe6a3a39727a0c9a3e0b7083',
  description: '1d4f637091303e01a1dd5cc3e19db72fb4fe45ba28b93e9425a19bf3ec2200f9',
  photo: '872a3c85ecb344c512d363fb8c879da8dd4f38cae543ead7850cb2933b324903',
  sheets: 'ad47202565308c4f2c6a81cc7dca6b1dac5528f45ce9bf0ccf845013c049c848',
  ebay: '010461ff1e64e2651fb847570df6c0a5a7d21d28bdb8f62cbb7badb44bf64849',
  api: '529b3673938a541504f2ff5b744996a5f3117ae2e9ca42fa8da8b411363598d4',
};
const BASE_HOSTS_SHA = '549d74c74d8ea58265b55fdb71670568155ea4e68f679deeb07e50f6f5b848bf';

const EXPECTED_SHOE_BRANDS = ['Nike', 'Jordan', 'Adidas', 'New Balance', 'Skechers', 'Puma', 'Reebok', 'Under Armour',
  'ASICS', 'HOKA', 'On', 'Brooks', 'Saucony', 'Converse', 'Vans', 'Fila', 'Crocs', 'UGG', 'Timberland', 'Birkenstock',
  'Merrell', 'Salomon', 'K-Swiss', 'Keds', 'Mizuno', 'Havaianas', 'Steve Madden', 'Michael Kors', 'Clarks',
  'Dr. Martens', 'Cole Haan', 'Hey Dude', 'Ariat', 'Other'];
const CLOTHING_ONLY = ["Levi's", 'Wrangler', 'Lee', 'Gap', 'Old Navy', 'H&M', 'Zara', 'Forever 21', "Carter's", 'OshKosh'];

// Areas that must stay byte-identical to the baseline (top-level declarations).
const GROUPS = {
  categories: ['CL_SHOE_CATS', 'CL_CATS', 'clSetCat'],
  sizes: ['CL_SHOE_SIZES_US', 'CL_SHOE_SIZES_KIDS', 'CL_SIZES_SHOES', 'clInitSizeWheel', 'clSizeType'],
  width: ['clSetShoeWidth', 'clBuildAspects'],
  defects: ['CL_SHOE_DEFECTS', 'CL_DEFECTS', 'clRenderDefects', 'clToggleDefect', 'clSaveDefects'],
  sku: ['clGenSKU', 'clAutoSKU', 'clUpdateSKUDisplay', 'makeSKU'],
  title: ['clGeneratePreviewTitle', 'clGenerateEbayTitle', 'buildClothingTitle', 'clPrintLabel'],
  description: ['buildClothingDescHTML', 'buildClothingDesc', 'clCondText', 'clCondShort'],
  photo: ['PHOTO_SLOTS', 'clRenderPhotos', 'applyWhiteSquare', 'clTakePhoto', 'clCompressImage', 'clRemoveBackground',
    'removeBackgroundPixian', 'clUploadPhotoToImgBB', 'clUploadAllPhotos', 'clSaveImgbbKey', 'clTestImgbbKey',
    'openIndexedDB', 'saveToIndexedDB', 'getFromIndexedDB'],
  sheets: ['clSubmit', 'clSendToRegistroSheet', 'clSaveToSession', 'saveSheetsUrl', 'saveDriveUrl',
    'clExportEbayCSV', 'clShowExportOptions', 'clShowCsvFallback'],
  ebay: ['clLookupBarcode', 'clLookupEbayURL', 'clBuildEbayRow', 'clBuildEbayCategory', 'clGetEbayCategoryId',
    'clGetConditionId', 'clDept', 'CL_SHIP_POLICY', 'CL_RET_POLICY', 'CL_PAY_POLICY'],
  api: ['SAVVY_API', 'savvyToken', 'savvyClaude'],
};

// ── helpers ──────────────────────────────────────────────────
const results = [];
function check(id, name, fn) {
  let ok = false, note = '';
  try { const r = fn(); ok = r === true || (r && r.ok === true); if (r && r.note) note = r.note; }
  catch (e) { note = e.message; }
  results.push({ id, name, ok, note });
}

// Source of every top-level declaration called `name` (function or const), in file order.
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

// Undo the three sanctioned edits; everything else must then equal the baseline byte-for-byte.
function stripFeature(src) {
  return src
    .replace(/\n\/\/ Marcas de zapatos[^\n]*\nconst CL_SHOE_BRANDS = [\s\S]*?\nfunction clSetType\(type\) \{\n[\s\S]*?\n\}\n/, () => '')
    .replace("onclick=\"clSetType('${t.id}');", () => "onclick=\"cl.type='${t.id}';")
    .replace('${clBrandsForType(cl.type).map(b=>`<button class="cl-chip', () => '${CL_BRANDS.map(b=>`<button class="cl-chip')
    .replace("'<div class=\"cl-chips\">' + clBrandsForType(cl.type).map(function(b) {", () => "'<div class=\"cl-chips\">' + CL_BRANDS.map(function(b) {");
}

// ── sandbox (stub DOM, no network) ───────────────────────────
const net = [];
function makeSandbox(extraGlobals) {
  const els = new Map();
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
      set(t, k, v) { store[k] = v; return true; },
      apply() { return stubNode(); },
      construct() { return stubNode(); },
    });
  }
  const document = stubNode({
    getElementById: id => { if (!els.has(id)) els.set(id, stubNode({ id, style: {}, dataset: {} })); return els.get(id); },
    querySelectorAll: () => [], querySelector: () => null,
    createElement: () => stubNode({ style: {}, dataset: {} }),
    addEventListener: () => {}, body: stubNode(), head: stubNode(),
  });
  const mem = {};
  const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, clear: () => {} };
  const rec = kind => function (u, o) { net.push(kind + ' ' + ((o && o.method) || 'GET')); return Promise.reject(new Error('network disabled in test')); };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document, localStorage, sessionStorage: localStorage,
    navigator: stubNode({ sendBeacon: rec('beacon'), userAgent: 'node-test' }),
    location: stubNode({ href: 'https://test.invalid/', hostname: 'test.invalid', search: '' }),
    fetch: rec('fetch'),
    XMLHttpRequest: function () { net.push('xhr'); return stubNode(); },
    WebSocket: function () { net.push('websocket'); return stubNode(); },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
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
  return { ctx, els, run: code => vm.runInContext(code, ctx) };
}
// Globals provided by third-party <script src> tags (e.g. html5-qrcode) are stubbed on demand.
function loadSandbox() {
  const extra = [];
  for (let i = 0; i < 40; i++) {
    net.length = 0;
    try { return makeSandbox(extra); }
    catch (e) {
      const m = e && /^(\S+) is not defined$/.exec(String(e.message));
      if (!m || extra.includes(m[1])) throw e;
      extra.push(m[1]);
    }
  }
  throw new Error('too many undefined globals');
}
function chipsIn(html, afterMarker) {
  const s = afterMarker ? html.slice(html.indexOf(afterMarker)) : html;
  const block = afterMarker ? s.slice(0, s.indexOf('</div>')) : s;
  return [...block.matchAll(/class="cl-chip[^"]*" data-b="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"'));
}

// ── run ─────────────────────────────────────────────────────
let S = null, loadErr = null;
try { S = loadSandbox(); } catch (e) { loadErr = e; }
const loadNet = net.splice(0);  // requests app.js attempts at startup (all blocked by the stub)
const get = expr => S.run(expr);
const shoeBrands = () => get('CL_SHOE_BRANDS');
function renderAttrChips(type) {
  get(`cl.type = ${JSON.stringify(type)}; cl.brand = ''`);
  try { get('clRenderAttr()'); } catch (e) { /* follow-up UI wiring may need a real DOM; the chip HTML is already set */ }
  return chipsIn(S.els.get('cl-attr').innerHTML, 'id="brand-chips"');
}
function renderSheetChips(type) {
  get(`cl.type = ${JSON.stringify(type)}; cl.brand = ''`);
  try { get("clOpenSheet('brand')"); } catch (e) { }
  return chipsIn(S.els.get('cl-sheet-body').innerHTML);
}
// Click the real ITEM TYPE button (the onclick attribute rendered by clRenderSKU).
function clickType(toType) {
  const saved = get('JSON.stringify(cl)');
  try { get('clRenderSKU()'); } catch (e) { }
  const html = S.els.get('cl-sku').innerHTML;
  get('cl = ' + saved);
  const m = html.match(new RegExp('<button class="cl-cond-btn[^"]*"(?: data-[\\w-]+="[^"]*")* onclick="([^"]*)"[^>]*>\\s*<div[^>]*>[^<]*</div>\\s*<div class="cond-lbl"[^>]*>' + (toType === 'shoes' ? 'Zapatos' : 'Ropa') + '<'));
  if (!m) throw new Error('type button not found');
  const btn = { classList: { add() {}, remove() {} }, closest: () => ({ querySelectorAll: () => [] }) };
  S.ctx.__btn = btn;
  vm.runInContext('(function(){' + m[1].replace(/&quot;/g, '"') + '}).call(__btn)', S.ctx);
}
function switchCase(from, to, brand, custom) {
  get(`cl.type = ${JSON.stringify(from)}; cl.brand = ${JSON.stringify(brand)}; cl.brandCustom = ${JSON.stringify(custom || '')}`);
  clickType(to);
  return { type: get('cl.type'), brand: get('cl.brand'), brandCustom: get('cl.brandCustom') };
}

// Later approved Preview features are reverted first so this guard still pins the rest of app.js to 2c9d66c.
const baseApp = stripFeature(require('./lib/revert-item-info-back.js')(APP));

check(27, 'app.js parses (and inline <script> blocks in index.html)', () => {
  new vm.Script(APP, { filename: 'app.js' });
  [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach(m => new vm.Script(m[1]));
  if (loadErr) throw new Error('sandbox load failed: ' + loadErr.message);
  return true;
});
check(1, 'CL_SHOE_BRANDS exists', () => /^const CL_SHOE_BRANDS = \[/m.test(APP) && Array.isArray(shoeBrands()));
check(2, 'CL_SHOE_BRANDS has exactly the 34 approved values, in order', () => {
  const a = shoeBrands(); return { ok: JSON.stringify(Array.from(a)) === JSON.stringify(EXPECTED_SHOE_BRANDS), note: a.length + ' values' };
});
check(3, 'CL_SHOE_BRANDS has no duplicates', () => new Set(shoeBrands()).size === shoeBrands().length);
check(4, '"Other" is the last CL_SHOE_BRANDS option (and appears once)', () => { const a = shoeBrands(); return a[a.length - 1] === 'Other' && a.indexOf('Other') === a.length - 1; });
check(5, 'CL_BRANDS source is byte-identical to baseline 2c9d66c', () => {
  const d = declSource(APP, 'CL_BRANDS');
  return { ok: d.length === 1 && d[0] === BASE_CL_BRANDS_SRC && get('CL_BRANDS').length === 31, note: get('CL_BRANDS').length + ' values' };
});
check(6, 'Clothing renders CL_BRANDS (Item Info chips + review edit sheet)', () => {
  const want = JSON.stringify(Array.from(get('CL_BRANDS')));
  return JSON.stringify(renderAttrChips('clothing')) === want && JSON.stringify(renderSheetChips('clothing')) === want;
});
check(7, 'Shoes renders CL_SHOE_BRANDS (Item Info chips + review edit sheet)', () => {
  const want = JSON.stringify(EXPECTED_SHOE_BRANDS);
  return JSON.stringify(renderAttrChips('shoes')) === want && JSON.stringify(renderSheetChips('shoes')) === want;
});
check(8, 'Clothing-only brands do not appear in Shoes', () => {
  const a = renderAttrChips('shoes'), b = renderSheetChips('shoes');
  const clothingOnly = Array.from(get('CL_BRANDS')).filter(x => !EXPECTED_SHOE_BRANDS.includes(x));
  return a.length > 0 && CLOTHING_ONLY.concat(clothingOnly).every(x => !a.includes(x) && !b.includes(x));
});
check(9, 'Shoe-only brands appear in Shoes', () => {
  const shoeOnly = EXPECTED_SHOE_BRANDS.filter(x => !Array.from(get('CL_BRANDS')).includes(x));
  const a = renderAttrChips('shoes'), b = renderSheetChips('shoes');
  return shoeOnly.length > 0 && shoeOnly.every(x => a.includes(x) && b.includes(x)) && !renderAttrChips('clothing').includes('HOKA');
});
check(10, 'Shared brand (Nike) survives Clothing -> Shoes and Shoes -> Clothing', () => {
  const a = switchCase('clothing', 'shoes', 'Nike'), b = switchCase('shoes', 'clothing', 'Nike');
  return a.type === 'shoes' && a.brand === 'Nike' && b.type === 'clothing' && b.brand === 'Nike';
});
check(11, "Levi's (clothing) -> Shoes clears the brand", () => {
  const r = switchCase('clothing', 'shoes', "Levi's", "Levi's"); return r.type === 'shoes' && r.brand === '' && r.brandCustom === '';
});
check(12, 'HOKA (shoes) -> Clothing clears the brand (HOKA not in CL_BRANDS)', () => {
  if (Array.from(get('CL_BRANDS')).includes('HOKA')) return { ok: false, note: 'HOKA unexpectedly in CL_BRANDS' };
  const r = switchCase('shoes', 'clothing', 'HOKA'); return r.type === 'clothing' && r.brand === '';
});
check(13, 'Type switch never auto-picks another brand (every brand, both directions, incl. none/Other)', () => {
  const all = [...new Set(Array.from(get('CL_BRANDS')).concat(EXPECTED_SHOE_BRANDS))];
  for (const [from, to] of [['clothing', 'shoes'], ['shoes', 'clothing'], ['shoes', 'shoes'], ['clothing', 'clothing']]) {
    const dest = to === 'shoes' ? EXPECTED_SHOE_BRANDS : Array.from(get('CL_BRANDS'));
    for (const b of all) {
      const r = switchCase(from, to, b);
      if (r.brand !== b && r.brand !== '') throw new Error(`${b} ${from}->${to} became ${r.brand}`);
      if (r.brand !== (dest.includes(b) ? b : '')) throw new Error(`${b} ${from}->${to} gave '${r.brand}'`);
    }
    const none = switchCase(from, to, '');
    if (none.brand !== '') throw new Error('empty brand became ' + none.brand);
    const oth = switchCase(from, to, 'Other', 'Some Custom');
    if (oth.brand !== 'Other' || oth.brandCustom !== 'Some Custom') throw new Error('Other/custom not preserved');
  }
  return true;
});
check(14, 'Brand output keeps the existing `brand` field (no shoe_brand/footwear_brand)', () => {
  if (/shoe_?brand|footwear_?brand/i.test(APP.replace(/CL_SHOE_BRANDS/g, ''))) return { ok: false, note: 'new brand field found' };
  get("cl.type = 'shoes'; cl.brand = ''");
  try { get("clSetBrand('HOKA')"); } catch (e) { }
  const keys = Object.keys(get('cl')).filter(k => /brand/i.test(k)).sort().join(',');
  return { ok: get('cl.brand') === 'HOKA' && keys === 'brand,brandCustom' && /^let cl = \{\n[^\n]*brand:'', brandCustom:''/m.test(APP), note: 'cl keys: ' + keys };
});
const G = (id, name, key) => check(id, name, () => {
  if (!(key in BASE_GROUP_SHA)) return { ok: false, note: 'no baseline hash' };
  return groupSha(baseApp, GROUPS[key]) === BASE_GROUP_SHA[key];
});
G(15, 'Shoe category logic unchanged vs 2c9d66c', 'categories');
G(16, 'Shoe size logic unchanged vs 2c9d66c', 'sizes');
G(17, 'Shoe width logic unchanged vs 2c9d66c', 'width');
G(18, 'Shoe defects unchanged vs 2c9d66c', 'defects');
G(19, 'SKU generation unchanged vs 2c9d66c (uses cl.brand as before)', 'sku');
G(20, 'Title generation unchanged vs 2c9d66c', 'title');
G(21, 'Description generation unchanged vs 2c9d66c', 'description');
G(22, 'Photo/image code unchanged vs 2c9d66c', 'photo');
G(23, 'Google Sheets / write code unchanged vs 2c9d66c', 'sheets');
G(24, 'eBay code unchanged vs 2c9d66c', 'ebay');
check(25, 'API hosts unchanged vs 2c9d66c', () => sha(hostsOf(APP + HTML).join('\n')) === BASE_HOSTS_SHA && groupSha(baseApp, GROUPS.api) === BASE_GROUP_SHA.api);
// Employee app (clothing-shoes): the TEST PREVIEW badge must NOT be present (it exists only in clothing-shoes-preview).
check(26, 'Employee app: no TEST PREVIEW badge / marker in index.html or app.js', () => !/env-preview-badge|TEST PREVIEW/.test(HTML + APP));
check('scope', 'Outside the 3 sanctioned edits, app.js is byte-identical to 2c9d66c', () => sha(baseApp) === BASE_APP_SHA);
check('offline', 'Brand/type flows make no network call; nothing leaves the sandbox (startup requests blocked by stub)', () => ({ ok: net.length === 0 && loadNet.every(x => / GET$/.test(x)), note: 'startup blocked: ' + (loadNet.join(', ') || 'none') + '; during flows: ' + (net.join(', ') || 'none') }));

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
