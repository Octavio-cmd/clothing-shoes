// Pruebas permanentes del PASO 3 — aspectos dinamicos por categoria.
// No tocan el CSV, ni titulos, ni descripciones, ni exportacion, ni localStorage.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { RAIZ, entorno, entornoCargado, hash, ESCENARIOS, etiqueta, extraerFuncion } from './_render.mjs';

const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');

async function cargar() {
  T.clTaxonomyReset();
  await T.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => OFICIAL }), forzar: true });
}
const IDS = Object.keys(OFICIAL.categorias);
const valoresOficiales = (cid, asp) => {
  const a = OFICIAL.categorias[cid].a[asp];
  if (!a || a.abierto) return [];
  return a.v || OFICIAL.listas[a.ref] || [];
};

beforeEach(() => { T._setEnabled(false); });

// ── 1. cobertura de las 88 categorias ──────────────────────────────────────
describe('las 88 categorias', () => {
  test('todas devuelven aspectos, y solo los que admiten', async () => {
    await cargar();
    assert.equal(IDS.length, 88);
    for (const cid of IDS) {
      const lista = T.clAspectsFor(cid);
      assert.ok(lista.length > 0, `${cid} sin aspectos`);
      const admitidos = new Set(Object.keys(OFICIAL.categorias[cid].a));
      for (const a of lista)
        assert.ok(admitidos.has(a.nombre),
          `${cid} muestra "${a.nombre}" que la categoria no admite`);
      // y no falta ninguno de los que si admite
      assert.equal(lista.length, admitidos.size, `${cid}: ${lista.length} vs ${admitidos.size}`);
    }
  });

  test('todos los obligatorios quedan marcados como requeridos', async () => {
    await cargar();
    let req = 0;
    for (const cid of IDS)
      for (const a of T.clAspectsFor(cid)) {
        const of_ = OFICIAL.categorias[cid].a[a.nombre];
        assert.equal(a.requerido, of_.r === 1, `${cid}/${a.nombre}`);
        if (a.requerido) req++;
      }
    // 88 Brand + 85 Color + 72 Department + 68 Size + 64 Style + 41 Type
    // + 25 Size Type + 17 US Shoe Size + 12 Upper Material
    // + 6 Outer Shell Material + 3 Dress Length + 2 Inseam + 1 Skirt Length
    assert.equal(req, 484, 'total de aspectos obligatorios en las 88');
  });

  test('ningun valor ofrecido esta fuera de la lista oficial', async () => {
    await cargar();
    let n = 0;
    for (const cid of IDS)
      for (const a of T.clAspectsFor(cid)) {
        const ok = new Set(valoresOficiales(cid, a.nombre));
        for (const v of a.valores) { n++; assert.ok(ok.has(v), `${cid}/${a.nombre}: "${v}" inventado`); }
      }
    assert.ok(n > 15000, `solo se revisaron ${n} valores`);
  });

  test('ningun aspecto viene con valor preseleccionado', async () => {
    await cargar();
    for (const cid of IDS)
      for (const a of T.clAspectsFor(cid))
        assert.equal(a.valor, undefined, `${cid}/${a.nombre} trae valor de fabrica`);
    // y sin valores capturados, TODOS los obligatorios faltan
    for (const cid of IDS.slice(0, 20)) {
      const faltan = T.clAspectosFaltantes(cid, {});
      const req = T.clAspectsFor(cid).filter((a) => a.requerido).length;
      assert.equal(faltan.length, req, cid);
    }
  });
});

// ── 2. Brand abierto ───────────────────────────────────────────────────────
describe('Brand', () => {
  test('esta en las 88 y siempre reutiliza el campo existente', async () => {
    await cargar();
    for (const cid of IDS) {
      const b = T.clAspectsFor(cid).find((a) => a.nombre === 'Brand');
      assert.ok(b, `${cid} sin Brand`);
      assert.equal(b.requerido, true);
      assert.equal(b.reutiliza, 'brand', 'Brand no debe crear un segundo campo');
    }
  });

  test('abierto: acepta texto sin incrustar miles de marcas', async () => {
    await cargar();
    const b = T.clAspectsFor('55793').find((a) => a.nombre === 'Brand');
    assert.equal(b.abierto, true);
    assert.equal(b.valores.length, 0, 'no se incrustan las 2182 marcas');
    assert.equal(b.nv, 2182, 'pero se conserva cuantas son');
    assert.equal(T.clAspectValido('55793', 'Brand', 'Marca Rarisima SL'), true);
    assert.equal(T.clAspectValido('55793', 'Brand', ''), false);
  });

  test('el derivado no incrusta ninguna lista gigante', () => {
    for (const cid of IDS)
      for (const [n, a] of Object.entries(OFICIAL.categorias[cid].a)) {
        const v = a.v || OFICIAL.listas[a.ref] || [];
        assert.ok(v.length <= 400, `${cid}/${n} incrusta ${v.length} valores`);
      }
  });

  test('app.js no crea un segundo control de Brand ni de Color', () => {
    const fn = extraerFuncion(APP, 'clTaxRenderAspecto');
    assert.match(fn, /if \(a\.reutiliza\) \{/);
    // la rama de reutilizacion sale antes de pintar chips, select o texto
    assert.ok(fn.indexOf('a.reutiliza') < fn.indexOf("a.control === 'rueda'"));
  });
});

// ── 3. los cuatro pares que no deben confundirse ───────────────────────────
describe('aspectos que se confunden', () => {
  test("Women's Heels 55793: Style y Heel Style son controles separados", async () => {
    await cargar();
    const l = T.clAspectsFor('55793');
    const style = l.find((a) => a.nombre === 'Style');
    const heel  = l.find((a) => a.nombre === 'Heel Style');
    assert.ok(style && heel, 'deben existir los dos');
    assert.notEqual(style, heel);
    assert.equal(style.requerido, true);
    assert.equal(heel.requerido, false);
    assert.notDeepEqual(style.valores, heel.valores);
  });

  test('Heel Style incluye Wedge y Style no', async () => {
    await cargar();
    const l = T.clAspectsFor('55793');
    assert.ok(l.find((a) => a.nombre === 'Heel Style').valores.includes('Wedge'));
    assert.equal(l.find((a) => a.nombre === 'Style').valores.includes('Wedge'), false);
    assert.equal(T.clAspectValido('55793', 'Heel Style', 'Wedge'), true);
    assert.equal(T.clAspectValido('55793', 'Style', 'Wedge'), false, 'Wedge no es Style');
  });

  test('Heel Height esta y es opcional', async () => {
    await cargar();
    const hh = T.clAspectsFor('55793').find((a) => a.nombre === 'Heel Height');
    assert.ok(hh);
    assert.equal(hh.requerido, false);
    assert.ok(hh.valores.includes('Ultra High (4 in & Higher)'));
  });

  test('las faldas usan Skirt Length y nunca Dress Length', async () => {
    await cargar();
    for (const cid of ['63864', '51583', '260025']) {
      const l = T.clAspectsFor(cid);
      assert.ok(l.find((a) => a.nombre === 'Skirt Length'), `${cid} sin Skirt Length`);
      assert.equal(l.find((a) => a.nombre === 'Dress Length'), undefined, `${cid} no debe tener Dress Length`);
    }
    assert.equal(T.clAspectsFor('63864').find((a) => a.nombre === 'Skirt Length').requerido, true);
  });

  test('los vestidos usan Dress Length y nunca Skirt Length', async () => {
    await cargar();
    for (const cid of ['63861', '51581', '260021']) {
      const l = T.clAspectsFor(cid);
      const dl = l.find((a) => a.nombre === 'Dress Length');
      assert.ok(dl && dl.requerido, `${cid} sin Dress Length obligatorio`);
      assert.equal(l.find((a) => a.nombre === 'Skirt Length'), undefined);
    }
  });

  test('outerwear usa Outer Shell Material, no Material', async () => {
    await cargar();
    for (const cid of ['57988', '63862', '155201', '260023']) {
      const l = T.clAspectsFor(cid);
      const osm = l.find((a) => a.nombre === 'Outer Shell Material');
      assert.ok(osm && osm.requerido, `${cid} sin Outer Shell Material obligatorio`);
      assert.equal(l.find((a) => a.nombre === 'Material'), undefined, `${cid} no lleva Material`);
      assert.equal(l.find((a) => a.nombre === 'Upper Material'), undefined);
    }
  });

  test('el calzado usa Upper Material y US Shoe Size, nunca Size', async () => {
    await cargar();
    const zapatos = IDS.filter((c) => OFICIAL.categorias[c].a['US Shoe Size']);
    assert.equal(zapatos.length, 17);
    for (const cid of zapatos) {
      const l = T.clAspectsFor(cid);
      const uss = l.find((a) => a.nombre === 'US Shoe Size');
      assert.ok(uss && uss.requerido, `${cid} sin US Shoe Size obligatorio`);
      assert.equal(uss.control, 'rueda', 'la talla de calzado usa rueda');
      assert.equal(l.find((a) => a.nombre === 'Size'), undefined, `${cid} no debe llevar Size`);
      assert.equal(l.find((a) => a.nombre === 'Size Type'), undefined);
      assert.ok(l.find((a) => a.nombre === 'Upper Material'), `${cid} sin Upper Material`);
    }
  });

  test('la ropa usa Size y nunca US Shoe Size', async () => {
    await cargar();
    for (const cid of IDS) {
      const l = T.clAspectsFor(cid);
      if (!l.find((a) => a.nombre === 'Size')) continue;
      assert.equal(l.find((a) => a.nombre === 'US Shoe Size'), undefined, cid);
    }
  });
});

// ── 4. Size Type donde corresponde ─────────────────────────────────────────
describe('Size Type', () => {
  test('Kids Swimwear solo ofrece sus Size Type oficiales', async () => {
    await cargar();
    const esperado = { '51919': ['Regular','Slim','Husky'], '51567': ['Regular','Plus','Slim'], '175653': ['Regular','Plus','Slim'] };
    for (const [cid, vals] of Object.entries(esperado)) {
      const st = T.clAspectsFor(cid).find((a) => a.nombre === 'Size Type');
      assert.ok(st, `${cid} sin Size Type`);
      assert.equal(st.requerido, false);
      assert.deepEqual(st.valores, vals);
      for (const malo of ['Big & Tall', 'Petites', 'Juniors', 'Maternity', 'Tall'])
        assert.equal(T.clAspectValido(cid, 'Size Type', malo), false, `${cid} acepto "${malo}"`);
    }
  });

  test('Baby & Toddler nunca muestra Size Type', async () => {
    await cargar();
    const baby = IDS.filter((c) => / > Baby >/.test(OFICIAL.categorias[c].ruta));
    assert.equal(baby.length, 8);
    for (const cid of baby) {
      assert.equal(T.clAspectsFor(cid).find((a) => a.nombre === 'Size Type'), undefined, cid);
      assert.equal(T.clAspectValido(cid, 'Size Type', 'Regular'), false, `${cid} acepto Size Type`);
    }
  });

  test('en Kids 4&Up, Size Type solo aparece en Swimwear', async () => {
    await cargar();
    const kids = IDS.filter((c) => /> Kids >/.test(OFICIAL.categorias[c].ruta));
    const con = kids.filter((c) => T.clAspectsFor(c).some((a) => a.nombre === 'Size Type'));
    assert.deepEqual(con.sort(), ['175653', '51567', '51919'].sort());
  });

  test('Scrubs no muestra Department ni Size Type', async () => {
    await cargar();
    for (const cid of ['105440', '105422', '105432']) {
      const l = T.clAspectsFor(cid);
      assert.equal(l.find((a) => a.nombre === 'Department'), undefined, `${cid} muestra Department`);
      assert.equal(l.find((a) => a.nombre === 'Size Type'), undefined, `${cid} muestra Size Type`);
      assert.equal(T.clAspectValido(cid, 'Department', 'Women'), false);
      assert.equal(T.clAspectValido(cid, 'Size Type', 'Regular'), false);
    }
  });
});

// ── 5. validacion y limpieza dependiente ───────────────────────────────────
describe('validacion', () => {
  test('rechaza valores inventados en listas cerradas', async () => {
    await cargar();
    assert.equal(T.clAspectValido('57988', 'Type', 'Jacket'), true);
    assert.equal(T.clAspectValido('57988', 'Type', 'Chaqueta'), false);
    assert.equal(T.clAspectValido('57988', 'Outer Shell Material', 'Denim'), false, 'Denim no existe');
    assert.equal(T.clAspectValido('57988', 'Outer Shell Material', 'Polyester'), true);
    // el aspecto que la categoria no admite nunca es valido
    assert.equal(T.clAspectValido('105440', 'Style', 'Pullover'), false);
  });

  test('clAspectosFaltantes lista solo los obligatorios sin valor', async () => {
    await cargar();
    const cid = '57988';
    const req = T.clAspectsFor(cid).filter((a) => a.requerido).map((a) => a.nombre);
    assert.deepEqual(T.clAspectosFaltantes(cid, {}).sort(), req.slice().sort());
    const parcial = { Type: 'Jacket', Color: 'Black' };
    const faltan = T.clAspectosFaltantes(cid, parcial);
    assert.equal(faltan.includes('Type'), false);
    assert.equal(faltan.includes('Color'), false);
    assert.ok(faltan.includes('Outer Shell Material'));
  });

  test('cambiar de categoria conserva lo compatible y descarta lo demas', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    E.cl.gender = 'womens'; E.cl.type = 'clothing'; E.cl.category = 'Jacket';
    E.cl.aspects = { 'Type': 'Jacket', 'Color': 'Black', 'Outer Shell Material': 'Wool' };
    E.render();
    assert.equal(E.cl.aspects['Outer Shell Material'], 'Wool', 'valido en Coats/Jackets/Vests');

    // Skirts (63864) no admite Outer Shell Material, y 'Jacket' no es un Type suyo.
    E.cl.category = 'Skirt';
    const descartados = E.podar();
    assert.ok(descartados.includes('Outer Shell Material'), 'debe descartarse');
    assert.ok(descartados.includes('Type'), "'Jacket' no es Type valido en Skirts");
    assert.equal(E.cl.aspects['Outer Shell Material'], undefined);
    assert.equal(E.cl.aspects['Type'], undefined);
    assert.equal(E.cl.aspects['Color'], 'Black', 'Color sigue siendo valido y se conserva');
    E.tax._setEnabled(false);
  });

  test('la poda no toca fotos, SKU, precio ni peso', () => {
    const fn = extraerFuncion(APP, 'clTaxPodarAspectos');
    for (const campo of ['photos', 'sku', 'price', 'weightLb', 'weightOz', 'location', 'defects', 'notes'])
      assert.equal(new RegExp('cl\\.' + campo).test(fn), false, `la poda toca cl.${campo}`);
  });
});

// ── 6. chips: el bug de la letra 'v' ───────────────────────────────────────
describe('chips', () => {
  test("el camino nuevo no compara contra la cadena literal 'v'", () => {
    const fn = extraerFuncion(APP, 'clTaxRenderAspecto');
    assert.equal(/===\s*'v'/.test(fn), false, "quedo una comparacion contra 'v'");
    assert.match(fn, /val === actual \? ' sel' : ''/);
  });

  test('el chip elegido queda marcado tras renderizar', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    E.cl.gender = 'mens'; E.cl.type = 'clothing'; E.cl.category = 'Jacket';
    E.cl.aspects = { 'Type': 'Blazer', 'Department': 'Teens' };
    const html = E.render();
    // exactamente un chip 'sel' por cada aspecto de chips con valor
    assert.match(html, /class="cl-chip sel" data-v="Blazer"/);
    assert.match(html, /class="cl-chip sel" data-v="Teens"/);
    // y los no elegidos no llevan sel
    assert.match(html, /class="cl-chip" data-v="Coat"/);
    E.tax._setEnabled(false);
  });

  test('los cuatro chips viejos solo viven en la rama del flag apagado', () => {
    const attr = extraerFuncion(APP, 'clRenderAttr');
    for (const clase of ['cl-outermaterial-chip', 'cl-swimstyle-chip', 'cl-activity-chip', 'cl-shoewidth-chip']) {
      const i = attr.indexOf(clase);
      assert.ok(i > 0, `falta ${clase}`);
      // cada uno queda dentro de un bloque ${clTaxV134() ? '' : `...`}
      const antes = attr.lastIndexOf("clTaxV134() ? '' : `", i);
      assert.ok(antes > 0 && antes < i, `${clase} no esta detras del flag`);
    }
  });
});

// ── 7. flag apagado: los 14 escenarios, byte a byte ────────────────────────
describe('flag apagado', () => {
  // Referencia capturada del commit del PASO 2, que es lo que hay publicado.
  const REFERENCIA = {
    'mens/clothing': '3c30a6e260532b7f',   'womens/clothing': '3c30a6e260532b7f',
    'kids/clothing': '3c30a6e260532b7f',   'unisex/clothing': '3c30a6e260532b7f',
    'mens/shoes': 'ad36082a525fe043',      'womens/shoes': 'ad36082a525fe043',
    'kids/shoes': 'ad36082a525fe043',      'unisex/shoes': 'ad36082a525fe043',
    'womens/clothing/Dress': '21f03cc15e2e8f85',
    'mens/clothing/Jeans': '4c1a14bc32098f8f',
    'mens/clothing/Jacket': 'bf6346b5abe7f5da',
    'kids/clothing/Swimwear': 'e17afa13df35ec1f',
    'womens/clothing/Activewear Top': '9ea15664fd0d56a1',
    'mens/shoes/Sneakers': '3cd05c5b4efa5b2a',
  };

  test('los 14 escenarios producen el mismo HTML que antes del paso 3', () => {
    T._setEnabled(false);
    const E = entorno(APP, true);
    for (const e of ESCENARIOS) {
      Object.assign(E.cl, { category: '', ageGroup: '', kidsDept: '', adultBranch: '', aspects: {} }, e);
      assert.equal(hash(E.render()), REFERENCIA[etiqueta(e)], `cambio en ${etiqueta(e)}`);
    }
  });

  test('con el flag encendido si cambia (si no, el flag no serviria)', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    Object.assign(E.cl, { gender: 'womens', type: 'clothing', category: 'Skirt', aspects: {} });
    E.tax._setEnabled(false); const apagado = E.render();
    E.tax._setEnabled(true);  const encendido = E.render();
    E.tax._setEnabled(false);
    assert.notEqual(hash(apagado), hash(encendido));
    assert.equal(/Skirt Length/.test(apagado), false);
    assert.match(encendido, /Skirt Length/);
  });

  test('no aparece ningun control nuevo con el flag apagado', () => {
    T._setEnabled(false);
    const E = entorno(APP, true);
    Object.assign(E.cl, { gender: 'womens', type: 'clothing', category: 'Skirt', aspects: {} });
    const html = E.render();
    for (const marca of ['cl-tax-aspectos', 'cl-tax-aviso', 'ITEM SPECIFICS', 'Skirt Length',
                         'Upper Material', 'Heel Style', 'Heel Height', 'US Shoe Size'])
      assert.equal(html.includes(marca), false, `aparecio "${marca}" con el flag apagado`);
  });

  test('las secciones viejas siguen presentes con el flag apagado', () => {
    T._setEnabled(false);
    const E = entorno(APP, true);
    Object.assign(E.cl, { gender: 'mens', type: 'clothing', category: 'Jacket', aspects: {} });
    const html = E.render();
    for (const id of ['inseam-sect', 'dresslength-sect', 'outermaterial-sect',
                      'swimstyle-sect', 'activity-sect', 'shoewidth-sect', 'wheel-list'])
      assert.ok(html.includes(id), `falta ${id}`);
  });

  test('clTaxonomyBoot sigue sin conectarse al arranque', () => {
    assert.equal((APP.match(/clTaxonomyBoot\(\)/g) || []).length, 1, 'solo la definicion');
  });

  test('el flag sigue en false en el fuente', () => {
    const src = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
    assert.match(src, /var CL_TAXONOMY_V134_ENABLED = false;/);
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(APP), false);
  });
});

// ── 8. lo que el paso 3 no debe tocar ──────────────────────────────────────
describe('intocado', () => {
  test('CSV, titulos, descripcion, exportacion y localStorage sin cambios', () => {
    for (const fn of ['clExportEbayCSV', 'clBuildEbayRow', 'clBuildAspects', 'clGetEbayCategoryId',
                      'clBuildEbayCategory', 'buildClothingTitle', 'buildClothingDesc',
                      'clSizeType', 'clDept', 'clSaveToSession', 'clGetSessionCount',
                      'clClearSession', 'clNormalizePrice', 'clCleanColor', 'clInseamOptions'])
      assert.ok(APP.includes('function ' + fn + '('), `desaparecio ${fn}`);
    assert.match(APP, /'Add',r\.sku\|\|'',r\.categoryId\|\|'63861'/);
    assert.match(APP, /\*C:Size Type/);
    assert.match(APP, /return m\[cl\.category\] \|\| \(cl\.gender==='mens' \? 57990 : 53159\);/);
    assert.match(APP, /return t\.substring\(0,80\);/);
    assert.match(APP, /localStorage\.getItem\('cl_ebay_session'\)/);
  });
});
