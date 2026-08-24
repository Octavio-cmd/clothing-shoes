// Sandbox del PASO 7 (preparacion) — evalua el codigo real de app.js para
// probar clArrancarCaptura() (autenticacion -> taxonomia -> render) y
// clPreviewCsvV134() (vista previa local del CSV v134, sin efectos externos).
//
// Distinto de _csv.mjs porque necesita piezas que ese sandbox no ofrece:
// sessionStorage (autenticacion), setTimeout/clearTimeout controlables a mano
// (para simular un timeout sin esperar de verdad) y un document.getElementById
// que de verdad encuentra los overlays creados, para poder inspeccionar el
// texto que se le muestra al usuario (codigo de error, mensaje de "cargando").
import vm from 'node:vm';

export function crearSandbox(APP, taxSrc, opciones) {
  opciones = opciones || {};
  const store  = Object.assign({}, opciones.localStorage || {});
  const sstore = Object.assign({}, opciones.sessionStorage || {});

  const escrituras        = [];   // setItem/removeItem/clear sobre localStorage
  const lecturas          = [];   // getItem sobre localStorage
  const avisos            = [];   // alert()
  const toasts            = [];   // toast()
  const renders            = { clRenderSKU: 0, clUpdateClFAB: 0 };
  const llamadasRegistro   = [];  // clSendToRegistroSheet
  const llamadasSubida     = [];  // fetch que NO sea el de la taxonomia (Drive, etc.)
  const previews           = [];  // clShowExportOptions(csv, fname, n)
  const overlaysCreados    = [];  // cada div anadido a document.body, en orden
  const timers             = [];  // setTimeout capturados, no se disparan solos
  const timersLimpiados    = [];  // ids pasados a clearTimeout
  const blobsCreados       = [];  // cada Blob entregado a URL.createObjectURL
  const urlsRevocadas      = [];  // cada URL.revokeObjectURL
  let taxonomyFetchCount   = 0;
  const overlaysVivos = [];

  function nuevoElemento(tag) {
    const el = {
      tagName: tag, style: {}, innerHTML: '', _id: '',
      appendChild() {},
      remove() {
        const i = overlaysVivos.indexOf(el);
        if (i >= 0) overlaysVivos.splice(i, 1);
      },
      get id() { return this._id; },
      set id(v) { this._id = v; },
    };
    return el;
  }

  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, String, Number, Array, Object, Date, Promise,
    parseFloat, parseInt, isFinite, isNaN, RegExp,
    localStorage: {
      getItem(k){ lecturas.push(k); return store[k] === undefined ? null : store[k]; },
      setItem(k,v){ escrituras.push({ op:'setItem', k, v:String(v) }); store[k] = String(v); },
      removeItem(k){ escrituras.push({ op:'removeItem', k }); delete store[k]; },
      clear(){ escrituras.push({ op:'clear' }); for (const k in store) delete store[k]; },
    },
    sessionStorage: {
      getItem(k){ return sstore[k] === undefined ? null : sstore[k]; },
      setItem(k,v){ sstore[k] = String(v); },
      removeItem(k){ delete sstore[k]; },
    },
    toast(m){ toasts.push(m); },
    alert(m){ avisos.push(m); },
    confirm(){ return true; },
    clSendToRegistroSheet(s){ llamadasRegistro.push(s); },
    clShowExportOptions(csv, fname, n){ previews.push({ csv, fname, n }); },
    fetch(url, opt) {
      if (String(url).indexOf('ebay-us-v134.json') !== -1) {
        taxonomyFetchCount++;
        return ctx.__fetchTax ? ctx.__fetchTax() : Promise.reject(new Error('sin mock de taxonomia'));
      }
      llamadasSubida.push({ url, body: opt && opt.body });
      return { then(){ return { catch(){} }; } };
    },
    document: {
      createElement: nuevoElemento,
      getElementById(id) { return overlaysVivos.find(function (o) { return o._id === id; }) || null; },
      body: {
        appendChild(el) { overlaysVivos.push(el); overlaysCreados.push(el); },
      },
    },
    setTimeout(fn, ms) { const t = { fn, ms }; timers.push(t); return timers.length; },
    clearTimeout(id) { timersLimpiados.push(id); },
    // Blob/URL locales -- capturan el contenido sin escribir ningun archivo
    // de verdad, para poder comparar ese contenido contra clBuildCsvV134.
    Blob: function (parts, opts) { this.parts = parts; this.type = opts && opts.type; },
    URL: {
      createObjectURL(blob) {
        const url = 'blob:fake-' + blobsCreados.length;
        blobsCreados.push({ url, blob });
        return url;
      },
      revokeObjectURL(url) { urlsRevocadas.push(url); },
    },
    CL_SHIP_POLICY:'SHIP', CL_RET_POLICY:'RET', CL_PAY_POLICY:'PAY',
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(taxSrc, ctx);

  const fn = (n) => {
    const i = APP.indexOf('function ' + n + '(');
    if (i < 0) return '';
    let d = 0;
    for (let k = APP.indexOf('{', i); k < APP.length; k++) {
      if (APP[k] === '{') d++; else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
    }
    return '';
  };

  for (const n of [
    'savvyToken', 'clTaxV134',
    'clTaxonomyBoot', 'clTaxMostrarBloqueo', 'clTaxReintentar',
    'clUsuarioAutenticado', 'clArrancarCaptura',
    'clTaxMostrarCargando', 'clTaxOcultarCargando',
    'clSepararPorEsquema', 'clCsvPrefijo', 'clCsvHeaderV134', 'clCsvRowV134',
    'clBuildCsvV134', 'clCsvQ', 'clCsvNombre',
    'clNormalizePrice', 'clValidarFilaV134', 'clValidarLoteV134', 'clMostrarBloqueoExport',
    'clPreviewCsvV134', 'clPreviewDescargarCsv',
  ]) {
    const src = fn(n);
    if (src) vm.runInContext(src, ctx);
  }
  const m = APP.match(/var CL_CONDITION_IDS = \{[^}]*\};/);
  if (m) vm.runInContext(m[0], ctx);
  const minmax = APP.match(/var CL_PRECIO_MIN = [^;]+;\s*\n\s*var CL_PRECIO_MAX = [^;]+;/);
  if (minmax) vm.runInContext(minmax[0], ctx);
  const timeoutMs = APP.match(/var CL_TAX_BOOT_TIMEOUT_MS = [^;]+;/);
  if (timeoutMs) vm.runInContext(timeoutMs[0], ctx);
  vm.runInContext('var CL_ESQUEMA_FILA = 2; var clTaxBloqueado = false; var _clArranqueIniciado = false;', ctx);

  // Stubs de renderizado: no cargan el clRenderSKU real (necesita DOM
  // completo) -- solo cuentan cuantas veces se les llama, que es lo que
  // clArrancarCaptura debe garantizar (una sola vez).
  ctx.clRenderSKU = () => { renders.clRenderSKU++; };
  ctx.clUpdateClFAB = () => { renders.clUpdateClFAB++; };

  return {
    ctx, store, sstore, escrituras, lecturas, avisos, toasts, renders,
    llamadasRegistro, llamadasSubida, previews, overlaysCreados,
    timers, timersLimpiados, blobsCreados, urlsRevocadas, taxonomyFetchCount: () => taxonomyFetchCount,
  };
}

// Corre clArrancarCaptura() y espera a que su promesa interna (clTaxonomyBoot)
// se resuelva, dando tiempo a que los microtasks/timers registrados terminen.
export async function arrancar(sb) {
  vm.runInContext('clArrancarCaptura();', sb.ctx);
  await new Promise((r) => setTimeout(r, 20));
}

export async function previsualizar(sb) {
  vm.runInContext('clPreviewCsvV134();', sb.ctx);
}

// Carga datos reales de taxonomia DENTRO del sandbox, para las pruebas de la
// vista previa (clValidateTaxonomyItem necesita _datos poblado para poder
// decir si una fila es valida). Usa su propio fetch de fixture, que NO pasa
// por ctx.fetch -- no cuenta para taxonomyFetchCount ni interfiere con los
// timers del arranque coordinado.
export async function cargarTaxonomiaFixture(sb, datos) {
  sb.ctx.__datosFixture = datos;
  sb.ctx.__fetchFixture = () => ({ ok: true, json: async () => sb.ctx.__datosFixture });
  vm.runInContext(
    'clTaxonomyReset(); clLoadTaxonomy({ fetch: __fetchFixture, forzar: true })' +
    '.then(function(r){ __cargaFixture = r; });',
    sb.ctx
  );
  await new Promise((r) => setTimeout(r, 0));
  if (!sb.ctx.__cargaFixture || !sb.ctx.__cargaFixture.ok) {
    throw new Error('no se pudo cargar el fixture de taxonomia en el sandbox: '
      + JSON.stringify(sb.ctx.__cargaFixture));
  }
}

export async function reintentar(sb) {
  vm.runInContext('clTaxReintentar();', sb.ctx);
  await new Promise((r) => setTimeout(r, 20));
}

// Construye el CSV directamente con clBuildCsvV134, sin pasar por
// clPreviewCsvV134 ni por localStorage -- para comparar contra lo que
// entrego la vista previa y probar que es exactamente la misma funcion.
export function construirCsvDirecto(sb, filas) {
  sb.ctx.__filasDirectas = filas;
  vm.runInContext('__resultadoDirecto = clBuildCsvV134(__filasDirectas);', sb.ctx);
  return sb.ctx.__resultadoDirecto;
}
