
// ── POLÍTICAS DE NEGOCIO DE eBAY — FUENTE ÚNICA DE VERDAD ────────────────────
// Los nombres tienen que coincidir EXACTO con los de la tienda en eBay
// (Seller Hub → Account → Business policies). Si no coinciden, eBay rechaza
// el listado completo con el error 21917329 "invalid return policy".
//
// ⚠️ 14 ago 2026: estos tres valores estaban duplicados y hardcodeados en DOS
// lugares del archivo (exportCSV y clExportEbayCSV), y los dos traían
// '30 Day return Copy' — una política que ya no existe desde que se
// consolidó la tienda a tres políticas definitivas. Por eso falló
// CLO-LAU-XS-62033. Ahora están AQUÍ y nada más aquí: si cambias una
// política en eBay, se toca una sola línea.
const CL_SHIP_POLICY = 'Flat:Standard Shipp(Free),Same business day';
const CL_RET_POLICY  = '30 Day return';
const CL_PAY_POLICY  = 'eBay Payments';

// ── MARCA DE VERSIÓN ────────────────────────────────────────────────────────
// index.html carga app.js como <script src="app.js"> sin parámetro de versión,
// así que Safari en iOS puede seguir corriendo un build viejo aunque GitHub
// Pages ya tenga el nuevo. Confirma esta línea en la consola de debug antes de
// dar por buena cualquier prueba.
window.CL_BUILD = '2026-08-17a';
try { console.log('[Clothing & Shoes] build ' + window.CL_BUILD); } catch(e){}

const WORKER='https://savvy-ebay.octavio-9e2.workers.dev';
const SAVVY_CONFIG='https://savvy-config-production.up.railway.app';
const DEF_EBAY='StevenGa-SavvySca-PRD-81addb012-655f2649';
// ── Default API keys (loaded from Railway savvy-config)
let DEFAULT_PHOTOROOM_KEY = '';
let DEFAULT_RBG_KEY = '';
// KEY NUEVA fija — igual que en Product Scanner.
// ⛔ NO se sobreescribe desde Railway (línea comentada abajo).
let DEFAULT_IMGBB_KEY = atob('MjljYjkyZDg5YTViZDM2Y2Y5YjkxOTc2ZDVhNDYzOWM=');
let _keysLoaded = false;

// ══════════════════════════════════════════════════════════════
// SESION DE USUARIO + PROXY DE CLAUDE  (Fase 2)
// La clave de Anthropic ya no llega al navegador: vive solo en el
// backend. Aqui solo viaja un token de sesion firmado.
// ══════════════════════════════════════════════════════════════
const SAVVY_API = 'https://savvy-ebay-prices-production.up.railway.app';
const SAVVY_MODELO = 'claude-haiku-4-5-20251001';

// sessionStorage y no localStorage: los iPhone del almacen son compartidos,
// asi que la sesion debe morir al cerrar la pestana. Nunca se guarda la
// contrasena, solo el token, que ademas caduca en el servidor.
function savvyToken() {
  try { return sessionStorage.getItem('savvy_session_token') || ''; } catch(e) { return ''; }
}
function savvyGuardarSesion(token, usuario) {
  try {
    sessionStorage.setItem('savvy_session_token', token);
    sessionStorage.setItem('savvy_session_user', usuario);
  } catch(e) {}
  SAVVY_CURRENT_USER = usuario;
}
function savvyBorrarSesion() {
  try {
    sessionStorage.removeItem('savvy_session_token');
    sessionStorage.removeItem('savvy_session_user');
  } catch(e) {}
  SAVVY_CURRENT_USER = null;
}

// Envia el cuerpo al proxy del backend. Devuelve la misma Response que antes,
// para que el codigo existente siga tratando r.ok, r.status y r.json() igual.
async function savvyClaude(opciones) {
  const token = savvyToken();
  if (!token) { savvySesionCaducada(); return new Response('{}', { status: 401 }); }
  const r = await fetch(SAVVY_API + '/api/claude', {
    method: 'POST',
    signal: opciones.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: opciones.body
  });
  if (r.status === 401) savvySesionCaducada();
  else if (r.status === 429) { try { toast('\u23F3 Limite de uso alcanzado. Espera un momento.'); } catch(e) {} }
  else if (r.status === 503) { try { toast('\u26A0\uFE0F El servicio de IA no esta configurado.'); } catch(e) {} }
  return r;
}

function savvySesionCaducada() {
  savvyBorrarSesion();
  try { toast('\uD83D\uDD11 Tu sesion expiro. Vuelve a iniciar sesion.'); } catch(e) {}
  try {
    var scr = document.getElementById('login-screen');
    if (scr) scr.style.display = 'flex';
    var err = document.getElementById('login-err');
    if (err) { err.textContent = 'Tu sesion expiro. Vuelve a entrar.'; err.style.display = 'block'; }
  } catch(e) {}
}
// Load keys from Railway on startup
(async function loadKeys() {
  try {
    const r = await fetch(SAVVY_CONFIG + '/config');
    if (r.ok) {
      const d = await r.json();
      // ⛔ NUNCA sobrescribir DEFAULT_IMGBB_KEY desde Railway:
      // if (d.imgbb) DEFAULT_IMGBB_KEY = d.imgbb;  ← DESACTIVADO PERMANENTE
      // d.claude ya no se lee: la clave vive solo en el backend (Fase 2).
      if (d.sheets_url) localStorage.setItem('cl_sheets_url', d.sheets_url);
      // drive_url: NO sobrescribir — usamos URL fija hardcodeada
    }
  } catch(e) { console.warn('Could not load keys from Railway savvy-config'); }
  // Drive URL fija — siempre la correcta
  localStorage.setItem('cl_drive_url', 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec');
  _keysLoaded = true;
})();
// ── Login System ──────────────────────────────────────────────
// SAVVY_USERS eliminado: el diccionario de hashes era publico en este
// repositorio. La validacion ocurre ahora en el servidor (Fase 2).

let SAVVY_CURRENT_USER = null;

async function doLogin() {
  const user = (document.getElementById('login-user')?.value||'').trim().toLowerCase();
  const pass = document.getElementById('login-pass')?.value||'';
  const errEl = document.getElementById('login-err');
  if (!user || !pass) { if(errEl) errEl.style.display='block'; return; }
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
  let mensaje = 'Usuario o contraseña incorrectos.';
  try {
    // La contraseña viaja al servidor y no se guarda en el navegador.
    const r = await fetch(SAVVY_API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: user, password: pass })
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.token) {
        savvyGuardarSesion(d.token, d.usuario || user);
        if (errEl) errEl.style.display='none';
        var scr = document.getElementById('login-screen');
        if (scr) scr.style.display = 'none';
        const hdrUser = document.getElementById('hdr-user');
        if (hdrUser) hdrUser.textContent = '👤 ' + (d.usuario || user);
        document.getElementById('login-pass').value='';
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        return;
      }
    } else if (r.status === 429) {
      mensaje = 'Demasiados intentos. Espera un minuto.';
    } else if (r.status >= 500) {
      mensaje = 'El servidor no responde. Inténtalo de nuevo.';
    }
  } catch(e) {
    mensaje = 'Sin conexión con el servidor.';
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  if(errEl) { errEl.textContent = mensaje; errEl.style.display='block'; }
  document.getElementById('login-pass').value='';
}

function checkLogin() {
  // Antes hacia auto-login como 'demo' y nunca pedia credenciales. Ahora las
  // llamadas a Claude pasan por el proxy y necesitan un token real, asi que
  // se exige sesion. Al cerrar la pestana se pide login de nuevo.
  var u = null;
  try { u = sessionStorage.getItem('savvy_session_user'); } catch(e) {}
  if (u && savvyToken()) {
    SAVVY_CURRENT_USER = u;
    const hdrUser = document.getElementById('hdr-user');
    if (hdrUser) hdrUser.textContent = '👤 ' + u;
    var scr = document.getElementById('login-screen');
    if (scr) scr.style.display = 'none';
    return;
  }
  SAVVY_CURRENT_USER = null;
  var pantalla = document.getElementById('login-screen');
  if (pantalla) pantalla.style.display = 'flex';
}

function doLogout() {
  savvyBorrarSesion();
  localStorage.removeItem('savvy_user');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value='';
  document.getElementById('login-pass').value='';
  const errEl = document.getElementById('login-err');
  if(errEl) errEl.style.display='none';
}

// Check login on load
window.addEventListener('load', checkLogin);
// Initialize Zebra printer IP if not set
if (!localStorage.getItem('savvy_printer_ip')) {
  localStorage.setItem('savvy_printer_ip', '192.168.1.25');
}

let bulk=[],cur=null;
let _lastBundleUrl = ''; // URL pública de ImgBB del último bundle generado

const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt=n=>(!n||isNaN(n))?'—':'$'+Number(n).toFixed(2);

function screen(n){document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));$('scr-'+n).classList.add('on');}
let _tt;
function toast(msg,ms=2600){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('on'),ms);}
function stat(m){const e=$('ls');if(e)e.textContent=m;}

// SKU: 3 letras marca (o primera palabra del título) + UPC + Npk
function makeSKU(brand,upc,packs,title){
  packs=packs||2; title=title||'';
  let src=(brand||'').trim();
  if(!src||src.toLowerCase()==='generic') src='';
  if(!src&&title){
    const skip=new Set(['2x','bundle','pack','new','of','the','and','for','set','lot','value']);
    const words=title.replace(/[^a-zA-Z\s]/g,' ').trim().split(/\s+/);
    src=words.find(w=>w.length>1&&!skip.has(w.toLowerCase()))||'';
  }
  const pfx=src.replace(/[^a-zA-Z]/g,'').substring(0,3).toUpperCase()||'GEN';
  return pfx+'-'+upc+'-'+packs+'pk';
}

// Categorys — mapa completo de categorías leaf de eBay
function catId(n){
  const t=(n||'').toLowerCase();

  // ── PET SUPPLIES ─────────────────────────────────────────────
  if(/dog food|cat food|pet food|kibble|pedigree|purina|iams|blue buffalo|friskies|fancy feast|whiskas|royal canin|hill.s science/i.test(t))return'1281';
  if(/dog treat|cat treat|milk bone|greenies|temptations treat|beggin strip/i.test(t))return'1281';
  if(/cat toy|dog toy|catnip|scratching post|chew toy|dog chew|pet toy|kong toy/i.test(t))return'1281';
  if(/pet shampoo|dog shampoo|cat shampoo|flea|tick collar|frontline|heartgard|advantage flea|pet medicine/i.test(t))return'1281';
  if(/cat litter|kitty litter|tidy cats|fresh step|arm hammer litter/i.test(t))return'1281';
  if(/leash|dog collar|pet bed|pet carrier|aquarium|hamster|bird seed|puppy|kitten/i.test(t))return'1281';

  // ── BABY ─────────────────────────────────────────────────────
  if(/pampers|huggies|luvs|honest diaper|baby dry|swaddler/i.test(t))return'2984';
  if(/baby wipe|huggies wipe|pampers wipe|baby cleaning/i.test(t))return'2984';
  if(/baby formula|infant formula|similac|enfamil|gerber formula|baby food|pureed|beechnut/i.test(t))return'2984';
  if(/johnson.s baby|desitin|aquaphor baby|baby lotion|baby wash|baby shampoo|baby oil|baby powder|baby cream/i.test(t))return'2984';
  if(/diaper|infant|toddler|pacifier|teething|stroller|baby monitor|baby bottle/i.test(t))return'2984';

  // ── FOOD & BEVERAGES ─────────────────────────────────────────
  // ── HAIR CARE — antes que Food para evitar que "gum" matchee dental ─
  if(/head.shoulders|pantene|dove shampoo|tresemme|garnier shampoo|herbal essence|ogx shampoo|suave shampoo|aussie shampoo|old spice shampoo/i.test(t))return'131689';
  if(/shampoo|conditioner|hair mask|hair treatment|hair oil|argan oil|hair serum/i.test(t))return'131689';
  if(/hair color|hair dye|hair bleach|root touch|clairol|loreal hair|revlon colorsilk|dark and lovely|just for men/i.test(t))return'31085';
  if(/hair spray|hairspray|hair mousse|hair gel|pomade|hair wax|got2b|kenra|bed head/i.test(t))return'45258';
  if(/hair brush|hair comb|detangling brush|wide tooth comb|curling iron|flat iron|hair straightener|hair dryer|blow dryer/i.test(t))return'45258';

  // ── DENTAL CARE — antes que Food para que "gum" no matchee comida ──
  if(/crest toothpaste|colgate|sensodyne|arm.hammer toothpaste|hello toothpaste|charcoal toothpaste/i.test(t))return'67602';
  if(/teeth whitening|whitening strip|whitening kit|crest strip|whitening pen/i.test(t))return'67602';
  if(/oral.b toothbrush|colgate toothbrush|sonicare|electric toothbrush|toothbrush/i.test(t))return'67602';
  if(/dental floss|floss pick|flosser|interdental|waterpik|oral irrigator|gum floss|gum flosser|gum pick/i.test(t))return'67602';
  if(/listerine|scope mouthwash|act mouthwash|crest rinse|oral rinse|mouthwash|mouth rinse/i.test(t))return'67602';
  if(/toothpaste|whitening/i.test(t))return'67602';

  // ── CLEANING / HOME — antes que Skin Care ────────────────────
  if(/compression glove|compression sleeve|compression sock|arthritis glove|arthritis support|copper fit|copper compression/i.test(t))return'181';
  if(/stainless steel cleaner|stainless steel polish|stainless spray|appliance cleaner/i.test(t))return'20625';
  if(/tide|gain detergent|arm.hammer laundry|all detergent|persil|xtra detergent|laundry detergent|laundry pod/i.test(t))return'20625';
  if(/downy|bounce dryer|dryer sheet|fabric softener|snuggle/i.test(t))return'20625';
  if(/dawn dish|palmolive|dawn ultra|dish soap|dishwashing liquid|cascade dishwasher/i.test(t))return'20625';
  if(/lysol|clorox|windex|mr.clean|pine.sol|fabuloso|409|fantastik|comet cleanser|ajax cleanser/i.test(t))return'20625';
  if(/febreze|glade|air freshener|car freshener|room spray|odor eliminator/i.test(t))return'20625';
  if(/paper towel|bounty|scott towel|viva towel|brawny/i.test(t))return'20625';
  if(/toilet paper|charmin|cottonelle|scott tissue|angel soft/i.test(t))return'20625';
  if(/tissue|kleenex|puffs|facial tissue/i.test(t))return'20625';
  if(/trash bag|garbage bag|hefty|glad bag|ziploc|plastic wrap|aluminum foil|sandwich bag/i.test(t))return'20625';
  if(/sponge|scrub brush|mop|broom|dustpan|rubber glove|cleaning glove/i.test(t))return'20625';
  if(/candle|yankee candle|bath.body candle|wax melt|diffuser/i.test(t))return'20625';
  if(/laundry|bleach|disinfectant|cleaner|cleaning|polish|degreaser/i.test(t))return'20625';

  // ── FOOD & BEVERAGES ─────────────────────────────────────────
  if(/k.cup|keurig pod|nescafe|folgers|starbucks coffee|maxwell house|dunkin coffee|coffee pod/i.test(t))return'14308';
  if(/coffee|espresso|cold brew/i.test(t))return'14308';
  if(/tea bag|green tea|herbal tea|lipton|bigelow|celestial seasonings|chamomile|sleepytime/i.test(t))return'14308';
  if(/monster|red bull|5.hour energy|bang energy|celsius drink|rockstar energy|reign energy/i.test(t))return'14308';
  if(/gatorade|powerade|liquid iv|pedialyte|nuun|electrolyte|sports drink/i.test(t))return'14308';
  if(/protein bar|kind bar|clif bar|larabar|rxbar|quest bar|fiber bar|nature valley|nutri.grain/i.test(t))return'14308';
  if(/snack|popcorn|chip|pretzel|granola|trail mix|mixed nut|peanut|cashew|almond|sunflower seed/i.test(t))return'14308';
  if(/candy|chocolate|sour patch|skittles|m&m|reese|hershey|starburst|haribo/i.test(t))return'14308';
  if(/breath mint|tic tac|altoid|trident gum|orbit gum|extra gum|chewing gum/i.test(t))return'14308';
  if(/sauce|ketchup|mustard|mayo|mayonnaise|salad dressing|ranch|hot sauce|sriracha|tabasco|buffalo sauce/i.test(t))return'14308';
  if(/cereal|oatmeal|quaker oat|cream of wheat|breakfast bar|pop tart/i.test(t))return'14308';
  if(/soup|broth|ramen|instant noodle|cup noodle|bouillon/i.test(t))return'14308';
  if(/seasoning|spice|garlic powder|onion powder|cumin|paprika|chili powder|mrs.dash/i.test(t))return'14308';

  // ── CLEANING / HOME ──────────────────────────────────────────
  if(/tide|gain detergent|arm.hammer laundry|all detergent|persil|xtra detergent|laundry detergent|laundry pod/i.test(t))return'20625';
  if(/downy|bounce dryer|dryer sheet|fabric softener|snuggle/i.test(t))return'20625';
  if(/dawn dish|palmolive|dawn ultra|dish soap|dishwashing liquid|cascade dishwasher/i.test(t))return'20625';
  if(/lysol|clorox|windex|mr.clean|pine.sol|fabuloso|409|fantastik|comet cleanser|ajax cleanser/i.test(t))return'20625';
  if(/febreze|glade|air freshener|car freshener|room spray|odor eliminator/i.test(t))return'20625';
  if(/paper towel|bounty|scott towel|viva towel|brawny/i.test(t))return'20625';
  if(/toilet paper|charmin|cottonelle|scott tissue|angel soft/i.test(t))return'20625';
  if(/tissue|kleenex|puffs|facial tissue/i.test(t))return'20625';
  if(/trash bag|garbage bag|hefty|glad bag|ziploc|plastic wrap|aluminum foil|sandwich bag/i.test(t))return'20625';
  if(/sponge|scrub brush|mop|broom|dustpan|rubber glove|cleaning glove/i.test(t))return'20625';
  if(/candle|yankee candle|bath.body candle|wax melt|diffuser/i.test(t))return'20625';
  if(/detergent|laundry|bleach|disinfect|disinfectant/i.test(t))return'20625';

  // ── ELECTRONICS ──────────────────────────────────────────────
  if(/duracell|energizer|rayovac|aa battery|aaa battery|9v battery|c battery|d battery|lithium battery/i.test(t))return'48619';
  if(/usb.c cable|lightning cable|iphone cable|android charger|phone charger|wireless charger|power bank|charging pad/i.test(t))return'44867';
  if(/earphone|earbuds|airpod|galaxy bud|wireless earphone|in.ear headphone/i.test(t))return'112529';
  if(/headphone|over.ear|on.ear|noise cancelling headphone/i.test(t))return'112529';
  if(/bluetooth speaker|portable speaker|wireless speaker|jbl|bose speaker/i.test(t))return'14969';
  if(/phone case|iphone case|samsung case|screen protector|tempered glass|tablet case|ipad case/i.test(t))return'9394';
  if(/led bulb|smart bulb|light bulb|cfl bulb|light strip|led strip/i.test(t))return'48619';
  if(/battery|batteries|charger|cable|usb|bluetooth/i.test(t))return'293';

  // ── AUTOMOTIVE ───────────────────────────────────────────────
  if(/castrol|mobil.1|pennzoil|valvoline|quaker state|motor oil|engine oil|synthetic oil/i.test(t))return'6000';
  if(/car wash|turtle wax|meguiar|armor all|rain.x|windshield washer|wiper blade|bosch blade|anco blade/i.test(t))return'6000';

  // ── OFFICE / SCHOOL ──────────────────────────────────────────
  if(/ballpoint pen|gel pen|sharpie|expo marker|dry erase|highlighter pen|pencil|mechanical pencil/i.test(t))return'16486';
  if(/notebook|composition book|spiral notebook|legal pad|sticky note|post.it/i.test(t))return'16486';
  if(/stapler|staple|tape dispenser|scotch tape|binder clip|paper clip|folder|binder/i.test(t))return'16486';

  // ── SPORTING GOODS ───────────────────────────────────────────
  if(/yoga mat|resistance band|dumbbell|weight plate|jump rope|foam roller|exercise ball/i.test(t))return'888';
  if(/creatine|pre.workout|bcaa|amino acid|workout supplement|gym supplement/i.test(t))return'180959';
  if(/yoga mat bag|yoga bag|gym bag|sport bag|duffel bag|workout bag/i.test(t))return'75655';
  if(/yoga mat|yoga block|yoga strap|yoga wheel/i.test(t))return'75655';
  if(/exercise|workout|fitness equipment/i.test(t))return'75655';

  // ── BOOKS ────────────────────────────────────────────────────
  if(/board book|children.s book|kids book|baby book|picture book|coloring book|activity book|workbook|novel|cookbook|bible|prayer book|devotional book/i.test(t))return'261186';
  if(/isbn|hardcover|paperback|softcover/i.test(t))return'261186';

  // ── BBQ / OUTDOOR COOKING ────────────────────────────────────
  if(/grill tool|bbq tool|barbecue tool|spatula set|grill set|grilling set|tongs.*grill|grill.*tongs/i.test(t))return'26677';
  if(/grill|barbecue|bbq/i.test(t))return'26677';

  // ── KITCHEN / HOME ────────────────────────────────────────────
  if(/mug|cup|tumbler|travel mug|coffee mug|ceramic mug|mason jar/i.test(t))return'20695';
  if(/knife|knives|santoku|chef knife|paring knife|bread knife|steak knife/i.test(t))return'177005';
  if(/pan|pot|skillet|wok|dutch oven|casserole|bakeware|cookware/i.test(t))return'20654';
  if(/blender|mixer|toaster|air fryer|instant pot|slow cooker|pressure cooker|coffee maker|juicer/i.test(t))return'168763';
  if(/plate|bowl|dish|platter|serving|dinnerware|flatware|silverware/i.test(t))return'20650';

  // ── TOYS & GAMES ─────────────────────────────────────────────
  if(/lego/i.test(t))return'19006';
  if(/play.doh|nerf|hot wheels|matchbox|barbie|action figure|funko pop|pokemon card|trading card/i.test(t))return'261068';
  if(/board game|card game|puzzle|jigsaw|jenga|uno|monopoly|scrabble/i.test(t))return'220';
  if(/fidget|slime|kinetic sand|silly putty|squish|pop it/i.test(t))return'220';
  if(/toy|doll/i.test(t))return'220';

  // ── INSECT REPELLENT ─────────────────────────────────────────
  if(/insect repellent|bug spray|mosquito repellent|off! deep|off deep woods|deet|picaridin|repel bug|cutter bug|bug repel/i.test(t))return'1232';

  // ── FOOT CARE ────────────────────────────────────────────────
  if(/foot cream|foot lotion|heel balm|callus|corn remover|gold bond foot|dr. scholl|athlete.s foot|tinactin|lamisil/i.test(t))return'67169';

  // ── SUNCARE ──────────────────────────────────────────────────
  if(/sunscreen|sun screen|spf|sunblock|sun block|sun protection|tanning lotion|after sun|coppertone|banana boat sun|neutrogena sun/i.test(t))return'31786';

  // ── SKIN CARE ────────────────────────────────────────────────
  if(/jergens|body lotion|hand lotion|body cream|hand cream|body butter|cetaphil|aveeno|lubriderm|cocoa butter|shea butter|vaseline lotion|moisturizing lotion|daily moisturizer|ultra healing|deep conditioning|dry skin moisturizer|skin moisturizer|moisturizer lotion|original scent moisturizer/i.test(t))return'31788';
  if(/moisturizer|moisturising/i.test(t))return'31788';
  if(/face wash|facial cleanser|face scrub|face mask|facial mask|serum|toner|retinol|hyaluronic|niacinamide|eye cream|acne cream|salicylic|benzoyl|proactiv/i.test(t))return'31786';
  if(/lotion|moisturizer|body wash skin|skin care|skin cream/i.test(t))return'31786';

  // ── LIP CARE ─────────────────────────────────────────────────
  if(/lip balm|chapstick|lip butter|lip care|lip repair|blistex|carmex|aquaphor lip|eos lip/i.test(t))return'36870';

  // ── MAKEUP ───────────────────────────────────────────────────
  if(/foundation|concealer|contour|blush|bronzer|highlighter|setting powder|setting spray|bb cream|cc cream|tinted moisturizer/i.test(t))return'60496';
  if(/mascara|eyeliner|eye liner|eyeshadow|eye shadow|eyebrow pencil|brow gel|false lash/i.test(t))return'60496';
  if(/lipstick|lip gloss|lip liner|lip stain|lip color|lip tint/i.test(t))return'60496';
  if(/makeup remover|micellar water|makeup wipe|face wipe|bioderma/i.test(t))return'60496';
  if(/maybelline|l.oreal|loreal|covergirl|nyx cosmetic|elf cosmetic|revlon|rimmel|wet n wild|milani|physicians formula/i.test(t))return'60496';

  // ── NAIL CARE ────────────────────────────────────────────────
  if(/nail polish|nail color|nail lacquer|nail gel|nail remover|acetone|nail file|nail clipper|cuticle|opi nail|essie nail|sally hansen/i.test(t))return'36478';

  // ── DEODORANT ────────────────────────────────────────────────
  if(/old spice deo|old spice anti|dove deo|secret deo|degree deo|speed stick|axe deodorant|arm.hammer deo|sure deo|ban deo|mitchum|drysol/i.test(t))return'11838';
  if(/deodorant|antiperspirant/i.test(t))return'11838';

  // ── BODY WASH / SOAP ─────────────────────────────────────────
  if(/body wash|shower gel|bath gel|irish spring|dial soap|olay body|softsoap|caress|suave body|dove body wash/i.test(t))return'11840';
  if(/bar soap|liquid hand soap|hand soap|antibacterial soap|castile soap|ivory soap|safeguard soap/i.test(t))return'11840';

  // ── SHAVING ──────────────────────────────────────────────────
  if(/gillette|schick hydro|bic disposable|venus razor|daisy razor|harry.s razor/i.test(t))return'26683';
  if(/shaving cream|shaving gel|shave foam|aftershave|after shave|edge shave|barbasol/i.test(t))return'26683';
  if(/razor|shaving/i.test(t))return'26683';

  // ── FRAGRANCES ───────────────────────────────────────────────
  if(/perfume|cologne|eau de toilette|eau de parfum|body mist|body spray|fragrance|scent/i.test(t))return'180345';

  // ── EYE / EAR CARE ───────────────────────────────────────────
  if(/eye drop|eye wash|visine|clear eyes|rohto|contact solution|contact lens|renu solution|opti.free/i.test(t))return'57041';
  if(/ear drop|ear wax|earwax|ear cleaner|ear rinse|debrox|similasan ear/i.test(t))return'57041';

  // ── VITAMINS & SUPPLEMENTS ───────────────────────────────────
  if(/centrum|one.a.day|nature made|gummy vitamin|prenatal vitamin|folic acid|iron supplement|calcium supplement/i.test(t))return'180959';
  if(/vitamin c|vitamin d|vitamin b|vitamin e|vitamin k|vitamin a|vitamin multi/i.test(t))return'180959';
  if(/probiotic|prebiotic|digestive enzyme|collagen|biotin|melatonin|ashwagandha|turmeric|elderberry|echinacea/i.test(t))return'180959';
  if(/fish oil|omega.?3|krill oil|flaxseed|coq10|magnesium supplement|zinc|potassium|selenium|saw palmetto/i.test(t))return'180959';
  if(/fiber supplement|metamucil|benefiber|psyllium husk|miralax|colace|stool softener|laxative|fiber gumm/i.test(t))return'180959';
  if(/whey protein|protein powder|protein shake|mass gainer|weight gainer/i.test(t))return'180959';
  if(/vitamin|supplement|multivitamin/i.test(t))return'180959';

  // ── OTC MEDICINE ─────────────────────────────────────────────
  if(/ibuprofen|tylenol|advil|motrin|aspirin|acetaminophen|naproxen|aleve|pain relief|pain killer/i.test(t))return'67169';
  if(/nyquil|dayquil|theraflu|mucinex|robitussin|delsym|vicks dayquil|coricidin|cold flu/i.test(t))return'67169';
  if(/zyrtec|claritin|benadryl|allegra|flonase|xyzal|antihistamine|allergy relief/i.test(t))return'67169';
  if(/tums|pepcid|prilosec|nexium|maalox|rolaids|gas.x|gas relief|pepto|immodium|antacid|heartburn/i.test(t))return'67169';
  if(/unisom|zzzquil|sleep aid|diphenhydramine|sleep tablet|pm sleep/i.test(t))return'67169';
  if(/cough|sore throat|cold medicine|sinus|decongestant|sudafed|afrin nasal/i.test(t))return'67169';

  // ── FIRST AID ────────────────────────────────────────────────
  if(/band.aid|bandage|adhesive bandage|gauze|medical tape|wound care|neosporin|bacitracin|triple antibiotic/i.test(t))return'51227';
  if(/hydrogen peroxide|rubbing alcohol|isopropyl alcohol|antiseptic|betadine/i.test(t))return'51227';
  if(/thermometer|blood pressure monitor|glucometer|glucose meter|pulse oximeter|heating pad|ice pack|hot pack/i.test(t))return'51227';
  if(/first aid|bandage|wound/i.test(t))return'51227';

  // ── FEMININE CARE ────────────────────────────────────────────
  if(/tampon|always pad|tampax|playtex|kotex|stayfree|menstrual cup|period pad|feminine hygiene/i.test(t))return'67167';

  // ── INCONTINENCE ─────────────────────────────────────────────
  if(/depend|poise|tena|adult diaper|incontinence pad|bladder leak/i.test(t))return'105070';

  // ── FACE MOISTURIZERS / CREAMS ───────────────────────────────
  if(/olay|olay regenerist|face cream|facial cream|face moisturizer|face lotion|facial moisturizer|anti-aging cream|anti aging|wrinkle cream|retinol cream|night cream|day cream/i.test(t))return'32062';

  // ── DEFAULT — Skin Care (categoría leaf segura) ───────────────
  return'31786';
}
const catNm=id=>({'31786':'Skin Care','60496':'Makeup','180959':'Vitamins & Supplements','67602':'Dental Care','36870':'Lip Care','11854':'Hair Care','131689':'Shampoo & Conditioner','32062':'Face Moisturizers','75655':'Yoga & Pilates','31085':'Hair Color','45258':'Hair Styling','11838':'Deodorant','11840':'Body Wash','26683':'Shaving','180345':'Fragrances','67169':'OTC Medicine','51227':'First Aid','67167':'Feminine Care','105070':'Incontinence','36478':'Nail Care','57041':'Eye & Ear Care','48619':'Batteries','44867':'Phone Cables','112529':'Headphones','14969':'Speakers','9394':'Phone Cases','293':'Consumer Electronics','20625':'Home & Garden','14308':'Food & Beverages','1281':'Pet Supplies','2984':'Baby','6000':'Automotive','888':'Sporting Goods','220':'Toys & Hobbies','19006':'LEGO Building Sets','261186':'Books','20695':'Mugs','177005':'Kitchen Knives','20654':'Cookware','20650':'Dinnerware','261068':'Toys','31788':'Body Lotions','168763':'Small Kitchen Appliances','16486':'Office Supplies','19264':'Braces & Supports','181':'Sporting Goods','1232':'Insect Repellent','261844':'Insect Repellent','26677':'BBQ & Grill Tools','20725':'Outdoor Cooking'}[id]||'Skin Care');

// Settings
function saveKey(){ toast('\u2139\uFE0F La clave de Claude ya la gestiona el servidor. No hace falta configurarla aqui.'); }
function saveEbay(){const v=$('ebayIn').value.trim();if(!v)return;localStorage.setItem('savvy_ebay_id',v);renderSt();toast('✅ eBay ID saved');setTimeout(closeCfg,700);}
function renderSt(){
  const k=!!savvyToken(),e=localStorage.getItem('savvy_ebay_id');
  $('stSt').innerHTML=`<div class="str"><div class="sd ${k?'ok':'no'}"></div><span>Sesión Claude: ${k?'✓ Activa':'✗ Inicia sesión'}</span></div><div class="str"><div class="sd ${e?'ok':'no'}"></div><span>eBay App ID: ${e?'✓ Configurado':'✗ No configurado'}</span></div>`;
  if($('keyIn'))$('keyIn').placeholder='Ya no se usa: la gestiona el servidor';
  if(e)$('ebayIn').value=e;
}
// Settings PIN Protection (1977)
let settingsPinAttempts = 0;
let settingsPinBlockedUntil = 0;
const SETTINGS_PIN = '1977';
const PIN_MAX_ATTEMPTS = 3;
const PIN_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutos

function openCfgWithPin() {
  const now = Date.now();
  
  // Verificar si está bloqueado
  if (settingsPinBlockedUntil > now) {
    const remainingSeconds = Math.ceil((settingsPinBlockedUntil - now) / 1000);
    toast(`🔒 Settings bloqueados. Intenta en ${remainingSeconds}s`);
    return;
  }
  
  // Resetear intentos si pasó el tiempo de bloqueo
  if (settingsPinBlockedUntil <= now && settingsPinBlockedUntil > 0) {
    settingsPinAttempts = 0;
  }
  
  // Mostrar modal para PIN
  showPinModal();
}

function showPinModal() {
  const pinOverlay = document.createElement('div');
  pinOverlay.id = 'pin-overlay';
  pinOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
  `;
  
  const pinBox = document.createElement('div');
  pinBox.style.cssText = `
    background: #1a1a1a;
    border: 2px solid #ff6b35;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    max-width: 320px;
    font-family: inherit;
  `;
  
  let pinInput = '';
  
  pinBox.innerHTML = `
    <div style="color: #fff; font-size: 18px; font-weight: bold; margin-bottom: 16px;">
      🔐 Settings Password
    </div>
    <div style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
      Enter PIN to access Settings
    </div>
    <input 
      type="password" 
      id="pin-input" 
      placeholder="••••" 
      inputmode="numeric"
      maxlength="4"
      style="
        width: 100%;
        padding: 12px;
        font-size: 18px;
        text-align: center;
        background: #2a2a2a;
        color: #ff6b35;
        border: 1px solid #ff6b35;
        border-radius: 6px;
        margin-bottom: 16px;
        letter-spacing: 4px;
      "
    >
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
      ${[1,2,3,4,5,6,7,8,9,'←',0,'✓'].map(n => {
        if (n === '←') {
          return `<button style="
            padding: 12px;
            background: #ff6b35;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
          " onclick="document.getElementById('pin-input').value = document.getElementById('pin-input').value.slice(0, -1); document.getElementById('pin-input').focus();">←</button>`;
        } else if (n === '✓') {
          return `<button style="
            padding: 12px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
          " onclick="validateSettingsPin();">✓</button>`;
        } else {
          return `<button style="
            padding: 12px;
            background: #333;
            color: #fff;
            border: 1px solid #555;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          " onclick="document.getElementById('pin-input').value += '${n}'; document.getElementById('pin-input').focus();">${n}</button>`;
        }
      }).join('')}
    </div>
    <div style="color: #888; font-size: 12px;">
      Attemps: ${settingsPinAttempts}/${PIN_MAX_ATTEMPTS}
    </div>
  `;
  
  pinOverlay.appendChild(pinBox);
  document.body.appendChild(pinOverlay);
  
  setTimeout(() => {
    const inp = document.getElementById('pin-input');
    if (inp) inp.focus();
  }, 100);
  
  // Enter key
  document.getElementById('pin-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') validateSettingsPin();
  });
}

function validateSettingsPin() {
  const pinInput = document.getElementById('pin-input')?.value || '';
  const overlay = document.getElementById('pin-overlay');
  
  if (pinInput === SETTINGS_PIN) {
    // PIN correcto
    settingsPinAttempts = 0;
    settingsPinBlockedUntil = 0;
    if (overlay) overlay.remove();
    toast('✅ PIN correcto');
    setTimeout(() => {
      renderSt();
      $('cfgOv').classList.add('on');
    }, 300);
  } else {
    // PIN incorrecto
    settingsPinAttempts++;
    
    if (settingsPinAttempts >= PIN_MAX_ATTEMPTS) {
      // Bloquear por 5 minutos
      settingsPinBlockedUntil = Date.now() + PIN_BLOCK_DURATION;
      if (overlay) overlay.remove();
      toast('🔒 Bloqueado por 5 minutos');
    } else {
      // Mostrar error
      toast(`❌ PIN incorrecto (${settingsPinAttempts}/${PIN_MAX_ATTEMPTS})`);
      const inp = document.getElementById('pin-input');
      if (inp) {
        inp.value = '';
        inp.style.borderColor = '#ff0000';
        setTimeout(() => {
          inp.style.borderColor = '#ff6b35';
        }, 500);
      }
    }
  }
}

function openCfg(){renderSt();$('cfgOv').classList.add('on');}
function closeCfg(){$('cfgOv').classList.remove('on');}

// ── Savvy Universal Scanner (html5-qrcode) ───────────────────
var _savvyScanners = {};

const SAVVY_SCAN_CONFIG = {
  fps: 20,
  qrbox: { width: 280, height: 120 },  // cajita horizontal para barcodes
  aspectRatio: 1.7,
  disableFlip: false,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  },
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
  ]
};

async function savvyStartScan(videoElementId, onResult) {
  await savvyStopScan(videoElementId);
  var scanner = new Html5Qrcode(videoElementId, {
    formatsToSupport: SAVVY_SCAN_CONFIG.formatsToSupport,
    experimentalFeatures: SAVVY_SCAN_CONFIG.experimentalFeatures,
    verbose: false
  });
  _savvyScanners[videoElementId] = scanner;
  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: SAVVY_SCAN_CONFIG.fps,
        qrbox: SAVVY_SCAN_CONFIG.qrbox,
        aspectRatio: SAVVY_SCAN_CONFIG.aspectRatio,
        disableFlip: SAVVY_SCAN_CONFIG.disableFlip,
      },
      (decoded) => {
        savvyStopScan(videoElementId);
        onResult(decoded);
      },
      () => {}
    );
  } catch(e) {
    toast('❌ No camera access: ' + e.message);
    delete _savvyScanners[videoElementId];
  }
}

async function savvyStopScan(videoElementId) {
  if (_savvyScanners[videoElementId]) {
    try { await _savvyScanners[videoElementId].stop(); } catch(e) {}
    delete _savvyScanners[videoElementId];
  }
}

// Camera — main scanner
async function startCam(){
  screen('cam');
  savvyStopScan('qr-video');
  savvyStartScan('qr-video', async txt => {
    analyze(txt.replace(/\D/g,''));
  });
}
async function stopCam(){
  savvyStopScan('qr-video');
  screen('idle');
}


// ── BUNDLE IMAGE GENERATOR — Professional eBay/Amazon style ──

// ── BACKGROUND REMOVAL (sin API) ────────────────────────────
// Muestrea el borde completo para detectar el color de fondo,
// luego hace flood-fill + segunda pasada para limpiar residuos.
// Mejor resultado con fondo de color (cartón, gris) que con blanco.
async function removeBgCanvas(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;

      function pix(x,y){var i=(y*W+x)*4;return[px[i],px[i+1],px[i+2]];}
      function dist(a,b){
        return Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])+(a[2]-b[2])*(a[2]-b[2]));
      }

      // ── 1. Detectar color de fondo desde TODO el borde (15px) ───
      var edge=[], STRIP=15;
      for(var x=0;x<W;x++){
        for(var y=0;y<STRIP;y++) edge.push(pix(x,y));
        for(var y=H-STRIP;y<H;y++) edge.push(pix(x,y));
      }
      for(var y=STRIP;y<H-STRIP;y++){
        for(var x=0;x<STRIP;x++) edge.push(pix(x,y));
        for(var x=W-STRIP;x<W;x++) edge.push(pix(x,y));
      }
      // Mediana de brightness para evitar outliers (sombras, producto en borde)
      edge.sort(function(a,b){return (a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]);});
      var bg=edge[Math.floor(edge.length/2)];
      var bgBright=(bg[0]+bg[1]+bg[2])/3;

      // Tolerancia basada en el fondo
      // Blanco puro → conservador; cartón/gris → agresivo
      var TOL = bgBright>230 ? 36 : bgBright>200 ? 58 : bgBright>150 ? 72 : 85;

      // ── 2. Flood-fill BFS desde todos los bordes ─────────────────
      var vis=new Uint8Array(W*H);
      var q=new Int32Array(W*H*2); var qh=0,qt=0;
      function enq(x,y){if(x>=0&&x<W&&y>=0&&y<H&&!vis[y*W+x]){vis[y*W+x]=1;q[qt++]=x;q[qt++]=y;}}
      for(var x=0;x<W;x++){enq(x,0);enq(x,H-1);}
      for(var y=1;y<H-1;y++){enq(0,y);enq(W-1,y);}

      while(qh<qt){
        var cx=q[qh++],cy=q[qh++];
        if(dist(pix(cx,cy),bg)<TOL){
          px[(cy*W+cx)*4+3]=0;
          enq(cx+1,cy);enq(cx-1,cy);enq(cx,cy+1);enq(cx,cy-1);
        }
      }

      // ── 3. Segunda pasada: eliminar "islas" de fondo no conectadas ─
      // Reconstruir máscara de pixels eliminados
      var removed=new Uint8Array(W*H);
      for(var i=0;i<W*H;i++) if(px[i*4+3]===0) removed[i]=1;

      // Eliminar pixels adyacentes a borde removido que también son similares al fondo
      for(var pass=0;pass<2;pass++){
        for(var y=1;y<H-1;y++) for(var x=1;x<W-1;x++){
          if(removed[y*W+x]) continue;
          var adj=removed[(y-1)*W+x]+removed[(y+1)*W+x]+removed[y*W+(x-1)]+removed[y*W+(x+1)];
          if(adj>=1 && dist(pix(x,y),bg)<TOL*1.3){
            px[(y*W+x)*4+3]=0; removed[y*W+x]=1;
          }
        }
      }

      // ── 4. Erosionar borde duro 1px ───────────────────────────────
      for(var y=1;y<H-1;y++) for(var x=1;x<W-1;x++){
        if(removed[y*W+x]) continue;
        var hard=removed[(y-1)*W+x]+removed[(y+1)*W+x]+removed[y*W+(x-1)]+removed[y*W+(x+1)];
        if(hard>=3) { px[(y*W+x)*4+3]=0; }
      }

      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

// ── RECORTAR AL PRODUCTO (sin espacio vacío) ───────────────────
async function cropToProduct(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var d=ctx.getImageData(0,0,W,H).data;
      var x0=W,x1=0,y0=H,y1=0;
      for (var y=0;y<H;y++) for (var x=0;x<W;x++) {
        var i=(y*W+x)*4;
        // alpha>180: solo pixels sólidos del producto, ignora bordes suaves de PhotoRoom
        var notTransp=d[i+3]>180;
        var notWhite=d[i]<240||d[i+1]<240||d[i+2]<240;
        if (notTransp && notWhite) {
          if(x<x0)x0=x; if(x>x1)x1=x;
          if(y<y0)y0=y; if(y>y1)y1=y;
        }
      }
      if(x0>=x1||y0>=y1){resolve(dataUrl);return;}
      var M=10;
      x0=Math.max(0,x0-M); y0=Math.max(0,y0-M);
      x1=Math.min(W,x1+M); y1=Math.min(H,y1+M);
      var oc=document.createElement('canvas');
      oc.width=x1-x0; oc.height=y1-y0;
      oc.getContext('2d').drawImage(img,x0,y0,oc.width,oc.height,0,0,oc.width,oc.height);
      resolve(oc.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

// ── BADGE CIRCULAR ─────────────────────────────────────────────
function drawPackBadge(ctx, n, SZ) {
  var R=Math.round(SZ*0.075);
  var cx=SZ-R-Math.round(SZ*0.025), cy=R+Math.round(SZ*0.025);
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.28)'; ctx.shadowBlur=16;
  ctx.fillStyle='rgba(173,216,240,0.97)';
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle='rgba(20,100,160,0.5)'; ctx.lineWidth=Math.round(SZ*0.003);
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
  var big=Math.round(R*0.68), small=Math.round(R*0.30);
  ctx.fillStyle='#0A3566'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold '+big+'px -apple-system,Arial,sans-serif';
  ctx.fillText(String(n),cx,cy-R*0.15);
  ctx.font='bold '+small+'px -apple-system,Arial,sans-serif';
  ctx.fillText('PACK',cx,cy+R*0.48);
  ctx.textAlign='start';
}



// Detectar color promedio del fondo muestreando las 4 esquinas (franja 10%)
async function detectBgColor(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var px=ctx.getImageData(0,0,W,H).data;
      var rs=0,gs=0,bs=0,n=0;
      var strip=Math.round(Math.min(W,H)*0.10);
      [[0,0],[W-strip,0],[0,H-strip],[W-strip,H-strip]].forEach(function(p){
        for(var dy=0;dy<strip;dy++) for(var dx=0;dx<strip;dx++){
          var i=((p[1]+dy)*W+(p[0]+dx))*4;
          rs+=px[i]; gs+=px[i+1]; bs+=px[i+2]; n++;
        }
      });
      resolve([Math.round(rs/n), Math.round(gs/n), Math.round(bs/n)]);
    };
    img.onerror=function(){resolve([180,140,90]);};
    img.src=dataUrl;
  });
}

// Limpiar PNG transparente de PhotoRoom:
// 1. Quitar borde 8%
// 2. Eliminar píxeles que coinciden con el color del fondo original (cartón, etc.)
// 3. Componentes conectados → conservar solo el componente más grande
async function cleanTransparentEdges(dataUrl, bgColor) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height, N=W*H;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;

      // Paso 1: quitar borde del 8% (artefactos de esquina)
      var mX=Math.round(W*0.08), mY=Math.round(H*0.08);
      for(var y=0;y<H;y++) for(var x=0;x<W;x++){
        if(x<mX||x>=W-mX||y<mY||y>=H-mY) px[(y*W+x)*4+3]=0;
      }

      // Paso 1b: eliminar píxeles que coinciden con el color del fondo original
      // Esto limpia el cartón conectado a la base del producto
      if(bgColor && bgColor.length===3){
        var br=bgColor[0], bg2=bgColor[1], bb=bgColor[2];
        var TOL=55; // tolerancia en distancia RGB
        for(var y=0;y<H;y++) for(var x=0;x<W;x++){
          var pi=(y*W+x)*4;
          if(px[pi+3]<10) continue; // ya transparente
          var dr=px[pi]-br, dg=px[pi+1]-bg2, db2=px[pi+2]-bb;
          var dist=Math.sqrt(dr*dr+dg*dg+db2*db2);
          if(dist<TOL) px[pi+3]=0; // coincide con fondo → transparente
        }
      }

      // Paso 2: componentes conectados (BFS) sobre pixeles con alpha > 40
      var vis=new Uint8Array(N);
      var q=new Int32Array(N);
      var components=[]; // cada componente = array de indices planos

      for(var sy=0;sy<H;sy++) for(var sx=0;sx<W;sx++){
        var si=sy*W+sx;
        if(vis[si]||px[si*4+3]<=40) continue;
        // BFS
        var comp=[], qh=0, qt=0;
        q[qt++]=si; vis[si]=1;
        while(qh<qt){
          var ci=q[qh++];
          comp.push(ci);
          var cy=Math.floor(ci/W), cx=ci-cy*W;
          // 4-vecinos
          var ns=[ci-1,ci+1,ci-W,ci+W];
          for(var k=0;k<4;k++){
            var ni=ns[k];
            if(ni<0||ni>=N||vis[ni]) continue;
            // Validar que no cruza bordes horizontales
            if(k===0&&cx===0) continue;
            if(k===1&&cx===W-1) continue;
            if(px[ni*4+3]>40){vis[ni]=1; q[qt++]=ni;}
          }
        }
        components.push(comp);
      }

      // Ordenar por tamaño — el más grande = el producto real
      components.sort(function(a,b){return b.length-a.length;});

      // Eliminar todos los componentes pequeños (islas de cartón)
      // Umbral: conservar solo componentes que sean >5% del más grande
      var bigSize = components.length>0 ? components[0].length : 0;
      for(var ci2=1;ci2<components.length;ci2++){
        if(components[ci2].length < bigSize*0.05){
          for(var pi=0;pi<components[ci2].length;pi++){
            px[components[ci2][pi]*4+3]=0;
          }
        }
      }

      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}


// Convertir PNG transparente a JPEG con fondo blanco

// Eliminar píxeles del fondo que quedaron en la imagen con fondo blanco
// Aplica DESPUÉS de pngToWhiteJpeg para limpiar artefactos residuales
async function removeResidualBg(dataUrl, bgColor) {
  if (!bgColor || bgColor.length < 3) return dataUrl;
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;
      var br=bgColor[0], bg2=bgColor[1], bb=bgColor[2];
      // Tolerancia alta — necesaria para capturar bordes sucios
      var TOL=80;
      // Aún más agresivo en el borde exterior del 30% de la imagen
      for(var y=0;y<H;y++) for(var x=0;x<W;x++){
        var i=(y*W+x)*4;
        var r=px[i],g=px[i+1],b=px[i+2];
        var dist=Math.sqrt((r-br)*(r-br)+(g-bg2)*(g-bg2)+(b-bb)*(b-bb));
        var inBorder=(x<W*0.20||x>W*0.80||y<H*0.20||y>H*0.80);
        var tol=inBorder?TOL:TOL*0.65; // más agresivo en bordes
        if(dist<tol){ px[i]=255; px[i+1]=255; px[i+2]=255; } // → blanco
      }
      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/jpeg',0.93));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

async function pngToWhiteJpeg(pngDataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      var ctx=c.getContext('2d');
      ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0);
      resolve(c.toDataURL('image/jpeg',0.92));
    };
    img.onerror=function(){resolve(pngDataUrl);};
    img.src=pngDataUrl;
  });
}

// ── GENERAR BUNDLE IMAGE ─────────────────────────────────────────
// Input: imagen con FONDO BLANCO (de PhotoRoom v2) sobre canvas blanco
// Layout: grid limpio sin overlap — profesional y sin artefactos
async function generateBundleImage(productDataUrl, packSize) {
  var SZ = 1200;
  var img = new Image(); img.src = productDataUrl;
  await new Promise(function(r){img.onload=r;img.onerror=r;});

  var canvas=document.createElement('canvas');
  canvas.width=SZ; canvas.height=SZ;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,SZ,SZ);

  // Grid exacto por pack size (suma = packSize)
  // [cols, rows] donde cols*rows >= packSize
  var GRID = {
    1:[1,1], 2:[2,1], 3:[3,1], 4:[2,2],
    5:[3,2], 6:[3,2], 7:[4,2], 8:[4,2],
    9:[3,3], 10:[5,2], 11:[4,3], 12:[4,3]
  };
  var g = GRID[packSize] || [Math.ceil(Math.sqrt(packSize)), Math.ceil(packSize/Math.ceil(Math.sqrt(packSize)))];
  var cols=g[0], rows=g[1];

  var GAP = Math.round(SZ*0.018); // 2.2% de separación
  var PAD = Math.round(SZ*0.045); // 4.5% padding exterior

  var cellW = Math.floor((SZ - PAD*2 - GAP*(cols-1)) / cols);
  var cellH = Math.floor((SZ - PAD*2 - GAP*(rows-1)) / rows);
  var cell  = Math.min(cellW, cellH); // celda cuadrada

  // Centrar la grilla
  var gridW = cols*cell + (cols-1)*GAP;
  var gridH = rows*cell + (rows-1)*GAP;
  var ox = Math.round((SZ-gridW)/2);
  var oy = Math.round((SZ-gridH)/2);

  for(var i=0; i<packSize; i++){
    var col=i%cols, row=Math.floor(i/cols);
    var x=ox+col*(cell+GAP);
    var y=oy+row*(cell+GAP);
    ctx.drawImage(img, x, y, cell, cell);
  }

  drawPackBadge(ctx, packSize, SZ);
  return canvas.toDataURL('image/jpeg', 0.93);
}

function downloadBundleImg(src) {
  var a = document.createElement('a');
  a.href = src;
  a.download = 'bundle-' + ((window.cur && cur.upc) || 'product') + '.jpg';
  a.click();
}

// ── BUNDLE PHOTO CAPTURE → TRANSPARENT → COMPOSE ─────────────
// Flujo: foto → PhotoRoom/Remove.bg → PNG transparente limpio → bundle
async function openBundlePhoto() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = true;
  input.onchange = async function(e) {
    var file = e.target.files[0]; if(!file) return;
    var genDiv = document.getElementById('bundle-generating');
    var preDiv = document.getElementById('bundle-preview');
    if(genDiv){genDiv.style.display='block'; genDiv.textContent='📷 Comprimiendo...';}
    if(preDiv) preDiv.style.display='none';

    var dataUrl = await clCompressImage(file, 1600, 1.0);

    // Subir a ImgBB
    var imgbbKey = localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY;
    var photoUrl = dataUrl;
    if (imgbbKey) {
      if(genDiv) genDiv.textContent='📤 Subiendo a ImgBB...';
      var up = await clUploadPhotoToImgBB(dataUrl, imgbbKey);
      if (up) photoUrl = up;
    }

    // Subir imagen JPG real a Google Drive
    var driveUrl = localStorage.getItem('cl_drive_url') || 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec';
    if (driveUrl) {
      try {
        if(genDiv) genDiv.textContent='☁️ Subiendo foto a Google Drive...';
        var sku = (window.cur && cur.upc) ? cur.upc : 'foto';
        var fname = sku + '-' + Date.now() + '.jpg';
        // Enviar imagen base64 directamente al Apps Script
        var b64 = dataUrl.split(',')[1];
        var res = await fetch(driveUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fname, csvData: b64, isImage: true })
        });
        toast('✅ Foto .jpg subida a Drive — carpeta eBay Listings');
        if(genDiv) genDiv.textContent='✅ Foto en Drive';
      } catch(e2) {
        toast('⚠️ Drive no disponible');
      }
    }

    if(window.cur) { cur._rawPhoto = photoUrl; cur._imgUrl = photoUrl; }

    if(genDiv) genDiv.style.display='none';
    if(preDiv) {
      preDiv.style.display='block';
      preDiv.innerHTML='<img src="'+dataUrl+'" style="width:100%;border-radius:8px;opacity:0.7">'
        +'<div style="text-align:center;font-size:12px;color:var(--mu);margin-top:6px">📁 Foto en Drive — edítala y usa el botón verde ↑</div>';
    }
  };
  input.click();
}

// Subir foto ya lista (bundle hecho manualmente)
async function openReadyPhoto() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async function(e) {
    var file = e.target.files[0]; if(!file) return;
    var genDiv = document.getElementById('bundle-generating');
    var preDiv = document.getElementById('bundle-preview');
    if(genDiv){genDiv.style.display='block'; genDiv.textContent='📤 Subiendo foto lista...';}
    if(preDiv) preDiv.style.display='none';

    var dataUrl = await clCompressImage(file, 1600, 1.0);

    // Subir a ImgBB
    var imgbbKey = localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY;
    var finalUrl = dataUrl;
    if (imgbbKey) {
      if(genDiv) genDiv.textContent='📤 Subiendo a ImgBB...';
      var uploaded = await clUploadPhotoToImgBB(dataUrl, imgbbKey);
      if (uploaded) {
        finalUrl = uploaded;
        toast('✅ Foto lista — ready for eBay');
      }
    }

    if(window.cur) {
      cur._bundleImg = finalUrl;
      cur._imgUrl = finalUrl;
      cur._singleProductImg = dataUrl;
    }
    _lastBundleUrl = finalUrl;

    if(genDiv) genDiv.style.display='none';
    if(preDiv) {
      preDiv.style.display='block';
      preDiv.innerHTML='<div style="position:relative">'
        +'<img src="'+dataUrl+'" style="width:100%;border-radius:8px">'
        +'<div style="position:absolute;bottom:8px;left:0;right:0;text-align:center">'
        +'<span style="background:rgba(0,230,118,.95);color:#000;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:800">✅ Photo uploaded — ready for eBay</span>'
        +'</div></div>';
    }
  };
  input.click();
}



// ── PRODUCT LOOKUP — eBay Catalog + Browse + Finding ──────────
// Single unified call replacing UPCitemdb + separate eBay calls
async function lookupProduct(upc) {
  // Try eBay twice before giving up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      stat(attempt === 1 ? 'Searching eBay...' : 'Retrying eBay search...');
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 15000);
      const r = await fetch(WORKER + '/?upc=' + upc, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      // If eBay found pricing data, return immediately
      if (d.found || d.prices?.low || d.pricing?.sold?.count) return d;
      // If no pricing but product found, return on first attempt
      if (d.product?.name && attempt === 1) return d;
    } catch(e) {
      if (attempt === 2) console.warn('eBay lookup failed both attempts:', e.message);
      else await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
    }
  }
  return { found: false, product: null, pricing: {}, topTitles: [], prices: null };
}

// Kept as fallback if eBay Catalog finds nothing
async function lookupUPCitemdb(upc) {
  let p = { name:'', brand:'', found:false };
  try {
    const r = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + upc);
    const d = await r.json();
    if (d.items && d.items[0]) {
      const it = d.items[0];
      p.name = it.title || it.description || '';
      p.brand = it.brand || '';
      p.found = !!p.name;
    }
  } catch(e) {}
  if (!p.found) {
    try {
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + upc + '.json');
      const d = await r.json();
      if (d.status === 1 && d.product) {
        const pr = d.product;
        p.name = pr.product_name_en || pr.product_name || '';
        p.brand = pr.brands || '';
        p.found = !!p.name;
      }
    } catch(e) {}
  }
  return p;
}

// Price calculation
function calcBundlePrice(ebay,packs){
  packs=packs||2;
  // Priority: sold avg (real) > sold low > active low > active avg
  const soldAvg = ebay?.pricing?.sold?.avg || 0;
  const soldLow = ebay?.pricing?.sold?.low || 0;
  const actLow  = ebay?.prices?.low || 0;
  const actAvg  = ebay?.prices?.avg || 0;
  const base = soldAvg||soldLow||actLow||actAvg||0;
  if(base>0) return (base*packs*0.88).toFixed(2); // 12% below market for fast sales
  return(packs===2?'14.99':packs===3?'19.99':packs===4?'24.99':'29.99');
}

// Pack optimizer


// ── DATE PICKER — Month + Year chips ─────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({length:12}, function(_,i){return CUR_YEAR-1+i;});
var _dateState = { monthIdx: new Date().getMonth(), yearIdx: 1 };
var _dateSelected = false; // true solo cuando usuario toca un chip


function toggleExpDate() {
  var picker = document.getElementById('exp-date-picker');
  var btn    = document.getElementById('exp-toggle-btn');
  if (!picker) return;
  var showing = picker.style.display !== 'none';
  if (showing) {
    clearExpDate();
  } else {
    picker.style.display = 'block';
    btn.style.background = 'rgba(255,107,0,.15)';
    btn.style.borderColor = 'var(--ac)';
    btn.style.color = 'var(--ac)';
    initDateWheel(); // render chips now
  }
}

function clearExpDate() {
  var picker = document.getElementById('exp-date-picker');
  var btn    = document.getElementById('exp-toggle-btn');
  if (picker) picker.style.display = 'none';
  if (btn) {
    btn.style.background = 'var(--sf2)';
    btn.style.borderColor = 'var(--bd)';
    btn.style.color = 'var(--mu)';
  }
  _dateSelected = false;
  if (window._packState) window._packState.expDate = '';
  if (window.cur) { cur._expDate = ''; cur._selectedTitle = ''; }
  var el = document.getElementById('date-result-display');
  if (el) el.innerHTML = '';
  // Regenerar título sin fecha
  rebuildAndApplyTitle(window._packState ? window._packState.curPack : 2);
}

function initDateWheel() {
  renderDateChips();
  updateDateDisplay();
}

function renderDateChips() {
  var mWrap = document.getElementById('month-chips');
  var yWrap = document.getElementById('year-chips');
  if (!mWrap || !yWrap) return;

  mWrap.innerHTML = MONTHS.map(function(m, i) {
    return '<button class="date-chip' + (i===_dateState.monthIdx?' sel':'') +
      '" onclick="pickMonth(' + i + ')">' + m + '</button>';
  }).join('');

  yWrap.innerHTML = YEARS.map(function(y, i) {
    return '<button class="date-chip' + (i===_dateState.yearIdx?' sel':'') +
      '" onclick="pickYear(' + i + ')">' + y + '</button>';
  }).join('');
}

function pickMonth(i) {
  _dateSelected = true;
  _dateState.monthIdx = i;
  document.querySelectorAll('#month-chips .date-chip').forEach(function(el,j){
    el.classList.toggle('sel', j===i);
  });
  updateDateDisplay();
  if (typeof playTick === 'function') playTick();
}

function pickYear(i) {
  _dateSelected = true;
  _dateState.yearIdx = i;
  document.querySelectorAll('#year-chips .date-chip').forEach(function(el,j){
    el.classList.toggle('sel', j===i);
  });
  updateDateDisplay();
  if (typeof playTick === 'function') playTick();
}

function getExpDate() {
  return MONTHS[_dateState.monthIdx] + ' ' + YEARS[_dateState.yearIdx];
}

function updateDateDisplay() {
  var el = document.getElementById('date-result-display');
  // Solo mostrar fecha si el usuario seleccionó algo
  if (!_dateSelected) {
    if (el) el.innerHTML = '<span style="color:var(--mu);font-size:12px">Toca mes y año para seleccionar</span>';
    return;
  }
  var exp = getExpDate();
  if (el) el.innerHTML = '📅 <strong style="color:var(--ac)">' + exp + '</strong>';
  // Guardar en _packState y reconstruir título (incluye shade + expDate juntos)
  if (window.cur) cur._expDate = exp; // siempre guardar en cur
  if (window._packState) {
    window._packState.expDate = exp;
    rebuildAndApplyTitle(window._packState.curPack);
  }
}



// ── RECONSTRUIR TÍTULO CON TODOS LOS CAMPOS ──────────────────
function rebuildAndApplyTitle(n) {
  var state = window._packState;
  if (!state) return;
  var shade   = state.shade   || '';
  var expDate = state.expDate || '';
  var title   = rebuildTitle(state.baseTitle, n || state.curPack, shade, expDate);
  var titleEl = document.getElementById('pack-title-display');
  if (titleEl) { titleEl.textContent = title; titleEl.dataset.val = title; }
  if (window.cur) cur._selectedTitle = title;
  // Actualizar botón y regenerar si ya hay imagen
  var genBtn = document.getElementById('bundle-gen-btn');
  if (genBtn) genBtn.textContent = '📷 Take Product Photo → Generate Pack of ' + (n || state.curPack);
  // Si ya hay imagen guardada, regenerar con nuevo pack
  if (window.cur && cur._singleProductImg) {
    var newPack = n || state.curPack;
    var genDiv  = document.getElementById('bundle-generating');
    var preDiv  = document.getElementById('bundle-preview');
    if (genDiv) { genDiv.style.display = 'block'; genDiv.textContent = '⚙️ Generating Pack of ' + newPack + '...'; }
    if (preDiv) preDiv.style.display = 'none';
    generateBundleImage(cur._singleProductImg, newPack).then(async function(bundleImg) {
      if (preDiv && bundleImg) {
        cur._bundleImg = bundleImg; // guardar base64 mientras sube
        // Comprimir y subir a ImgBB
        var imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
        if (imgbbKey) {
          if (genDiv) { genDiv.style.display = 'block'; genDiv.textContent = '📤 Uploading to ImgBB...'; }
          try {
            const img2 = new Image(); img2.src = bundleImg;
            await new Promise(r => { img2.onload = r; img2.onerror = r; });
            const c2 = document.createElement('canvas');
            c2.width = 800; c2.height = 800;
            c2.getContext('2d').fillStyle = '#fff';
            c2.getContext('2d').fillRect(0,0,800,800);
            c2.getContext('2d').drawImage(img2, 0, 0, 800, 800);
            const compressed = c2.toDataURL('image/jpeg', 0.85);
            const url = await clUploadPhotoToImgBB(compressed, imgbbKey);
            if (url) {
              _lastBundleUrl = url;
              cur._bundleImg = url;
              cur._imgUrl    = url;
              if (genDiv) genDiv.style.display = 'none';
              preDiv.style.display = 'block';
              preDiv.innerHTML = '<img src="' + bundleImg + '" style="width:100%;border-radius:10px">'
                + '<div style="font-size:11px;color:var(--sv);text-align:center;margin-top:6px">✅ Photo uploaded — ready for eBay</div>';
              return;
            }
          } catch(e) { console.error('Pack regen upload error:', e); }
        }
        // Fallback — mostrar sin URL
        if (genDiv) genDiv.style.display = 'none';
        preDiv.style.display = 'block';
        preDiv.innerHTML = '<img src="' + bundleImg + '" style="width:100%;border-radius:10px">'
          + '<div style="font-size:11px;color:#e74c3c;text-align:center;margin-top:6px">⚠️ Not uploaded to ImgBB</div>';
      } else {
        if (genDiv) genDiv.style.display = 'none';
      }
    });
  }
  return title;
}

// ── PACK SIZE WHEEL ──────────────────────────────────────────
const PACK_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// Rebuild title with correct format: Brand Product Count Pack of N New
// Convierte "May 2027" → "Exp 05/27" (compacto para el título)
function formatExpForTitle(expDate) {
  if (!expDate) return '';
  var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  var parts = expDate.split(' '); // ["May", "2027"]
  if (parts.length !== 2) return '';
  var mo = months[parts[0]] || '';
  var yr = String(parts[1]).slice(-2); // "2027" → "27"
  return mo && yr ? 'Exp ' + mo + '/' + yr : '';
}

function rebuildTitle(base, n, shade, expDate) {
  shade   = shade   || '';
  expDate = expDate || '';
  if (!base) return (shade?shade+' ':'') + 'Pack of ' + n + ' New';
  // Strip existing pack / new / exp references
  var t = base
    .replace(/\bexp\s+\d{2}\/\d{2}\b/gi, '')
    .replace(/\bpack of \d+\b/gi, '').replace(/\b\d+[-\s]?pack\b/gi, '')
    .replace(/\b\d+[\s]?x\b/gi, '').replace(/\bset of \d+\b/gi, '')
    .replace(/\bbundle of \d+\b/gi, '').replace(/\bnew sealed\b/gi, '')
    .replace(/\bnew\b\s*$/gi, '').replace(/\s{2,}/g, ' ').trim()
    .replace(/[·\-,\.]+\s*$/, '').trim();
  var expStr = formatExpForTitle(expDate);
  // Order: base [shade] [Exp MM/YY] Pack of N New
  if (shade)  t = t + ' ' + shade;
  if (expStr) t = t + ' ' + expStr;
  t = t + ' Pack of ' + n + ' New';
  if (t.length > 80) t = t.substring(0, 77).replace(/\s+\S*$/, '...');
  return t;
}

function initPackWheel(currentPacks, ebayPricesObj, baseTitle, baseUPC, baseBrand) {
  // Store state globally for pickPack
  window._packState = {
    sizes:    PACK_SIZES,
    ebayBase: (ebayPricesObj && (ebayPricesObj.low || ebayPricesObj.avg)) || 0,
    baseTitle: baseTitle,
    baseUPC:   baseUPC,
    baseBrand: baseBrand,
    curPack:   Number(currentPacks) || 2,
    shade:     '',
    expDate:   '',
    discount:  0.95,  // 5% below market
  };
  // Apply initial selection visually
  pickPack(window._packState.curPack);
}

// Called by each chip onclick AND by shade input
function pickPack(n) {
  var state = window._packState;
  if (!state) return;
  state.curPack = n;
  var ebayBase  = state.ebayBase;
  var price     = ebayBase ? '$' + (ebayBase * n * (state.discount || 0.95)).toFixed(2) : '';
  var pfx       = (state.baseBrand || 'GEN').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
  var sku       = pfx + '-' + state.baseUPC + '-' + n + 'pk';
  // Guardar pack y reconstruir título desde _packState (incluye shade + expDate)
  state.curPack = n;

  // Highlight selected chip
  document.querySelectorAll('.pack-chip').forEach(function(el) {
    var chipN = parseInt(el.querySelector('.pc-n').textContent);
    el.classList.toggle('sel', chipN === n);
  });

  // Update label
  var display = document.getElementById('pack-sel-display');
  if (display) display.innerHTML = 'Selected: <strong style="color:var(--ac)">Pack of ' + n + '</strong>' +
    (price ? ' &nbsp;·&nbsp; <strong style="color:var(--gd)">' + price + '</strong>' : '');

  // Update bundle price
  var priceEl = document.getElementById('pack-bundle-price');
  if (priceEl) priceEl.textContent = price || '—';

  // Update SKU — use stored ref first, then getElementById as fallback
  var els    = (window._packState && window._packState.els) || {};
  var skuEl  = els.sku   || document.getElementById('pack-sku-display');
  var titleEl= els.title || document.getElementById('pack-title-display');
  var priceEl= els.price || document.getElementById('pack-bundle-price');
  var dispEl = els.display|| document.getElementById('pack-sel-display');

  if (skuEl)  { skuEl.textContent  = sku;   skuEl.dataset.val   = sku;   }
  rebuildAndApplyTitle(n);

  // Save on cur
  if (window.cur) {
    cur._selectedPack  = n;
    cur._selectedPrice = price ? parseFloat(price.replace('$', '')) : null;
    cur._selectedSKU   = sku;
    // _selectedTitle se actualiza en rebuildAndApplyTitle
  }
  if (typeof playTick === 'function') playTick();

  // ── Actualizar badge SAVVY/DWI en tiempo real ─────────────
  var bundleAmt = ebayBase ? ebayBase * n * 0.95 : 0;
  var badge = document.querySelector('.badge');
  var addBtn = document.getElementById('addBtn');
  if (badge && ebayBase > 0) {
    if (bundleAmt >= 15) {
      badge.className = 'badge sv';
      badge.innerHTML = '✅ SAVVY';
      if (addBtn) { addBtn.className = 'add-btn'; addBtn.textContent = '➕ ADD TO CSV'; }
      if (window.cur) cur.verdict = 'SAVVY';
    } else {
      badge.className = 'badge dw';
      badge.innerHTML = '✗ DWI';
      if (addBtn) { addBtn.className = 'ov-add-btn'; addBtn.textContent = '➕ Add anyway (DWI override)'; }
      if (window.cur) cur.verdict = 'DWI';
    }
  }
}

function updateShadeColor(shade) {
  var state = window._packState;
  if (!state) return;
  state.shade = shade;                   // guardar en _packState
  if (window.cur) cur._shade = shade;
  rebuildAndApplyTitle(state.curPack);   // reconstruye con shade + expDate juntos
}


function calcPacks(ebayLow,costPerUnit){
  const sizes=[2,3,4,6,8,10,12];
  const FEE=0.1325,FEE_F=0.30;
  function ship(n){return n<=2?5.50:n<=4?7.50:n<=6?9.50:n<=8?11.50:13.50;}
  return sizes.map(n=>{
    const rev=parseFloat((ebayLow*n*0.92).toFixed(2));
    const fee=parseFloat((rev*FEE+FEE_F).toFixed(2));
    const shp=ship(n);
    const cst=parseFloat((costPerUnit*n).toFixed(2));
    const pft=parseFloat((rev-fee-shp-cst).toFixed(2));
    const roi=cst>0?parseFloat((pft/cst*100).toFixed(0)):0;
    return{n,rev,fee,shp,cst,pft,roi};
  });
}
function renderPackTable(ebayLow){
  const cv=parseFloat($('costIn').value)||0;
  if(!cv||cv<=0){toast('⚠️ Enter your cost per unit');return;}
  const rows=calcPacks(ebayLow,cv);
  const best=rows.filter(r=>r.pft>0).reduce((a,b)=>b.pft>a.pft?b:a,{pft:-999,n:0});
  let t=`<table class="pack-table"><tr><th>Pack</th><th>Sale</th><th>Fee</th><th>Shipping</th><th>Cost</th><th>Profit</th><th>ROI</th></tr>`;
  rows.forEach(r=>{
    const b=r.n===best.n&&r.pft>0;
    t+=`<tr class="${b?'best':''}"><td>${b?'⭐ ':''}${r.n}pk</td><td>$${r.rev}</td><td>$${r.fee}</td><td>$${r.shp}</td><td>$${r.cst}</td><td style="color:${r.pft>0?'var(--sv)':'var(--dw)'}">${r.pft>0?'+':''}$${r.pft}</td><td style="color:${r.roi>0?'var(--sv)':'var(--dw)'}">${r.roi}%</td></tr>`;
  });
  $('packResult').innerHTML=t+'</table>';
}


// ── SMART TITLE — nunca usa UPC, siempre usa marca + producto ──
function buildSmartTitle(prod, packs) {
  packs = packs || 2;
  if (!prod || (!prod.name && !prod.brand)) return '';
  const brand    = (prod.brand || '').trim();
  const name     = (prod.name  || '').trim();
  // Remove brand from start of name to avoid "Neutrogena Neutrogena..."
  const cleanName = (brand && name.toLowerCase().startsWith(brand.toLowerCase()))
    ? name.substring(brand.length).trim()
    : name;
  // Extract size/count if present (oz, ct, ml, lb, mg, g, fl oz)
  const sizeMatch = cleanName.match(/\b(\d+\.?\d*\s*(?:oz|fl oz|ct|count|ml|l|lb|lbs|mg|g|kg|pack|pc|pcs|pieces?))\b/i);
  const sizeStr   = sizeMatch ? sizeMatch[0] : '';
  // Build clean name without the size (to reorder: brand + name + size + pack + new)
  const nameNoSize = sizeStr ? cleanName.replace(sizeStr, '').replace(/\s{2,}/g,' ').trim() : cleanName;
  const packStr = packs > 1 ? 'Pack of ' + packs : '';
  const parts = [brand, nameNoSize, sizeStr, packStr, 'New'].filter(Boolean);
  let title = parts.join(' ').replace(/\s{2,}/g,' ').trim();
  if (title.length > 80) title = title.substring(0, 77).replace(/\s+\S*$/, '') + '...';
  return title;
}

// Claude
async function callClaude(upc,prod,ebay){
  stat('Analyzing with Claude...');
  if(!savvyToken())return fallback(upc,prod,ebay);

  const low     = ebay?.prices?.low || ebay?.pricing?.active?.low || 0;
  const avg     = ebay?.prices?.avg || ebay?.pricing?.active?.avg || 0;
  const sold    = ebay?.pricing?.sold;
  const soldCount = sold?.count || ebay?.soldCount || 0;
  const soldAvg   = sold?.avg || sold?.median || 0;
  const activeListings = ebay?.activeListings || 0;

  // ── Pricing logic: eBay is always the source of truth ────────
  // Use the cheapest active price as the market reference
  const marketLow = low || soldAvg || avg || 0;

  // ── Bundle optimizer: find smallest pack that makes it profitable
  // Min bundle revenue = $15 (after $6.50 shipping + 13% eBay fees)
  const MIN_BUNDLE = 15;
  const MAX_PACK   = 12;
  let optimalPack = 1;
  if (marketLow > 0) {
    for (let p = 1; p <= MAX_PACK; p++) {
      if (marketLow * p * 0.95 >= MIN_BUNDLE) { optimalPack = p; break; }
    }
  }
  const bundlePrice = marketLow > 0 ? (marketLow * optimalPack * 0.95).toFixed(2) : 0;
  const bundleViable = bundlePrice >= MIN_BUNDLE;

  const eInfo = ebay?.found ? [
    `eBay activos: ${activeListings} listings.`,
    `Precio más bajo activo: $${low} | Avg: $${avg}`,
    soldCount > 0 ? `Vendidos (90d): ${soldCount} unidades. Precio vendido avg: $${soldAvg}` : 'Sin ventas registradas en 90 días.',
    marketLow > 0 ? `Bundle óptimo: Pack de ${optimalPack} × $${marketLow} = $${bundlePrice} (precio de venta sugerido -5% del más barato)` : '',
  ].filter(Boolean).join('\n') : 'No encontrado en eBay.';

  // eBay Catalog aspects (item specifics ya detectados)
  const aspectsStr = prod.aspects && Object.keys(prod.aspects).length > 0
    ? 'Atributos eBay Catalog: ' + Object.entries(prod.aspects).map(([k,v])=>`${k}: ${v}`).join(', ')
    : '';

  // Category de eBay Catalog
  const catalogCat = ebay.category ? `Category eBay Catalog: ID ${ebay.category.id} (${ebay.category.name})` : '';

  // Top titles de eBay como plantillas de referencia SEO
  const topRef=ebay&&ebay.topTitles&&ebay.topTitles.length>0
    ?`\n\nTÍTULOS QUE ESTÁN VENDIENDO EN EBAY AHORA (úsalos como referencia de keywords y estructura):\n`+
      ebay.topTitles.slice(0,5).map((t,i)=>`${i+1}. ${typeof t==='object'?t.title:t}`).join('\n')
    :'';

  const prompt=`Eres un experto en resale/liquidation para eBay con 10 años de experiencia. Tu trabajo es decidir si un producto es rentable (SAVVY) o no (DWI) y crear el listing perfecto.

DATOS DEL PRODUCTO:
- UPC: ${upc}
- Nombre: ${prod.name||'No identificado'}
- Marca: ${prod.brand||'Desconocida'}
- ${eInfo}
- ${catalogCat}
- ${aspectsStr}${topRef}

REGLAS DE DECISIÓN SAVVY vs DWI (aplica EN ESTE ORDEN):
1. Si NO está en eBay o no tiene precio → DWI (no podemos saber si vende)
2. Si está en eBay pero tiene 0 ventas en 90 días → DWI (no se vende)
3. Si el bundle de ${optimalPack} unidad(es) a $${bundlePrice} es MENOR a $${MIN_BUNDLE} → DWI (no cubre envío+fees)
4. Si tiene ventas Y el bundle es viable (≥$${MIN_BUNDLE}) → SAVVY
5. Si el precio unitario ya es ≥$${MIN_BUNDLE} → SAVVY con pack de 1 o 2

PACK SIZE RECOMENDADO: ${optimalPack} unidades a $${bundlePrice} precio total
(Este es el pack mínimo para ser rentable. Puedes sugerir un pack mayor si tiene muchas ventas)

INSTRUCCIONES PARA EL TÍTULO (LO MÁS IMPORTANTE):
FÓRMULA: [Marca] [Nombre Producto] [Tamaño/Count] [Atributo Clave] [Pack de N] New

EJEMPLOS DE TÍTULOS PERFECTOS:
• "Neutrogena Makeup Remover Cleansing Towelettes 25ct Fragrance Free Pack of 2 New"
• "Centrum Adults Multivitamin Multimineral Supplement 200ct Pack of 2 New"
• "Colgate Total Whitening Toothpaste Fresh Mint Gel 4.8oz Pack of 2 New Sealed"

REGLAS CRÍTICAS DEL TÍTULO:
1. Máximo 80 caracteres EXACTOS
2. SIEMPRE empieza con la BRAND
3. El pack size va ANTES de New, al final
4. NUNCA empieces con "2X", "2-Pack", "Bundle" o números
5. Incluir count/tamaño del producto (oz, ct, ml, lb)
6. Terminar con "New" o "New Sealed"
7. NO usar emojis, signos especiales, ni mayúsculas excesivas

Responde ÚNICAMENTE con este JSON (sin markdown, sin explicación):
{"verdict":"SAVVY o DWI","reason":"1 oración en español explicando el veredicto con el dato clave de eBay","title":"título eBay MAX 80 chars","price":${bundlePrice||'NUMERO_precio'},"packSize":${optimalPack},"category":"ID_categoria_ebay","categoryName":"nombre categoría","description":"Bundle of [N] [product name]. [key benefit/use]. Brand new, factory sealed. Fast shipping from North Carolina.","brand":"marca exacta"}

CRITERIO SAVVY vs DWI:
- SAVVY: producto conocido con demanda real, precio eBay > $5 unidad, categoría con rotación
- DWI: precio eBay < $3 unidad, sin demanda, producto no identificado, o artículo restringido

REGLA CRÍTICA DEL TÍTULO: NUNCA incluyas el UPC, código de barras, o frases como "2-Pack Bundle UPC 12345". El título DEBE empezar con la BRAND seguida del NOMBRE del producto.
Para el precio: usa (precio_min_ebay × packSize × 0.92) si hay datos. Si no hay datos eBay, usa estimado conservador por categoría.`;
  try{
    // 15-second timeout so we never hang forever
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 15000);
    stat('Analyzing with Claude AI...');
    const r=await savvyClaude({
      signal: ctrl.signal,
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:500,messages:[{role:'user',content:prompt}]}) // ⚠️ HAIKU LOCKED - NEVER CHANGE
    });
    clearTimeout(timer);
    // Rate limited → just use fallback, don't wait
    if(r.status===429){toast('⏳ eBay rate limit — using fast estimate');return fallback(upc,prod,ebay);}
    if(!r.ok)return fallback(upc,prod,ebay);
    const d=await r.json();
    const txt=(d.content&&d.content[0]&&d.content[0].text||'').replace(/```json|```/g,'').trim();
    const res=JSON.parse(txt);
    res.upc=upc;res.ebay=ebay;res.prod=prod;
    if(!res.brand||res.brand.toLowerCase()==='generic')res.brand=prod.brand||'';
    return res;
  }catch(e){
    if(e.name==='AbortError') toast('⚠️ Claude timeout — using fast estimate');
    return fallback(upc,prod,ebay);
  }
}

function fallback(upc,prod,ebay){
  const avg=ebay&&ebay.prices&&ebay.prices.avg||0;
  const found=prod&&prod.found;
  const packs=2;
  const cid=catId((prod&&prod.name)||'');
  // Smart title — never expose UPC
  let title='';
  if(found) title=buildSmartTitle(prod,packs);
  else if(ebay&&ebay.topTitles&&ebay.topTitles[0]){
    const t=ebay.topTitles[0];
    title=String(typeof t==='object'?t.title:t).substring(0,80);
  } else title='New Product Pack of '+packs+' New';
  const brand=(prod&&prod.brand)||'';
  return{verdict:found||(avg>3)?'SAVVY':'DWI',
    reason:found?'Estimado sin API':'No data suficientes',
    title,price:calcBundlePrice(ebay,packs),packSize:packs,
    category:cid,categoryName:catNm(cid),
    description:`Bundle of ${packs} ${found?prod.name:'items'}. New sealed. Fast shipping from Lumberton, NC.`,
    brand,upc,ebay,prod};
}

// Main
async function analyze(upc){
  upc=String(upc||'').replace(/\D/g,'');
  if(upc.length<8){toast('❌ Invalid UPC — minimum 8 digits');return;}
  screen('load');$('lp').textContent='UPC: '+upc;

  let step='init', prod={name:'',brand:'',found:false}, ebay={found:false}, res=null;
  try{
    // ── Single call to eBay: Catalog + Browse + Finding ──────
    step='ebay_catalog';
    stat('Querying eBay Catalog...');
    const ebayFull = await lookupProduct(upc);

    // Extract product info from Catalog response
    if (ebayFull.product && ebayFull.product.name) {
      prod = {
        name:        ebayFull.product.name,
        brand:       ebayFull.product.brand || '',
        description: ebayFull.product.description || '',
        aspects:     ebayFull.product.aspects || {},
        found:       true,
        source:      'ebay_catalog'
      };
      $('lp').textContent = prod.name.substring(0, 50);
    } else {
      // Fallback to UPCitemdb if Catalog found nothing
      step='upcitemdb_fallback';
      stat('Searching UPCitemdb...');
      prod = await lookupUPCitemdb(upc);
      if(prod.found) $('lp').textContent = prod.name.substring(0, 50);

      // ── KEYWORD FALLBACK: if still no product name, search eBay by UPC as keyword
      // This catches retired LEGO sets, discontinued items, etc.
      // Trigger: no product name found yet (regardless of whether eBay found prices)
      if (!prod.found) {
        try {
          stat('Searching eBay by keyword...');
          const kwCtrl = new AbortController();
          const kwTimer = setTimeout(()=>kwCtrl.abort(), 10000);
          const kwR = await fetch(WORKER + '/?keywords=' + upc, { signal: kwCtrl.signal });
          clearTimeout(kwTimer);
          if (kwR.ok) {
            const kwD = await kwR.json();
            // Merge prices if keyword search found better data
            if (kwD.prices?.low || kwD.topTitles?.length) {
              if (!ebayFull.prices && kwD.prices) ebayFull.prices = kwD.prices;
              if (!ebayFull.pricing?.sold && kwD.pricing) ebayFull.pricing = kwD.pricing;
              if (!ebayFull.topTitles?.length && kwD.topTitles?.length) ebayFull.topTitles = kwD.topTitles;
              if (!ebayFull.activeListings && kwD.activeListings) ebayFull.activeListings = kwD.activeListings;
              if (!ebayFull.soldCount && kwD.soldCount) ebayFull.soldCount = kwD.soldCount;
              ebayFull.priceSource = 'keyword_upc';
              if (!ebayFull.found) ebayFull.found = kwD.found || false;
            }
            // Extract product name from top eBay title
            if (kwD.topTitles && kwD.topTitles[0]) {
              const topT = typeof kwD.topTitles[0] === 'object' ? kwD.topTitles[0].title : kwD.topTitles[0];
              if (topT) {
                prod.name = topT.substring(0, 120);
                prod.found = true;
                prod.source = 'ebay_keyword';
                // Extract brand from title (first word usually)
                const firstWord = topT.trim().split(/\s+/)[0];
                if (firstWord && firstWord.length > 1) prod.brand = firstWord;
                $('lp').textContent = prod.name.substring(0, 50);
              }
            }
          }
        } catch(e) { /* keyword search failed silently */ }
      }
    }

    // Map ebayFull to legacy ebay format expected by callClaude
    ebay = {
      found:          ebayFull.found,
      activeListings: ebayFull.activeListings || 0,
      soldCount:      ebayFull.soldCount || 0,
      cheapestPrice:  ebayFull.cheapestPrice || 0,
      cheapestTitle:  ebayFull.cheapestTitle || '',
      prices:         ebayFull.prices || null,
      topTitles:      ebayFull.topTitles || [],
      pricing:        ebayFull.pricing || {},
      category:       ebayFull.category || null,
      priceSource:    ebayFull.priceSource || 'keyword', // 'gtin_exact' = most accurate
    };

    step='claude';
    stat('Analyzing with Claude...');
    res=await callClaude(upc,prod,ebay);

    step='render';
    if(!res.brand||res.brand.toLowerCase()==='generic'||res.brand.trim()===''){
      res.brand = prod.brand||'';
    }
    if(!res.title||res.title.includes(upc)||res.title.toLowerCase().includes(' upc ')){
      res.title = buildSmartTitle(prod, res.packSize||2) || res.title;
    }
    // Validar categoría — si Claude pone categoría padre o default, recalcular desde título
    const PARENT_CATS = ['26395','293','888','220','1281','2984','14308','20625','6000','16486','11854','31786','20725'];
    const titleBasedCat = catId(res.title || prod.name || '');
    if (!res.category || PARENT_CATS.includes(String(res.category)) || res.category === '31786') {
      // Solo usar 31786 si el título realmente es skin care
      const isSkinCare = /lotion|moisturizer|sunscreen|spf|face wash|serum|toner|cleanser/i.test(res.title||'');
      if (!isSkinCare && titleBasedCat !== '31786') {
        res.category = titleBasedCat;
        res.categoryName = catNm(titleBasedCat);
      }
    }

    // ── OVERRIDE VERDICT MATEMÁTICAMENTE ─────────────────────
    // Recalcular aquí en scope local de analyze()
    const _low      = ebay?.prices?.low || ebay?.pricing?.active?.low || 0;
    const _soldAvg  = ebay?.pricing?.sold?.avg || ebay?.pricing?.sold?.median || 0;
    const _avg      = ebay?.prices?.avg || 0;
    const _mBase    = _low || _soldAvg || _avg || 0;
    const _soldCnt  = ebay?.pricing?.sold?.count || ebay?.soldCount || 0;
    const _MIN      = 15;
    let   _optPack  = 1;
    if (_mBase > 0) {
      for (let p = 1; p <= 12; p++) {
        if (_mBase * p * 0.95 >= _MIN) { _optPack = p; break; }
      }
    }
    const _bPrice   = (_mBase * _optPack * 0.95).toFixed(2);
    const _viable   = parseFloat(_bPrice) >= _MIN;

    if (ebay.found && _mBase > 0) {
      if (_viable) {
        res.verdict  = 'SAVVY';
        res.price    = _bPrice;
        res.packSize = _optPack;
        res.reason   = _soldCnt > 0
          ? `$${_low||_avg} más barato en eBay. ${_soldCnt} ventas en 90 días. Bundle de ${_optPack} a $${_bPrice}.`
          : `Precio activo $${_low||_avg}. Bundle de ${_optPack} a $${_bPrice}. Sin ventas registradas — monitorear.`;
      } else {
        res.verdict = 'DWI';
        res.reason  = `Precio en eBay $${_low||_avg}. Ni con 12 unidades ($${(_mBase*12*0.95).toFixed(2)}) llega a $${_MIN} mínimo.`;
      }
    } else if (!ebay.found || _mBase === 0) {
      res.verdict = 'DWI';
      res.reason  = 'No se encontró precio activo en eBay. Sin datos de mercado.';
    }

    cur=res;
    cur._singleProductImg=null; // limpiar foto anterior al escanear nuevo producto
    cur._bundleImg=null;
    _lastBundleUrl = '';
    try {
      renderResult(res);
      screen('res');
    } catch(renderErr) {
      console.error('renderResult error:', renderErr);
      $('resBody').innerHTML='<div style="padding:20px"><div class="badge dw">❌ Render Error</div>'
        +'<div class="card" style="margin-top:12px"><div class="lbl">Error Message</div>'
        +'<div class="val" style="font-size:13px;color:#ff5252;word-break:break-all">'+renderErr.message+'</div></div>'
        +'<div class="card"><div class="lbl">Where</div>'
        +'<div class="val" style="font-size:11px;color:var(--mu)">'+String(renderErr.stack||'').substring(0,200)+'</div></div>'
        +'<button class="ag-btn" id="agBtnErr">🔄 SCAN ANOTHER</button></div>';
      screen('res');
      var eb=$('agBtnErr');
      if(eb) eb.addEventListener('click',function(){ scanAnother(); });
    }
  }catch(e){
    console.error('Error en paso ['+step+']:',e);
    // Mostrar error en pantalla (no solo toast)
    screen('res');
    $('resBody').innerHTML=`
      <div class="badge dw">❌ ERROR</div>
      <div class="card">
        <div class="lbl">Failed step</div>
        <div class="val" style="font-family:monospace;color:var(--dw)">${step}</div>
      </div>
      <div class="card">
        <div class="lbl">Error message</div>
        <div class="val" style="font-size:12px;word-break:break-all">${e.message||'Error desconocido'}</div>
      </div>
      <div class="card">
        <div class="lbl">Scanned UPC</div>
        <div class="val" style="font-family:monospace">${upc}</div>
      </div>
      <div class="card">
        <div class="lbl">Product found</div>
        <div class="val">${prod.found?prod.name:'Not found in UPCitemdb'}</div>
      </div>
      <div class="card">
        <div class="lbl">eBay Worker</div>
        <div class="val">${ebay.found?'✅ '+ebay.activeListings+' listings':'❌ No data'}</div>
      </div>
      <div class="card">
        <div class="lbl">Sesión Claude</div>
        <div class="val">${savvyToken()?'✅ Activa':'❌ Inicia sesión'}</div>
      </div>
      <button class="ag-btn" id="agBtn" style="margin-top:10px">🔄 TRY AGAIN</button>`;
    $('agBtn').addEventListener('touchend',e=>{e.preventDefault();scanAnother();});
    $('agBtn').addEventListener('click',scanAnother);
  }
}


// ── ADD TO BULK CSV ───────────────────────────────────────────

function updateFAB(){
  const n=bulk.length;
  const fab=$('fab');
  const fabN=$('fabN');
  if(fab) fab.classList.toggle('on', n>0);
  if(fabN) fabN.textContent=n;
}

async function addBulk() {
  var EXP_REQ = ['67169','180959','75037','51227','57041','2984','67167','105070'];
  if (EXP_REQ.includes(String(cur.category||''))) {
    // Check both cur._expDate and DOM display (in case _packState wasn't set)
    var expVal = cur._expDate || '';
    if (!expVal) {
      var dateDisplay = document.getElementById('date-result-display');
      if (dateDisplay && dateDisplay.textContent && dateDisplay.textContent.trim() !== '' 
          && !dateDisplay.textContent.includes('Toca mes')) {
        expVal = dateDisplay.textContent.replace('📅','').trim();
        cur._expDate = expVal; // save it
      }
    }
    if (!expVal) {
      toast('⚠️ Este producto requiere fecha de expiración — toca 📅 para agregarla');
      var expBtn = document.getElementById('exp-toggle-btn');
      if (expBtn) {
        expBtn.style.borderColor = '#e74c3c';
        expBtn.style.background = 'rgba(231,76,60,.15)';
        expBtn.scrollIntoView({behavior:'smooth', block:'center'});
      }
      return;
    }
  }

  if (!cur) return;
  const packs = cur._selectedPack || cur.packSize || 2;
  var skuEl   = document.getElementById('pack-sku-display');
  var titleEl = document.getElementById('pack-title-display');
  var usedTitle = cur._selectedTitle || (titleEl && titleEl.dataset.val) || rebuildTitle(cur.title||'', packs);
  var usedSKU   = cur._selectedSKU   || (skuEl   && skuEl.dataset.val)   || makeSKU(cur.brand, cur.upc, packs, cur.title);
  var usedPrice = cur._selectedPrice || parseFloat(cur.price) || 9.99;
  var shade     = (cur._shade   || '').trim();
  var expDate   = cur._expDate  || '';
  var location  = cur.location  || '';

  if (bulk.find(function(b){ return b.upc === cur.upc; })) {
    toast('⚠️ Already in CSV'); return;
  }

  // ── FOTO REQUERIDA — eBay rechaza listings sin foto ──────────
  // Verificar en múltiples lugares donde puede estar guardada la foto
  var bundlePreviewImg = document.querySelector('#bundle-preview img');
  var hasPhoto = !!(
    _lastBundleUrl ||
    (cur._bundleImg && cur._bundleImg.length > 100) ||
    cur._imgUrl ||
    cur._singleProductImg ||
    (bundlePreviewImg && bundlePreviewImg.src && bundlePreviewImg.src.length > 100)
  );
  // Si hay imagen en el DOM, guardarla en cur para que _doAddBulk la use
  if (!cur._bundleImg && bundlePreviewImg && bundlePreviewImg.src && bundlePreviewImg.src.length > 100) {
    cur._bundleImg = bundlePreviewImg.src;
  }
  if (!hasPhoto) {
    var _photoWarnOv = document.createElement('div');
    _photoWarnOv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;gap:14px;text-align:center';
    _photoWarnOv.innerHTML = '<div style="font-size:50px">📷</div>'
      + '<div style="color:#fff;font-size:18px;font-weight:800">Sin foto — eBay rechazará este listing</div>'
      + '<div style="color:#aaa;font-size:14px;line-height:1.6">eBay requiere al menos 1 foto.<br>Toma la foto antes de agregar al CSV.</div>'
      + '<div style="display:flex;gap:10px;margin-top:6px;width:100%;max-width:320px">'
      + '<button id="_photoWarnCancel" style="flex:1;background:none;border:1px solid #555;border-radius:12px;padding:13px;color:#aaa;font-size:14px;cursor:pointer">Cancelar</button>'
      + '<button id="_photoWarnContinue" style="flex:1;background:#ff6b00;border:none;border-radius:12px;padding:13px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">Agregar igual</button>'
      + '</div>';
    document.body.appendChild(_photoWarnOv);
    document.getElementById('_photoWarnCancel').onclick = function() { _photoWarnOv.remove(); };
    document.getElementById('_photoWarnContinue').onclick = function() {
      _photoWarnOv.remove();
      _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, '');
    };
    return;
  }

  // Incluir base64 también — _doAddBulk intentará subir a ImgBB
  var photoUrl = _lastBundleUrl || cur._bundleImg || cur._imgUrl || '';
  await _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, photoUrl);
}

async function _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, photoUrl) {
  // Si la foto es base64, intentar subir a ImgBB
  if (photoUrl && photoUrl.startsWith('data:')) {
    const imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
    if (imgbbKey) {
      const addBtn = document.getElementById('addBtn');
      if (addBtn) { addBtn.disabled = true; addBtn.textContent = '📤 Uploading photo...'; }
      let compressed = photoUrl;
      try {
        const img = new Image(); img.src = photoUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const c = document.createElement('canvas');
        c.width = 800; c.height = 800;
        c.getContext('2d').drawImage(img, 0, 0, 800, 800);
        compressed = c.toDataURL('image/jpeg', 0.82);
      } catch(e) { compressed = photoUrl; }
      const uploaded = await clUploadPhotoToImgBB(compressed, imgbbKey);
      if (uploaded) {
        photoUrl = uploaded;
        if (cur) { cur._bundleImg = uploaded; cur._imgUrl = uploaded; }
        toast('✅ Foto subida — agregando al CSV');
      } else {
        toast('⚠️ ImgBB falló — verifica tu API key en ⚙️. Agregando sin foto.');
        photoUrl = '';
      }
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = '➕ ADD TO CSV'; }
    } else {
      toast('⚠️ Configura ImgBB en ⚙️ para subir fotos. Agregando sin foto.');
      photoUrl = '';
    }
  }

  bulk.push({
    sku:         usedSKU,
    title:       usedTitle || (cur && cur.title) || '',
    price:       usedPrice,
    shade:       shade,
    expDate:     expDate,
    upc:         (cur && cur.upc)         || '',
    brand:       (cur && cur.brand)       || 'Generic',
    category:    (cur && cur.category)    || '26395',
    description: (cur && cur.description) || '',
    location:    location,
    packs:       packs,
    photo:       photoUrl,
    bundleImg:   photoUrl,
    scannedBy:   SAVVY_CURRENT_USER || 'unknown'
  });
  saveBulkToStorage();
  updateFAB();
  toast('✅ Added — ' + bulk.length + ' in CSV');
}

// Render result
function renderResult(r){
  if(!r)return;
  const sv=r.verdict==='SAVVY';
  const ebay=r.ebay||{};
  const low =ebay.prices&&ebay.prices.low||0;
  const avg =ebay.prices&&ebay.prices.avg||0;
  const packs=r.packSize||2;
  const sku=makeSKU(r.brand,r.upc,packs,r.title);
  const bundlePrice=calcBundlePrice(ebay,packs);

  let h=`<div class="badge ${sv?'sv':'dw'}">${sv?'✅ SAVVY':'❌ DWI'}</div>`;

  // ── 1. TITLE ─────────────────────────────────────────────────
  h+=`<div class="card" style="border-left:3px solid var(--ac)">
    <div class="lbl" style="color:var(--ac)">📝 eBay SEO Title</div>
    <div id="pack-title-display" class="val" style="font-size:15px;font-weight:700;line-height:1.5" data-val="${esc(r.title||'')}">${esc(r.title||'')}</div>
    <div style="font-size:11px;color:var(--mu);margin-top:4px">${(r.title||'').length}/80 chars</div>
  </div>`;

  // ── 2. SKU ───────────────────────────────────────────────────
  h+=`<div class="card"><div class="lbl">SKU</div>
    <div id="pack-sku-display" class="val" style="font-family:monospace;font-size:14px" data-val="${esc(sku)}">${esc(sku)}</div></div>`;

  // ── 3. CATEGORY ──────────────────────────────────────────────
  h+=`<div class="card"><div class="lbl">Category</div>
    <div class="val">${esc(r.categoryName||'Health & Beauty')}
      <span style="color:var(--mu);font-size:11px"> · ID ${esc(r.category||'26395')}</span>
    </div></div>`;

  // ── 4. PACK SELECTOR ─────────────────────────────────────────
  h+=`<div class="price-row">
    <div class="pc"><div class="lbl">eBay Lowest<br><span style="font-size:9px;color:var(--mu)">(item+ship, NEW)</span></div><div class="pc-num low">${low>0?fmt(low):'—'}</div></div>
    <div class="pc"><div class="lbl">eBay Avg<br><span style="font-size:9px;color:var(--mu)">(item+ship)</span></div><div class="pc-num avg">${avg>0?fmt(avg):'—'}</div></div>
    <div class="pc"><div class="lbl">Your Bundle</div><div class="pc-num bdl" id="pack-bundle-price">${fmt(bundlePrice)}</div></div>
  </div>`+
  (function(){
    var _cb=low||avg||0;
    var h2='<div class="card"><div class="lbl">📦 SELECT PACK SIZE</div>';
    h2+='<div class="pack-chips" id="pack-chips">';
    PACK_SIZES.forEach(function(n){
      var sel=(n===packs)?' sel':'';
      var cp=_cb>0?'$'+(_cb*n*0.88).toFixed(2):'';
      h2+='<div class="pack-chip'+sel+'" onclick="pickPack('+n+')">'
        +'<div class="pc-n">'+n+'pk</div>'+(cp?'<div class="pc-p">'+cp+'</div>':'')+'</div>';
    });
    h2+='</div>';
    h2+='<div id="pack-sel-display" style="font-size:12px;color:var(--mu);margin-top:4px">Selected: <strong style="color:var(--ac)">Pack of '+packs+'</strong></div>';
    h2+='<div class="extra-field"><div class="extra-label">🎨 Shade / Color (optional)</div><input class="extra-input" id="shade-input" type="text" placeholder="e.g. Cherry Red, #12 Brown..." oninput="updateShadeColor(this.value)"></div>';
    // Categorías que requieren fecha de expiración
    var EXP_REQUIRED_CATS = ['67169','180959','75037','51227','57041','2984','67167','105070'];
    var needsExpDate = EXP_REQUIRED_CATS.includes(String(r.category||''));

    h2+='<div class="extra-field"><div class="extra-label">📅 Expiration Date'
      + (needsExpDate ? ' <span style="color:#e74c3c;font-weight:800">* REQUIRED</span>' : ' (optional)')
      + '</div>';
    if (needsExpDate) {
      h2+='<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.4);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:#e74c3c">⚠️ Este producto requiere fecha de expiración para listarse en eBay</div>';
    }
    h2+='<div id="exp-toggle-btn" onclick="toggleExpDate()" style="display:inline-flex;align-items:center;gap:8px;background:var(--sf2);border:1.5px solid '+(needsExpDate?'#e74c3c':'var(--bd)')+';border-radius:10px;padding:10px 16px;cursor:pointer;margin-top:6px;font-size:13px;color:'+(needsExpDate?'#e74c3c':'var(--mu)')+'"><span>📅</span><span>'+(needsExpDate?'Ingresar fecha de expiración (REQUERIDO)':'This product has an expiration date')+'</span></div>';
    h2+='<div id="exp-date-picker" style="display:none;margin-top:10px"><div class="extra-label">MONTH</div><div class="pack-chips" id="month-chips" style="gap:6px"></div><div class="extra-label" style="margin-top:10px">YEAR</div><div class="pack-chips" id="year-chips" style="gap:6px"></div><div class="date-result" id="date-result-display" style="text-align:left;margin-top:8px"></div><button onclick="clearExpDate()" style="background:none;border:none;color:var(--mu);font-size:12px;cursor:pointer;margin-top:4px">✕ Remove date</button></div></div>';
    h2+='</div>';
    return h2;
  }());

  // ── 3. BUNDLE PHOTO GENERATOR ────────────────────────────────
  h+=`<div class="bundle-photo-card">
    <div class="lbl">📸 LISTING PHOTO — Bundle Image Generator</div>
    <div style="background:rgba(255,171,0,.1);border:1px solid rgba(255,171,0,.4);border-radius:8px;padding:8px 12px;margin:6px 0 10px;font-size:11px;line-height:1.6">
      💡 <strong>Background tip for best results:</strong><br>
      🖤 Light/white products (vitamins, lotion) → use <strong>BLACK or DARK background</strong><br>
      ⬜ Dark products (dark bottles, sprays) → use <strong>WHITE or LIGHT background</strong>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px">
      <button id="bundle-gen-btn" onclick="pgTakePhoto()" style="width:100%;background:linear-gradient(135deg,#FF6B35,#E71D36);border:none;border-radius:10px;padding:13px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">
        📦 Generate Pack with AI (Remove Background + Bundle)
      </button>
      <button onclick="openReadyPhoto()" style="width:100%;background:#1a472a;border:2px solid #2ecc71;border-radius:10px;padding:13px;color:#2ecc71;font-size:14px;font-weight:800;cursor:pointer">
        📦 Generate Pack with AI (Quitar Fondo + Bundle)
      </button>
    </div>
    <div id="bundle-generating" class="bundle-generating" style="display:none">⏳ Processing...</div>
    <div id="bundle-preview" class="bundle-preview" style="display:none"></div>
  </div>`;

  // ── 5. UPC MATCH BADGE ───────────────────────────────────────
  const src=ebay.priceSource||'keyword';
  const srcBadge=src==='gtin_exact'
    ?'<span style="background:rgba(0,230,118,.15);color:var(--sv);font-size:11px;padding:3px 10px;border-radius:10px;font-weight:700">✅ UPC EXACT MATCH</span>'
    :src.includes('gtin')
    ?'<span style="background:rgba(255,171,0,.15);color:var(--gd);font-size:11px;padding:3px 10px;border-radius:10px">⚠️ PARTIAL MATCH</span>'
    :'<span style="background:rgba(255,107,0,.15);color:var(--ac);font-size:11px;padding:3px 10px;border-radius:10px">🔍 KEYWORD ONLY</span>';
  h+=`<div style="text-align:center;margin:8px 0">${srcBadge}</div>`;

  // ── 6. EBAY MARKET DATA ──────────────────────────────────────
  if(ebay.activeListings>0){
    const sold=ebay.pricing&&ebay.pricing.sold;
    h+=`<div class="card"><div class="lbl">eBay — Market Data (NEW, item+ship)</div>
      <div class="val" style="font-size:13px;line-height:2">
        🏷 Active BIN: <strong>${ebay.activeListings}</strong><br>
        💰 Min: <strong>${fmt(low)}</strong> | Avg: <strong>${fmt(avg)}</strong> | Max: ${fmt(ebay.prices&&ebay.prices.high)}
        ${sold?`<br>✅ Sold (90d): <strong>${sold.count}</strong> | Avg: <strong>${fmt(sold.avg)}</strong>`:''}
      </div>
      ${src!=='gtin_exact'?`<div style="font-size:11px;color:var(--mu);margin-top:4px">⚠️ Keyword prices — verify on eBay</div>`:''}
    </div>`;
  }

  // ── 7. DWI REASON ────────────────────────────────────────────
  if(!sv)h+=`<div class="card"><div class="lbl">DWI Reason</div><div class="val">${esc(r.reason||'')}</div></div>`;

  // ── 9. LOCATION ──────────────────────────────────────────────
  const locVal=r.location||'';
  h+=`<div class="card"><div class="lbl">📍 Warehouse Location</div>
    <div style="margin-top:8px">${locVal?locBadgeHTML(locVal,'scanner'):locEmptyHTML('scanner')}</div>
  </div>`;

  h+=sv
    ? `<button class="add-btn" id="addBtn" ${cur && cur._bundleImg===undefined ? '' : ''}>➕ ADD TO CSV</button>`
    : `<button class="ov-add-btn" id="addBtn">➕ Add anyway (DWI override)</button>`;
  h+=`<button class="ag-btn" id="agBtn">🔄 SCAN ANOTHER</button>`;

  $('resBody').innerHTML=h;

  const addB=$('addBtn');
  if(addB){addB.addEventListener('touchend',e=>{e.preventDefault();addBulk();});addB.addEventListener('click',addBulk);}
  const agB=$('agBtn');
  if(agB){agB.addEventListener('touchend',e=>{e.preventDefault();scanAnother();});agB.addEventListener('click',scanAnother);}

  setTimeout(function(){
    var ebayPrices=(r.ebay&&r.ebay.prices)?r.ebay.prices:null;
    initPackWheel(Number(packs)||2,ebayPrices,r.title||'',r.upc||'',r.brand||'',
      {sku:document.getElementById('pack-sku-display'),
       title:document.getElementById('pack-title-display'),
       price:document.getElementById('pack-bundle-price'),
       display:document.getElementById('pack-sel-display')});
    var si=document.getElementById('shade-input');
    if(si&&window.cur&&cur._shade) si.value=cur._shade;
  },80);
}

function clearBulkSession() {
  if (bulk.length === 0) { toast('⚠️ No hay productos'); return; }
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:30px';
  ov.innerHTML = '<div style="background:var(--sf);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center">'
    + '<div style="font-size:18px;font-weight:800;margin-bottom:8px">🗑 Clear Session</div>'
    + '<div style="font-size:14px;color:var(--mu);margin-bottom:20px">Borrar ' + bulk.length + ' producto(s)?</div>'
    + '<button onclick="bulk=[];updateFAB();renderBulk();saveBulkToStorage();document.querySelectorAll(\'.clear-ov\').forEach(e=>e.remove());toast(\'✅ Sesión limpiada\')" '
    + 'style="width:100%;padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px;display:block">Sí, borrar todo</button>'
    + '<button onclick="document.querySelectorAll(\'.clear-ov\').forEach(e=>e.remove())" '
    + 'style="width:100%;padding:10px;background:none;border:1px solid #555;border-radius:10px;color:#888;cursor:pointer;display:block">Cancelar</button>'
    + '</div>';
  ov.className = 'clear-ov';
  document.body.appendChild(ov);
}

function scanAnother() {
  const upcInput = document.getElementById('upcIn');
  if (upcInput) { upcInput.value = ''; setTimeout(()=>upcInput.focus(), 100); }
  _lastBundleUrl = '';
  screen('idle');
}

function renderBulk(){
  const el=$('bulkList');
  if(!el)return;
  if(!bulk.length){el.innerHTML='<p style="text-align:center;color:var(--mu);padding:20px">No items yet.</p>';return;}
  el.innerHTML=bulk.map((it,i)=>`<div class="bi"><div class="bin"><div class="bit">${esc(it.title.substring(0,50))}</div><div class="bis">${esc(it.sku)}</div></div><div class="bip">${fmt(it.price)}</div><button class="bdel" data-i="${i}">✕</button></div>`).join('');
  el.querySelectorAll('.bdel').forEach(b=>b.addEventListener('click',()=>{bulk.splice(+b.dataset.i,1);updateFAB();renderBulk();}));
}

// CSV Export
function exportCSV(){
  try {
  if(!bulk.length){toast('⚠️ No products');return;}

  function q(v) {
    v = String(v==null?'':v);
    return (v.indexOf(',')>=0||v.indexOf('"')>=0||v.indexOf('\n')>=0)
      ? '"'+v.replace(/"/g,'""')+'"' : v;
  }

  var SHIP = CL_SHIP_POLICY;
  var RET  = CL_RET_POLICY;
  var PAY  = CL_PAY_POLICY;

  var HDR = [
    '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
    'CustomLabel','*Category','*Title','*ConditionID','*Description',
    'PicURL','*Format','*Duration','*StartPrice','*Quantity',
    'ImmediatePayRequired','*Location','*DispatchTimeMax',
    'ShippingProfileName','ReturnProfileName','PaymentProfileName',
    '*C:Brand','C:Type','C:EPA Registration Number','C:Model',
    'C:Color','C:Language','C:Book Title','C:Author','ISBN',
    'C:Expiration Date','C:Dosage'
  ];

  var lines = ['Info,Version=1.0.0,Template=fx_category_template_EBAY_US', HDR.join(',')];
  var skipped = 0;

  // Category → required Type value
  var CAT_TYPE = {
    '36870': 'Lip Balm',
    '36870': 'Lip Balm',
    '11838': 'Deodorant',
    '11840': 'Body Wash',
    '26683': 'Razor',
    '67167': 'Pads',
    '105070': 'Underwear',
    '36478': 'Nail Polish',
    '60496': 'Foundation',
    '180345': 'Perfume',
    '57041': 'Eye Drops',
    '11854': 'Shampoo',
    '1232':  'Insect Repellent',
    '261844':'Insect Repellent',
    '19264': 'Brace',
    '51227': 'Bandage',
    '67169': 'Pain Reliever',
    '180959':'Vitamin',
    '31786': 'Lotion',
    '11840': 'Body Wash',
  };

  // Detectar tipo desde título
  function detectType(category, title) {
    const mapped = CAT_TYPE[String(category)];
    if (mapped) return mapped;
    const t = (title||'').toLowerCase();
    if(/lip balm|chapstick|lip butter/.test(t)) return 'Lip Balm';
    if(/body wash|shower gel/.test(t)) return 'Body Wash';
    if(/lotion|moisturizer/.test(t)) return 'Lotion';
    if(/shampoo/.test(t)) return 'Shampoo';
    if(/conditioner/.test(t)) return 'Conditioner';
    if(/hair color|hair dye/.test(t)) return 'Hair Color';
    if(/mascara/.test(t)) return 'Mascara';
    if(/foundation|concealer/.test(t)) return 'Foundation';
    if(/lipstick|lip gloss/.test(t)) return 'Lipstick';
    if(/eyeshadow/.test(t)) return 'Eye Shadow';
    if(/deodorant|antiperspirant/.test(t)) return 'Deodorant';
    if(/razor/.test(t)) return 'Razor';
    if(/shaving cream|shave gel/.test(t)) return 'Shaving Cream';
    if(/nail polish|nail color/.test(t)) return 'Nail Polish';
    if(/perfume|cologne|eau de/.test(t)) return 'Perfume';
    if(/gummy|gummies/.test(t)) return 'Gummy';
    if(/capsule|softgel/.test(t)) return 'Capsule';
    if(/powder/.test(t)) return 'Powder';
    if(/tablet|pill/.test(t)) return 'Tablet';
    if(/insect|mosquito|bug spray|repellent/.test(t)) return 'Insect Repellent';
    if(/glove|sleeve|brace|wrap|support/.test(t)) return 'Brace';
    if(/bandage|gauze/.test(t)) return 'Bandage';
    if(/sunscreen|spf/.test(t)) return 'Sunscreen';
    return 'Other';
  }

  // EPA Registration Number — solo para insect repellents
  function getEpaNumber(category, title) {
    const t = (title||'').toLowerCase();
    // ⚠️ CORREGIDO (14 ago 2026): antes bastaba con que el título dijera
    // "repellent" para ponerle un número de registro EPA. En ropa eso es un
    // desastre: "Columbia Water Repellent Jacket" habría salido marcado como
    // pesticida y eBay rechaza el listado por política (le pasó a un lip balm
    // en Product Scanner por la misma clase de bug). Ahora se exige \b y
    // contexto real de insecto.
    if(String(category)==='1232' || String(category)==='261844' ||
       /\b(insect|mosquito|deet)\b/.test(t) ||
       /\bbug\s+(spray|repellent)\b/.test(t) ||
       (/\brepellent\b/.test(t) && /\b(insect|mosquito|bug|fly|flies|gnat|tick|pest)\w*\b/.test(t))) {
      return '4822-547'; // OFF! generic EPA registration
    }
    return '';
  }

  var EPA_BLOCKED = ['046500221545','046500047452','046500017087'];
  var APPLIANCE_C = ['168763','14284','75655','293','112529','44867','14969','9394','48619','20625'];
  var COLOR_C     = ['20695','20694','20696','36903','37558','261068','220'];
  var BOOK_C      = ['261186','171228','377','267','2228','69'];

  bulk.forEach(function(it) {
    // Saltar productos no identificados o restringidos por EPA
    if (EPA_BLOCKED.some(function(u){ return (it.sku||'').includes(u); })) {
      skipped++; toast('⚠️ ' + it.sku + ' — Bloqueado por EPA'); return;
    }
    if (!it.title || it.title.includes('UNABLE TO CREATE') || it.title.includes('UNIDENTIFIED') || it.brand === 'UNKNOWN') {
      skipped++; return;
    }
    // Saltar productos sin título real (solo "Pack of N New" sin nombre de producto)
    var titleWords = (it.title||'').replace(/pack of \d+/gi,'').replace(/\bnew\b/gi,'').replace(/\bsealed\b/gi,'').trim();
    if (titleWords.length < 8) {
      skipped++;
      toast('⚠️ SKU ' + (it.sku||'') + ' — sin título válido, omitido del CSV');
      return;
    }
    var pics = it.bundleImg || it.photo || it.imgUrl || '';
    var typeVal   = detectType(String(it.category), it.title);
    var epaVal    = getEpaNumber(String(it.category), it.title);
    var modelVal  = '';
    var colorVal  = '';
    var langVal   = '';
    var bookTitle = '';
    var authorVal = '';
    var isbnVal    = '';
    var expDateVal = it.expDate || '';
    var dosageVal  = '';
    // Extract dosage from title for health products
    var EXP_CATS_D = ['67169','180959','75037','51227','57041','2984','67167','105070'];
    if (EXP_CATS_D.includes(String(it.category))) {
      var doseMatch = (it.title||'').match(/(\d+\.?\d*\s*(?:mg|mcg|iu|ml|oz|g|ct|count|capsule|tablet|softgel|serving))/i);
      dosageVal = doseMatch ? doseMatch[0] : 'See product label';
    }

    // Auto-fix brand for known brands in title
    var brandFix = it.brand || 'Generic';
    const titleLower = (it.title||'').toLowerCase();
    if (/\blego\b/.test(titleLower)) { brandFix = 'LEGO'; }
    else if (/\bdash\b/.test(titleLower) && /waffle|maker|blender|toaster/.test(titleLower)) { brandFix = 'Dash'; }
    else if (/\bjergens\b/.test(titleLower)) { brandFix = 'Jergens'; }
    else if (/\bolay\b/.test(titleLower)) { brandFix = 'Olay'; }
    else if (/\bneutrogena\b/.test(titleLower)) { brandFix = 'Neutrogena'; }
    else if (/\bdove\b/.test(titleLower)) { brandFix = 'Dove'; }
    else if (/\bold spice\b/.test(titleLower)) { brandFix = 'Old Spice'; }
    else if (/\bcolgate\b/.test(titleLower)) { brandFix = 'Colgate'; }
    else if (/\bcrest\b/.test(titleLower)) { brandFix = 'Crest'; }
    else if (/\bpantene\b/.test(titleLower)) { brandFix = 'Pantene'; }
    else if (/\bmetamucil\b/.test(titleLower)) { brandFix = 'Metamucil'; }
    else if (/\bcentrum\b/.test(titleLower)) { brandFix = 'Centrum'; }

    var cleanTitle = (it.title||'').replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}✳️⭐🔥💊📦✅❌⚠️🌟💰📊🏷️]/gu, '').replace(/\s+/g,' ').trim().substring(0,80);

    // Model — required for Electronics & Appliances
    if (APPLIANCE_C.includes(String(it.category))) {
      var titleWords = (it.title||'').split(/,/)[0].trim();
      modelVal = brandFix ? titleWords.replace(new RegExp('^'+brandFix+'\\s*','i'),'').trim().substring(0,65) : titleWords.substring(0,65);
    }

    // Color — required for mugs, kitchenware
    if (COLOR_C.includes(String(it.category))) {
      const tl = titleLower;
      if (/white/i.test(tl)) colorVal = 'White';
      else if (/black/i.test(tl)) colorVal = 'Black';
      else if (/red/i.test(tl)) colorVal = 'Red';
      else if (/blue/i.test(tl)) colorVal = 'Blue';
      else if (/green/i.test(tl)) colorVal = 'Green';
      else if (/gray|grey/i.test(tl)) colorVal = 'Gray';
      else if (/silver/i.test(tl)) colorVal = 'Silver';
      else if (/clear|transparent/i.test(tl)) colorVal = 'Clear';
      else colorVal = 'Multicolor';
    }

    // Override type for books
    if (BOOK_C.includes(String(it.category))) {
      typeVal = 'Fiction'; // eBay accepts Fiction/Non-Fiction for books
    }
    if (BOOK_C.includes(String(it.category))) {
      langVal   = 'English';
      // Book Title max 65 chars
      var rawBookTitle = cleanTitle.replace(/\s*Pack of \d+\s*/gi,'').replace(/\s*New\s*$/i,'').trim();
      bookTitle = rawBookTitle.length > 65 ? rawBookTitle.substring(0,62).replace(/\s+\S*$/,'').trim() + '...' : rawBookTitle;
      authorVal = (it.brand && it.brand !== 'Generic') ? it.brand : 'Unknown';
      // ISBN = last 13 digits from SKU (UPCs for books are ISBNs)
      const upcStr = (it.sku||'').replace(/[^0-9]/g,'');
      // Try to get 13-digit number from the SKU
      const isbnMatch = (it.sku||'').match(/(\d{13})/);
      isbnVal = isbnMatch ? isbnMatch[1] : (upcStr.length >= 13 ? upcStr.substring(0,13) : '');
    }

    lines.push([
      'Add',
      it.sku||'',
      it.category||'31786',
      cleanTitle,
      '1000',
      it.description || ('<p>' + cleanTitle + '</p>'),
      pics,
      'FixedPrice','GTC',
      it.price||'9.99',
      '1','1',
      'Lumberton, NC','1',
      SHIP, RET, PAY,
      brandFix,
      typeVal,
      epaVal,
      modelVal,
      colorVal,
      langVal,
      bookTitle,
      authorVal,
      isbnVal,
      expDateVal,
      dosageVal
    ].map(q).join(','));
  });

  var csv  = lines.join('\r\n');
  var now  = new Date();
  var stamp = now.getFullYear()+'-'
    + String(now.getMonth()+1).padStart(2,'0')+'-'
    + String(now.getDate()).padStart(2,'0')+'-'
    + String(now.getHours()).padStart(2,'0')
    + String(now.getMinutes()).padStart(2,'0');
  var exportedCount = bulk.length - skipped;
  var fname = 'eBay-FX-'+stamp+'-'+exportedCount+'items.csv';
  if (skipped > 0) toast('⚠️ ' + skipped + ' producto(s) no identificados omitidos del CSV');

  var driveUrl = localStorage.getItem('cl_drive_url');
  if (driveUrl) {
    toast('📤 Subiendo a Google Drive...');
    fetch(driveUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({csv: csv, filename: fname}),
      headers: {'Content-Type': 'text/plain'}
    }).then(function() {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;'
        +'display:flex;flex-direction:column;align-items:center;justify-content:center;'
        +'padding:30px;gap:16px;text-align:center';
      ov.innerHTML = '<div style="font-size:60px">✅</div>'
        +'<div style="color:#fff;font-size:22px;font-weight:800">CSV en Google Drive</div>'
        +'<div style="color:#aaa;font-size:14px">'+fname+'</div>'
        +'<div style="color:#aaa;font-size:13px;line-height:1.6">'
        +'En Windows abre <b style="color:#fff">drive.google.com</b><br>'
        +'Carpeta <b style="color:#fff">eBay Listings</b><br>'
        +'Descarga el CSV → sube a eBay</div>'
        +'<a href="https://drive.google.com/drive/folders" target="_blank" '
        +'style="background:#1a73e8;border-radius:12px;padding:14px 28px;color:#fff;'
        +'font-weight:800;font-size:16px;text-decoration:none">📁 Abrir Google Drive</a>'
        +'<button onclick="this.parentElement.remove()" '
        +'style="background:none;border:1px solid #555;border-radius:10px;padding:10px 24px;'
        +'color:#888;cursor:pointer;font-size:14px">Cerrar</button>';
      document.body.appendChild(ov);
    }).catch(function() {
      savvyShowExportOptions(csv, fname, bulk.length);
    });
  } else {
    savvyShowExportOptions(csv, fname, bulk.length);
  }
  } catch(exportErr) {
    console.error('exportCSV error:', exportErr);
    toast('❌ Export error: ' + exportErr.message);
    // Show full error for debugging
    var errOv = document.createElement('div');
    errOv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:12px;text-align:center';
    errOv.innerHTML = '<div style="font-size:32px">❌</div>'
      + '<div style="color:#fff;font-size:16px;font-weight:800">Export Error</div>'
      + '<div style="color:#ff5252;font-size:13px;word-break:break-all;max-width:340px;background:#1a1a1a;padding:12px;border-radius:8px">' + exportErr.message + '</div>'
      + '<button onclick="this.parentElement.remove()" style="background:linear-gradient(135deg,#FF6B35,#E71D36);border:none;border-radius:10px;padding:12px 24px;color:#fff;cursor:pointer;font-weight:800">Cerrar</button>';
    document.body.appendChild(errOv);
  }
}

function savvyShowExportOptions(csv, fname, count) {
  var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var ov   = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;'
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;gap:12px;text-align:center';
  ov.innerHTML = '<div style="font-size:40px">📄</div>'
    +'<div style="color:#fff;font-size:18px;font-weight:800">'+fname+'</div>'
    +'<div style="color:#aaa;font-size:13px">'+count+' producto(s) listos para eBay</div>'
    +'<a href="'+url+'" download="'+fname+'" '
    +'style="background:linear-gradient(135deg,#FF6B35,#E71D36);border-radius:12px;padding:14px 28px;color:#fff;'
    +'font-weight:800;font-size:16px;text-decoration:none;margin-top:8px">⬇️ Descargar CSV</a>'
    +'<div style="color:#666;font-size:11px;margin-top:4px">Configura Google Drive URL en ⚙️ para subida directa</div>'
    +'<button onclick="this.parentElement.remove()" '
    +'style="background:none;border:1px solid #555;border-radius:10px;padding:10px 24px;'
    +'color:#888;cursor:pointer;font-size:14px;margin-top:4px">Cerrar</button>';
  document.body.appendChild(ov);
}

// Init
document.addEventListener('DOMContentLoaded',()=>{
  if(!localStorage.getItem('savvy_ebay_id'))localStorage.setItem('savvy_ebay_id',DEF_EBAY);

  const cfgBtn=$('cfgBtn');
  cfgBtn.addEventListener('touchend',e=>{e.preventDefault();openCfgWithPin();});
  cfgBtn.addEventListener('click',openCfgWithPin);
  $('cfgX').addEventListener('click',closeCfg);

  const camBtn=$('camBtn');
  camBtn.addEventListener('touchend',e=>{e.preventDefault();startCam();});
  camBtn.addEventListener('click',startCam);
  const stopBtn=$('camStop');
  stopBtn.addEventListener('touchend',e=>{e.preventDefault();stopCam();});
  stopBtn.addEventListener('click',stopCam);

  const ui=$('upcIn'),sb=$('srchBtn');
  function chk(){sb.classList.toggle('on',ui.value.trim().replace(/\D/g,'').length>=8);}
  ui.addEventListener('input',chk);ui.addEventListener('change',chk);ui.addEventListener('paste',()=>setTimeout(chk,50));
  function doSearch(){const v=ui.value.trim().replace(/\D/g,'');if(v.length>=8)analyze(v);}
  sb.addEventListener('touchend',e=>{e.preventDefault();doSearch();});
  sb.addEventListener('click',doSearch);
  ui.addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});

  function openBulk(){renderBulk();$('bulkOv').classList.add('on');}
  $('fab').addEventListener('touchend',e=>{e.preventDefault();openBulk();});
  $('fab').addEventListener('click',openBulk);
  $('bulkX').addEventListener('click',()=>$('bulkOv').classList.remove('on'));
  $('expBtn').addEventListener('touchend',e=>{e.preventDefault();exportCSV();});
  $('expBtn').addEventListener('click',exportCSV);
  $('clrBtn').addEventListener('touchend',e=>{
    e.preventDefault();
    if(bulk.length===0){toast('⚠️ No hay productos en el CSV');return;}
    // No usar confirm() en iOS — usar overlay propio
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:30px';
    ov.innerHTML='<div style="background:var(--sf);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center">'
      +'<div style="font-size:18px;font-weight:800;margin-bottom:8px">🗑 Clear Session</div>'
      +'<div style="font-size:14px;color:var(--mu);margin-bottom:20px">Vas a borrar '+bulk.length+' producto(s). ¿Confirmas?</div>'
      +'<button onclick="bulk=[];updateFAB();renderBulk();saveBulkToStorage();this.closest(\'div[style*=fixed]\').remove();toast(\'✅ Sesión limpiada\')" style="width:100%;padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px">Sí, borrar todo</button>'
      +'<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:10px;background:none;border:1px solid var(--bd);border-radius:10px;color:var(--mu);cursor:pointer">Cancelar</button>'
      +'</div>';
    document.body.appendChild(ov);
  });
  $('clrBtn').addEventListener('click',function(){
    if(bulk.length===0){toast('⚠️ No hay productos en el CSV');return;}
    if(confirm('¿Borrar '+bulk.length+' producto(s) de la sesión?')){
      bulk=[];updateFAB();renderBulk();saveBulkToStorage();toast('✅ Sesión limpiada');
    }
  });

  renderSt();
  checkSavedSession();
  const su = localStorage.getItem('cl_sheets_url');
  if ($('sheetsIn') && su) $('sheetsIn').value = su;
  const rk = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  if ($('rbgKeyIn') && rk) $('rbgKeyIn').placeholder = '••••••••' + rk.slice(-4);
  const pk = localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  // Clothing keys
  const clRbg = localStorage.getItem('cl_rbg_key') || DEFAULT_RBG_KEY;
  const clPr  = localStorage.getItem('cl_photoroom_key');
  if (document.getElementById('cl-rbg-key-in') && clRbg)
    document.getElementById('cl-rbg-key-in').placeholder = '••••••••' + clRbg.slice(-4);
  if (document.getElementById('cl-pr-key-in') && clPr)
    document.getElementById('cl-pr-key-in').placeholder = '••••••••' + clPr.slice(-4);
  const scannerRbg = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  const scannerPr  = localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  // Google Drive URL
  const driveEl = document.getElementById('drive-url-input');
  const driveUrl = localStorage.getItem('cl_drive_url');
  if (driveEl && driveUrl) {
    driveEl.value = driveUrl;
    document.getElementById('drive-status').textContent = '✅ Google Drive conectado';
    document.getElementById('drive-status').style.color = 'var(--sv)';
  }
  // ImgBB key
  const imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
  if (document.getElementById('imgbb-key-in') && imgbbKey) {
    document.getElementById('imgbb-key-in').placeholder = '••••••••' + imgbbKey.slice(-4);
    document.getElementById('imgbb-status').textContent = '✅ ImgBB configured — photos will auto-upload for eBay URLs';
  }

  if (clRbg) {
    clShowBgStatus('✅ Clothing Remove.bg key active — no watermark on clothing photos', 'var(--sv)');
  } else if (scannerRbg) {
    clShowBgStatus('✅ Using Scanner Remove.bg key for clothing (no watermark). You can set a separate key above.', 'var(--sv)');
  } else if (clPr || scannerPr) {
    clShowBgStatus('⚠️ Using PhotoRoom — photos will have watermark. Add a Remove.bg key above for clean photos.', 'var(--gd)');
  }
  if ($('phroomKeyIn') && pk) {
    $('phroomKeyIn').placeholder = '••••••••' + pk.slice(-4);
    showRbgStatus('✅ PhotoRoom configured — tap "Test Background Removal" to verify', 'var(--sv)');
  } else if (rk) {
    showRbgStatus('✅ Remove.bg configured — consider also adding PhotoRoom (75 free/month)', 'var(--gd)');
  }

  // Clothing FAB
  const clFab = $('cl-fab');
  if (clFab) {
    clFab.addEventListener('touchend', e => { e.preventDefault(); clShowSession(); });
    clFab.addEventListener('click', clShowSession);
  }

  // Restore session badge on page reload
  setTimeout(function() {
    if (typeof clUpdateSessionBadge === 'function') clUpdateSessionBadge();
    if (typeof clUpdateClFAB === 'function') clUpdateClFAB();
    // Update cl-fab badge number
    const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
    const fabN = document.getElementById('cl-fab-n');
    if (fabN && sess.length > 0) fabN.textContent = sess.length;
  }, 500);
});

function clShowSession() {
  const ebayCount = JSON.parse(localStorage.getItem('cl_ebay_session')||'[]').length;
  const oldCount  = clBulk.length;
  if (!ebayCount && !oldCount) { toast('No items in session'); return; }

  // Mostrar modal con opciones de export
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:18px 18px 0 0;padding:24px;width:100%;max-width:480px;margin:0 auto">
      <div style="font-size:16px;font-weight:800;margin-bottom:4px">📦 Clothing Session</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:12px">${ebayCount} item(s) ready</div>
      <button onclick="clPreviewSession()" style="width:100%;background:none;border:1px solid #555;border-radius:8px;padding:8px;color:var(--mu);font-size:12px;cursor:pointer;margin-bottom:10px">🔍 Preview CSV content (debug)</button>
      <div id="cl-url-check" style="background:var(--sf2);border-radius:10px;padding:10px;margin-bottom:12px;font-size:12px;color:var(--mu)">⏳ Checking photo URLs...</div>

      <button onclick="this.closest('div[style]').remove();setTimeout(clExportEbayCSV,50)" style="width:100%;background:var(--sv);border:none;border-radius:12px;padding:15px;color:#000;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:10px">
        📥 Export for eBay (.csv)
        <div style="font-size:11px;font-weight:400;margin-top:2px">Upload to eBay → Reports → Try it now → Upload template</div>
      </button>

      <button onclick="clClearSession();this.closest('div[style]').remove()" ontouchend="event.preventDefault();clClearSession();this.closest('div[style]').remove()" style="width:100%;background:none;border:1px solid var(--dw);border-radius:10px;padding:10px;color:var(--dw);font-size:13px;cursor:pointer;margin-bottom:8px">🗑 Clear Session (start fresh)</button>
      <button onclick="this.closest('div[style]').remove()" style="width:100%;background:none;border:none;padding:10px;color:var(--mu);font-size:14px;cursor:pointer">Cancel</button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Verify photo URLs immediately
  setTimeout(function() {
    const checkEl = document.getElementById('cl-url-check');
    if (!checkEl) return;
    const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
    const withPhotos = sess.filter(r => r.photos && r.photos.startsWith('https://'));
    const noPhotos   = sess.filter(r => !r.photos || !r.photos.startsWith('https://'));
    if (sess.length === 0) {
      checkEl.innerHTML = '⚠️ No items in session';
      checkEl.style.color = 'var(--dw)';
    } else if (noPhotos.length === 0) {
      checkEl.innerHTML = '✅ All ' + sess.length + ' items have photo URLs — ready for eBay!';
      checkEl.style.color = 'var(--sv)';
    } else {
      checkEl.innerHTML = '⚠️ ' + noPhotos.length + ' item(s) missing photo URLs (ImgBB not set up when scanned). '
        + 'Clear session below and re-scan to get photos. ' + withPhotos.length + ' item(s) have photos ✅';
      checkEl.style.color = 'var(--gd)';
    }
  }, 100);
}



// ── SESSION PERSISTENCE ───────────────────────────────────────
// Auto-save scanner bulk to localStorage on every change
function saveBulkToStorage() {
  try {
    if (bulk.length > 0) {
      localStorage.setItem('savvy_bulk_backup', JSON.stringify(bulk));
      localStorage.setItem('savvy_bulk_backup_ts', new Date().toISOString());
    }
  } catch(e) {}
}

// Auto-save clothing bulk
function saveClBulkToStorage() {
  try {
    if (clBulk.length > 0) {
      // Save without full photo data (too large) — save metadata only
      const lite = clBulk.map(it => ({...it, photos: {
        front:  it.photos?.front  ? '[foto]' : null,
        back:   it.photos?.back   ? '[foto]' : null,
        tag:    it.photos?.tag    ? '[foto]' : null,
        detail: it.photos?.detail ? '[foto]' : null,
      }}));
      localStorage.setItem('savvy_cl_backup', JSON.stringify(lite));
      localStorage.setItem('savvy_cl_backup_ts', new Date().toISOString());
    }
  } catch(e) {}
}

// Restore session on page load
function checkSavedSession() {
  const bulkBackup = localStorage.getItem('savvy_bulk_backup');
  const clBackup   = localStorage.getItem('savvy_cl_backup');
  const bulkTs     = localStorage.getItem('savvy_bulk_backup_ts');
  const clTs       = localStorage.getItem('savvy_cl_backup_ts');

  const hasBulk = bulkBackup && JSON.parse(bulkBackup).length > 0;
  const hasCl   = clBackup   && JSON.parse(clBackup).length > 0;

  if (!hasBulk && !hasCl) return;

  // Build restore banner
  let msg = '📦 Saved Session detectada: ';
  const parts = [];
  if (hasBulk) parts.push(JSON.parse(bulkBackup).length + ' scanner product(s)');
  if (hasCl)   parts.push(JSON.parse(clBackup).length + ' clothing item(s)');
  msg += parts.join(' + ');

  const ts = bulkTs || clTs;
  if (ts) {
    const d = new Date(ts);
    msg += ' · ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }

  // Show in dashboard panel instead of a floating banner
  const panel = document.getElementById('dash-session-panel');
  const desc  = document.getElementById('dash-session-desc');
  if (panel) panel.style.display = 'block';
  if (desc)  desc.textContent = msg;
}

function restoreSession() {
  try {
    const bulkData = localStorage.getItem('savvy_bulk_backup');
    if (bulkData) {
      bulk = JSON.parse(bulkData);
      updateFAB();
    }
    const clData = localStorage.getItem('savvy_cl_backup');
    if (clData) {
      clBulk = JSON.parse(clData);
      clUpdateClFAB();
    }
    toast('✅ Session restored');
  } catch(e) {
    toast('❌ Restore failed');
  }
  dismissRestoreBanner();
}

function discardSession() {
  localStorage.removeItem('savvy_bulk_backup');
  localStorage.removeItem('savvy_bulk_backup_ts');
  localStorage.removeItem('savvy_cl_backup');
  localStorage.removeItem('savvy_cl_backup_ts');
  dismissRestoreBanner();
}

function dismissRestoreBanner() {
  const panel = document.getElementById('dash-session-panel');
  if (panel) panel.style.display = 'none';
}

// ── WARN BEFORE LEAVING PAGE ──────────────────────────────────
window.addEventListener('beforeunload', function(e) {
  if (bulk.length > 0 || clBulk.length > 0) {
    // Auto-save before leaving
    saveBulkToStorage();
    saveClBulkToStorage();
    // Show browser warning
    e.preventDefault();
    e.returnValue = '¿Seguro que quieres salir? Tus escaneos se guardarán automáticamente.';
    return e.returnValue;
  }
});


// ═══════════════════════════════════════════════════════════
// LOCATION SCANNER MODULE — shared between Scanner + Clothing
// ═══════════════════════════════════════════════════════════
let _locCallback = null;
let _locTarget = null; // 'scanner' or 'clothing'

async function locOpen(target) {
  _locTarget = target;
  document.getElementById('loc-overlay').classList.add('on');
  savvyStopScan('loc-qr-video');
  savvyStartScan('loc-qr-video', async (code) => {
    locCapture(code.trim());
  });
}

async function locClose() {
  savvyStopScan('loc-qr-video');
  document.getElementById('loc-overlay').classList.remove('on');
}

function locCapture(code) {
  locClose();
  if (_locTarget === 'scanner') {
    if (cur) {
      cur.location = code;
      // Update location badge in result screen
      const badge = document.getElementById('loc-badge-scanner');
      if (badge) badge.outerHTML = locBadgeHTML(code, 'scanner');
    }
    toast('📍 Location: ' + code);
  } else if (_locTarget === 'clothing') {
    cl.location = code;
    // Update location badge in review screen
    const badge = document.getElementById('loc-badge-clothing');
    if (badge) badge.outerHTML = locBadgeHTML(code, 'clothing');
    toast('📍 Location: ' + code);
  }
}

function locClear(target) {
  if (target === 'scanner' && cur) {
    cur.location = '';
    const badge = document.getElementById('loc-badge-scanner');
    if (badge) badge.outerHTML = locEmptyHTML('scanner');
  } else if (target === 'clothing') {
    cl.location = '';
    const badge = document.getElementById('loc-badge-clothing');
    if (badge) badge.outerHTML = locEmptyHTML('clothing');
  }
}

function locBadgeHTML(code, target) {
  return `<span class="loc-badge" id="loc-badge-${target}">
    <span class="loc-scan-icon">📍</span>
    <span>${code}</span>
    <span class="loc-clear" onclick="locClear('${target}')" title="Borrar">✕</span>
  </span>`;
}

function locEmptyHTML(target) {
  return `<span class="loc-empty" id="loc-badge-${target}" onclick="locOpen('${target}')">
    <span>📦</span><span>Scan location (optional)</span>
  </span>`;
}

// ── MODULE NAVIGATION ─────────────────────────────────────────────────
function toDash() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('scr-dash').classList.add('on');
  // Update header back button visibility
  const hdrBack = $('hdr-back');
  if (hdrBack) hdrBack.style.display = 'none';
}

function openScanner() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('scr-idle').classList.add('on');
}

function openClothing() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('cl-sku').classList.add('on');
  clRenderSKU();
}

function saveSheetsUrl() {
  const v = $('sheetsIn')?.value?.trim();
  if (!v) return;
  localStorage.setItem('cl_sheets_url', v);
  toast('✅ Sheets URL saved');
  setTimeout(closeCfg, 700);
}

function screen(n) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  const el = $('scr-' + n);
  if (el) el.classList.add('on');
}

// ═══════════════════════════════════════════════════════════
// CLOTHING MODULE — Savvy Scanner
// State, logic, and rendering for clothing intake workflow
// ═══════════════════════════════════════════════════════════

// ── State ───────────────────────────────────────────────────
let cl = {
  sku:'', type:'clothing', gender:'unisex', brand:'', brandCustom:'', category:'', size:'L',
  color:'', colorCustom:'', condition:'', defects:[], notes:'',
  weightLb:'', weightOz:'',
  photos:{ front:null, back:null, tag:null, detail:null, meas1:null, meas2:null },
  clothingPrices: { minPrice: null, avgPrice: null, suggestedPrice: null, found: false },
  pricesLoading: false,
  step: 1, submitting: false,
  // ── PASO 2, taxonomia v134 — solo se usan con el flag encendido ──────────
  // Con CL_TAXONOMY_V134_ENABLED = false estos campos existen pero nadie los
  // lee, y ninguna ruta de codigo existente los consulta.
  ageGroup: '',      // 'baby' | 'kids4up'   (solo cuando gender === 'kids')
  kidsDept: '',      // 'boys' | 'girls' | 'unisex'
  adultBranch: '',   // 'mens' | 'womens'    (solo cuando gender === 'unisex')
  // Aspectos oficiales, con los nombres EXACTOS de eBay como clave:
  // { 'Size Type': 'Regular', 'Heel Style': 'Wedge', ... }
  aspects: {}
};


// ═══════════════════════════════════════════════════════════════════════════
// PASO 2 — TAXONOMIA OFICIAL EBAY_US v134 (DETRAS DE UN FLAG APAGADO)
//
// La logica pura vive en taxonomy/cl-taxonomy.js, que index.html carga ANTES
// que este archivo. Aqui solo esta el enganche con la interfaz.
//
// Mientras clTaxV134() sea false:
//   - no se carga nada,
//   - no aparece ningun control nuevo,
//   - las categorias siguen saliendo de CL_CATS / CL_SHOE_CATS,
//   - el CSV, clGetEbayCategoryId y clBuildAspects quedan intactos.
// ═══════════════════════════════════════════════════════════════════════════

function clTaxV134() {
  return typeof ClTaxonomy !== 'undefined' && ClTaxonomy.CL_TAXONOMY_V134_ENABLED === true;
}

// Estado del bloqueo. Solo puede activarse con el flag encendido.
var clTaxBloqueado = false;

// Arranca la carga. Con el flag apagado no hace absolutamente nada.
function clTaxonomyBoot() {
  if (!clTaxV134()) return Promise.resolve({ ok: true, omitido: true });
  return clLoadTaxonomy().then(function (r) {
    if (!r.ok) {
      clTaxBloqueado = true;
      clTaxMostrarBloqueo(r);
    }
    return r;
  });
}

// Si la taxonomia no carga, el flujo Clothing & Shoes se bloquea. NUNCA se
// vuelve al mapa viejo en silencio: publicar en la categoria equivocada es
// peor que no publicar.
function clTaxMostrarBloqueo(err) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cl-tax-bloqueo')) return;
  var ov = document.createElement('div');
  ov.id = 'cl-tax-bloqueo';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'padding:30px;gap:14px;text-align:center';
  ov.innerHTML = '<div style="font-size:56px">\u26D4</div>'
    + '<div style="color:#fff;font-size:20px;font-weight:800">Clothing &amp; Shoes no disponible</div>'
    + '<div style="color:#ddd;font-size:14px;line-height:1.6;max-width:420px">'
    + 'No se pudo cargar la taxonomia oficial de eBay, asi que no se puede saber '
    + 'en que categoria va cada prenda.<br><br>'
    + '<b>No se captura nada hasta que se arregle</b>, para no publicar en la '
    + 'categoria equivocada.</div>'
    + '<div style="color:#888;font-size:12px;font-family:monospace">'
    + (err && err.codigo ? err.codigo : 'DESCONOCIDO') + ' \u00b7 '
    + ((err && err.mensaje) || '') + '</div>';
  document.body.appendChild(ov);
}

// ── limpieza en cascada ────────────────────────────────────────────────────
// Al cambiar una seleccion superior, lo que colgaba de ella deja de ser valido.
// Se limpia en vez de arrastrar una combinacion imposible.
function clTaxSetGender(g) {
  cl.gender = g;
  if (g !== 'kids')   { cl.ageGroup = ''; cl.kidsDept = ''; }
  if (g !== 'unisex') { cl.adultBranch = ''; }
  clTaxLimpiarDependientes();
}

function clTaxSetAgeGroup(a) {
  cl.ageGroup = a;
  cl.kidsDept = '';
  clTaxLimpiarDependientes();
}

function clTaxSetKidsDept(d)    { cl.kidsDept = d;    clTaxLimpiarDependientes(); }
function clTaxSetAdultBranch(b) { cl.adultBranch = b; clTaxLimpiarDependientes(); }

// La categoria y los aspectos que dependen de ella dejan de ser validos.
// Ojo: esto solo corre con el flag encendido, asi que no altera nada hoy.
function clTaxLimpiarDependientes() {
  if (!clTaxV134()) return;
  var permitidas = clTaxCategorias();
  if (cl.category && permitidas.indexOf(cl.category) === -1) {
    cl.category = '';
    cl.inseam = ''; cl.dressLength = ''; cl.outerMaterial = '';
    cl.swimStyle = ''; cl.activity = ''; cl.shoeWidth = ''; cl.style = '';
    cl._ebayTitle = null; cl._ebayDesc = null;
  }
  // Los aspectos que la nueva hoja ya no admite se descartan; los que sigue
  // admitiendo se conservan. Fotos, SKU, precio y peso no se tocan.
  clTaxPodarAspectos();
}

// Seleccion actual en el vocabulario de la taxonomia.
function clTaxSeleccion() {
  var rama = cl.gender === 'mens' ? 'mens'
           : cl.gender === 'womens' ? 'womens'
           : cl.gender === 'kids' ? 'kids'
           : cl.gender === 'unisex' ? 'unisex'
           : '';
  return {
    rama: rama,
    tipo: cl.type === 'shoes' ? 'shoes' : 'clothing',
    prenda: cl.category,
    ageGroup: cl.ageGroup || null,
    kidsDept: cl.kidsDept || null,
    adultBranch: cl.adultBranch || null
  };
}

// Categorias ofrecibles. Con el flag apagado devuelve EXACTAMENTE las listas
// de siempre, asi que la interfaz no cambia ni un chip.
function clTaxCategorias() {
  if (!clTaxV134()) return cl.type === 'shoes' ? CL_SHOE_CATS : CL_CATS;
  return clCategoriesFor(clTaxSeleccion());
}

// Resolucion. Devuelve el objeto de error tal cual; no inventa un ID.
function clTaxResolver() {
  if (!clTaxV134()) return { ok: false, codigo: 'FLAG_APAGADO', mensaje: 'La taxonomia v134 esta desactivada.' };
  return clResolveLeaf(clTaxSeleccion());
}

// ── interfaz minima, solo con el flag encendido ────────────────────────────
// Devuelve '' con el flag apagado, de modo que clRenderSKU inserta cadena
// vacia y el HTML queda byte a byte como antes.
function clTaxRenderSelectores() {
  if (!clTaxV134()) return '';
  var h = '';
  var chip = function (activo, onclick, texto) {
    return '<button class="cl-cond-btn' + (activo ? ' sel' : '') + '" onclick="' + onclick
      + '" style="flex:1;min-width:64px;padding:14px 8px">' + texto + '</button>';
  };
  if (cl.gender === 'kids') {
    h += '<div class="lbl" style="margin-top:14px">GRUPO DE EDAD</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
      + chip(cl.ageGroup === 'baby',    "clTaxSetAgeGroup('baby');clRenderSKU()",    '\uD83C\uDF7C Baby &amp; Toddler')
      + chip(cl.ageGroup === 'kids4up', "clTaxSetAgeGroup('kids4up');clRenderSKU()", '\uD83E\uDDD2 Sizes 4 &amp; Up')
      + '</div>';
    if (cl.ageGroup === 'baby' || cl.ageGroup === 'kids4up') {
      var unisexTxt = cl.ageGroup === 'baby' ? 'Unisex Baby &amp; Toddler' : 'Unisex Kids';
      h += '<div class="lbl" style="margin-top:14px">DEPARTAMENTO</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
        + chip(cl.kidsDept === 'boys',   "clTaxSetKidsDept('boys');clRenderSKU()",   'Boys')
        + chip(cl.kidsDept === 'girls',  "clTaxSetKidsDept('girls');clRenderSKU()",  'Girls')
        + chip(cl.kidsDept === 'unisex', "clTaxSetKidsDept('unisex');clRenderSKU()", unisexTxt)
        + '</div>';
    }
  } else if (cl.gender === 'unisex') {
    // eBay no tiene categorias unisex de adulto: hay que elegir la rama base.
    h += '<div class="lbl" style="margin-top:14px">RAMA BASE (eBay no tiene categoria unisex de adulto)</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + chip(cl.adultBranch === 'mens',   "clTaxSetAdultBranch('mens');clRenderSKU()",   "\uD83D\uDC54 Men's")
      + chip(cl.adultBranch === 'womens', "clTaxSetAdultBranch('womens');clRenderSKU()", "\uD83D\uDC57 Women's")
      + '</div>';
  }
  return h;
}


// ═══════════════════════════════════════════════════════════════════════════
// PASO 3 — ASPECTOS DINAMICOS (SIGUE DETRAS DEL FLAG APAGADO)
//
// Los controles salen de la categoria oficial resuelta. Si la categoria no
// admite un aspecto, ese control no existe: no se pinta y no se puede rellenar.
// Con el flag apagado todo esto devuelve cadena vacia y no se ejecuta.
// ═══════════════════════════════════════════════════════════════════════════

// Categoria activa. Devuelve el resultado de clResolveLeaf tal cual: si la
// seleccion esta incompleta o la combinacion no existe, devuelve el error con
// su codigo. Nunca cae al mapa viejo.
function clTaxCategoriaActiva() {
  if (!clTaxV134()) return { ok: false, codigo: 'FLAG_APAGADO' };
  return clResolveLeaf(clTaxSeleccion());
}

// ── puente con los campos que ya existen ───────────────────────────────────
// Brand y Color NO tienen control propio: se leen de los campos de siempre.
// Asi no hay dos marcas ni dos colores que puedan discrepar.
function clTaxValorReutilizado(campo) {
  if (campo === 'brand') return cl.brand === 'Other' ? (cl.brandCustom || '') : (cl.brand || '');
  if (campo === 'color') return cl.color === 'Other' ? (cl.colorCustom || '') : (cl.color || '');
  return '';
}

// Valores efectivos: lo capturado en cl.aspects mas lo que aportan los campos
// reutilizados. Un valor reutilizado solo cuenta si la categoria lo admite.
function clTaxValoresAspectos(cid) {
  var v = {};
  for (var k in cl.aspects) if (Object.prototype.hasOwnProperty.call(cl.aspects, k)) v[k] = cl.aspects[k];
  var lista = clAspectsFor(cid);
  for (var i = 0; i < lista.length; i++) {
    var a = lista[i];
    if (!a.reutiliza) continue;
    var val = clTaxValorReutilizado(a.reutiliza);
    if (val && clAspectValido(cid, a.nombre, val)) v[a.nombre] = val;
    else delete v[a.nombre];
  }
  return v;
}

// ── escritura ──────────────────────────────────────────────────────────────
// Rechaza cualquier valor que la categoria no admita. Nada de inventar.
function clTaxSetAspect(nombre, valor, rerender) {
  if (!clTaxV134()) return false;
  var r = clTaxCategoriaActiva();
  if (!r.ok) return false;
  if (valor === '' || valor === null || valor === undefined) {
    delete cl.aspects[nombre];
  } else if (clAspectValido(r.categoryId, nombre, valor)) {
    cl.aspects[nombre] = valor;
  } else {
    return false;                       // valor fuera de la lista oficial
  }
  if (rerender !== false && typeof clRenderAttr === 'function') clRenderAttr();
  return true;
}

// Alterna: tocar el chip ya elegido lo deselecciona. Ningun aspecto queda
// preseleccionado por defecto, ni siquiera el primer valor.
function clTaxToggleAspect(nombre, valor) {
  if (cl.aspects[nombre] === valor) return clTaxSetAspect(nombre, '');
  return clTaxSetAspect(nombre, valor);
}

// Texto libre: solo se guarda cuando la persona lo confirma, no en cada tecla.
function clTaxConfirmAspect(nombre, el) {
  if (!el) return;
  var v = String(el.value || '').trim();
  clTaxSetAspect(nombre, v);
}

// ── limpieza dependiente ───────────────────────────────────────────────────
// Al cambiar la categoria se conservan los valores que la nueva hoja sigue
// admitiendo y se descartan solo los que dejaron de ser validos. Fotos, SKU,
// precio, peso, ubicacion, defectos y notas no se tocan nunca.
function clTaxPodarAspectos() {
  if (!clTaxV134()) return [];
  var descartados = [];
  var r = clTaxCategoriaActiva();
  if (!r.ok) {
    // Sin categoria valida no se puede juzgar nada: se conserva tal cual.
    return descartados;
  }
  for (var nombre in cl.aspects) {
    if (!Object.prototype.hasOwnProperty.call(cl.aspects, nombre)) continue;
    if (!clAspectValido(r.categoryId, nombre, cl.aspects[nombre])) {
      descartados.push(nombre);
      delete cl.aspects[nombre];
    }
  }
  // La talla vive en cl.size; se somete a la misma regla.
  if (cl.size) {
    var aspTalla = clAspectsFor(r.categoryId).filter(function (a) {
      return a.nombre === 'Size' || a.nombre === 'US Shoe Size';
    })[0];
    if (!aspTalla || !clAspectValido(r.categoryId, aspTalla.nombre, cl.size)) {
      descartados.push('Size');
      cl.size = '';
    }
  }
  return descartados;
}

// ── render ─────────────────────────────────────────────────────────────────
function clTaxEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clTaxAviso(txt, detalle) {
  return '<div class="cl-sect" id="cl-tax-aviso" style="border:1px solid #8a6d1f;'
    + 'background:rgba(255,196,0,.08);border-radius:10px;padding:14px">'
    + '<div style="color:#ffc400;font-weight:700;font-size:13px">' + clTaxEsc(txt) + '</div>'
    + (detalle ? '<div style="color:var(--mu);font-size:12px;margin-top:6px">' + clTaxEsc(detalle) + '</div>' : '')
    + '</div>';
}

// Bloque completo de aspectos oficiales. '' con el flag apagado.
function clTaxRenderAspectos() {
  if (!clTaxV134()) return '';

  var r = clTaxCategoriaActiva();
  if (!r.ok) {
    if (r.codigo === 'FALTA_PRENDA')      return clTaxAviso('Elige una categoria para ver sus item specifics.');
    if (r.codigo === 'FALTA_RAMA')        return clTaxAviso('Elige Men, Women, Unisex, Kids o Scrubs.');
    if (r.codigo === 'FALTA_AGE_GROUP')   return clTaxAviso('Elige el grupo de edad: Baby & Toddler o Sizes 4 & Up.');
    if (r.codigo === 'FALTA_KIDS_DEPT')   return clTaxAviso('Elige el departamento.');
    if (r.codigo === 'FALTA_RAMA_BASE')   return clTaxAviso('Elige la rama base: Men o Women.');
    if (r.codigo === 'SIN_TAXONOMIA')     return clTaxAviso('La taxonomia oficial no esta cargada.', 'No se puede capturar hasta resolverlo.');
    // Combinacion inexistente: se dice claramente y NO se pintan aspectos.
    return clTaxAviso('Esa combinacion no existe en la taxonomia oficial de eBay.',
      (r.mensaje || '') + (r.disponibles ? ' Disponibles: ' + r.disponibles.join(', ') : ''));
  }

  var aspectos = clAspectsFor(r.categoryId);
  var valores  = clTaxValoresAspectos(r.categoryId);
  var faltan   = clAspectosFaltantes(r.categoryId, valores);

  var h = '<div class="cl-sect" id="cl-tax-aspectos">'
    + '<div class="lbl">ITEM SPECIFICS · ' + clTaxEsc(r.nombre)
    + ' <span style="color:var(--mu);font-weight:400">ID ' + clTaxEsc(r.categoryId) + '</span></div>'
    + '<div style="font-size:11px;color:var(--mu);margin:2px 0 10px">' + clTaxEsc(r.ruta) + '</div>';

  if (r.department) {
    h += '<div style="font-size:12px;color:var(--mu);margin-bottom:10px">Department: <b style="color:var(--tx)">'
      + clTaxEsc(r.department) + '</b> <span style="opacity:.7">(lo fija el grupo elegido)</span></div>';
  }

  for (var i = 0; i < aspectos.length; i++) h += clTaxRenderAspecto(r.categoryId, aspectos[i], valores);

  h += '<div style="margin-top:12px;font-size:12px;color:'
    + (faltan.length ? '#ff8a65' : 'var(--mu)') + '">'
    + (faltan.length
        ? '⚠ Faltan ' + faltan.length + ' obligatorios: ' + clTaxEsc(faltan.join(', '))
        : '✓ Todos los obligatorios estan completos')
    + '</div></div>';
  return h;
}

function clTaxRenderAspecto(cid, a, valores) {
  var actual = valores[a.nombre] === undefined ? '' : valores[a.nombre];
  var id     = 'cl-tax-' + a.nombre.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  var marca  = a.requerido
    ? '<span style="color:#ff8a65">*</span>'
    : '<span style="color:var(--mu);font-weight:400;font-size:10px"> opcional</span>';

  var h = '<div class="cl-tax-asp" data-aspecto="' + clTaxEsc(a.nombre) + '" style="margin-top:14px">'
        + '<div class="lbl" style="display:flex;align-items:center;gap:6px">'
        + clTaxEsc(a.nombre) + marca + '</div>';

  // Campos que ya existen arriba: no se duplican.
  if (a.reutiliza) {
    var etiqueta = a.reutiliza === 'brand' ? 'BRAND' : 'COLOR';
    h += '<div style="font-size:12px;padding:10px;border-radius:8px;background:var(--sf2);'
      + 'color:' + (actual ? 'var(--tx)' : '#ff8a65') + '">'
      + (actual
          ? '✓ ' + clTaxEsc(actual) + ' <span style="color:var(--mu)">· del campo ' + etiqueta + '</span>'
          : 'Sin valor admitido. Usa el campo ' + etiqueta + ' de arriba.')
      + '</div></div>';
    return h;
  }

  if (a.control === 'rueda') {
    // Rueda con los valores oficiales de ESTA categoria. Sin preseleccion.
    h += '<div class="cl-size-wrap" id="' + id + '-wrap" style="height:150px">'
      + '<div class="wh-fade-top"></div><div class="wh-indicator"></div><div class="wh-fade-bot"></div>'
      + '<div class="wheel-list" id="' + id + '-list" data-aspecto="' + clTaxEsc(a.nombre) + '"></div></div>'
      + '<div style="text-align:center;margin-top:6px;font-size:13px;color:var(--mu)">'
      + (actual ? 'Seleccionado: <b style="color:var(--ac)">' + clTaxEsc(actual) + '</b>'
                : '<span style="color:#ff8a65">Sin seleccionar</span>')
      + ' <span style="opacity:.6">· ' + a.nv + ' valores oficiales</span></div></div>';
    return h;
  }

  if (a.control === 'texto') {
    // FREE_TEXT sin lista incrustada (Brand en categorias con miles de marcas).
    // Se confirma al salir del campo o al pulsar Enter; no se guarda por tecla.
    h += '<input class="ui" id="' + id + '" type="text" style="width:100%"'
      + ' placeholder="Escribe y confirma…"'
      + ' value="' + clTaxEsc(actual) + '"'
      + ' onchange="clTaxConfirmAspect(\'' + clTaxEsc(a.nombre) + '\', this)">'
      + '<div style="font-size:11px;color:var(--mu);margin-top:4px">Texto libre · eBay sugiere '
      + a.nv + ' valores, pero acepta cualquiera.</div></div>';
    return h;
  }

  if (a.control === 'select') {
    // Listas largas: <select> nativo. En iPhone/iPad abre la rueda del sistema,
    // que se recorre con el pulgar y tiene busqueda por teclado en iPad.
    h += '<select class="ui" id="' + id + '" style="width:100%"'
      + ' onchange="clTaxSetAspect(\'' + clTaxEsc(a.nombre) + '\', this.value)">'
      + '<option value=""' + (actual ? '' : ' selected') + '>— Sin seleccionar —</option>';
    for (var i = 0; i < a.valores.length; i++) {
      var v = a.valores[i];
      h += '<option value="' + clTaxEsc(v) + '"' + (v === actual ? ' selected' : '') + '>' + clTaxEsc(v) + '</option>';
    }
    h += '</select></div>';
    return h;
  }

  // chips. La marca de seleccion compara contra el VALOR, no contra la letra
  // 'v': ese era el bug de los cuatro chips viejos, que nunca se marcaban.
  h += '<div class="cl-chips">';
  for (var j = 0; j < a.valores.length; j++) {
    var val = a.valores[j];
    h += '<button type="button" class="cl-chip' + (val === actual ? ' sel' : '') + '"'
      + ' data-v="' + clTaxEsc(val) + '"'
      + ' onclick="clTaxToggleAspect(\'' + clTaxEsc(a.nombre).replace(/'/g, "\\'") + '\', this.dataset.v)">'
      + clTaxEsc(val) + '</button>';
  }
  h += '</div></div>';
  return h;
}

// Rueda dinamica. Se llama despues de insertar el HTML. Sin valor por defecto:
// si cl.size no esta en la lista oficial, la rueda arranca sin seleccion.
function clTaxInitRuedas() {
  if (!clTaxV134() || typeof document === 'undefined') return;
  var r = clTaxCategoriaActiva();
  if (!r.ok) return;
  var aspectos = clAspectsFor(r.categoryId);
  for (var i = 0; i < aspectos.length; i++) {
    if (aspectos[i].control !== 'rueda') continue;
    clTaxBuildRueda(r.categoryId, aspectos[i]);
  }
}

function clTaxBuildRueda(cid, a) {
  var id   = 'cl-tax-' + a.nombre.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-list';
  var list = document.getElementById(id);
  if (!list) return;
  var H = 44, PAD = 2;
  var vals = a.valores;
  var idx  = vals.indexOf(cl.size);          // -1 si no hay valor valido
  var sp   = '<div style="height:44px;flex-shrink:0"></div>';
  list.innerHTML = new Array(PAD + 1).join(sp)
    + vals.map(function (v, i) {
        return '<div class="clw-item' + (i === idx ? ' sel' : '') + '" data-idx="' + i + '">' + clTaxEsc(v) + '</div>';
      }).join('')
    + new Array(PAD + 1).join(sp);
  if (idx >= 0) list.scrollTop = idx * H;

  list.addEventListener('scroll', function () {
    var n = Math.max(0, Math.min(vals.length - 1, Math.round(list.scrollTop / H)));
    if (n === idx) return;
    idx = n;
    var items = list.querySelectorAll('.clw-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('sel', i === n);
    cl.size = vals[n];
    cl.aspects[a.nombre] = vals[n];
    if (typeof playTick === 'function') playTick();
  }, { passive: true });

  list.addEventListener('click', function (e) {
    var it = e.target.closest ? e.target.closest('[data-idx]') : null;
    if (!it) return;
    list.scrollTo({ top: parseInt(it.dataset.idx, 10) * H, behavior: 'smooth' });
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// PASO 4 — VALIDACION PREVIA EN MODO INFORME (SIGUE DETRAS DEL FLAG APAGADO)
//
// Dice que le faltaria o que rechazaria eBay ANTES de exportar. En este paso
// solo informa: no cambia el CSV, no toca clExportEbayCSV y no bloquea nada.
// ═══════════════════════════════════════════════════════════════════════════

// Fuente unica de los valores capturados. Funcion pura: recibe el estado y
// devuelve un objeto nuevo con los nombres EXACTOS de eBay.
//
// La talla es el punto delicado. Hoy vive en cl.size, que no distingue entre
// ropa y calzado. Aqui se decide por lo que admite la categoria y se emite
// como 'Size' O como 'US Shoe Size', NUNCA como ambos: mandar las dos es uno
// de los errores que este validador tiene que cazar, no cometer.
function clTaxBuildItem(estado, categoryId) {
  var st = estado || cl;
  var item = {};

  // 1) los aspectos capturados en el contenedor oficial
  var origen = st.aspects || {};
  for (var k in origen)
    if (Object.prototype.hasOwnProperty.call(origen, k) && origen[k] !== '' && origen[k] != null)
      item[k] = origen[k];

  // 2) Brand y Color salen de los campos que ya existen, no de un segundo campo
  var marca = st.brand === 'Other' ? (st.brandCustom || '') : (st.brand || '');
  var color = st.color === 'Other' ? (st.colorCustom || '') : (st.color || '');
  if (marca) item['Brand'] = marca;
  if (color) item['Color'] = color;

  if (!categoryId) return item;   // sin categoria no se puede decidir la talla

  var aspectos = {};
  var lista = clAspectsFor(categoryId);
  for (var i = 0; i < lista.length; i++) aspectos[lista[i].nombre] = lista[i];

  // 3) Department lo fija el grupo elegido (Unisex Adults, Girls, Baby...)
  var res = clResolveLeaf(clTaxSeleccion());
  if (res.ok && res.department && aspectos['Department']) item['Department'] = res.department;

  // 4) la talla, en su aspecto y solo en uno
  delete item['Size'];
  delete item['US Shoe Size'];
  var campoTalla = aspectos['US Shoe Size'] ? 'US Shoe Size'
                 : aspectos['Size']         ? 'Size'
                 : null;
  if (campoTalla && st.size) item[campoTalla] = st.size;

  return item;
}

// Informe del artculo actual. Devuelve el resultado del validador puro.
function clTaxInforme(estado) {
  if (!clTaxV134()) return null;
  var r = clResolveLeaf(clTaxSeleccion());
  if (!r.ok) {
    return {
      ok: false, categoryId: null, problemas: [{
        codigo: 'COMBINACION_SIN_RESOLVER', aspecto: null,
        mensaje: r.mensaje || 'No se pudo resolver la categoria.', causa: r.codigo
      }], revisados: 0, obligatorios: 0
    };
  }
  return clValidateTaxonomyItem(clTaxBuildItem(estado || cl, r.categoryId), r.categoryId);
}

// Etiqueta corta y legible por codigo de problema.
function clTaxEtiquetaProblema(p) {
  var m = {
    OBLIGATORIO_AUSENTE:     'Falta obligatorio',
    VALOR_NO_OFICIAL:        'Valor no oficial',
    ASPECTO_NO_ADMITIDO:     'No admitido',
    SIZE_EN_CALZADO:         'Size en calzado',
    US_SHOE_SIZE_EN_ROPA:    'US Shoe Size en ropa',
    SIZE_TYPE_NO_ADMITIDO:   'Size Type no admitido',
    DEPARTMENT_INCOMPATIBLE: 'Department incompatible',
    CATEGORIA_INEXISTENTE:   'Categoria inexistente',
    COMBINACION_SIN_RESOLVER:'Sin categoria',
    SIN_TAXONOMIA:           'Taxonomia no cargada'
  };
  return m[p.codigo] || p.codigo;
}

// Panel de la pantalla de revision. INFORMATIVO: no bloquea la exportacion.
// Devuelve '' con el flag apagado, asi que el HTML anterior queda intacto.
function clTaxRenderInforme() {
  if (!clTaxV134()) return '';
  var r = clTaxInforme(cl);
  if (!r) return '';

  var bien  = r.ok;
  var borde = bien ? '#2e7d32' : '#b26a00';
  var fondo = bien ? 'rgba(46,125,50,.10)' : 'rgba(255,152,0,.10)';
  var tinta = bien ? '#66bb6a' : '#ffa726';

  var h = '<div class="card" id="cl-tax-informe" style="border-left:3px solid ' + borde
    + ';background:' + fondo + '">'
    + '<div class="lbl" style="color:' + tinta + '">'
    + (bien ? '✅ TAXONOMIA eBay — SIN PROBLEMAS' : '⚠️ TAXONOMIA eBay — ' + r.problemas.length + ' PROBLEMA' + (r.problemas.length === 1 ? '' : 'S'))
    + '</div>';

  if (r.categoryId) {
    h += '<div style="font-size:11px;color:var(--mu);margin-bottom:8px">'
      + clTaxEsc(r.ruta) + ' · ID ' + clTaxEsc(r.categoryId)
      + ' · ' + r.revisados + ' aspectos enviados, ' + r.obligatorios + ' obligatorios</div>';
  }

  if (bien) {
    h += '<div style="font-size:13px;color:var(--tx)">Todos los aspectos obligatorios estan '
      + 'completos y ningun valor esta fuera de la lista oficial de eBay.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:6px">';
    for (var i = 0; i < r.problemas.length; i++) {
      var p = r.problemas[i];
      h += '<div style="font-size:12px;line-height:1.5;padding:8px;border-radius:6px;background:var(--sf2)">'
        + '<span style="color:' + tinta + ';font-weight:700">' + clTaxEsc(clTaxEtiquetaProblema(p)) + '</span>'
        + (p.aspecto ? ' · <b style="color:var(--tx)">' + clTaxEsc(p.aspecto) + '</b>' : '')
        + '<div style="color:var(--mu);margin-top:2px">' + clTaxEsc(p.mensaje) + '</div>'
        + (p.permitidos && p.permitidos.length
            ? '<div style="color:var(--mu);margin-top:2px;font-size:11px">Oficiales: '
              + clTaxEsc(p.permitidos.slice(0, 8).join(', '))
              + (p.permitidos.length > 8 ? ' … (' + p.permitidos.length + ')' : '') + '</div>'
            : '')
        + '</div>';
    }
    h += '</div>'
      + '<div style="font-size:11px;color:var(--mu);margin-top:8px">'
      + 'Informe solamente. La exportacion no esta bloqueada en esta version.</div>';
  }
  return h + '</div>';
}


// ═══════════════════════════════════════════════════════════════════════════
// PASO 5 — CSV v134 PARALELO (SIGUE DETRAS DEL FLAG APAGADO)
//
// Camino nuevo, completo y aparte. Con el flag apagado no se ejecuta ni una
// linea de aqui: clExportEbayCSV sigue produciendo el CSV de siempre, byte a
// byte. Aqui NO hay ni un solo valor de relleno.
// ═══════════════════════════════════════════════════════════════════════════

// Version del esquema de las filas guardadas en sesion. Una fila sin este
// campo es del esquema antiguo y NO se convierte por suposicion: se exporta
// con el CSV antiguo, que es el unico formato para el que fue capturada.
var CL_ESQUEMA_FILA = 2;

// ── EL MARCADOR '*' DEL ENCABEZADO ─────────────────────────────────────────
// En las plantillas fx_category_template de eBay, el '*' delante del nombre de
// la columna marca que el dato es obligatorio. El CSV que hoy funciona en
// produccion lo usa asi: *C:Brand, *C:Size Type, *C:Size, *C:Department,
// *C:Color, *C:Style llevan asterisco y el resto no.
//
// El problema es que un mismo archivo lleva filas de categorias distintas, y
// un aspecto obligatorio en una no lo es en otra: 'Size Type' es obligatorio
// en Women's Tops y NO EXISTE en Boys' Shoes. Hoy eso no se nota porque el
// exportador rellena la columna con 'Regular' en todas las filas; en el camino
// nuevo esa celda tiene que ir vacia.
//
// No pude comprobar contra la documentacion de eBay que hace su lector cuando
// una columna marcada con '*' llega vacia: la red hacia ebay.com y
// developer.ebay.com esta bloqueada en este entorno. Asi que la decision se
// toma por el lado que no puede fallar en ninguno de los dos casos:
//
//   '*C:' SOLO cuando el aspecto es obligatorio en TODAS las categorias del
//   lote. Asi una columna con asterisco jamas queda vacia en ninguna fila.
//
// Si el '*' resulta ser meramente informativo, esta regla es igual de valida.
// Si resulta que eBay rechaza la fila con un '*' vacio, esta regla lo evita.
// La alternativa —marcar con '*' todo lo obligatorio en al menos una— solo es
// segura bajo el primer supuesto, y ese supuesto no esta verificado.
//
// Queda pendiente confirmarlo con una exportacion de prueba real antes del
// paso 6.
function clCsvPrefijo(col) {
  return col.obligatorioEnTodas ? '*C:' : 'C:';
}

// Encabezado dinamico. Recibe las categorias del lote y devuelve el array de
// columnas ya con su prefijo.
function clCsvHeaderV134(categoryIds) {
  var cols = clCsvColumnsFor(categoryIds);
  var hdr = ['*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
             'CustomLabel', '*Category', '*Title', '*ConditionID'];
  for (var i = 0; i < cols.length; i++) hdr.push(clCsvPrefijo(cols[i]) + cols[i].aspecto);
  hdr = hdr.concat(['PicURL', '*Description', '*Format', '*Duration',
    '*StartPrice', '*Quantity', 'ImmediatePayRequired', '*Location', '*DispatchTimeMax',
    'ShippingProfileName', 'ReturnProfileName', 'PaymentProfileName',
    'WeightMajor', 'WeightMinor']);
  return { hdr: hdr, cols: cols };
}

// Una fila. Devuelve { celdas, problemas }.
//
// Regla dura: si la categoria de ESTA fila no admite el aspecto de la columna,
// la celda va vacia. Y si el valor capturado no esta en la lista oficial,
// tambien va vacia: mandar un valor invalido es peor que no mandar el aspecto,
// porque eBay lo publica tal cual en la ficha.
function clCsvRowV134(fila, cols) {
  var problemas = [];
  var cid = String(fila.categoryId || '');
  var aspectos = fila.aspects || {};

  // Categoría no resuelta o ausente. La fila NO se descarta: se emite con la
  // celda de categoría vacía y todos los aspectos vacíos. Perderla en silencio
  // sería tan malo como rellenarla con un ID inventado.
  var sinCategoria = !clTaxonomyData() || !clTaxonomyData().categorias[cid];
  if (sinCategoria) {
    problemas.push('categoria ' + (cid || '(vacia)') + ' fuera de la taxonomia v134'
      + (fila._taxError ? ' (' + fila._taxError.codigo + ')' : ''));
    cid = '';
  }

  var celdas = ['Add', fila.sku || '', cid, fila.title || ''];

  // ConditionID: solo de una condicion capturada y reconocida. Sin 1000.
  var cond = CL_CONDITION_IDS[fila.condition];
  if (!cond) { problemas.push('condicion no capturada o no reconocida'); cond = ''; }
  celdas.push(cond);

  // Aspectos, en el orden del encabezado.
  for (var i = 0; i < cols.length; i++) {
    var nombre = cols[i].aspecto;
    var v = aspectos[nombre];
    if (sinCategoria) { celdas.push(''); continue; }
    if (v === undefined || v === null || String(v).trim() === '') { celdas.push(''); continue; }
    if (!clAspectValido(cid, nombre, v)) {
      // La categoria no lo admite, o el valor no es oficial. Celda vacia.
      problemas.push(nombre + ': "' + v + '" no es valido en ' + cid);
      celdas.push('');
      continue;
    }
    celdas.push(v);
  }

  // StartPrice: solo el precio capturado. Sin 19.99.
  var precio = clNormalizePrice(fila.price);
  if (!isFinite(precio) || precio <= 0) { problemas.push('precio no capturado'); precio = ''; }
  else precio = precio.toFixed(2);

  celdas = celdas.concat([
    fila.photos || '',
    fila.description || '',
    'FixedPrice', 'GTC', precio, '1', '1', 'Lumberton, NC', '1',
    CL_SHIP_POLICY, CL_RET_POLICY, CL_PAY_POLICY,
    (fila.weightMajor === '' || fila.weightMajor == null) ? '' : fila.weightMajor,
    (fila.weightMinor === '' || fila.weightMinor == null) ? '' : fila.weightMinor
  ]);
  return { celdas: celdas, problemas: problemas };
}

// Condicion capturada -> ConditionID oficial de eBay. Sin entrada por defecto:
// una condicion desconocida deja la celda vacia y se reporta.
var CL_CONDITION_IDS = { NWT: '1000', NWOT: '1500', EXCEL: '3000', GOOD: '3000', FAIR: '3000' };

// CSV completo del lote v134. Devuelve el texto; no descarga nada.
function clBuildCsvV134(filas) {
  var cids = filas.map(function (f) { return String(f.categoryId || ''); });
  var cab = clCsvHeaderV134(cids);
  var lineas = ['Info,Version=1.0.0,Template=fx_category_template_EBAY_US', cab.hdr.map(clCsvQ).join(',')];
  var problemas = [];
  for (var i = 0; i < filas.length; i++) {
    var r = clCsvRowV134(filas[i], cab.cols);
    if (r.problemas.length)
      problemas.push({ sku: filas[i].sku || '(sin SKU)', detalles: r.problemas });
    if (r.celdas) lineas.push(r.celdas.map(clCsvQ).join(','));
  }
  return { csv: lineas.join('\r\n'), columnas: cab.cols, problemas: problemas, filas: filas.length };
}

function clCsvQ(v) {
  v = String(v == null ? '' : v);
  return (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0)
    ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// ── separacion por esquema ─────────────────────────────────────────────────
// Una fila del esquema antiguo no tiene aspectos oficiales porque nunca se le
// pidieron. Convertirla seria inventar. Se exporta con el formato para el que
// fue capturada, en su propio archivo.
function clSepararPorEsquema(sess) {
  var nuevas = [], viejas = [];
  for (var i = 0; i < sess.length; i++)
    (sess[i] && sess[i]._esquema === CL_ESQUEMA_FILA ? nuevas : viejas).push(sess[i]);
  return { nuevas: nuevas, viejas: viejas };
}

// Exportador v134. NO bloquea por problemas de taxonomia: informa y exporta.
// La guardia de precio y el aviso de peso ya corrieron en clExportEbayCSV.
//
// Recibe SOLO las filas del esquema 2. Las antiguas siguen por el camino de
// siempre, dentro de clExportEbayCSV, sin pasar por aqui.
function clExportEbayCSVv134(nuevas, cuantasViejas) {
  if (cuantasViejas) {
    alert(
      '\u2139\ufe0f LOTE MIXTO \u2014 salen DOS archivos\n\n' +
      nuevas.length + ' articulo(s) capturados con la taxonomia oficial v134\n' +
      cuantasViejas + ' articulo(s) del formato anterior\n\n' +
      'Los antiguos NO se convierten: se capturaron sin los aspectos que eBay\n' +
      'pide ahora, y rellenarlos seria inventarlos. Cada grupo sale en su\n' +
      'propio archivo, con el formato que le corresponde.\n\n' +
      'No se borra nada de la sesion.'
    );
  }

  var out = clBuildCsvV134(nuevas);
  if (out.problemas.length) {
    // Informativo. En esta version la exportacion NO se bloquea.
    console.warn('CSV v134 \u2014 celdas omitidas por no ser validas:', out.problemas);
    toast('\u26A0\uFE0F ' + out.problemas.length + ' articulo(s) con aspectos incompletos');
  }
  clEntregarCsv(out.csv, clCsvNombre(nuevas.length, 'v134'), nuevas.length);
  return out;
}

function clCsvNombre(n, sufijo) {
  var now = new Date();
  var stamp = now.toISOString().slice(0, 10) + '-'
    + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
  return 'eBay-FX-' + stamp + '-' + n + 'items' + (sufijo ? '-' + sufijo : '') + '.csv';
}

// Entrega del archivo. Misma via que el camino antiguo: Drive si hay URL, y si
// no, el panel de opciones que ya existe.
function clEntregarCsv(csv, fname, n) {
  if (typeof document === 'undefined') return;
  var driveUrl = localStorage.getItem('cl_drive_url')
    || 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec';
  if (!driveUrl) { clShowExportOptions(csv, fname, n); return; }
  toast('\uD83D\uDCE4 Subiendo a Google Drive...');
  fetch(driveUrl, {
    method: 'POST', mode: 'no-cors',
    body: JSON.stringify({ csv: csv, filename: fname }),
    headers: { 'Content-Type': 'text/plain' }
  })
    .then(function () { clShowExportOptions(csv, fname, n); })
    .catch(function () { clShowExportOptions(csv, fname, n); });
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 6 — BLOQUEO SEGURO DE EXPORTACION v134 (SIGUE DETRAS DEL FLAG APAGADO)
//
// Ninguna de estas funciones se ejecuta con el flag apagado: quedan definidas
// pero clExportEbayCSV solo las llama dentro de `if (clTaxV134())`.
// ═══════════════════════════════════════════════════════════════════════════

// Mismo rango que la guardia de precio que ya existe mas arriba en
// clExportEbayCSV. No se introduce un segundo criterio.
var CL_PRECIO_MIN = 0.99;
var CL_PRECIO_MAX = 499.99;

// Problemas de UNA fila de esquema 2 que impiden exportarla. Junta lo que ya
// detecta clValidateTaxonomyItem (categoria inexistente o vacia, obligatorio
// ausente, aspecto no admitido, valor fuera de la lista oficial, Size en
// calzado, US Shoe Size en ropa, Size Type/Department incompatibles) con lo
// que le corresponde a la fila y no a la categoria: condicion y precio.
function clValidarFilaV134(fila) {
  var problemas = [];

  // Si la categoria nunca se resolvio al capturar, ese es el motivo real.
  if (fila && fila._taxError) {
    problemas.push({
      codigo: fila._taxError.codigo || 'COMBINACION_SIN_RESOLVER',
      aspecto: null,
      mensaje: fila._taxError.mensaje || 'La categoria no se pudo resolver al capturar.'
    });
  }

  var vt = clValidateTaxonomyItem((fila && fila.aspects) || {}, fila && fila.categoryId);
  problemas = problemas.concat(vt.problemas);

  // Condicion: solo una de las reconocidas por CL_CONDITION_IDS. Sin esto el
  // ConditionID de la fila quedaria vacio y eBay rechazaria el listado.
  if (!fila || !fila.condition || !CL_CONDITION_IDS[fila.condition]) {
    problemas.push({
      codigo: 'CONDICION_INVALIDA', aspecto: 'Condition',
      mensaje: 'Condicion ausente o no reconocida: "' + ((fila && fila.condition) || '') + '".'
    });
  }

  // Precio: mismo rango que la guardia de precio existente. Una fila de
  // esquema 2 con precio malo ya se habria detenido alli, pero esto la cubre
  // igual si llegara a saltarse por cualquier motivo.
  var precio = clNormalizePrice(fila && fila.price);
  if (!isFinite(precio) || precio < CL_PRECIO_MIN || precio > CL_PRECIO_MAX) {
    problemas.push({
      codigo: 'PRECIO_INVALIDO', aspecto: 'StartPrice',
      mensaje: 'Precio ausente o fuera de $' + CL_PRECIO_MIN.toFixed(2) + '–$' + CL_PRECIO_MAX.toFixed(2)
        + ': "' + ((fila && fila.price) || '') + '".'
    });
  }

  return problemas;
}

// Valida TODAS las filas de esquema 2 de un lote. [] = el lote puede
// exportarse. Si no, un array agrupado por SKU con TODOS los problemas de
// cada uno -- no solo el primero que se encuentre.
function clValidarLoteV134(filasEsquema2) {
  var porSku = [];
  for (var i = 0; i < filasEsquema2.length; i++) {
    var f = filasEsquema2[i];
    var problemas = clValidarFilaV134(f);
    if (problemas.length) porSku.push({ sku: (f && f.sku) || '(sin SKU)', problemas: problemas });
  }
  return porSku;
}

// Aviso de bloqueo. No borra ni cambia nada: solo informa y deja que la
// persona corrija en la pantalla de revision, donde el panel del PASO 4 ya
// muestra el detalle de cada aspecto.
function clMostrarBloqueoExport(porSku) {
  var totalProblemas = porSku.reduce(function (a, x) { return a + x.problemas.length; }, 0);
  var detalle = porSku.map(function (x) {
    return '• ' + x.sku + ':\n' + x.problemas.map(function (p) {
      return '   – ' + (p.aspecto ? p.aspecto + ': ' : '') + p.mensaje;
    }).join('\n');
  }).join('\n\n');
  alert(
    '🚫 EXPORTACION DETENIDA — ' + porSku.length + ' articulo(s) con '
    + totalProblemas + ' problema(s) de taxonomia\n\n' + detalle +
    '\n\nNo se genero, descargo ni subio ningun archivo. No se envio nada a la ' +
    'hoja de registro. La sesion no se modifico.\n\n' +
    'Corrige estos articulos en Item Info y vuelve a exportar.'
  );
  toast('🚫 Export detenido — ' + porSku.length + ' articulo(s) con problemas de taxonomia');
}

const CL_GENDER_OPTIONS = [
  { id:'mens',   label:"Men's",   icon:'👔' },
  { id:'womens', label:"Women's", icon:'👗' },
  { id:'kids',   label:'Kids',    icon:'👶' },
  { id:'unisex', label:'Unisex',  icon:'🌍' },
];

const CL_TYPE_OPTIONS = [
  { id:'clothing', label:'Ropa', icon:'👕' },
  { id:'shoes',    label:'Zapatos', icon:'👟' },
];

const CL_SHOE_CATS = [
  'Sneakers','Running','Athletic','Basketball','Casual','Dress Shoes',
  'Boots','Ankle Boots','Sandals','Heels','Flats','Loafers','Slip-On',
  'Clogs','Mules','Wedges','Platform','Kids Sneakers','Kids Boots','Other'
];

const CL_SHOE_SIZES_US = [
  '4','4.5','5','5.5','6','6.5','7','7.5','8','8.5',
  '9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','16'
];
const CL_SHOE_SIZES_KIDS = [
  '1C','2C','3C','4C','5C','6C','7C','8C','9C','10C',
  '11C','12C','13C','1Y','2Y','3Y','4Y','5Y','6Y','7Y'
];
const CL_SHOE_DEFECTS = [
  'Scuffs','Sole Wear','Broken Strap','Missing Lace','Toe Box Damage',
  'Insole Worn','Heel Worn','Creasing','Water Damage','Discoloration',
  'Glue Separation','Missing Buckle','Other'
];

const CL_BRANDS = ['Nike','Adidas','Under Armour','Champion','Puma','Reebok','New Balance',
  'Levi\'s','Wrangler','Lee','Gap','Old Navy','H&M','Zara','Forever 21','American Eagle',
  'Hollister','Abercrombie','Calvin Klein','Tommy Hilfiger','Ralph Lauren','Polo Ralph Lauren','Lauren Ralph Lauren','Nautica',
  'Columbia','North Face','Carhartt','Patagonia','Carter\'s','OshKosh','Other'];

const CL_CATS = ['T-Shirt','Shirt','Shacket','Polo','Tank Top','Hoodie','Quarter Zip','Sweatshirt','Sweater',
  'Jacket','Coat','Vest','Pants','Jeans','Shorts','Dress','Skirt',
  'Activewear Top','Activewear Bottom','Swimwear','Scrubs','Other'];

const CL_SIZES_ALPHA = ['XXS','XS','S','M','L','XL','XXL','1X','1XB','3XL','4XL','XLT','2XB','2XLT','3XB','3XLT','4XB','4XLT'];
const CL_SIZES_NUM   = ['28','30','32','34','36','38','40','42','44'];
const CL_SIZES_KIDS  = ['NB','3M','6M','9M','12M','18M','2T','3T','4T','5T','5/6','7/8','10/12','14','14/16','16','18','20'];
const CL_SIZES_SHOES = ['5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','13'];

const CL_COLORS = [
  {name:'Black', hex:'#111'},   {name:'White', hex:'#eee'},   {name:'Gray', hex:'#888'},
  {name:'Navy', hex:'#1a237e'}, {name:'Blue', hex:'#1565c0'}, {name:'Light Blue', hex:'#64b5f6'},
  {name:'Denim', hex:'#4a6fa5'},
  {name:'Red', hex:'#c62828'},  {name:'Pink', hex:'#e91e96'}, {name:'Coral', hex:'#ff6b6b'},
  {name:'Purple', hex:'#6a1b9a'},
  {name:'Green', hex:'#2e7d32'},{name:'Olive', hex:'#827717'},{name:'Yellow', hex:'#f9a825'},
  {name:'Orange', hex:'#e65100'},{name:'Brown', hex:'#4e342e'},{name:'Beige', hex:'#d7ccc8'},
  {name:'Tan', hex:'#d2b48c'},   {name:'Khaki', hex:'#b5a642'},
  {name:'Multicolor', hex:'linear-gradient(135deg,#f00,#0f0,#00f)'},{name:'Other', hex:'#333'}
];

const CL_CONDITIONS = [
  {id:'NWT',   label:'NWT',  sub:'New With Tags'},
  {id:'NWOT',  label:'NWOT', sub:'New Without Tags'},
  {id:'EXCEL', label:'Excellent', sub:'Like new, no flaws'},
  {id:'GOOD',  label:'Good', sub:'Minor wear, clean'},
  {id:'FAIR',  label:'Fair', sub:'Visible wear/flaws'},
];

const CL_STYLES = [
  'Classic', 'Slim', 'Skinny', 'Bootcut', 'Flare', 'Straight', 
  'Distressed', 'Ripped', 'Relaxed', 'Tight', 'Loose', 'Tapered', 'Other'
];


const CL_DEFECTS = ['Missing Button','Small Stain','Large Stain','Tear','Hole',
  'Fading','Pilling','Broken Zipper','Missing Tag','Odor','Hem Damage','Other'];

const PHOTO_SLOTS = [
  {id:'front',  label:'Front',   icon:'👕', hint:'Lay flat, full garment',      required:true},
  {id:'back',   label:'Back',    icon:'🔄', hint:'Full back view',               required:true},
  {id:'tag',    label:'Tag',     icon:'🏷️', hint:'Brand + size tag',            required:true},
  {id:'detail', label:'Detail',  icon:'🔍', hint:'Defects or key details',       required:true},
  {id:'meas1',  label:'Measure 1', icon:'📏', hint:'Measurement with ruler',    required:false},
  {id:'meas2',  label:'Measure 2', icon:'📐', hint:'Second measurement',        required:false},
];

// ── SKU Generator ───────────────────────────────────────────
function clGenSKU() {
  const bPfx = (cl.brand && cl.brand !== 'Other' ? cl.brand : cl.brandCustom||'GEN')
    .replace(/[^a-zA-Z]/g,'').substring(0,3).toUpperCase();
  const pfx = cl.type==='shoes'?'SHO':'CLO';
  const ts  = Date.now().toString().slice(-5);
  return `${pfx}-${bPfx}-${cl.size||'M'}-${ts}`;
}

// ── Step navigation ─────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// 👔 CLOTHING & SHOES MODULE — COMPLETAMENTE INDEPENDIENTE
// Keys propias: cl_rbg_key, cl_photoroom_key
// No comparte estado con Product Scanner
// Si se rompe Scanner, Clothing sigue funcionando y viceversa
// ════════════════════════════════════════════════════════════════

// ── PIXIAN.AI REMOVE BACKGROUND ────────────────────────────
async function removeBackgroundPixian(dataUrl) {
  console.log('🎯 Pixian.ai background removal...');
  toast('🎯 Pixian.ai removing background...');
  
  const pixianKey = 'cGRiNDgyelNxZ2ticzoxNzkxMFN0YXJtbjI3Z2xjMnNlb2gxMm0zamt1UmxMbDE5cGVkYXQxOTdjcWtzZmY=';
  const decodedKey = atob(pixianKey);
  
  const b64 = dataUrl.split(',')[1];
  if (!b64) return null;
  
  try {
    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    
    const fd = new FormData();
    fd.append('image', blob);
    
    const authHeader = 'Basic ' + btoa(decodedKey + ':');
    
    const res = await fetch('https://api.pixian.ai/api/v2/remove-background', {
      method: 'POST',
      headers: {
        'Authorization': authHeader
      },
      body: fd
    });
    
    if (!res.ok) {
      console.error('Pixian.ai error:', res.status);
      return null;
    }
    
    const resultBlob = await res.blob();
    const reader = new FileReader();
    
    return new Promise((resolve) => {
      reader.onload = (e) => {
        const b64Result = e.target.result.split(',')[1];
        console.log('✅ Pixian.ai success');
        resolve('data:image/png;base64,' + b64Result);
      };
      reader.readAsDataURL(resultBlob);
    });
    
  } catch(e) {
    console.error('❌ Pixian.ai error:', e);
    return null;
  }
}

async function clRemoveBackground(dataUrl) {
  console.log('🎬 Clothing background removal: Railway rembg');
  
  try {
    const RAILWAY_API = 'https://savvy-rembg-production.up.railway.app/remove-bg';
    const b64 = dataUrl.split(',')[1]; // Extrae solo la parte base64
    
    if (!b64) {
      clShowBgStatus('❌ Invalid image data', 'var(--dw)');
      return null;
    }
    
    clShowBgStatus('⏳ Processing with rembg...', 'var(--ac)');
    
    const response = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: b64 })
    });
    
    if (!response.ok) {
      clShowBgStatus('❌ Railway API error: ' + response.status, 'var(--dw)');
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.image) {
      clShowBgStatus('✅ Railway rembg — Background removed!', 'var(--sv)');
      return 'data:image/png;base64,' + data.image;
    } else {
      clShowBgStatus('❌ Rembg processing failed', 'var(--dw)');
      return null;
    }
  } catch(error) {
    console.error('Railway remove-bg error:', error);
    clShowBgStatus('❌ Error: ' + error.message, 'var(--dw)');
    return null;
  }
}

function clSaveRbgKey() {
  const v = document.getElementById('cl-rbg-key-in')?.value?.trim();
  if (!v) { toast('⚠️ Enter Remove.bg key for Clothing'); return; }
  localStorage.setItem('cl_rbg_key', v);
  clShowBgStatus('✅ Clothing Remove.bg key saved — no watermark!', 'var(--sv)');
  toast('✅ Saved');
}

function clSavePhotoroomKey() {
  const v = document.getElementById('cl-pr-key-in')?.value?.trim();
  if (!v) { toast('⚠️ Enter PhotoRoom key for Clothing'); return; }
  localStorage.setItem('cl_photoroom_key', v);
  clShowBgStatus('✅ Clothing PhotoRoom key saved as fallback', 'var(--gd)');
  toast('✅ Saved');
}

function clShowBgStatus(msg, color) {
  const el = document.getElementById('cl-bg-status');
  if (!el) return;
  el.textContent = msg;
  el.style.background = color==='var(--sv)'?'rgba(0,230,118,.1)':'rgba(255,171,0,.1)';
  el.style.color = color;
  el.style.display = 'block';
}

async function clTestBgRemoval() {
  const rbgKey = localStorage.getItem('cl_rbg_key') || localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  const prKey  = localStorage.getItem('cl_photoroom_key') || localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  const usingFallback = !localStorage.getItem('cl_rbg_key') && !localStorage.getItem('cl_photoroom_key');
  if (!rbgKey && !prKey) { clShowBgStatus('❌ No API keys configured anywhere. Set up Remove.bg or PhotoRoom.', 'var(--dw)'); return; }
  if (usingFallback) clShowBgStatus('⚠️ Using Scanner keys as fallback. Set Clothing-specific keys above for full independence.', 'var(--gd)');
  clShowBgStatus('⏳ Testing...', 'var(--gd)');
  const testImg = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    const service = rbgKey ? 'removebg' : 'photoroom';
    const key = rbgKey || prKey;
    const r = await fetch(WORKER+'/?action='+service, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ image: testImg, key })
    });
    const d = await r.json();
    clShowBgStatus(
      (d.success || (d.error&&d.error.includes('400')))
        ? '✅ '+( rbgKey?'Remove.bg':'PhotoRoom')+' connected for Clothing!'
        : '❌ Error: '+(d.error||'unknown'),
      (d.success||(d.error&&d.error.includes('400')))?'var(--sv)':'var(--dw)'
    );
  } catch(e) { clShowBgStatus('❌ Connection failed', 'var(--dw)'); }
}

function clGo(step) {
  cl.step = step;
  ['cl-sku','cl-attr','cl-def','cl-photo','cl-review'].forEach((id,i) => {
    const el = $(id);
    if (el) el.classList.toggle('on', i+1 === step);
  });
  document.querySelectorAll('.scr').forEach(s => {
    if (!['cl-sku','cl-attr','cl-def','cl-photo','cl-review'].includes(s.id)) {
      s.classList.remove('on');
    }
  });
  clUpdateProgress(step);
  window.scrollTo(0,0);
}

function clUpdateProgress(step) {
  for (let i=1; i<=5; i++) {
    const dot = $('cl-step-'+i);
    if (!dot) continue;
    dot.className = 'cl-step-dot' + (i < step ? ' done' : i === step ? ' active' : '');
  }
}

// ── Step 1: SKU ─────────────────────────────────────────────
function clRenderSKU() {
  cl = { sku:'', brand:'', brandCustom:'', category:'', size:'L',
    color:'', colorCustom:'', condition:'', defects:[], notes:'', weightLb:'', weightOz:'',
    photos:{ front:null, back:null, tag:null, detail:null, meas1:null, meas2:null }, location:'', step:1 };
  // Update session badge
  clUpdateSessionBadge();

  $('cl-sku').innerHTML = `
    <div class="cl-step-hdr">
      <h2>New Item</h2>
      <p>Create or scan SKU</p>
    </div>
    <div class="cl-prog">${[1,2,3,4,5].map(i=>`<div class="cl-step-dot${i===1?' active':''}" id="cl-step-${i}"></div>`).join('<div class="cl-step-line"></div>')}</div>
    <div class="card" style="margin-top:16px;border:2px solid var(--ac)">
      <div class="lbl" style="color:var(--ac)">📷 SCAN BARCODE — AUTO-FILL FROM eBay</div>
      <p style="font-size:12px;color:var(--mu);margin:4px 0 10px">Scan the tag barcode to auto-fill brand, title & prices</p>
      <div id="cl-barcode-preview" style="display:none;border-radius:8px;overflow:hidden;margin-bottom:8px;background:#000;min-height:180px">
        <div id="cl-barcode-video" style="width:100%"></div>
      </div>
      <div id="cl-barcode-result" style="display:none;background:var(--sf2);border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px"></div>
      <div style="display:flex;gap:8px">
        <button id="cl-scan-btn" onclick="clStartBarcodeScanner()" style="flex:1;padding:12px;background:linear-gradient(135deg,#FF6B35,#E71D36);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">📷 Scan Barcode</button>
        <button id="cl-scan-stop-btn" onclick="clStopBarcodeScanner()" style="display:none;flex:1;padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">⏹ Stop</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input id="cl-upc-manual" class="ui" type="number" placeholder="Or type UPC manually..." style="flex:1;margin:0" oninput="cl.upc=this.value">
        <button onclick="clLookupBarcode(document.getElementById('cl-upc-manual').value)" style="padding:10px 14px;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);cursor:pointer;font-size:13px">🔍</button>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:11px;color:var(--mu);margin-bottom:6px">📋 OR paste eBay listing URL (from eBay app — short links OK)</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="cl-ebay-url" class="ui" type="url" placeholder="https://ebay.io/m/... or ebay.com/itm/..." style="flex:1;margin:0;font-size:13px">
          <button onclick="clLookupEbayURL(document.getElementById('cl-ebay-url').value)" style="padding:10px 14px;background:linear-gradient(135deg,#0064d2,#004b9f);border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap">eBay 🛒</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="lbl">Auto-Generated SKU</div>
      <div id="cl-sku-display" style="font-family:monospace;font-size:18px;font-weight:800;color:var(--ac);margin:8px 0">CLO-GEN-L-00000</div>
      <button class="cl-chip-btn" onclick="clAutoSKU()" style="background:var(--sf2);border:1px solid var(--bd);width:100%;padding:10px;border-radius:8px;color:var(--tx);font-size:13px;cursor:pointer">🔄 Regenerate SKU</button>
    </div>
    <div class="card">
      <div class="lbl">Or enter SKU manually</div>
      <input id="cl-sku-in" class="ui" type="text" placeholder="CLO-NIK-L-12345" style="width:100%;margin-top:6px" oninput="cl.sku=this.value">
    </div>

    <div id="cl-preview-card" style="display:none;background:var(--sf);border:2px solid var(--ac);border-radius:14px;padding:14px;margin-top:12px">
      <div style="font-size:11px;color:var(--ac);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:10px">📝 eBay Listing Preview</div>

      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--mu);margin-bottom:4px">TÍTULO (editable)</div>
        <textarea id="cl-preview-title" style="width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px;font-weight:600;line-height:1.5;resize:none;font-family:inherit;min-height:60px" oninput="cl._ebayTitle=this.value;document.getElementById('cl-title-chars').textContent=this.value.length+'/80 chars'"></textarea>
        <div id="cl-title-chars" style="font-size:10px;color:var(--mu);margin-top:2px">0/80 chars</div>
      </div>

      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--mu);margin-bottom:4px">DESCRIPCIÓN (editable)</div>
        <textarea id="cl-preview-desc" style="width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:12px;line-height:1.6;resize:none;font-family:inherit;min-height:90px" oninput="cl._ebayDesc=this.value"></textarea>
      </div>

      <div style="margin-bottom:4px">
        <div style="font-size:11px;color:var(--mu);margin-bottom:4px">💰 PRECIO DE VENTA (editable)</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:20px;font-weight:800;color:var(--sv)">$</span>
          <input id="cl-preview-price" type="number" step="0.01" min="0.99"
            style="flex:1;background:var(--sf2);border:2px solid var(--sv);border-radius:10px;padding:10px 14px;color:var(--sv);font-size:22px;font-weight:900;text-align:center;outline:none"
            oninput="cl.suggestedPrice=parseFloat(this.value)||0">
          <div style="font-size:11px;color:var(--mu);line-height:1.4">Precio<br>eBay más<br>bajo</div>
        </div>
        <div id="cl-preview-price-note" style="font-size:11px;color:var(--mu);margin-top:4px;text-align:center"></div>
      </div>

      <div style="margin-top:12px;border-top:1px solid var(--bd);padding-top:12px">
        <div style="font-size:11px;color:var(--mu);margin-bottom:6px">🖨️ PRINT LABEL — Zebra ZP450</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span style="font-size:12px;color:var(--mu);white-space:nowrap">PC IP:</span>
          <input id="cl-printer-ip" type="text" placeholder="192.168.1.25" 
            value="${localStorage.getItem('savvy_printer_ip')||''}"
            style="flex:1;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:8px;color:var(--tx);font-size:14px;font-family:monospace"
            oninput="localStorage.setItem('savvy_printer_ip',this.value)">
          <button onclick="clTestPrint()" style="padding:8px 12px;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;color:var(--mu);font-size:12px;cursor:pointer;white-space:nowrap">🧪 Test</button>
        </div>
        <button onclick="clPrintLabel()" style="width:100%;padding:15px;background:linear-gradient(135deg,#00e676,#66bb6a);border:none;border-radius:12px;color:#000;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,230,118,0.3);transition:all 0.2s">
          🖨️ PRINT LABEL
        </button>
        <div id="cl-print-status" style="font-size:12px;text-align:center;margin-top:6px;min-height:16px"></div>
      </div>
    </div>

    <div class="cl-sect" style="margin-top:16px">
      <div class="lbl">ITEM TYPE</div>
      <div style="display:flex;gap:10px;margin-top:8px">
        ${CL_TYPE_OPTIONS.map(t=>`<button class="cl-cond-btn${cl.type===t.id?' sel':''}" onclick="${clTaxV134()?`cl.type='${t.id}';clTaxLimpiarDependientes();clRenderSKU()`:`cl.type='${t.id}';this.closest('div').querySelectorAll('button').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')`}" style="flex:1;padding:16px 8px">
          <div style="font-size:26px;margin-bottom:5px">${t.icon}</div>
          <div class="cond-lbl" style="font-size:13px">${t.label}</div>
        </button>`).join('')}
      </div>
    </div>

    <div class="cl-sect" style="margin-top:12px">
      <div class="lbl">GENDER</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${CL_GENDER_OPTIONS.map(g=>`<button class="cl-cond-btn${cl.gender===g.id?' sel':''}" onclick="${clTaxV134()?`clTaxSetGender('${g.id}');clRenderSKU()`:`cl.gender='${g.id}';this.closest('div').querySelectorAll('button').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')`}" style="flex:1;min-width:60px;padding:14px 8px">
          <div style="font-size:22px;margin-bottom:4px">${g.icon}</div>
          <div class="cond-lbl" style="font-size:12px">${g.label}</div>
        </button>`).join('')}
      </div>
      ${clTaxRenderSelectores()}
    </div>
    <button class="add-btn" onclick="clStep1Next()">Continue →</button>`;
  clAutoSKU();
}

function clAutoSKU() {
  const sku = 'CLO-GEN-L-' + Date.now().toString().slice(-5);
  cl.sku = sku;
  const el = $('cl-sku-display');
  if (el) el.textContent = sku;
}

// ── Barcode Scanner — Clothing Module ─────────────────────────

function clStartBarcodeScanner() {
  const preview = $('cl-barcode-preview');
  const scanBtn = $('cl-scan-btn');
  const stopBtn = $('cl-scan-stop-btn');
  if (!preview || !scanBtn) return;
  preview.style.display = 'block';
  scanBtn.style.display = 'none';
  stopBtn.style.display = 'flex';
  savvyStartScan('cl-barcode-video', (decodedText) => {
    clStopBarcodeScanner();
    clLookupBarcode(decodedText);
  });
}

function clStopBarcodeScanner() {
  const preview = $('cl-barcode-preview');
  const scanBtn = $('cl-scan-btn');
  const stopBtn = $('cl-scan-stop-btn');
  savvyStopScan('cl-barcode-video');
  if (preview) preview.style.display = 'none';
  if (scanBtn) { scanBtn.style.display = 'flex'; scanBtn.style.flex = '1'; }
  if (stopBtn) stopBtn.style.display = 'none';
}

async function clLookupBarcode(upc) {
  if (!upc) return;
  upc = String(upc).trim();
  cl.upc = upc;
  const resultDiv = $('cl-barcode-result');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color:var(--mu)">🔍 Searching for UPC ' + upc + '...</span>';

  try {
    // Llamar al endpoint /search-upc en Railway
    const RAILWAY_URL = 'https://savvy-ebay-prices-production.up.railway.app';
    const res = await fetch(`${RAILWAY_URL}/search-upc?upc=${encodeURIComponent(upc)}`);

    if (!res.ok) {
      resultDiv.innerHTML = '⚠️ Error: ' + res.status + '. Fill in manually below.';
      return;
    }

    const data = await res.json();

    // El backend devuelve { data: {...}, status: 'success' }, no { found, product }
    // Aceptar si hay datos válidos, sin depender únicamente de "status"
    // (las respuestas desde caché pueden no incluir status en algunas versiones del backend)
    if (!data.data || (!data.data.name && !data.data.brand)) {
      resultDiv.innerHTML = '⚠️ Not found. Fill in manually below.';
      return;
    }

    const p = data.data;
    const title = p.name || '';
    const itemPrice = p.ebay_price || 0;
    const shippingPrice = p.ebay_shipping || 0;
    const totalPrice = p.ebay_total || itemPrice;
    const avgPrice = totalPrice || p.amazon_price || p.walmart_price || 0;
    const minPrice = avgPrice;
    const suggestedPrice = p.suggested_price || (avgPrice > 0 ? avgPrice * 0.95 : 19.99);

    // Usar marca de Algopix si viene; si no, detectar del título
    let brand = (p.brand || '').trim();
    const titleLower = title.toLowerCase();
    if (!brand) {
      brand = 'Unknown';
      const commonBrands = ['nike', 'adidas', 'puma', 'reebok', 'under armour', 'gap', 'ralph lauren', 'tommy hilfiger', 'levi', 'levis', 'calvin klein', 'champion', 'carhartt', 'supreme'];
      for (let b of commonBrands) {
        if (titleLower.includes(b)) {
          brand = b.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          break;
        }
      }
    }

    // Auto-detectar categoría del título
    let category = 'Other';
    if (titleLower.includes('jeans') || titleLower.includes('denim')) category = 'Jeans';
    else if (titleLower.includes('pant') || titleLower.includes('trouser')) category = 'Pants';
    else if (titleLower.includes('short')) category = 'Shorts';
    else if (titleLower.includes('dress')) category = 'Dress';
    else if (titleLower.includes('skirt')) category = 'Skirt';
    else if (titleLower.includes('jacket') || titleLower.includes('coat')) category = 'Jacket';
    else if (titleLower.includes('1/4 zip') || titleLower.includes('quarter zip') || titleLower.includes('1/4-zip') || titleLower.includes('half zip') || titleLower.includes('1/2 zip')) category = 'Quarter Zip';
    else if (titleLower.includes('hoodie') || titleLower.includes('hooded')) category = 'Hoodie';
    else if (titleLower.includes('sweatshirt') || titleLower.includes('sweat shirt')) category = 'Sweatshirt';
    else if (titleLower.includes('sweater') || titleLower.includes('pullover')) category = 'Sweater';
    else if (titleLower.includes('tank')) category = 'Tank Top';
    else if (titleLower.includes('sleeveless')) category = 'Sleeveless';
    else if (titleLower.includes('polo')) category = 'Polo';
    else if (titleLower.includes('shacket')) category = 'Shacket';
    else if (titleLower.includes('shirt') || titleLower.includes('tee') || titleLower.includes('t-shirt')) category = 'T-Shirt';
    else if (titleLower.includes('vest')) category = 'Vest';
    else if (titleLower.includes('activewear')) category = 'Activewear';
    else if (titleLower.includes('swimwear') || titleLower.includes('swimsuit') || titleLower.includes('bikini')) category = 'Swimwear';
    else if (titleLower.includes('scrub')) category = 'Scrubs';
    else if (titleLower.includes('sneaker') || titleLower.includes('shoe')) category = 'Sneakers';
    else if (titleLower.includes('boot')) category = 'Boots';

    // Auto-detectar talla del título
    let size = 'One Size';
    const sizePatterns = [
      { regex: /size\s*([xsl]|m|xx?l|lxl|xl|2xl|3xl|4xl)/i, label: (m) => m.toUpperCase() },
      { regex: /([0-9]{1,2})\s*(us|men|women|kid)/i, label: (m) => m },
      { regex: /^([0-9]{1,2})$/, label: (m) => m }
    ];
    for (let pat of sizePatterns) {
      const match = title.match(pat.regex);
      if (match) {
        size = pat.label(match[1]);
        break;
      }
    }

    // Auto-rellenar datos
    // Si la marca viene vacía del backend, extraerla de la primera palabra del título
    if (!brand || brand === 'Unknown' || brand === '') {
      // Extraer la primera palabra del título como marca (suele ser la marca)
      const firstWord = title.split(/\s+/)[0] || '';
      if (firstWord.length > 1 && !/^\d/.test(firstWord)) {
        brand = firstWord;
      }
    }
    // Capitalizar correctamente la marca
    brand = brand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    cl.brand = CL_BRANDS && CL_BRANDS.includes(brand) ? brand : 'Other';
    if (!CL_BRANDS?.includes(brand) && brand !== 'Unknown') cl.brandCustom = brand;
    cl.category = category;
    cl.size = size;

    // Precios
    cl.suggestedPrice = suggestedPrice;
    cl.pricing = { active: { low: minPrice }, sold: { median: avgPrice } };
    cl.pricingBase = { activeLow: minPrice, soldMed: avgPrice };

    // SKU: 3 primeras letras de marca + UPC completo + -1
    const brandCode = brand.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
    const upcFull = upc; // UPC completo (12 dígitos)
    cl.sku = `${brandCode}-${upcFull}-1`;
    const skuDisplay = $('cl-sku-display');
    if (skuDisplay) skuDisplay.textContent = cl.sku;
    const skuIn = $('cl-sku-in');
    if (skuIn) skuIn.value = cl.sku;

    // Mostrar resultado
    const sourceLabel = p.data_source || '';
    // Construir URL de búsqueda en eBay con filtros: Buy It Now, Sort: Price+Shipping lowest
    const ebaySearchUrl = 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(cl.upc)
      + '&LH_BIN=1&_sop=15&LH_ItemCondition=3&_ipg=25';

      resultDiv.innerHTML = `
      <div style="color:#00e676;font-weight:700;margin-bottom:6px">✅ Found! ${sourceLabel}</div>
      <div>🏷️ <strong>Brand:</strong> ${brand}</div>
      <div style="margin:4px 0">📦 ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}</div>
      ${totalPrice > 0 ? `
        <div>💰 <strong>Precio:</strong> $${itemPrice.toFixed(2)} + envío $${shippingPrice.toFixed(2)} = <strong style="color:#00e676">$${totalPrice.toFixed(2)} total</strong></div>
        <div style="font-size:11px;color:var(--mu);margin-top:2px">📊 Precio más bajo en eBay (Buy It Now)</div>
      ` : '<div style="color:var(--mu)">💰 Sin precio disponible (verificar cuota de Algopix)</div>'}
      <div>📏 <strong>Size detected:</strong> ${size}</div>
      <div style="margin-top:4px">🗂️ <strong>Category:</strong> ${category}</div>
      <div style="margin-top:4px">🔖 <strong>SKU:</strong> <span style="font-family:monospace;color:var(--ac)">${cl.sku}</span></div>
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener"
         style="display:block;margin-top:10px;background:#0064d2;border-radius:10px;padding:10px 14px;
                color:#fff;font-weight:700;font-size:13px;text-decoration:none;text-align:center">
        🔍 Ver precio real en eBay →
      </a>
      <div style="margin-top:8px;font-size:11px;color:var(--mu)">✔ Datos pre-llenados → Continúa para confirmar</div>
    `;

  } catch(e) {
    console.error('clLookupBarcode error:', e);
    resultDiv.innerHTML = '❌ Error: ' + e.message;
  }
}

// ── eBay URL Lookup — Clothing Module (soporta short links ebay.io) ──
async function clLookupEbayURL(urlStr) {
  if (!urlStr || !urlStr.trim()) { toast('⚠️ Paste an eBay URL first'); return; }
  urlStr = urlStr.trim();

  var resultDiv = $('cl-barcode-result');
  if (!resultDiv) return;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color:var(--mu)">🔗 Resolving eBay URL...</span>';

  var RAILWAY_URL = 'https://savvy-ebay-prices-production.up.railway.app';
  var itemId = null;

  // Detectar si es short link (ebay.io) — resolverlo via Railway
  var isShortLink = urlStr.includes('ebay.io') || urlStr.includes('ebay.com/itm') === false && !urlStr.match(/\d{10,13}/);

  if (urlStr.includes('ebay.io') || !urlStr.match(/\/itm\//) ) {
    // Es un short link o no tiene /itm/ — resolver via Railway
    try {
      resultDiv.innerHTML = '<span style="color:var(--mu)">🔗 Resolving short link via server...</span>';
      var resolveRes = await fetch(RAILWAY_URL + '/resolve-url?url=' + encodeURIComponent(urlStr));
      if (resolveRes.ok) {
        var resolveData = await resolveRes.json();
        if (resolveData.status === 'success' && resolveData.item_id) {
          itemId = resolveData.item_id;
          resultDiv.innerHTML = '<span style="color:var(--mu)">✅ Short link resolved → Item ' + itemId + ' — loading details...</span>';
        }
      }
    } catch(e) {
      console.warn('resolve-url error:', e.message);
    }
  }

  // Si no se resolvió via servidor, intentar extraer del URL directamente
  if (!itemId) {
    try {
      var u = new URL(urlStr);
      var pathMatch = u.pathname.match(/\/itm\/(?:[^\/]+\/)?(\d{10,13})/);
      if (pathMatch) itemId = pathMatch[1];
      if (!itemId) itemId = u.searchParams.get('item') || u.searchParams.get('itemId');
      if (!itemId) {
        var numMatch = u.pathname.match(/(\d{10,13})/);
        if (numMatch) itemId = numMatch[1];
      }
    } catch(e) {
      var numMatch2 = urlStr.match(/(\d{10,13})/);
      if (numMatch2) itemId = numMatch2[1];
    }
  }

  if (!itemId) {
    resultDiv.innerHTML = '❌ Could not find eBay Item ID.<br><small style="color:var(--mu)">Try copying the link again from eBay app (3 dots → Share → Copy link)</small>';
    return;
  }

  resultDiv.innerHTML = '<span style="color:var(--mu)">🛒 Loading eBay item ' + itemId + '...</span>';

  try {
    var res = await fetch(RAILWAY_URL + '/ebay-item?item_id=' + encodeURIComponent(itemId));
    if (!res.ok) {
      resultDiv.innerHTML = '⚠️ eBay error ' + res.status + '. Fill in manually below.';
      return;
    }
    var json = await res.json();
    if (json.status !== 'success' || !json.data) {
      resultDiv.innerHTML = '⚠️ Item not found. Fill in manually below.';
      return;
    }

    var d = json.data;
    var title = d.title || '';
    var price = d.price || 0;
    var shippingCost = d.shipping_cost || 0;
    var shippingType = d.shipping_type || 'calculated';
    var totalPrice = d.total_price || price;
    var brand = d.brand || '';
    var imageUrl = d.image_url || '';

    // Auto-detectar marca del título si no viene en aspectos
    if (!brand) {
      var tl = title.toLowerCase();
      var knownBrands = ['nike','adidas','puma','reebok','under armour','gap','ralph lauren',
        'tommy hilfiger','levi','levis','calvin klein','champion','carhartt','supreme',
        'zara','h&m','forever 21','old navy','patagonia','north face','columbia'];
      for (var b of knownBrands) {
        if (tl.includes(b)) {
          brand = b.split(' ').map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ');
          break;
        }
      }
    }

    // Auto-detectar categoría
    var category = 'Other';
    var tl2 = title.toLowerCase();
    if (tl2.includes('jeans')||tl2.includes('denim')) category='Jeans';
    else if (tl2.includes('pant')||tl2.includes('trouser')) category='Pants';
    else if (tl2.includes('short')) category='Shorts';
    else if (tl2.includes('dress')) category='Dress';
    else if (tl2.includes('skirt')) category='Skirt';
    else if (tl2.includes('jacket')||tl2.includes('coat')) category='Jacket';
    else if (tl2.includes('hoodie')||tl2.includes('hooded')) category='Hoodie';
    else if (tl2.includes('shirt')||tl2.includes('tee')||tl2.includes('t-shirt')) category='T-Shirt';
    else if (tl2.includes('sweater')||tl2.includes('pullover')) category='Sweater';
    else if (tl2.includes('vest')) category='Vest';
    else if (tl2.includes('sneaker')||tl2.includes('shoe')) category='Sneakers';
    else if (tl2.includes('boot')) category='Boots';

    // Auto-detectar talla
    var size = 'One Size';
    var sizeM = title.match(/\b(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL)\b/i);
    if (sizeM) size = sizeM[1].toUpperCase();

    // Guardar en cl
    cl.upc = itemId;
    cl.brand = (typeof CL_BRANDS !== 'undefined' && CL_BRANDS.includes(brand)) ? brand : 'Other';
    if (brand && brand !== 'Unknown') cl.brandCustom = brand;
    cl.category = category;
    cl.size = size;
    cl.suggestedPrice = price > 0 ? price * 0.85 : 0;
    cl.pricing = { active: { low: price }, sold: { median: price } };
    cl.pricingBase = { activeLow: price, soldMed: price };
    cl.ebayItemId = itemId;
    cl.ebayItemUrl = d.item_url || urlStr;
    if (imageUrl) cl.ebayImageUrl = imageUrl;

    // SKU
    var brandCode = (brand || 'GEN').replace(/[^A-Z0-9]/gi,'').substring(0,3).toUpperCase();
    var catRef = (category||'ITEM').replace(/\s+/g,'-').toUpperCase();
    cl.sku = brandCode + '-' + itemId.slice(-5) + '-' + catRef;
    var skuDisplay = $('cl-sku-display');
    if (skuDisplay) skuDisplay.textContent = cl.sku;
    var skuIn = $('cl-sku-in');
    if (skuIn) skuIn.value = cl.sku;

    resultDiv.innerHTML =
      '<div style="color:#00e676;font-weight:700;margin-bottom:6px">✅ Found on eBay!</div>' +
      (imageUrl ? '<img src="'+imageUrl+'" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-bottom:6px;float:right;margin-left:8px">' : '') +
      '<div>🏷️ <strong>Brand:</strong> ' + (brand||'Unknown') + '</div>' +
      '<div style="margin:4px 0">📦 ' + title.substring(0,80) + (title.length>80?'...':'') + '</div>' +
      '<div style="margin-top:8px;background:var(--sf);border-radius:10px;padding:10px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
          '<span>💰 Item price:</span><strong>$' + price.toFixed(2) + '</strong>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span>🚚 Shipping cost:</span>' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<span style="color:var(--tx)">$</span>' +
            '<input id="cl-shipping-input" type="number" step="0.01" min="0" placeholder="0.00" value="' + (shippingCost > 0 ? shippingCost.toFixed(2) : '') + '"' +
            ' style="width:70px;background:var(--sf2);border:1px solid var(--ac);border-radius:6px;padding:4px 6px;color:var(--tx);font-size:14px;font-weight:700;text-align:right"' +
            ' oninput="clUpdateTotal(' + price + ')">' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--bd);padding-top:6px;display:flex;justify-content:space-between">' +
          '<span style="color:var(--ac);font-weight:800">Total buyer pays:</span>' +
          '<strong id="cl-total-display" style="color:var(--ac);font-size:16px">$' + (shippingCost > 0 ? totalPrice.toFixed(2) : price.toFixed(2)) + '</strong>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--gd);margin-top:6px">👆 Enter the shipping cost from eBay listing above</div>' +
      '<div style="margin-top:6px">📏 <strong>Size:</strong> ' + size + ' &nbsp;|&nbsp; 🗂️ ' + category + '</div>' +
      '<div style="margin-top:4px">🔖 <strong>SKU:</strong> <span style="font-family:monospace;color:var(--ac)">' + cl.sku + '</span></div>' +
      '<div style="clear:both"></div>';

    // ── Llenar tarjeta de preview usando TOTAL (item + shipping) ──
    var ebayTitle = (brand ? brand + ' ' : '') + title.replace(brand, '').trim();
    if (ebayTitle.length > 80) ebayTitle = ebayTitle.substring(0, 77) + '...';
    var ebayDesc = 'Brand: ' + (brand||'Unknown') + '\n' +
      'Item: ' + title + '\n' +
      'Size: ' + size + '\n' +
      'Category: ' + category + '\n' +
      'Condition: New\n\n' +
      'Fast shipping from Lumberton, NC. Ships same business day.\n' +
      '30-day returns accepted.';

    // Precio de venta = 95% del total que paga el comprador en eBay
    // Nosotros ofrecemos FREE shipping → nuestro precio cubre envío
    var salePrice = totalPrice > 0 ? (totalPrice * 0.95).toFixed(2) : '19.99';
    cl._ebayTitle = ebayTitle;
    cl._ebayDesc  = ebayDesc;
    cl.suggestedPrice = parseFloat(salePrice);

    var previewCard  = document.getElementById('cl-preview-card');
    var previewTitle = document.getElementById('cl-preview-title');
    var previewDesc  = document.getElementById('cl-preview-desc');
    var previewPrice = document.getElementById('cl-preview-price');
    var previewNote  = document.getElementById('cl-preview-price-note');
    var titleChars   = document.getElementById('cl-title-chars');
    if (previewCard)  previewCard.style.display = 'block';
    if (previewTitle) previewTitle.value = ebayTitle;
    if (previewDesc)  previewDesc.value  = ebayDesc;
    if (previewPrice) previewPrice.value = salePrice;
    if (titleChars)   titleChars.textContent = ebayTitle.length + '/80 chars';
    if (previewNote) {
      var noteText = 'eBay item $' + price.toFixed(2);
      if (shippingType === 'free') noteText += ' + FREE shipping';
      else if (shippingCost > 0)  noteText += ' + $' + shippingCost.toFixed(2) + ' shipping = $' + totalPrice.toFixed(2) + ' total';
      noteText += ' → tu precio sugerido: $' + salePrice + ' (con envío gratis incluido)';
      previewNote.textContent = noteText;
    }

    clGeneratePreviewTitle(brand, title, category, size, totalPrice);

  } catch(e) {
    console.error('clLookupEbayURL error:', e);
    resultDiv.innerHTML = '❌ Error: ' + e.message;
  }
}

// ── ZEBRA PRINT FUNCTIONS ─────────────────────────────────────
async function clPrintLabel() {
  // Look for IP input in review step first, then Step 1 fallback
  var ipInput = document.getElementById('cl-review-printer-ip') || document.getElementById('cl-printer-ip');
  var statusEl = document.getElementById('cl-review-print-status') || document.getElementById('cl-print-status');
  var ip = (ipInput ? ipInput.value.trim() : '') || localStorage.getItem('savvy_printer_ip') || '';

  if (!ip) {
    if (statusEl) { statusEl.textContent = '⚠️ Enter the PC IP address first'; statusEl.style.color = 'var(--gd)'; }
    if (ipInput) ipInput.focus();
    return;
  }

  // Build title from AI-generated title, or fall back to manual fields
  var sku   = cl.sku || '';
  var title = cl._ebayTitle || cl._reviewTitle || '';
  if (!title) {
    // Build from manual fields — works 100% without eBay lookup
    var parts = [];
    if (cl.brand && cl.brand !== 'Other') parts.push(cl.brand);
    else if (cl.brandCustom) parts.push(cl.brandCustom);
    if (cl.category) parts.push(cl.category);
    if (cl.color)    parts.push(cl.color);
    if (cl.size)     parts.push('Size ' + cl.size);
    if (cl.condition) parts.push(cl.condition);
    title = parts.join(' ');
  }
  if (!title) title = sku; // last resort

  if (!sku) {
    if (statusEl) { statusEl.textContent = '⚠️ No SKU — genera un SKU primero'; statusEl.style.color = 'var(--dw)'; }
    return;
  }

  if (statusEl) { statusEl.textContent = '⏳ Sending to printer...'; statusEl.style.color = 'var(--mu)'; }

  try {
    var res = await fetch('http://' + ip + ':5001/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, sku: sku }),
      signal: AbortSignal.timeout(5000)
    });
    var d = await res.json();
    if (d.status === 'success') {
      if (statusEl) { statusEl.textContent = '✅ Label printed!'; statusEl.style.color = 'var(--sv)'; }
      toast('✅ Label printed on Zebra!');
    } else {
      if (statusEl) { statusEl.textContent = '❌ ' + (d.message || 'Print error'); statusEl.style.color = 'var(--dw)'; }
    }
  } catch(e) {
    if (statusEl) {
      statusEl.textContent = '❌ No se pudo conectar a la PC (192.168.1.25:5001). Verifica que el servidor de impresión esté corriendo.';
      statusEl.style.color = 'var(--dw)';
    }
  }
}

async function clTestPrint() {
  var ipInput = document.getElementById('cl-review-printer-ip') || document.getElementById('cl-printer-ip');
  var statusEl = document.getElementById('cl-review-print-status') || document.getElementById('cl-print-status');
  var ip = ipInput ? ipInput.value.trim() : '';
  if (!ip) { if(statusEl){statusEl.textContent='⚠️ Enter PC IP first';statusEl.style.color='var(--gd)';} return; }
  localStorage.setItem('savvy_printer_ip', ip);
  if (statusEl) { statusEl.textContent = '⏳ Testing...'; statusEl.style.color = 'var(--mu)'; }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('http://' + ip + ':5001/test', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (statusEl) { statusEl.textContent = '❌ Server returned error: ' + res.status; statusEl.style.color = 'var(--dw)'; }
      return;
    }
    const d = await res.json();
    if (statusEl) { statusEl.textContent = '✅ Connected! PC is online.'; statusEl.style.color = 'var(--sv)'; }
  } catch(e) {
    if (statusEl) { 
      const msg = e.name === 'AbortError' ? 'Timeout — PC not responding' : 'Cannot reach PC at ' + ip + ':5001';
      statusEl.textContent = '❌ ' + msg; 
      statusEl.style.color = 'var(--dw)'; 
    }
  }
}

// ── Recalcular total cuando usuario ingresa el envío ──────────
function clUpdateTotal(itemPrice) {
  var shipInput = document.getElementById('cl-shipping-input');
  var totalDisplay = document.getElementById('cl-total-display');
  var previewPrice = document.getElementById('cl-preview-price');
  var previewNote  = document.getElementById('cl-preview-price-note');
  if (!shipInput) return;

  var shipCost = parseFloat(shipInput.value) || 0;
  var total = itemPrice + shipCost;
  var salePrice = (total * 0.95).toFixed(2);

  if (totalDisplay) totalDisplay.textContent = '$' + total.toFixed(2);
  if (previewPrice) previewPrice.value = salePrice;
  if (previewNote)  previewNote.textContent =
    'Item $' + itemPrice.toFixed(2) + ' + shipping $' + shipCost.toFixed(2) +
    ' = $' + total.toFixed(2) + ' total → tu precio: $' + salePrice + ' (con envío gratis)';

  cl.suggestedPrice = parseFloat(salePrice);
}

// ── Generar título SEO con Claude AI para el preview ─────────
async function clGeneratePreviewTitle(brand, title, category, size, price) {
  var apiKey = savvyToken();   // solo se usa como indicador de sesion activa
  var previewTitle = document.getElementById('cl-preview-title');
  var titleChars   = document.getElementById('cl-title-chars');
  if (!apiKey || !previewTitle) return;

  // Indicar que está generando
  previewTitle.style.borderColor = 'var(--gd)';
  previewTitle.style.color = 'var(--gd)';

  var prompt = 'Write a single eBay clothing listing title for this item. MAX 80 characters. Start with brand. End with condition (New or Pre-Owned). No emojis. No quotes.\n\nBrand: ' + (brand||'Unknown') + '\nOriginal title: ' + title + '\nCategory: ' + category + '\nSize: ' + size + '\n\nRespond with ONLY the title text, nothing else.';

  try {
    var r = await savvyClaude({
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var d = await r.json();
    var aiTitle = (d.content && d.content[0] && d.content[0].text || '').trim().substring(0, 80);
    if (aiTitle && aiTitle.length > 10) {
      previewTitle.value = aiTitle;
      if (titleChars) titleChars.textContent = aiTitle.length + '/80 chars';
      cl._ebayTitle = aiTitle;
    }
  } catch(e) { /* silently fail — keep the fallback title */ }

  previewTitle.style.borderColor = 'var(--bd)';
  previewTitle.style.color = 'var(--tx)';
}

function clStep1Next() {
  if (!cl.sku) { toast('❌ Genera o ingresa un SKU'); return; }
  
  // ✅ Validar que haya seleccionado Gender
  if (!cl.gender || cl.gender === '') {
    toast('⚠️ Selecciona el género (Gender)'); return;
  }
  
  clRenderAttr();
  clGo(2);
}

// ── Step 2: Attributes ──────────────────────────────────────
function clRenderAttr() {
  const el = $('cl-attr');

  el.innerHTML = `
    <div class="cl-step-hdr"><h2>Item Info</h2><p>Fast — tap to select</p></div>
    <div class="cl-prog">${[1,2,3,4,5].map(i=>`<div class="cl-step-dot${i<=2?(i<2?' done':' active'):''}" id="cl-step-${i}"></div>`).join('<div class="cl-step-line"></div>')}</div>

    <div class="cl-sect">
      <div class="lbl">BRAND</div>
      <div class="cl-chips" id="brand-chips">
        ${CL_BRANDS.map(b=>`<button class="cl-chip${cl.brand===b?' sel':''}" data-b="${b.replace(/"/g,'&quot;')}" onclick="clSetBrand(this.dataset.b)">${b}</button>`).join('')}
      </div>
      <input id="brand-custom-in" class="ui" type="text" placeholder="Custom brand..." style="display:${cl.brand==='Other'?'block':'none'};width:100%;margin-top:8px" value="${cl.brandCustom}" oninput="cl.brandCustom=this.value">
    </div>

    <div class="cl-sect">
      <div class="lbl">CATEGORY</div>
      <div class="cl-chips" id="cat-chips">
        ${clTaxCategorias().map(c=>`<button class="cl-chip${cl.category===c?' sel':''}" onclick="clSetCat('${c}')">${c}</button>`).join('')}
      </div>
    </div>${clTaxRenderAspectos()}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="inseam-sect" style="display:${['Pants','Jeans','Shorts'].includes(cl.category)?'block':'none'}">
      <div class="lbl">INSEAM (largo de pierna)</div>
      <div class="cl-chips" id="inseam-chips">
        ${clInseamOptions().map(v=>
          '<button class="cl-chip cl-inseam-chip' + (cl.inseam===v?' sel':'') + '" data-v="' + v + '" data-action="inseam">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="dresslength-sect" style="display:${['Dress','Skirt'].includes(cl.category)?'block':'none'}">
      <div class="lbl">DRESS / SKIRT LENGTH</div>
      <div class="cl-chips" id="dresslength-chips">
        ${['Mini','Above Knee','Knee Length','Midi','Maxi','Floor Length'].map(v=>
          '<button class="cl-chip cl-dresslength-chip' + (cl.dressLength===v?' sel':'') + '" data-v="' + v + '" onclick="clSetDressLength(\'' + v + '\')">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="outermaterial-sect" style="display:${['Jacket','Coat','Vest'].includes(cl.category)?'block':'none'}">
      <div class="lbl">OUTER SHELL MATERIAL</div>
      <div class="cl-chips" id="outermaterial-chips">
        ${['Cotton','Polyester','Nylon','Wool','Denim','Leather','Fleece','Down','Synthetic','Other'].map(v=>
          '<button class="cl-chip cl-outermaterial-chip' + ((cl.outerMaterial||'')==='v'?' sel':'') + '" data-v="' + v + '" onclick="clSetOuterMaterial(\'' + v + '\')">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="swimstyle-sect" style="display:${cl.category==='Swimwear'?'block':'none'}">
      <div class="lbl">SWIMWEAR STYLE</div>
      <div class="cl-chips" id="swimstyle-chips">
        ${['Bikini','One-Piece','Tankini','Board Shorts','Swim Trunks','Rash Guard','Cover-Up','Other'].map(v=>
          '<button class="cl-chip cl-swimstyle-chip' + ((cl.swimStyle||'')==='v'?' sel':'') + '" data-v="' + v + '" onclick="clSetSwimStyle(\'' + v + '\')">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="activity-sect" style="display:${['Activewear Top','Activewear Bottom'].includes(cl.category)?'block':'none'}">
      <div class="lbl">ACTIVITY / SPORT</div>
      <div class="cl-chips" id="activity-chips">
        ${['Running','Yoga','Training','Basketball','Soccer','Cycling','Tennis','Swimming','General Fitness','Other'].map(v=>
          '<button class="cl-chip cl-activity-chip' + ((cl.activity||'')==='v'?' sel':'') + '" data-v="' + v + '" onclick="clSetActivity(\'' + v + '\')">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect" id="shoewidth-sect" style="display:${cl.type==='shoes'?'block':'none'}">
      <div class="lbl">SHOE WIDTH</div>
      <div class="cl-chips" id="shoewidth-chips">
        ${['Narrow (AA/A)','Regular (B/M)','Wide (D/W)','Extra Wide (EE/2E)','Extra Wide (EEE/3E)','Not Specified'].map(v=>
          '<button class="cl-chip cl-shoewidth-chip' + ((cl.shoeWidth||'')==='v'?' sel':'') + '" data-v="' + v + '" onclick="clSetShoeWidth(\'' + v + '\')">' + v + '</button>'
        ).join('')}
      </div>
    </div>`}

    ${clTaxV134() ? '' : `<div class="cl-sect">
      <div class="lbl">TALLA</div>
      <div class="cl-size-wrap" id="size-wheel-wrap">
        <div class="wh-fade-top"></div>
        <div class="wh-indicator"></div>
        <div class="wh-fade-bot"></div>
        <div class="wheel-list" id="wheel-list"></div>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:13px;color:var(--mu)">
        Selected size: <strong id="size-display" style="color:var(--ac);font-size:15px">L</strong>
      </div>
      <div id="custom-size-row" style="display:none;margin-top:8px">
        <input class="ui" id="custom-size-in" type="text" placeholder="Custom size (e.g. 6X, 26W, Petite M...)" oninput="cl.size=this.value">
      </div>
    </div>`}

    <div class="cl-sect">
      <div class="lbl">COLOR</div>
      <div class="cl-colors">
        ${CL_COLORS.map(c=>`<button class="cl-color-chip${cl.color===c.name?' sel':''}" onclick="clSetColor('${c.name}')" style="--swatch:${c.hex}" title="${c.name}">
          <span class="swatch"></span><span class="cname">${c.name}</span>
        </button>`).join('')}
      </div>
      <input id="color-custom-in" class="ui" type="text" placeholder="Custom color..." style="display:${cl.color==='Other'?'block':'none'};width:100%;margin-top:8px" value="${cl.colorCustom}" oninput="cl.colorCustom=this.value">
    </div>

    <div class="cl-sect">
    <div class="cl-sect">
      <div class="lbl">STYLE</div>
      <div class="cl-chips" id="style-chips">
        ${CL_STYLES.map(s=>`<button class="cl-chip cl-style-chip${cl.style===s?' sel':''}" data-s="${s}" onclick="clSetStyle('${s}')">${s}</button>`).join('')}
      </div>
    </div>

      <div class="lbl">CONDITION</div>
      <div class="cl-cond-grid">
        ${CL_CONDITIONS.map(c=>`<button class="cl-cond-btn${cl.condition===c.id?' sel':''}" onclick="clSetCond('${c.id}')">
          <div class="cond-lbl">${c.label}</div>
          <div class="cond-sub">${c.sub}</div>
        </button>`).join('')}
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="ag-btn" onclick="clGo(1)" style="flex:1">← Back</button>
      <button class="add-btn" onclick="clStep2Next()" style="flex:2;margin-bottom:0">Continue →</button>
    </div>`;

  // Las ruedas oficiales se construyen despues de insertar el HTML.
  // No altera el HTML: solo rellena los contenedores ya pintados.
  if (clTaxV134()) clTaxInitRuedas();
}




// ── BACKGROUND REMOVAL SERVICES ──────────────────────────────
function savePhotoroomKey() {
  var v = document.getElementById('phroomKeyIn')?.value?.trim();
  if (!v) { toast('⚠️ Enter PhotoRoom API key'); return; }
  localStorage.setItem('photoroom_key', v);
  showRbgStatus('✅ PhotoRoom key saved', 'var(--sv)');
  toast('✅ PhotoRoom key saved');
}

// Usar PhotoRoom primero, luego Remove.bg, luego canvas
async function removeBackground(dataUrl) {
  // Usar keys de productos, con fallback a keys de ropa si no están configuradas
  var prKey  = localStorage.getItem('photoroom_key') || localStorage.getItem('cl_photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  var rbgKey = localStorage.getItem('rbg_key') || localStorage.getItem('cl_rbg_key') || DEFAULT_RBG_KEY;
  var b64    = dataUrl.split(',')[1];
  if (!b64) return null;

  // 1. Intentar PhotoRoom
  if (prKey) {
    try {
      var r = await fetch(WORKER + '/?action=photoroom', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ image: b64, key: prKey })
      });
      var d = await r.json();
      if (d.success && d.image) return 'data:image/png;base64,' + d.image;
    } catch(e) {}
  }

  // 2. Intentar Remove.bg
  if (rbgKey) {
    try {
      var r2 = await fetch(WORKER + '/?action=removebg', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ image: b64, key: rbgKey })
      });
      var d2 = await r2.json();
      if (d2.success && d2.image) return 'data:image/png;base64,' + d2.image;
    } catch(e) {}
  }

  return null; // fallback al canvas (caller manejará esto)
}

async function testBgRemoval() {
  var prKey  = localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  var rbgKey = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  if (!prKey && !rbgKey) {
    showRbgStatus('❌ No API key configured — add PhotoRoom or Remove.bg key above', 'var(--dw)');
    return;
  }
  showRbgStatus('⏳ Testing...', 'var(--gd)');
  var testPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    var service = prKey ? 'photoroom' : 'removebg';
    var key     = prKey || rbgKey;
    var r = await fetch(WORKER+'/?action='+service, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ image: testPng, key })
    });
    var d = await r.json();
    if (d.success || (d.error && (d.error.includes('roi')||d.error.includes('empty')||d.error.includes('400')))) {
      showRbgStatus('✅ ' + (prKey?'PhotoRoom':'Remove.bg') + ' connected and working!', 'var(--sv)');
    } else {
      showRbgStatus('❌ Error: ' + (d.error||'unknown'), 'var(--dw)');
    }
  } catch(e) {
    showRbgStatus('❌ Could not connect — is the Worker deployed?', 'var(--dw)');
  }
}

// ── REMOVE.BG ────────────────────────────────────────────────
function saveRbgKey() {
  const v = document.getElementById('rbgKeyIn')?.value?.trim();
  if (!v) { toast('⚠️ Enter an API key'); return; }
  localStorage.setItem('rbg_key', v);
  showRbgStatus('✅ API Key saved — now test the connection', 'var(--sv)');
  toast('✅ Remove.bg key saved');
}

function showRbgStatus(msg, color) {
  const el = document.getElementById('rbg-status');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = color === 'var(--sv)' ? 'rgba(0,230,118,.1)' : color === 'var(--dw)' ? 'rgba(255,23,68,.1)' : 'rgba(255,171,0,.1)';
  el.style.color = color;
  el.style.border = '1px solid ' + color;
}

async function testRbgConnection() {
  const key = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  if (!key) {
    showRbgStatus('❌ No hay API key guardada — ingresa tu key primero', 'var(--dw)');
    return;
  }
  showRbgStatus('⏳ Testing Remove.bg connection...', 'var(--gd)');
  try {
    // Send a tiny 1x1 white pixel PNG as test
    const testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(WORKER + '/?action=removebg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: testPng, key, test: true })
    });
    const data = await res.json();
    if (data.success) {
      showRbgStatus('✅ Remove.bg connected and working', 'var(--sv)');
    } else if (data.error && (
      data.error.toLowerCase().includes('roi') ||
      data.error.toLowerCase().includes('empty') ||
      data.error.toLowerCase().includes('could not') ||
      data.error.toLowerCase().includes('no subject')
    )) {
      // "ROI region is empty" = conexión OK, imagen de prueba muy pequeña
      showRbgStatus('✅ Connected — Remove.bg working 🎉', 'var(--sv)');
    } else if (data.error && (data.error.includes('402') || data.error.toLowerCase().includes('credit'))) {
      showRbgStatus('⚠️ Connected but no credits — recharge at remove.bg', 'var(--gd)');
    } else if (data.error && (data.error.includes('403') || data.error.toLowerCase().includes('invalid'))) {
      showRbgStatus('❌ Invalid API Key — check at remove.bg/api', 'var(--dw)');
    } else if (data.workerError) {
      showRbgStatus('❌ Worker not updated — deploy new worker.js to Cloudflare', 'var(--dw)');
    } else {
      showRbgStatus('⚠️ Respuesta: ' + (data.error||'sin detalle'), 'var(--gd)');
    }
  } catch(e) {
    showRbgStatus('❌ No se pudo conectar — ¿actualizaste el worker.js en Cloudflare?', 'var(--dw)');
  }
}

// removeBackground: see unified version above (supports PhotoRoom + Remove.bg)

// ── FEEDBACK: sonido + vibración al seleccionar ───────────────
function playTick() {
  // Vibración corta (Android) — iOS ignora silenciosamente
  try { navigator.vibrate && navigator.vibrate(6); } catch(e) {}
  // Tick de audio (funciona en iOS y Android)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.018, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Ruido blanco con decaimiento rápido = click mecánico suave
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    setTimeout(() => { try { ctx.close(); } catch(e){} }, 200);
  } catch(e) {}
}

// ── SIZE WHEEL DRUM ROLL ──────────────────────────────────────
function clInitSizeWheel() {
  // Con el flag encendido manda la rueda oficial (clTaxBuildRueda), que no
  // preselecciona nada. Esta funcion pondria cl.size = 'L' por defecto.
  if (clTaxV134()) return;
  const ALL_SIZES = cl.type==='shoes'
    ? (cl.gender==='kids'||cl.category&&cl.category.toLowerCase().includes('kids')?CL_SHOE_SIZES_KIDS:CL_SHOE_SIZES_US).concat(['Custom'])
    : [
    'XS','S','M','L','XL','XXL','1X','1XB','3XL','4XL',
    'XLT','2XB','2XLT','3XB','3XLT','4XB','4XLT',
    '26','27','28','29','30','31','32','33','34','35','36','38','40','42','44',
    '0-3M','3-6M','6-12M','18-24M','2T','3T','4T','5/6','7/8','10/12','14/16',
    'One Size','Custom'
  ];
  const ITEM_H = 44;
  const PAD = 2;
  const list = document.getElementById('wheel-list');
  const display = document.getElementById('size-display');
  if (!list) return;
  if (!ALL_SIZES.includes(cl.size)) cl.size = 'L';
  let currentIdx = ALL_SIZES.indexOf(cl.size);

  // Build items
  const spacer = '<div style="height:44px;flex-shrink:0"></div>';
  list.innerHTML =
    Array(PAD).fill(spacer).join('') +
    ALL_SIZES.map((s, i) =>
      '<div class="wheel-item' + (i === currentIdx ? ' sel' : '') +
      '" data-idx="' + i + '">' + s + '</div>'
    ).join('') +
    Array(PAD).fill(spacer).join('');

  // Scroll to default WITHOUT animation
  list.scrollTop = currentIdx * ITEM_H;
  if (display) display.textContent = ALL_SIZES[currentIdx];

  // Update selection on every scroll tick — no timer needed
  list.addEventListener('scroll', function() {
    const raw = list.scrollTop / ITEM_H;
    const idx = Math.round(raw);
    const clamped = Math.max(0, Math.min(ALL_SIZES.length - 1, idx));

    if (clamped !== currentIdx) {
      currentIdx = clamped;
      // Update visuals
      list.querySelectorAll('.wheel-item').forEach(function(el, i) {
        el.classList.toggle('sel', i === clamped);
      });
      // Update state immediately
      cl.size = ALL_SIZES[clamped];
      playTick();
      clUpdateSKUDisplay();
      if (display) display.textContent = cl.size;
      // Custom input
      const row = document.getElementById('custom-size-row');
      if (row) row.style.display = cl.size === 'Custom' ? 'block' : 'none';
    }
  }, { passive: true });

  // Tap any item → scroll smoothly to it
  list.addEventListener('click', function(e) {
    const item = e.target.closest('[data-idx]');
    if (!item) return;
    const idx = parseInt(item.getAttribute('data-idx'));
    list.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  });
}


function clSetBrand(b) {
  cl.brand = b;
  cl._ebayTitle = null; cl._ebayDesc = null; // forzar regeneración del título
  if (clTaxV134()) { clRenderAttr(); clUpdateSKUDisplay(); return; }
  clInitSizeWheel();
  document.querySelectorAll('#brand-chips .cl-chip').forEach(el => el.classList.toggle('sel', el.textContent===b));
  const customIn = $('brand-custom-in');
  if (customIn) customIn.style.display = b==='Other'?'block':'none';
  clUpdateSKUDisplay();
}

function clSetCat(c) {
  // Camino nuevo: la categoria manda sobre los aspectos, asi que se poda lo
  // que la nueva hoja ya no admita y se repinta entero. Fotos, SKU, precio,
  // peso y defectos no se tocan.
  if (clTaxV134()) {
    cl.category = c;
    cl._ebayTitle = null; cl._ebayDesc = null;
    clTaxPodarAspectos();
    clRenderAttr();
    return;
  }
  // Initialize INSEAM listeners whenever category changes
  clInitInseamListeners();
  cl.category = c;
  cl._ebayTitle = null; cl._ebayDesc = null; // forzar regeneración del título
  document.querySelectorAll('#cat-chips .cl-chip').forEach(el => el.classList.toggle('sel', el.textContent===c));
  // Inseam — Pants / Jeans / Shorts
  const needsInseam = ['Pants','Jeans','Shorts'].includes(c);
  const inseamSect = document.getElementById('inseam-sect');
  if (inseamSect) inseamSect.style.display = needsInseam ? 'block' : 'none';
  if (!needsInseam) cl.inseam = '';
  // Dress Length — Dress / Skirt
  const needsDL = ['Dress','Skirt'].includes(c);
  const dlSect = document.getElementById('dresslength-sect');
  if (dlSect) dlSect.style.display = needsDL ? 'block' : 'none';
  if (!needsDL) cl.dressLength = '';
  // Outer Material — Jacket / Coat / Vest
  const needsOM = ['Jacket','Coat','Vest'].includes(c);
  const omSect = document.getElementById('outermaterial-sect');
  if (omSect) omSect.style.display = needsOM ? 'block' : 'none';
  if (!needsOM) cl.outerMaterial = '';
  // Swimwear Style
  const needsSW = c === 'Swimwear';
  const swSect = document.getElementById('swimstyle-sect');
  if (swSect) swSect.style.display = needsSW ? 'block' : 'none';
  if (!needsSW) cl.swimStyle = '';
  // Activity
  const needsAct = ['Activewear Top','Activewear Bottom'].includes(c);
  const actSect = document.getElementById('activity-sect');
  if (actSect) actSect.style.display = needsAct ? 'block' : 'none';
  if (!needsAct) cl.activity = '';
  clInitSizeWheel();
}

function clSetOuterMaterial(v) {
  cl.outerMaterial = v;
  document.querySelectorAll('.cl-outermaterial-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===v));
}
function clSetSwimStyle(v) {
  cl.swimStyle = v;
  document.querySelectorAll('.cl-swimstyle-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===v));
}
function clSetActivity(v) {
  cl.activity = v;
  document.querySelectorAll('.cl-activity-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===v));
}
function clSetShoeWidth(v) {
  cl.shoeWidth = v;
  document.querySelectorAll('.cl-shoewidth-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===v));
}

function clSetColor(c) {
  cl.color = c;
  cl._ebayTitle = null; cl._ebayDesc = null; // forzar regeneración del título
  if (clTaxV134()) { clRenderAttr(); return; }
  document.querySelectorAll('.cl-color-chip').forEach(el => el.classList.toggle('sel', el.title===c));
  const customIn = $('color-custom-in');
  if (customIn) customIn.style.display = c==='Other'?'block':'none';
}

function clSetStyle(b) {
  cl.style = b;
  document.querySelectorAll('.cl-style-chip').forEach(el => el.classList.toggle('sel', el.dataset.s===b));
}


// ═══════════════════════════════════════════════════════════════
// iOS INSEAM FIX: Event listeners instead of onclick
// ═══════════════════════════════════════════════════════════════  
function clInitInseamListeners() {
  document.querySelectorAll('[data-action="inseam"]').forEach(btn => {
    btn.addEventListener('touchend', function(e) {
      e.preventDefault();
      clSetInseam(this.dataset.v);
    }, false);
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      clSetInseam(this.dataset.v);
    }, false);
  });
}

function clSetInseam(b) {
  cl.inseam = b;
  document.querySelectorAll('.cl-inseam-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===b));
}

// ── RODILLOS DE PESO (estilo iPhone) ────────────────────────────────────────
// El CSS vive en index.html para el rodillo de talla, pero el de peso es más
// bajo (132px = 3 renglones en vez de 5) para no comerse la pantalla de
// review. Se inyecta una sola vez desde aquí para no tener que tocar
// index.html y meter un segundo deploy.
function clEnsureWeightWheelCSS() {
  if (document.getElementById('clw-css')) return;
  var st = document.createElement('style');
  st.id = 'clw-css';
  st.textContent =
    '.clw-wrap{position:relative;height:132px;background:var(--sf);border-radius:12px;overflow:hidden;border:1px solid var(--bd)}' +
    '.clw-list{height:132px;overflow-y:scroll;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.clw-list::-webkit-scrollbar{display:none}' +
    '.clw-item{height:44px;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--mu);font-weight:400;cursor:pointer;user-select:none}' +
    '.clw-item.sel{color:var(--ac);font-size:26px;font-weight:900}' +
    '.clw-fade-top{position:absolute;top:0;left:0;right:0;height:44px;background:linear-gradient(to bottom,var(--sf) 20%,transparent);pointer-events:none;z-index:2}' +
    '.clw-fade-bot{position:absolute;bottom:0;left:0;right:0;height:44px;background:linear-gradient(to top,var(--sf) 20%,transparent);pointer-events:none;z-index:2}' +
    '.clw-indicator{position:absolute;top:50%;left:8px;right:8px;height:44px;transform:translateY(-50%);border-top:1.5px solid var(--ac);border-bottom:1.5px solid var(--ac);border-radius:8px;pointer-events:none;z-index:3;background:rgba(255,107,0,.04)}';
  document.head.appendChild(st);
}

// Rangos: hasta 20 lb cubre cualquier prenda o par de zapatos con caja.
// Las onzas paran en 15 porque 16 ya es una libra — dejarlo abierto solo
// invita a capturar "0 lb 20 oz".
var CLW_LBS = (function(){ var a=[]; for (var i=0;i<=20;i++) a.push(i); return a; })();
var CLW_OZS = (function(){ var a=[]; for (var i=0;i<=15;i++) a.push(i); return a; })();

// Un solo constructor para los dos rodillos. ITEM_H y PAD replican el
// rodillo de talla: 44px por renglón, y un espaciador arriba y abajo para
// que el primer y el último valor puedan quedar centrados.
function clBuildWheel(listId, values, getVal, setVal) {
  var ITEM_H = 44, PAD = 1;
  var list = document.getElementById(listId);
  if (!list) return;

  var cur = parseInt(getVal(), 10);
  if (isNaN(cur) || values.indexOf(cur) === -1) cur = 0;
  var curIdx = values.indexOf(cur);

  var spacer = '<div style="height:44px;flex-shrink:0"></div>';
  list.innerHTML =
    Array(PAD).fill(spacer).join('') +
    values.map(function(v, i){
      return '<div class="clw-item' + (i === curIdx ? ' sel' : '') + '" data-idx="' + i + '">' + v + '</div>';
    }).join('') +
    Array(PAD).fill(spacer).join('');

  list.scrollTop = curIdx * ITEM_H;

  list.addEventListener('scroll', function() {
    var idx = Math.round(list.scrollTop / ITEM_H);
    idx = Math.max(0, Math.min(values.length - 1, idx));
    if (idx === curIdx) return;
    curIdx = idx;
    list.querySelectorAll('.clw-item').forEach(function(el, i){
      el.classList.toggle('sel', i === idx);
    });
    setVal(String(values[idx]));
    if (typeof playTick === 'function') playTick();
    clUpdateWeightDisplay();
  }, { passive: true });

  // Tocar un número lleva el rodillo hasta él, sin tener que girarlo.
  list.addEventListener('click', function(e) {
    var item = e.target.closest('[data-idx]');
    if (!item) return;
    list.scrollTo({ top: parseInt(item.dataset.idx, 10) * ITEM_H, behavior: 'smooth' });
  });
}

function clUpdateWeightDisplay() {
  var el = document.getElementById('cl-weight-display');
  if (el) el.textContent = clWeightLabel() || '—';
}

function clInitWeightWheels() {
  clEnsureWeightWheelCSS();
  clBuildWheel('clw-lb-list', CLW_LBS,
    function(){ return cl.weightLb; },
    function(v){ cl.weightLb = v; });
  clBuildWheel('clw-oz-list', CLW_OZS,
    function(){ return cl.weightOz; },
    function(v){ cl.weightOz = v; });
  clUpdateWeightDisplay();
}

// Peso total en libras decimales (para la hoja de registro y validaciones).
function clWeightTotalLb() {
  var lb = parseFloat(cl.weightLb) || 0;
  var oz = parseFloat(cl.weightOz) || 0;
  return lb + (oz / 16);
}

// ── PESO EN TEXTO LEGIBLE ("1 lb 5 oz") ─────────────────────────────────────
// 15 ago 2026: la hoja de registro pasa de tres columnas (Peso_LB, Peso_OZ,
// Peso_Total_LB) a una sola, en el formato que el almacén lee de corrido.
// El CSV de eBay NO cambia: File Exchange sigue recibiendo WeightMajor y
// WeightMinor por separado, que es como los exige. Esto es solo para la hoja.
function clWeightLabel() {
  var lb = parseFloat(cl.weightLb) || 0;
  var oz = parseFloat(cl.weightOz) || 0;
  // normalizar: 20 oz → 1 lb 4 oz
  lb += Math.floor(oz / 16);
  oz = oz % 16;
  if (lb <= 0 && oz <= 0) return '';
  if (lb > 0 && oz > 0) return lb + ' lb ' + oz + ' oz';
  if (lb > 0) return lb + ' lb';
  return oz + ' oz';
}

function clSetDressLength(b) {
  cl.dressLength = b;
  document.querySelectorAll('.cl-dresslength-chip').forEach(el => el.classList.toggle('sel', el.dataset.v===b));
}

function clSetCond(c) {
  cl.condition = c;
  document.querySelectorAll('.cl-cond-btn').forEach(el => {
    el.classList.toggle('sel', el.querySelector('.cond-lbl').textContent === CL_CONDITIONS.find(x=>x.id===c)?.label);
  });
}

function clUpdateSKUDisplay() {
  const el = $('cl-sku-display');
  if (!el) return;
  // Si el SKU viene de barcode (tiene UPC largo en el medio), no lo tocamos
  if (cl.upc && cl.sku.includes(cl.upc)) {
    // Solo actualizar la referencia al final si la categoría cambió
    const brandCode = (cl.brand && cl.brand!=='Other' ? cl.brand : cl.brandCustom||'GEN').replace(/[^A-Z0-9]/gi,'').substring(0,3).toUpperCase();
    const catRef    = (cl.category || 'ITEM').replace(/\s+/g,'-').toUpperCase();
    cl.sku = `${brandCode}-${cl.upc}-${catRef}`;
    el.textContent = cl.sku;
    const skuIn = $('cl-sku-in');
    if (skuIn) skuIn.value = cl.sku;
    return;
  }
  // SKU manual/autogenerado — lógica original
  if (cl.sku.startsWith('CLO-')) {
    const bPfx = (cl.brand && cl.brand!=='Other' ? cl.brand : cl.brandCustom||'GEN').replace(/[^a-zA-Z]/g,'').substring(0,3).toUpperCase();
    const ts = cl.sku.split('-').pop();
    cl.sku = `CLO-${bPfx}-${cl.size||'M'}-${ts}`;
    el.textContent = cl.sku;
  }
}

function clStep2Next() {
  // ✅ Campos básicos obligatorios
  if (!cl.brand) { toast('⚠️ Selecciona la marca'); return; }
  if (!cl.category) { toast('⚠️ Selecciona la categoría'); return; }
  if (!cl.condition) { toast('⚠️ Selecciona la condición'); return; }
  
  // ✅ Size es obligatorio
  if (!cl.size || cl.size === 'Size') { 
    toast('⚠️ Selecciona la talla (Size)'); return; 
  }
  
  // ✅ Color es obligatorio (a menos que sea Unknown)
  if (!cl.color || cl.color === 'Color') { 
    toast('⚠️ Selecciona el color'); return; 
  }
  
  // ✅ Style es obligatorio para Jeans, Pants, Shorts, Dress, Skirt
  const needsStyle = ['Jeans','Pants','Shorts','Dress','Skirt'].includes(cl.category);
  if (needsStyle && (!cl.style || cl.style === 'Select style')) {
    toast('⚠️ Selecciona el Style (' + cl.category + ')'); return;
  }
  
  // ✅ Inseam es obligatorio para Jeans, Pants, Shorts
  const needsInseam = ['Jeans','Pants','Shorts'].includes(cl.category);
  if (needsInseam && (!cl.inseam || cl.inseam === '')) {
    toast('⚠️ Ingresa el Inseam'); return;
  }
  
  if (cl.brand === 'Other') cl.brand = cl.brandCustom || 'Other';
  if (cl.color === 'Other') cl.color = cl.colorCustom || 'Other';
  // size kept live in cl.size via wheel
  clUpdateSKUDisplay();
  clRenderDefects();
  clGo(3);
}

// ── Step 3: Defects ─────────────────────────────────────────
function clRenderDefects() {
  $('cl-def').innerHTML = `
    <div class="cl-step-hdr"><h2>Defects</h2><p>Select all that apply</p></div>
    <div class="cl-prog">${[1,2,3,4,5].map(i=>`<div class="cl-step-dot${i<3?' done':i===3?' active':''}" id="cl-step-${i}"></div>`).join('<div class="cl-step-line"></div>')}</div>

    <div class="cl-sect">
      <div class="lbl">DEFECTS (optional — select all that apply)</div>
      <div class="cl-chips" style="margin-top:10px">
        ${(cl.type==='shoes'?CL_SHOE_DEFECTS:CL_DEFECTS).map(d=>`<button class="cl-chip defect${cl.defects.includes(d)?' sel':''}" onclick="clToggleDefect('${d}')">${d}</button>`).join('')}
      </div>
    </div>

    <div class="cl-sect" id="notes-sect" style="margin-top:12px">
      <div class="lbl">ADDITIONAL NOTES</div>
      <textarea id="cl-notes" class="ui" rows="3" placeholder="E.g. small stain on left sleeve, fading on collar..." style="width:100%;resize:none;margin-top:6px;padding:12px;font-size:14px;font-family:inherit">${cl.notes}</textarea>
    </div>

    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="ag-btn" onclick="clGo(2);clRenderAttr()" style="flex:1">← Back</button>
      <button class="add-btn" onclick="clStep3Next()" style="flex:2;margin-bottom:0">Continue →</button>
    </div>`;
}

function clToggleDefect(elOrName) {
  var d = (typeof elOrName === 'string') ? elOrName : elOrName.textContent;
  if (cl.defects.includes(d)) cl.defects = cl.defects.filter(function(x){ return x!==d; });
  else cl.defects.push(d);
  // Update all defect chip buttons visible right now
  document.querySelectorAll('.cl-chip.defect').forEach(function(el) {
    el.classList.toggle('sel', cl.defects.includes(el.textContent));
  });
}

function clStep3Next() {
  cl.notes = $('cl-notes')?.value || '';
  clRenderPhotos();
  clGo(4);
}

// ── Step 4: Photos ──────────────────────────────────────────
function clRenderPhotos() {
  const done = PHOTO_SLOTS.filter(s => cl.photos[s.id]).length;
  $('cl-photo').innerHTML = `
    <div class="cl-step-hdr"><h2>Photos</h2><p>${done}/4 completed — all required</p></div>
    <div class="cl-prog">${[1,2,3,4,5].map(i=>`<div class="cl-step-dot${i<4?' done':i===4?' active':''}" id="cl-step-${i}"></div>`).join('<div class="cl-step-line"></div>')}</div>

    <div class="cl-photo-grid">
      ${PHOTO_SLOTS.map(slot => `
        <div class="cl-photo-slot${cl.photos[slot.id]?' captured':''}" id="slot-${slot.id}" onclick="clTakePhoto('${slot.id}')">
          ${cl.photos[slot.id]
            ? `<img src="${cl.photos[slot.id]}" class="cl-photo-preview">
            <div class="cl-photo-ok">✓</div>
            ${cl.photos[slot.id+'_bg_removed']?'<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);border-radius:6px;padding:2px 6px;font-size:10px;color:var(--sv);white-space:nowrap">🖼 Background removed</div>':''}`
            : `<div class="cl-photo-icon">${slot.icon}</div><div class="cl-photo-label">${slot.label}</div><div class="cl-photo-hint">${slot.hint}</div>`
          }
        </div>`).join('')}
    </div>

    <div class="cl-photo-progress">
      <div class="cl-photo-bar" style="width:${done*25}%"></div>
    </div>
    <div style="text-align:center;font-size:13px;color:var(--mu);margin:8px 0 16px">${done===4?'✅ All photos complete':'Tap each slot to capture photo'}</div>

    <div style="display:flex;gap:10px">
      <button class="ag-btn" onclick="clGo(3);clRenderDefects()" style="flex:1">← Back</button>
      <button class="add-btn" id="cl-photo-next" onclick="clStep4Next()" style="flex:2;margin-bottom:0;opacity:${done===4?1:0.4}">Continue →</button>
    </div>`;
}


// ── WHITE SQUARE WITH AUTO-CROP ──────────────────────────────
// 1. Detect product bounding box (non-transparent pixels)
// 2. Crop to product
// 3. Center on white 1200x1200 canvas with padding
function applyWhiteSquare(dataUrl, size=1600) {
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      console.warn('⏱ applyWhiteSquare timeout — creating fallback white square');
      // Si falla timeout, retorna canvas blanco 400x400 puro
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d').fillStyle = '#FFFFFF';
      c.getContext('2d').fillRect(0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 1.0));
    }, 2000);
    
    const img = new Image();
    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Llenar fondo blanco
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        
        // Detectar bounds del producto
        const tmp = document.createElement('canvas');
        tmp.width = img.width; tmp.height = img.height;
        tmp.getContext('2d').drawImage(img, 0, 0);
        const px = tmp.getContext('2d').getImageData(0, 0, img.width, img.height).data;
        
        let x0=img.width, x1=0, y0=img.height, y1=0;
        for (let y=0; y<img.height; y++) {
          for (let x=0; x<img.width; x++) {
            if (px[(y*img.width+x)*4+3] > 15) {
              if (x<x0) x0=x; if (x>x1) x1=x;
              if (y<y0) y0=y; if (y>y1) y1=y;
            }
          }
        }
        
        // Fallback si no detectó nada
        if (x0>=x1 || y0>=y1) { x0=0; x1=img.width; y0=0; y1=img.height; }
        
        const cropW = x1-x0, cropH = y1-y0;
        const pad = size * 0.06, maxSide = size - pad*2;
        const ratio = Math.min(maxSide/cropW, maxSide/cropH);
        const dW = cropW*ratio, dH = cropH*ratio;
        const dx = (size-dW)/2, dy = (size-dH)/2;
        
        // Dibujar producto centrado sobre fondo blanco
        ctx.drawImage(img, x0, y0, cropW, cropH, dx, dy, dW, dH);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.error('Canvas error:', err);
        // Si hay error, retorna fondo blanco puro
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        c.getContext('2d').fillStyle = '#FFFFFF';
        c.getContext('2d').fillRect(0, 0, size, size);
        resolve(c.toDataURL('image/jpeg', 1.0));
      }
    };
    
    img.onerror = () => {
      clearTimeout(timeoutId);
      console.warn('⚠️ PNG load error — creating white square fallback');
      // Si PNG no carga, retorna canvas blanco
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d').fillStyle = '#FFFFFF';
      c.getContext('2d').fillRect(0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 1.0));
    };
    
    img.src = dataUrl;
  });
}

function clTakePhoto(slotId) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // SIN input.capture → iOS muestra su menú nativo: Fototeca / Tomar foto / Seleccionar archivo
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return resolve();

      const slot = document.getElementById('slot-' + slotId);
      if (slot) slot.innerHTML = '<div style="text-align:center;padding:20px"><div class="sp" style="width:32px;height:32px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--mu)">Processing...</div></div>';

      let dataUrl = await clCompressImage(file, 1600, 0.92);

      // SOLO para FRONT y BACK - procesar con Railway rembg
      if ((slotId === 'front' || slotId === 'back')) {
        console.log('🚂 Starting rembg for ' + slotId);
        if (slot) slot.innerHTML = '<div style="text-align:center;padding:16px"><div class="sp" style="width:28px;height:28px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--gd)">🚂 Railway rembg...</div></div>';

        try {
          const b64 = dataUrl.split(',')[1];
          console.log('📤 Sending to Worker proxy...');
          
          const workerRes = await fetch(WORKER + '/?action=railway_rembg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: b64 })
          });

          console.log('📥 Worker response status: ' + workerRes.status);
          const result = await workerRes.json();
          console.log('📊 Result:', result);

          if (result.success && result.image) {
            console.log('✅ Background removed successfully');
            const pngUrl = 'data:image/png;base64,' + result.image;
            
            if (slot) slot.innerHTML = '<div style="text-align:center;padding:20px"><div class="sp" style="width:28px;height:28px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--gd)">Applying white background...</div></div>';
            
            // Intentar aplicar fondo blanco
            const whiteSquareUrl = await applyWhiteSquare(pngUrl, 1600);
            
            // Si applyWhiteSquare retorna algo vacío o inválido, usa PNG directamente
            if (whiteSquareUrl && whiteSquareUrl.length > 100) {
              dataUrl = whiteSquareUrl;
              console.log('✅ White background applied');
            } else {
              console.warn('⚠️ White background failed, using PNG with transparency');
              dataUrl = pngUrl;  // Fallback a PNG transparente
            }
            
            cl.photos[slotId + '_bg_removed'] = true;
            toast('✅ Background removed!');
          } else {
            console.warn('❌ Result not successful:', result);
            cl.photos[slotId + '_bg_removed'] = false;
            toast('⚠️ Background removal unavailable');
          }
        } catch(err) {
          console.error('❌ Error:', err);
          cl.photos[slotId + '_bg_removed'] = false;
          toast('❌ Error: ' + err.message);
        }
      }

      // 🔑 FIX: Subir a ImgBB y guardar URL (no base64)
      if (slot) slot.innerHTML = '<div style="text-align:center;padding:20px"><div class="sp" style="width:28px;height:28px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--gd)">📤 Uploading to ImgBB...</div></div>';
      
      const imgbbKey = localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY;
      if (imgbbKey) {
        const imgUrl = await clUploadPhotoToImgBB(dataUrl, imgbbKey, slotId);
        if (imgUrl) {
          console.log('✅ ImgBB URL saved:', imgUrl);
          cl.photos[slotId] = imgUrl;
          toast('✅ Photo uploaded to eBay');
        } else {
          console.warn('⚠️ ImgBB upload failed for ' + slotId);
          toast('⚠️ ImgBB failed — checking retry...');
          cl.photos[slotId] = dataUrl; // Fallback a base64
        }
      } else {
        console.warn('⚠️ ImgBB not configured');
        toast('⚠️ Configure ImgBB in Settings ⚙️');
        cl.photos[slotId] = dataUrl; // Fallback a base64
      }
      
      clRenderPhotos();
      resolve();
    };
    input.click();
  });
}

function clCompressImage(file, maxW=900, quality=0.75) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW/img.width, maxW/img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function clStep4Next() {
  const missing = PHOTO_SLOTS.filter(s => s.required && !cl.photos[s.id]).map(s=>s.label);
  if (missing.length) { toast('⚠️ Missing: '+missing.join(', ')); return; }
  clRenderReview();
  clGo(5);
}

// ── Obtener precios de eBay desde Railway ──────────────────
async function getClothingPrice() {
  if (!cl.brand || !cl.category || !cl.size) {
    console.log('Missing required fields for price lookup');
    return;
  }

  cl.pricesLoading = true;
  const priceStatusEl = document.getElementById('cl-prices-status');
  if (priceStatusEl) priceStatusEl.innerHTML = '🔄 Buscando precios en eBay...';

  try {
    const query = `${cl.brand} ${cl.category} ${cl.color || ''}`.trim();
    const url = `https://savvy-ebay-prices-production.up.railway.app/search?q=${encodeURIComponent(query)}&size=${encodeURIComponent(cl.size)}`;
    
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();

    if (data.found && data.stats) {
      cl.clothingPrices = {
        minPrice: data.stats.minPrice,
        avgPrice: data.stats.avgPrice,
        suggestedPrice: data.suggested?.price || (data.stats.avgPrice * 0.75),
        found: true,
        totalListings: data.stats.totalListings
      };

      const priceInput = document.getElementById('cl-price-input');
      if (priceInput && cl.clothingPrices.suggestedPrice > 0) {
        cl.suggestedPrice = cl.clothingPrices.suggestedPrice;
        priceInput.value = cl.clothingPrices.suggestedPrice.toFixed(2);
      }

      if (priceStatusEl) {
        priceStatusEl.innerHTML = `
          <div style="background:rgba(0,230,118,.1);border:1px solid var(--sv);border-radius:8px;padding:10px;margin:10px 0;font-size:12px;line-height:1.6">
            <div style="color:var(--sv);font-weight:700;margin-bottom:6px">✅ Precios encontrados (${cl.clothingPrices.totalListings} active)</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;color:var(--tx)">
              <span><strong>Mínimo:</strong> $${cl.clothingPrices.minPrice.toFixed(2)}</span>
              <span><strong>Promedio:</strong> $${cl.clothingPrices.avgPrice.toFixed(2)}</span>
              <span><strong>Tu precio:</strong> <span style="color:var(--ac);font-weight:800">$${cl.clothingPrices.suggestedPrice.toFixed(2)}</span></span>
            </div>
          </div>
        `;
      }
    } else {
      if (priceStatusEl) {
        priceStatusEl.innerHTML = `<div style="color:var(--mu);font-size:12px;padding:8px">ℹ️ No se encontraron precios en eBay para este item.</div>`;
      }
    }
  } catch (err) {
    console.error('Error fetching prices:', err);
    if (priceStatusEl) {
      priceStatusEl.innerHTML = `<div style="color:var(--dw);font-size:12px;padding:8px">⚠️ Error buscando precios</div>`;
    }
  } finally {
    cl.pricesLoading = false;
  }
}

// ── Step 5: Review & Submit ──────────────────────────────────
function clRenderReview() {
  const condition = CL_CONDITIONS.find(c=>c.id===cl.condition);
  $('cl-review').innerHTML = `
    <div class="cl-step-hdr"><h2>Review & Submit</h2><p>Confirm before saving</p></div>
    <div class="cl-prog">${[1,2,3,4,5].map(i=>`<div class="cl-step-dot${i<5?' done':' active'}" id="cl-step-${i}"></div>`).join('<div class="cl-step-line"></div>')}</div>

    <div class="cl-review-photos">
      ${PHOTO_SLOTS.map(s=>`<img src="${cl.photos[s.id]||''}" class="cl-review-thumb" title="${s.label}">`).join('')}
    </div>

    <div class="card">
      <div class="lbl">SKU</div>
      <div class="val" style="font-family:monospace;font-size:16px;color:var(--ac)">${cl.sku}</div>
    </div>${clTaxRenderInforme()}

    <div class="card" style="border-left:3px solid var(--ac)">
      <div class="lbl" style="color:var(--ac)">📝 eBay SEO Title</div>
      <div id="cl-title-display" style="font-size:14px;font-weight:700;line-height:1.5;min-height:40px;color:var(--tx)">
        <span style="color:var(--mu);font-style:italic">Generating title...</span>
      </div>
      <div style="font-size:10px;color:var(--mu);margin-top:4px" id="cl-title-chars"></div>
    </div>

    <div class="card">
      <div class="lbl">📋 eBay Description</div>
      <div id="cl-desc-display" style="font-size:12px;line-height:1.6;color:var(--tx);min-height:60px">
        <span style="color:var(--mu);font-style:italic">Generating description...</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="lbl">Type &amp; Gender</div>
      <div class="val">${cl.type==='shoes'?'👟 Zapatos':'👕 Ropa'} · ${CL_GENDER_OPTIONS.find(g=>g.id===cl.gender)?.icon||''} ${CL_GENDER_OPTIONS.find(g=>g.id===cl.gender)?.label||cl.gender}</div>
    </div>

    <div style="font-size:11px;color:var(--mu);text-align:center;margin-bottom:6px">Toca cualquier dato para editarlo</div>
    <div style="background:var(--sf2);border-radius:12px;padding:12px;margin-bottom:4px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px;font-weight:800;color:var(--sv)">💰</span>
      <span style="font-size:14px;color:var(--mu)">Precio eBay:</span>
      <span style="font-size:16px;font-weight:800;color:var(--sv)">$</span>
      <input id="cl-price-input" type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" step="0.01" min="0.99" value="${cl.suggestedPrice > 0 ? cl.suggestedPrice.toFixed(2) : '19.99'}"
        style="width:90px;background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:6px;color:var(--tx);font-size:18px;font-weight:800;text-align:center"
        oninput="cl.price=this.value">
    </div>

    <!-- ── PESO DEL ARTÍCULO — RODILLOS ────────────────────────────────
         Dos rodillos estilo iPhone (como el selector de talla y el de
         fecha que ya usa el módulo): uno para libras, otro para onzas.
         Se gira con el dedo y se puede tocar cualquier número para saltar
         a él. Reutiliza el mismo alto de renglón (44px) y el mismo
         comportamiento de scroll-snap que el rodillo de talla, para que
         se sienta igual en toda la app.
         Destinos del peso: WeightMajor/WeightMinor del CSV de eBay (van
         separados, así los exige File Exchange) y una sola celda legible
         "1 lb 5 oz" en la hoja de registro. -->
    <div style="background:var(--sf2);border-radius:12px;padding:12px;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:16px;font-weight:800;color:var(--sv)">⚖️</span>
        <span style="font-size:14px;color:var(--mu)">Peso:</span>
        <strong id="cl-weight-display" style="font-size:16px;color:var(--ac);margin-left:auto">—</strong>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1;min-width:0">
          <div class="clw-wrap">
            <div class="clw-fade-top"></div>
            <div class="clw-indicator"></div>
            <div class="clw-fade-bot"></div>
            <div class="clw-list" id="clw-lb-list"></div>
          </div>
          <div style="text-align:center;margin-top:4px;font-size:12px;color:var(--mu);font-weight:700;letter-spacing:.5px">LB</div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="clw-wrap">
            <div class="clw-fade-top"></div>
            <div class="clw-indicator"></div>
            <div class="clw-fade-bot"></div>
            <div class="clw-list" id="clw-oz-list"></div>
          </div>
          <div style="text-align:center;margin-top:4px;font-size:12px;color:var(--mu);font-weight:700;letter-spacing:.5px">OZ</div>
        </div>
      </div>
    </div>
    <div id="cl-prices-status" style="min-height:20px;margin-bottom:10px"></div>
    <div class="price-row" style="margin-bottom:10px">
      <div class="pc editable" onclick="clOpenSheet('brand')"><div class="lbl">Marca</div><div class="val" style="font-size:14px;font-weight:700">${cl.brand}</div></div>
      <div class="pc editable" onclick="clOpenSheet('category')"><div class="lbl">Category</div><div class="val" style="font-size:13px;font-weight:700">${cl.category}</div></div>
      <div class="pc editable" onclick="clOpenSheet('size')"><div class="lbl">Talla</div><div class="pc-num avg">${cl.size}</div></div>
    </div>

    <div class="price-row" style="margin-bottom:10px">
      <div class="pc editable" onclick="clOpenSheet('color')">
        <div class="lbl">Color</div>
        <div style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:4px">
          <div style="width:16px;height:16px;border-radius:50%;background:${CL_COLORS.find(c=>c.name===cl.color)?.hex||'#888'};border:1px solid var(--bd)"></div>
          <span style="font-size:13px">${cl.color}</span>
        </div>
      </div>
      <div class="pc editable" onclick="clOpenSheet('condition')"><div class="lbl">Condición</div><div class="val" style="font-size:13px;font-weight:700;color:var(--sv)">${condition?.label||cl.condition}</div></div>
      <div class="pc editable" onclick="clOpenSheet('defects')"><div class="lbl">Defects</div><div class="val" style="font-size:12px">${cl.defects.length||'Ninguno'}</div></div>
    </div>

    ${cl.defects.length ? `<div class="card" style="margin-bottom:10px"><div class="lbl">Defects</div><div class="val" style="font-size:13px">${cl.defects.join(' · ')}</div></div>` : ''}
    ${cl.notes ? `<div class="card" style="margin-bottom:10px"><div class="lbl">Notas</div><div class="val" style="font-size:13px">${cl.notes}</div></div>` : ''}

    <div class="card" style="margin-bottom:10px">
      <div class="lbl">📍 Product Location</div>
      <div style="margin-top:6px">${cl.location ? locBadgeHTML(cl.location,'clothing') : locEmptyHTML('clothing')}</div>
    </div>

    <div id="cl-submit-status" style="min-height:20px;margin-bottom:10px;text-align:center;font-size:13px;color:var(--mu)"></div>

    <div class="card" style="margin-bottom:14px;border:2px solid #00e676;background:rgba(0,230,118,0.05)">
      <div style="font-size:12px;color:#00e676;text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:10px">🖨️ IMPRIMIR ETIQUETA — Zebra ZP450</div>
      <div style="font-size:12px;color:var(--mu);margin-bottom:8px">SKU: <span style="font-family:monospace;font-weight:800;color:var(--ac)">${cl.sku}</span></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;color:var(--mu);white-space:nowrap">PC IP:</span>
        <input id="cl-review-printer-ip" type="text" placeholder="192.168.1.25"
          value="${localStorage.getItem('savvy_printer_ip')||''}"
          style="flex:1;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:8px;color:var(--tx);font-size:14px;font-family:monospace"
          oninput="localStorage.setItem('savvy_printer_ip',this.value)">
        <button onclick="clTestPrint()" style="padding:8px 12px;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;color:var(--mu);font-size:12px;cursor:pointer;white-space:nowrap">🧪 Test</button>
      </div>
      <button onclick="clPrintLabel()" style="width:100%;padding:15px;background:linear-gradient(135deg,#00e676,#66bb6a);border:none;border-radius:12px;color:#000;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,230,118,0.3);transition:all 0.2s">
        🖨️ PRINT LABEL — Put on Bag
      </button>
      <div id="cl-review-print-status" style="font-size:12px;text-align:center;margin-top:6px;min-height:16px"></div>
    </div>

    <button class="add-btn" id="cl-complete-btn" onclick="clSubmit()">✅ COMPLETAR LISTING</button>
    <button class="ag-btn" onclick="clGo(4);clRenderPhotos()" style="margin-top:8px">← Back</button>`;

  // Armar los rodillos de peso (libras y onzas)
  clInitWeightWheels();

  // Generar título y descripción con Claude AI + precios eBay
  setTimeout(() => {
    clGenerateEbayTitle();
    getClothingPrice();
  }, 150);
}



// Generar título y descripción eBay para ropa usando Claude AI
async function clGenerateEbayTitle() {
  const apiKey = savvyToken();   // solo se usa como indicador de sesion activa
  const titleEl = document.getElementById('cl-title-display');
  const descEl  = document.getElementById('cl-desc-display');
  const charsEl = document.getElementById('cl-title-chars');

  if (cl._ebayTitle) {
    if (titleEl) { titleEl.textContent = cl._ebayTitle; if(charsEl) charsEl.textContent = cl._ebayTitle.length + '/80 chars'; }
    if (descEl && cl._ebayDesc) descEl.innerHTML = cl._ebayDesc;
    return;
  }

  if (!apiKey) {
    if (titleEl) titleEl.textContent = buildClothingTitle();
    if (descEl)  descEl.innerHTML = buildClothingDesc();
    return;
  }

  const condition = CL_CONDITIONS.find(c=>c.id===cl.condition);
  const condText = clCondText();
  const gdrText = cl.gender==='mens'?"Men's":cl.gender==='womens'?"Women's":cl.gender==='kids'?"Kids":cl.gender||'';
  const colorText = cl.color && cl.color!=='Unknown' ? cl.color : '';
  const defectsLine = cl.defects.length ? cl.defects.join(', ') : 'none';

  const prompt = `You are an expert eBay clothing seller. Write rich, detailed descriptions.

Item: ${cl.brand} ${cl.category} | ${colorText} | Size ${cl.size} | ${gdrText} | ${condText}
Defects: ${defectsLine}

Return ONLY valid JSON with NO newlines in values:
{
  "title": "[Brand] [Item] [Color] Size [Size] [Gender] [Condition] - 75-80 chars",
  "opening": "Compelling 5-6 sentence pitch for brand, style, material, condition, occasions. Include why this item is valuable. Write as ONE continuous sentence.",
  "condition": "${condText}. Describe tags, wear, fabric quality in 2-3 sentences as ONE line.",
  "defects": "${defectsLine}",
  "shipping": "Ships fast from Lumberton NC. Most within 1 business day.",
  "returns": "30-day returns. Buyer satisfaction priority.",
  "disclaimer": "Review photos carefully. All items 100% authentic."
}`;

  // Use detailed descriptions built with JavaScript
  cl._ebayTitle = buildClothingTitle();
  cl._ebayDesc = buildClothingDesc();

  if (titleEl) { titleEl.textContent = cl._ebayTitle; if(charsEl) charsEl.textContent = cl._ebayTitle.length + '/80 chars'; }
  if (descEl) descEl.innerHTML = cl._ebayDesc;
}

function buildClothingDescHTML(obj) {
  let h = '';
  if (obj.opening)    h += '<p><strong>' + (cl.brand||'Item') + '</strong><br>' + obj.opening + '</p>';
  if (obj.condition)  h += '<p><strong>Condition:</strong><br>' + obj.condition + '</p>';
  if (obj.defects && obj.defects !== 'none' && obj.defects !== 'No defects') h += '<p><strong>Defects:</strong><br>' + obj.defects + '</p>';
  if (obj.shipping)   h += '<p><strong>Shipping:</strong><br>• Ships fast from Lumberton, NC<br>• Most orders within 1 business day<br>• Fast handling and tracking</p>';
  if (obj.returns)    h += '<p><strong>Returns:</strong><br>• 30-day returns accepted<br>• Buyer satisfaction priority</p>';
  if (obj.disclaimer) h += '<p><strong>Disclaimer:</strong><br>' + obj.disclaimer + '</p>';
  return h || buildClothingDesc();
}

// Condición en texto legible
function clCondText() {
  const map = { NWT:'New With Tags', NWOT:'New Without Tags', EXCEL:'Excellent Used', GOOD:'Good Used', FAIR:'Fair Used' };
  return map[cl.condition] || cl.condition || 'Used';
}
function clCondShort() {
  const map = { NWT:'NWT', NWOT:'NWOT', EXCEL:'Excellent', GOOD:'Good Used', FAIR:'Fair' };
  return map[cl.condition] || cl.condition || 'Used';
}

// Fallback title sin AI — optimizado para 80 chars
function buildClothingTitle() {
  const cond  = clCondShort();
  const gdr   = cl.gender==='mens'?"Men's":cl.gender==='womens'?"Women's":cl.gender==='kids'?"Boys/Girls":cl.gender||'';
  // ⚠️ CORREGIDO (15 ago 2026): antes solo se filtraba 'Unknown', así que un
  // color marcado como "Other" se colaba al título — CLO-RAL-18MONTHS-41921
  // salió como "Ralph Lauren Jacket Other Size 18 MONTHS Boys/Girls NWOT".
  // Se usa el MISMO helper que la fila del CSV para que nunca se separen.
  const _c = clCleanColor(cl.color);
  const color = _c ? _c + ' ' : '';
  const parts = [cl.brand, cl.category, color + 'Size ' + cl.size, gdr, cond].filter(Boolean);
  let t = parts.join(' ').replace(/\s+/g,' ').trim();
  // ⚠️ BUG CORREGIDO (14 ago 2026): antes decía !t.includes('NWT'), pero
  // "NWOT" NO contiene la cadena "NWT" (N-W-O-T ≠ N-W-T), así que a un
  // artículo marcado NWOT se le pegaba " NWT" al final y el título quedaba
  // "... Women's NWOT NWT" — sin etiquetas Y con etiquetas a la vez, y
  // contradiciendo el ConditionID 1500. Le pasó a CLO-LAU-XS-62033.
  // Ahora solo se agrega si la condición REALMENTE es NWT y no está ya puesto.
  if (t.length < 75 && cl.condition === 'NWT' && !/\bNWT\b/.test(t)) t += ' NWT';

  // ── RELLENO DEL TÍTULO HASTA ~80 CARACTERES ──────────────────────────────
  // eBay permite 80 caracteres y los usa TODOS para hacer match con las
  // búsquedas. Los títulos salían en 53–65, desperdiciando 15–27 caracteres
  // de posicionamiento gratis. Se agregan atributos que YA tenemos capturados,
  // en orden de valor de búsqueda, y solo si caben completos. No se inventa
  // nada: si el dato no existe, no se agrega.
  var _extras = [];
  if (typeof clSizeType === 'function' && clSizeType() !== 'Regular') _extras.push(clSizeType());
  if (cl.inseam && !/^(unspecified|unknown|n\/a)$/i.test(String(cl.inseam))) _extras.push(cl.inseam + ' Inseam');
  if (cl.dressLength) _extras.push(cl.dressLength);
  if (cl.outerMaterial) _extras.push(cl.outerMaterial);
  if (cl.activity) _extras.push(cl.activity);
  if (cl.style && cl.style !== 'Classic') _extras.push(cl.style);
  // La forma larga de la condición es muy buscada ("new without tags"),
  // pero solo si sobra espacio suficiente para escribirla completa.
  var _condLong = cl.condition === 'NWOT' ? 'New Without Tags'
                : cl.condition === 'NWT'  ? 'New With Tags' : '';
  if (_condLong) _extras.push(_condLong);

  for (var _i = 0; _i < _extras.length; _i++) {
    var _cand = String(_extras[_i]).trim();
    if (!_cand) continue;
    // no repetir algo que ya aparece en el título
    if (t.toLowerCase().indexOf(_cand.toLowerCase()) !== -1) continue;
    if ((t + ' ' + _cand).length <= 80) t += ' ' + _cand;
  }

  return t.substring(0,80);
}

function buildClothingDesc() {
  const brand = cl.brand || 'Item';
  const category = cl.category || 'Clothing';
  const color = (cl.color || '').toLowerCase();
  const size = cl.size || 'One Size';
  const cond = clCondText();
  
  // ── APERTURA BASADA EN DATOS REALES ──────────────────────────────────────
  // ⚠️ 15 ago 2026: la apertura era relleno genérico idéntico para todo:
  // "Perfect for collectors and everyday wear" en un sweatshirt de niño, y
  // "excellent condition" contradiciendo el ConditionID de New Without Tags.
  // Ahora se arma con los atributos que SÍ tenemos capturados (los mismos que
  // van en el título y en los item specifics), para que descripción, título y
  // specifics digan lo mismo. Nada inventado: si el dato no existe, no se
  // menciona.
  var _det = [];
  if (clCleanColor(cl.color)) _det.push('Color: ' + clCleanColor(cl.color));
  if (cl.size) _det.push('Size: ' + cl.size);
  if (typeof clSizeType === 'function' && clSizeType() !== 'Regular') _det.push('Size Type: ' + clSizeType());
  if (cl.inseam && !/^(unspecified|unknown|n\/a)$/i.test(cl.inseam)) _det.push('Inseam: ' + cl.inseam);
  if (cl.dressLength) _det.push('Length: ' + cl.dressLength);
  if (cl.outerMaterial) _det.push('Outer Shell: ' + cl.outerMaterial);
  if (cl.activity) _det.push('Activity: ' + cl.activity);

  var _who = cl.gender === 'mens'   ? "men's"
           : cl.gender === 'womens' ? "women's"
           : cl.gender === 'kids'   ? "kids'" : '';

  let opening = `Authentic ${brand} ${_who} ${category}`.replace(/\s+/g,' ').trim() + '. ';
  if (_det.length) opening += _det.join(' · ') + '. ';
  opening += `${cond}. Backed by fast same-business-day handling from our Lumberton, NC warehouse `;
  opening += `and a 30-day return window. See all photos for exact condition and fit.`;
  
  let condition = `${cond}. `;
  if(cl.condition === 'NWT') condition += `Original tags attached, never worn. Perfect pristine condition. Stored properly with no flaws, shrinkage, or damage. `;
  else if(cl.condition === 'NWOT') condition += `Never worn or tried on. Perfect condition without tags. No wear marks or defects. `;
  else condition += `Gently used, well maintained. No major flaws or damage. `;
  condition += `Ready to wear immediately.`;
  
  // ⚠️ BUG CORREGIDO (15 ago 2026): cl.defects es un ARRAY, no un string.
  // Un arreglo vacío [] es TRUTHY en JavaScript, y [] !== 'none' también es
  // true, así que la condición vieja siempre pasaba. El resultado en el CSV
  // era "<strong>Defects:</strong><br>Defects: " — la etiqueta duplicada y
  // sin contenido (le pasó a CLO-POL-1XB-47263). Ahora se valida largo real
  // y se quita el prefijo repetido.
  var _defList = Array.isArray(cl.defects)
    ? cl.defects.filter(function(d){ return d && d !== 'none' && d !== 'No defects'; })
    : (cl.defects && cl.defects !== 'none' && cl.defects !== 'No defects' ? [cl.defects] : []);
  let defects = _defList.length ? _defList.join(', ') : '';
  
  let html = `<p><strong>${brand} ${category} - ${color} Size ${size}</strong><br>${opening}</p>`;
  html += `<p><strong>Condition:</strong><br>${condition}</p>`;
  if(defects) html += `<p><strong>Defects:</strong><br>${defects}</p>`;
  html += `<p><strong>Shipping:</strong><br>Ships fast from Lumberton, NC. Most orders ship within 1 business day. Fast handling and tracking provided.</p>`;
  html += `<p><strong>Returns:</strong><br>30-day returns accepted. Buyer satisfaction is our priority.</p>`;
  html += `<p><strong>Disclaimer:</strong><br>Please review all photos carefully before purchasing. All items are 100% authentic.</p>`;
  
  return html;
}



// ── IMGBB PHOTO HOSTING (Clothing module) ─────────────────────
function saveDriveUrl() {
  var url = document.getElementById('drive-url-input').value.trim();
  if (!url || !url.includes('script.google.com')) {
    document.getElementById('drive-status').textContent = '⚠️ URL inválida';
    return;
  }
  localStorage.setItem('cl_drive_url', url);
  document.getElementById('drive-status').textContent = '✅ URL guardada';
}

// ============================================
// IndexedDB para persistencia real
// ============================================

const DB_NAME = 'SavvyConfig';
const STORE_NAME = 'imgbb_config';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function saveToIndexedDB(key, value) {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Error saving to IndexedDB:', err);
    return false;
  }
}

async function getFromIndexedDB(key) {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error reading from IndexedDB:', err);
    return null;
  }
}


async function clSaveImgbbKey() {
  const v = document.getElementById('imgbb-key-in')?.value?.trim();
  if (!v) { toast('⚠️ Enter ImgBB API key'); return; }
  
  const savedLocally = await saveToIndexedDB('imgbb_key', v);
  localStorage.setItem('cl_imgbb_key', v);
  
  if (savedLocally) {
    document.getElementById('imgbb-status').textContent = '⏳ Sincronizando...';
  } else {
    console.warn('IndexedDB save failed');
  }
  
  try {
    const res = await fetch('https://savvy-config-production.up.railway.app/api/imgbb-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: v })
    });
    
    if (res.ok) {
      document.getElementById('imgbb-status').textContent = '✅ ImgBB key guardada (IndexedDB + Railway)';
      toast('✅ Guardada');
    } else {
      document.getElementById('imgbb-status').textContent = '✅ Guardada en IndexedDB (Railway offline)';
      toast('✅ Guardada en IndexedDB');
    }
  } catch (err) {
    document.getElementById('imgbb-status').textContent = '✅ Guardada en IndexedDB';
    toast('✅ Guardada en IndexedDB');
  }
}

async function clTestImgbbKey() {
  const key = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
  if (!key) { toast('⚠️ No ImgBB key configured'); return; }
  const statusEl = document.getElementById('imgbb-status');
  if (statusEl) statusEl.textContent = '🔄 Testing ImgBB key...';
  // Create a tiny 1x1 red pixel as test image
  const canvas = document.createElement('canvas'); canvas.width=1; canvas.height=1;
  canvas.getContext('2d').fillStyle='red'; canvas.getContext('2d').fillRect(0,0,1,1);
  const testImg = canvas.toDataURL('image/jpeg', 0.5);
  const result = await clUploadPhotoToImgBB(testImg, key);
  if (result) {
    if (statusEl) statusEl.textContent = '✅ ImgBB key WORKS — ' + result.substring(0,40) + '...';
    toast('✅ ImgBB key is working!');
  } else {
    if (statusEl) statusEl.textContent = '❌ ImgBB key FAILED — check the key in imgbb.com';
    toast('❌ ImgBB key failed — check settings');
  }
}

async function clUploadPhotoToImgBB(dataUrl, key, slotName) {
  try {
    const b64 = dataUrl ? dataUrl.split(',')[1] : null;
    if (!b64) { console.warn('ImgBB: no image data'); return null; }
    const fd  = new FormData();
    fd.append('key', key);
    fd.append('image', b64);
    fd.append('name', (slotName || 'photo') + '-' + Date.now() + '.jpg');
    const res = await fetch('https://api.imgbb.com/1/upload', { method:'POST', body: fd });
    const d   = await res.json();
    console.log('ImgBB response:', JSON.stringify(d).substring(0,200));
    if (d.success) {
      let imgUrl = d.data.image?.url || d.data.display_url || d.data.url;
      if (imgUrl && !imgUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
        imgUrl += '.jpg';
      }
      console.log('ImgBB upload OK:', imgUrl);
      return imgUrl;
    } else {
      const errMsg = d.error?.message || JSON.stringify(d.error) || 'unknown error';
      console.error('ImgBB upload failed:', errMsg);
      toast('⚠️ ImgBB error: ' + errMsg);
      return null;
    }
  } catch(e) {
    console.error('ImgBB network error:', e.message);
    toast('⚠️ ImgBB network error: ' + e.message);
    return null;
  }
}

async function clUploadAllPhotos() {
  const key = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
  if (!key) return null;
  const urls = [];
  const slots = ['front','back','tag','detail','meas1','meas2'];
  for (const s of slots) {
    if (cl.photos[s]) {
      var photoVal = cl.photos[s];
      var url;
      // Si ya es URL pública (subida al capturar), úsala directo — no re-subir
      if (typeof photoVal === 'string' && photoVal.startsWith('https://')) {
        url = photoVal;
        console.log('✅ Reusing existing ImgBB URL for ' + s + ':', url.substring(0,60));
      } else {
        // Es base64 (fallback cuando ImgBB falló al capturar) — subir ahora
        url = await clUploadPhotoToImgBB(photoVal, key, s);
        console.log('📤 Uploaded base64 photo for ' + s + ':', url ? url.substring(0,60) : 'FAILED');
      }
      if (url) urls.push(url);
    }
  }
  return urls.length > 0 ? urls.join('|') : null;
}

// ── EBAY PREFILL TEMPLATE EXPORT ──────────────────────────────
// Columnas: SKU | Photo URLs | Title | Category | Aspects
function clBuildAspects() {
  const condMap = { NWT:'New with tags', NWOT:'New without tags', EXCEL:'Used - Excellent', GOOD:'Used - Good', FAIR:'Used - Acceptable' };
  const dept = clDept(); // mismo helper que clBuildEbayRow — antes divergían
  const parts = [
    cl.brand                               ? 'Brand='      + cl.brand                        : '',
    cl.size                                ? 'Size='       + cl.size                         : '',
    cl.color && cl.color!=='Unknown'       ? 'Color='      + cl.color                        : '',
    cl.condition                           ? 'Item Condition=' + (condMap[cl.condition]||cl.condition) : '',
    dept                                   ? 'Department=' + dept                             : '',
    cl.type==='shoes'                      ? 'Type=Shoes'  : cl.category ? 'Type=' + cl.category : '',
  ].filter(Boolean).filter(function(p){ return p.indexOf('=') === -1 || p.split('=')[1].trim() !== ''; });
  return parts.join('|');
}

function clBuildEbayCategory() {
  const map = {
    'Dress':'Dresses','Jeans':'Jeans','Pants':'Pants','Shorts':'Shorts',
    'T-Shirt':'T-Shirts','Shirt':'Shirts','Jacket':'Jackets & Coats',
    'Hoodie':'Hoodies & Sweatshirts','Sweater':'Sweaters','Sweatshirt':'Hoodies & Sweatshirts','Quarter Zip':'Hoodies & Sweatshirts',
    'Shoes':'Shoes','Sneakers':'Athletic Shoes','Boots':'Boots',
    'Skirt':'Skirts','Coat':'Jackets & Coats','Blouse':'Tops & Blouses',
    'Tank Top':'Tops & Blouses','Sleeveless':'Tops & Blouses','Vest':'Jackets & Coats',
    'Polo':'Shirts','Shacket':'Shirts','Activewear':'Activewear','Activewear Top':'Tops & Blouses','Activewear Bottom':'Pants',
    'Swimwear':'Swimwear','Scrubs':'Scrubs',
  };
  return map[cl.category] || cl.category || '';
}

function clGetEbayCategoryId() {
  // eBay category IDs for US clothing
  const m = cl.gender === 'mens' ? {
    'Jeans':11483,'Pants':57989,'Shorts':15689,'T-Shirt':15687,
    'Shirt':57990,'Jacket':57988,'Coat':57988,'Vest':15691,'Hoodie':155183,'Sweatshirt':155183,'Quarter Zip':155183,
    'Shacket':57990,
    'Sweater':11484,'Shoes':93427,'Sneakers':15709,'Boots':11498,
    'Dress':15687,'Skirt':15687,'Blouse':57990,'Tank Top':15687,'Sleeveless':15687,
    'Polo':57990,'Activewear':137084,'Activewear Top':137085,'Activewear Bottom':137086,'Swimwear':15690,'Scrubs':11516,
  } : cl.gender === 'kids' ? {
    'Jeans':57989,'Pants':57989,'Dress':3009,'T-Shirt':3008,
    'Shirt':3008,'Shoes':57929,'Tank Top':3008,'Sleeveless':3008,'Vest':3008,'Shacket':3008,'Quarter Zip':3008,
    'Polo':3008,'Activewear':3008,'Activewear Top':3008,'Activewear Bottom':3008,'Swimwear':3008,'Scrubs':3008,
  } : {
    'Dress':63861,'Jeans':11554,'Pants':63863,'Shorts':11555,
    'T-Shirt':53159,'Shirt':53159,'Blouse':53159,'Jacket':63862,'Vest':63862,'Shacket':53159,
    'Coat':63862,'Hoodie':155183,'Sweatshirt':155183,'Sweater':63866,'Skirt':63864,'Quarter Zip':155183,
    'Shoes':55793,'Sneakers':15709,'Boots':53557,'Tank Top':53159,'Sleeveless':53159,
    'Polo':53159,'Activewear':185079,'Activewear Top':185082,'Activewear Bottom':185081,'Swimwear':63867,'Scrubs':11516,
  };
  return m[cl.category] || (cl.gender==='mens' ? 57990 : 53159);
}

function clGetConditionId() {
  return {NWT:1000, NWOT:1500, EXCEL:3000, GOOD:3000, FAIR:3000}[cl.condition] || 1000;
}

// ── HELPERS COMPARTIDOS: Department y Color ─────────────────────────────────
// ⚠️ 15 ago 2026: el Department se calculaba en DOS lugares con lógica
// distinta. clBuildAspects() (línea ~5033) sí contemplaba 'kids' → 'Boys',
// pero clBuildEbayRow() NO, y todo lo que no fuera mens/womens caía en
// 'Unisex Adults'. Por eso CLO-POL-18-20-88866 salió con el título diciendo
// "Boys/Girls" y el item specific diciendo "Unisex Adults" — se contradicen,
// y en una categoría de niños "Unisex Adults" ni siquiera es un valor válido.
// Ahora los dos caminos llaman a la MISMA función.
// ── SIZE TYPE INFERIDO DE LA TALLA ──────────────────────────────────────────
// ⚠️ 15 ago 2026: sizeType estaba clavado en 'Regular' para TODO. Pero
// CLO-POL-4XLT-58999 es talla 4XLT (4X Large **Tall**) y salió como "Regular".
// eBay usa este aspecto como filtro de búsqueda: un comprador que filtra
// "Big & Tall" nunca ve ese short, aunque sea exactamente lo que busca.
// Solo se cambia cuando la talla lo indica claramente; si hay duda, Regular.
function clSizeType() {
  var s = String(cl.size || '').trim();
  if (!s) return 'Regular';
  // Hombre: tallas Tall terminan en LT/XT (LT, XLT, 2XLT, 4XLT) y las Big
  // terminan en XB o dígito+B (1XB, 2XB). Ojo: el patrón tiene que mirar la
  // letra ANTERIOR a la T/B, no solo la última — "4XLT" termina en "LT".
  if (cl.gender === 'mens' && (/(?:L|X)T$/i.test(s) || /(?:X|\d)B$/i.test(s) || /\b(tall|big)\b/i.test(s))) return 'Big & Tall';
  // Mujer: 1X/2X/3X/4X o tallas numéricas con W (14W, 16W) = Plus
  if (cl.gender === 'womens' && /^[0-9]X$|^[3-9]XL$|^\d{1,2}W$|\bplus\b/i.test(s)) return 'Plus';
  return 'Regular';
}

// ── OPCIONES DE INSEAM SEGÚN LA PRENDA ──────────────────────────────────────
// ⚠️ 15 ago 2026: el selector ofrecía SOLO 28"–36", que son largos de
// pantalón. Para shorts eso es imposible — un short mide 5"–13". Las
// muchachas no tenían más remedio que escoger un valor falso, y los dos
// shorts del lote de las 08:14 se publicaron con Inseam 30". Eso no es un
// detalle cosmético: es una medida incorrecta en la ficha, y por ahí entran
// las devoluciones y los reclamos de "no coincide con la descripción".
function clInseamOptions() {
  return cl.category === 'Shorts'
    ? ['5"','7"','9"','11"','13"','Unspecified']
    : ['28"','29"','30"','31"','32"','33"','34"','36"','Unspecified'];
}

function clDept() {
  return cl.gender === 'mens'   ? 'Men'
       : cl.gender === 'womens' ? 'Women'
       : cl.gender === 'kids'   ? 'Boys'
       : 'Unisex Adults';
}

// Un solo criterio de "color de relleno", usado en el título y en el CSV.
// Antes el título filtraba una lista y la fila del CSV solo filtraba 'Unknown',
// así que un color "Other" se colaba a un lado y al otro no.
function clCleanColor(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s || /^(unknown|other|unspecified|n\/a|none|varios|multi)$/i.test(s)) return '';
  // ⚠️ BUG CORREGIDO (17 ago 2026): antes solo se ponía en mayúscula la
  // PRIMERA letra y el resto se dejaba tal cual. Con "navy blue" funcionaba,
  // pero "RED BLACK" seguía gritado — salió así en el título y en el item
  // specific de CLO-LAU-XS-51360 y CLO-POL-2XB-45469. Faltaba bajar el resto
  // de la palabra a minúsculas.
  return s.replace(/\b[a-záéíóúñ][\wáéíóúñ]*/gi, function(w, i){
    if (i > 0 && /^(and|y|with|con|de|of)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

// ── NORMALIZACIÓN Y GUARDIA DE PRECIO ───────────────────────────────────────
// 🔴 15 ago 2026: CLO-POL-8-10-36763 se publicó en **$2,999.00** (ItemID
// 336743794627). El valor del input viajaba CRUDO al CSV, sin normalizar ni
// validar: se escribió "2999" en vez de "29.99" y nadie lo detuvo. En iOS el
// teclado decimal también puede meter coma ("29,99"), que rompe el número.
// Un error de un punto decimal deja el artículo invisible y, si alguien lo
// compra, es un problema serio. Ahora se normaliza y se valida antes de salir.
function clNormalizePrice(v) {
  var s = String(v == null ? '' : v).trim();
  s = s.replace(/[$\s]/g, '');
  // coma decimal → punto (el teclado en español mete coma)
  if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
  s = s.replace(/[^0-9.]/g, '');
  var n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

function clBuildEbayRow(photoUrls) {
  const title = cl._ebayTitle || buildClothingTitle();
  const desc  = document.getElementById('cl-desc-display') ? document.getElementById('cl-desc-display').innerHTML : '';
  const dept  = clDept();
  const priceEl = document.getElementById('cl-price-input');
  return {
    sku:        cl.sku || '',
    photos:     photoUrls || '',
    title:      title,
    category:   clBuildEbayCategory ? clBuildEbayCategory() : cl.category || '',
    categoryId: clGetEbayCategoryId ? clGetEbayCategoryId() : '63861',
    conditionId:clGetConditionId ? clGetConditionId() : 1000,
    aspects:    clBuildAspects(),
    brand:      cl.brand || '',
    sizeType:   clSizeType(),
    size:       cl.size || '',
    department: dept,
    color:      clCleanColor(cl.color),
    style:      cl.style || '',
    inseam:     cl.inseam || '',
    dressLength:cl.dressLength || '',
    outerMaterial: cl.outerMaterial || '',
    swimStyle:  cl.swimStyle || '',
    activity:   cl.activity || '',
    shoeWidth:  cl.shoeWidth || '',
    type:       cl.category || '',
    description:desc || ('<p>' + title + '</p><p>Ships fast from Lumberton, NC.</p>'),
    price:      (function(){ var n = clNormalizePrice(priceEl ? priceEl.value : ''); return isFinite(n) ? n.toFixed(2) : ''; })(),
    location:   'Lumberton, NC',
    warehouseLocation: cl.location || '',
    // ── PESO (15 ago 2026) ───────────────────────────────────────────────
    // eBay File Exchange lo quiere partido: WeightMajor = libras enteras,
    // WeightMinor = onzas restantes. Se guarda también el total decimal
    // para la hoja de registro y para ShipStation.
    weightMajor: (function(){ var t = clWeightTotalLb(); return t > 0 ? Math.floor(t) : ''; })(),
    weightMinor: (function(){
      var t = clWeightTotalLb(); if (!(t > 0)) return '';
      var maj = Math.floor(t), min = Math.round((t - maj) * 16);
      return min === 16 ? 0 : min;
    })(),
    weightTotalLb: (function(){ var t = clWeightTotalLb(); return t > 0 ? t.toFixed(2) : ''; })(),
    weightLabel: clWeightLabel(),
  };
}

// Extensión del esquema 2. Se aplica SOLO con el flag encendido y solo AÑADE
// campos: los planos que ya consume clSendToRegistroSheet quedan como están.
//
// ⚠️ Con el flag encendido la fila se marca SIEMPRE como esquema 2, incluso si
// la categoría no se resuelve. Marcarla solo cuando hay categoría dejaba una
// puerta trasera: una fila capturada con el flag encendido pero sin combinación
// válida caía al CSV antiguo y salía con categoría 63861, Size Type 'Regular' y
// precio 19.99 sin que nadie se enterara. Eso es exactamente lo que este paso
// existe para impedir. Si no hay categoría, la fila sigue por el camino v134
// con categoryId vacío y el problema queda registrado.
function clAmpliarFilaV134(row) {
  if (!clTaxV134()) return row;
  row._esquema  = CL_ESQUEMA_FILA;
  row.condition = cl.condition || '';          // la condición capturada, sin traducir

  var r = clResolveLeaf(clTaxSeleccion());
  if (!r.ok) {
    row.categoryId   = '';                     // vacío, nunca un ID de relleno
    row.categoryRuta = '';
    row.aspects      = {};                     // sin valores inventados
    row._taxError    = { codigo: r.codigo, mensaje: r.mensaje };
    return row;
  }
  row.categoryId   = r.categoryId;             // hoja oficial, sin fallback
  row.categoryRuta = r.ruta;
  row.aspects      = clTaxBuildItem(cl, r.categoryId);
  return row;
}

// Guardar en sesión para export masivo
function clSaveToSession(row) {
  let session = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
  // Evitar duplicados por SKU
  session = session.filter(r => r.sku !== row.sku);
  session.push(row);
  localStorage.setItem('cl_ebay_session', JSON.stringify(session));
  console.log('Saved to eBay session:', row.sku, 
    'photos:', row.photos ? row.photos.substring(0,50)+'...' : 'EMPTY',
    'total items:', session.length);
  return session.length;
}

function clGetSessionCount() {
  return JSON.parse(localStorage.getItem('cl_ebay_session') || '[]').length;
}

function clClearSession() {
  // Borrar COMPLETAMENTE todo
  localStorage.removeItem('cl_ebay_session');
  clBulk = [];
  // Actualizar badge a 0
  const fabN = document.getElementById('cl-fab-n');
  if (fabN) fabN.textContent = '0';
  const fab = document.getElementById('cl-fab');
  if (fab) fab.classList.remove('on');
  // Cerrar cualquier modal abierto
  document.querySelectorAll('div[style*="position:fixed"]').forEach(el => el.remove());
  toast('🗑 Sesión borrada — lista para nueva sesión');
  clUpdateClFAB();
}

function clUpdateSessionBadge() {
  const n = clGetSessionCount();
  const el = document.getElementById('cl-session-badge');
  if (el) el.textContent = n > 0 ? n + ' items ready to export' : '';
  // Also update the FAB badge
  clUpdateClFAB();
}

// Exportar CSV — función SÍNCRONA para que navigator.share funcione en iOS Safari
// Debug: show exactly what's in the eBay session
function clPreviewSession() {
  const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
  if (!sess.length) { alert('Session is empty — scan a garment first'); return; }
  let info = 'SESSION: ' + sess.length + ' item(s)\n\n';
  sess.forEach(function(r, i) {
    info += '--- #' + (i+1) + ' ' + r.sku + ' ---\n';
    info += 'Photos: ' + (r.photos ? r.photos.substring(0,80) : '⚠️ EMPTY') + '\n';
    info += 'Title: '  + (r.title  || '⚠️ EMPTY') + '\n';
    info += 'Cat: '    + (r.category || '⚠️ EMPTY') + '\n';
    info += 'Aspects: '+ (r.aspects ? r.aspects.substring(0,80) : '⚠️ EMPTY') + '\n\n';
  });
  alert(info.substring(0, 2500));
}

// OLD EXPORT REMOVED — see clExportEbayCSV FX below
function clShowCsvFallback(csv, fname, blob) {
  // Detect iOS Safari — skip download attempt (doesn't work), go straight to overlay
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      toast('✅ Downloading: ' + fname);
      return;
    } catch(e) {}
  }

  // iOS fallback: show overlay with copy + email options
  const safeCSV = csv.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const emailHref = 'mailto:?subject=' + encodeURIComponent('eBay Listings') +
                    '&body=' + encodeURIComponent(csv.substring(0, 1800));
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;display:flex;flex-direction:column;padding:16px;gap:10px;overflow-y:auto';
  overlay.innerHTML =
    '<div style="color:#fff;font-size:17px;font-weight:800">📋 Get the CSV</div>'
   +'<div style="color:#aaa;font-size:12px">Option 1: Copy → paste in an email to yourself → save as .csv on Mac</div>'
   +'<button id="copybtn" style="background:var(--sv);border:none;border-radius:10px;padding:14px;color:#000;font-weight:800;font-size:15px;cursor:pointer">📋 Copy CSV to Clipboard</button>'
   +'<a href="' + emailHref + '" style="display:block;background:#1a73e8;border-radius:10px;padding:14px;color:#fff;font-weight:800;font-size:15px;text-align:center;text-decoration:none">📧 Open in Mail App</a>'
   +'<div style="color:#aaa;font-size:12px">Or copy manually from below:</div>'
   +'<textarea id="csv-ta" style="background:#111;color:#0f0;font-family:monospace;font-size:9px;border:1px solid #333;border-radius:8px;padding:8px;min-height:120px;resize:vertical">' + safeCSV + '</textarea>'
   +'<button onclick="this.parentElement.remove()" style="background:none;border:1px solid #444;border-radius:10px;padding:10px;color:#888;cursor:pointer;font-size:14px">Close</button>';
  document.body.appendChild(overlay);

  document.getElementById('copybtn').onclick = function() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(csv).then(function(){
        toast('✅ Copied! Paste in email to yourself');
      }).catch(function(){
        var ta = document.getElementById('csv-ta');
        if (ta) { ta.select(); document.execCommand('copy'); toast('✅ Copied!'); }
      });
    } else {
      var ta = document.getElementById('csv-ta');
      if (ta) { ta.select(); document.execCommand('copy'); toast('✅ Copied!'); }
    }
  };
  setTimeout(function(){
    var ta = document.getElementById('csv-ta'); if(ta){ta.focus();ta.select();}
  }, 300);
}


// ── QUICK-EDIT SHEET ──────────────────────────────────────
function clOpenSheet(field) {
  const ov    = document.getElementById('cl-sheet-ov');
  const title = document.getElementById('cl-sheet-title');
  const body  = document.getElementById('cl-sheet-body');
  const labels = { brand:'Cambiar Marca', category:'Cambiar Category', size:'Cambiar Talla', color:'Cambiar Color', condition:'Cambiar Condición', defects:'Defects y Notas', notes:'Notas' };
  title.textContent = labels[field] || 'Editar';
  ov.classList.add('on');   // ← FIX: abrir el sheet

  if (field === 'brand') {
    body.innerHTML = '<div class="cl-chips">' + CL_BRANDS.map(function(b) {
      var safeBrand=b.replace(/"/g,'&quot;');return '<button class="cl-chip' + (cl.brand===b?' sel':'') + '" data-b="'+safeBrand+'" onclick="cl.brand=this.dataset.b;cl._ebayTitle=null;cl._ebayDesc=null;clUpdateSKUDisplay();clCloseSheet();clRenderReview()">' + b + '</button>';
    }).join('') + '</div>';

  } else if (field === 'category') {
    body.innerHTML = '<div class="cl-chips">' + CL_CATS.map(function(c) {
      return '<button class="cl-chip' + (cl.category===c?' sel':'') + '" onclick="cl._ebayTitle=null;cl._ebayDesc=null;cl.category=\'' + c + '\';clCloseSheet();clRenderReview()">' + c + '</button>';
    }).join('') + '</div>';

  } else if (field === 'size') {
    body.innerHTML =
      '<div class="cl-size-wrap"><div class="wh-fade-top"></div><div class="wh-indicator"></div><div class="wh-fade-bot"></div><div class="wheel-list" id="sheet-wheel-list"></div></div>' +
      '<div style="text-align:center;margin:10px 0 4px;font-size:13px;color:var(--mu)">Selected size: <strong id="sheet-size-lbl" style="color:var(--ac);font-size:15px">' + cl.size + '</strong></div>' +
      '<button class="add-btn" id="sheet-size-confirm" onclick="cl._ebayTitle=null;cl._ebayDesc=null;clCloseSheet();clRenderReview()" style="margin-top:8px">✓ Confirmar talla</button>';
    setTimeout(function() { clInitSheetWheel(); }, 40);

  } else if (field === 'color') {
    body.innerHTML = '<div class="cl-colors">' + CL_COLORS.map(function(c) {
      return '<button class="cl-color-chip' + (cl.color===c.name?' sel':'') + '" onclick="cl._ebayTitle=null;cl._ebayDesc=null;cl.color=\'' + c.name + '\';clCloseSheet();clRenderReview()" style="--swatch:' + c.hex + '" title="' + c.name + '"><span class="swatch"></span><span class="cname">' + c.name + '</span></button>';
    }).join('') + '</div>';

  } else if (field === 'condition') {
    body.innerHTML = '<div class="cl-cond-grid">' + CL_CONDITIONS.map(function(c) {
      return '<button class="cl-cond-btn' + (cl.condition===c.id?' sel':'') + '" onclick="cl.condition=\'' + c.id + '\';clCloseSheet();clRenderReview()"><div class="cond-lbl">' + c.label + '</div><div class="cond-sub">' + c.sub + '</div></button>';
    }).join('') + '</div>';
  } else if (field === 'defects') {
    var chips = CL_DEFECTS.map(function(d) {
      var sel = cl.defects.includes(d) ? ' sel' : '';
      return '<button class="cl-chip defect' + sel + '" onclick="clToggleDefect(this)">' + d + '</button>';
    }).join('');
    body.innerHTML = '<div class="cl-chips" id="defect-chips">' + chips + '</div>' +
      '<div style="margin-top:14px"><div class="lbl" style="margin-bottom:6px">NOTAS</div>' +
      '<textarea id="sheetNotes" class="ui" rows="2" style="width:100%;resize:none;padding:10px;font-size:14px;font-family:inherit" placeholder="Notas adicionales...">' + (cl.notes||'') + '</textarea></div>' +
      '<button class="add-btn" onclick="clSaveDefects()" style="margin-top:10px">✓ Guardar</button>';
  }
}
function clSaveDefects(){var el=document.getElementById("sheetNotes");if(el)cl.notes=el.value;clCloseSheet();clRenderReview();}

function clSheetOvClick(e) {
  if (e.target === document.getElementById('cl-sheet-ov')) clCloseSheet();
}
function clCloseSheet() {
  document.getElementById('cl-sheet-ov').classList.remove('on');
}

// Size wheel inside the sheet (uses different list ID)
function clInitSheetWheel() {
  const ALL_SIZES = [
    'XS','S','M','L','XL','XXL','1X','1XB','3XL','4XL',
    'XLT','2XB','2XLT','3XB','3XLT','4XB','4XLT',
    '26','27','28','29','30','31','32','33','34','35','36','38','40','42','44',
    '0-3M','3-6M','6-12M','18-24M','2T','3T','4T','5/6','7/8','10/12','14/16',
    'One Size','Custom'
  ];
  const ITEM_H = 44, PAD = 2;
  const list = document.getElementById('sheet-wheel-list');
  const lbl  = document.getElementById('sheet-size-lbl');
  const confirm = document.getElementById('sheet-size-confirm');
  if (!list) return;
  if (!ALL_SIZES.includes(cl.size)) cl.size = 'L';
  let curIdx = ALL_SIZES.indexOf(cl.size);
  const spacer = '<div style="height:44px;scroll-snap-align:none"></div>';
  list.innerHTML =
    Array(PAD).fill(spacer).join('') +
    ALL_SIZES.map(function(s,i) {
      return '<div class="wheel-item' + (i===curIdx?' sel':'') + '" data-idx="' + i + '">' + s + '</div>';
    }).join('') +
    Array(PAD).fill(spacer).join('');
  list.scrollTop = curIdx * ITEM_H;
  list.addEventListener('scroll', function() {
    const idx = Math.max(0, Math.min(ALL_SIZES.length-1, Math.round(list.scrollTop/ITEM_H)));
    if (idx !== curIdx) {
      curIdx = idx;
      list.querySelectorAll('.wheel-item').forEach(function(el,i){ el.classList.toggle('sel', i===idx); });
      cl.size = ALL_SIZES[idx];
      playTick();
      if (lbl) lbl.textContent = cl.size;
      if (confirm) confirm.textContent = '✓ Confirmar ' + cl.size;
      clUpdateSKUDisplay();
    }
  }, { passive: true });
  list.addEventListener('click', function(e) {
    const item = e.target.closest('[data-idx]');
    if (item) list.scrollTo({ top: parseInt(item.getAttribute('data-idx'))*ITEM_H, behavior:'smooth' });
  });
}


// ── Submit ───────────────────────────────────────────────────
async function clSubmit() {
  if (cl.submitting) return;

  // ── Validate inseam for bottom garments ───────────────────
  const needsInseam = ['Pants','Jeans','Shorts'].includes(cl.category);
  if (needsInseam && !cl.inseam) {
    toast('⚠️ Selecciona el Inseam antes de guardar');
    const inseamSect = document.getElementById('inseam-sect');
    if (inseamSect) inseamSect.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }

  cl.submitting = true;
  const btn = $('cl-complete-btn');
  const status = $('cl-submit-status');
  if (btn) btn.textContent = '⏳ Saving...';

  const listing = {
    sku: cl.sku,
    brand: cl.brand,
    category: cl.category,
    size: cl.size,
    color: cl.color,
    condition: cl.condition,
    defects: cl.defects,
    notes: cl.notes,
    photos: cl.photos,
    location: cl.location||'',
    timestamp: new Date().toISOString(),
  };

  // Save locally to session
  try {
    const saved = JSON.parse(localStorage.getItem('cl_sessions')||'[]');
    const forSave = {...listing, photos: {
      front: listing.photos.front?'[captured]':null,
      back:  listing.photos.back?'[captured]':null,
      tag:   listing.photos.tag?'[captured]':null,
      detail:listing.photos.detail?'[captured]':null,
    }};
    saved.unshift(forSave);
    localStorage.setItem('cl_sessions', JSON.stringify(saved.slice(0,100)));
  } catch(e) {}

  // Send to Google Sheets webhook if configured
  const webhookUrl = localStorage.getItem('cl_sheets_url');
  if (webhookUrl) {
    if (status) status.textContent = '📤 Sending to Google Sheets...';
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listing),
        mode: 'no-cors'
      });
      if (status) status.innerHTML = '✅ Sent to Google Sheets';
    } catch(e) {
      if (status) status.innerHTML = '⚠️ Could not send to Sheets — saved locally';
    }
  } else {
    if (status) status.innerHTML = '💾 Saved locally <span style="color:var(--mu)">(configure Sheets in ⚙)</span>';
  }

  // Show success
  if (btn) {
    btn.textContent = '✅ LISTING COMPLETE';
    btn.style.background = 'var(--sv)';
    btn.style.color = '#000';
  }

  // Add to clothing bulk (old format — Google Sheets)
  clBulk.unshift(listing);
  saveClBulkToStorage();
  clUpdateClFAB();

  // ── SAVE TO EBAY PREFILL SESSION ──────────────────────────
  // Uploads photos to ImgBB and saves row in eBay format
  try {
    if (status) status.textContent = '📸 Uploading photos for eBay...';
    const imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
    const photoUrls = imgbbKey ? (await clUploadAllPhotos() || '') : '';
    if (photoUrls && status) status.textContent = '✅ Photos uploaded!';
    const ebayRow = clAmpliarFilaV134(clBuildEbayRow(photoUrls));
    const n = clSaveToSession(ebayRow);
    clUpdateSessionBadge();
    if (status) status.textContent = '✅ Saved! ' + n + ' items ready to export for eBay.';
  } catch(e) {
    console.warn('eBay session save error:', e);
    toast('⚠️ Error guardando sesión: ' + (e.message || e));
  }

  setTimeout(() => {
    cl.submitting = false;
    toast(`✅ ${cl.sku} guardado`);
    clRenderSKU();
    clGo(1);
  }, 2000);
}

// ── Clothing Bulk Session ────────────────────────────────────
let clBulk = [];

function clUpdateClFAB() {
  const fab = $('cl-fab');
  const cnt = $('cl-fab-n');
  if (!fab || !cnt) return;
  // Use cl_ebay_session as source of truth (survives page refresh)
  const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
  const n = sess.length;
  cnt.textContent = n;
  fab.classList.toggle('on', n > 0);
}


// ── FILE EXCHANGE CSV ─────────────────────────────────────
// URL del Apps Script conectado a la hoja "Savvy Scanner - Registro de Productos"
var CL_SHEET_URL = 'https://script.google.com/macros/s/AKfycbze10nxA1khXx1KckMSs19qW_9O6SIkq8RRJW-laW768ZAjecwLOTCKxVsP15w7GHsO5Q/exec';

function clSendToRegistroSheet(sess) {
  if (!sess.length) return;
  var items = sess.map(function(it) {
    return {
      sku: it.sku || '',
      ubicacion: it.warehouseLocation || '',
      fecha: it.timestamp || new Date().toISOString().slice(0,19).replace('T',' '),
      marca: it.brand || '',
      categoria: it.type || it.category || '',
      genero: it.department || '',
      talla: it.size || '',
      color: it.color || '',
      condicion: it.conditionId == 1000 ? 'NWT' : it.conditionId == 1500 ? 'NWOT' : 'Used',
      precio: it.price || '',
      titulo: it.title || '',
      fotos: it.photos || '',
      descripcion: (it.description || '').replace(/<[^>]*>/g, '').trim(),
      defectos: (it.defects || []).join(', '),
      notas: it.notes || '',
      // Una sola columna, en texto legible ("1 lb 5 oz"). Antes iban tres.
      peso: it.weightLabel || ''
    };
  });
  fetch(CL_SHEET_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({items: items}),
    headers: {'Content-Type': 'text/plain'}
  }).catch(function(e) { console.warn('Error enviando a Sheet de registro:', e); });
}

function clExportEbayCSV() {
  var sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
  if (!sess.length) { toast('⚠️ No items — complete a listing first'); return; }

  // ── GUARDIA DE PRECIO ──────────────────────────────────────────────────
  // Se revisa ANTES de mandar nada a la hoja de registro o a Drive, para que
  // un precio malo no se propague a los demás sistemas. Mismo criterio que
  // usamos con la fecha de expiración en Product Scanner: si sabemos que el
  // dato está mal, el archivo no sale.
  var _badPrice = sess.filter(function(it){
    var n = clNormalizePrice(it.price);
    return !isFinite(n) || n < 0.99 || n > 499.99;
  });
  if (_badPrice.length) {
    var _lista = _badPrice.map(function(it){
      var n = clNormalizePrice(it.price);
      return '• ' + (it.sku || it.title || '?') + '  →  ' +
             (isFinite(n) ? '$' + n.toFixed(2) : 'inválido') +
             (isFinite(n) && n > 499.99 ? '   ¿faltó el punto decimal?' : '');
    }).join('\n');
    alert(
      '🚫 EXPORT DETENIDO — precio fuera de rango\n\n' + _lista +
      '\n\nEl rango permitido es $0.99 – $499.99.\n\n' +
      'Un precio de $2,999 en vez de $29.99 deja el artículo invisible.\n' +
      'Corrige el precio y exporta otra vez.'
    );
    toast('🚫 Export detenido — ' + _badPrice.length + ' precio(s) fuera de rango');
    return;
  }

  // ── AVISO DE PESO FALTANTE ─────────────────────────────────────────────
  // A diferencia del precio, esto NO bloquea: un peso ausente no hace que
  // eBay rechace el listado. Pero sin él, al comprar la etiqueta en
  // ShipStation hay que ir a pesar la prenda otra vez. Es un aviso para que
  // se decida a conciencia, no un obstáculo para el almacén.
  var _sinPeso = sess.filter(function(it){
    return !it.weightTotalLb || parseFloat(it.weightTotalLb) <= 0;
  });
  if (_sinPeso.length) {
    var _lp = _sinPeso.map(function(it){ return '• ' + (it.sku || it.title || '?'); }).join('\n');
    if (!confirm(
      '⚖️ ' + _sinPeso.length + ' artículo(s) SIN peso:\n\n' + _lp +
      '\n\nEl listado sube igual, pero al comprar la etiqueta en ShipStation\n' +
      'vas a tener que pesar la prenda otra vez.\n\n¿Exportar así?'
    )) {
      toast('Export cancelado — agrega el peso');
      return;
    }
  }

  // ── DESVÍO AL CSV v134 (solo con el flag encendido) ────────────────────
  // Las filas del esquema 2 salen por el generador oficial; las antiguas
  // siguen por el camino de siempre, sin tocar una sola línea de abajo.
  //
  // PASO 6: antes de tocar la hoja de registro, generar el CSV o subir nada
  // a Drive, se validan TODAS las filas de esquema 2 contra la taxonomia
  // oficial. Un solo problema en una sola fila bloquea el LOTE COMPLETO --
  // tambien las filas antiguas del mismo lote, que no se separan para
  // exportarse solas. No es "exporta lo bueno y avisa de lo malo": es todo
  // o nada, porque un CSV parcial es tan facil de subir a eBay como uno
  // completo, y nadie revisaria que falto la mitad del lote.
  //
  // clSendToRegistroSheet se llama UNA sola vez, con el `sess` COMPLETO (antes
  // de separar por esquema), tanto si el flag esta encendido como apagado --
  // igual que siempre. Solo cambia CUANDO: ahora ocurre despues de validar.
  if (clTaxV134()) {
    var _sep = clSepararPorEsquema(sess);
    if (_sep.nuevas.length) {
      var _erroresLote = clValidarLoteV134(_sep.nuevas);
      if (_erroresLote.length) { clMostrarBloqueoExport(_erroresLote); return; }
    }
    // Validado -- o no habia nada de esquema 2 que validar. Ahora si, los
    // efectos externos, con el lote COMPLETO, igual que antes del PASO 6.
    clSendToRegistroSheet(sess);
    if (_sep.nuevas.length) clExportEbayCSVv134(_sep.nuevas, _sep.viejas.length);
    if (!_sep.viejas.length) return;
    sess = _sep.viejas;
  } else {
    // Enviar también a la hoja de registro de Google Sheets (en paralelo, no bloquea)
    clSendToRegistroSheet(sess);
  }

  function q(v) {
    v = String(v==null?'':v);
    return (v.indexOf(',')>=0||v.indexOf('"')>=0||v.indexOf('\n')>=0)
      ? '"'+v.replace(/"/g,'""')+'"' : v;
  }
  var SHIP = CL_SHIP_POLICY;
  var RET  = CL_RET_POLICY;
  var PAY  = CL_PAY_POLICY;
  var HDR=['*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
    'CustomLabel','*Category','*Title','*ConditionID',
    '*C:Brand','*C:Size Type','*C:Size','*C:Department','*C:Color','*C:Style','C:Type',
    'C:Inseam','C:Dress Length','C:Outer Shell Material','C:Performance/Activity','C:Width',
    'PicURL','*Description','*Format','*Duration',
    '*StartPrice','*Quantity','ImmediatePayRequired','*Location','*DispatchTimeMax',
    'ShippingProfileName','ReturnProfileName','PaymentProfileName',
    'WeightMajor','WeightMinor'];
  var lines=['Info,Version=1.0.0,Template=fx_category_template_EBAY_US',HDR.join(',')];
  sess.forEach(function(r){
    var needsInseam = ['Jeans','Pants','Shorts'].includes(r.type);
    var needsDressLen = ['Dress','Skirt'].includes(r.type);
    var needsOuter = ['Jacket','Coat','Vest'].includes(r.type);
    var needsActivity = ['Activewear Top','Activewear Bottom'].includes(r.type);
    var needsWidth = (r.type === 'shoes');
    // ⚠️ AGREGADO (15 ago 2026): eBay muestra los item specifics tal cual en
    // la ficha del producto. Mandar "Unspecified" es peor que no mandar nada:
    // ocupa el renglón, no aporta a la búsqueda y se ve mal (CLO-POL-1XB-47263
    // salió con C:Inseam = "Unspecified"). Si el valor es un relleno, se manda
    // vacío y eBay simplemente omite el aspecto.
    function asp(v){
      var s = String(v == null ? '' : v).trim();
      return /^(unspecified|unknown|n\/a|na|none|not specified|select|--)$/i.test(s) ? '' : s;
    }
    lines.push([
      'Add',r.sku||'',r.categoryId||'63861',r.title||'',r.conditionId||'1000',
      r.brand||'',r.sizeType||'Regular',r.size||'',r.department||'',asp(r.color),
      asp(r.style),asp(r.type),
      asp(r.inseam) || (needsInseam ? (r.type === 'Shorts' ? '9"' : '30"') : ''),
      asp(r.dressLength) || (needsDressLen ? 'Knee Length' : ''),
      asp(r.outerMaterial) || (needsOuter ? 'Polyester' : ''),
      asp(r.activity) || (needsActivity ? 'General Fitness' : ''),
      asp(r.shoeWidth) || (needsWidth ? 'Regular (B/M)' : ''),
      r.photos||'',
      r.description||('<p>'+(r.title||'')+'</p>'),
      'FixedPrice','GTC',r.price||'19.99','1','1','Lumberton, NC','1',SHIP,RET,PAY,
      (r.weightMajor === '' || r.weightMajor == null) ? '' : r.weightMajor,
      (r.weightMinor === '' || r.weightMinor == null) ? '' : r.weightMinor
    ].map(q).join(','));
  });
  var csv=lines.join('\r\n');
  var now=new Date();
  var stamp=now.toISOString().slice(0,10)+'-'
    +now.getHours().toString().padStart(2,'0')+now.getMinutes().toString().padStart(2,'0');
  var fname='eBay-FX-'+stamp+'-'+sess.length+'items.csv';
  var driveUrl = localStorage.getItem('cl_drive_url') || 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec';
  if (driveUrl) {
    toast('📤 Subiendo a Google Drive...');
    // no-cors: bypasses CORS block — file IS saved to Drive even without readable response
    fetch(driveUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({csv: csv, filename: fname}),
      headers: {'Content-Type': 'text/plain'}
    })
    .then(function() {
      // With no-cors we can't read response, but file was saved — show success
      var ov=document.createElement('div');
      ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;'
        +'display:flex;flex-direction:column;align-items:center;justify-content:center;'
        +'padding:30px;gap:16px;text-align:center';
      ov.innerHTML='<div style="font-size:60px">✅</div>'
        +'<div style="color:#fff;font-size:22px;font-weight:800">CSV en Google Drive</div>'
        +'<div style="color:#aaa;font-size:14px">'+fname+'</div>'
        +'<div style="color:#aaa;font-size:13px;line-height:1.6">'
        +'En Windows abre <b style="color:#fff">drive.google.com</b><br>'
        +'Carpeta <b style="color:#fff">eBay Listings</b><br>'
        +'Descarga el CSV → sube a eBay</div>'
        +'<a href="https://drive.google.com/drive/folders" target="_blank" '
        +'style="background:#1a73e8;border-radius:12px;padding:14px 28px;color:#fff;'
        +'font-weight:800;font-size:16px;text-decoration:none">📁 Abrir Google Drive</a>'
        +'<button onclick="this.parentElement.remove()" '
        +'style="background:none;border:1px solid #555;border-radius:10px;padding:10px 24px;'
        +'color:#888;cursor:pointer;font-size:14px">Cerrar</button>';
      document.body.appendChild(ov);
    })
    .catch(function() {
      clShowExportOptions(csv, fname, sess.length);
    });
  } else {
    clShowExportOptions(csv, fname, sess.length);
  }
}

function clShowExportOptions(csv, fname, count) {
  var old=document.getElementById('csv-export-overlay');
  if(old) old.remove();
  var emailBody='File: '+fname+'\n\n'+csv.substring(0,4000);
  var mailtoUrl='mailto:?subject='+encodeURIComponent('eBay FX '+fname)
    +'&body='+encodeURIComponent(emailBody);
  var ov=document.createElement('div');
  ov.id='csv-export-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;'
    +'display:flex;flex-direction:column;padding:20px;gap:12px;overflow-y:auto;'
    +'-webkit-overflow-scrolling:touch';
  var safeCSV=csv.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  ov.innerHTML='<div style="color:#fff;font-size:18px;font-weight:800">📦 '+count+' listing(s)</div>'
    +'<div style="color:#aaa;font-size:12px">'+fname+'</div>'
    +'<a href="'+mailtoUrl+'" style="display:block;background:#1a73e8;border-radius:12px;'
    +'padding:16px;color:#fff;font-weight:800;font-size:15px;text-align:center;text-decoration:none">'
    +'📧 Abrir en Mail — envíatelo</a>'
    +'<button id="csv-copy-btn2" style="background:#f0a500;border:none;border-radius:12px;'
    +'padding:16px;color:#000;font-weight:800;font-size:15px;cursor:pointer;width:100%">'
    +'📋 Copiar al Clipboard</button>'
    +'<div style="color:#888;font-size:11px">CSV content (copia manualmente si es necesario):</div>'
    +'<textarea id="csv-ta2" readonly style="background:#111;color:#0f0;font-family:monospace;'
    +'font-size:9px;border-radius:8px;padding:10px;min-height:80px;border:1px solid #333;resize:vertical">'
    +safeCSV+'</textarea>'
    +'<button onclick="document.getElementById(\'csv-export-overlay\').remove()" '
    +'style="background:none;border:1px solid #555;border-radius:10px;padding:12px;'
    +'color:#888;cursor:pointer;font-size:14px">✕ Cerrar</button>';
  document.body.appendChild(ov);
  document.getElementById('csv-copy-btn2').onclick=function(){
    var ta=document.getElementById('csv-ta2');
    ta.value=csv;
    if(navigator.clipboard){
      navigator.clipboard.writeText(csv)
        .then(function(){toast('✅ Copiado!');})
        .catch(function(){ta.select();document.execCommand('copy');toast('✅ Copiado!');});
    } else { ta.select(); document.execCommand('copy'); toast('✅ Copiado!'); }
  };
}
