// Sandbox para pruebas de análisis automático de medidas (meas1/meas2)
// Ejecuta código real de app.js dentro de una VM controlada.

import vm from 'node:vm';

export function crearSandboxMeasurements(APP, opciones) {
  opciones = opciones || {};
  const sstore = Object.assign({}, opciones.sessionStorage || {});
  const lstore = Object.assign({}, opciones.localStorage || {});

  const fetchCalls = [];
  const timersCreados = [];
  const toasts = [];
  const consoleLogs = [];
  let fetchMockFn = null;
  let nextTimerId = 1;

  // Instrumented console
  const instrumentedConsole = {
    log(...args) {
      const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      consoleLogs.push({ level: 'log', msg });
    },
    warn(...args) {
      const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      consoleLogs.push({ level: 'warn', msg });
    },
    error(...args) {
      const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      consoleLogs.push({ level: 'error', msg });
    }
  };

  const domElements = {};

  // Factory para crear elementos con soporte de eventos reales
  const createElementWithEvents = (tag, baseElement) => {
    const el = {
      ...baseElement,
      _listeners: {},
      addEventListener(type, callback) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(callback);
      },
      removeEventListener(type, callback) {
        if (this._listeners[type]) {
          const idx = this._listeners[type].indexOf(callback);
          if (idx !== -1) this._listeners[type].splice(idx, 1);
        }
      },
      dispatchEvent(event) {
        if (!this._listeners[event.type]) return true;
        for (const callback of this._listeners[event.type]) {
          try {
            callback.call(this, event);
          } catch (e) {
            console.error(`Event handler error: ${e.message}`);
          }
        }
        return true;
      },
      click() {
        if (this.onclick) {
          try {
            this.onclick.call(this, {type: 'click'});
          } catch (e) {
            console.error(`Click handler error: ${e.message}`);
          }
        }
        this.dispatchEvent({type: 'click'});
      }
    };
    return el;
  };

  const ctx = {
    console: instrumentedConsole,
    FormData: class {
      constructor() { this.entries = []; }
      append(name, value) { this.entries.push({ name, value }); }
    },
    JSON, Math, String, Number, Array, Object, Date, Promise,
    parseFloat, parseInt, isFinite, isNaN, RegExp,
    document: {
      createElement: (tag) => {
        const baseElement = {
          textContent: '', innerHTML: '', id: '',
          className: '', style: {},
          classList: new Set(),
          setAttribute: function(k, v) { this[k] = v; },
          getAttribute: function(k) { return this[k]; },
          dataset: {},
          querySelectorAll: () => [],
          querySelector: () => null,
          appendChild: function(child) {
            this.children = this.children || [];
            this.children.push(child);
            // Establecer referencia al padre
            if (child) child._parent = this;
          },
          remove: function() {},
          get cssText() { return this._cssText || ''; },
          set cssText(v) { this._cssText = v; },
          children: [],
          _parent: null,
          get parentNode() { return this._parent; }
        };

        if (tag === 'canvas') {
          return createElementWithEvents(tag, {
            ...baseElement,
            width: 0, height: 0,
            getContext: () => ({
              drawImage: () => {},
              fillStyle: '#fff',
              fillRect: () => {},
              fillText: () => {}
            }),
            toDataURL: (type, quality) => 'data:image/jpeg;base64,' + 'A'.repeat(1000)
          });
        }
        if (tag === 'input') {
          const el = createElementWithEvents(tag, {
            ...baseElement,
            type: '', accept: '', onchange: null, onclick: null,
            files: [],
            _value: '',
            step: '1',
            get value() { return this._value; },
            set value(v) {
              this._value = v;
              if (this.onchange) {
                try {
                  this.onchange.call(this, {type: 'change'});
                } catch (e) {
                  console.error(`onchange handler error: ${e.message}`);
                }
              }
              this.dispatchEvent({type: 'change'});
            }
          });
          return el;
        }
        if (tag === 'img') {
          return createElementWithEvents(tag, {
            ...baseElement,
            width: 800, height: 600,
            src: '', onload: null, onerror: null
          });
        }
        if (tag === 'select') {
          const el = createElementWithEvents(tag, {
            ...baseElement,
            _value: '',
            options: [],
            onchange: null,
            onclick: null,
            get value() { return this._value; },
            set value(v) {
              this._value = v;
              if (this.onchange) {
                try {
                  this.onchange.call(this, {type: 'change'});
                } catch (e) {
                  console.error(`onchange handler error: ${e.message}`);
                }
              }
              this.dispatchEvent({type: 'change'});
            }
          });
          return el;
        }
        if (tag === 'option') {
          return createElementWithEvents(tag, {
            ...baseElement,
            value: '',
            selected: false
          });
        }
        if (tag === 'button' || tag === 'div' || tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'tr' || tag === 'td' || tag === 'th') {
          const el = createElementWithEvents(tag, {
            ...baseElement,
            _parent: null,
            onclick: null,
            remove: function() {
              // Remover de parent.children si existe
              if (this._parent && this._parent.children) {
                const idx = this._parent.children.indexOf(this);
                if (idx !== -1) {
                  this._parent.children.splice(idx, 1);
                }
              }
              // Remover de domElements
              for (const key in domElements) {
                if (domElements[key] === this) {
                  delete domElements[key];
                }
              }
            }
          });
          return el;
        }
        const el = createElementWithEvents(tag, {
          ...baseElement,
          _parent: null,
          onclick: null,
          remove: function() {
            // Remover de parent.children si existe
            if (this._parent && this._parent.children) {
              const idx = this._parent.children.indexOf(this);
              if (idx !== -1) {
                this._parent.children.splice(idx, 1);
              }
            }
            // Remover de domElements
            for (const key in domElements) {
              if (domElements[key] === this) {
                delete domElements[key];
              }
            }
          }
        });
        return el;
      },
      getElementById: (id) => {
        if (!domElements[id]) {
          domElements[id] = createElementWithEvents('div', {
            id, innerHTML: '', textContent: '',
            classList: new Set(),
            style: {},
            onclick: null,
            onchange: null,
            _listeners: {},
            _parent: null,
            get parentNode() { return this._parent; },
            remove: function() {
              delete domElements[id];
            }
          });
        }
        return domElements[id];
      },
      querySelector: (selector) => {
        // Simple selector support: #id or element
        if (selector.startsWith('#')) {
          const id = selector.substring(1);
          return ctx.document.getElementById(id);
        }
        // For tag selectors, search in domElements
        for (const key in domElements) {
          if (domElements[key] && domElements[key].tagName === selector) {
            return domElements[key];
          }
        }
        return null;
      }
    },
    Image: class {
      constructor() {
        this.width = 800;
        this.height = 600;
      }
      set src(url) {
        // Trigger onload synchronously for testing
        // In real browser, this would be async, but for tests we execute immediately
        if (this.onload) {
          try {
            this.onload();
          } catch (e) {
            console.error('Image.onload error:', e);
            if (this.onerror) this.onerror();
          }
        }
      }
    },
    SAVVY_API: 'https://savvy-ebay-prices-production.up.railway.app',
    SAVVY_MODELO: 'claude-haiku-4-5-20251001',
    sessionStorage: {
      getItem(k) { return sstore[k] === undefined ? null : sstore[k]; },
      setItem(k, v) { sstore[k] = String(v); },
      removeItem(k) { delete sstore[k]; },
    },
    localStorage: {
      getItem(k) { return lstore[k] === undefined ? null : lstore[k]; },
      setItem(k, v) { lstore[k] = String(v); },
      removeItem(k) { delete lstore[k]; },
    },
    toast(m) { toasts.push(m); },
    alert(m) { },
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      const entry = { id, ms, fn, cleared: false };
      timersCreados.push(entry);
      return id;
    },
    clearTimeout(id) {
      const entry = timersCreados.find(e => e.id === id);
      if (entry) entry.cleared = true;
    },
    fetch(url, opt) {
      let body = opt?.body || null;
      const call = {
        url: String(url),
        method: opt?.method || 'GET',
        headers: opt?.headers || {},
        body: body instanceof this.FormData ? body : (typeof body === 'string' ? JSON.parse(body) : body),
        attempt: fetchCalls.length + 1
      };
      fetchCalls.push(call);

      if (fetchMockFn) {
        return Promise.resolve(fetchMockFn(call));
      }

      return Promise.reject(new Error('No mock configured'));
    }
  };

  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.cl = { photos: { front: null, back: null, tag: null, detail: null, meas1: null, meas2: null }, measurements: [] };

  // Agregar body mock
  const bodyElement = createElementWithEvents('div', {
    appendChild: function(node) {
      this.children = this.children || [];
      this.children.push(node);
      // Guardar referencia al padre para remover
      node._parent = this;
    },
    children: [],
    innerHTML: '',
    _listeners: {},
    onclick: null,
    onchange: null,
    _parent: null,
    get parentNode() { return this._parent; },
    querySelectorAll: function(selector) { return []; },
    querySelector: function(selector) { return null; }
  });
  ctx.document.body = bodyElement;

  // Parser HTML simple para procesar innerHTML
  const parseHtmlString = (htmlStr) => {
    // Simple regex-based parser para inputs, selects, buttons, divs, spans
    const inputs = [];
    const inputRegex = /<input[^>]*>/gi;
    let match;
    while ((match = inputRegex.exec(htmlStr)) !== null) {
      inputs.push({type: 'input', html: match[0]});
    }

    const selects = [];
    const selectRegex = /<select[^>]*>.*?<\/select>/gi;
    while ((match = selectRegex.exec(htmlStr)) !== null) {
      selects.push({type: 'select', html: match[0]});
    }

    const buttons = [];
    const buttonRegex = /<button[^>]*>.*?<\/button>/gi;
    while ((match = buttonRegex.exec(htmlStr)) !== null) {
      buttons.push({type: 'button', html: match[0]});
    }

    return { inputs, selects, buttons, rawHtml: htmlStr };
  };

  // Mejorar método remove para elementos
  const enhanceElementRemove = (el) => {
    const originalRemove = el.remove;
    el.remove = function() {
      // Remover de parent.children si existe
      if (this._parent && this._parent.children) {
        const idx = this._parent.children.indexOf(this);
        if (idx !== -1) {
          this._parent.children.splice(idx, 1);
        }
      }
      // Remover de domElements
      for (const key in domElements) {
        if (domElements[key] === this) {
          delete domElements[key];
        }
      }
    };
    return el;
  };

  // Parser minimal del HTML del panel para ejecutar handlers reales
  const parsePanelHtml = (overlay) => {
    if (!overlay || !overlay.innerHTML) return { inputs: [], selects: [], buttons: [] };

    const html = overlay.innerHTML;
    const inputs = [];
    const selects = [];
    const buttons = [];

    // Extraer inputs: data-field="..." value="..." data-idx="..."
    const inputRegex = /<input[^>]*data-field="([^"]*)"[^>]*data-idx="([^"]*)"[^>]*>/g;
    let match;
    while ((match = inputRegex.exec(html)) !== null) {
      const field = match[1];
      const idx = parseInt(match[2]);
      inputs.push({ field, idx, type: 'input' });
    }

    // Extraer selects: data-field="unit" data-idx="..."
    const selectRegex = /<select[^>]*data-field="([^"]*)"[^>]*data-idx="([^"]*)"[^>]*>.*?<\/select>/gi;
    while ((match = selectRegex.exec(html)) !== null) {
      const field = match[1];
      const idx = parseInt(match[2]);
      selects.push({ field, idx, type: 'select' });
    }

    // Extraer botones por clase
    if (html.includes('cl-confirm-btn')) buttons.push({ class: 'cl-confirm-btn' });
    if (html.includes('cl-retry-btn')) buttons.push({ class: 'cl-retry-btn' });
    if (html.includes('cl-add-meas')) buttons.push({ class: 'cl-add-meas' });
    if (html.includes('✕')) buttons.push({ class: 'close', text: '✕' });

    return { inputs, selects, buttons };
  };

  vm.createContext(ctx);

  // Extraer funciones necesarias de app.js
  const funcNecesarias = [
    'clPrepareAnalysisImage',
    'clValidateMeasurementsResponse',
    'clAnalyzeMeasurements',
    'clShowMeasurementError',
    'clShowMeasurementPanel',
    'clSaveMeasurements',
    'clAddMeasurementsToDesc',
    'buildClothingDesc',
    'clBuildEbayRow',
    'buildClothingTitle',
    'clDept',
    'clBuildAspects',
    'clSizeType',
    'clCleanColor',
    'clCondText',
    'clBuildConditionText',
    'clDeletePhoto',
    'clNormalizePrice',
    'clWeightTotalLb',
    'clWeightLabel',
    'clConfirmMeasurementPhotoInvalidation',
    'clInvalidateConfirmedMeasurements',
    'clTakePhotoWithConfirmation',
    'clMeasurementAddDraft',
    'clMeasurementRetry',
    'clMeasurementConfirmDraft',
    'clMeasurementCancelDraft',
    'clMeasurementClosePanel'
  ];

  const extractFunc = (name) => {
    const pattern = new RegExp(`(async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
    pattern.lastIndex = 0;
    const match = pattern.exec(APP);
    if (!match) return '';

    const startIdx = match.index;
    const openBrace = APP.indexOf('{', startIdx);
    let braceCount = 0;
    let endIdx = -1;

    for (let i = openBrace; i < APP.length; i++) {
      if (APP[i] === '{') braceCount++;
      else if (APP[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    return endIdx > -1 ? APP.slice(startIdx, endIdx) : '';
  };

  for (const func of funcNecesarias) {
    const code = extractFunc(func);
    if (code) {
      vm.runInContext(code, ctx);
    }
  }

  // Cargar flags
  vm.runInContext(`
    var CL_MEASUREMENT_AI_ENABLED = ${opciones.measurementAiEnabled ? 'true' : 'false'};
    var CL_PROTECTED_IMAGE_UPLOAD_ENABLED = false;
  `, ctx);

  // Inicializar estado de análisis
  ctx._measurementAnalysisState = {
    pendingTimeout: null,
    activeRequest: null,
    latestResponse: null,
    lastMeas1Hash: null,
    lastMeas2Hash: null
  };

  // Inicializar estado del panel de medidas
  ctx._measurementDraftState = {
    working: [],
    overlay: null,
    render: null
  };

  vm.runInContext(`
    let _measurementAnalysisState = {
      pendingTimeout: null,
      activeRequest: null,
      latestResponse: null,
      lastMeas1Hash: null,
      lastMeas2Hash: null
    };

    let _measurementDraftState = {
      working: [],
      overlay: null,
      render: null
    };

    const MEASUREMENT_ALLOWED_NAMES = {
      'Pit to Pit': true, 'Chest': true, 'Waist': true, 'Hip': true, 'Length': true,
      'Sleeve': true, 'Shoulder': true, 'Rise': true, 'Inseam': true,
      'Leg Opening': true, 'Outseam': true, 'Shoe Length': true, 'Other': true
    };
  `, ctx);

  return {
    ctx,
    sstore,
    lstore,
    fetchCalls,
    timersCreados,
    toasts,
    consoleLogs,
    setFetchMock(fn) { fetchMockFn = fn; },
    setMeasurementFlag(value) {
      vm.runInContext(`CL_MEASUREMENT_AI_ENABLED = ${value};`, ctx);
    },
  };
}

// Ejecuta clPrepareAnalysisImage
export function prepararImagenAnalisis(sb, dataUrl) {
  const ctx = sb.ctx;

  return new Promise((resolve, reject) => {
    vm.runInContext(
      `clPrepareAnalysisImage(${JSON.stringify(dataUrl)})
        .then(r => { __resultado = r; __promesaResuelta = true; })
        .catch(e => { __error = e; __promesaResuelta = true; });`,
      ctx
    );

    let attempts = 0;
    const check = () => {
      if (ctx.__promesaResuelta) {
        ctx.__promesaResuelta = false;
        if (ctx.__error) {
          reject(ctx.__error);
        } else {
          resolve(ctx.__resultado);
        }
      } else if (attempts++ < 1000) {
        setImmediate(check);
      } else {
        reject(new Error('Timeout'));
      }
    };
    check();
  });
}

// Valida respuesta de medidas
export function validarRespuestaMedidas(sb, response) {
  const ctx = sb.ctx;
  const result = vm.runInContext(
    `clValidateMeasurementsResponse(${JSON.stringify(response)})`,
    ctx
  );
  return result;
}

// Guarda medidas confirmadas
export function guardarMedidas(sb, confirmed) {
  const ctx = sb.ctx;
  vm.runInContext(
    `clSaveMeasurements(${JSON.stringify(confirmed)})`,
    ctx
  );
  return ctx.cl.measurements;
}

// Construye descripción con medidas
export function construirDescripcionConMedidas(sb, baseHtml) {
  const ctx = sb.ctx;
  const result = vm.runInContext(
    `clAddMeasurementsToDesc(${JSON.stringify(baseHtml)})`,
    ctx
  );
  return result;
}

// Ejecuta clAnalyzeMeasurements
export function analizarMedidas(sb) {
  const ctx = sb.ctx;

  return new Promise((resolve, reject) => {
    vm.runInContext(
      `clAnalyzeMeasurements()
        .then(r => { __resultado = r; __promesaResuelta = true; })
        .catch(e => { __error = e; __promesaResuelta = true; });`,
      ctx
    );

    let attempts = 0;
    const check = () => {
      if (ctx.__promesaResuelta) {
        ctx.__promesaResuelta = false;
        if (ctx.__error) {
          reject(ctx.__error);
        } else {
          resolve(ctx.__resultado);
        }
      } else if (attempts++ < 1000) {
        setImmediate(check);
      } else {
        reject(new Error('Timeout'));
      }
    };
    check();
  });
}

// Ejecuta buildClothingDesc
export function construirDescripcion(sb) {
  const ctx = sb.ctx;
  const result = vm.runInContext(
    `buildClothingDesc()`,
    ctx
  );
  return result;
}

// Ejecuta clBuildEbayRow con fixtures completas
export function construirFilaEbay(sb, photoUrls = '') {
  const ctx = sb.ctx;
  const result = vm.runInContext(
    `clBuildEbayRow(${JSON.stringify(photoUrls)})`,
    ctx
  );
  return result;
}

// Abre panel de medidas con DOM
export function abrirPanelMedidas(sb, measurements) {
  const ctx = sb.ctx;

  // Establecer respuesta simulada
  ctx._panelMeasurements = measurements || [];

  vm.runInContext(`
    cl.measurements = _panelMeasurements;
    clShowMeasurementPanel();
  `, ctx);

  return {
    overlay: ctx.domElements['cl-measurements-overlay'],
    table: ctx.domElements['cl-measurements-table'],
    confirmBtn: ctx.domElements['cl-measurements-confirm'],
    cancelBtn: ctx.domElements['cl-measurements-cancel'],
    addBtn: ctx.domElements['cl-measurements-add'],
    retryBtn: ctx.domElements['cl-measurements-retry']
  };
}

// Obtiene filas de la tabla de medidas
export function obtenerFilasMedidas(sb) {
  const ctx = sb.ctx;
  const result = vm.runInContext(`
    const rows = [];
    const tbody = document.getElementById('cl-measurements-table');
    if (tbody) {
      for (let i = 0; i < tbody.children.length; i++) {
        const row = tbody.children[i];
        if (row.className && row.className.includes('measurement-row')) {
          rows.push({
            index: i,
            name: row.cells[1]?.textContent || '',
            value: row.cells[2]?.textContent || '',
            unit: row.cells[3]?.textContent || '',
            confidence: row.cells[5]?.textContent || '',
            isInvalid: row.className.includes('invalid')
          });
        }
      }
    }
    rows;
  `, ctx);
  return result;
}
