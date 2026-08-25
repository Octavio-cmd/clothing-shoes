// Pruebas permanentes — Material y Sleeve Length en la descripción (v134).
//
// Objetivo: cuando el flag v134 esté encendido y la usuaria haya capturado
// estos aspectos (en cl.aspects), la descripción debe incluirlos si la categoría los admite:
// - Material
// - Upper Material
// - Outer Shell Material (ya existía, legado)
// - Sleeve Length
//
// Reglas:
// - solo incluir el aspecto si la categoría oficial lo admite Y existe un valor capturado;
// - los valores vienen de cl.aspects, no de campos planos;
// - no inventar Polyester ni ningún material;
// - no usar un material como sustituto de otro;
// - Material, Upper Material y Outer Shell Material son campos distintos;
// - no duplicar un valor si ya aparece en la descripción;
// - no agregar Material ni Sleeve Length al título;
// - con flag false, la descripción antigua debe quedar byte a byte idéntica;
// - conservar compatibilidad con los campos legado existentes;
// - no modificar CSV, categorías, precios, condición, medidas, exportación ni localStorage.
//
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { construirDesc, APP } from './_descripcion.mjs';

// ── HELPERS ──────────────────────────────────────────────────────────────
const contieneTexto = (html, texto) => html.includes(texto);
const contieneClass = (html, tag) => new RegExp(`<${tag}[^>]*>`).test(html);

// ── 1. Material en la descripción (flag encendido) ──────────────────────
describe('Material en descripción — flag v134 encendido', () => {
  test('una camisa con Material en cl.aspects incluye el valor en los detalles', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { Material: 'Alpaca', 'Sleeve Length': 'Long Sleeve' },
      color: 'Blue'
    }, true);
    assert.ok(contieneTexto(desc, 'Material: Alpaca'), 'debe mencionar Material: Alpaca');
    assert.ok(contieneTexto(desc, 'Sleeve Length: Long Sleeve'), 'debe mencionar Sleeve Length: Long Sleeve');
    assert.ok(contieneTexto(desc, 'Color: Blue'), 'debe mencionar Color');
  });

  test('Material vacío o unspecified no aparece', () => {
    const desc1 = construirDesc({ category: 'Shirt', aspects: { Material: '' } }, true);
    assert.equal(contieneTexto(desc1, '· Material:'), false, 'material vacío no debe aparecer');

    const desc2 = construirDesc({ category: 'Shirt', aspects: { Material: 'Unspecified' } }, true);
    assert.equal(contieneTexto(desc2, '· Material:'), false, 'material Unspecified no debe aparecer');
  });

  test('Material Unknown, None y variantes de filtro no aparecen', () => {
    const valores = ['Unknown', 'None', 'N/A', 'none', 'n/a'];
    for (const v of valores) {
      const desc = construirDesc({ category: 'Shirt', aspects: { Material: v } }, true);
      assert.equal(contieneTexto(desc, '· Material:'), false, `"${v}" no debe incluirse`);
    }
  });

  test('Material no aparece si la categoría no lo admite', () => {
    const desc = construirDesc({
      category: 'Boots',
      type: 'shoes',
      aspects: { Material: 'Alpaca' }  // Boots no admite Material, solo Upper Material
    }, true);
    assert.equal(contieneTexto(desc, '· Material:'), false, 'Material no debe aparecer en Shoes');
  });
});

// ── 2. Upper Material en la descripción (calzado) ────────────────────
describe('Upper Material en descripción — calzado con flag v134', () => {
  test('un zapato con Upper Material en cl.aspects incluye el valor', () => {
    const desc = construirDesc({
      category: 'Boots',
      type: 'shoes',
      aspects: { 'Upper Material': 'Suede' },
      color: 'Brown'
    }, true);
    assert.ok(contieneTexto(desc, 'Upper Material: Suede'), 'debe mencionar Upper Material: Suede');
  });

  test('Upper Material vacío no aparece', () => {
    const desc = construirDesc({ category: 'Boots', type: 'shoes', aspects: { 'Upper Material': '' } }, true);
    assert.equal(contieneTexto(desc, '· Upper Material:'), false, 'upper material vacío no debe aparecer');
  });

  test('Upper Material no aparece en categorías que no lo admiten', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { 'Upper Material': 'Leather' }
    }, true);
    assert.equal(contieneTexto(desc, '· Upper Material:'), false, 'Upper Material no debe aparecer en Shirts');
  });
});

// ── 3. Outer Shell Material (ya existía, debe seguir funcionando) ──────
describe('Outer Shell Material — comportamiento existente', () => {
  test('una chaqueta con Outer Shell Material (legado) sigue incluyéndolo con flag false', () => {
    const desc = construirDesc({
      category: 'Coats, Jackets & Vests',
      outerMaterial: 'Polyester'
    }, false);
    assert.ok(contieneTexto(desc, 'Outer Shell: Polyester'), 'debe mencionar Outer Shell');
  });

  test('con flag false, Outer Shell Material usa el legado cl.outerMaterial', () => {
    const desc = construirDesc({
      category: 'Coats, Jackets & Vests',
      outerMaterial: 'Polyester'
    }, false);
    assert.ok(contieneTexto(desc, 'Outer Shell: Polyester'), 'Outer Shell debe aparecer con flag false');
  });
});

// ── 4. Sleeve Length en la descripción ────────────────────────────────
describe('Sleeve Length en descripción — flag v134 encendido', () => {
  test('una camisa con Sleeve Length en cl.aspects incluye el valor', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { 'Sleeve Length': 'Long Sleeve' },
      color: 'White'
    }, true);
    assert.ok(contieneTexto(desc, 'Sleeve Length: Long Sleeve'), 'debe mencionar Sleeve Length: Long Sleeve');
  });

  test('Sleeve Length vacío no aparece', () => {
    const desc = construirDesc({ category: 'Shirt', aspects: { 'Sleeve Length': '' } }, true);
    assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, 'sleeve length vacío no debe aparecer');
  });

  test('Sleeve Length Unspecified y variantes no aparecen', () => {
    const valores = ['Unspecified', 'Unknown', 'N/A', 'none'];
    for (const v of valores) {
      const desc = construirDesc({ category: 'Shirt', aspects: { 'Sleeve Length': v } }, true);
      assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, `Sleeve Length "${v}" no debe incluirse`);
    }
  });

  test('Sleeve Length no aparece si la categoría no lo admite', () => {
    const desc = construirDesc({
      category: 'Boots',
      aspects: { 'Sleeve Length': 'Long Sleeve' }
    }, true);
    assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, 'Sleeve Length no debe aparecer en Shoes');
  });
});

// ── 5. Flag false — descripción idéntica a la antigua ────────────────
describe('flag false — descripción idéntica byte a byte', () => {
  test('sin Material ni Sleeve Length en la descripción cuando flag es false', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { Material: 'Alpaca', 'Sleeve Length': 'Long Sleeve' },
      color: 'Blue'
    }, false);
    assert.equal(contieneTexto(desc, '· Material:'), false, 'Material no debe aparecer con flag false');
    assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, 'Sleeve Length no debe aparecer con flag false');
  });

  test('con flag false, Outer Shell sigue apareciendo normalmente', () => {
    const desc = construirDesc({
      category: 'Coats, Jackets & Vests',
      outerMaterial: 'Nylon'
    }, false);
    assert.ok(contieneTexto(desc, '· Outer Shell:'), 'Outer Shell debe aparecer incluso con flag false');
  });

  test('estructura HTML intacta con flag false', () => {
    const desc = construirDesc({
      category: 'Shirt',
      color: 'Red',
      size: 'S'
    }, false);
    assert.ok(contieneClass(desc, 'p'), 'debe tener párrafos');
    assert.ok(contieneClass(desc, 'strong'), 'debe tener strong tags');
    assert.ok(contieneTexto(desc, 'Condition:'), 'debe tener Condition section');
  });
});

// ── 6. Sin resolución de categoría ─────────────────────────────────────
describe('categoría sin resolución oficial', () => {
  test('sin categoría válida, no se añaden aspectos v134', () => {
    const desc = construirDesc({
      category: 'Categoría Inexistente',
      aspects: { Material: 'Alpaca', 'Sleeve Length': 'Long Sleeve' }
    }, true);
    assert.equal(contieneTexto(desc, '· Material:'), false, 'Material no debe aparecer sin categoría válida');
    assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, 'Sleeve Length no debe aparecer sin categoría válida');
  });
});

// ── 7. Título no incluye Material ni Sleeve Length ─────────────────────
describe('título no incluye Material ni Sleeve Length', () => {
  test('título no menciona Material aunque esté capturado', () => {
    const src = APP;
    const titleFn = src.indexOf('function buildClothingTitle(');
    if (titleFn > -1) {
      let depth = 0;
      let end = titleFn;
      for (let i = titleFn; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const titleCode = src.slice(titleFn, end);
      // Material y Sleeve Length no deben estar como cl.material, cl.sleeveLength, etc.
      assert.equal(titleCode.includes('cl.material'), false, 'buildClothingTitle no debe usar cl.material');
      assert.equal(titleCode.includes('cl.sleeveLength'), false, 'buildClothingTitle no debe usar cl.sleeveLength');
    }
  });
});

// ── 8. Combinaciones múltiples de aspectos ─────────────────────────────
describe('combinaciones múltiples de aspectos', () => {
  test('zapato con Upper Material, sin Material regular', () => {
    const desc = construirDesc({
      category: 'Boots',
      type: 'shoes',
      aspects: { 'Upper Material': 'Leather' }
    }, true);
    assert.ok(contieneTexto(desc, 'Upper Material: Leather'), 'debe incluir Upper Material');
    assert.equal(contieneTexto(desc, '· Material:'), false, 'no debe incluir Material regular para zapatos');
  });

  test('chaqueta con Outer Shell v134, sin Material ni Upper Material', () => {
    const desc = construirDesc({
      category: 'Jacket',
      aspects: { 'Outer Shell Material': 'Wool' }
    }, true);
    assert.ok(contieneTexto(desc, 'Outer Shell Material: Wool'), 'debe incluir Outer Shell Material');
    assert.equal(contieneTexto(desc, '· Material:'), false, 'no debe incluir Material');
    assert.equal(contieneTexto(desc, '· Upper Material:'), false, 'no debe incluir Upper Material');
  });

  test('camisa con Material y Sleeve Length', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { Material: 'Acrylic', 'Sleeve Length': 'Short Sleeve' },
      color: 'Beige'
    }, true);
    assert.ok(contieneTexto(desc, 'Material: Acrylic'), 'debe mencionar Material');
    assert.ok(contieneTexto(desc, 'Sleeve Length: Short Sleeve'), 'debe mencionar Sleeve Length');
    assert.ok(contieneTexto(desc, 'Color: Beige'), 'debe mantener Color');
  });
});

// ── 9. Preservación de otros campos ──────────────────────────────────
describe('otros campos preservados', () => {
  test('Inseam, Activity siguen funcionando', () => {
    const desc = construirDesc({
      category: 'Pants',
      inseam: '32"',
      activity: 'Casual',
      aspects: { Material: 'Acrylic' }
    }, true);
    assert.ok(contieneTexto(desc, 'Inseam: 32"'), 'debe mantener Inseam');
    assert.ok(contieneTexto(desc, 'Activity: Casual'), 'debe mantener Activity');
    assert.ok(contieneTexto(desc, 'Material: Acrylic'), 'debe incluir Material nuevo');
  });

  test('condición y defectos siguen en su lugar', () => {
    const desc = construirDesc({
      category: 'Shirt',
      condition: 'NWOT',
      defects: ['small stain'],
      aspects: { Material: 'Alpaca' }
    }, true);
    assert.ok(contieneTexto(desc, 'Never worn or tried on'), 'debe mantener NWOT description');
    assert.ok(contieneTexto(desc, 'small stain'), 'debe mantener defects');
  });
});

// ── 10. Sin fallbacks ni sustituciones ────────────────────────────────
describe('sin fallbacks ni sustituciones', () => {
  test('no se sustituye Material por Upper Material aunque falte', () => {
    const desc = construirDesc({
      category: 'Boots',
      aspects: { Material: 'Alpaca' }  // shoes no admite Material
    }, true);
    assert.equal(contieneTexto(desc, 'Material:'), false, 'no debe inventar Material para shoes');
    assert.equal(contieneTexto(desc, 'Upper Material:'), false, 'no debe substituir con Upper Material');
  });

  test('Sleeve Length nunca se rellena con un valor inventado', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { 'Sleeve Length': '' }
    }, true);
    assert.equal(contieneTexto(desc, '· Sleeve Length:'), false, 'Sleeve Length vacío no debe aparecer');
  });
});

// ── 11. Valores sintácticamente normales pero NO oficiales ──────────────
describe('validación oficial de valores', () => {
  test('Material no-oficial "Unobtainium" queda fuera', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { Material: 'Unobtainium' }
    }, true);
    assert.equal(contieneTexto(desc, 'Material:'), false, 'Unobtainium no es un valor oficial, debe rechazarse');
    assert.equal(contieneTexto(desc, 'Unobtainium'), false, 'el valor no debe aparecer en ningún lugar');
  });

  test('Sleeve Length no-oficial "Gigantic" queda fuera', () => {
    const desc = construirDesc({
      category: 'Shirt',
      aspects: { 'Sleeve Length': 'Gigantic' }
    }, true);
    assert.equal(contieneTexto(desc, 'Sleeve Length:'), false, 'Gigantic no es un valor oficial, debe rechazarse');
    assert.equal(contieneTexto(desc, 'Gigantic'), false, 'el valor no debe aparecer en ningún lugar');
  });
});

// ── 12. No-fallback: cl.outerMaterial plano NO es fallback de v134 ──────
describe('no-fallback de cl.outerMaterial en v134', () => {
  test('flag=true + cl.outerMaterial + aspects vacío → NO aparece Outer Shell', () => {
    const desc = construirDesc({
      category: 'Coats, Jackets & Vests',
      outerMaterial: 'Polyester',     // campo plano LEGACY
      aspects: {}                      // aspects vacío
    }, true);
    // Con flag=true, solo cl.aspects['Outer Shell Material'] debe usarse
    // El campo plano cl.outerMaterial NO debe ser fallback
    assert.equal(contieneTexto(desc, 'Outer Shell'), false,
      'cl.outerMaterial plano NO debe usarse como fallback cuando flag=true');
  });

  test('flag=false + cl.outerMaterial → aparece con etiqueta heredada "Outer Shell:"', () => {
    const desc = construirDesc({
      category: 'Coats, Jackets & Vests',
      outerMaterial: 'Polyester'
    }, false);
    assert.ok(contieneTexto(desc, 'Outer Shell: Polyester'),
      'Con flag=false, debe aparecer cl.outerMaterial con etiqueta heredada "Outer Shell:"');
  });
});

// ── 13. Etiqueta completa v134 vs heredada ─────────────────────────────
describe('etiquetas: "Outer Shell Material:" (v134) vs "Outer Shell:" (legacy)', () => {
  test('v134: valor desde cl.aspects usa etiqueta completa "Outer Shell Material:"', () => {
    const desc = construirDesc({
      category: 'Jacket',
      aspects: { 'Outer Shell Material': 'Nylon' }
    }, true);
    assert.ok(contieneTexto(desc, 'Outer Shell Material: Nylon'),
      'Con v134, etiqueta debe ser "Outer Shell Material:" (completa)');
    // Verificar que NO aparece la etiqueta heredada
    assert.equal(contieneTexto(desc, '· Outer Shell: Nylon'), false,
      'Con v134, NO debe usar etiqueta heredada "Outer Shell:"');
  });

  test('legacy: valor desde cl.outerMaterial usa etiqueta heredada "Outer Shell:"', () => {
    const desc = construirDesc({
      category: 'Jacket',
      outerMaterial: 'Wool'
    }, false);
    assert.ok(contieneTexto(desc, 'Outer Shell: Wool'),
      'Con flag=false, etiqueta debe ser "Outer Shell:" (heredada)');
    assert.equal(contieneTexto(desc, 'Outer Shell Material:'), false,
      'Con flag=false, NO debe usar etiqueta v134 "Outer Shell Material:"');
  });
});

// ── 14. Compatibilidad byte a byte: flag=false genera HTML idéntico ─────
describe('compatibilidad byte a byte con flag=false', () => {
  test('flag=false sin aspectos genera HTML idéntico a flag=true sin aspectos v134', () => {
    const base = {
      category: 'Shirt',
      color: 'Blue',
      size: 'M',
      condition: 'NWOT'
    };
    const descFalse = construirDesc(base, false);
    const descTrue = construirDesc(base, true);
    // Sin aspectos capturados, ambos deben generar el MISMO HTML
    assert.equal(descTrue, descFalse,
      'Con flag=true pero sin aspectos v134, debe ser byte-a-byte idéntico a flag=false');
  });

  test('flag=false con cl.outerMaterial retiene etiqueta heredada "Outer Shell:" (no v134)', () => {
    const desc = construirDesc({
      category: 'Jacket',
      outerMaterial: 'Cotton',
      color: 'Black',
      condition: 'NWOT'
    }, false);
    // flag=false debe usar la etiqueta heredada
    assert.ok(contieneTexto(desc, 'Outer Shell: Cotton'), 'flag=false: debe tener Outer Shell con etiqueta heredada');
    // Verificar que NO contiene la etiqueta v134
    assert.equal(contieneTexto(desc, 'Outer Shell Material:'), false, 'flag=false: no debe tener etiqueta v134');
  });

  test('flag=false mantiene estructura HTML sin cambios', () => {
    const desc = construirDesc({
      category: 'Shirt',
      color: 'Red',
      size: 'S',
      condition: 'NWOT'
    }, false);
    // Estructura esperada
    assert.ok(contieneClass(desc, 'p'), 'debe tener párrafos <p>');
    assert.ok(contieneClass(desc, 'strong'), 'debe tener etiquetas <strong>');
    assert.ok(contieneTexto(desc, '<br>'), 'debe tener saltos de línea <br>');
    assert.ok(contieneTexto(desc, 'Condition:'), 'debe tener sección de Condición');
    assert.ok(contieneTexto(desc, 'Shipping:'), 'debe tener sección de Envío');
    assert.ok(contieneTexto(desc, 'Returns:'), 'debe tener sección de Devoluciones');
    assert.ok(contieneTexto(desc, 'Disclaimer:'), 'debe tener sección de Renuncia');
  });
});
