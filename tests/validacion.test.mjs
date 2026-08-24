// Pruebas permanentes del PASO 4 — validacion previa en modo informe.
// El validador es puro: no toca el CSV, ni clExportEbayCSV, ni localStorage.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { RAIZ, entorno, entornoCargado, hash, ESCENARIOS, etiqueta, extraerFuncion } from './_render.mjs';

const require = createRequire(import.meta.url);
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));
const APP = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const IDS = Object.keys(OFICIAL.categorias);

await (async () => {
  T.clTaxonomyReset();
  const r = await T.clLoadTaxonomy({ fetch: async () => ({ ok: true, json: async () => OFICIAL }), forzar: true });
  if (!r.ok) throw new Error('no cargo: ' + r.codigo);
})();

const V = (item, cid) => T.clValidateTaxonomyItem(item, cid);
const codigos = (r) => r.problemas.map((p) => p.codigo);
const porAspecto = (r, asp) => r.problemas.filter((p) => p.aspecto === asp);

// Construye un item valido: para cada obligatorio toma el primer valor oficial,
// y para los abiertos (Brand) un texto cualquiera. No usa defaults del codigo.
function itemValido(cid) {
  const item = {};
  for (const a of T.clAspectsFor(cid)) {
    if (!a.requerido) continue;
    item[a.nombre] = a.abierto ? 'Marca De Prueba' : a.valores[0];
  }
  return item;
}

// ── 1. las 88 categorias ───────────────────────────────────────────────────
describe('un articulo valido por categoria', () => {
  test('las 88 pasan sin un solo problema', () => {
    assert.equal(IDS.length, 88);
    for (const cid of IDS) {
      const r = V(itemValido(cid), cid);
      assert.equal(r.ok, true, `${cid} (${OFICIAL.categorias[cid].ruta}): ${JSON.stringify(r.problemas)}`);
      assert.equal(r.problemas.length, 0);
      assert.equal(r.categoryId, cid);
    }
  });

  test('quitar todos los aspectos reporta TODOS los obligatorios, no solo el primero', () => {
    let total = 0;
    for (const cid of IDS) {
      const req = T.clAspectsFor(cid).filter((a) => a.requerido).map((a) => a.nombre);
      const r = V({}, cid);
      assert.equal(r.ok, false, cid);
      const ausentes = r.problemas.filter((p) => p.codigo === 'OBLIGATORIO_AUSENTE').map((p) => p.aspecto);
      assert.deepEqual(ausentes.sort(), req.slice().sort(), cid);
      total += req.length;
    }
    assert.equal(total, 484, 'los 484 obligatorios del derivado');
  });

  test('un valor invalido por aspecto se reporta en todos los aspectos cerrados', () => {
    let n = 0;
    for (const cid of IDS) {
      for (const a of T.clAspectsFor(cid)) {
        if (a.abierto || !a.valores.length) continue;
        const r = V({ [a.nombre]: 'ZZZ-valor-que-no-existe' }, cid);
        const p = porAspecto(r, a.nombre);
        assert.equal(p.length, 1, `${cid}/${a.nombre} no se reporto`);
        assert.ok(['VALOR_NO_OFICIAL', 'DEPARTMENT_INCOMPATIBLE'].includes(p[0].codigo));
        n++;
      }
    }
    assert.ok(n > 600, `solo se probaron ${n} aspectos`);
  });

  test('un aspecto que la categoria no admite se reporta', () => {
    for (const cid of IDS) {
      const admite = new Set(Object.keys(OFICIAL.categorias[cid].a));
      const ajeno = ['Heel Style', 'Inseam', 'Dress Length', 'Skirt Length', 'Upper Material']
        .find((n) => !admite.has(n));
      if (!ajeno) continue;
      const r = V({ [ajeno]: 'Wedge' }, cid);
      const p = porAspecto(r, ajeno);
      assert.equal(p.length, 1, `${cid}/${ajeno}`);
      assert.equal(p[0].codigo, 'ASPECTO_NO_ADMITIDO');
    }
  });
});

// ── 2. Women's Heels 55793 ─────────────────────────────────────────────────
describe("Women's Heels 55793", () => {
  const BASE = {
    'Brand': 'Steve Madden', 'Department': 'Women', 'US Shoe Size': '8.5',
    'Color': 'Black', 'Style': 'Pump', 'Upper Material': 'Leather',
  };

  test('el articulo completo es valido', () => {
    assert.equal(V(BASE, '55793').ok, true);
  });

  test('exige Upper Material, US Shoe Size, Style, Color, Brand y Department', () => {
    for (const falta of ['Upper Material', 'US Shoe Size', 'Style', 'Color', 'Brand', 'Department']) {
      const item = { ...BASE }; delete item[falta];
      const r = V(item, '55793');
      assert.equal(r.ok, false, `sin ${falta} deberia fallar`);
      const p = porAspecto(r, falta);
      assert.equal(p.length, 1, falta);
      assert.equal(p[0].codigo, 'OBLIGATORIO_AUSENTE', falta);
    }
  });

  test('Heel Style = Wedge es valido', () => {
    assert.equal(V({ ...BASE, 'Heel Style': 'Wedge' }, '55793').ok, true);
  });

  test('Style = Wedge es invalido', () => {
    const r = V({ ...BASE, 'Style': 'Wedge' }, '55793');
    assert.equal(r.ok, false);
    const p = porAspecto(r, 'Style');
    assert.equal(p[0].codigo, 'VALOR_NO_OFICIAL');
    assert.ok(p[0].permitidos.includes('Pump'));
    assert.equal(p[0].permitidos.includes('Wedge'), false);
  });

  test('Heel Height es opcional y valida sus rangos', () => {
    assert.equal(V({ ...BASE, 'Heel Height': 'Mid (2-2.9 in)' }, '55793').ok, true);
    assert.equal(V({ ...BASE, 'Heel Height': '5 cm' }, '55793').ok, false);
  });

  test('Material (a secas) no se admite: el calzado usa Upper Material', () => {
    const r = V({ ...BASE, 'Material': 'Leather' }, '55793');
    assert.equal(porAspecto(r, 'Material')[0].codigo, 'ASPECTO_NO_ADMITIDO');
  });
});

// ── 3. faldas, vestidos y outerwear ────────────────────────────────────────
describe('Skirt Length, Dress Length y Outer Shell Material', () => {
  test("Women's Skirts 63864 exige Skirt Length", () => {
    const base = { 'Brand': 'Zara', 'Department': 'Women', 'Size': 'M', 'Size Type': 'Regular',
                   'Type': 'Skirt', 'Style': 'A-Line', 'Color': 'Black', 'Skirt Length': 'Midi' };
    assert.equal(V(base, '63864').ok, true);
    const sin = { ...base }; delete sin['Skirt Length'];
    assert.equal(porAspecto(V(sin, '63864'), 'Skirt Length')[0].codigo, 'OBLIGATORIO_AUSENTE');
  });

  test('Dress Length no se admite en faldas', () => {
    const r = V({ 'Dress Length': 'Midi' }, '63864');
    assert.equal(porAspecto(r, 'Dress Length')[0].codigo, 'ASPECTO_NO_ADMITIDO');
  });

  test('Skirt Length no se admite en vestidos', () => {
    const r = V({ 'Skirt Length': 'Midi' }, '63861');
    assert.equal(porAspecto(r, 'Skirt Length')[0].codigo, 'ASPECTO_NO_ADMITIDO');
  });

  test('outerwear exige Outer Shell Material y rechaza Denim', () => {
    for (const cid of ['57988', '63862', '155201', '260023']) {
      assert.equal(porAspecto(V({}, cid), 'Outer Shell Material')[0].codigo, 'OBLIGATORIO_AUSENTE', cid);
      const r = V({ 'Outer Shell Material': 'Denim' }, cid);
      assert.equal(porAspecto(r, 'Outer Shell Material')[0].codigo, 'VALOR_NO_OFICIAL', cid);
      assert.equal(V({ 'Outer Shell Material': 'Polyester' }, cid).problemas
        .filter((p) => p.aspecto === 'Outer Shell Material').length, 0, cid);
    }
  });
});

// ── 4. formatos que no se normalizan solos ─────────────────────────────────
describe('sin normalizacion silenciosa', () => {
  test('Men Pants 57989 rechaza 30" y acepta 30 in', () => {
    const base = { 'Brand': 'Levi', 'Department': 'Men', 'Size': '32', 'Size Type': 'Regular',
                   'Color': 'Blue', 'Style': 'Chino' };
    const malo = V({ ...base, 'Inseam': '30"' }, '57989');
    assert.equal(malo.ok, false);
    assert.equal(porAspecto(malo, 'Inseam')[0].codigo, 'VALOR_NO_OFICIAL');
    assert.ok(porAspecto(malo, 'Inseam')[0].permitidos.includes('30 in'));
    assert.equal(V({ ...base, 'Inseam': '30 in' }, '57989').ok, true);
  });

  test('las tallas de calzado infantil 1C y 7Y se rechazan', () => {
    for (const cid of ['57929', '57974', '155202'])
      for (const t of ['1C', '2C', '7Y', '13C'])
        assert.equal(porAspecto(V({ 'US Shoe Size': t }, cid), 'US Shoe Size')[0].codigo,
          'VALOR_NO_OFICIAL', `${cid} acepto ${t}`);
    assert.equal(V({ 'US Shoe Size': '5.5' }, '57929').problemas
      .filter((p) => p.aspecto === 'US Shoe Size').length, 0);
  });

  test('no se corrige XXL por 2XL ni XXS por 2XS', () => {
    for (const t of ['XXL', 'XXS'])
      assert.equal(porAspecto(V({ 'Size': t }, '15687'), 'Size')[0].codigo, 'VALOR_NO_OFICIAL');
    assert.equal(V({ 'Size': '2XL' }, '15687').problemas.filter((p) => p.aspecto === 'Size').length, 0);
  });

  test('no se acepta Petite por Petites', () => {
    assert.equal(porAspecto(V({ 'Size Type': 'Petite' }, '53159'), 'Size Type')[0].codigo, 'VALOR_NO_OFICIAL');
    assert.equal(V({ 'Size Type': 'Petites' }, '53159').problemas.filter((p) => p.aspecto === 'Size Type').length, 0);
  });

  test('no se acepta General Fitness ni Running en Performance/Activity', () => {
    for (const v of ['General Fitness', 'Running', 'Training'])
      assert.equal(porAspecto(V({ 'Performance/Activity': v }, '155183'), 'Performance/Activity')[0].codigo,
        'VALOR_NO_OFICIAL', v);
    for (const v of ['Running & Jogging', 'Gym & Training'])
      assert.equal(V({ 'Performance/Activity': v }, '155183').problemas
        .filter((p) => p.aspecto === 'Performance/Activity').length, 0, v);
  });

  test('no se aceptan las etiquetas descriptivas de Shoe Width', () => {
    assert.equal(porAspecto(V({ 'Shoe Width': 'Regular (B/M)' }, '55793'), 'Shoe Width')[0].codigo, 'VALOR_NO_OFICIAL');
    assert.equal(V({ 'Shoe Width': 'B' }, '55793').problemas.filter((p) => p.aspecto === 'Shoe Width').length, 0);
  });
});

// ── 5. Size vs US Shoe Size vs Size Type ───────────────────────────────────
describe('talla y Size Type', () => {
  test('el calzado rechaza Size y acepta US Shoe Size', () => {
    const zapatos = IDS.filter((c) => OFICIAL.categorias[c].a['US Shoe Size']);
    assert.equal(zapatos.length, 17);
    for (const cid of zapatos) {
      const r = V({ 'Size': 'M' }, cid);
      assert.equal(porAspecto(r, 'Size')[0].codigo, 'SIZE_EN_CALZADO', cid);
      const oficial = T.clAspectValues(cid, 'US Shoe Size')[0];
      assert.equal(V({ 'US Shoe Size': oficial }, cid).problemas
        .filter((p) => p.aspecto === 'US Shoe Size').length, 0, cid);
    }
  });

  test('la ropa rechaza US Shoe Size', () => {
    const ropa = IDS.filter((c) => OFICIAL.categorias[c].a['Size']);
    assert.ok(ropa.length > 60);
    for (const cid of ropa)
      assert.equal(porAspecto(V({ 'US Shoe Size': '9' }, cid), 'US Shoe Size')[0].codigo,
        'US_SHOE_SIZE_EN_ROPA', cid);
  });

  test('Baby Tops acepta 2T y no admite Size Type', () => {
    const base = { 'Brand': 'Carter', 'Department': 'Girls', 'Size': '2T', 'Type': 'T-Shirt', 'Color': 'Pink' };
    assert.equal(V(base, '260031').ok, true);
    const r = V({ ...base, 'Size Type': 'Regular' }, '260031');
    assert.equal(r.ok, false);
    assert.equal(porAspecto(r, 'Size Type')[0].codigo, 'SIZE_TYPE_NO_ADMITIDO');
  });

  test('ninguna categoria Baby admite Size Type', () => {
    const baby = IDS.filter((c) => / > Baby >/.test(OFICIAL.categorias[c].ruta));
    assert.equal(baby.length, 8);
    for (const cid of baby)
      assert.equal(porAspecto(V({ 'Size Type': 'Regular' }, cid), 'Size Type')[0].codigo, 'SIZE_TYPE_NO_ADMITIDO', cid);
  });

  test('Kids Swimwear acepta solo su Size Type oficial', () => {
    const esperado = { '51919': ['Regular','Slim','Husky'], '51567': ['Regular','Plus','Slim'], '175653': ['Regular','Plus','Slim'] };
    for (const [cid, vals] of Object.entries(esperado)) {
      for (const v of vals)
        assert.equal(V({ 'Size Type': v }, cid).problemas.filter((p) => p.aspecto === 'Size Type').length, 0, `${cid}/${v}`);
      for (const v of ['Big & Tall', 'Petites', 'Juniors', 'Maternity', 'Tall'])
        assert.equal(porAspecto(V({ 'Size Type': v }, cid), 'Size Type')[0].codigo, 'VALOR_NO_OFICIAL', `${cid}/${v}`);
    }
  });

  test('Scrubs no admite Department ni Size Type', () => {
    for (const cid of ['105440', '105422', '105432']) {
      assert.equal(porAspecto(V({ 'Department': 'Women' }, cid), 'Department')[0].codigo, 'ASPECTO_NO_ADMITIDO', cid);
      assert.equal(porAspecto(V({ 'Size Type': 'Regular' }, cid), 'Size Type')[0].codigo, 'SIZE_TYPE_NO_ADMITIDO', cid);
    }
  });

  test('Department incompatible se distingue de valor invalido cualquiera', () => {
    const r = V({ 'Department': 'Men' }, '55793');
    const p = porAspecto(r, 'Department')[0];
    assert.equal(p.codigo, 'DEPARTMENT_INCOMPATIBLE');
    assert.deepEqual(p.permitidos, ['Women', 'Teens', 'Unisex Adults']);
  });
});

// ── 6. Brand abierto ───────────────────────────────────────────────────────
describe('Brand', () => {
  test('texto libre: no hace falta estar en ninguna lista', () => {
    for (const cid of ['55793', '260031', '15687']) {
      assert.equal(V({ 'Brand': 'Marca Inventada Que No Existe SL' }, cid).problemas
        .filter((p) => p.aspecto === 'Brand').length, 0, cid);
    }
  });

  test('vacio o solo espacios cuenta como ausente', () => {
    for (const v of ['', '   ']) {
      const r = V({ 'Brand': v }, '55793');
      assert.equal(porAspecto(r, 'Brand')[0].codigo, 'OBLIGATORIO_AUSENTE', JSON.stringify(v));
    }
  });
});

// ── 7. varios errores a la vez ─────────────────────────────────────────────
describe('informe completo', () => {
  test('reporta los ocho tipos de problema en un solo articulo', () => {
    const r = V({
      'Brand': '', 'Department': 'Men', 'Size': '8.5', 'Color': 'Negro',
      'Style': 'Wedge', 'Size Type': 'Regular', 'Heel Style': 'Wedge', 'Inseam': '30 in',
    }, '55793');
    assert.equal(r.ok, false);
    const c = codigos(r);
    for (const esperado of ['DEPARTMENT_INCOMPATIBLE', 'SIZE_EN_CALZADO', 'VALOR_NO_OFICIAL',
                            'SIZE_TYPE_NO_ADMITIDO', 'ASPECTO_NO_ADMITIDO', 'OBLIGATORIO_AUSENTE'])
      assert.ok(c.includes(esperado), `falta ${esperado} en ${JSON.stringify(c)}`);
    assert.ok(r.problemas.length >= 8, `solo ${r.problemas.length} problemas`);
    // Heel Style = Wedge es correcto y NO debe aparecer
    assert.equal(porAspecto(r, 'Heel Style').length, 0);
  });

  test('categoria inexistente se reporta sin intentar validar aspectos', () => {
    const r = V({ 'Brand': 'X' }, '999999');
    assert.equal(r.ok, false);
    assert.deepEqual(codigos(r), ['CATEGORIA_INEXISTENTE']);
  });

  test('categoria vacia se reporta', () => {
    assert.deepEqual(codigos(V({}, '')), ['CATEGORIA_INEXISTENTE']);
    assert.deepEqual(codigos(V({}, null)), ['CATEGORIA_INEXISTENTE']);
  });

  test('combinacion sin resolver se reporta como tal', () => {
    const r = T.clValidateTaxonomySeleccion({ rama: 'mens', tipo: 'clothing', prenda: 'Dress' }, {});
    assert.equal(r.ok, false);
    assert.deepEqual(codigos(r), ['COMBINACION_SIN_RESOLVER']);
    assert.equal(r.problemas[0].causa, 'COMBINACION_NO_EXISTE');
  });

  test('cada problema nombra el aspecto exacto de eBay', () => {
    const r = V({ 'Size': 'M', 'Size Type': 'Regular', 'Color': 'Negro' }, '55793');
    const asp = r.problemas.map((p) => p.aspecto).filter(Boolean);
    for (const a of asp)
      assert.ok(T.ORDEN_ASPECTOS.includes(a) || Object.keys(OFICIAL.categorias['55793'].a).includes(a), a);
  });
});

// ── 8. el constructor del item ─────────────────────────────────────────────
describe('clTaxBuildItem', () => {
  test('la talla se emite como Size O como US Shoe Size, nunca ambos', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    // calzado
    Object.assign(E.cl, { gender: 'womens', type: 'shoes', category: 'Heels', size: '8.5', aspects: {} });
    let item = E.item('55793');
    assert.equal(item['US Shoe Size'], '8.5');
    assert.equal(item['Size'], undefined, 'no puede llevar Size');
    // ropa
    Object.assign(E.cl, { gender: 'womens', type: 'clothing', category: 'Skirt', size: 'M', aspects: {} });
    item = E.item('63864');
    assert.equal(item['Size'], 'M');
    assert.equal(item['US Shoe Size'], undefined, 'no puede llevar US Shoe Size');
    E.tax._setEnabled(false);
  });

  test('Brand y Color salen de los campos existentes, incluido el custom', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    Object.assign(E.cl, { gender: 'womens', type: 'shoes', category: 'Heels',
      brand: 'Other', brandCustom: 'Marca Rara', color: 'Black', aspects: {} });
    const item = E.item('55793');
    assert.equal(item['Brand'], 'Marca Rara');
    assert.equal(item['Color'], 'Black');
    E.tax._setEnabled(false);
  });

  test('Department sale de la seleccion oficial, no del formulario', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    Object.assign(E.cl, { gender: 'kids', ageGroup: 'baby', kidsDept: 'unisex',
      type: 'clothing', category: 'Tops', aspects: { 'Department': 'Men' } });
    const item = E.item('260031');
    assert.equal(item['Department'], 'Unisex Baby & Toddler');
    E.tax._setEnabled(false);
  });

  test('el informe del entorno coincide con el validador puro', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    Object.assign(E.cl, { gender: 'womens', type: 'shoes', category: 'Heels', size: '8.5',
      brand: 'Steve Madden', color: 'Black',
      aspects: { 'Style': 'Pump', 'Upper Material': 'Leather', 'Department': 'Women' } });
    const inf = E.informe();
    assert.equal(inf.ok, true, JSON.stringify(inf.problemas));
    assert.equal(inf.categoryId, '55793');
    E.tax._setEnabled(false);
  });
});

// ── 9. compatibilidad con el flag apagado ──────────────────────────────────
describe('flag apagado', () => {
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

  test('los 14 escenarios de Item Info siguen byte a byte', () => {
    T._setEnabled(false);
    const E = entorno(APP, true);
    for (const e of ESCENARIOS) {
      Object.assign(E.cl, { category: '', ageGroup: '', kidsDept: '', adultBranch: '', aspects: {} }, e);
      assert.equal(hash(E.render()), REFERENCIA[etiqueta(e)], `cambio en ${etiqueta(e)}`);
    }
  });

  test('la pantalla de revision es identica a la del commit anterior', () => {
    T._setEnabled(false);
    const A = entorno(execSync('git show HEAD:app.js', { maxBuffer: 1e9 }).toString(), true);
    const B = entorno(APP, true);
    for (const st of [
      { gender: 'womens', type: 'shoes', category: 'Heels', brand: 'Nike', color: 'Black', condition: 'NWT' },
      { gender: 'mens', type: 'clothing', category: 'Jacket', brand: 'Levi', color: 'Blue', condition: 'EXCEL' },
      { gender: 'kids', type: 'clothing', category: 'Tops', brand: '', color: '', condition: '' },
    ]) {
      Object.assign(A.cl, { sku: 'SKU-1', aspects: {} }, st);
      Object.assign(B.cl, { sku: 'SKU-1', aspects: {} }, st);
      assert.equal(B.renderReview(), A.renderReview(), `cambio en ${st.gender}/${st.category}`);
    }
  });

  test('el panel no existe con el flag apagado', () => {
    T._setEnabled(false);
    const E = entorno(APP, true);
    Object.assign(E.cl, { sku: 'S', gender: 'womens', type: 'shoes', category: 'Heels', aspects: {} });
    const html = E.renderReview();
    for (const marca of ['cl-tax-informe', 'TAXONOMIA eBay', 'Falta obligatorio'])
      assert.equal(html.includes(marca), false, `aparecio "${marca}"`);
    assert.equal(E.informe(), null, 'clTaxInforme debe devolver null con el flag apagado');
  });

  test('con el flag encendido el panel si aparece', async () => {
    const E = await entornoCargado(APP, OFICIAL);
    Object.assign(E.cl, { sku: 'S', gender: 'womens', type: 'shoes', category: 'Heels', aspects: {} });
    const html = E.renderReview();
    assert.match(html, /cl-tax-informe/);
    assert.match(html, /TAXONOMIA eBay/);
    assert.match(html, /Informe solamente. La exportacion no esta bloqueada/);
    E.tax._setEnabled(false);
  });

  test('el panel no toca el boton de exportar ni clExportEbayCSV', () => {
    const fn = extraerFuncion(APP, 'clTaxRenderInforme');
    for (const prohibido of ['clExportEbayCSV', 'clSubmit', 'disabled', 'preventDefault'])
      assert.equal(fn.includes(prohibido), false, `el panel toca ${prohibido}`);
  });

  test('clTaxonomyBoot sigue sin conectarse', () => {
    assert.equal((APP.match(/clTaxonomyBoot\(\)/g) || []).length, 1);
  });

  test('el flag sigue en false', () => {
    const src = readFileSync(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'), 'utf8');
    assert.match(src, /var CL_TAXONOMY_V134_ENABLED = false;/);
    assert.equal(/CL_TAXONOMY_V134_ENABLED\s*=\s*true/.test(APP), false);
  });
});

// ── 10. lo protegido sigue intacto ─────────────────────────────────────────
describe('intocado', () => {
  const VIEJO = execSync('git show HEAD:app.js', { maxBuffer: 1e9 }).toString();
  const PROTEGIDAS = ['clExportEbayCSV', 'clBuildEbayRow', 'clBuildAspects', 'clGetEbayCategoryId',
    'clBuildEbayCategory', 'buildClothingTitle', 'buildClothingDesc', 'clSizeType', 'clDept',
    'clGetConditionId', 'clCondText', 'clCondShort', 'clSaveToSession', 'clGetSessionCount',
    'clClearSession', 'clPreviewSession', 'clNormalizePrice', 'clCleanColor', 'clInseamOptions'];

  test('las 19 funciones protegidas son identicas byte a byte', () => {
    assert.equal(PROTEGIDAS.length, 19);
    for (const f of PROTEGIDAS)
      assert.equal(extraerFuncion(APP, f), extraerFuncion(VIEJO, f), `cambio en ${f}`);
  });

  test('todas las llamadas a localStorage son identicas', () => {
    const ls = (s) => s.match(/localStorage\.[a-zA-Z]+\([^)]*\)/g) || [];
    const a = ls(VIEJO), b = ls(APP);
    assert.ok(a.length >= 80, `solo ${a.length} llamadas`);
    assert.deepEqual(b, a);
  });

  test('el CSV no cambio', () => {
    assert.match(APP, /'Add',r\.sku\|\|'',r\.categoryId\|\|'63861'/);
    assert.match(APP, /\*C:Size Type/);
    assert.match(APP, /return t\.substring\(0,80\);/);
  });
});
