// ---------------------------------------------------------------------------
// cl-taxonomy.js — carga y resolucion de la taxonomia oficial EBAY_US v134.
//
// PASO 2. Todo lo de aqui esta APAGADO por defecto: con
// CL_TAXONOMY_V134_ENABLED = false la aplicacion se comporta exactamente como
// antes. Este archivo no toca el CSV, ni clGetEbayCategoryId, ni clBuildAspects,
// ni titulos, ni localStorage.
//
// Script clasico, no modulo: index.html lo carga con <script src>. Tambien
// exporta con module.exports para poder probarlo en Node sin DOM.
// ---------------------------------------------------------------------------
(function (raiz) {
  'use strict';

  // ── EL FLAG ───────────────────────────────────────────────────────────────
  // Mientras esto sea false, nada de este archivo cambia el comportamiento.
  var CL_TAXONOMY_V134_ENABLED = false;

  var RUTA    = 'taxonomy/ebay-us-v134.json';
  var ESQUEMA = 1;
  var MARKET  = 'EBAY_US';
  var ARBOL   = '0';
  var VERSION = '134';

  // Departamento oficial por grupo de edad. Baby y Kids 4&Up NO comparten
  // vocabulario: en Baby el unisex es 'Unisex Baby & Toddler'.
  var DEPT_BABY  = { boys: 'Boys', girls: 'Girls', unisex: 'Unisex Baby & Toddler' };
  var DEPT_KIDS  = { boys: 'Boys', girls: 'Girls', unisex: 'Unisex Kids' };

  // Estado de carga. Una sola vez: la promesa se memoriza.
  var _datos   = null;   // el derivado ya validado
  var _promesa = null;   // carga en vuelo o terminada
  var _error   = null;   // motivo del ultimo fallo

  // ── error estructurado ────────────────────────────────────────────────────
  // Nunca se devuelve un category ID por defecto. Quien llame decide que hacer,
  // pero no puede confundir un fallo con un acierto.
  function fallo(codigo, mensaje, extra) {
    var e = { ok: false, codigo: codigo, mensaje: mensaje };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
    return e;
  }

  // ── validacion del archivo ────────────────────────────────────────────────
  // Rechaza cualquier cosa que no sea exactamente el arbol que esperamos.
  // No hay modo tolerante: un archivo a medias es un archivo invalido.
  function clTaxonomyValidate(d) {
    if (!d || typeof d !== 'object')        return fallo('NO_ES_OBJETO', 'El archivo de taxonomia no es un objeto JSON.');
    if (d.esquema !== ESQUEMA)              return fallo('ESQUEMA', 'Esquema ' + d.esquema + ', se esperaba ' + ESQUEMA + '.', { recibido: d.esquema });
    if (d.marketplace !== MARKET)           return fallo('MARKETPLACE', 'Marketplace ' + d.marketplace + ', se esperaba ' + MARKET + '.', { recibido: d.marketplace });
    if (d.categoryTreeId !== ARBOL)         return fallo('ARBOL', 'categoryTreeId ' + d.categoryTreeId + ', se esperaba ' + ARBOL + '.', { recibido: d.categoryTreeId });
    if (d.categoryTreeVersion !== VERSION)  return fallo('VERSION', 'Version del arbol ' + d.categoryTreeVersion + ', se esperaba ' + VERSION + '. Hay que regenerar el derivado.', { recibido: d.categoryTreeVersion });
    if (!d.categorias || typeof d.categorias !== 'object') return fallo('SIN_CATEGORIAS', 'Falta el bloque categorias.');
    if (!d.seleccion  || typeof d.seleccion  !== 'object') return fallo('SIN_SELECCION', 'Falta el bloque seleccion.');
    if (!d.listas     || typeof d.listas     !== 'object') return fallo('SIN_LISTAS', 'Falta el bloque listas.');
    if (!Object.keys(d.categorias).length)                 return fallo('CATEGORIAS_VACIAS', 'El bloque categorias esta vacio.');

    // Integridad interna: ninguna combinacion puede apuntar fuera del mapa.
    // Esto es lo que garantiza que no exista fallback ni siquiera por descuido.
    var huerfanas = [];
    var combos = 0;
    (function rec(nodo, ruta) {
      for (var k in nodo) {
        if (!Object.prototype.hasOwnProperty.call(nodo, k)) continue;
        var v = nodo[k];
        if (typeof v === 'number' || typeof v === 'string') {
          combos++;
          if (!d.categorias[String(v)]) huerfanas.push(ruta.concat(k).join('/') + ' -> ' + v);
        } else if (v && typeof v === 'object') rec(v, ruta.concat(k));
      }
    })(d.seleccion, []);
    if (huerfanas.length) return fallo('COMBINACION_HUERFANA', 'Hay combinaciones que apuntan a categorias ausentes.', { huerfanas: huerfanas.slice(0, 5) });
    if (!combos)          return fallo('SIN_COMBINACIONES', 'El bloque seleccion no tiene ninguna combinacion.');

    // Cada categoria tiene que traer nombre, ruta y aspectos.
    var incompletas = [];
    for (var cid in d.categorias) {
      if (!Object.prototype.hasOwnProperty.call(d.categorias, cid)) continue;
      var c = d.categorias[cid];
      if (!c || !c.n || !c.ruta || !c.a || typeof c.a !== 'object') incompletas.push(cid);
    }
    if (incompletas.length) return fallo('CATEGORIA_INCOMPLETA', 'Hay categorias sin nombre, ruta o aspectos.', { categorias: incompletas.slice(0, 5) });

    return { ok: true, combinaciones: combos, categorias: Object.keys(d.categorias).length };
  }

  // ── carga ─────────────────────────────────────────────────────────────────
  // Una sola vez. Si falla, el error queda registrado y clTaxonomyReady() es
  // false: quien dependa de la taxonomia debe bloquear, nunca seguir con el
  // mapa viejo.
  function clLoadTaxonomy(opciones) {
    opciones = opciones || {};
    if (_promesa && !opciones.forzar) return _promesa;

    var traer = opciones.fetch
      || (typeof raiz.fetch === 'function' ? raiz.fetch.bind(raiz) : null);
    var ruta = opciones.ruta || RUTA;

    if (!traer) {
      _error = fallo('SIN_FETCH', 'No hay fetch disponible para cargar la taxonomia.');
      _promesa = Promise.resolve(_error);
      return _promesa;
    }

    _promesa = Promise.resolve()
      .then(function () { return traer(ruta); })
      .then(function (r) {
        if (!r || r.ok === false) {
          throw fallo('HTTP', 'No se pudo descargar ' + ruta + (r && r.status ? ' (HTTP ' + r.status + ')' : '') + '.', { status: r && r.status });
        }
        return r.json();
      })
      .then(function (d) {
        var v = clTaxonomyValidate(d);
        if (!v.ok) throw v;
        _datos = d;
        _error = null;
        return { ok: true, categorias: v.categorias, combinaciones: v.combinaciones };
      })
      .catch(function (e) {
        _datos = null;
        _error = (e && e.codigo) ? e : fallo('EXCEPCION', String((e && e.message) || e));
        return _error;
      });

    return _promesa;
  }

  function clTaxonomyReady()  { return _datos !== null; }
  function clTaxonomyError()  { return _error; }
  function clTaxonomyData()   { return _datos; }
  function clTaxonomyReset()  { _datos = null; _promesa = null; _error = null; }

  // ── resolucion ────────────────────────────────────────────────────────────
  // Unica via para obtener un category ID. Solo mira `seleccion`. Si la
  // combinacion no existe devuelve un error estructurado; jamas un ID por
  // defecto.
  //
  //   sel = { rama, tipo, prenda, ageGroup, kidsDept, adultBranch }
  //
  //   rama: 'mens' | 'womens' | 'unisex' | 'kids' | 'specialty'
  //   tipo: 'clothing' | 'shoes'
  //   ageGroup (solo kids):    'baby' | 'kids4up'
  //   kidsDept (solo kids):    'boys' | 'girls' | 'unisex'
  //   adultBranch (solo unisex adulto): 'mens' | 'womens'
  function clResolveLeaf(sel) {
    if (!_datos) return fallo('SIN_TAXONOMIA', 'La taxonomia no esta cargada.');
    sel = sel || {};

    var rama   = sel.rama;
    var tipo   = sel.tipo || 'clothing';
    var prenda = sel.prenda;
    var S = _datos.seleccion;

    if (!rama)   return fallo('FALTA_RAMA', 'Hay que elegir Men, Women, Unisex, Kids o Scrubs.');
    if (!prenda) return fallo('FALTA_PRENDA', 'Hay que elegir una categoria.');

    var base, depto = null, notas = {};

    if (rama === 'mens' || rama === 'womens') {
      base = S[rama];

    } else if (rama === 'unisex') {
      // eBay no tiene categorias unisex de adulto. Es el valor 'Unisex Adults'
      // del aspecto Department sobre una rama Men o Women elegida a mano.
      if (sel.adultBranch !== 'mens' && sel.adultBranch !== 'womens')
        return fallo('FALTA_RAMA_BASE', 'Unisex de adulto necesita elegir la rama base: Men o Women.');
      base = S[sel.adultBranch];
      depto = 'Unisex Adults';
      notas.adultBranch = sel.adultBranch;

    } else if (rama === 'kids') {
      if (sel.ageGroup !== 'baby' && sel.ageGroup !== 'kids4up')
        return fallo('FALTA_AGE_GROUP', 'Kids necesita elegir el grupo de edad: Baby & Toddler o Sizes 4 & Up.');
      if (!sel.kidsDept)
        return fallo('FALTA_KIDS_DEPT', 'Hay que elegir el departamento.');

      if (sel.ageGroup === 'baby') {
        if (!DEPT_BABY[sel.kidsDept])
          return fallo('KIDS_DEPT_INVALIDO', 'Departamento invalido para Baby & Toddler.', { recibido: sel.kidsDept, validos: Object.keys(DEPT_BABY) });
        base = S.baby;
        depto = DEPT_BABY[sel.kidsDept];
      } else {
        if (!DEPT_KIDS[sel.kidsDept])
          return fallo('KIDS_DEPT_INVALIDO', 'Departamento invalido para Sizes 4 & Up.', { recibido: sel.kidsDept, validos: Object.keys(DEPT_KIDS) });
        base = S.kids4up[sel.kidsDept];
        depto = DEPT_KIDS[sel.kidsDept];
      }
      notas.ageGroup = sel.ageGroup;
      notas.kidsDept = sel.kidsDept;

    } else if (rama === 'specialty') {
      base = S.specialty;
      tipo = 'clothing';

    } else {
      return fallo('RAMA_DESCONOCIDA', 'Rama desconocida: ' + rama + '.', { recibido: rama });
    }

    if (!base)       return fallo('RAMA_SIN_MAPA', 'No hay mapa para esa combinacion de rama.');
    var porTipo = base[tipo];
    if (!porTipo)    return fallo('TIPO_NO_DISPONIBLE', 'Esa rama no ofrece "' + tipo + '".', { rama: rama, tipo: tipo, disponibles: Object.keys(base) });

    var cid = porTipo[prenda];
    if (cid === undefined)
      return fallo('COMBINACION_NO_EXISTE',
        'No hay categoria oficial para "' + prenda + '" en esa rama.',
        { rama: rama, tipo: tipo, prenda: prenda, disponibles: Object.keys(porTipo).sort() });

    cid = String(cid);
    var cat = _datos.categorias[cid];
    if (!cat) return fallo('CATEGORIA_AUSENTE', 'La categoria ' + cid + ' no esta en el derivado.', { categoryId: cid });

    // El Department forzado tiene que ser un valor real de esa hoja.
    if (depto) {
      var permitidos = clAspectValues(cid, 'Department');
      if (permitidos.length && permitidos.indexOf(depto) === -1)
        return fallo('DEPARTMENT_NO_ADMITIDO',
          'La categoria ' + cid + ' no admite Department "' + depto + '".',
          { categoryId: cid, department: depto, permitidos: permitidos });
    }

    return {
      ok: true,
      categoryId: cid,
      nombre: cat.n,
      ruta: cat.ruta,
      department: depto,          // null = lo decide quien capture
      aspectos: cat.a,
      seleccion: {
        rama: rama, tipo: tipo, prenda: prenda,
        ageGroup: notas.ageGroup || null,
        kidsDept: notas.kidsDept || null,
        adultBranch: notas.adultBranch || null
      }
    };
  }

  // Valores oficiales de un aspecto, resolviendo las listas compartidas.
  // Devuelve [] si el aspecto no existe o si esta guardado abierto (Brand).
  function clAspectValues(cid, aspecto) {
    if (!_datos) return [];
    var c = _datos.categorias[String(cid)];
    if (!c || !c.a[aspecto]) return [];
    var a = c.a[aspecto];
    if (a.abierto) return [];
    return a.v || _datos.listas[a.ref] || [];
  }

  // Prendas ofrecibles para una seleccion superior. Salen de `seleccion`, no de
  // listas escritas a mano. Devuelve [] si la seleccion aun esta incompleta.
  function clCategoriesFor(sel) {
    if (!_datos) return [];
    sel = sel || {};
    var S = _datos.seleccion, base;
    var tipo = sel.tipo || 'clothing';
    if (sel.rama === 'mens' || sel.rama === 'womens')      base = S[sel.rama];
    else if (sel.rama === 'unisex')                        base = (sel.adultBranch === 'mens' || sel.adultBranch === 'womens') ? S[sel.adultBranch] : null;
    else if (sel.rama === 'kids' && sel.ageGroup === 'baby')    base = sel.kidsDept ? S.baby : null;
    else if (sel.rama === 'kids' && sel.ageGroup === 'kids4up') base = sel.kidsDept ? S.kids4up[sel.kidsDept] : null;
    else if (sel.rama === 'specialty')                     { base = S.specialty; tipo = 'clothing'; }
    if (!base || !base[tipo]) return [];
    var out = Object.keys(base[tipo]).sort();
    // 'unisex' de adulto solo puede ofrecer hojas que admitan Unisex Adults.
    if (sel.rama === 'unisex') out = out.filter(function (p) {
      return clAspectValues(String(base[tipo][p]), 'Department').indexOf('Unisex Adults') !== -1;
    });
    return out;
  }

  var api = {
    get CL_TAXONOMY_V134_ENABLED() { return CL_TAXONOMY_V134_ENABLED; },
    // Solo para pruebas: la aplicacion no llama a esto.
    _setEnabled: function (v) { CL_TAXONOMY_V134_ENABLED = !!v; },
    RUTA: RUTA, ESQUEMA: ESQUEMA, MARKET: MARKET, ARBOL: ARBOL, VERSION: VERSION,
    DEPT_BABY: DEPT_BABY, DEPT_KIDS: DEPT_KIDS,
    clLoadTaxonomy: clLoadTaxonomy,
    clTaxonomyValidate: clTaxonomyValidate,
    clTaxonomyReady: clTaxonomyReady,
    clTaxonomyError: clTaxonomyError,
    clTaxonomyData: clTaxonomyData,
    clTaxonomyReset: clTaxonomyReset,
    clResolveLeaf: clResolveLeaf,
    clAspectValues: clAspectValues,
    clCategoriesFor: clCategoriesFor
  };

  raiz.ClTaxonomy = api;
  for (var k in api) if (k.indexOf('cl') === 0) raiz[k] = api[k];
  if (typeof module === 'object' && module.exports) module.exports = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
