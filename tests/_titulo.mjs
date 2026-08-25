// Ayudante para probar buildClothingTitle() (y clColapsarNwotRepetido) fuera
// del navegador. Mismo patron que _render.mjs: extrae el codigo REAL de
// app.js con new Function(), sin mocks de su logica -- solo un `cl` minimo y
// stubs de lo que buildClothingTitle no necesita de verdad para este arreglo
// (clSizeType, ya que aqui no se prueban variantes de Size Type).
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

const FNS = ['buildClothingTitle', 'clColapsarNwotRepetido', 'clDejarUnaAparicion',
             'clCondShort', 'clCondText', 'clCleanColor'].map((f) => extraerFuncion(APP, f)).join('\n');

// cl por defecto: NWOT, sin extras -- cada prueba pisa lo que necesite.
const CL_BASE = {
  sku: '', type: 'clothing', gender: 'womens', brand: 'Nike', brandCustom: '',
  category: 'Jacket', size: 'M', color: 'Black', colorCustom: '', condition: 'NWOT',
  defects: [], notes: '', weightLb: '', weightOz: '', photos: {}, step: 1,
  ageGroup: '', kidsDept: '', adultBranch: '', aspects: {},
  inseam: '', dressLength: '', outerMaterial: '', activity: '', style: '',
};

// Construye un titulo con la funcion REAL, partiendo de CL_BASE y las
// propiedades que se le pasen encima.
export function construirTitulo(overrides) {
  const cl = Object.assign({}, CL_BASE, overrides || {});
  const cuerpo = `
    var cl = ${JSON.stringify(cl)};
    function clSizeType(){ return 'Regular'; }
    ${FNS}
    return buildClothingTitle();
  `;
  return new Function(cuerpo)();
}

// Llama a clColapsarNwotRepetido directamente, sin pasar por buildClothingTitle
// ni por `cl` -- para probarla como funcion pura sobre cualquier texto,
// incluido uno que simule la respuesta de Claude.
export function colapsarNwot(texto) {
  const cuerpo = `
    ${extraerFuncion(APP, 'clDejarUnaAparicion')}
    ${extraerFuncion(APP, 'clColapsarNwotRepetido')}
    return clColapsarNwotRepetido(${JSON.stringify(texto)});
  `;
  return new Function(cuerpo)();
}

export { APP };
