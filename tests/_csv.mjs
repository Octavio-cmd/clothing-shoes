// Ejecuta clExportEbayCSV en un sandbox y captura el CSV interceptando fetch.
import vm from 'node:vm';

export function sandbox(APP, taxSrc, sess, flagOn, datos) {
  const capturados = [];
  const avisos = [];
  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, String, Number, Array, Object, Date, parseFloat, parseInt, isFinite, isNaN, RegExp,
    localStorage: {
      _d: { cl_ebay_session: JSON.stringify(sess) },
      getItem(k){ return this._d[k] === undefined ? null : this._d[k]; },
      setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; },
    },
    toast(){}, alert(m){ avisos.push(m); }, confirm(){ return true; },
    clSendToRegistroSheet(){},
    clShowExportOptions(csv,f,n){ capturados.push({csv,fname:f,n}); },
    fetch(url, opt){ try { const b=JSON.parse(opt.body); capturados.push({csv:b.csv,fname:b.filename}); } catch(e){}
                     return { then(){ return { catch(){} }; } }; },
    document: { createElement(){ return { style:{}, innerHTML:'', appendChild(){} }; },
                getElementById(){ return null; }, body:{ appendChild(){} } },
    CL_SHIP_POLICY:'SHIP', CL_RET_POLICY:'RET', CL_PAY_POLICY:'PAY',
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(taxSrc, ctx);
  // La copia del sandbox tiene su PROPIO estado: hay que cargarle los datos,
  // no basta con encender el flag del modulo que importan las pruebas.
  if (datos) {
    ctx.__datos = datos;
    vm.runInContext('clTaxonomyReset();', ctx);
    let listo = false;
    ctx.__fetchTax = () => ({ ok: true, json: async () => ctx.__datos });
    vm.runInContext('clLoadTaxonomy({ fetch: __fetchTax, forzar: true }).then(function(r){ __cargado = r; });', ctx);
    // clLoadTaxonomy resuelve en microtareas; se drenan antes de seguir.
    return new Promise((res) => setTimeout(() => {
      if (!ctx.__cargado || !ctx.__cargado.ok) throw new Error('el sandbox no cargo la taxonomia');
      if (flagOn) ctx.ClTaxonomy._setEnabled(true);
      res(ejecutar());
    }, 0));
  }
  if (flagOn) ctx.ClTaxonomy._setEnabled(true);

  function ejecutar() {
  const fn = (n) => {
    const i = APP.indexOf('function ' + n + '(');
    if (i < 0) return '';
    let d = 0;
    for (let k = APP.indexOf('{', i); k < APP.length; k++) {
      if (APP[k]==='{') d++; else if (APP[k]==='}') { d--; if (!d) return APP.slice(i,k+1); }
    }
    return '';
  };
  for (const n of ['clNormalizePrice','clTaxV134','clSepararPorEsquema','clCsvPrefijo',
                   'clCsvHeaderV134','clCsvRowV134','clBuildCsvV134','clCsvQ','clCsvNombre',
                   'clEntregarCsv','clExportEbayCSVv134','clExportEbayCSV']) {
    const src = fn(n); if (src) vm.runInContext(src, ctx);
  }
  const m = APP.match(/var CL_CONDITION_IDS = \{[^}]*\};/);
  if (m) vm.runInContext(m[0], ctx);
  vm.runInContext('var CL_ESQUEMA_FILA = 2;', ctx);
  vm.runInContext('clExportEbayCSV();', ctx);
  return { capturados, avisos };
  }
  return ejecutar();
}
