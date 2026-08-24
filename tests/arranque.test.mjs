// Pruebas permanentes del PASO 7 (preparacion) — arranque coordinado
// (autenticacion -> taxonomia -> render) y vista previa local del CSV v134.
//
// Todo esto vive detras del flag CL_TAXONOMY_V134_ENABLED, que sigue en
// false. Estas pruebas encienden el flag SOLO dentro del sandbox aislado de
// cada caso (nunca en el modulo real cl-taxonomy.js), igual que ya hacen
// aspectos.test.mjs, csv.test.mjs, bloqueo.test.mjs y validacion.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearSandbox, arrancar, previsualizar, reintentar, construirCsvDirecto, cargarTaxonomiaFixture } from './_arranque.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const TAX = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8');

// T (el modulo require()ado) es solo para construir fixtures de aspectos
// oficiales -- no interviene en el sandbox de cada prueba, que carga su
// propia copia aislada de cl-taxonomy.js.
await (async () => {
  T.clTaxonomyReset();
  const r = await T.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => OFICIAL }), forzar: true });
  if (!r.ok) throw new Error('no cargo la taxonomia para las fixtures: ' + r.codigo);
  T._setEnabled(false);
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

const AUTENTICADO = { savvy_session_user: 'demo', savvy_session_token: 'tok-123' };
const respuestaOk        = () => ({ ok: true, json: async () => OFICIAL });
const respuesta404       = () => ({ ok: false, status: 404 });
const respuestaCorrupta  = () => ({ ok: true, json: async () => ({ esquema: 1 }) });
const respuestaVerMala   = () => ({ ok: true, json: async () => Object.assign({}, OFICIAL, { categoryTreeVersion: '133' }) });

// ── 1. autenticacion antes que taxonomia ────────────────────────────────────
describe('arranque coordinado — autenticacion', () => {
  test('sin sesion valida: no hay fetch de taxonomia, no hay render, no hay overlay', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: {} });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaOk());
    await arrancar(sb);
    assert.equal(sb.taxonomyFetchCount(), 0, 'no debe pedir la taxonomia sin sesion');
    assert.equal(sb.renders.clRenderSKU, 0, 'no debe renderizar sin sesion');
    assert.equal(sb.overlaysCreados.length, 0, 'ningun overlay debe tapar la pantalla de login');
  });

  test('con solo el usuario pero sin token (sesion a medio cerrar): sigue sin arrancar', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: { savvy_session_user: 'demo' } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaOk());
    await arrancar(sb);
    assert.equal(sb.taxonomyFetchCount(), 0);
    assert.equal(sb.renders.clRenderSKU, 0);
  });
});

// ── 2. login exitoso: una sola carga, un solo render ────────────────────────
describe('arranque coordinado — login exitoso', () => {
  test('una sola carga y un solo render, incluso si algo lo llama dos veces', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaOk());
    await arrancar(sb);
    await arrancar(sb);   // simula una segunda llamada accidental
    assert.equal(sb.taxonomyFetchCount(), 1, 'debe cargar la taxonomia una sola vez');
    assert.equal(sb.renders.clRenderSKU, 1, 'debe renderizar el paso 1 una sola vez');
    assert.equal(sb.renders.clUpdateClFAB, 1);
    assert.equal(sb.overlaysCreados.length, 1, 'solo el overlay de carga, ninguno de bloqueo');
    assert.match(sb.overlaysCreados[0].innerHTML, /Cargando categorias/);
  });

  test('la carga exitosa limpia su propio temporizador de timeout (no queda pendiente)', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaOk());
    await arrancar(sb);
    assert.equal(sb.timers.length, 1, 'se registro el temporizador del timeout');
    assert.deepEqual(sb.timersLimpiados, [sb.timers.length], 'clearTimeout se llamo con ese mismo id');
  });
});

// ── 3. manejo de conexion ────────────────────────────────────────────────────
describe('arranque coordinado — manejo de conexion', () => {
  test('404: bloquea, no renderiza, no tapa el login (ya paso la autenticacion)', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuesta404());
    await arrancar(sb);
    assert.equal(sb.renders.clRenderSKU, 0);
    // overlaysCreados es un registro de TODO lo creado, en orden: primero el
    // de "Cargando...", luego el de bloqueo (el de carga ya se quito, pero
    // sigue contado aqui). El ultimo es el que importa para el mensaje.
    assert.equal(sb.overlaysCreados.length, 2, 'carga + bloqueo');
    const bloqueo = sb.overlaysCreados[sb.overlaysCreados.length - 1];
    assert.match(bloqueo.innerHTML, /HTTP/);
    assert.match(bloqueo.innerHTML, /Reintentar/);
    assert.equal(sb.timersLimpiados.length, 1, 'un fallo antes del timeout tambien limpia el temporizador');
  });

  test('JSON corrupto: bloquea y no renderiza', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaCorrupta());
    await arrancar(sb);
    assert.equal(sb.renders.clRenderSKU, 0);
    assert.equal(sb.overlaysCreados.length, 2);
  });

  test('version incorrecta: bloquea y no renderiza', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuestaVerMala());
    await arrancar(sb);
    assert.equal(sb.renders.clRenderSKU, 0);
    assert.match(sb.overlaysCreados[sb.overlaysCreados.length - 1].innerHTML, /VERSION/);
  });

  test('timeout: no espera para siempre, bloquea con codigo TIMEOUT y no renderiza', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => new Promise(() => {}); // nunca se resuelve
    await arrancar(sb);
    assert.equal(sb.renders.clRenderSKU, 0, 'sin timeout disparado, no debe renderizar');
    assert.equal(sb.overlaysCreados.length, 1, 'solo el overlay de carga, todavia esperando');
    assert.equal(sb.timers.length, 1, 'debe registrar el temporizador del timeout');
    sb.timers[0].fn();   // dispara el timeout manualmente -- nada de esperar de verdad
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sb.renders.clRenderSKU, 0);
    assert.equal(sb.overlaysCreados.length, 2);
    assert.match(sb.overlaysCreados[sb.overlaysCreados.length - 1].innerHTML, /TIMEOUT/);
  });

  test('reintentar despues de un fallo hace una carga nueva y renderiza si tiene exito', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    sb.ctx.ClTaxonomy._setEnabled(true);
    sb.ctx.__fetchTax = () => Promise.resolve(respuesta404());
    await arrancar(sb);
    assert.equal(sb.taxonomyFetchCount(), 1);
    assert.equal(sb.renders.clRenderSKU, 0);

    sb.ctx.__fetchTax = () => Promise.resolve(respuestaOk());   // el reintento ahora tiene exito
    await reintentar(sb);
    assert.equal(sb.taxonomyFetchCount(), 2, 'el reintento debe pedir la taxonomia de nuevo');
    assert.equal(sb.renders.clRenderSKU, 1, 'tras el reintento exitoso, renderiza');
    assert.equal(sb.renders.clUpdateClFAB, 1);
  });
});

// ── 4. flag apagado: identico a antes del PASO 7 ────────────────────────────
describe('arranque coordinado — flag apagado (compatibilidad)', () => {
  test('autenticado, flag apagado: renderiza sin fetch y sin ningun overlay', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: AUTENTICADO });
    // el flag NO se enciende -- se queda en su valor real (false)
    await arrancar(sb);
    assert.equal(sb.taxonomyFetchCount(), 0, 'con el flag apagado nunca hay fetch de taxonomia');
    assert.equal(sb.renders.clRenderSKU, 1);
    assert.equal(sb.renders.clUpdateClFAB, 1);
    assert.equal(sb.overlaysCreados.length, 0, 'sin flag no debe aparecer pantalla de carga ni de bloqueo');
  });

  test('sin login, flag apagado: no renderiza (la pantalla de login sigue siendo la unica visible)', async () => {
    const sb = crearSandbox(APP, TAX, { sessionStorage: {} });
    await arrancar(sb);
    assert.equal(sb.renders.clRenderSKU, 0);
    assert.equal(sb.taxonomyFetchCount(), 0);
    assert.equal(sb.overlaysCreados.length, 0);
  });

  test('el flag sigue en false en el fuente', () => {
    assert.match(TAX, /var CL_TAXONOMY_V134_ENABLED = false;/);
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(APP), false);
  });
});

// ── 5. vista previa local del CSV v134 ──────────────────────────────────────
describe('vista previa v134 — contenido y descarga local', () => {
  test('preview valido genera exactamente el mismo CSV que clBuildCsvV134, listo para descargar', async () => {
    const fila = filaValida();
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: JSON.stringify([fila]) } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    await cargarTaxonomiaFixture(sb, OFICIAL);
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 1, 'debe crear un Blob local para descargar');
    const esperado = construirCsvDirecto(sb, [fila]);
    const contenidoBlob = sb.blobsCreados[0].blob.parts.join('');
    // El Blob lleva un BOM (﻿) al frente para que Excel/Numbers abran
    // bien los acentos -- se descuenta antes de comparar.
    assert.equal(contenidoBlob.replace(/^﻿/, ''), esperado.csv, 'el contenido a descargar debe coincidir byte a byte');
    // La vista tambien debe poder REVISARSE en pantalla: el mismo contenido
    // va en el overlay (escapado para HTML), no solo en el Blob.
    const overlay = sb.overlaysCreados[sb.overlaysCreados.length - 1];
    assert.match(overlay.innerHTML, /Descargar \.csv/);
    assert.match(overlay.innerHTML, /Copiar al portapapeles/);
  });

  test('preview invalido bloquea: no crea ningun Blob, muestra el aviso del PASO 6', async () => {
    const fila = filaValida({ condition: '' });   // condicion invalida
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: JSON.stringify([fila]) } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    await cargarTaxonomiaFixture(sb, OFICIAL);
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 0, 'no debe generar nada con datos invalidos');
    assert.ok(sb.avisos.some((a) => /EXPORTACION DETENIDA/.test(a)), 'debe mostrar el bloqueo del PASO 6');
  });

  test('con el flag apagado, la vista previa no hace nada', async () => {
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: JSON.stringify([filaValida()]) } });
    // flag no se enciende
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 0);
    assert.equal(sb.avisos.length, 0);
    assert.equal(sb.toasts.length, 0);
  });
});

describe('vista previa v134 — cero efectos externos', () => {
  test('no llama Sheet, Drive, fetch de subida ni toca localStorage (incluida la descarga)', async () => {
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: JSON.stringify([filaValida()]) } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    await cargarTaxonomiaFixture(sb, OFICIAL);
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 1, 'confirma que la descarga local si se preparo');
    assert.equal(sb.llamadasRegistro.length, 0, 'clSendToRegistroSheet no debe llamarse');
    assert.equal(sb.llamadasSubida.length, 0, 'ningun fetch de subida (Drive)');
    assert.equal(sb.taxonomyFetchCount(), 0, 'no vuelve a pedir el JSON de taxonomia');
    assert.equal(sb.escrituras.length, 0, 'cero setItem/removeItem/clear, tampoco al descargar');
  });

  test('clPreviewCsvV134 no referencia clEntregarCsv ni clSendToRegistroSheet en su fuente', () => {
    const fn = extraerFn(APP, 'clPreviewCsvV134');
    for (const prohibido of ['clEntregarCsv', 'clSendToRegistroSheet', 'setItem', 'removeItem', '.clear('])
      assert.equal(fn.includes(prohibido), false, `clPreviewCsvV134 contiene ${prohibido}`);
  });

  test('clPreviewCsvV134 usa clBuildCsvV134 directamente (no una copia)', () => {
    const fn = extraerFn(APP, 'clPreviewCsvV134');
    assert.match(fn, /=\s*clBuildCsvV134\(/);
  });

  test('clPreviewDescargarCsv no referencia fetch, clEntregarCsv, clSendToRegistroSheet ni localStorage', () => {
    const fn = extraerFn(APP, 'clPreviewDescargarCsv');
    for (const prohibido of ['fetch(', 'clEntregarCsv', 'clSendToRegistroSheet', 'localStorage'])
      assert.equal(fn.includes(prohibido), false, `clPreviewDescargarCsv contiene ${prohibido}`);
  });

  test('clPreviewDescargarCsv construye la descarga con Blob + URL.createObjectURL y un <a download>', () => {
    const fn = extraerFn(APP, 'clPreviewDescargarCsv');
    assert.match(fn, /new Blob\(/);
    assert.match(fn, /URL\.createObjectURL\(/);
    assert.match(fn, /download="?'?\s*\+?\s*fname/);
  });
});

describe('vista previa v134 — sesiones antiguas y mixtas', () => {
  test('sesion solo con filas antiguas: no genera nada, no toca la sesion', async () => {
    const sesionInicial = JSON.stringify([filaVieja()]);
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: sesionInicial } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    await cargarTaxonomiaFixture(sb, OFICIAL);
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 0);
    assert.equal(sb.toasts.length, 1);
    assert.equal(sb.escrituras.length, 0);
    assert.equal(sb.store.cl_ebay_session, sesionInicial, 'la sesion original no cambia');
  });

  test('sesion mixta: la vista previa solo incluye las filas v134, sin tocar las antiguas', async () => {
    const vieja = filaVieja();
    const nueva = filaValida();
    const sesionInicial = JSON.stringify([vieja, nueva]);
    const sb = crearSandbox(APP, TAX, { localStorage: { cl_ebay_session: sesionInicial } });
    sb.ctx.ClTaxonomy._setEnabled(true);
    await cargarTaxonomiaFixture(sb, OFICIAL);
    await previsualizar(sb);
    assert.equal(sb.blobsCreados.length, 1);
    const overlay = sb.overlaysCreados[sb.overlaysCreados.length - 1];
    assert.match(overlay.innerHTML, /🧪 1 articulo/, 'solo la fila v134 entra al CSV de la vista previa');
    assert.equal(sb.escrituras.length, 0);
    assert.equal(sb.store.cl_ebay_session, sesionInicial, 'la sesion original (vieja + nueva) no cambia');
  });
});

// ── 6. caché ──────────────────────────────────────────────────────────────
describe('cache — PASO 7', () => {
  test('la ruta del JSON de taxonomia trae version explicita', () => {
    assert.match(TAX, /RUTA\s*=\s*'taxonomy\/ebay-us-v134\.json\?v=134-1'/);
  });

  test('los <script> de app.js y cl-taxonomy.js en index.html traen query string de version', () => {
    assert.match(HTML, /taxonomy\/cl-taxonomy\.js\?v=[\w-]+/);
    assert.match(HTML, /app\.js\?v=[\w-]+/);
  });
});

// ── 7. interfaz ──────────────────────────────────────────────────────────────
describe('interfaz — PASO 7', () => {
  test('el arranque automatico en index.html pasa por clArrancarCaptura, no renderiza directo', () => {
    assert.match(HTML, /window\.addEventListener\('load', function\(\) \{[\s\S]{0,120}clArrancarCaptura\(\)/);
    assert.equal(/window\.addEventListener\('load', function\(\) \{\s*\n\s*if \(typeof clRenderSKU/.test(HTML), false,
      'ya no debe llamar clRenderSKU directo desde ese listener');
  });

  test('el boton de vista previa v134 solo se ofrece con el flag encendido', () => {
    assert.match(APP, /clTaxV134\(\) \? '<button onclick="clPreviewCsvV134\(\)"/);
  });
});
