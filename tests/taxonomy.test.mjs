// Pruebas permanentes del PASO 2 — carga y resolucion de la taxonomia v134.
// No tocan el CSV, ni clGetEbayCategoryId, ni clBuildAspects, ni localStorage.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));

const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const copia = () => JSON.parse(JSON.stringify(OFICIAL));

// fetch falso: devuelve el objeto que se le pase, o falla como se le pida.
const fetchDe = (obj) => async () => ({ ok: true, json: async () => obj });
const fetch404 = async () => ({ ok: false, status: 404 });
const fetchRevienta = async () => { throw new Error('red caida'); };

async function cargar(obj) {
  T.clTaxonomyReset();
  return T.clLoadTaxonomy({ fetch: fetchDe(obj), forzar: true });
}

beforeEach(() => { T.clTaxonomyReset(); T._setEnabled(false); });

// ── 1. el flag nace apagado ────────────────────────────────────────────────
describe('flag', () => {
  test('CL_TAXONOMY_V134_ENABLED es false en el archivo publicado', () => {
    const src = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
    assert.match(src, /var CL_TAXONOMY_V134_ENABLED = false;/,
      'el flag debe quedar apagado en el codigo fuente');
  });

  test('app.js no enciende el flag por su cuenta', () => {
    const src = readFileSync(join(RAIZ, 'app.js'), 'utf8');
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(src), false);
    assert.equal(/_setEnabled\s*\(\s*true\s*\)/.test(src), false);
  });
});

// ── 2. carga ───────────────────────────────────────────────────────────────
describe('clLoadTaxonomy', () => {
  test('carga el archivo oficial', async () => {
    const r = await cargar(OFICIAL);
    assert.equal(r.ok, true);
    assert.equal(r.categorias, 88);
    assert.equal(r.combinaciones, 109);
    assert.equal(T.clTaxonomyReady(), true);
    assert.equal(T.clTaxonomyError(), null);
  });

  test('carga una sola vez: la segunda llamada no vuelve a pedir el archivo', async () => {
    T.clTaxonomyReset();
    let veces = 0;
    const contando = async () => { veces++; return { ok: true, json: async () => OFICIAL }; };
    await T.clLoadTaxonomy({ fetch: contando });
    await T.clLoadTaxonomy({ fetch: contando });
    await T.clLoadTaxonomy({ fetch: contando });
    assert.equal(veces, 1);
  });

  for (const [campo, valor, codigo] of [
    ['esquema', 2, 'ESQUEMA'],
    ['marketplace', 'EBAY_GB', 'MARKETPLACE'],
    ['categoryTreeId', '3', 'ARBOL'],
    ['categoryTreeVersion', '133', 'VERSION'],
  ]) {
    test(`rechaza ${campo} incorrecto (${codigo})`, async () => {
      const malo = copia(); malo[campo] = valor;
      const r = await cargar(malo);
      assert.equal(r.ok, false);
      assert.equal(r.codigo, codigo);
      assert.equal(T.clTaxonomyReady(), false, 'no debe quedar cargado');
    });
  }

  test('rechaza un archivo sin categorias', async () => {
    const malo = copia(); delete malo.categorias;
    assert.equal((await cargar(malo)).codigo, 'SIN_CATEGORIAS');
  });

  test('rechaza un archivo sin seleccion', async () => {
    const malo = copia(); delete malo.seleccion;
    assert.equal((await cargar(malo)).codigo, 'SIN_SELECCION');
  });

  test('rechaza una categoria incompleta', async () => {
    const malo = copia(); delete malo.categorias['55793'].a;
    assert.equal((await cargar(malo)).codigo, 'CATEGORIA_INCOMPLETA');
  });

  test('rechaza una combinacion que apunte fuera del mapa', async () => {
    const malo = copia(); malo.seleccion.mens.clothing['Polo'] = 999999;
    const r = await cargar(malo);
    assert.equal(r.codigo, 'COMBINACION_HUERFANA');
  });

  test('un HTTP 404 deja error, no datos', async () => {
    T.clTaxonomyReset();
    const r = await T.clLoadTaxonomy({ fetch: fetch404, forzar: true });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'HTTP');
    assert.equal(T.clTaxonomyReady(), false);
  });

  test('una excepcion de red deja error, no datos', async () => {
    T.clTaxonomyReset();
    const r = await T.clLoadTaxonomy({ fetch: fetchRevienta, forzar: true });
    assert.equal(r.ok, false);
    assert.equal(T.clTaxonomyReady(), false);
  });
});

// ── 3. resolucion: las 109 combinaciones ───────────────────────────────────
describe('clResolveLeaf', () => {
  test('sin taxonomia cargada devuelve error, no un ID', () => {
    const r = T.clResolveLeaf({ rama: 'mens', tipo: 'clothing', prenda: 'Polo' });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'SIN_TAXONOMIA');
    assert.equal(r.categoryId, undefined);
  });

  test('las 109 combinaciones resuelven a una categoria existente y leaf', async () => {
    await cargar(OFICIAL);
    const D = T.clTaxonomyData();
    const casos = [];
    for (const rama of ['mens', 'womens'])
      for (const tipo of Object.keys(D.seleccion[rama]))
        for (const prenda of Object.keys(D.seleccion[rama][tipo]))
          casos.push({ rama, tipo, prenda });
    for (const dept of ['boys', 'girls', 'unisex'])
      for (const tipo of Object.keys(D.seleccion.kids4up[dept]))
        for (const prenda of Object.keys(D.seleccion.kids4up[dept][tipo]))
          casos.push({ rama: 'kids', ageGroup: 'kids4up', kidsDept: dept, tipo, prenda });
    for (const tipo of Object.keys(D.seleccion.baby))
      for (const prenda of Object.keys(D.seleccion.baby[tipo]))
        casos.push({ rama: 'kids', ageGroup: 'baby', kidsDept: 'unisex', tipo, prenda });
    for (const prenda of Object.keys(D.seleccion.specialty.clothing))
      casos.push({ rama: 'specialty', tipo: 'clothing', prenda });

    assert.equal(casos.length, 109, 'deben ser exactamente 109 combinaciones');
    for (const c of casos) {
      const r = T.clResolveLeaf(c);
      assert.equal(r.ok, true, `fallo ${JSON.stringify(c)}: ${r.mensaje || ''}`);
      assert.ok(D.categorias[r.categoryId], `${r.categoryId} no esta en el derivado`);
      assert.match(r.categoryId, /^[0-9]+$/);
      assert.ok(r.ruta.length > 0);
    }
  });

  test('una combinacion desconocida da error estructurado y ningun ID', async () => {
    await cargar(OFICIAL);
    const r = T.clResolveLeaf({ rama: 'mens', tipo: 'clothing', prenda: 'Kimono' });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'COMBINACION_NO_EXISTE');
    assert.equal(r.categoryId, undefined, 'no puede haber categoria por defecto');
    assert.ok(Array.isArray(r.disponibles) && r.disponibles.length > 0);
  });

  test('una rama desconocida da error, no un ID', async () => {
    await cargar(OFICIAL);
    const r = T.clResolveLeaf({ rama: 'aliens', tipo: 'clothing', prenda: 'Polo' });
    assert.equal(r.codigo, 'RAMA_DESCONOCIDA');
    assert.equal(r.categoryId, undefined);
  });

  test('ninguna resolucion fallida trae categoryId (barrido)', async () => {
    await cargar(OFICIAL);
    const malos = [
      {}, { rama: 'mens' }, { rama: 'kids', prenda: 'Tops' },
      { rama: 'kids', ageGroup: 'kids4up', prenda: 'Tops' },
      { rama: 'unisex', prenda: 'Polo' },
      { rama: 'mens', tipo: 'joyeria', prenda: 'Polo' },
      { rama: 'specialty', prenda: 'Jeans' },
      { rama: 'kids', ageGroup: 'baby', kidsDept: 'martian', prenda: 'Tops' },
    ];
    for (const m of malos) {
      const r = T.clResolveLeaf(m);
      assert.equal(r.ok, false, JSON.stringify(m));
      assert.equal(r.categoryId, undefined, JSON.stringify(m));
      assert.ok(r.codigo, 'todo error debe traer codigo');
    }
  });
});

// ── 4. reglas de negocio autorizadas ───────────────────────────────────────
describe('reglas de mapeo', () => {
  test('Men no ofrece Dress, Skirt ni Blouse', async () => {
    await cargar(OFICIAL);
    for (const prenda of ['Dress', 'Skirt', 'Blouse']) {
      const r = T.clResolveLeaf({ rama: 'mens', tipo: 'clothing', prenda });
      assert.equal(r.ok, false, `${prenda} no debe resolver en Men`);
      assert.equal(r.codigo, 'COMBINACION_NO_EXISTE');
    }
    const lista = T.clCategoriesFor({ rama: 'mens', tipo: 'clothing' });
    for (const prenda of ['Dress', 'Skirt', 'Blouse'])
      assert.equal(lista.includes(prenda), false, `${prenda} no debe ser seleccionable`);
  });

  test('Women si ofrece Dress y Skirt', async () => {
    await cargar(OFICIAL);
    assert.equal(T.clResolveLeaf({ rama: 'womens', tipo: 'clothing', prenda: 'Dress' }).categoryId, '63861');
    assert.equal(T.clResolveLeaf({ rama: 'womens', tipo: 'clothing', prenda: 'Skirt' }).categoryId, '63864');
  });

  test('Men Polo resuelve a Polos 185101, no a camisas', async () => {
    await cargar(OFICIAL);
    assert.equal(T.clResolveLeaf({ rama: 'mens', tipo: 'clothing', prenda: 'Polo' }).categoryId, '185101');
  });

  test('Adult Unisex exige rama base', async () => {
    await cargar(OFICIAL);
    const sin = T.clResolveLeaf({ rama: 'unisex', tipo: 'clothing', prenda: 'T-Shirt' });
    assert.equal(sin.ok, false);
    assert.equal(sin.codigo, 'FALTA_RAMA_BASE');
    assert.equal(sin.categoryId, undefined);

    const con = T.clResolveLeaf({ rama: 'unisex', adultBranch: 'mens', tipo: 'clothing', prenda: 'T-Shirt' });
    assert.equal(con.ok, true);
    assert.equal(con.categoryId, '15687');
    assert.equal(con.department, 'Unisex Adults');
  });

  test('Adult Unisex solo ofrece hojas que admitan Unisex Adults', async () => {
    await cargar(OFICIAL);
    const lista = T.clCategoriesFor({ rama: 'unisex', adultBranch: 'womens', tipo: 'clothing' });
    assert.ok(lista.length > 0);
    for (const prenda of lista) {
      const r = T.clResolveLeaf({ rama: 'unisex', adultBranch: 'womens', tipo: 'clothing', prenda });
      assert.equal(r.ok, true, prenda);
      assert.ok(T.clAspectValues(r.categoryId, 'Department').includes('Unisex Adults'), prenda);
    }
  });

  test('Kids exige Age Group y Department', async () => {
    await cargar(OFICIAL);
    const sinEdad = T.clResolveLeaf({ rama: 'kids', tipo: 'clothing', prenda: 'Tops' });
    assert.equal(sinEdad.codigo, 'FALTA_AGE_GROUP');
    assert.equal(sinEdad.categoryId, undefined);

    const sinDept = T.clResolveLeaf({ rama: 'kids', ageGroup: 'kids4up', tipo: 'clothing', prenda: 'Tops' });
    assert.equal(sinDept.codigo, 'FALTA_KIDS_DEPT');
    assert.equal(sinDept.categoryId, undefined);

    const ok = T.clResolveLeaf({ rama: 'kids', ageGroup: 'kids4up', kidsDept: 'girls', tipo: 'clothing', prenda: 'Tops' });
    assert.equal(ok.categoryId, '260965');
    assert.equal(ok.department, 'Girls');
  });

  test('los tres departamentos 4&Up dan tres categorias distintas', async () => {
    await cargar(OFICIAL);
    const ids = ['boys', 'girls', 'unisex'].map((d) =>
      T.clResolveLeaf({ rama: 'kids', ageGroup: 'kids4up', kidsDept: d, tipo: 'clothing', prenda: 'Tops' }).categoryId);
    assert.deepEqual(ids, ['260966', '260965', '155199']);
    assert.equal(new Set(ids).size, 3);
  });

  test('Baby usa su propio vocabulario de Department', async () => {
    await cargar(OFICIAL);
    const r = T.clResolveLeaf({ rama: 'kids', ageGroup: 'baby', kidsDept: 'unisex', tipo: 'clothing', prenda: 'Tops' });
    assert.equal(r.categoryId, '260031');
    assert.equal(r.department, 'Unisex Baby & Toddler');
    // el vocabulario de Kids 4&Up NO sirve en Baby
    assert.equal(T.DEPT_KIDS.unisex, 'Unisex Kids');
    assert.notEqual(T.DEPT_BABY.unisex, T.DEPT_KIDS.unisex);
  });

  test('Baby Hoodie y Sweatshirt van a Sweaters 260029 (decision D)', async () => {
    await cargar(OFICIAL);
    for (const prenda of ['Hoodie', 'Sweatshirt', 'Sweater'])
      assert.equal(T.clResolveLeaf({ rama: 'kids', ageGroup: 'baby', kidsDept: 'boys', tipo: 'clothing', prenda }).categoryId, '260029');
  });

  test('2T no determina el grupo de edad: es valido en los cuatro', async () => {
    await cargar(OFICIAL);
    const grupos = [
      { rama: 'kids', ageGroup: 'baby',    kidsDept: 'unisex' },
      { rama: 'kids', ageGroup: 'kids4up', kidsDept: 'boys' },
      { rama: 'kids', ageGroup: 'kids4up', kidsDept: 'girls' },
      { rama: 'kids', ageGroup: 'kids4up', kidsDept: 'unisex' },
    ];
    const ids = new Set();
    for (const g of grupos) {
      const r = T.clResolveLeaf({ ...g, tipo: 'clothing', prenda: 'Tops' });
      assert.equal(r.ok, true);
      assert.ok(T.clAspectValues(r.categoryId, 'Size').includes('2T'),
        `2T debe ser valido en ${r.categoryId}`);
      ids.add(r.categoryId);
    }
    // cuatro categorias distintas aceptan 2T -> la talla no puede decidir
    assert.equal(ids.size, 4);
  });

  test('Scrubs resuelve a Specialty y sin genero', async () => {
    await cargar(OFICIAL);
    const esperado = { 'Scrubs Top': '105440', 'Scrubs Bottom': '105422', 'Scrubs Set': '105432' };
    for (const [prenda, cid] of Object.entries(esperado)) {
      const r = T.clResolveLeaf({ rama: 'specialty', prenda });
      assert.equal(r.categoryId, cid);
      assert.match(r.ruta, /Specialty > Uniforms & Work Clothing > Scrubs/);
      assert.equal(r.department, null, 'Scrubs no lleva Department');
      assert.equal(r.aspectos['Department'], undefined);
      assert.equal(r.aspectos['Size Type'], undefined);
    }
  });

  test('el calzado resuelve a categorias de calzado, no de ropa', async () => {
    await cargar(OFICIAL);
    const casos = [
      [{ rama: 'mens',   tipo: 'shoes', prenda: 'Athletic' }, '15709'],
      [{ rama: 'womens', tipo: 'shoes', prenda: 'Athletic' }, '95672'],   // no el de hombre
      [{ rama: 'womens', tipo: 'shoes', prenda: 'Heels' },    '55793'],
      [{ rama: 'kids', ageGroup: 'kids4up', kidsDept: 'girls', tipo: 'shoes', prenda: 'Shoes' }, '57974'],
      [{ rama: 'kids', ageGroup: 'baby',    kidsDept: 'boys',  tipo: 'shoes', prenda: 'Shoes' }, '147285'],
    ];
    for (const [sel, cid] of casos) {
      const r = T.clResolveLeaf(sel);
      assert.equal(r.categoryId, cid, JSON.stringify(sel));
      assert.match(r.ruta, /Shoes/);
      assert.ok(r.aspectos['US Shoe Size'], 'el calzado usa US Shoe Size');
      assert.equal(r.aspectos['Size'], undefined, 'el calzado no lleva Size');
    }
  });

  test('Women Hoodie no cae en la categoria de hombre', async () => {
    await cargar(OFICIAL);
    assert.equal(T.clResolveLeaf({ rama: 'womens', tipo: 'clothing', prenda: 'Hoodie' }).categoryId, '155226');
    assert.equal(T.clResolveLeaf({ rama: 'mens',   tipo: 'clothing', prenda: 'Hoodie' }).categoryId, '155183');
  });
});

// ── 5. con el flag apagado nada cambia ─────────────────────────────────────
describe('flag apagado: comportamiento intacto', () => {
  const app = readFileSync(join(RAIZ, 'app.js'), 'utf8');

  test('el exportador de CSV no fue tocado', () => {
    assert.match(app, /'Add',r\.sku\|\|'',r\.categoryId\|\|'63861'/);
    assert.match(app, /\*C:Size Type/);
  });

  test('clGetEbayCategoryId sigue igual, con su fallback', () => {
    assert.match(app, /return m\[cl\.category\] \|\| \(cl\.gender==='mens' \? 57990 : 53159\);/);
  });

  test('clBuildAspects sigue igual', () => {
    assert.match(app, /function clBuildAspects\(\) \{[\s\S]{0,120}const condMap/);
  });

  test('los titulos y descripciones no fueron tocados', () => {
    assert.match(app, /return t\.substring\(0,80\);/);
    assert.match(app, /function buildClothingDesc\(\)/);
  });

  test('no se toco localStorage', () => {
    assert.match(app, /localStorage\.getItem\('cl_ebay_session'\)/);
  });

  test('CL_CATS y CL_SHOE_CATS siguen existiendo', () => {
    assert.match(app, /const CL_CATS = \[/);
    assert.match(app, /const CL_SHOE_CATS = \[/);
  });

  test('los onclick viejos de gender y type siguen en el codigo', () => {
    assert.match(app, /cl\.gender='\$\{g\.id\}';this\.closest\('div'\)/);
    assert.match(app, /cl\.type='\$\{t\.id\}';this\.closest\('div'\)/);
  });

  test('el estado nuevo nace vacio', () => {
    assert.match(app, /ageGroup: '',/);
    assert.match(app, /kidsDept: '',/);
    assert.match(app, /adultBranch: ''/);
  });
});

// ── 6. bloqueo cuando la carga falla con el flag encendido ─────────────────
describe('bloqueo', () => {
  test('con el flag encendido y carga fallida, no hay resolucion posible', async () => {
    T.clTaxonomyReset();
    T._setEnabled(true);
    const r = await T.clLoadTaxonomy({ fetch: fetch404, forzar: true });
    assert.equal(r.ok, false);
    assert.equal(T.clTaxonomyReady(), false);
    // toda resolucion falla: es imposible caer al mapa viejo por esta via
    const res = T.clResolveLeaf({ rama: 'mens', tipo: 'clothing', prenda: 'Polo' });
    assert.equal(res.ok, false);
    assert.equal(res.codigo, 'SIN_TAXONOMIA');
    assert.equal(res.categoryId, undefined);
    T._setEnabled(false);
  });

  test('app.js bloquea en vez de volver al mapa viejo', () => {
    const app = readFileSync(join(RAIZ, 'app.js'), 'utf8');
    assert.match(app, /clTaxBloqueado = true;/);
    assert.match(app, /function clTaxMostrarBloqueo/);
    // el manejador de fallo no debe reactivar el camino viejo
    const boot = app.slice(app.indexOf('function clTaxonomyBoot'), app.indexOf('function clTaxMostrarBloqueo'));
    assert.equal(/CL_CATS|CL_SHOE_CATS|clGetEbayCategoryId/.test(boot), false,
      'el arranque no puede tocar el mapa viejo');
  });

  test('clTaxCategorias devuelve las listas viejas solo con el flag apagado', () => {
    const app = readFileSync(join(RAIZ, 'app.js'), 'utf8');
    const fn = app.slice(app.indexOf('function clTaxCategorias'), app.indexOf('function clTaxResolver'));
    assert.match(fn, /if \(!clTaxV134\(\)\) return cl\.type === 'shoes' \? CL_SHOE_CATS : CL_CATS;/);
    assert.match(fn, /return clCategoriesFor\(clTaxSeleccion\(\)\);/);
  });
});
