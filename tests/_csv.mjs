// Sandbox que evalua el codigo real de app.js para dos usos distintos:
//   sandbox()    ejecuta clExportEbayCSV() completo -- incluida la puerta de
//                bloqueo del PASO 6 -- y captura el CSV interceptando fetch.
//   buildDirect() salta esa puerta y llama a clBuildCsvV134() directamente.
//                Sirve para comprobar la garantia de BAJO NIVEL de
//                clCsvRowV134/clBuildCsvV134: incluso si algo llamara a estas
//                funciones sin pasar por el bloqueo, no inventan un solo
//                valor. Es defensa en profundidad, no un atajo para eludir
//                el bloqueo en produccion -- clExportEbayCSV es la unica
//                puerta de entrada real.
import vm from 'node:vm';

function montar(APP, taxSrc, sess, flagOn, datos) {
  const capturados = [];
  const avisos = [];
  // Instrumentacion de efectos externos, para el PASO 6: cuenta lo que de
  // verdad toco el mundo exterior, para poder afirmar "cero" con evidencia y
  // no por ausencia de prueba en contrario.
  const llamadasRegistro = [];   // cada vez que se invoca clSendToRegistroSheet
  const llamadasFetch = [];      // cada vez que se invoca fetch (Drive), exito o no
  const escrituras = [];         // cada setItem/removeItem/clear sobre localStorage
  const sessionInicial = JSON.stringify(sess);
  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, String, Number, Array, Object, Date, parseFloat, parseInt, isFinite, isNaN, RegExp,
    localStorage: {
      _d: { cl_ebay_session: sessionInicial },
      getItem(k){ return this._d[k] === undefined ? null : this._d[k]; },
      setItem(k,v){ escrituras.push({ op: 'setItem', k, v: String(v) }); this._d[k]=String(v); },
      removeItem(k){ escrituras.push({ op: 'removeItem', k }); delete this._d[k]; },
      clear(){ escrituras.push({ op: 'clear' }); this._d = {}; },
    },
    toast(){}, alert(m){ avisos.push(m); }, confirm(){ return true; },
    clSendToRegistroSheet(s){ llamadasRegistro.push(s); },
    clShowExportOptions(csv,f,n){ capturados.push({csv,fname:f,n}); },
    fetch(url, opt){ llamadasFetch.push({ url, body: opt && opt.body });
                     try { const b=JSON.parse(opt.body); capturados.push({csv:b.csv,fname:b.filename}); } catch(e){}
                     return { then(){ return { catch(){} }; } }; },
    document: { createElement(){ return { style:{}, innerHTML:'', appendChild(){} }; },
                getElementById(){ return null; }, body:{ appendChild(){} } },
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
      if (APP[k]==='{') d++; else if (APP[k]==='}') { d--; if (!d) return APP.slice(i,k+1); }
    }
    return '';
  };
  const cargarFunciones = () => {
    for (const n of ['clIsTShirt','clBuildConditionText','clBuildCsvMeasurements',
                     'clNormalizePrice','clTaxV134','clSepararPorEsquema','clCsvPrefijo',
                     'clCsvHeaderV134','clCsvRowV134','clBuildCsvV134','clCsvQ','clCsvNombre',
                     'clEntregarCsv','clExportEbayCSVv134',
                     'clValidarFilaV134','clValidarLoteV134','clMostrarBloqueoExport',
                     'clExportEbayCSV']) {
      const src = fn(n); if (src) vm.runInContext(src, ctx);
    }
    const m = APP.match(/var CL_CONDITION_IDS = \{[^}]*\};/);
    if (m) vm.runInContext(m[0], ctx);
    const minmax = APP.match(/var CL_PRECIO_MIN = [^;]+;\s*\n\s*var CL_PRECIO_MAX = [^;]+;/);
    if (minmax) vm.runInContext(minmax[0], ctx);
    vm.runInContext('var CL_ESQUEMA_FILA = 2;', ctx);
  };

  // La copia del sandbox tiene su PROPIO estado: hay que cargarle los datos,
  // no basta con encender el flag del modulo que importan las pruebas.
  const listo = datos
    ? new Promise((res) => {
        ctx.__datos = datos;
        vm.runInContext('clTaxonomyReset();', ctx);
        ctx.__fetchTax = () => ({ ok: true, json: async () => ctx.__datos });
        vm.runInContext('clLoadTaxonomy({ fetch: __fetchTax, forzar: true }).then(function(r){ __cargado = r; });', ctx);
        setTimeout(() => {
          if (!ctx.__cargado || !ctx.__cargado.ok) throw new Error('el sandbox no cargo la taxonomia');
          if (flagOn) ctx.ClTaxonomy._setEnabled(true);
          cargarFunciones();
          res();
        }, 0);
      })
    : Promise.resolve().then(() => { if (flagOn) ctx.ClTaxonomy._setEnabled(true); cargarFunciones(); });

  return { ctx, capturados, avisos, llamadasRegistro, llamadasFetch, escrituras, sessionInicial, listo };
}

export async function sandbox(APP, taxSrc, sess, flagOn, datos) {
  const { ctx, capturados, avisos, llamadasRegistro, llamadasFetch, escrituras, sessionInicial, listo }
    = montar(APP, taxSrc, sess, flagOn, datos);
  await listo;
  vm.runInContext('clExportEbayCSV();', ctx);
  return {
    capturados, avisos, llamadasRegistro, llamadasFetch, escrituras,
    // Estado real de localStorage tras la llamada, para comparar contra el
    // inicial sin adivinar que se toco.
    sessionFinal: ctx.localStorage._d.cl_ebay_session,
    sessionInicial,
  };
}

// Llama a clBuildCsvV134(filas) directamente, sin pasar por clExportEbayCSV
// ni por su puerta de bloqueo. `filas` son objetos de esquema 2 (no toda una
// sesion serializada): no hay localStorage ni guardias previas que sortear.
export async function buildDirect(APP, taxSrc, filas, datos) {
  const { ctx, listo } = montar(APP, taxSrc, [], true, datos);
  await listo;
  ctx.__filasDirectas = filas;
  vm.runInContext('__resultadoDirecto = clBuildCsvV134(__filasDirectas);', ctx);
  return ctx.__resultadoDirecto;
}
