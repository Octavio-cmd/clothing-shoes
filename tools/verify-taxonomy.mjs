#!/usr/bin/env node
// ---------------------------------------------------------------------------
// verify-taxonomy.mjs — revalida taxonomy/ebay-us-v134.json contra los JSON
// oficiales. No escribe nada. Sale con codigo 1 si algo falla.
//
//   node tools/verify-taxonomy.mjs --src <dir-json-oficiales>
// ---------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const src  = args[args.indexOf('--src') + 1];
if (!args.includes('--src') || !src || !existsSync(src)) {
  console.error('uso: node tools/verify-taxonomy.mjs --src <dir-json-oficiales>');
  process.exit(2);
}

const D = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const arbol = JSON.parse(readFileSync(join(src, '02-category-tree-completo.json'), 'utf8'));

const idx = new Map();
(function walk(n, ruta) {
  const r = [...ruta, n.category.categoryName];
  idx.set(n.category.categoryId, { ruta: r.slice(1).join(' > '), hoja: n.leafCategoryTreeNode === true });
  for (const h of n.childCategoryTreeNodes || []) walk(h, r);
})(arbol.rootCategoryNode, []);

let fallos = 0, n = 0;
const P = (ok, etiqueta, detalle = '') => {
  n++; if (!ok) fallos++;
  console.log(`${ok ? 'PASA' : 'FALLA'}  ${etiqueta}${detalle ? '   ' + detalle : ''}`);
};
const valores = (a) => a.v || D.listas[a.ref] || [];
const oficialesDe = (cid) => JSON.parse(readFileSync(join(src, `04-aspectos-${cid}.json`), 'utf8')).aspects || [];

// 1 — sello de version
P(D.categoryTreeId === arbol.categoryTreeId && D.categoryTreeVersion === arbol.categoryTreeVersion,
  'sello de version coincide con la fuente', `${D.categoryTreeId}/v${D.categoryTreeVersion}`);
P(D.marketplace === 'EBAY_US', 'marketplace', D.marketplace);

// 2 — todo ID existe y es hoja
const ids = Object.keys(D.categorias);
P(ids.every((c) => idx.has(c)), 'todos los category ID existen en el arbol v134', `${ids.length} categorias`);
const noHoja = ids.filter((c) => !idx.get(c)?.hoja);
P(noHoja.length === 0, 'todos son leaf categories', noHoja.length ? 'no-hoja: ' + noHoja : `${ids.length}/${ids.length}`);

// 3 — la ruta guardada es la real
const rutaMala = ids.filter((c) => D.categorias[c].ruta !== idx.get(c).ruta);
P(rutaMala.length === 0, 'la ruta guardada coincide con la oficial', rutaMala.length ? String(rutaMala) : '');

// 4 — cada aspecto y cada valor viene de los JSON oficiales
let aspTot = 0, valTot = 0;
const aspMal = [], valMal = [];
for (const cid of ids) {
  const f = join(src, `04-aspectos-${cid}.json`);
  if (!existsSync(f)) { aspMal.push(`${cid}: sin archivo`); continue; }
  const of = new Map();
  for (const a of JSON.parse(readFileSync(f, 'utf8')).aspects || [])
    of.set(a.localizedAspectName, {
      r: a.aspectConstraint?.aspectRequired === true ? 1 : 0,
      v: new Set((a.aspectValues || []).map((x) => x.localizedValue)),
    });
  for (const [nom, a] of Object.entries(D.categorias[cid].a)) {
    aspTot++;
    const o = of.get(nom);
    if (!o) { aspMal.push(`${cid}/${nom}: no existe en el oficial`); continue; }
    if (o.r !== a.r) aspMal.push(`${cid}/${nom}: obligatoriedad distinta`);
    if (a.nv !== o.v.size) aspMal.push(`${cid}/${nom}: nv=${a.nv} pero el oficial tiene ${o.v.size}`);
    if (a.abierto) continue;                 // sin lista incrustada, nv ya verificado
    for (const v of valores(a)) { valTot++; if (!o.v.has(v)) valMal.push(`${cid}/${nom}: valor inventado "${v}"`); }
  }
}
P(aspMal.length === 0, 'cada aspecto existe con la misma obligatoriedad y el mismo nv', `${aspTot} aspectos` + (aspMal.length ? ' | ' + aspMal.slice(0, 5) : ''));
P(valMal.length === 0, 'cada valor proviene de los JSON oficiales', `${valTot} valores` + (valMal.length ? ' | ' + valMal.slice(0, 5) : ''));

// 4b — cobertura de obligatorios: el derivado los tiene TODOS, sin excepcion
const reqOficial = new Set(), reqDerivado = new Set();
const omitidos = [];
for (const cid of ids) {
  const enDerivado = D.categorias[cid].a;
  for (const a of oficialesDe(cid)) {
    if (a.aspectConstraint?.aspectRequired !== true) continue;
    const nom = a.localizedAspectName;
    reqOficial.add(nom);
    if (!enDerivado[nom])      omitidos.push(`${cid}/${nom}`);
    else if (!enDerivado[nom].r) omitidos.push(`${cid}/${nom}: guardado como opcional`);
  }
  for (const [nom, a] of Object.entries(enDerivado)) if (a.r) reqDerivado.add(nom);
}
const soloOficial = [...reqOficial].filter((x) => !reqDerivado.has(x));
const soloDerivado = [...reqDerivado].filter((x) => !reqOficial.has(x));
P(soloOficial.length === 0 && soloDerivado.length === 0,
  'el conjunto de obligatorios coincide EXACTAMENTE con el oficial',
  `${reqOficial.size} nombres` + (soloOficial.length ? ' | falta: ' + soloOficial : '') + (soloDerivado.length ? ' | sobra: ' + soloDerivado : ''));
P(omitidos.length === 0,
  'ningun aspecto obligatorio fue omitido en ninguna categoria',
  omitidos.length ? String(omitidos.slice(0, 5)) : `revisadas ${ids.length} categorias`);
P(JSON.stringify([...reqOficial].sort()) === JSON.stringify(D.aspectosObligatorios),
  'aspectosObligatorios declarado en el archivo es exacto', D.aspectosObligatorios.join(', '));

// 4c — aspectos abiertos: declarados, contados y solo por tamano + FREE_TEXT
const abiertos = new Set();
for (const cid of ids)
  for (const [nom, a] of Object.entries(D.categorias[cid].a)) if (a.abierto) abiertos.add(nom);
P(JSON.stringify([...abiertos].sort()) === JSON.stringify(D.aspectosAbiertos),
  'aspectosAbiertos declarado coincide con el contenido', D.aspectosAbiertos.join(', ') || 'ninguno');
const abiertoMal = [];
for (const cid of ids)
  for (const [nom, a] of Object.entries(D.categorias[cid].a)) {
    if (a.abierto && (a.m !== 'txt' || a.v)) abiertoMal.push(`${cid}/${nom}`);
    if (!a.abierto && a.nv > 400 && a.m === 'txt') abiertoMal.push(`${cid}/${nom}: deberia ser abierto`);
  }
P(abiertoMal.length === 0, 'todo aspecto abierto es FREE_TEXT, sin lista, y nada mas lo es',
  abiertoMal.length ? String(abiertoMal.slice(0, 4)) : '');
P([...abiertos].every((n) => ids.every((c) => !D.categorias[c].a[n] || D.categorias[c].a[n].nv > 0)),
  'los aspectos abiertos conservan el numero oficial de valores');

// 4d — Brand: obligatorio en las 88 aunque sea de entrada libre
const sinBrand = ids.filter((c) => !D.categorias[c].a['Brand']);
const brandNoReq = ids.filter((c) => D.categorias[c].a['Brand'] && !D.categorias[c].a['Brand'].r);
P(sinBrand.length === 0 && brandNoReq.length === 0,
  'Brand esta presente y obligatorio en las 88 categorias',
  sinBrand.length || brandNoReq.length ? `falta en ${sinBrand.length}, opcional en ${brandNoReq.length}` : '88/88');
P(ids.every((c) => D.categorias[c].a['Brand'].m === 'txt'),
  'Brand es de entrada libre en todas (FREE_TEXT)');

// 4e — Upper Material y Skirt Length, los otros dos que faltaban
const upper = ids.filter((c) => D.categorias[c].a['Upper Material']);
const upperReq = upper.filter((c) => D.categorias[c].a['Upper Material'].r);
P(upper.length === 17 && upperReq.length === 12,
  'Upper Material presente en 17 categorias, obligatorio en 12', `${upper.length} / ${upperReq.length}`);
const faldas = ids.filter((c) => D.categorias[c].a['Skirt Length']);
const faldasReq = faldas.filter((c) => D.categorias[c].a['Skirt Length'].r);
P(faldas.length === 3, 'Skirt Length presente en las 3 categorias de falda', String(faldas));
P(faldasReq.length === 1 && faldasReq[0] === '63864',
  'la categoria de falda que lo exige (Women 63864) lo conserva obligatorio', String(faldasReq));
for (const c of faldas)
  P(valores(D.categorias[c].a['Skirt Length']).length > 0, `  Skirt Length de ${c} conserva valores`,
    JSON.stringify(valores(D.categorias[c].a['Skirt Length'])));

// 4f — Heel Height, autorizado como opcional dinamico
const hh = ids.filter((c) => D.categorias[c].a['Heel Height']);
P(hh.length === 8 && hh.every((c) => !D.categorias[c].a['Heel Height'].r),
  'Heel Height presente como opcional en las 8 categorias oficiales', `${hh.length} categorias`);

// 4g — ficha completa de Women's Heels 55793
const H = D.categorias['55793'].a;
const exigidos = ['Brand', 'Upper Material', 'US Shoe Size', 'Color', 'Style', 'Department'];
for (const n of exigidos)
  P(!!H[n] && H[n].r === 1, `55793 conserva ${n} OBLIGATORIO`, H[n] ? `nv=${H[n].nv}` : 'AUSENTE');
P(!!H['Heel Style'] && H['Heel Style'].r === 0 && valores(H['Heel Style']).includes('Wedge'),
  '55793 conserva Heel Style opcional con Wedge', JSON.stringify(valores(H['Heel Style'] || {})));
P(!!H['Heel Height'] && H['Heel Height'].r === 0,
  '55793 conserva Heel Height opcional', JSON.stringify(valores(H['Heel Height'] || {})));

// 5 — la seleccion no tiene fallback: todo destino esta en categorias
const destinos = [];
(function r(nodo, ruta) {
  for (const [k, v] of Object.entries(nodo))
    if (typeof v === 'number') destinos.push([[...ruta, k].join('/'), String(v)]);
    else r(v, [...ruta, k]);
})(D.seleccion, []);
const huerfanos = destinos.filter(([, c]) => !D.categorias[c]);
P(huerfanos.length === 0, 'ninguna combinacion apunta fuera del mapa (sin fallback)', `${destinos.length} combinaciones`);
const sinUsar = ids.filter((c) => !destinos.some(([, d]) => d === c));
P(sinUsar.length === 0, 'ninguna categoria sobra en el derivado', sinUsar.length ? String(sinUsar) : '');

// 6 — no queda ni una cadena que parezca credencial
const crudo = readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8');
const sospechoso = /(v\^1\.1#|Bearer\s|client_secret|access_token|PRD-[0-9a-f]{16}|SBX-[0-9a-f]{16}|-PRD-|AppId|CertId)/i.test(crudo);
P(!sospechoso, 'el derivado no contiene tokens ni credenciales');

// 7 — 2T sigue disponible donde corresponde
const con2T = ids.filter((c) => valores(D.categorias[c].a['Size'] || {}).includes('2T'));
const debe2T = ['260031', '260020', '260966', '260965', '155199'];
P(debe2T.every((c) => con2T.includes(c)), '2T disponible en Baby y en los tres departamentos 4&Up',
  `${con2T.length} categorias con 2T`);

// 8 — aspectos de calzado preservados
const zapatos = ids.filter((c) => D.categorias[c].a['US Shoe Size']);
const heel    = ids.filter((c) => D.categorias[c].a['Heel Style']);
const ancho   = ids.filter((c) => D.categorias[c].a['Shoe Width']);
P(zapatos.length > 0, 'US Shoe Size preservado', `${zapatos.length} categorias`);
P(ancho.length > 0,   'Shoe Width preservado',   `${ancho.length} categorias`);
P(heel.length > 0,    'Heel Style preservado',   `${heel.length} categorias`);
P(valores(D.categorias['55793'].a['Heel Style'] || {}).includes('Wedge'),
  'Heel Style de Women\'s Heels 55793 incluye Wedge');
P(!valores(D.categorias['55793'].a['Style'] || {}).includes('Wedge'),
  'Style de 55793 NO incluye Wedge (Style y Heel Style son distintos)');
P(!zapatos.some((c) => D.categorias[c].a['Size']),      'ninguna categoria de calzado lleva Size');
P(!zapatos.some((c) => D.categorias[c].a['Size Type']), 'ninguna categoria de calzado lleva Size Type');

// 9 — Size Type solo donde el oficial lo tiene, y con la lista de esa hoja.
// Ojo: Kids > Swimwear SI tiene Size Type (opcional) pero con valores propios
// ('Slim', 'Husky'), no los de adulto. Baby & Toddler nunca lo tiene.
const infantil = ids.filter((c) => /(Kids|Baby)/.test(D.categorias[c].ruta));
const baby     = infantil.filter((c) => /> Baby >/.test(D.categorias[c].ruta));
P(!baby.some((c) => D.categorias[c].a['Size Type']),
  'ninguna categoria de Baby & Toddler lleva Size Type', `${baby.length} categorias`);
const stInfantil = infantil.filter((c) => D.categorias[c].a['Size Type']);
P(stInfantil.every((c) => /Swimwear/.test(D.categorias[c].ruta)),
  'en Kids, Size Type solo aparece en Swimwear', `${stInfantil.length} categorias: ` + stInfantil);
const ADULTO = ['Big & Tall', 'Petites', 'Juniors', 'Maternity', 'Tall'];
P(!stInfantil.some((c) => valores(D.categorias[c].a['Size Type']).some((v) => ADULTO.includes(v))),
  'ningun Size Type infantil ofrece valores de adulto');
P(infantil.filter((c) => !D.categorias[c].a['Size Type']).length === infantil.length - stInfantil.length,
  'el resto de categorias infantiles no lleva Size Type', `${infantil.length - stInfantil.length} de ${infantil.length}`);
P(!['105440', '105422', '105432'].some((c) => D.categorias[c].a['Size Type'] || D.categorias[c].a['Department']),
  'Scrubs no lleva Size Type ni Department');

// 10 — JSON valido y compacto
P(crudo.length < 200 * 1024, 'el derivado pesa menos de 200 KB', `${(crudo.length / 1024).toFixed(1)} KB`);

console.log(`\n${n - fallos}/${n} comprobaciones pasan`);
process.exit(fallos ? 1 : 0);
