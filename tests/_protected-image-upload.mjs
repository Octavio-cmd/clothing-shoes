// Sandbox para pruebas de almacenamiento protegido.
// Ejecuta código real de app.js dentro de una VM controlada.

import vm from 'node:vm';

export function crearSandbox(APP, opciones) {
  opciones = opciones || {};
  const sstore = Object.assign({}, opciones.sessionStorage || {});
  const lstore = Object.assign({}, opciones.localStorage || {});

  const fetchCalls = [];
  const timersCreados = [];
  const controllersCr = [];
  const toasts = [];
  const consoleLogs = [];
  let fetchMockFn = null;
  let nextControllerId = 1;
  let nextTimerId = 1;
  let nextSignalId = 1;

  function crearAbortSignal() {
    const signalId = nextSignalId++;
    return {
      __signalId: signalId,
      __aborted: false,
      addEventListener(evt, handler) {
        if (evt === 'abort') this.__abortHandlers = this.__abortHandlers || [];
        this.__abortHandlers.push(handler);
      }
    };
  }

  // FakeFormData: mimics FormData behavior for VM execution
  class FakeFormData {
    constructor() {
      this.entries = [];
    }
    append(name, value) {
      this.entries.push({ name, value });
    }
  }

  // Console instrumentation: capture logs and verify no token leakage
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

  const ctx = {
    console: instrumentedConsole,
    FormData: FakeFormData,
    JSON, Math, String, Number, Array, Object, Date, Promise,
    parseFloat, parseInt, isFinite, isNaN, RegExp,
    SAVVY_API: 'https://savvy-ebay-prices-production.up.railway.app',
    CL_SHIP_POLICY: 'SHIP',
    CL_RET_POLICY: 'RET',
    CL_PAY_POLICY: 'PAY',
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
    AbortController: class {
      constructor() {
        this.__id = nextControllerId++;
        this.signal = crearAbortSignal();
        controllersCr.push({
          id: this.__id,
          signal: this.signal,
          aborted: false
        });
      }
      abort() {
        const entry = controllersCr.find(e => e.id === this.__id);
        if (entry) {
          entry.aborted = true;
          entry.signal.__aborted = true;
          if (entry.signal.__abortHandlers) {
            entry.signal.__abortHandlers.forEach(h => h());
          }
        }
      }
    },
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
      // Handle FakeFormData and preserve as-is
      let body = opt?.body || null;
      const call = {
        url: String(url),
        method: opt?.method || 'GET',
        headers: opt?.headers || {},
        body: body instanceof FakeFormData ? body : (typeof body === 'string' ? JSON.parse(body) : body),
        signal: opt?.signal || null,
        attempt: fetchCalls.length + 1
      };
      fetchCalls.push(call);

      if (fetchMockFn) {
        return Promise.resolve(fetchMockFn(call));
      }

      return Promise.reject(new Error('No mock configured'));
    },
  };

  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);

  // Extrae funciones de app.js
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

  // Carga funciones esenciales REALES del app.js
  const funcNecesarias = ['savvyToken', 'clProtectedImageUploadEnabled', 'clUploadPhotoProtected', 'clUploadPhotoToImgBB', 'clUploadAllPhotos'];
  for (const func of funcNecesarias) {
    const code = extractFunc(func);
    if (code) {
      vm.runInContext(code, ctx);
    }
  }

  // Carga el flag
  const flagMatch = APP.match(/var CL_PROTECTED_IMAGE_UPLOAD_ENABLED = [^;]+;/);
  if (flagMatch) {
    vm.runInContext(flagMatch[0], ctx);
  }

  // Inicializa cl.photos para clUploadAllPhotos
  ctx.cl = { photos: {} };
  vm.runInContext(`
    const DEFAULT_IMGBB_KEY = 'test-key';
  `, ctx);

  return {
    ctx,
    sstore,
    lstore,
    fetchCalls,
    timersCreados,
    controllersCr,
    toasts,
    consoleLogs,
    setFetchMock(fn) { fetchMockFn = fn; },
    setFlag(value) {
      vm.runInContext(`CL_PROTECTED_IMAGE_UPLOAD_ENABLED = ${value};`, ctx);
    },
  };
}

// Ejecuta clUploadPhotoProtected
export function subirFotoProtegida(sb, dataUrl, slot) {
  const ctx = sb.ctx;

  return new Promise((resolve, reject) => {
    vm.runInContext(
      `clUploadPhotoProtected(${JSON.stringify(dataUrl)}, ${JSON.stringify(slot)})
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
        reject(new Error('Timeout esperando promesa'));
      }
    };
    check();
  });
}

// Ejecuta clUploadPhotoToImgBB
export function subirFotoAlImgBB(sb, dataUrl, key, slotName) {
  const ctx = sb.ctx;

  return new Promise((resolve, reject) => {
    vm.runInContext(
      `clUploadPhotoToImgBB(${JSON.stringify(dataUrl)}, ${JSON.stringify(key)}, ${JSON.stringify(slotName)})
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
        reject(new Error('Timeout esperando promesa'));
      }
    };
    check();
  });
}

// Ejecuta clUploadAllPhotos
export function subirTodasLasFotos(sb, photosObject) {
  const ctx = sb.ctx;

  return new Promise((resolve, reject) => {
    // Set up cl.photos with the provided photos
    vm.runInContext(`
      cl.photos = ${JSON.stringify(photosObject)};
      clUploadAllPhotos()
        .then(r => { __resultado = r; __promesaResuelta = true; })
        .catch(e => { __error = e; __promesaResuelta = true; });
    `, ctx);

    let attempts = 0;
    const check = () => {
      if (ctx.__promesaResuelta) {
        ctx.__promesaResuelta = false;
        if (ctx.__error) {
          reject(ctx.__error);
        } else {
          resolve({
            result: ctx.__resultado,
            photos: ctx.cl.photos
          });
        }
      } else if (attempts++ < 1000) {
        setImmediate(check);
      } else {
        reject(new Error('Timeout esperando promesa'));
      }
    };
    check();
  });
}
