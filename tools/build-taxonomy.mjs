#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build-taxonomy.mjs — genera taxonomy/ebay-us-v134.json
//
// Lee los JSON oficiales de la Taxonomy API de eBay (marketplace EBAY_US,
// categoryTreeId 0) y emite un derivado pequeno con SOLO las categorias que
// la aplicacion puede ofrecer y SOLO los aspectos que la aplicacion usa.
//
// Los JSON oficiales NO viven en este repositorio: pesan ~49 MB. Se pasan por
// ruta. Ver taxonomy/GENERADO.md para como obtenerlos.
//
//   node tools/build-taxonomy.mjs  --src <dir>   genera el derivado
//   node tools/verify-taxonomy.mjs --src <dir>   revalida lo generado
//
// El script no lee ni escribe credenciales y no hace ninguna llamada de red.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ    = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA  = join(RAIZ, 'taxonomy', 'ebay-us-v134.json');
const ESQUEMA = 1;                 // version del esquema del derivado
const ARBOL   = '0';
const VERSION = '134';
const MARKET  = 'EBAY_US';

// --- que aspectos se conservan ---------------------------------------------
// REGLA 1: se conserva TODO aspecto con aspectRequired=true en alguna de las
// categorias incluidas. Este conjunto NO se escribe a mano: se calcula leyendo
// los JSON oficiales, para que sea imposible omitir un obligatorio nuevo.
// REGLA 2: ademas se conservan los opcionales que la aplicacion usa.
const OPCIONALES = [
  'Material', 'Sleeve Length', 'Performance/Activity',
  'Shoe Width', 'Heel Style', 'Heel Height',
];

// Un aspecto FREE_TEXT cuya lista oficial de sugerencias supere este limite se
// guarda ABIERTO: se conserva su obligatoriedad y el numero exacto de valores
// oficiales, pero no se incrusta la lista. En FREE_TEXT esa lista es una
// sugerencia, no un conjunto cerrado, asi que no valida nada.
// Hoy solo 'Brand' lo supera: 88 categorias, hasta 19.161 valores, 10.555 KB
// deduplicados — mas de 50 veces el presupuesto entero del archivo.
const LIMITE_VALORES = 400;

// ---------------------------------------------------------------------------
// SELECCION — el unico mapa. Cada combinacion que la aplicacion puede ofrecer
// apunta a un leaf category ID oficial. No hay fallback: lo que no este aqui
// no es seleccionable.
// ---------------------------------------------------------------------------
const SELECCION = {
  mens: {
    clothing: {
      'T-Shirt': 15687, 'Tank Top': 15687,
      'Shirt': 57990, 'Shacket': 57990,
      'Polo': 185101,
      'Sweater': 11484,
      'Hoodie': 155183, 'Sweatshirt': 155183, 'Quarter Zip': 155183,
      'Jacket': 57988, 'Coat': 57988, 'Vest': 57988,
      'Pants': 57989, 'Jeans': 11483, 'Shorts': 15689,
      'Activewear Top': 185076, 'Activewear Pants': 260956, 'Activewear Shorts': 260957,
      'Swimwear': 15690,
    },
    shoes: {
      'Athletic': 15709, 'Boots': 11498, 'Casual': 24087,
      'Dress Shoes': 53120, 'Sandals': 11504, 'Slippers': 11505,
    },
  },
  womens: {
    clothing: {
      'T-Shirt': 53159, 'Tank Top': 53159, 'Shirt': 53159, 'Blouse': 53159,
      'Shacket': 53159, 'Polo': 53159, 'Sleeveless': 53159,
      'Sweater': 63866,
      'Hoodie': 155226, 'Sweatshirt': 155226, 'Quarter Zip': 155226,
      'Jacket': 63862, 'Coat': 63862, 'Vest': 63862,
      'Pants': 63863, 'Jeans': 11554, 'Shorts': 11555,
      'Dress': 63861, 'Skirt': 63864,
      'Activewear Top': 185082, 'Activewear Pants': 260954, 'Activewear Shorts': 260955,
      'Swimwear': 63867,
    },
    shoes: {
      'Athletic': 95672, 'Boots': 53557, 'Comfort': 53548, 'Flats': 45333,
      'Heels': 55793, 'Sandals': 62107, 'Slippers': 11632,
    },
  },
  // Kids, tallas 4 y mayores. Departamento explicito: boys | girls | unisex.
  kids4up: {
    boys: {
      clothing: {
        'Tops': 260966, 'Jeans': 77475, 'Pants': 51920, 'Shorts': 15615,
        'Sweater': 51946, 'Hoodie': 57916, 'Sweatshirt': 57916,
        'Outerwear': 51933, 'Swimwear': 51919,
        'Activewear Top': 260971, 'Activewear Pants': 260969, 'Activewear Shorts': 260970,
      },
      shoes: { 'Shoes': 57929 },
    },
    girls: {
      clothing: {
        'Tops': 260965, 'Dress': 51581, 'Jeans': 77411, 'Pants': 51568,
        'Shorts': 15648, 'Skirt': 51583, 'Sweater': 51582,
        'Hoodie': 152554, 'Sweatshirt': 152554,
        'Outerwear': 51580, 'Swimwear': 51567,
        'Activewear Top': 260978, 'Activewear Pants': 260976, 'Activewear Shorts': 260977,
      },
      shoes: { 'Shoes': 57974 },
    },
    unisex: {
      clothing: {
        'Tops': 155199, 'Jeans': 175658, 'Pants': 175654, 'Shorts': 175655,
        'Sweater': 175657, 'Hoodie': 155200, 'Sweatshirt': 155200,
        'Outerwear': 155201, 'Swimwear': 175653,
        'Activewear Top': 260985, 'Activewear Pants': 260983, 'Activewear Shorts': 260984,
      },
      shoes: { 'Shoes': 155202 },
    },
  },
  // Baby & Toddler cuelga de "Baby", NO de "Kids". Rama aparte a proposito.
  // Hoodie y Sweatshirt -> Sweaters 260029: Baby & Toddler no tiene hoja de
  // sudaderas y 260029 es la mas cercana con Type/Style oficiales aplicables.
  baby: {
    clothing: {
      'Tops': 260031, 'Bottoms': 260020, 'Dress': 260021, 'Skirt': 260025,
      'Outerwear': 260023, 'Sweater': 260029,
      'Hoodie': 260029, 'Sweatshirt': 260029,
      'Swimwear': 260030,
    },
    shoes: { 'Shoes': 147285 },
  },
  // Scrubs no tiene genero en la taxonomia oficial: cuelga de Specialty.
  specialty: {
    clothing: {
      'Scrubs Top': 105440, 'Scrubs Bottom': 105422, 'Scrubs Set': 105432,
    },
  },
};

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const src  = args[args.indexOf('--src') + 1];
if (!args.includes('--src') || !src || !existsSync(src)) {
  console.error('uso: node tools/build-taxonomy.mjs --src <dir-json-oficiales>');
  process.exit(2);
}

const err = [];
const fatal = (m) => { err.push(m); };

// --- indice del arbol completo ---------------------------------------------
const fArbol = join(src, '02-category-tree-completo.json');
if (!existsSync(fArbol)) { console.error(`falta ${fArbol}`); process.exit(2); }
const arbol = JSON.parse(readFileSync(fArbol, 'utf8'));
if (arbol.categoryTreeId !== ARBOL || arbol.categoryTreeVersion !== VERSION) {
  console.error(`el arbol de origen es ${arbol.categoryTreeId}/v${arbol.categoryTreeVersion}, se esperaba ${ARBOL}/v${VERSION}`);
  process.exit(2);
}
const idx = new Map();
(function walk(n, ruta) {
  const { categoryId: id, categoryName: nombre } = n.category;
  const r = [...ruta, nombre];
  idx.set(id, { nombre, ruta: r.slice(1).join(' > '), hoja: n.leafCategoryTreeNode === true });
  for (const h of n.childCategoryTreeNodes || []) walk(h, r);
})(arbol.rootCategoryNode, []);

// --- lectura de los aspectos oficiales de una categoria ---------------------
function leer(cid) {
  const f = join(src, `04-aspectos-${cid}.json`);
  if (!existsSync(f)) { fatal(`${cid}: no hay archivo de aspectos 04-aspectos-${cid}.json`); return null; }
  return JSON.parse(readFileSync(f, 'utf8')).aspects || [];
}

// PASADA 1 — descubrir el conjunto de obligatorios leyendo los datos.
function descubrirObligatorios(ids) {
  const req = new Set();
  for (const cid of ids)
    for (const a of leer(cid) || [])
      if (a.aspectConstraint?.aspectRequired === true) req.add(a.localizedAspectName);
  return req;
}

// PASADA 2 — extraer solo los aspectos conservados.
function aspectosDe(cid, conservados) {
  const salida = {};
  for (const a of leer(cid) || []) {
    const nombre = a.localizedAspectName;
    if (!conservados.has(nombre)) continue;
    const c = a.aspectConstraint || {};
    const vals = (a.aspectValues || []).map((x) => x.localizedValue);
    const libre = c.aspectMode !== 'SELECTION_ONLY';
    const e = {
      r: c.aspectRequired === true ? 1 : 0,
      m: libre ? 'txt' : 'sel',
      nv: vals.length,                       // cuantos valores tiene el oficial
    };
    // Lista enorme y de texto libre: se conserva el aspecto, no la lista.
    if (libre && vals.length > LIMITE_VALORES) e.abierto = 1;
    else e.v = vals;
    salida[nombre] = e;
  }
  return salida;
}

// --- recorrer la seleccion --------------------------------------------------
const usados = new Set();
(function recorrer(nodo) {
  for (const v of Object.values(nodo)) {
    if (typeof v === 'number') usados.add(String(v));
    else recorrer(v);
  }
})(SELECCION);

const orden = [...usados].sort((a, b) => +a - +b);
const OBLIGATORIOS = descubrirObligatorios(orden);
const CONSERVADOS  = new Set([...OBLIGATORIOS, ...OPCIONALES]);

const categorias = {};
for (const cid of orden) {
  const nodo = idx.get(cid);
  if (!nodo)      { fatal(`${cid}: no existe en el arbol ${ARBOL} v${VERSION}`); continue; }
  if (!nodo.hoja) { fatal(`${cid}: existe pero NO es leaf category (${nodo.ruta})`); continue; }
  const a = aspectosDe(cid, CONSERVADOS);
  if (!a) continue;
  // Ningun obligatorio de esta categoria puede quedarse fuera.
  for (const of_ of leer(cid) || [])
    if (of_.aspectConstraint?.aspectRequired === true && !a[of_.localizedAspectName])
      fatal(`${cid}: se omitio el aspecto obligatorio "${of_.localizedAspectName}"`);
  categorias[cid] = { n: nodo.nombre, ruta: nodo.ruta, a };
}

if (err.length) {
  console.error('\nERRORES — no se escribe nada:');
  for (const e of err) console.error('  ✗ ' + e);
  process.exit(1);
}

// --- deduplicar listas de valores repetidas ---------------------------------
// Material, Color y Performance/Activity son listas identicas repetidas en
// decenas de categorias. Se extraen a una tabla compartida.
const cuenta = new Map();
for (const c of Object.values(categorias))
  for (const a of Object.values(c.a)) {
    if (!a.v) continue;                       // aspecto abierto: no hay lista
    const k = JSON.stringify(a.v);
    if (a.v.length >= 8) cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
const listas = {};
const refDe  = new Map();
let i = 0;
for (const [k, n] of [...cuenta.entries()].sort((x, y) => y[1] * y[0].length - x[1] * x[0].length))
  if (n >= 2) { const id = 'L' + (i++); listas[id] = JSON.parse(k); refDe.set(k, id); }
for (const c of Object.values(categorias))
  for (const a of Object.values(c.a)) {
    if (!a.v) continue;
    const ref = refDe.get(JSON.stringify(a.v));
    if (ref) { a.ref = ref; delete a.v; }
  }

// --- Department: quien admite "Unisex Adults" (decision B) ------------------
// eBay no tiene rama de categorias unisex para adultos. "Unisex Adults" es un
// valor del aspecto Department dentro de las categorias de hombre y de mujer.
for (const [cid, c] of Object.entries(categorias)) {
  const d = c.a['Department'];
  const vals = d ? (d.v || listas[d.ref] || []) : [];
  if (vals.includes('Unisex Adults')) c.unisexAdultos = 1;
}

const derivado = {
  esquema: ESQUEMA,
  marketplace: MARKET,
  categoryTreeId: ARBOL,
  categoryTreeVersion: VERSION,
  generadoPor: 'tools/build-taxonomy.mjs',
  aspectosConservados: [...CONSERVADOS].sort(),
  aspectosObligatorios: [...OBLIGATORIOS].sort(),
  aspectosAbiertos: [...new Set(Object.values(categorias)
    .flatMap((c) => Object.entries(c.a).filter(([, a]) => a.abierto).map(([n]) => n)))].sort(),
  listas,
  categorias,
  seleccion: SELECCION,
};

writeFileSync(SALIDA, JSON.stringify(derivado) + '\n');
console.log(`escrito  ${SALIDA}`);
console.log(`categorias ${Object.keys(categorias).length}   listas compartidas ${Object.keys(listas).length}`);
console.log(`obligatorios (${OBLIGATORIOS.size}): ${[...OBLIGATORIOS].sort().join(', ')}`);
console.log(`abiertos: ${derivado.aspectosAbiertos.join(', ') || 'ninguno'}`);
