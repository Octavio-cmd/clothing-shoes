// Ayudante para probar buildClothingDesc() fuera del navegador.
// Usa FUNCIONES REALES de taxonomía desde taxonomy/cl-taxonomy.js.
// NO contiene copias ni reimplementaciones.
// PATRÓN: ejecuta taxonomía y buildClothingDesc en el MISMO sandbox vm,
// conservando los closures internos (_datos, etc.) intactos.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function extraerFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontrada: ' + nombre);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('sin cierre: ' + nombre);
}

const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const TAX_SRC = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
const TAX_DATOS_JSON = JSON.parse(readFileSync(join(RAIZ, 'taxonomy/ebay-us-v134.json'), 'utf8'));

// Crear sandbox vm con los mismos helpers que _arranque.mjs
const ctx = {
  console: { log(){}, warn(){}, error(){} },
  JSON, Math, String, Number, Array, Object, Date, Promise,
  parseFloat, parseInt, isFinite, isNaN, RegExp,
};
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.self = ctx;
vm.createContext(ctx);

// Ejecutar taxonomía COMPLETA en el sandbox
// Esto mantiene _datos en el closure de clAspectValido, clResolveLeaf, etc.
vm.runInContext(TAX_SRC, ctx);

// Precargar taxonomía: proporcionar fetch simulado que devuelve datos reales
ctx.__fetchTaxData = TAX_DATOS_JSON;

// Inicializar taxonomía de forma async
let taxonomyReady;
let taxonomyError;

// Esta promesa se resuelve cuando clLoadTaxonomy complete en el sandbox
const taxonomyInit = new Promise((resolve, reject) => {
  ctx.__resolveTaxonomy = resolve;
  ctx.__rejectTaxonomy = reject;

  vm.runInContext(`
    (function() {
      var mockFetch = function() {
        return Promise.resolve({
          ok: true,
          json: function() { return Promise.resolve(globalThis.__fetchTaxData); }
        });
      };
      clTaxonomyReset();
      clLoadTaxonomy({ fetch: mockFetch, forzar: true })
        .then(function(r) { globalThis.__resolveTaxonomy(r); })
        .catch(function(e) { globalThis.__rejectTaxonomy(e); });
    })();
  `, ctx);
});

// Esperar a que la taxonomía se cargue
await taxonomyInit;

const FNS = ['buildClothingDesc', 'clCondText', 'clCleanColor', 'clSizeType', 'clBuildConditionText'].map((f) => extraerFuncion(APP, f)).join('\n');

// cl por defecto: NWOT, sin extras -- cada prueba pisa lo que necesite.
const CL_BASE = {
  sku: '', type: 'clothing', gender: 'womens', brand: 'Nike', brandCustom: '',
  category: 'Jacket', size: 'M', color: 'Black', colorCustom: '', condition: 'NWOT',
  defects: [], notes: '', weightLb: '', weightOz: '', photos: {}, step: 1,
  ageGroup: '', kidsDept: '', adultBranch: '', aspects: {},
  inseam: '', dressLength: '', outerMaterial: '', activity: '', style: '',
};

// Construye una descripción usando FUNCIONES REALES de producción.
// Ejecuta TODO en el sandbox vm, conservando los closures de taxonomía (_datos, etc.)
export function construirDesc(overrides, taxV134Enabled = false) {
  const cl = Object.assign({}, CL_BASE, overrides || {});

  // Inyectar el objeto cl y las opciones en el sandbox
  ctx.cl = cl;
  ctx.__taxV134Enabled = taxV134Enabled;

  // Ejecutar buildClothingDesc en el mismo sandbox donde vive la taxonomía
  const codigo = `
    (function() {
      // Stubs de funciones que buildClothingDesc necesita
      function clSizeType() { return 'Regular'; }
      function clTaxV134() { return globalThis.__taxV134Enabled; }
      function clTaxSeleccion() {
        var cl = globalThis.cl;
        var rama = cl.gender === 'mens' ? 'mens'
                 : cl.gender === 'womens' ? 'womens'
                 : cl.gender === 'kids' ? 'kids'
                 : cl.gender === 'unisex' ? 'unisex'
                 : '';
        return {
          rama: rama,
          tipo: cl.type === 'shoes' ? 'shoes' : 'clothing',
          prenda: cl.category,
          ageGroup: cl.ageGroup || null,
          adultBranch: cl.adultBranch || null,
          kidsDept: cl.kidsDept || null,
          category: cl.category
        };
      }

      // Código de buildClothingDesc y sus dependencias
      ${FNS}

      // Ejecutar y retornar
      return buildClothingDesc();
    })();
  `;

  return vm.runInContext(codigo, ctx);
}

export { APP, TAX_DATOS_JSON, ctx as TAX_CTX };
