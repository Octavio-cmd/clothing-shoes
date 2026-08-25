// Pruebas permanentes — arreglo del titulo NWOT duplicado.
//
// Problema reportado (separado del PASO 7): un articulo NWOT podia terminar
// con el titulo "... NWOT New Without Tags" -- la condicion mencionada dos
// veces. Causa exacta: la forma corta ("NWOT") ya quedaba en el titulo desde
// el arranque de buildClothingTitle, y mas abajo el relleno de 80 caracteres
// agregaba TAMBIEN la forma larga porque el chequeo de "ya aparece" solo
// comparaba la cadena larga contra el titulo, nunca contra su forma corta
// equivalente.
//
// Este archivo no toca clExportEbayCSV, el CSV, la taxonomia, ni
// localStorage -- solo buildClothingTitle() y clColapsarNwotRepetido(),
// ambas puras.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { construirTitulo, colapsarNwot, APP } from './_titulo.mjs';

const contieneNWOT  = (s) => /\bNWOT\b/i.test(s);
const contieneLarga = (s) => /\bNew\s+Without\s+Tags\b/i.test(s);
const contieneAmbas = (s) => contieneNWOT(s) && contieneLarga(s);
const veces = (s, re) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;

// ── 1. titulo que ya contiene NWOT ──────────────────────────────────────────
describe('titulo NWOT — caso base', () => {
  test('un articulo NWOT menciona la condicion UNA sola vez, en forma corta', () => {
    const t = construirTitulo({ condition: 'NWOT' });
    assert.ok(contieneNWOT(t), 'debe mencionar NWOT');
    assert.equal(contieneLarga(t), false, 'no debe agregar la forma larga');
    assert.equal(veces(t, /\bNWOT\b/i), 1, 'NWOT debe aparecer una sola vez');
  });

  test('con muchos extras que llenarian los 80 caracteres, sigue sin duplicar', () => {
    // Antes del arreglo, con espacio de sobra estos extras + "New Without
    // Tags" cabian todos y el titulo terminaba con la condicion dos veces.
    const t = construirTitulo({
      condition: 'NWOT', brand: 'Levi', category: 'Jacket', size: 'M',
      gender: 'mens', outerMaterial: 'Denim', activity: 'Casual', style: 'Vintage',
    });
    assert.equal(contieneAmbas(t), false);
    assert.ok(t.length <= 80);
  });
});

// ── 2. titulo que contiene "New Without Tags" (sin la forma corta) ─────────
describe('clColapsarNwotRepetido — solo forma larga', () => {
  test('un texto que solo trae la forma larga se deja intacto (nada que colapsar)', () => {
    const entrada = 'Nike Jacket New Without Tags Size M';
    const salida = colapsarNwot(entrada);
    assert.equal(salida, entrada);
    assert.equal(contieneNWOT(salida), false);
    assert.equal(veces(salida, /\bNew\s+Without\s+Tags\b/i), 1);
  });
});

// ── 3. Claude devuelve ambas expresiones ────────────────────────────────────
describe('clColapsarNwotRepetido — ambas formas juntas', () => {
  test('colapsa a una sola mencion, conservando la forma corta', () => {
    const entrada = 'Nike Jacket NWOT New Without Tags Size M';
    const salida = colapsarNwot(entrada);
    assert.equal(contieneAmbas(salida), false, 'no debe quedar ninguna salida con las dos formas');
    assert.equal(veces(salida, /\bNWOT\b/i), 1);
    assert.equal(contieneLarga(salida), false);
    assert.match(salida, /\bNWOT\b/);
    assert.match(salida, /Nike Jacket NWOT Size M/, 'el resto del titulo no se altera');
  });

  test('tambien colapsa cuando la forma larga viene primero', () => {
    const salida = colapsarNwot('Nike Jacket New Without Tags NWOT Size M');
    assert.equal(contieneAmbas(salida), false);
    assert.equal(veces(salida, /\bNWOT\b/i), 1);
  });

  test('NWOT NWOT (la misma forma repetida) tambien colapsa a una sola', () => {
    const salida = colapsarNwot('Nike Jacket NWOT NWOT Size M');
    assert.equal(veces(salida, /\bNWOT\b/i), 1);
  });
});

// ── 4. diferencias de mayusculas/minusculas ─────────────────────────────────
describe('clColapsarNwotRepetido — mayusculas y minusculas', () => {
  test('detecta y colapsa sin importar el caso, en cualquier combinacion', () => {
    const casos = [
      'nike jacket nwot new without tags size m',
      'Nike Jacket Nwot New Without Tags Size M',
      'NIKE JACKET NWOT NEW WITHOUT TAGS SIZE M',
      'Nike Jacket NWOT new WITHOUT tags Size M',
    ];
    for (const entrada of casos) {
      const salida = colapsarNwot(entrada);
      assert.equal(contieneAmbas(salida), false, `deberia colapsar: "${entrada}"`);
      assert.equal(veces(salida, /\bNWOT\b/i), 1, `deberia dejar NWOT una vez: "${entrada}"`);
    }
  });

  test('conserva el caso ORIGINAL de la forma corta que ya estaba (no la fuerza a mayusculas)', () => {
    const salida = colapsarNwot('nike jacket nwot new without tags size m');
    assert.match(salida, /\bnwot\b/, 'la forma corta en minusculas no se reescribe');
  });
});

// ── 5. titulo cercano a 80 caracteres ───────────────────────────────────────
describe('limite de 80 caracteres', () => {
  test('buildClothingTitle nunca excede 80, incluso saturado de extras en NWOT', () => {
    const t = construirTitulo({
      condition: 'NWOT', brand: 'Ralph Lauren', category: 'Activewear Top', size: 'XL',
      gender: 'womens', color: 'Navy Blue', outerMaterial: 'Polyester Blend',
      activity: 'Running', style: 'Athletic',
    });
    assert.ok(t.length <= 80, `titulo de ${t.length} caracteres excede el limite`);
  });

  test('clColapsarNwotRepetido nunca alarga el texto y no corta palabras a la mitad', () => {
    // ~80 caracteres, con las dos formas adentro -- simula lo que podria
    // llegar de Claude si no respetara las instrucciones.
    const entrada = 'Ralph Lauren Womens Activewear Top XL Navy NWOT New Without Tags Running Item';
    assert.ok(entrada.length <= 90 && entrada.length >= 70, 'fixture cerca de 80 (sanity check)');
    const salida = colapsarNwot(entrada);
    assert.ok(salida.length <= entrada.length, 'colapsar solo puede acortar, nunca alargar');
    assert.ok(salida.length <= 80);
    // ninguna palabra queda partida: cada token de la salida existia entero
    // como palabra completa en la entrada.
    const palabrasEntrada = new Set(entrada.split(/\s+/));
    for (const palabra of salida.split(/\s+/)) {
      assert.ok(palabrasEntrada.has(palabra), `palabra cortada o inventada: "${palabra}"`);
    }
  });
});

// ── 6. NWT sigue sin cambios ────────────────────────────────────────────────
describe('NWT no se toca', () => {
  test('un articulo NWT con extras de sobra conserva el comportamiento exacto de antes', () => {
    // Deliberado: para NWT, buildClothingTitle sigue evaluando _condLong =
    // 'New With Tags' exactamente igual que antes de este arreglo (el
    // ternario para NWT no se modifico un solo caracter). Este valor
    // concreto (con "New With Tags" agregado) es el que YA se producia y
    // debe seguir produciendose -- no es una regresion, es la garantia de
    // "no cambies NWT" verificada con un ejemplo real.
    const t = construirTitulo({
      condition: 'NWT', brand: 'Zara', category: 'Dress', size: 'S', gender: 'womens',
    });
    assert.match(t, /\bNWT\b/);
    assert.equal(t, 'Zara Dress Black Size S Women\'s NWT New With Tags');
  });

  test('clColapsarNwotRepetido nunca se invoca para NWT (no aparece en su rama)', () => {
    // buildClothingTitle solo llama clColapsarNwotRepetido dentro de un
    // "if (cl.condition === 'NWOT')" -- confirmado por inspeccion de fuente,
    // no solo por el resultado, para que quede imposible de romper en
    // silencio si alguien reordena el codigo mas adelante.
    const src = APP;
    const i = src.indexOf('function buildClothingTitle(');
    let d = 0, cierre = -1;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { cierre = k; break; } }
    }
    const fn = src.slice(i, cierre + 1);
    const linea = fn.split('\n').find((l) => l.includes('clColapsarNwotRepetido('));
    assert.match(linea, /if \(cl\.condition === 'NWOT'\)/);
  });

  test('EXCEL/GOOD/FAIR tampoco se tocan: sin forma larga, titulo intacto', () => {
    for (const condition of ['EXCEL', 'GOOD', 'FAIR']) {
      const t = construirTitulo({ condition, brand: 'Zara', category: 'Dress', size: 'S', gender: 'womens' });
      assert.equal(contieneNWOT(t), false);
      assert.equal(contieneLarga(t), false);
    }
  });
});

// ── 7. ninguna salida contiene ambas expresiones ────────────────────────────
describe('propiedad general', () => {
  const escenarios = [
    { brand: 'Nike', category: 'Jacket', size: 'M', gender: 'mens' },
    { brand: 'Levi', category: 'Jeans', size: '32', gender: 'unisex' },
    { brand: '', category: 'Tops', size: '4T', gender: 'kids' },
    { brand: 'Ralph Lauren', category: 'Activewear Top', size: 'XL', gender: 'womens',
      color: 'Navy Blue', outerMaterial: 'Polyester', activity: 'Yoga', style: 'Athletic' },
    { brand: 'Zara', category: 'Skirt', size: '6', gender: 'womens', dressLength: 'Midi' },
  ];

  test('ningun escenario NWOT produce un titulo con las dos formas a la vez', () => {
    for (const e of escenarios) {
      const t = construirTitulo(Object.assign({ condition: 'NWOT' }, e));
      assert.equal(contieneAmbas(t), false, `escenario con ambas formas: ${JSON.stringify(e)} -> "${t}"`);
      assert.ok(t.length <= 80);
    }
  });
});
