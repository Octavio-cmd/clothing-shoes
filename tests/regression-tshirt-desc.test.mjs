// Pruebas de regresión: correcciones al generador CSV
// - Clasificación T-Shirt (solo patrones positivos) — helper clIsTShirt()
// - Descripciones neutral (sin inferencias) — helper clBuildConditionText()
// - CSV: campos con defaults eBay — helper clBuildCsvMeasurements()
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'vm';

const require = createRequire(import.meta.url);
const RAIZ = new URL('..', import.meta.url).pathname;
const T = require(join(RAIZ, 'taxonomy', 'cl-taxonomy.js'));
const APP_SOURCE = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const OFICIAL = JSON.parse(readFileSync(join(RAIZ, 'taxonomy', 'ebay-us-v134.json'), 'utf8'));

// Extraer los helpers del contexto de app.js
const helperNames = ['clIsTShirt', 'clBuildConditionText', 'clBuildCsvMeasurements'];
const extractHelper = (source, name) => {
  const pattern = new RegExp(`function ${name}\\(.*?\\)\\s*\\{[\\s\\S]*?^\\}`, 'm');
  const match = source.match(pattern);
  if (!match) throw new Error(`Helper ${name} not found in app.js`);
  return match[0];
};

const context = {};
const sandbox = vm.createContext(context);
for (const helperName of helperNames) {
  const helperCode = extractHelper(APP_SOURCE, helperName);
  vm.runInContext(helperCode, sandbox);
}
const { clIsTShirt, clBuildConditionText, clBuildCsvMeasurements } = context;

// ── 1. CLASIFICACIÓN T-SHIRT: PATRONES POSITIVOS ──────────────────────────────
// Usa helper REAL: clIsTShirt() de app.js
describe('Clasificación T-Shirt (patrones positivos)', () => {

  test('reconoce "t-shirt" como T-Shirt (Caso A)', () => {
    const title = 'Nike t-shirt Blue Large';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "t-shirt"');
  });

  test('reconoce "tshirt" como T-Shirt (Caso B)', () => {
    const title = 'tshirt graphic design';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "tshirt"');
  });

  test('reconoce "t shirt" (con espacio) como T-Shirt (Caso C)', () => {
    const title = 'vintage t shirt red';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "t shirt"');
  });

  test('reconoce "graphic tee" como T-Shirt (Caso D)', () => {
    const title = 'graphic tee band vintage';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "graphic tee"');
  });

  test('reconoce "graphic t-shirt" como T-Shirt', () => {
    const title = 'graphic t-shirt design';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "graphic t-shirt"');
  });

  test('reconoce "tee" como palabra completa T-Shirt', () => {
    const title = 'vintage tee blue';
    assert.equal(clIsTShirt(title), true, 'clIsTShirt() debe reconocer "tee" como palabra completa');
  });
});

// ── 2. CLASIFICACIÓN T-SHIRT: PATRONES NEGATIVOS ──────────────────────────────
// Usa helper REAL: clIsTShirt() de app.js
describe('Clasificación T-Shirt (patrones negativos - NO debe ser T-Shirt)', () => {

  test('NO reconoce "Dress Shirt" como T-Shirt (Caso E)', () => {
    const title = 'Dress Shirt blue';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Dress Shirt"');
  });

  test('NO reconoce "Polo Shirt" como T-Shirt (Caso F)', () => {
    const title = 'Polo Shirt red';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Polo Shirt"');
  });

  test('NO reconoce "Button-Down Shirt" como T-Shirt (Caso G)', () => {
    const title = 'Button-Down Shirt white';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Button-Down Shirt"');
  });

  test('NO reconoce "Hawaiian Shirt" como T-Shirt (Caso H)', () => {
    const title = 'Hawaiian Shirt tropical';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Hawaiian Shirt"');
  });

  test('NO reconoce "Camp Shirt" como T-Shirt', () => {
    const title = 'Camp Shirt vintage';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Camp Shirt"');
  });

  test('NO reconoce "Casual Shirt" como T-Shirt', () => {
    const title = 'Casual Shirt blue';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Casual Shirt"');
  });

  test('NO reconoce "Shirt Dress" como T-Shirt (Caso I)', () => {
    const title = 'Shirt Dress vintage';
    assert.equal(clIsTShirt(title), false, 'clIsTShirt() NO debe reconocer "Shirt Dress"');
  });
});

// ── 3. DESCRIPCIÓN: LENGUAJE NEUTRAL ──────────────────────────────────────────
// Usa helper REAL: clBuildConditionText() de app.js
describe('Descripción: lenguaje neutral sin inferencias', () => {

  test('Condición NWT: solo "Original tags attached." sin frases prohibidas', () => {
    const condText = clBuildConditionText('NWT');

    assert.equal(condText.includes('Original tags attached.'), true, 'debe incluir "Original tags attached."');
    assert.equal(condText.includes('Please review all photos for condition details.'), true, 'debe incluir frase final neutral');

    // Verificar que NO contiene frases prohibidas
    const prohibited = ['Authentic', 'never worn', 'Perfect', 'pristine', 'Stored properly', 'no flaws', 'Ready to wear immediately'];
    for (const phrase of prohibited) {
      assert.equal(condText.toLowerCase().includes(phrase.toLowerCase()), false, `NO debe contener "${phrase}"`);
    }
  });

  test('Condición NWOT: solo "Tags are not attached." sin frases prohibidas', () => {
    const condText = clBuildConditionText('NWOT');

    assert.equal(condText.includes('Tags are not attached.'), true, 'debe incluir "Tags are not attached."');
    assert.equal(condText.includes('Please review all photos for condition details.'), true, 'debe incluir frase final neutral');

    // Verificar que NO contiene frases prohibidas
    const prohibited = ['never worn', 'Perfect', 'no defects', 'Appears unused', 'no wear marks', 'Ready to wear immediately'];
    for (const phrase of prohibited) {
      assert.equal(condText.toLowerCase().includes(phrase.toLowerCase()), false, `NO debe contener "${phrase}"`);
    }
  });

  test('Condición EXCEL: no añade texto inferencial, solo frase neutral', () => {
    const condText = clBuildConditionText('EXCEL');

    assert.equal(condText, 'Please review all photos for condition details.', 'solo debe devolver frase neutral');

    // Verificar que NO contiene frases prohibidas
    const prohibited = ['Gently used', 'well maintained', 'no major flaws', 'Ready to wear', 'never worn', 'Perfect'];
    for (const phrase of prohibited) {
      assert.equal(condText.toLowerCase().includes(phrase.toLowerCase()), false, `NO debe contener "${phrase}"`);
    }
  });

  test('No hay "Ready to wear immediately" en ninguna condición', () => {
    const conditions = ['NWT', 'NWOT', 'EXCEL', 'GUD', 'ACCE'];
    for (const cond of conditions) {
      const condText = clBuildConditionText(cond);
      assert.equal(condText.includes('Ready to wear immediately'), false, `${cond}: NO debe incluir "Ready to wear immediately"`);
    }
  });
});

// ── 4. CSV: CAMPOS CON DEFAULTS eBay ──────────────────────────────────────────
// Usa helper REAL: clBuildCsvMeasurements() de app.js
describe('CSV: campos con defaults eBay correctos', () => {

  test('inseam: vacío → default 30" (o 9" para shorts), confirmado → valor exacto', () => {
    const measures1 = clBuildCsvMeasurements({ inseam: null, type: 'Pants' }, { needsInseam: true });
    assert.equal(measures1.inseam, '30"', 'inseam vacío con needsInseam=true → default 30"');

    const measures2 = clBuildCsvMeasurements({ inseam: null, type: 'Shorts' }, { needsInseam: true });
    assert.equal(measures2.inseam, '9"', 'inseam vacío con Shorts → default 9"');

    const measures3 = clBuildCsvMeasurements({ inseam: '32"' }, { needsInseam: true });
    assert.equal(measures3.inseam, '32"', 'inseam 32" → valor exacto');

    const measures4 = clBuildCsvMeasurements({ inseam: null }, { needsInseam: false });
    assert.equal(measures4.inseam, '', 'inseam vacío con needsInseam=false → vacío');
  });

  test('dressLength: vacío → default "Knee Length", confirmado → valor exacto', () => {
    const measures1 = clBuildCsvMeasurements({ dressLength: null }, { needsDressLen: true });
    assert.equal(measures1.dressLength, 'Knee Length', 'dressLength vacío con needsDressLen=true → default "Knee Length"');

    const measures2 = clBuildCsvMeasurements({ dressLength: 'Midi' }, { needsDressLen: true });
    assert.equal(measures2.dressLength, 'Midi', 'dressLength "Midi" → valor exacto');

    const measures3 = clBuildCsvMeasurements({ dressLength: null }, { needsDressLen: false });
    assert.equal(measures3.dressLength, '', 'dressLength vacío con needsDressLen=false → vacío');
  });

  test('outerMaterial: vacío → default "Polyester", confirmado → valor exacto', () => {
    const measures1 = clBuildCsvMeasurements({ outerMaterial: null }, { needsOuter: true });
    assert.equal(measures1.outerMaterial, 'Polyester', 'outerMaterial vacío con needsOuter=true → default "Polyester"');

    const measures2 = clBuildCsvMeasurements({ outerMaterial: 'Cotton' }, { needsOuter: true });
    assert.equal(measures2.outerMaterial, 'Cotton', 'outerMaterial "Cotton" → valor exacto');

    const measures3 = clBuildCsvMeasurements({ outerMaterial: null }, { needsOuter: false });
    assert.equal(measures3.outerMaterial, '', 'outerMaterial vacío con needsOuter=false → vacío');
  });

  test('activity: vacío → default "General Fitness", confirmado → valor exacto', () => {
    const measures1 = clBuildCsvMeasurements({ activity: null }, { needsActivity: true });
    assert.equal(measures1.activity, 'General Fitness', 'activity vacío con needsActivity=true → default "General Fitness"');

    const measures2 = clBuildCsvMeasurements({ activity: 'Running' }, { needsActivity: true });
    assert.equal(measures2.activity, 'Running', 'activity "Running" → valor exacto');

    const measures3 = clBuildCsvMeasurements({ activity: null }, { needsActivity: false });
    assert.equal(measures3.activity, '', 'activity vacío con needsActivity=false → vacío');
  });

  test('shoeWidth: vacío → default "Regular (B/M)", confirmado → valor exacto', () => {
    const measures1 = clBuildCsvMeasurements({ shoeWidth: null }, { needsWidth: true });
    assert.equal(measures1.shoeWidth, 'Regular (B/M)', 'shoeWidth vacío con needsWidth=true → default "Regular (B/M)"');

    const measures2 = clBuildCsvMeasurements({ shoeWidth: 'Wide' }, { needsWidth: true });
    assert.equal(measures2.shoeWidth, 'Wide', 'shoeWidth "Wide" → valor exacto');

    const measures3 = clBuildCsvMeasurements({ shoeWidth: null }, { needsWidth: false });
    assert.equal(measures3.shoeWidth, '', 'shoeWidth vacío con needsWidth=false → vacío');
  });

  test('Valores "unspecified"/"unknown" → vacío (sanitización asp)', () => {
    const measures1 = clBuildCsvMeasurements({ inseam: 'Unspecified' }, { needsInseam: true });
    assert.equal(measures1.inseam, '30"', 'inseam "Unspecified" sanitizado → default 30"');

    const measures2 = clBuildCsvMeasurements({ outerMaterial: 'n/a' }, { needsOuter: true });
    assert.equal(measures2.outerMaterial, 'Polyester', 'outerMaterial "n/a" sanitizado → default Polyester');

    const measures3 = clBuildCsvMeasurements({ activity: 'Unknown' }, { needsActivity: true });
    assert.equal(measures3.activity, 'General Fitness', 'activity "Unknown" sanitizado → default General Fitness');
  });

  test('objeto devuelto tiene exactamente 5 campos esperados', () => {
    const measures = clBuildCsvMeasurements({});
    const keys = Object.keys(measures).sort();
    const expected = ['activity', 'dressLength', 'inseam', 'outerMaterial', 'shoeWidth'].sort();
    assert.deepEqual(keys, expected, 'debe devolver exactamente los 5 campos esperados');
  });
});
