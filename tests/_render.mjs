// Ayudante compartido: evalua clRenderAttr fuera del navegador, con lo minimo
// para que la plantilla se resuelva. Sirve para comparar el HTML con el flag
// apagado contra los hashes de referencia.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export function extraerFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrada: ' + nombre);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('sin cierre: ' + nombre);
}

function constante(src, nombre) {
  const m = new RegExp('^const ' + nombre + '\\s*=', 'm').exec(src);
  if (!m) throw new Error('no encontrada la constante: ' + nombre);
  return src.slice(m.index, src.indexOf('];', m.index) + 2);
}

const CONSTS = ['CL_BRANDS','CL_CATS','CL_SHOE_CATS','CL_COLORS','CL_CONDITIONS','PHOTO_SLOTS',
                'CL_STYLES','CL_DEFECTS','CL_GENDER_OPTIONS','CL_TYPE_OPTIONS',
                'CL_SIZES_ALPHA','CL_SIZES_NUM','CL_SIZES_KIDS','CL_SIZES_SHOES'];

const FN_TAX = ['clTaxV134','clTaxSeleccion','clTaxCategorias','clTaxLimpiarDependientes',
                'clTaxRenderSelectores','clTaxCategoriaActiva','clTaxValorReutilizado',
                'clTaxValoresAspectos','clTaxPodarAspectos','clTaxEsc','clTaxAviso',
                'clTaxRenderAspectos','clTaxRenderAspecto','clTaxInitRuedas','clTaxSetAspect',
                'clTaxBuildItem','clTaxInforme','clTaxEtiquetaProblema','clTaxRenderInforme'];

// conTax=false reproduce el codigo anterior al paso 2 (sin las funciones nuevas).
export function entorno(src, conTax) {
  const tax = conTax ? readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8') : '';
  const pre = CONSTS.map((c) => constante(src, c)).join('\n');
  const fns = conTax ? FN_TAX.filter((f) => src.includes('function ' + f + '('))
                             .map((f) => extraerFuncion(src, f)).join('\n') : '';
  const cuerpo = `
    ${tax}
    ${pre}
    var cl = { sku:'', type:'clothing', gender:'unisex', brand:'', brandCustom:'', category:'',
      size:'L', color:'', colorCustom:'', condition:'', defects:[], notes:'', weightLb:'',
      weightOz:'', photos:{}, step:1, ageGroup:'', kidsDept:'', adultBranch:'', aspects:{} };
    var _cap = { innerHTML: '' };
    var $ = function(){ return _cap; };
    function clInseamOptions(){ return cl.category==='Shorts'
      ? ['5"','7"','9"','11"','13"','Unspecified']
      : ['28"','29"','30"','31"','32"','33"','34"','36"','Unspecified']; }
    ${fns}
    ${extraerFuncion(src, 'clRenderAttr')}
    ${src.includes('function clRenderReview(') ? extraerFuncion(src, 'clRenderReview') : ''}
    // stubs: la pantalla de revision solo los referencia dentro de onclick
    function clGenerateEbayTitle(){} function clInitWeightWheels(){}
    function clRenderPhotos(){} function esc(x){ return String(x==null?'':x); }
    function locBadgeHTML(){ return '<loc/>'; } function locEmptyHTML(){ return '<loc-empty/>'; }
    function clWeightLabel(){ return ''; } function clUpdateTotal(){}
    function clCondText(){ return ''; } function clCondShort(){ return ''; }
    function getClothingPrice(){} function clUpdateSKUDisplay(){}
    var localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} };
    return { cl: cl, tax: (typeof ClTaxonomy !== 'undefined' ? ClTaxonomy : null),
             render: function(){ _cap.innerHTML=''; clRenderAttr(); return _cap.innerHTML; },
             podar: function(){ return clTaxPodarAspectos(); },
             renderReview: function(){ _cap.innerHTML=''; clRenderReview(); return _cap.innerHTML; },
             informe: function(){ return clTaxInforme(cl); },
             item: function(cid){ return clTaxBuildItem(cl, cid); } };
  `;
  return new Function(cuerpo)();
}

export const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// Los 14 escenarios que fijan el comportamiento visible con el flag apagado.
export const ESCENARIOS = [
  { gender:'mens',   type:'clothing' }, { gender:'womens', type:'clothing' },
  { gender:'kids',   type:'clothing' }, { gender:'unisex', type:'clothing' },
  { gender:'mens',   type:'shoes' },    { gender:'womens', type:'shoes' },
  { gender:'kids',   type:'shoes' },    { gender:'unisex', type:'shoes' },
  { gender:'womens', type:'clothing', category:'Dress' },
  { gender:'mens',   type:'clothing', category:'Jeans' },
  { gender:'mens',   type:'clothing', category:'Jacket' },
  { gender:'kids',   type:'clothing', category:'Swimwear' },
  { gender:'womens', type:'clothing', category:'Activewear Top' },
  { gender:'mens',   type:'shoes',    category:'Sneakers' },
];

// El entorno evalua su PROPIA copia de cl-taxonomy.js, con estado
// independiente del modulo que importan las pruebas. Para que el flag y los
// datos apliquen dentro, hay que encenderlos y cargarlos en ESA instancia.
export async function entornoCargado(src, datos) {
  const E = entorno(src, true);
  if (!E.tax) throw new Error('el entorno no expone ClTaxonomy');
  E.tax._setEnabled(true);
  E.tax.clTaxonomyReset();
  const r = await E.tax.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => datos }), forzar: true });
  if (!r.ok) throw new Error('no cargo la taxonomia en el entorno: ' + r.codigo);
  return E;
}

export function etiqueta(e) {
  return e.gender + '/' + e.type + (e.category ? '/' + e.category : '');
}
