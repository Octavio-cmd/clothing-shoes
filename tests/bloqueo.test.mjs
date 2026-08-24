// Pruebas permanentes del PASO 6 — bloqueo seguro de exportacion v134.
//
// Objetivo: cuando el flag este encendido, un lote con CUALQUIER fila de
// esquema 2 invalida no debe generar, descargar, subir a Drive ni enviar a
// la hoja de registro absolutamente nada. Con el flag apagado, nada de esto
// se ejecuta: el CSV antiguo sigue byte a byte igual (verificado en
// csv.test.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandbox } from './_csv.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const TAX = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');

// T (el modulo require()ado) es lo que usa aspectosValidos() para construir
// fixtures; hay que cargarle los datos oficiales, igual que en los demas
// archivos de prueba. El sandbox de cada llamada a csvDe() carga su PROPIA
// copia por separado -- esto es solo para el lado del test.
await (async () => {
  T.clTaxonomyReset();
  const r = await T.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => OFICIAL }), forzar: true });
  if (!r.ok) throw new Error('no cargo la taxonomia para las fixtures: ' + r.codigo);
})();

const extraerFn = (s, f) => {
  const i = s.indexOf('function ' + f + '('); if (i < 0) return '';
  let d = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
  return '';
};

function aspectosValidos(cid) {
  const a = {};
  for (const x of T.clAspectsFor(cid)) if (x.requerido) a[x.nombre] = x.abierto ? 'Marca X' : x.valores[0];
  return a;
}

// Fila de esquema 2 valida por defecto: Women's Heels 55793, completa.
const filaValida = (o) => Object.assign({
  _esquema: 2, sku: 'CL-OK-01', categoryId: '55793', categoryRuta: 'x', title: 'Titulo',
  condition: 'NWT', price: '29.99', photos: 'u', description: '<p>d</p>',
  weightMajor: 1, weightMinor: 0, aspects: aspectosValidos('55793'),
}, o || {});

const filaVieja = (o) => Object.assign({
  sku: 'A-VIEJA', categoryId: '53159', title: 'Top', conditionId: 1000,
  brand: 'Nike', sizeType: 'Regular', size: 'M', department: 'Women', color: 'Black',
  style: 'Classic', type: 'T-Shirt', price: '22.00', photos: 'u', description: '<p>d</p>',
  weightMajor: 0, weightMinor: 8, inseam: '', dressLength: '', outerMaterial: '',
  activity: '', shoeWidth: '',
}, o || {});

const csvDe = (sess) => sandbox(APP, TAX, sess, true, OFICIAL);
// Un lote se considera bloqueado si no se genero ningun archivo y hubo un
// aviso. El precio invalido puede detenerse en la guardia de precio previa
// (mensaje "EXPORT DETENIDO") o en la puerta del PASO 6 (mensaje
// "EXPORTACION DETENIDA") -- las dos son bloqueos legitimos.
const bloqueado = (r) => r.capturados.length === 0
  && r.avisos.some((a) => /EXPORT DETENIDO/.test(a) || /EXPORTACION DETENIDA/.test(a));
// Bloqueo especificamente por la puerta NUEVA del PASO 6 (no por la guardia
// de precio preexistente), para las pruebas que necesitan distinguir cual.
const bloqueadoPorTaxonomia = (r) => r.capturados.length === 0
  && r.avisos.some((a) => /EXPORTACION DETENIDA/.test(a));

// ── 1. el bloqueo ocurre ANTES de cualquier efecto externo ─────────────────
describe('orden: antes de cualquier efecto externo', () => {
  test('con una fila invalida, clSendToRegistroSheet nunca se llama', async () => {
    const r = await csvDe([filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } })]);
    assert.equal(r.llamadasRegistro.length, 0);
  });

  test('con una fila invalida, fetch (Drive) nunca se llama', async () => {
    const r = await csvDe([filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } })]);
    assert.equal(r.llamadasFetch.length, 0);
  });

  test('con una fila invalida, no se genera ni descarga ningun CSV', async () => {
    const r = await csvDe([filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } })]);
    assert.equal(r.capturados.length, 0);
  });

  test('con una fila invalida, localStorage no recibe ninguna escritura', async () => {
    const r = await csvDe([filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } })]);
    assert.equal(r.escrituras.length, 0, JSON.stringify(r.escrituras));
    assert.equal(r.sessionFinal, r.sessionInicial, 'la sesion cambio de contenido');
  });

  test('con un lote VALIDO, si se llega hasta clSendToRegistroSheet y a Drive', async () => {
    // Control: si el bloqueo bloqueara siempre, estas pruebas de "cero
    // llamadas" no probarian nada. Con datos validos, el lote debe avanzar.
    const r = await csvDe([filaValida()]);
    assert.equal(r.llamadasRegistro.length, 1);
    assert.equal(r.llamadasFetch.length, 1);
    assert.equal(r.capturados.length, 1);
  });

  test('el gate esta ubicado antes de clSendToRegistroSheet en el codigo fuente', () => {
    const fn = extraerFn(APP, 'clExportEbayCSV');
    const iGate = fn.indexOf('clValidarLoteV134');
    const iRegistro = fn.indexOf('clSendToRegistroSheet(sess)');
    assert.ok(iGate > 0 && iRegistro > 0, 'faltan piezas');
    assert.ok(iGate < iRegistro, 'la validacion debe preceder al envio a la hoja');
  });
});

// ── 2. cada tipo de problema bloquea ────────────────────────────────────────
describe('cada problema bloquea el lote', () => {
  test('categoryId vacio', async () => {
    const r = await csvDe([filaValida({ categoryId: '', aspects: {},
      _taxError: { codigo: 'COMBINACION_NO_EXISTE', mensaje: 'no hay categoria' } })]);
    assert.ok(bloqueado(r));
  });

  test('categoryId desconocido / no oficial', async () => {
    const r = await csvDe([filaValida({ categoryId: '999999' })]);
    assert.ok(bloqueado(r));
  });

  test('aspecto obligatorio ausente', async () => {
    const r = await csvDe([filaValida({ aspects: { 'Brand': 'X' } })]);   // faltan Department, US Shoe Size, Style, Color, Upper Material
    assert.ok(bloqueado(r));
  });

  test('aspecto no admitido por la categoria', async () => {
    const r = await csvDe([filaValida({ aspects: Object.assign({}, aspectosValidos('55793'), { 'Skirt Length': 'Midi' }) })]);
    assert.ok(bloqueado(r), 'Skirt Length no existe en Heels');
  });

  test('valor fuera de la lista oficial', async () => {
    const r = await csvDe([filaValida({ aspects: Object.assign({}, aspectosValidos('55793'), { 'Color': 'Negro' }) })]);
    assert.ok(bloqueado(r));
  });

  test('Size usado en calzado', async () => {
    const r = await csvDe([filaValida({ aspects: Object.assign({}, aspectosValidos('55793'), { 'Size': 'M' }) })]);
    assert.ok(bloqueado(r));
  });

  test('US Shoe Size usado en ropa', async () => {
    const r = await csvDe([filaValida({ categoryId: '63864',
      aspects: Object.assign({}, aspectosValidos('63864'), { 'US Shoe Size': '8' }) })]);
    assert.ok(bloqueado(r));
  });

  test('Size Type invalido / no admitido', async () => {
    // 105440 Scrubs Tops no admite Size Type en absoluto.
    const r = await csvDe([filaValida({ categoryId: '105440',
      aspects: Object.assign({}, aspectosValidos('105440'), { 'Size Type': 'Regular' }) })]);
    assert.ok(bloqueado(r));
  });

  test('Department invalido / no admitido', async () => {
    const r = await csvDe([filaValida({ aspects: Object.assign({}, aspectosValidos('55793'), { 'Department': 'Men' }) })]);
    assert.ok(bloqueado(r));
  });

  test('condicion ausente', async () => {
    const r = await csvDe([filaValida({ condition: '' })]);
    assert.ok(bloqueado(r));
  });

  test('condicion desconocida', async () => {
    const r = await csvDe([filaValida({ condition: 'INVENTADA' })]);
    assert.ok(bloqueado(r));
  });

  test('precio vacio', async () => {
    const r = await csvDe([filaValida({ price: '' })]);
    assert.ok(bloqueado(r));
  });

  test('precio no numerico', async () => {
    const r = await csvDe([filaValida({ price: 'abc' })]);
    assert.ok(bloqueado(r));
  });

  test('precio cero', async () => {
    const r = await csvDe([filaValida({ price: '0' })]);
    assert.ok(bloqueado(r));
  });

  test('precio negativo: clNormalizePrice descarta el signo, no hay caso independiente', async () => {
    // clNormalizePrice (protegida, sin tocar) quita todo caracter que no sea
    // digito o punto -- el signo desaparece. '-5.00' normaliza a 5.00, un
    // precio VALIDO. No existe un "precio negativo" que sobreviva hasta el
    // validador: se descubre aqui en vez de afirmar un bloqueo que no ocurre.
    const r = await csvDe([filaValida({ price: '-5.00' })]);
    assert.equal(r.capturados.length, 1, 'un precio con signo negativo se normaliza a positivo y exporta');
    // El caso real de "solo signo, sin digitos" si es no-numerico y bloquea,
    // y ya lo cubre la prueba 'precio no numerico'.
  });

  test('precio fuera del rango actual (por arriba)', async () => {
    // Este caso ya lo detiene la guardia de precio de clExportEbayCSV, antes
    // de llegar siquiera a separar por esquema -- tambien es un bloqueo.
    const r = await csvDe([filaValida({ price: '999.00' })]);
    assert.ok(r.capturados.length === 0);
    assert.ok(r.avisos.some((a) => /EXPORT DETENIDO/.test(a) || /EXPORTACION DETENIDA/.test(a)));
  });

  test('fila marcada con _taxError', async () => {
    const r = await csvDe([filaValida({ categoryId: '', aspects: {},
      _taxError: { codigo: 'FALTA_RAMA_BASE', mensaje: 'Unisex de adulto necesita rama base.' } })]);
    assert.ok(bloqueado(r));
  });
});

// ── 3. el mensaje enumera todo, agrupado por SKU ────────────────────────────
describe('mensaje de bloqueo', () => {
  test('enumera varios SKU, cada uno con sus propios problemas', async () => {
    // Precio valido en las tres filas a proposito: el problema de cada una
    // debe detectarlo el gate del PASO 6, no la guardia de precio previa
    // (que intercepta el lote entero por su cuenta y no enumera por SKU).
    const r = await csvDe([
      filaValida({ sku: 'SKU-A', aspects: { 'Brand': 'X' } }),                                    // obligatorios ausentes
      filaValida({ sku: 'SKU-B', condition: '' }),                                                   // condicion invalida
      filaValida({ sku: 'SKU-C', categoryId: '', aspects: {}, _taxError: { codigo: 'X', mensaje: 'no resuelve' } }),
    ]);
    assert.ok(bloqueadoPorTaxonomia(r));
    const msg = r.avisos.find((a) => /EXPORTACION DETENIDA/.test(a));
    assert.ok(msg, 'no hubo aviso de EXPORTACION DETENIDA: ' + JSON.stringify(r.avisos));
    for (const sku of ['SKU-A', 'SKU-B', 'SKU-C']) assert.ok(msg.includes(sku), `falta ${sku}`);
    assert.equal((msg.match(/EXPORTACION DETENIDA — 3 articulo/) || []).length, 1);
  });

  test('muestra el nombre del aspecto con problema, no solo un contador', async () => {
    const r = await csvDe([filaValida({ sku: 'SKU-A',
      aspects: Object.assign({}, aspectosValidos('55793'), { 'Color': 'Negro' }) })]);
    const msg = r.avisos[0];
    assert.match(msg, /Color/);
  });

  test('explica que no se genero ni envio ningun archivo', async () => {
    const r = await csvDe([filaValida({ aspects: { 'Brand': 'X' } })]);
    const msg = r.avisos[0];
    assert.match(msg, /No se gener.*ni.*subi.*archivo|No se gener/i);
  });

  test('no borra la sesion: invita a corregir', async () => {
    const r = await csvDe([filaValida({ aspects: { 'Brand': 'X' } })]);
    const msg = r.avisos[0];
    assert.match(msg, /[Cc]orrige/);
    assert.equal(r.sessionFinal, r.sessionInicial);
  });
});

// ── 4. atomicidad ────────────────────────────────────────────────────────
describe('atomicidad', () => {
  test('una sola fila mala bloquea el lote entero, aunque el resto sea valido', async () => {
    const r = await csvDe([filaValida({ sku: 'BUENA-1' }), filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } }),
                            filaValida({ sku: 'BUENA-2' })]);
    assert.ok(bloqueado(r));
  });

  test('no se genera archivo parcial con las filas buenas', async () => {
    const r = await csvDe([filaValida({ sku: 'BUENA' }), filaValida({ sku: 'MALA', aspects: {} })]);
    assert.equal(r.capturados.length, 0, 'no debe existir ningun archivo, ni siquiera parcial');
  });

  test('las filas antiguas del mismo lote NO se exportan por separado', async () => {
    const r = await csvDe([filaVieja(), filaValida({ sku: 'MALA', aspects: { 'Brand': 'X' } })]);
    assert.equal(r.capturados.length, 0, 'el lote antiguo tampoco debe salir');
  });

  test('cero llamadas a Drive cuando bloquea', async () => {
    const r = await csvDe([filaValida({ aspects: {} })]);
    assert.equal(r.llamadasFetch.length, 0);
  });

  test('cero llamadas a clSendToRegistroSheet cuando bloquea', async () => {
    const r = await csvDe([filaValida({ aspects: {} })]);
    assert.equal(r.llamadasRegistro.length, 0);
  });

  test('cero escrituras de localStorage cuando bloquea', async () => {
    const r = await csvDe([filaValida({ aspects: {} })]);
    assert.equal(r.escrituras.length, 0);
  });

  test('no es "exporta lo bueno y avisa de lo malo": documentado en el codigo', () => {
    const fn = extraerFn(APP, 'clExportEbayCSV');
    const bloque = fn.slice(fn.indexOf('DESVÍO AL CSV v134'), fn.indexOf('function q(v)'));
    // El comentario real esta partido en dos lineas de // ...: se tolera
    // cualquier cosa (incluido el "// " del salto de linea) entre las palabras.
    assert.match(bloque, /todo[\s\S]{0,20}o[\s\S]{0,10}nada/i);
  });
});

// ── 5. compatibilidad ───────────────────────────────────────────────────────
describe('compatibilidad', () => {
  test('con el flag apagado, el gate ni se evalua', () => {
    const fn = extraerFn(APP, 'clExportEbayCSV');
    // clValidarLoteV134 solo aparece dentro del bloque `if (clTaxV134())`
    const iIf = fn.indexOf('if (clTaxV134())');
    const iGate = fn.indexOf('clValidarLoteV134');
    assert.ok(iIf > 0 && iGate > iIf, 'el gate debe estar dentro del if del flag');
  });

  test('una sesion compuesta solo por registros antiguos usa el camino antiguo, sin validar nada', async () => {
    const r = await csvDe([filaVieja(), filaVieja({ sku: 'A-VIEJA-2', type: 'Jeans' })]);
    assert.equal(r.capturados.length, 1);
    assert.equal(r.avisos.length, 0, 'no debe haber ningun bloqueo ni aviso');
  });

  test('lote mixto con esquema 2 invalido bloquea TODO, incluidas las antiguas validas', async () => {
    const r = await csvDe([filaVieja(), filaValida({ sku: 'MALA', aspects: {} })]);
    assert.ok(bloqueado(r));
  });

  test('lote mixto con esquema 2 valido exporta ambos, sin bloquear', async () => {
    const r = await csvDe([filaVieja(), filaValida()]);
    assert.equal(r.capturados.length, 2, 'deben salir los dos archivos');
    assert.equal(r.avisos.length, 1, 'solo el aviso de lote mixto, no un bloqueo');
    assert.equal(/EXPORTACION DETENIDA/.test(r.avisos[0]), false);
  });

  test('un registro antiguo nunca se valida como si fuera esquema 2', async () => {
    // Una fila vieja NUNCA trae aspects, categoryId oficial ni condition
    // reconocible en el vocabulario v134 -- si se validara como esquema 2,
    // bloquearia siempre. Con solo antiguas, no debe bloquear.
    const r = await csvDe([filaVieja({ sku: 'SIN-NADA', categoryId: '', brand: '', sizeType: '',
      size: '', department: '', color: '', style: '', type: '', price: '20.00' })]);
    assert.equal(r.capturados.length, 1);
    assert.equal(r.avisos.length, 0);
  });
});

// ── 6. interfaz ──────────────────────────────────────────────────────────
describe('interfaz', () => {
  test('reutiliza el codigo de aviso, no crea un segundo mecanismo', () => {
    assert.match(APP, /function clMostrarBloqueoExport/);
    // clExportEbayCSV llama a clMostrarBloqueoExport, no a un alert() suelto
    const fn = extraerFn(APP, 'clExportEbayCSV');
    const bloque = fn.slice(fn.indexOf('DESVÍO AL CSV v134'), fn.indexOf('function q(v)'));
    assert.match(bloque, /clMostrarBloqueoExport/);
    assert.equal(/\balert\(/.test(bloque), false, 'no debe llamar a alert() directamente en el gate');
  });

  test('el aviso dice EXPORTACION DETENIDA de forma inequivoca', async () => {
    const r = await csvDe([filaValida({ aspects: {} })]);
    assert.match(r.avisos[0], /EXPORTACION DETENIDA/);
  });

  test('no modifica cl.aspects ni ningun dato del formulario automaticamente', () => {
    const fn = extraerFn(APP, 'clMostrarBloqueoExport');
    for (const prohibido of ['cl.aspects', 'cl.category', 'cl.size', 'delete cl.'])
      assert.equal(fn.includes(prohibido), false, `clMostrarBloqueoExport toca ${prohibido}`);
  });
});

// ── 7. flag y funciones puras ───────────────────────────────────────────────
describe('validacion pura', () => {
  test('clValidarLoteV134 agrupa por SKU y no es solo el primer error', () => {
    const fn = extraerFn(APP, 'clValidarLoteV134');
    assert.match(fn, /porSku\.push/);
    assert.equal(/return\s+problemas\[0\]/.test(fn), false);
  });

  test('CL_PRECIO_MIN y CL_PRECIO_MAX coinciden con la guardia de precio existente', () => {
    assert.match(APP, /var CL_PRECIO_MIN = 0\.99;/);
    assert.match(APP, /var CL_PRECIO_MAX = 499\.99;/);
  });

  // PASO 7 (preparacion): clTaxonomyBoot() esta conectado en clArrancarCaptura,
  // pero el flag sigue en false — clTaxonomyBoot() no hace fetch ni cambia nada.
  test('el flag sigue en false y clTaxonomyBoot conectado en un unico punto', () => {
    assert.match(TAX, /var CL_TAXONOMY_V134_ENABLED = false;/);
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(APP), false);
    assert.equal((APP.match(/clTaxonomyBoot\(\)/g) || []).length, 2);
  });
});
