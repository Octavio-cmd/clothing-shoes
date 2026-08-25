// Pruebas permanentes del PASO 5 — CSV v134 paralelo.
// Con el flag apagado el CSV antiguo debe salir byte a byte igual.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandbox, buildDirect } from './_csv.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const TAX = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
import { createHash } from 'node:crypto';

// ── LINEAS BASE PERMANENTES ────────────────────────────────────────────────
// Hashes SHA-256 (32 hex) del estado del PASO 4, incrustados como constantes.
//
// Antes esto se obtenia con `git show HEAD:app.js`. Era un error: en cuanto se
// commiteaba, HEAD pasaba a ser el propio codigo bajo prueba y la comparacion
// quedaba contra si misma. Ademas ataba las pruebas al historial, asi que en un
// clon superficial ni siquiera podian ejecutarse.
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);
const hash16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// Cuerpo de clExportEbayCSV ANTES del desvio del PASO 5.
// PASO 5 comparaba clExportEbayCSV quitandole el bloque del desvio, contra un
// hash del PASO 4. El PASO 6 mueve clSendToRegistroSheet DENTRO del desvio
// (debe ejecutarse despues de validar, no antes), asi que ya no se puede
// aislar un bloque autocontenido. Se congela la funcion COMPLETA; ver
// tests/validacion.test.mjs para el mismo invariante, que es donde vive la
// version canonica de esta comprobacion.
const HASH_EXPORT_PASO6 = '489c2db5336cedf3047f53d4276a5022';

// CSV antiguo del lote de referencia LOTE_VIEJO, generado por el PASO 4.
const CSV_LEGACY_REF = 'e121a37e0d1e52d4';          // 1159 bytes
// Igual, pero con una fila de esquema 2 mezclada y el flag apagado.
const CSV_LEGACY_MIXTO_REF = '93c76186b50a8945';    // 1280 bytes

// Cuerpo de cada funcion protegida en el PASO 4.
const HASH_FN = {
  'clBuildEbayRow': '030ae49c5e7d0fc845085969491d0ca0',
  'clBuildAspects': '8e5699b198d0c5758b16f064e4a7c248',
  'clGetEbayCategoryId': '74e0fca979b60182ef09303a46c0cdcd',
  'clBuildEbayCategory': '61d39a3db5242ae2883e9c42e95d1458',
  // Actualizado: fix del titulo "NWOT New Without Tags" duplicado (ver
  // clColapsarNwotRepetido en app.js). Cambio autorizado explicitamente,
  // separado del PASO 7; NWT y las demas condiciones no se tocaron.
  'buildClothingTitle': '8b392945308beca038c7c50f13dfc12b',
  'buildClothingDesc': '3b226d53b15a13f4bb531375f6ba85fa',
  'clSizeType': 'a5875899d5f1f8b4c3d359c69122963d',
  'clDept': '545c7fb742936037e4ec1ea22710db93',
  'clGetConditionId': 'c67a978d93d34a10dabf521a60abcd91',
  'clCondText': 'f774da9d5b64347b97c6b570bedba328',
  'clCondShort': '35c06246e9503032296e053bf20a2552',
  'clSaveToSession': 'eab641c0e096fb2305235422a8d0d8df',
  'clGetSessionCount': '8e52f2a9a7bb6322e4095d60f2a86f82',
  'clClearSession': '48cc9e2fd39038edd1b9b27b07674766',
  'clPreviewSession': 'fffcded4e66385eda6bbef3ac44a551f',
  'clNormalizePrice': '10e534d2a6a9447ab0c978667d394821',
  'clCleanColor': 'b0907c0c676dd1cc36eda4e02bfde148',
  'clInseamOptions': '96c4455b31835813803df3245eaa3a27',
};
const IDS = Object.keys(OFICIAL.categorias);

await (async () => {
  T.clTaxonomyReset();
  const r = await T.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => OFICIAL }), forzar: true });
  if (!r.ok) throw new Error('no cargo: ' + r.codigo);
})();

// fila del esquema antiguo
const vieja = (o) => Object.assign({
  sku: 'X', categoryId: '', title: 'T', conditionId: '', brand: '', sizeType: '', size: '',
  department: '', color: '', style: '', type: '', inseam: '', dressLength: '', outerMaterial: '',
  activity: '', shoeWidth: '', price: '19.99', photos: 'u', description: '<p>d</p>',
  weightMajor: 0, weightMinor: 8,
}, o);

// fila del esquema 2, con aspectos oficiales
const nueva = (cid, aspects, o) => Object.assign({
  _esquema: 2, sku: 'N-' + cid, categoryId: cid, title: 'Titulo', condition: 'NWT',
  price: '29.99', photos: 'u', description: '<p>d</p>', weightMajor: 1, weightMinor: 0,
  aspects: aspects,
}, o || {});

// item valido para una categoria, tomando el primer valor oficial de cada obligatorio
function aspectosValidos(cid) {
  const a = {};
  for (const x of T.clAspectsFor(cid)) if (x.requerido) a[x.nombre] = x.abierto ? 'Marca X' : x.valores[0];
  return a;
}

const extraerFn = (s, f) => { const i = s.indexOf('function ' + f + '('); let d = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) { if (s[k]==='{') d++; else if (s[k]==='}') { d--; if (!d) return s.slice(i,k+1); } } return ''; };
const csvDe = (sess, flagOn, app) => sandbox(app || APP, TAX, sess, flagOn, OFICIAL);
// Salta la puerta de bloqueo del PASO 6 y llama a clBuildCsvV134 directamente.
// Sirve para probar la garantia de BAJO NIVEL de clCsvRowV134: aunque algo
// llamara a estas funciones sin pasar por clExportEbayCSV, no inventan un
// solo valor. clExportEbayCSV sigue siendo la unica puerta real.
const uno = async (cid, aspects, extra) => {
  const r = await buildDirect(APP, TAX, [nueva(cid, aspects, extra)], OFICIAL);
  return parse(r.csv);
};
const celdas = (linea) => {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (q) { if (c === '"') { if (linea[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
};
const parse = (csv) => {
  const l = csv.split('\r\n');
  const hdr = celdas(l[1]);
  return { hdr, filas: l.slice(2).map(celdas).map((c) => Object.fromEntries(c.map((v, i) => [hdr[i], v]))) };
};

const LOTE_VIEJO = [
  vieja({ sku: 'A1', categoryId: '53159', title: 'Top', conditionId: 1000, brand: 'Nike', sizeType: 'Regular', size: 'M', department: 'Women', color: 'Black', style: 'Classic', type: 'T-Shirt', price: '22.00' }),
  vieja({ sku: 'A2', categoryId: '11483', title: 'Jeans', conditionId: 3000, brand: 'Levi', size: '32', department: 'Men', color: 'Blue', style: 'Skinny', type: 'Jeans', price: '24.00' }),
  vieja({ sku: 'A3', type: 'Jacket', price: '30.00' }),
  vieja({ sku: 'A4', type: 'Sneakers', price: '45.00' }),
  vieja({ sku: 'A5', type: 'Skirt', price: '15.00' }),
];

// ── 1. flag apagado: nada cambia ───────────────────────────────────────────
describe('flag apagado', () => {
  test('el CSV antiguo sigue siendo el del PASO 4, byte a byte', async () => {
    const b = (await csvDe(LOTE_VIEJO, false, APP)).capturados[0];
    assert.ok(b, 'no se capturo el CSV');
    assert.equal(hash16(b.csv), CSV_LEGACY_REF);
  });

  test('tambien con filas del esquema 2 mezcladas: siguen el camino antiguo', async () => {
    const mixto = LOTE_VIEJO.concat([nueva('55793', aspectosValidos('55793'))]);
    const b = (await csvDe(mixto, false, APP)).capturados[0];
    assert.equal(hash16(b.csv), CSV_LEGACY_MIXTO_REF, 'con el flag apagado el _esquema se ignora');
  });

  test('sale un solo archivo y ningun aviso', async () => {
    const r = await csvDe(LOTE_VIEJO, false, APP);
    assert.equal(r.capturados.length, 1);
    assert.equal(r.avisos.length, 0);
  });

  test('las 18 funciones protegidas conservan su hash del PASO 4', async () => {
    assert.equal(Object.keys(HASH_FN).length, 18);
    for (const [f, esperado] of Object.entries(HASH_FN))
      assert.equal(hash(extraerFn(APP, f)), esperado, `cambio en ${f}`);
  });

  test('clExportEbayCSV coincide con el hash congelado del PASO 6', async () => {
    const fn = extraerFn(APP, 'clExportEbayCSV');
    assert.equal(hash(fn), HASH_EXPORT_PASO6,
      'clExportEbayCSV cambio -- si es un cambio autorizado, actualiza HASH_EXPORT_PASO6 aqui y en validacion.test.mjs');
  });
});

// ── 2. encabezado dinamico ─────────────────────────────────────────────────
describe('encabezado', () => {
  test("'*C:' solo cuando el aspecto es obligatorio en TODAS las categorias del lote", async () => {
    const solo = T.clCsvColumnsFor(['55793']);
    assert.equal(solo.find((c) => c.aspecto === 'Brand').obligatorioEnTodas, true);
    assert.equal(solo.find((c) => c.aspecto === 'Heel Style').obligatorioEnTodas, false);
    const mixto = T.clCsvColumnsFor(['55793', '105440']);
    // Department es obligatorio en Heels y NO existe en Scrubs -> sin asterisco
    assert.equal(mixto.find((c) => c.aspecto === 'Department').obligatorioEnTodas, false);
    assert.equal(mixto.find((c) => c.aspecto === 'Brand').obligatorioEnTodas, true);
  });

  test('ninguna columna con asterisco queda vacia en ninguna fila', async () => {
    const filas = [nueva('55793', aspectosValidos('55793')), nueva('63864', aspectosValidos('63864')),
                   nueva('105440', aspectosValidos('105440'))];
    const r = await csvDe(filas, true, APP);
    const p = parse(r.capturados[0].csv);
    const obligatorias = p.hdr.filter((h) => h.startsWith('*C:'));
    assert.ok(obligatorias.length > 0);
    for (const col of obligatorias)
      for (const f of p.filas)
        assert.notEqual(f[col], '', `${col} vacia en ${f['CustomLabel']}`);
  });

  test('la union cubre los aspectos de todas las categorias del lote', async () => {
    const cols = T.clCsvColumnsFor(['55793', '63864']).map((c) => c.aspecto);
    for (const n of ['US Shoe Size', 'Upper Material', 'Heel Style', 'Heel Height',
                     'Size', 'Size Type', 'Skirt Length', 'Material'])
      assert.ok(cols.includes(n), `falta ${n}`);
  });

  test('nunca aparece la columna C:Width', async () => {
    const filas = IDS.slice(0, 20).map((c) => nueva(c, aspectosValidos(c)));
    const p = parse((await csvDe(filas, true, APP)).capturados[0].csv);
    assert.equal(p.hdr.some((h) => h === 'C:Width' || h === '*C:Width'), false);
  });

  test('las 88 categorias producen un encabezado valido', async () => {
    for (const cid of IDS) {
      const cols = T.clCsvColumnsFor([cid]);
      const admite = Object.keys(OFICIAL.categorias[cid].a);
      assert.equal(cols.length, admite.length, cid);
      for (const c of cols) assert.ok(admite.includes(c.aspecto), `${cid}/${c.aspecto}`);
    }
  });
});

// ── 3. contenido de las filas ──────────────────────────────────────────────
describe('filas v134', () => {
  test("Women's Heels: US Shoe Size lleno, Size vacio, Upper Material y Heel Style", async () => {
    const p = await uno('55793', { 'Brand': 'Steve Madden', 'Department': 'Women', 'US Shoe Size': '8.5',
      'Color': 'Black', 'Style': 'Pump', 'Upper Material': 'Leather', 'Heel Style': 'Wedge',
      'Heel Height': 'Mid (2-2.9 in)' });
    const f = p.filas[0];
    assert.equal(f['*Category'], '55793');
    assert.equal(f['C:US Shoe Size'] ?? f['*C:US Shoe Size'], '8.5');
    assert.equal(p.hdr.includes('C:Size') ? f['C:Size'] : '', '');
    assert.equal(f['*C:Upper Material'] ?? f['C:Upper Material'], 'Leather');
    assert.equal(f['C:Heel Style'], 'Wedge');
    assert.equal(f['C:Heel Height'], 'Mid (2-2.9 in)');
    assert.equal(p.hdr.includes('C:Skirt Length'), false);
  });

  test("Women's Skirt: Skirt Length lleno y sin Dress Length", async () => {
    const p = await uno('63864', { 'Brand': 'Zara', 'Department': 'Women', 'Size': 'M', 'Size Type': 'Regular',
      'Type': 'Skirt', 'Style': 'A-Line', 'Color': 'Black', 'Skirt Length': 'Midi' });
    const f = p.filas[0];
    assert.equal(f['*C:Skirt Length'] ?? f['C:Skirt Length'], 'Midi');
    assert.equal(p.hdr.some((h) => h.endsWith('C:Dress Length')), false);
    assert.equal(f['*C:Size'] ?? f['C:Size'], 'M');
    assert.equal(p.hdr.some((h) => h.endsWith('C:US Shoe Size')), false);
  });

  test('Scrubs: sin Department, sin Size Type, sin Type, sin Style', async () => {
    const p = await uno('105440', { 'Brand': 'Cherokee', 'Size': 'L', 'Color': 'Blue', 'Material': 'Cotton Blend' });
    for (const n of ['Department', 'Size Type', 'Type', 'Style'])
      assert.equal(p.hdr.some((h) => h.endsWith('C:' + n)), false, `aparecio C:${n}`);
    assert.equal(p.filas[0]['*C:Brand'] ?? p.filas[0]['C:Brand'], 'Cherokee');
  });

  test('un valor no oficial deja la celda vacia, no se envia', async () => {
    const p = await uno('55793', { 'Brand': 'X', 'Department': 'Women', 'US Shoe Size': '8.5',
      'Color': 'Negro', 'Style': 'Wedge', 'Upper Material': 'Leather' });
    const f = p.filas[0];
    assert.equal(f['*C:Color'] ?? f['C:Color'], '', 'Negro no es oficial');
    assert.equal(f['*C:Style'] ?? f['C:Style'], '', 'Wedge no es Style');
  });

  test('un aspecto que la categoria no admite queda vacio, no se rellena', async () => {
    const filas = [nueva('55793', aspectosValidos('55793')), nueva('63864', aspectosValidos('63864'))];
    const p = parse((await csvDe(filas, true, APP)).capturados[0].csv);
    const heels = p.filas.find((f) => f['*Category'] === '55793');
    const skirt = p.filas.find((f) => f['*Category'] === '63864');
    assert.equal(heels['C:Skirt Length'], '');
    assert.equal(heels['C:Size'], '');
    assert.equal(skirt['C:US Shoe Size'], '');
    assert.equal(skirt['C:Upper Material'], '');
  });

  test('Size y US Shoe Size nunca van llenos a la vez, en ninguna categoria', async () => {
    const filas = IDS.map((c) => nueva(c, aspectosValidos(c)));
    const p = parse((await csvDe(filas, true, APP)).capturados[0].csv);
    assert.equal(p.filas.length, 88);
    const cs = p.hdr.find((h) => h.endsWith('C:Size'));
    const cu = p.hdr.find((h) => h.endsWith('C:US Shoe Size'));
    for (const f of p.filas)
      assert.ok(!(f[cs] && f[cu]), `${f['*Category']} lleva ambas: ${f[cs]} / ${f[cu]}`);
  });

  test('las 88 categorias exportan sin inventar nada', async () => {
    const filas = IDS.map((c) => nueva(c, aspectosValidos(c)));
    const r = await csvDe(filas, true, APP);
    assert.deepEqual(r.problemas ?? [], []);
    const p = parse(r.capturados[0].csv);
    const cols = p.hdr.filter((h) => h.startsWith('C:') || h.startsWith('*C:'))
      .map((h) => h.replace(/^\*?C:/, ''));
    for (const f of p.filas) {
      const cid = f['*Category'];
      assert.ok(OFICIAL.categorias[cid], `categoria ${cid} inventada`);
      for (const n of cols) {
        const v = f[p.hdr.find((h) => h.endsWith('C:' + n))];
        if (!v) continue;
        assert.ok(T.clAspectValido(cid, n, v), `${cid}/${n} = "${v}" no es oficial`);
      }
    }
  });
});

// ── 4. sin fallbacks ───────────────────────────────────────────────────────
describe('sin fallbacks', () => {
  test('no aparece 63861, 53159 ni 57990 como categoria inventada', async () => {
    const filas = [nueva('55793', aspectosValidos('55793'))];
    const p = parse((await csvDe(filas, true, APP)).capturados[0].csv);
    assert.equal(p.filas[0]['*Category'], '55793');
  });

  test('sin precio capturado la celda queda vacia, no 19.99', async () => {
    // la guardia de precio de clExportEbayCSV detiene el lote antes de llegar
    const r = await csvDe([nueva('55793', aspectosValidos('55793'), { price: '' })], true, APP);
    assert.equal(r.capturados.length, 0, 'la guardia de precio debe detenerlo');
    assert.ok(r.avisos.some((a) => /EXPORT DETENIDO/.test(a)));
  });

  test('sin condicion reconocida el ConditionID queda vacio, no 1000 (garantia de bajo nivel)', async () => {
    // Via buildDirect: la propia clCsvRowV134 no inventa 1000 aunque se le
    // pase una condicion desconocida. En produccion nunca llega hasta aqui:
    // clExportEbayCSV bloquea antes -- ver tests/bloqueo.test.mjs.
    const r = await buildDirect(APP, TAX, [nueva('55793', aspectosValidos('55793'), { condition: '' })], OFICIAL);
    assert.equal(parse(r.csv).filas[0]['*ConditionID'], '');
    const r2 = await buildDirect(APP, TAX, [nueva('55793', aspectosValidos('55793'), { condition: 'NWOT' })], OFICIAL);
    assert.equal(parse(r2.csv).filas[0]['*ConditionID'], '1500');
  });

  test('no aparecen Regular, Polyester, General Fitness, Knee Length, Regular (B/M) ni 30\" (garantia de bajo nivel)', async () => {
    // Via buildDirect: sin ningun aspecto capturado, clBuildCsvV134 no rellena
    // nada. En produccion, un lote asi bloquea antes de llegar aqui -- ver
    // tests/bloqueo.test.mjs.
    const filas = IDS.map((c) => nueva(c, {}));   // sin ningun aspecto capturado
    const r = await buildDirect(APP, TAX, filas, OFICIAL);
    for (const inventado of ['Polyester', 'General Fitness', 'Knee Length', 'Regular (B/M)', '30"', '19.99'])
      assert.equal(r.csv.includes(inventado), false, `aparecio "${inventado}"`);
  });

  test('el codigo del camino v134 no contiene ningun valor de relleno', async () => {
    const ex = (f) => { const i = APP.indexOf('function ' + f + '('); let d = 0;
      for (let k = APP.indexOf('{', i); k < APP.length; k++) { if (APP[k]==='{') d++; else if (APP[k]==='}') { d--; if (!d) return APP.slice(i,k+1); } } };
    for (const f of ['clCsvRowV134', 'clBuildCsvV134', 'clCsvHeaderV134'])
      for (const inventado of ["'Regular'", "'Polyester'", "'General Fitness'", "'Knee Length'", "'19.99'", "'63861'", "'1000'"])
        assert.equal(ex(f).includes(inventado), false, `${f} contiene ${inventado}`);
  });

  test('Inseam conserva el formato oficial "30 in"', async () => {
    const p = parse((await csvDe([nueva('57989', { 'Brand': 'Levi', 'Department': 'Men', 'Size': '32',
      'Size Type': 'Regular', 'Color': 'Blue', 'Style': 'Chino', 'Inseam': '30 in' })], true, APP)).capturados[0].csv);
    assert.equal(p.filas[0]['*C:Inseam'] ?? p.filas[0]['C:Inseam'], '30 in');
  });
});

// ── 5. sesiones y esquemas ─────────────────────────────────────────────────
describe('sesiones', () => {
  test('solo esquema 2 -> un archivo v134, sin aviso de lote mixto', async () => {
    const r = await csvDe([nueva('55793', aspectosValidos('55793'))], true, APP);
    assert.equal(r.capturados.length, 1);
    assert.match(r.capturados[0].fname, /-v134\.csv$/);
    assert.equal(r.avisos.length, 0);
  });

  test('solo esquema antiguo -> un archivo antiguo, sin aviso', async () => {
    const r = await csvDe(LOTE_VIEJO, true, APP);
    assert.equal(r.capturados.length, 1);
    assert.equal(/-v134\.csv$/.test(r.capturados[0].fname), false);
    assert.equal(r.avisos.length, 0);
  });

  test('lote mixto -> DOS archivos y un aviso claro', async () => {
    const mixto = LOTE_VIEJO.concat([nueva('55793', aspectosValidos('55793'))]);
    const r = await csvDe(mixto, true, APP);
    assert.equal(r.capturados.length, 2, 'deben salir dos archivos');
    assert.equal(r.capturados.filter((c) => /-v134\.csv$/.test(c.fname)).length, 1);
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /LOTE MIXTO/);
    assert.match(r.avisos[0], /NO se convierten/);
    assert.match(r.avisos[0], /No se borra nada/);
  });

  test('una fila antigua nunca se convierte a v134', async () => {
    const mixto = LOTE_VIEJO.concat([nueva('55793', aspectosValidos('55793'))]);
    const r = await csvDe(mixto, true, APP);
    const v134 = r.capturados.find((c) => /-v134\.csv$/.test(c.fname));
    for (const f of LOTE_VIEJO)
      assert.equal(v134.csv.includes(f.sku), false, `${f.sku} se colo en el CSV v134`);
  });

  test('el archivo antiguo del lote mixto es el mismo que el del PASO 4', async () => {
    const mixto = LOTE_VIEJO.concat([nueva('55793', aspectosValidos('55793'))]);
    const legacy = (await csvDe(mixto, true, APP)).capturados.find((c) => !/-v134\.csv$/.test(c.fname));
    assert.equal(hash16(legacy.csv), CSV_LEGACY_REF,
      'las filas antiguas deben salir exactamente como antes');
  });

  test('clSepararPorEsquema no altera ni borra la sesion', async () => {
    const sess = LOTE_VIEJO.concat([nueva('55793', aspectosValidos('55793'))]);
    const antes = JSON.stringify(sess);
    await csvDe(sess, true, APP);
    assert.equal(JSON.stringify(sess), antes, 'la sesion fue modificada');
  });

  test('el codigo del paso 5 no borra localStorage', async () => {
    const ex = (f) => { const i = APP.indexOf('function ' + f + '('); let d = 0;
      for (let k = APP.indexOf('{', i); k < APP.length; k++) { if (APP[k]==='{') d++; else if (APP[k]==='}') { d--; if (!d) return APP.slice(i,k+1); } } };
    for (const f of ['clExportEbayCSVv134', 'clBuildCsvV134', 'clSepararPorEsquema', 'clCsvRowV134', 'clAmpliarFilaV134'])
      for (const p of ['removeItem', 'clear(', 'setItem'])
        assert.equal(ex(f).includes(p), false, `${f} toca localStorage con ${p}`);
  });
});

// ── 6. no bloquea ──────────────────────────────────────────────────────────
// PASO 5 llamaba a este describe 'no bloquea' porque en esa fase la
// exportacion nunca se detenia por problemas de taxonomia. El PASO 6 cambia
// esa politica a proposito: ver tests/bloqueo.test.mjs para la cobertura
// completa de que y como bloquea ahora. Lo que sigue siendo cierto, y se
// verifica aqui, es que clExportEbayCSVv134 -- la capa que arma el CSV una
// vez que la puerta de bloqueo ya dejo pasar el lote -- no bloquea ni
// deshabilita nada por su cuenta.
describe('clExportEbayCSVv134 no bloquea por su cuenta', () => {
  test('un articulo con obligatorios ausentes ahora bloquea en la puerta de entrada', async () => {
    // Antes (PASO 5) esto se exportaba igual. El PASO 6 lo bloquea: ver
    // tests/bloqueo.test.mjs para la prueba exhaustiva de este caso.
    const r = await csvDe([nueva('55793', { 'Brand': 'X' })], true, APP);
    assert.equal(r.capturados.length, 0, 'ahora debe bloquear');
    assert.ok(r.avisos.some((a) => /EXPORTACION DETENIDA/.test(a)));
  });

  test('la guardia de precio existente sigue intacta y sigue deteniendo', async () => {
    const r = await csvDe([nueva('55793', aspectosValidos('55793'), { price: '999.00' })], true, APP);
    assert.equal(r.capturados.length, 0);
    assert.ok(r.avisos.some((a) => /EXPORT DETENIDO/.test(a)));
  });

  test('clExportEbayCSVv134 en si mismo no bloquea ni deshabilita nada', () => {
    const ex = (f) => { const i = APP.indexOf('function ' + f + '('); let d = 0;
      for (let k = APP.indexOf('{', i); k < APP.length; k++) { if (APP[k]==='{') d++; else if (APP[k]==='}') { d--; if (!d) return APP.slice(i,k+1); } } };
    const fn = ex('clExportEbayCSVv134');
    for (const p of ['return;', 'disabled', 'preventDefault'])
      assert.equal(fn.includes(p), false, `clExportEbayCSVv134 contiene ${p}`);
  });
});

// ── 7. flag y arranque ─────────────────────────────────────────────────────
describe('flag', () => {
  // PASO 7 (preparacion): clTaxonomyBoot() esta conectado en clArrancarCaptura,
  // pero el flag sigue en false — clTaxonomyBoot() no hace fetch ni cambia nada.
  test('sigue en false y clTaxonomyBoot conectado en un unico punto', async () => {
    assert.match(TAX, /var CL_TAXONOMY_V134_ENABLED = false;/);
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(APP), false);
    assert.equal((APP.match(/clTaxonomyBoot\(\)/g) || []).length, 2);
  });
});

// ── 8. resolucion fallida: nunca degrada al CSV antiguo ────────────────────
describe('resolucion fallida', () => {
  // Fila tal como la deja clAmpliarFilaV134 cuando clResolveLeaf no resuelve:
  // marcada como esquema 2, sin categoria y sin aspectos inventados.
  const rota = (o) => Object.assign({
    _esquema: 2, sku: 'CL-ROTA-01', categoryId: '', categoryRuta: '', aspects: {},
    _taxError: { codigo: 'COMBINACION_NO_EXISTE', mensaje: 'no hay categoria oficial' },
    title: 'Prenda sin categoria', condition: 'NWT', price: '25.00',
    photos: 'u', description: '<p>d</p>', weightMajor: 1, weightMinor: 0,
  }, o || {});

  test('clAmpliarFilaV134 marca esquema 2 aunque la resolucion falle', () => {
    const fn = extraerFn(APP, 'clAmpliarFilaV134');
    // el marcado ocurre ANTES de intentar resolver
    const iMarca = fn.indexOf('row._esquema');
    const iResolver = fn.indexOf('clResolveLeaf');
    assert.ok(iMarca > 0 && iResolver > 0, 'faltan piezas');
    assert.ok(iMarca < iResolver, 'el esquema debe marcarse antes de resolver');
    // y no hay ningun return que se salte el marcado con el flag encendido
    assert.equal(/if \(!r\.ok\) return row;/.test(fn), false,
      'quedo el retorno que degradaba la fila al CSV antiguo');
  });

  // Con el PASO 5, una fila rota entraba igual al CSV v134 con la categoria
  // vacia: no se bloqueaba nada todavia. El PASO 6 cambia esa politica a
  // proposito -- una fila con _taxError es precisamente uno de los motivos de
  // bloqueo -- y tests/bloqueo.test.mjs cubre ese caso de forma exhaustiva
  // (bloquea el lote entero, incluidas las filas viejas que lo acompanen, sin
  // Drive, sin Sheet, sin localStorage). Lo que se comprueba aqui es la
  // garantia de BAJO NIVEL: si algo llegara a construir el CSV sin pasar por
  // la puerta de bloqueo, clBuildCsvV134 seguiria sin inventar nada para esta
  // fila -- ni categoria, ni aspectos, y el SKU no desaparece en silencio.
  test('via buildDirect: categoryId vacio, sin aspectos inventados, SKU conservado', async () => {
    const r = await buildDirect(APP, TAX, [rota()], OFICIAL);
    const p = parse(r.csv);
    assert.equal(p.filas.length, 1, 'la fila no puede desaparecer');
    assert.equal(p.filas[0]['*Category'], '', 'la categoria debe ir vacia');
    assert.ok(r.csv.includes('CL-ROTA-01'), 'el SKU debe seguir presente');
    for (const inventado of ['63861', '53159', '57990', '19.99', 'Regular (B/M)'])
      assert.equal(r.csv.includes(inventado), false, `aparecio ${inventado}`);
    const cols = p.hdr.filter((h) => h.startsWith('C:') || h.startsWith('*C:'));
    for (const c of cols) assert.equal(p.filas[0][c], '', `${c} no esta vacia`);
  });

  test('el panel del PASO 4 informa el problema de esa fila', () => {
    // clAmpliarFilaV134 guarda el motivo para que se pueda mostrar
    const fn = extraerFn(APP, 'clAmpliarFilaV134');
    assert.match(fn, /_taxError/);
    // y clCsvRowV134 lo registra entre los problemas del lote
    assert.match(extraerFn(APP, 'clCsvRowV134'), /_taxError/);
  });
});

// ── 9. ConditionID solo derivado ───────────────────────────────────────────
describe('ConditionID', () => {
  test('1000 solo aparece cuando la condicion capturada es NWT', async () => {
    const esperado = { NWT: '1000', NWOT: '1500', EXCEL: '3000', GOOD: '3000', FAIR: '3000' };
    for (const [cond, id] of Object.entries(esperado)) {
      const p = parse((await csvDe([nueva('55793', aspectosValidos('55793'), { condition: cond })], true, APP)).capturados[0].csv);
      assert.equal(p.filas[0]['*ConditionID'], id, cond);
    }
  });

  test('via buildDirect: condicion ausente o desconocida deja la celda vacia, nunca 1000', async () => {
    // Garantia de bajo nivel de clCsvRowV134. En produccion una condicion asi
    // ya bloquea el lote entero en clExportEbayCSV -- ver tests/bloqueo.test.mjs.
    for (const cond of ['', undefined, 'INVENTADA', 'nwt', 'New']) {
      const r = await buildDirect(APP, TAX, [nueva('55793', aspectosValidos('55793'), { condition: cond })], OFICIAL);
      assert.equal(parse(r.csv).filas[0]['*ConditionID'], '', JSON.stringify(cond));
    }
  });

  test('el mapa de condiciones no tiene entrada por defecto', () => {
    const m = APP.match(/var CL_CONDITION_IDS = \{[^}]*\};/)[0];
    assert.equal(/\|\|/.test(m), false, 'el mapa tiene un fallback');
    assert.equal(/default/i.test(m), false);
    const fn = extraerFn(APP, 'clCsvRowV134');
    assert.equal(/CL_CONDITION_IDS\[[^\]]*\]\s*\|\|/.test(fn), false, 'se aplica un fallback al leerlo');
  });
});
