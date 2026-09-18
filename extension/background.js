// ============================================================================
//  Service worker: hace CLICS REALES (de confianza) con chrome.debugger (CDP).
//  Los formularios React (FB/IG/WhatsApp/TikTok) rechazan los clics sintéticos
//  de una extensión para marcar radios/casillas; solo aceptan clics reales.
//  El popup envía una lista de selectores y aquí se hace un clic real en cada uno.
//  Solo marca (clic) cuando el elemento NO está ya marcado, para no des-marcar.
// ============================================================================

// Motor de relleno compartido (define APLICAR en el ámbito del service worker) para
// poder RE-INYECTARLO nosotros mismos en la pestaña durante el autorrelleno persistente.
importScripts("motor.js");

// Los archivos de datos (marcas/justificaciones/politicas/formularios) usan `window.*`
// para exponer sus globales. En el service worker no existe `window`, así que lo
// apuntamos a `self` (globalThis) ANTES de cargarlos. Ninguno usa el DOM al cargarse
// (solo definen objetos de datos), por eso funcionan también aquí. Esto permite armar
// el "plan de relleno" desde el MENÚ CONTEXTUAL (clic derecho) igual que en el popup.
self.window = self;
importScripts(
  "datos/marcas.js",           // window.MARCAS_BASE, window.CORREO_PERSONA
  "datos/justificaciones.js",  // window.JUSTIF
  "datos/politicas_generales.js", // window.POLITICAS_GENERALES
  "datos/correos_denuncia.js", // window.CORREOS_DENUNCIA (destinos fijos + memoria de correos)
  "datos/formularios.js"       // window.FORMULARIOS (usa JUSTIF y POLITICAS al ejecutar)
);

function cmd(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}
function attach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
function detach(tabId) {
  return new Promise((resolve) => { chrome.debugger.detach({ tabId }, () => resolve()); });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Devuelve las coordenadas del centro del control a clicar (su label visible si lo
// tiene). Devuelve null si el elemento no existe o YA está marcado (no re-clicar).
function exprCoords(sel) {
  return "(function(){var e=document.querySelector(" + JSON.stringify(sel) + ");" +
    "if(!e) return null;" +
    "if((e.type==='radio'||e.type==='checkbox') && e.checked) return null;" +
    "var l=null; try{ if(e.id) l=document.querySelector('label[for=\"'+(window.CSS?CSS.escape(e.id):e.id)+'\"]'); }catch(x){}" +
    "var t=(l && l.getBoundingClientRect().width>1)? l : e;" +
    "try{ t.scrollIntoView({block:'center'}); }catch(x){}" +
    "var r=t.getBoundingClientRect();" +
    "if(r.width<1||r.height<1){ r=e.getBoundingClientRect(); }" +
    "if(r.width<1||r.height<1) return null;" +
    "return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};})()";
}

async function clicReal(tabId, sel) {
  const r = await cmd(tabId, "Runtime.evaluate", { expression: exprCoords(sel), returnByValue: true });
  const c = r && r.result && r.result.value;
  if (!c) return false; // no existe o ya estaba marcado
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
  return true;
}

async function hacerClics(tabId, selectores) {
  let ok = 0;
  let attached = false;
  try {
    await attach(tabId);
    attached = true;
    await cmd(tabId, "Runtime.enable").catch(() => {});
    for (const sel of selectores) {
      try { if (await clicReal(tabId, sel)) ok++; } catch (e) { /* sigue con el resto */ }
      await dormir(180);
    }
  } catch (e) {
    return { ok, error: String((e && e.message) || e) };
  } finally {
    if (attached) await detach(tabId);
  }
  return { ok };
}

// ============================================================================
//  AUTORRELLENO PERSISTENTE de la 2.ª etapa (TikTok Copyright/Marca).
//  Problema real (confirmado con los volcados del DOM del formulario): tras elegir los
//  desplegables y el correo, el formulario SOLO muestra el campo del correo; el resto
//  (Tipo de obra, Origen, Descripción, firma, casillas, URL) NO existe hasta VERIFICAR
//  el correo. Por eso antes había que pulsar "Rellenar" por 2.ª vez al volver del correo.
//  Solución: tras el primer clic, el service worker REPITE por su cuenta lo mismo que hacía
//  ese 2.º clic —re-inyecta APLICAR (una pasada) + clics reales— cada pocos segundos, hasta
//  que el formulario quede completo. Vive en el service worker: sobrevive a cerrar el popup
//  y a irse a verificar el correo. Un solo "Rellenar" basta.
//
//  POR QUÉ SE REESCRIBIÓ (medido en vivo contra el formulario real, no supuesto):
//   - En la pantalla "Verifica tu correo electrónico" NO existe ni un campo del formulario:
//     solo hay UNA caja para escribir el correo. Nombre, titular, dirección, teléfono, Tipo
//     de obra, Origen, Descripción, firma, casillas y URLs aparecen DESPUÉS de verificar.
//   - Una pasada de APLICAR sobre esa pantalla tarda 13.717 ms MEDIDOS. Con el tope viejo de
//     5 minutos y `dormir(2500)` cabían ~18 vueltas: se gastaban ENTERAS mientras el usuario
//     seguía en su bandeja de correo. Cuando volvía verificado, el bucle ya había terminado
//     y no rellenaba nada. Es exactamente lo que le pasó al usuario.
//   Por eso ahora: tope de 30 min (verificar un correo pasa de 5 min con facilidad), una
//   SONDA barata de solo lectura mientras no hay formulario (se reacciona en 2 s en vez de
//   en 16 y no se quema CPU en pasadas de 13,7 s contra una pantalla vacía), tolerancia a
//   fallos pasajeros de inyección y, sobre todo, NUNCA un comprobante en blanco.
// ============================================================================
const AUTORRELLENO = {}; // tabId -> { cancelar: bool }

// SONDA DE SOLO LECTURA. Se inyecta en la pestaña antes de cada vuelta para saber si el
// formulario YA apareció, sin escribir ni marcar NADA. Es crítico que no toque la página:
// mientras dura la verificación, el usuario puede estar tecleando su correo o el código que
// le llegó, y una pasada de relleno le pisaría lo escrito.
// Devuelve el recuento de lo VISIBLE: cajas de texto, opciones (radios/casillas) y rótulos
// `.field-title` (la clase con la que TikTok pinta el título de cada campo).
//
// OJO CON LOS `<select>`: NO cuentan como caja, y es a propósito. TikTok tiene un SELECTOR
// DE IDIOMA `<select>` VISIBLE EN EL PIE de página, en TODAS las pantallas. Contándolo, la
// pantalla de "Verifica tu correo electrónico" daba `cajas: 2` (la caja del correo + el
// idioma) y la huella decía que YA había formulario: el bucle se ponía a lanzar la pasada
// completa de 13,7 s en cada vuelta contra una pantalla vacía —justo lo que este arreglo
// evita— y encima el motor podía escribir en la ÚNICA caja de esa pantalla, que es la del
// correo de verificación que el usuario está tecleando. Medido en vivo el 2026-09-08.
// Por eso se cuentan SOLO cajas de texto de verdad (textarea y los input de tipo
// text/email/url/tel/number/search, o sin `type`, que el DOM ya devuelve como "text"), y se
// dejan fuera select, button, submit, reset, image, file y hidden.
function HUELLA_DEL_FORMULARIO() {
  try {
    var seVe = function (e) {
      try {
        var r = e.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return false;
        var s = window.getComputedStyle(e);
        return s.display !== "none" && s.visibility !== "hidden";
      } catch (x) { return false; }
    };
    // `password` cuenta como caja aunque nunca se rellene: para SABER si en la pantalla
    // hay un formulario, una caja de contrasena es tan buena senal como cualquier otra
    // (un login son dos cajas), y no contarla dejaba el login en una sola.
    var TIPOS_DE_CAJA = ["text", "email", "url", "tel", "number", "search", "password"];
    var cajas = 0, opciones = 0, rotulos = 0;
    var campos = document.querySelectorAll("input,textarea"); // los `select` NO entran (ver arriba)
    for (var i = 0; i < campos.length; i++) {
      var e = campos[i];
      var etiqueta = (e.tagName || "").toLowerCase();
      var tipo = (e.type || "").toLowerCase();
      if (!seVe(e)) continue;
      if (tipo === "radio" || tipo === "checkbox") { opciones++; continue; }
      if (etiqueta === "textarea") { cajas++; continue; }
      if (etiqueta === "input" && TIPOS_DE_CAJA.indexOf(tipo) >= 0) { cajas++; }
      // el resto (button, submit, reset, image, file, hidden…) no es una caja que rellenar
    }
    var titulos = document.querySelectorAll(".field-title");
    for (var j = 0; j < titulos.length; j++) if (seVe(titulos[j])) rotulos++;
    // MENUS SIN RESPONDER. Es la senal que faltaba para la pagina RECARGADA: si TikTok se
    // recarga antes de verificar el correo, en pantalla no queda mas que el desplegable
    // "¿Que problema tienes?" -> {cajas:0, opciones:0, rotulos:1}, la sonda decia "aqui no
    // hay formulario" y el bucle esperaba 30 minutos sin volver a elegirlo nunca. Y sin ese
    // menu TikTok no enseña ni un campo: el formulario se quedaba en blanco para siempre.
    // Es una senal SEGURA porque ninguna pantalla de verificacion tiene un menu: medido en
    // vivo el 2026-09-09, al elegir la opcion el menu DESAPARECE y solo queda la caja del
    // correo. Solo cuentan los que estan SIN responder (muestran "Select"/"Seleccionar"):
    // uno ya respondido no es trabajo pendiente. El <select> del IDIOMA del pie no entra
    // (no es [aria-haspopup=listbox] y ademas siempre muestra el idioma elegido).
    var menusSinResponder = 0;
    var menus = document.querySelectorAll('[aria-haspopup="listbox"],[role="combobox"]');
    for (var m = 0; m < menus.length; m++) {
      if (!seVe(menus[m])) continue;
      var tm = (menus[m].innerText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (!tm || tm.indexOf("select") >= 0 || tm.indexOf("seleccion") >= 0 ||
          tm.indexOf("elegir") >= 0 || tm.indexOf("elige") >= 0 || tm.indexOf("choose") >= 0) menusSinResponder++;
    }
    return { cajas: cajas, opciones: opciones, rotulos: rotulos, menusSinResponder: menusSinResponder };
  } catch (x) {
    return { cajas: 0, opciones: 0, rotulos: 0, menusSinResponder: 0 };
  }
}

// ¿La huella dice que YA hay formulario que rellenar? Es una señal POSITIVA a propósito:
// solo se da por bueno lo que NINGUNA pantalla de verificación puede tener.
//   - TikTok verifica el correo en DOS pantallas: la 1.ª pide el correo (1 caja) y la 2.ª
//     pide el código de un solo uso enseñando el correo + el código (2 cajas). Las dos
//     tienen 0 radios/casillas y como mucho 2 rótulos.
//   - El formulario de verdad tiene 5+ cajas, 13 radios/casillas y 14 rótulos `.field-title`
//     (medido sobre la copia fiel del formulario real: {cajas:9, opciones:13, rotulos:14}).
// Por eso los umbrales van con MARGEN (3, no 2): un umbral de `cajas > 1` daba por buena la
// pantalla del código y habría lanzado ahí la pasada de 13,7 s, encima de lo que el usuario
// está tecleando. Con margen, entre "pantalla de verificación" y "formulario" no hay empate.
function hayFormularioEnLaHuella(h) {
  if (!h) return false;
  const cajas = h.cajas || 0, opciones = h.opciones || 0, rotulos = h.rotulos || 0;
  // UNA SOLA CASILLA NO BASTA. Antes valía `opciones > 0`, y un "Recordarme" del login
  // del mismo sitio ya hacía decir "aquí hay formulario". Ahora una casilla suelta solo
  // cuenta si viene acompañada: dos o más opciones Y alguna caja de texto.
  //   formulario real de TikTok  {cajas:9, opciones:13, rotulos:14} -> true
  //   login con "Recordarme"     {cajas:2, opciones:1,  rotulos:2 } -> false
  //   pantalla del correo        {cajas:1, opciones:0,  rotulos:1 } -> false
  //   pantalla del código        {cajas:2, opciones:0,  rotulos:2 } -> false
  //   pagina recargada, solo el menu {cajas:0, opciones:0, rotulos:1, menusSinResponder:1} -> true
  // Un MENU SIN RESPONDER cuenta por si solo: es trabajo pendiente que solo el bucle puede
  // hacer, y ninguna pantalla de verificacion tiene menus (ver HUELLA_DEL_FORMULARIO).
  return (h.menusSinResponder || 0) >= 1 || (opciones >= 2 && cajas >= 1) || cajas >= 3 || rotulos >= 3;
}

async function autorelleno(tabId, pasos, opts) {
  opts = opts || {};
  const urlForm = opts.urlForm || "";
  // MODO PRUEBA: el bucle rellena igual (de eso se trata: ver como queda el formulario),
  // pero se le RETIRA el autoenvio aqui mismo, sin depender de lo que mandara el popup.
  const modoPrueba = !!opts.modoPrueba;
  if (modoPrueba) opts = Object.assign({}, opts, { autoenviar: false });
  if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; // cancela un bucle previo del mismo tab
  const estado = { cancelar: false, seFue: false };
  AUTORRELLENO[tabId] = estado;
  limpiarAvisoDelIcono(); // empieza un relleno nuevo: el aviso anterior del icono ya no aplica

  // Se FIJA aquí a qué denuncia del Registro irá el comprobante. Si se resolviera al
  // capturar —hasta 30 minutos después—, cualquier denuncia dada de alta mientras tanto
  // habría pisado `ultima_denuncia_registro` y la foto se pegaría a la denuncia equivocada.
  // Si quien arranca el bucle ya lo fijó (el clic derecho), se usa el suyo.
  const idDenuncia = (opts.idDenuncia != null ? opts.idDenuncia : await denunciaEnCurso());

  // Si la pestaña NAVEGA, se anota EN EL ACTO si quedó dentro o fuera de la página del
  // formulario, sin esperar a la siguiente vuelta del bucle. OJO: aquí ya NO se cancela
  // nada; irse del formulario PAUSA el bucle, no lo mata (ver `dondeEsta`, más abajo).
  const vigilarNavegacion = (id, info, tab) => {
    if (id !== tabId) return;
    const u = (info && info.url) || (tab && tab.url) || "";
    if (u) estado.fuera = !mismaPaginaDelFormulario(u, urlForm);
  };
  if (urlForm) { try { chrome.tabs.onUpdated.addListener(vigilarNavegacion); } catch (e) {} }

  // ¿Dónde está la pestaña AHORA MISMO? Se le pregunta a Chrome (autoritativo), no se
  // confía en la última navegación vista. Devuelve "cerrada" | "fuera" | "dentro".
  // Sin `urlForm` responde siempre "dentro": es el comportamiento de siempre para quien
  // arranque el bucle sin ancla.
  const dondeEsta = async () => {
    let t = null;
    try { t = await chrome.tabs.get(tabId); } catch (e) { return "cerrada"; }
    if (!urlForm) return "dentro";
    return mismaPaginaDelFormulario((t && t.url) || "", urlForm) ? "dentro" : "fuera";
  };

  // 30 MINUTOS. Antes eran 5 y no daban: verificar un correo (ir al buzón, esperar el
  // mensaje, pulsar el enlace, volver) pasa de 5 min con facilidad, y encima esos 5 min se
  // los comían las pasadas de 13,7 s contra la pantalla de verificación. Ahora la espera es
  // barata (sonda de 2 s), así que aguantar media hora no cuesta nada.
  const fin = Date.now() + 1800000;
  let limpias = 0, completado = false;
  let toco = false;        // ¿ALGUNA pasada llegó a escribir/marcar algo de verdad?
  let fallos = 0;          // fallos CONSECUTIVOS de inyección
  let porFallos = false;   // se salió por acumular fallos de inyección
  let cerrada = false;     // la pestaña se cerró
  let pausas = 0;          // veces que el bucle se quedó ESPERANDO a que la pestaña volviera
  let volvio = false;      // ¿llegó a volver al formulario después de haberse ido?
  let enPausa = false, inicioDePausa = 0, totalFuera = 0, pausaLarga = false;
  let porPausa = false;    // se salió porque la pestaña llevaba demasiado tiempo fuera
  // TOPE DE LA PAUSA: 5 minutos SEGUIDOS fuera, y otros 5 SUMANDO todas las idas y
  // venidas (si no, entrar y salir sin parar burlaría el tope).
  // Por qué tan poco comparado con los 30 min del bucle: lo que la pausa cubre es un
  // rodeo de ruta de TikTok (segundos) o un ida y vuelta rápido. La espera LARGA —la de
  // verificar el correo— transcurre con la pestaña QUIETA en el formulario, así que ahí
  // no hay ninguna pausa y los 30 min siguen enteros. Sin este tope, el bucle podía
  // pasarse 25 minutos dormido y despertarse justo cuando el usuario había vuelto a
  // rellenar el formulario a mano.
  const TOPE_DE_PAUSA = 300000;
  // Y una pausa LARGA (más de 1 min) quita el AUTOENVÍO: un rodeo de ruta dura segundos,
  // así que si la pestaña estuvo fuera un minuto es que ahí pasó algo que conviene que
  // mire una persona antes de mandar la denuncia. Se rellena y se captura igual.
  const PAUSA_QUE_QUITA_EL_AUTOENVIO = 60000;

  while (!estado.cancelar && Date.now() < fin) {
    // 1) ¿DÓNDE está la pestaña?
    const donde = await dondeEsta();
    if (donde === "cerrada") { cerrada = true; estado.cancelar = true; break; }
    if (donde === "fuera") {
      // ============================================================================
      //  LA PESTAÑA NO ESTÁ EN EL FORMULARIO: SE PAUSA, NO SE MATA. (decisión delicada)
      //  Antes esto hacía `break` y el autorrelleno TERMINABA. El problema: no sabemos
      //  con certeza en qué URL deja TikTok la pestaña DESPUÉS de verificar el correo
      //  (medirlo exigiría un código real del buzón). Si diera un rodeo por otra ruta y
      //  volviera, el bucle ya se habría rendido justo cuando el usuario regresa: el
      //  mismo síntoma que este arreglo existe para eliminar.
      //  Pausar NO relaja nada de lo que exigió Seguridad. Mientras la pestaña esté
      //  fuera: no se escribe, no se marca, no se dan clics reales, no se captura y no
      //  se envía. NADA. Ni siquiera se inyecta la sonda de solo lectura: para saber si
      //  ha vuelto basta con preguntarle a Chrome por la URL, así que no se ejecuta ni
      //  una línea de código nuestro en una página ajena (podría ser el correo del
      //  usuario o su banco).
      //  Si vuelve dentro de los 30 min, se reanuda. Si no vuelve, al agotarse el tiempo
      //  se avisa y NO se guarda comprobante, igual que hoy.
      // ============================================================================
      if (!enPausa) { enPausa = true; pausas++; inicioDePausa = Date.now(); }
      estado.fuera = true;
      const llevaFuera = Date.now() - inicioDePausa;
      if (llevaFuera > TOPE_DE_PAUSA || (totalFuera + llevaFuera) > TOPE_DE_PAUSA) {
        porPausa = true; estado.seFue = true; break; // demasiado tiempo fuera: se termina
      }
      await dormir(2000);
      continue;
    }
    if (enPausa) {
      // HA VUELTO: se reanuda donde estaba, pero NO en silencio (ver el aviso de abajo).
      const duroLaPausa = Date.now() - inicioDePausa;
      totalFuera += duroLaPausa;
      if (duroLaPausa > PAUSA_QUE_QUITA_EL_AUTOENVIO) pausaLarga = true;
      enPausa = false; volvio = true;
      // El usuario tiene que poder darse cuenta y pararlo, en vez de ver campos
      // moviéndose solos al volver a la pestaña.
      await avisarDenunciaPendiente(tabId,
        "Denuncias RS: has vuelto al formulario, así que sigo rellenando esta denuncia. " +
        "Si no quieres que siga, cierra esta pestaña o pulsa Rellenar en otra denuncia.",
        "reanudado", false);
    }
    estado.fuera = false;

    // 2) SONDA barata de SOLO LECTURA: ¿ya hay formulario? Cuesta milisegundos, frente a los
    //    13,7 s de una pasada de APLICAR.
    let huella = null;
    try {
      const rs = await chrome.scripting.executeScript({
        target: { tabId: tabId }, // SOLO el marco principal (ver el aviso de los iframes, abajo)
        func: HUELLA_DEL_FORMULARIO
      });
      huella = (rs && rs[0] && rs[0].result) || null;
      fallos = 0; // inyección buena: el contador de fallos vuelve a cero
    } catch (e) {
      // Fallo PASAJERO típico: la página se está repintando/recargando justo al verificar el
      // correo. Antes esto hacía `break` y el autorrelleno moría para siempre, en silencio.
      if (++fallos >= 8) { porFallos = true; break; } // ~20 s seguidos sin poder inyectar
      await dormir(2500);
      continue;
    }

    // 3) Sigue la pantalla de "Verifica tu correo electrónico": NI UNA pasada de relleno.
    //    Dos razones: no hay nada que rellenar, y la única caja en pantalla es la del correo
    //    de verificación —escribir ahí sería pisarle al usuario lo que está tecleando—.
    //    Se vuelve a sondear en 2 s, así en cuanto aparezca el formulario se reacciona casi
    //    al instante en vez de tardar los ~16 s de una vuelta completa.
    if (!hayFormularioEnLaHuella(huella)) {
      await dormir(2000);
      continue;
    }

    // 4) Ya hay formulario: pasada completa de relleno, como siempre.
    //    ANCLA JUSTO ANTES DE ESCRIBIR. La comprobacion del punto 1 se hizo antes de la
    //    sonda, y entre las dos inyecciones cabe una navegacion: medido, APLICAR llegaba a
    //    RELLENAR EL FORMULARIO con la pestana ya fuera. Esta es la ultima puerta antes de
    //    tocar la pagina, asi que aqui no se ahorra la pregunta a Chrome.
    if ((await dondeEsta()) !== "dentro") continue; // PAUSA: se reintenta cuando vuelva
    let res = null;
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: APLICAR,
        // `urlForm` viaja DENTRO: la comprobación de arriba y esta inyección no son
        // simultáneas, y APLICAR se planta solo si al ejecutarse ya no está en el
        // formulario. Es la única forma de cerrar esa carrera (ver el aviso en motor.js).
        args: [pasos, { unaPasada: true, urlForm: urlForm }]
      });
      res = (r && r[0] && r[0].result) || null;
      fallos = 0;
    } catch (e) {
      if (++fallos >= 8) { porFallos = true; break; }
      await dormir(2500);
      continue;
    }
    if (res && res.clicsReales && res.clicsReales.length) {
      // ANCLA TAMBIÉN AQUÍ. `hacerClics` dispara clics REALES (de confianza, vía depurador)
      // en las coordenadas de la página que esté cargada EN ESE INSTANTE, y entre la pasada
      // de APLICAR —13,7 s medidos— y este punto la pestaña ha podido irse al login. Sin
      // esta comprobación se daban clics de verdad sobre una pantalla ajena (medido: 6).
      // Si se fue, se PAUSA (`continue`), no se corta: cuando vuelva, la siguiente pasada
      // volverá a pedir estos mismos clics.
      if ((await dondeEsta()) !== "dentro") continue;
      try { await hacerClics(tabId, res.clicsReales); } catch (e) { /* seguimos igual */ }
    }
    // ¿Se tocó la página de VERDAD? Se mide con `hechos` (campos escritos/marcados), no con
    // `ok`: `ok` cuenta también el paso del botón "Siguiente" aunque el botón no exista, así
    // que una página vacía devuelve ok=1. `res.ok` solo como respaldo por si el motor fuera
    // una versión vieja que aún no devolvía `hechos`.
    if (res && (res.hechos != null ? res.hechos > 0 : res.ok > 0)) toco = true;
    // Parada anticipada: 3 rondas seguidas sin campos faltantes = formulario ya completo.
    if (res && (!res.faltan || res.faltan.length === 0)) { if (++limpias >= 3) { completado = true; break; } }
    else limpias = 0;
    await dormir(2500);
  }

  if (urlForm) { try { chrome.tabs.onUpdated.removeListener(vigilarNavegacion); } catch (e) {} }
  if (AUTORRELLENO[tabId] === estado) delete AUTORRELLENO[tabId];

  // ---- SALIDAS SIN COMPROBANTE ----
  if (cerrada) return;              // la pestaña ya no existe: no hay a quién avisar

  // ÚLTIMA COMPROBACIÓN DEL ANCLA, YA FUERA DEL BUCLE.
  // NO SE BORRA. Entre la comprobación de la última vuelta y este punto hay una pasada
  // completa de APLICAR (13,7 s medidos) más los clics reales: en ese hueco la pestaña
  // puede haberse ido. Si se quita esta comprobación, vuelve el fallo entero: se captura
  // como comprobante de la denuncia una pantalla ajena (un login, el correo del usuario)
  // y, en las redes con autoenvío, se sigue hasta `clicRealEnviar`, que busca el botón por
  // su TEXTO y se queda con el ÚLTIMO que case —en el login de TikTok, "Iniciar sesión"—.
  const dondeAcabo = await dondeEsta();
  if (dondeAcabo === "cerrada") return;         // se cerró justo al final: nadie a quien avisar
  if (dondeAcabo === "fuera") estado.seFue = true;
  if (estado.seFue) {
    // La pestaña NO estaba en el formulario al terminar. Esa pantalla (un login, otra web…)
    // no es la denuncia; guardarla como prueba falsearía el Registro y además expondría lo
    // que hubiera en ella. Solo se avisa.
    await avisarDenunciaPendiente(tabId, porPausa
      ? "Denuncias RS: la pestaña estuvo más de 5 minutos fuera de la página del formulario, así que dejé de " +
        "rellenar (no se capturó comprobante ni se envió nada). Vuelve al formulario y pulsa Rellenar otra vez."
      : "Denuncias RS: la pestaña no volvió a la página del formulario, así que dejé de " +
        "rellenar (no se capturó comprobante ni se envió nada). Vuelve al formulario y pulsa Rellenar otra vez.",
      "se fue");
    return;
  }
  if (estado.cancelar) return;      // lo paró el usuario u otra denuncia del mismo tab

  const agotado = !completado && !porFallos && !porPausa && Date.now() >= fin;
  const motivo = porFallos ? " porque no pude escribir en la pestaña varias veces seguidas"
    : agotado ? " porque pasaron los 30 minutos de espera" : "";

  // NUNCA UN COMPROBANTE EN BLANCO: si ninguna pasada llegó a tocar la página, la captura
  // sería una foto de un formulario VACÍO y quedaría en el Registro como prueba de una
  // denuncia que no se hizo. Eso falsearía el Registro, así que no se captura: se AVISA.
  if (!toco) {
    await avisarDenunciaPendiente(tabId, "Denuncias RS: no llegué a rellenar nada" + motivo + ". El formulario sigue abierto: " +
      "cuando lo veas en pantalla, pulsa Rellenar otra vez. No guardé comprobante (una captura de un " +
      "formulario vacío falsearía el Registro).", "nada");
    return;
  }

  // Al COMPLETARSE y si la red lo permite: enviar solo (con la cuenta atrás de 5 s).
  // enviarFormulario ya captura el comprobante antes de pulsar Enviar, comprueba otra vez
  // el ancla y lo pega a la denuncia que arrancó ESTE bucle.
  if (completado && opts.autoenviar && !pausaLarga) {
    try { await enviarFormulario(tabId, opts.marca || "", opts.enviarLabel, { idDenuncia: idDenuncia, urlForm: urlForm, modoPrueba: modoPrueba }); } catch (e) { /* el usuario puede enviar a mano */ }
    return;
  }
  // AUTOENVÍO RETIRADO por una pausa larga: se rellena y se captura igual, pero el botón
  // Enviar lo pulsa una persona. Ver PAUSA_QUE_QUITA_EL_AUTOENVIO, arriba.
  if (completado && opts.autoenviar && pausaLarga) {
    try { await activarPestana(tabId); await guardarComprobante(tabId, idDenuncia); } catch (e) {}
    await avisarDenunciaPendiente(tabId, "Denuncias RS: el formulario quedó completo y el comprobante guardado, pero la " +
      "pestaña estuvo un buen rato fuera, así que NO lo envié sola. Revísalo y pulsa Enviar tú.", "sin autoenvio");
    return;
  }
  // MODO PRUEBA: se para aquí. Ni comprobante ni aviso de "guardé el comprobante".
  if (modoPrueba) {
    ctxAvisar(tabId, "Denuncias RS · 🧪 MODO PRUEBA: terminé de rellenar. NO guardé comprobante, " +
      "NO registré denuncia y NO envié nada. Revísalo y ciérralo sin enviar.", false);
    return;
  }
  // EN CUALQUIER OTRO CASO se captura igual: red con captcha, tiempo agotado o parada.
  // La captura es la prueba de la denuncia y no puede depender de que la red permita
  // autoenvío ni de que el formulario quedara perfecto (antes solo se capturaba en el
  // caso de autoenvío completado, así que en TikTok con captcha no salía comprobante).
  // Se GUARDA lo que devolvió: decir "guardé el comprobante" sin mirarlo es mentir al
  // usuario justo sobre la prueba de su denuncia. Devuelve false si la captura falló o
  // si el modo prueba se encendió con el bucle ya en marcha.
  let hayComprobante = false;
  try { await activarPestana(tabId); hayComprobante = await guardarComprobante(tabId, idDenuncia); }
  catch (e) { /* sin comprobante: el usuario tiene el botón 📸 */ }
  // Y si la cosa no acabó bien, se DICE. Rendirse en silencio es lo que dejaba al usuario
  // esperando a una extensión que ya había terminado.
  if (porFallos || agotado) {
    await avisarDenunciaPendiente(tabId, "Denuncias RS: el formulario quedó rellenado A MEDIAS" + motivo + ". " +
      (hayComprobante
        ? "Guardé el comprobante de cómo quedó: revísalo, complétalo a mano y envíalo tú."
        : "NO pude guardar comprobante: revísalo, complétalo a mano, envíalo tú y captúralo con 📸."), "a medias");
  }
}

// ============================================================================
//  OJO: AQUÍ NO SE INYECTA EN IFRAMES, Y ES A PROPÓSITO.
//  Hubo la tentación de probar el relleno en todos los marcos
//  (`executeScript({ allFrames: true })`) por si el formulario viniera dentro de un
//  iframe. NO se hace: `executeScript` no "mide", EJECUTA Y ESCRIBE. Y como toda la
//  rama del portal nuevo de Meta se detecta POR DESCARTE (`siNoHay: C`), esos pasos se
//  ejecutarían en CUALQUIER marco que no tenga los `name` del formulario clásico —por
//  ejemplo un iframe de login de Meta o de un tercero—, y ese marco recibiría el correo,
//  el teléfono, la dirección postal y la firma de la marca (setNative dispara
//  input/change con bubbles:true, así que su JS los lee en el acto). Es una fuga de
//  datos de la marca a páginas ajenas. Se inyecta SOLO en el marco principal, siempre.
// ============================================================================

// ¿La pestaña sigue en LA PÁGINA del formulario? Mismo host (o subdominio del host del
// formulario) y ruta compatible (una prefijo de la otra, por segmentos completos).
// Sirve para anclar el bucle de abajo: si Meta redirige al LOGIN —que es justo el caso
// que dispara el bucle—, la extensión NO debe escribir ahí los datos de la marca, ni
// darle clics reales con el depurador, ni guardar esa pantalla como comprobante.
function mismaPaginaDelFormulario(urlActual, urlForm) {
  try {
    const a = new URL(urlActual), b = new URL(urlForm);
    const ha = a.host.replace(/^www\./, ""), hb = b.host.replace(/^www\./, "");
    if (!(ha === hb || ha.endsWith("." + hb))) return false;
    // Rutas en MINÚSCULAS: hay formularios cuya URL lleva mayúsculas (TikTok:
    // /legal/report/Copyright) y el sitio puede redirigir a la versión en minúsculas;
    // sin esto la comparación fallaría y el bucle se cancelaría estando en la página buena.
    const pa = a.pathname.toLowerCase().replace(/\/+$/, ""), pb = b.pathname.toLowerCase().replace(/\/+$/, "");
    // UN SOLO SENTIDO: la ruta de la PESTAÑA tiene que empezar por la del FORMULARIO,
    // nunca al revés. Aceptarlo en los dos sentidos dejaba pasar una ruta MÁS CORTA
    // como si fuera el formulario: p. ej. help.meta.com/requests (el panel de
    // solicitudes del usuario, con sus datos personales) contaba como el formulario
    // /requests/1523801815366035, y ahí el bucle habría escrito los datos de la marca
    // y habría guardado esa pantalla como comprobante de la denuncia.
    if (!pb) return pa === pb; // formulario en la raíz del sitio: solo vale la raíz
    return pa === pb || pa.indexOf(pb + "/") === 0;
  } catch (e) { return false; }
}

// Comprueba, ANTES de cada reinyección, que la pestaña sigue en la página del formulario.
// Marca `seFue`/`cancelar` en el estado del bucle si se ha ido, para que quien llama solo
// tenga que salir. Si `chrome.tabs.get` lanza (pestaña cerrada), también se sale.
async function sigueEnElFormulario(tabId, urlForm, estado) {
  if (!urlForm) return true; // sin URL de referencia no hay nada que comparar
  let t = null;
  try { t = await chrome.tabs.get(tabId); } catch (e) { estado.cancelar = true; return false; }
  if (!t || !mismaPaginaDelFormulario(t.url || "", urlForm)) { estado.cancelar = true; estado.seFue = true; return false; }
  return true;
}

// ============================================================================
//  BUCLE "INSISTIR" (OJO: NO es el autorrelleno de arriba).
//  El autorrelleno de TikTok repite SIEMPRE, porque allí van apareciendo campos nuevos.
//  Aquí el caso es otro (Meta · Derechos de autor): el formulario a veces NO está pintado
//  todavía cuando el usuario pulsa Rellenar (pantalla intermedia del portal nuevo o carga
//  lenta), así que la 1.ª pasada no reconoce NADA.
//  Por eso este bucle solo insiste MIENTRAS NO SE HAYA RELLENADO NADA: en cuanto una
//  pasada consigue algo, hace una pasada completa, dispara los clics reales y se va. Así
//  nunca reabre desplegables ni pisa lo que el usuario esté escribiendo a mano.
//  "No se rellenó nada" se mide con `hechos` (campos de verdad escritos/marcados), NO con
//  `ok`: `ok` cuenta también el paso del botón "Siguiente" cuando el botón no existe, así
//  que una página vacía devuelve ok=1 y el bucle no arrancaría jamás.
// ============================================================================
async function insistirRelleno(tabId, pasos, opts) {
  opts = opts || {};
  const urlForm = opts.urlForm || "";
  // Igual que en autorelleno: en modo prueba se rellena, pero no se envia ni se captura.
  const modoPrueba = !!opts.modoPrueba;
  if (modoPrueba) opts = Object.assign({}, opts, { autoenviar: false });
  if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; // cancela un bucle previo del mismo tab
  const estado = { cancelar: false, seFue: false };
  AUTORRELLENO[tabId] = estado; // se comparte el registro: así "detenerAutorelleno" y onRemoved también lo paran
  limpiarAvisoDelIcono(); // empieza un relleno nuevo: el aviso anterior del icono ya no aplica
  // Misma razón que en autorelleno: el comprobante tiene que ir a la denuncia que arrancó
  // ESTE bucle, no a la que estuviera en curso 3 minutos después. Si quien lo arrancó ya
  // lo fijó (el popup), se usa el suyo; si no, la denuncia en curso, como siempre.
  const idDenuncia = (opts.idDenuncia != null ? opts.idDenuncia : await denunciaEnCurso());

  // Si la pestaña NAVEGA fuera del formulario (lo típico: Meta manda al login), se corta
  // en el acto, sin esperar a la siguiente vuelta del bucle.
  const vigilarNavegacion = (id, info, tab) => {
    if (id !== tabId) return;
    const u = (info && info.url) || (tab && tab.url) || "";
    if (u && !mismaPaginaDelFormulario(u, urlForm)) { estado.cancelar = true; estado.seFue = true; }
  };
  if (urlForm) { try { chrome.tabs.onUpdated.addListener(vigilarNavegacion); } catch (e) {} }

  const fin = Date.now() + 180000; // 3 min de tope
  let ultimoFaltan = [], relleno = false, cortado = false;

  while (!estado.cancelar && Date.now() < fin) {
    await dormir(2500); // la 1.ª pasada ya la hizo el popup; aquí solo reintentamos
    if (estado.cancelar) break;
    if (!(await sigueEnElFormulario(tabId, urlForm, estado))) break; // ANCLA a la página del formulario
    let res = null;
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tabId }, // SOLO el marco principal (ver el aviso de los iframes, arriba)
        func: APLICAR,
        // `urlForm` viaja DENTRO: entre la comprobación de la línea de arriba y esta
        // inyección pasan milisegundos, y ahí cabe una navegación. Estas pasadas cortas
        // ESCRIBEN, así que necesitan el ancla igual que la pasada completa de abajo.
        args: [pasos, { unaPasada: true, urlForm: urlForm }]
      });
      res = (r && r[0] && r[0].result) || null;
    } catch (e) {
      cortado = true; break; // la pestaña se cerró o navegó fuera: salimos sin romper nada
    }
    if (res && res.faltan) ultimoFaltan = res.faltan;
    const nada = res ? (res.hechos != null ? res.hechos === 0 : res.ok === 0) : true;
    if (!nada) { relleno = true; break; } // ya hay formulario: dejamos de insistir
  }

  // Ya apareció el formulario: UNA pasada completa (sin `unaPasada`, para que el motor
  // haga sus reintentos internos) + los clics reales de radios/casillas.
  if (relleno && !estado.cancelar && (await sigueEnElFormulario(tabId, urlForm, estado))) {
    try {
      // `urlForm` dentro de las opciones: APLICAR aborta solo si al ejecutarse la página
      // ya no es el formulario (ver el aviso en motor.js).
      const r2 = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: APLICAR, args: [pasos, { urlForm: urlForm }] });
      const res2 = (r2 && r2[0] && r2[0].result) || null;
      if (res2) {
        if (res2.faltan) ultimoFaltan = res2.faltan;
        if (res2.clicsReales && res2.clicsReales.length) {
          // ANCLA OTRA VEZ. La comprobación de arriba se hizo ANTES de la pasada completa
          // de APLICAR, que tarda segundos: en ese hueco la pestaña puede haberse ido al
          // login, y `hacerClics` dispara clics REALES (de confianza, vía depurador) en las
          // coordenadas de la página que esté cargada EN ESE INSTANTE. Mismo agujero que se
          // cerró en autorelleno, donde se midieron 6 clics cayendo sobre el login.
          if (await sigueEnElFormulario(tabId, urlForm, estado)) {
            try { await hacerClics(tabId, res2.clicsReales); } catch (e) { /* radios a mano y ya */ }
          } else {
            cortado = true; // se fue: ni clics, ni comprobante, ni envío
          }
        }
      }
    } catch (e) { cortado = true; }
  }

  if (urlForm) { try { chrome.tabs.onUpdated.removeListener(vigilarNavegacion); } catch (e) {} }
  if (AUTORRELLENO[tabId] === estado) delete AUTORRELLENO[tabId];

  // La pestaña YA NO está en el formulario: ni comprobante ni envío. Esa pantalla (un
  // login, otra web…) no es la denuncia; guardarla como prueba falsearía el Registro y
  // además expondría lo que hubiera en ella. Solo se avisa.
  if (estado.seFue) {
    await avisarDenunciaPendiente(tabId, "Denuncias RS: la pestaña salió de la página del formulario, así que dejé de rellenar " +
      "(no se capturó comprobante ni se envió nada). Vuelve al formulario y pulsa Rellenar otra vez.", "se fue");
    return;
  }
  if (cortado || estado.cancelar) return; // pestaña cerrada, o lo paró el usuario / otra denuncia

  // BLINDAJE ANTI FORMULARIO EN BLANCO: si no se rellenó nada, `faltan` puede venir vacío
  // (la pasada ni siquiera devolvió resultado). Se marca a mano para que finalizarEnvio
  // —que SOLO envía con `faltan` vacío— jamás mande un formulario vacío.
  if (!relleno && !ultimoFaltan.length) ultimoFaltan = ["el formulario nunca llegó a mostrarse"];

  // A partir de aquí, exactamente lo mismo que hace hoy el flujo NO progresivo.
  try {
    if (opts.autoenviar) {
      await finalizarEnvio(tabId, opts.marca || "", opts.enviarLabel, ultimoFaltan, { idDenuncia: idDenuncia, urlForm: urlForm, modoPrueba: modoPrueba });
    } else if (modoPrueba) {
      ctxAvisar(tabId, "Denuncias RS · 🧪 MODO PRUEBA: " + (relleno
        ? "formulario rellenado."
        : "la página no llegó a mostrar el formulario en 3 minutos.") +
        " NO guardé comprobante, NO registré denuncia y NO envié nada.", !relleno);
    } else {
      await activarPestana(tabId);
      await guardarComprobante(tabId, idDenuncia);
      ctxAvisar(tabId, relleno
        ? "Denuncias RS: comprobante capturado. Resuelve el captcha y pulsa Enviar."
        : "Denuncias RS: la página no llegó a mostrar el formulario en 3 minutos. El comprobante se guardó igual; revísala y rellena a mano.",
        !relleno);
    }
  } catch (e) { /* sin comprobante: el usuario tiene el botón 📸 */ }
}

// Si se cierra la pestaña, cancela su bucle de autorrelleno.
chrome.tabs.onRemoved.addListener((tabId) => { if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; });

// Captura la PÁGINA COMPLETA (no solo el viewport) de la pestaña indicada, usando
// el permiso `debugger` que la extensión ya tiene. Devuelve { dataUrl } o { error }.
async function capturarCompleta(tabId) {
  // MODO PRUEBA: PUNTO UNICO. Aqui pasan TODAS las capturas de la extension —el
  // boton 📸 del popup, el boton flotante de la pagina y el atajo Alt+Shift+S—,
  // porque es el unico sitio con el permiso `debugger` para fotografiar la pagina
  // entera. Cortar aqui es lo que impide que una captura de prueba acabe pisando el
  // comprobante de una denuncia real (los otros dos caminos escriben el comprobante
  // ellos mismos y NO pasan por guardarComprobante). El texto se enseña tal cual en
  // el toast de la pagina, asi que va escrito para el usuario.
  if (await enModoPrueba()) {
    return { error: "🧪 Modo prueba: no se guardan comprobantes. Apágalo en el popup para capturar." };
  }
  let attached = false;
  try {
    await attach(tabId);
    attached = true;
    await cmd(tabId, "Page.enable").catch(() => {});
    await cmd(tabId, "Runtime.enable").catch(() => {});

    // 1) Forzar el render del contenido diferido (lazy) de Facebook: recorremos
    //    la página de arriba abajo en pasos, dando tiempo a que los
    //    IntersectionObserver rendericen todas las cajas (URLs, enlaces, etc.).
    for (let i = 0; i < 20; i++) {
      await cmd(tabId, "Runtime.evaluate", {
        expression: "window.scrollTo(0, " + i + " * window.innerHeight);",
      }).catch(() => {});
      await dormir(150);
      // Si ya llegamos al final del documento, dejamos de bajar.
      try {
        const fin = await cmd(tabId, "Runtime.evaluate", {
          expression:
            "(function(){var d=document.documentElement;" +
            "return (window.innerHeight + window.scrollY) >= d.scrollHeight;})()",
          returnByValue: true,
        });
        if (fin && fin.result && fin.result.value === true) break;
      } catch (x) { /* seguimos recorriendo */ }
    }
    // Volvemos arriba y damos un respiro para que se estabilice el layout.
    await cmd(tabId, "Runtime.evaluate", { expression: "window.scrollTo(0,0);" }).catch(() => {});
    await dormir(300);

    // 2) Medir la altura REAL combinando dos fuentes y tomando el MÁXIMO.
    //    (a) Page.getLayoutMetrics.
    let anchoMetrics = 0, altoMetrics = 0;
    try {
      const m = await cmd(tabId, "Page.getLayoutMetrics");
      const size = (m && (m.cssContentSize || m.contentSize)) || null;
      if (size) {
        anchoMetrics = size.width || 0;
        altoMetrics = size.height || 0;
      }
    } catch (x) { /* usamos solo el DOM si falla */ }
    //    (b) Medición vía DOM.
    let anchoDom = 0, altoDom = 0;
    try {
      const r = await cmd(tabId, "Runtime.evaluate", {
        expression:
          "(function(){var d=document;return {" +
          "w: Math.max(d.documentElement.scrollWidth, d.body?d.body.scrollWidth:0, d.documentElement.clientWidth)," +
          "h: Math.max(d.documentElement.scrollHeight, d.body?d.body.scrollHeight:0, d.documentElement.offsetHeight)" +
          "};})()",
        returnByValue: true,
      });
      const v = r && r.result && r.result.value;
      if (v) { anchoDom = v.w || 0; altoDom = v.h || 0; }
    } catch (x) { /* usamos solo metrics si falla */ }

    let width = Math.max(anchoMetrics, anchoDom);
    let height = Math.max(altoMetrics, altoDom);
    // Acotamos la altura a 30000 px máximo (evita capturas gigantes).
    if (height > 30000) height = 30000;

    // 3) Ampliar el viewport para que TODO el contenido quede "visible" y
    //    renderizado a la vez (si falla, seguimos sin override).
    let overrideOk = false;
    if (width > 0 && height > 0) {
      try {
        await cmd(tabId, "Emulation.setDeviceMetricsOverride", {
          mobile: false,
          width: Math.ceil(width),
          height: Math.ceil(height),
          deviceScaleFactor: 1,
          screenWidth: Math.ceil(width),
          screenHeight: Math.ceil(height),
        });
        overrideOk = true;
        await dormir(500);
      } catch (x) { /* seguimos sin override del viewport */ }
    }

    // 4) Capturar la página completa. Antes ocultamos NUESTRO botón flotante para
    //    que no salga en el comprobante; después lo restauramos.
    await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.dataset.prevDisplay=b.style.display; b.style.display='none';}})()" }).catch(() => {});
    const params = { format: "jpeg", quality: 70, captureBeyondViewport: true };
    if (width > 0 && height > 0) {
      params.clip = { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height), scale: 1 };
    }
    const shot = await cmd(tabId, "Page.captureScreenshot", params);
    // Restaurar el botón flotante tras la captura.
    await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.style.display=b.dataset.prevDisplay||'';}})()" }).catch(() => {});

    // 5) Limpiar el override del viewport antes de soltar el debugger.
    if (overrideOk) await cmd(tabId, "Emulation.clearDeviceMetricsOverride").catch(() => {});

    return { dataUrl: "data:image/jpeg;base64," + shot.data };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  } finally {
    // Por si la captura falló tras aplicar el override / ocultar el botón, lo
    // limpiamos y restauramos igualmente antes de soltar el debugger.
    if (attached) {
      await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.style.display=b.dataset.prevDisplay||'';}})()" }).catch(() => {});
      await cmd(tabId, "Emulation.clearDeviceMetricsOverride").catch(() => {});
      await detach(tabId);
    }
  }
}

// ============================================================================
//  ENVÍO AUTOMÁTICO de formularios web. Tras rellenar, en las redes SIN captcha
//  (Facebook/Instagram/WhatsApp/TikTok) la extensión trae la pestaña al frente, captura el
//  comprobante, muestra una cuenta atrás de 5 s (cancelable) y pulsa "Enviar" por el usuario.
//  En las redes con captcha (X/YouTube/LinkedIn) NO se envía: solo se captura y se avisa.
// ============================================================================
// "Google" = formulario de publicidad maliciosa (support.google.com/ads/troubleshooter):
// no lleva captcha, así que se captura el comprobante y se envía solo.
const REDES_AUTOENVIO = ["Facebook", "Instagram", "WhatsApp", "TikTok", "Google"];
function permiteAutoenvio(form) { return !!form && REDES_AUTOENVIO.indexOf(form.red) >= 0; }
const ENVIAR_LABEL_DEFECTO = "enviar|enviar denuncia|enviar informe|enviar reporte|submit|send|send report|send feedback";

// Trae la pestaña del formulario al frente (durante el relleno estuvo en 2.º plano) para que
// el usuario VEA la cuenta atrás / el captcha y pueda actuar. Falla en silencio si no puede.
async function activarPestana(tabId) {
  try {
    const tb = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tb && tb.windowId != null) await chrome.windows.update(tb.windowId, { focused: true });
  } catch (e) { /* la pestaña pudo cerrarse; seguimos igual */ }
}

// Reduce una imagen dataURL (jpeg) a `maxW` de ancho con OffscreenCanvas (disponible en el
// service worker). Devuelve un dataURL más liviano o el original si algo falla.
async function redimensionarSW(dataUrl, maxW, calidad) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    let w = bmp.width, h = bmp.height;
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    const canvas = new OffscreenCanvas(w, h);
    const cx = canvas.getContext("2d");
    cx.drawImage(bmp, 0, 0, w, h);
    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: calidad || 0.7 });
    const buf = new Uint8Array(await outBlob.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return "data:image/jpeg;base64," + btoa(bin);
  } catch (e) { return dataUrl; }
}

// ============================================================================
//  MODO PRUEBA (lo enciende la casilla del popup, clave `modo_prueba_denuncias`).
//  Se consulta AQUI, en el service worker, y no basta con que el popup no mande
//  `autoenviar`: los bucles duran hasta 30 minutos y para entonces el popup ya no
//  existe, y ademas el atajo de teclado y el boton flotante capturan por su cuenta.
//  Con el encendido: NI UN comprobante guardado, NI UN formulario enviado.
// ============================================================================
const CLAVE_MODO_PRUEBA_SW = "modo_prueba_denuncias";

async function enModoPrueba() {
  try {
    const g = await chrome.storage.local.get(CLAVE_MODO_PRUEBA_SW);
    return !!(g && g[CLAVE_MODO_PRUEBA_SW]);
  } catch (e) { return false; }   // sin storage, se comporta como siempre
}

// Id de la denuncia que se está tramitando AHORA. Se lee UNA vez, al arrancar un bucle
// largo, para poder fijarlo (ver guardarComprobante).
async function denunciaEnCurso() {
  try {
    const g = await chrome.storage.local.get("ultima_denuncia_registro");
    return g.ultima_denuncia_registro != null ? g.ultima_denuncia_registro : null;
  } catch (e) { return null; }
}

// Captura el formulario y lo adjunta (comprobante_img) a una denuncia del Registro.
//
// `idDenuncia` es OPCIONAL: sin él se comporta como siempre (la denuncia en curso según
// `ultima_denuncia_registro`), así que ninguna de las llamadas de siempre cambia.
// CON él se ARREGLA esto: `ultima_denuncia_registro` la pisa CADA denuncia nueva, y el
// destino se resolvía en el momento de CAPTURAR, no al empezar. Como los bucles largos
// duran ahora hasta 30 minutos y pueden convivir dos pestañas, la captura de la marca A
// —con su correo, teléfono y dirección a la vista— podía acabar pegada a la denuncia B.
// Eso falsea el Registro, que es la prueba legal del usuario. Por eso los bucles largos
// FIJAN el id al arrancar y lo pasan aquí. Devuelve bool.
async function guardarComprobante(tabId, idDenuncia) {
  try {
    // MODO PRUEBA: ni se captura. Es el cuello de botella por el que pasan TODAS las
    // capturas (popup, atajo de teclado, boton flotante, autorelleno e insistirRelleno),
    // asi que blindarlo aqui blinda todos los caminos de una vez.
    if (await enModoPrueba()) return false;
    const cap = await capturarCompleta(tabId);
    if (!cap || cap.error || !cap.dataUrl) return false;
    const img = await redimensionarSW(cap.dataUrl, 1280, 0.7);
    const g = await chrome.storage.local.get(["ultima_denuncia_registro", "denuncias_registro"]);
    const idDest = (idDenuncia != null && idDenuncia !== "") ? idDenuncia : g.ultima_denuncia_registro;
    const lista = Array.isArray(g.denuncias_registro) ? g.denuncias_registro : [];
    const ent = lista.find((x) => String(x.id) === String(idDest));
    if (!ent) return false;
    ent.comprobante_img = img;
    await chrome.storage.local.set({ denuncias_registro: lista });
    return true;
  } catch (e) { return false; }
}

// ============================================================================
//  AVISO QUE NO SE PIERDE (marca en el icono de la extensión).
//  `ctxAvisar` pinta un toast de 6 s DENTRO de la pestaña del formulario, y el caso de uso
//  es justo el contrario: mientras el bucle espera hasta 30 minutos, el usuario está en OTRA
//  pestaña (su correo). Cuando vuelve, el toast ya se borró y no se entera de que la
//  extensión se rindió. Por eso, además del toast, se marca el ICONO —el mismo mecanismo
//  que ya usa el aviso de actualización, no se inventa otro—:
//     "↑" = hay una versión nueva     "!" = la última denuncia necesita que la mires
//  La versión manda sobre el aviso porque es la que se resuelve sola al recargar.
// ============================================================================
async function pintarAvisoDelIcono() {
  try {
    const g = await chrome.storage.local.get(["estado_version", "aviso_denuncia"]);
    const hayNueva = !!(g.estado_version && g.estado_version.hayNueva);
    const hayAviso = !!(g.aviso_denuncia && g.aviso_denuncia.texto);
    // Los DOS a la vez si toca ("!↑"): antes el "↑" de la versión tapaba el "!" de una
    // denuncia a medias hasta que se aplicara la actualización, y el usuario no volvía a
    // enterarse. Caben de sobra: el icono admite unos 4 caracteres.
    await chrome.action.setBadgeText({ text: (hayAviso ? "!" : "") + (hayNueva ? "↑" : "") });
    await chrome.action.setBadgeBackgroundColor({ color: "#e8402a" });
  } catch (e) { /* sin icono que marcar: el toast ya salió */ }
}

// Avisa POR PARTIDA DOBLE: toast en la pestaña (si el usuario está mirando) + marca en el
// icono (si no lo está). `motivo` identifica el caso para el popup: "nada", "a medias",
// "se fue".
async function avisarDenunciaPendiente(tabId, texto, motivo, esError) {
  ctxAvisar(tabId, texto, esError !== false);
  try {
    await chrome.storage.local.set({ aviso_denuncia: { texto: texto, motivo: motivo || "", fecha: Date.now() } });
    await pintarAvisoDelIcono();
  } catch (e) {}
}

// El aviso ya cumplió: se limpia al abrir el popup y al empezar otro relleno.
async function limpiarAvisoDelIcono() {
  try {
    await chrome.storage.local.remove("aviso_denuncia");
    await pintarAvisoDelIcono();
  } catch (e) {}
}

// Se INYECTA en la página (función autónoma, no usa nada externo): muestra una cuenta atrás
// con botones "Cancelar" y "Enviar ahora". Devuelve una promesa que resuelve {cancelado:bool}.
function overlayEnvio(segundos, titulo) {
  return new Promise((resolve) => {
    try {
      const idc = "rs_overlay_envio";
      const viejo = document.getElementById(idc); if (viejo) viejo.remove();
      const cont = document.createElement("div"); cont.id = idc;
      cont.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;max-width:360px;" +
        "padding:16px 18px;border-radius:12px;font:600 14px system-ui,Arial,sans-serif;color:#fff;" +
        "background:#1e824c;box-shadow:0 8px 30px rgba(0,0,0,.35);";
      const t = document.createElement("div"); t.textContent = titulo || "Enviando la denuncia…"; t.style.marginBottom = "10px";
      const c = document.createElement("div"); c.style.cssText = "font-weight:400;margin-bottom:12px;line-height:1.35;";
      const fila = document.createElement("div"); fila.style.cssText = "display:flex;gap:8px;";
      const bCancel = document.createElement("button"); bCancel.textContent = "Cancelar";
      bCancel.style.cssText = "flex:1;padding:8px;border:0;border-radius:8px;background:#c0392b;color:#fff;font-weight:700;cursor:pointer;";
      const bYa = document.createElement("button"); bYa.textContent = "Enviar ahora";
      bYa.style.cssText = "flex:1;padding:8px;border:0;border-radius:8px;background:#145a32;color:#fff;font-weight:700;cursor:pointer;";
      fila.appendChild(bCancel); fila.appendChild(bYa);
      cont.appendChild(t); cont.appendChild(c); cont.appendChild(fila);
      document.body.appendChild(cont);
      let queda = segundos, terminado = false;
      const fin = (cancelado) => { if (terminado) return; terminado = true; clearInterval(iv); try { cont.remove(); } catch (e) {} resolve({ cancelado: cancelado }); };
      const pinta = () => { c.textContent = "Se enviará en " + queda + " s. Pulsa Cancelar para revisarlo y enviarlo tú."; };
      pinta();
      const iv = setInterval(() => { queda--; if (queda <= 0) fin(false); else pinta(); }, 1000);
      bCancel.onclick = () => fin(true);
      bYa.onclick = () => fin(false);
    } catch (e) { resolve({ cancelado: false }); }
  });
}

// Expresión (string) que localiza el BOTÓN de envío por su texto visible, excluyendo botones
// intermedios (siguiente/continuar/cancelar/adjuntar). Devuelve las coordenadas de su centro
// o null. Se elige el ÚLTIMO que coincide (el botón de envío suele ir al final del formulario).
function exprCoordsEnviar(labelRegexSrc) {
  return "(function(){" +
    "var norm=function(s){return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();};" +
    "var ok=new RegExp(" + JSON.stringify(labelRegexSrc) + ");" +
    "var no=/(siguiente|next|continuar|continue|cancel|cancelar|atras|back|volver|adjuntar|upload|examinar|browse|guardar borrador|save draft|anadir|add)/;" +
    "var els=Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],input[type=button],[role=button],a[role=button]'));" +
    "var cand=null;" +
    "for(var i=0;i<els.length;i++){var e=els[i];" +
      "if(e.disabled) continue;" +
      "var ar=e.getAttribute&&e.getAttribute('aria-disabled'); if(ar==='true') continue;" +
      "var txt=norm(e.innerText||e.value||(e.getAttribute&&e.getAttribute('aria-label'))||'');" +
      "if(!txt||!ok.test(txt)||no.test(txt)) continue;" +
      "var r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;" +
      "cand=e;" +
    "}" +
    "if(!cand) return null;" +
    "try{cand.scrollIntoView({block:'center'});}catch(x){}" +
    "var r2=cand.getBoundingClientRect();" +
    "return {x:Math.round(r2.left+r2.width/2), y:Math.round(r2.top+r2.height/2)};})()";
}

// Clic REAL (de confianza, vía debugger) sobre el botón de envío. React exige clics reales.
async function clicRealEnviar(tabId, labelRegexSrc) {
  let attached = false;
  try {
    await attach(tabId); attached = true;
    await cmd(tabId, "Runtime.enable").catch(() => {});
    const r = await cmd(tabId, "Runtime.evaluate", { expression: exprCoordsEnviar(labelRegexSrc), returnByValue: true });
    const c = r && r.result && r.result.value;
    if (!c) return false;
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
    return true;
  } catch (e) { return false; }
  finally { if (attached) await detach(tabId); }
}

// ============================================================================
//  ¿SE ENVIÓ DE VERDAD? (señales de solo lectura, sin permisos nuevos)
//  Hasta ahora el "denuncia enviada" salía de si se ENCONTRÓ y se pulsó el botón, no de si
//  la red aceptó nada. Con la declaración sin firmar, TikTok rechaza y al usuario se le
//  decía que estaba enviada. (El Registro no se marcaba como enviada —se queda en
//  "pendiente"—; lo engañoso era solo el aviso, pero es el que la persona lee.)
//  Esta función se INYECTA en la página y solo MIRA: no escribe, no marca, no pulsa nada.
//  Devuelve las tres señales; quien llama decide.
// ============================================================================
function SENALES_DE_ENVIO(urlForm, labelRegexSrc) {
  // SOLO BOOLEANOS: aquí NO sale ni una URL, ni recortada. La ruta se necesita para
  // decidir `rutaDeAutenticacion` y `rutaDistinta`, pero eso se calcula DENTRO de la
  // página y solo cruza el booleano. Un campo con la ruta, aunque nadie lo lea hoy, es
  // el que alguien acaba volcando a un registro, y una ruta lleva identificadores: la
  // confirmación de Meta es `/requests/1523801815366035`.
  const r = { rutaDistinta: false, hayFormulario: false, hayBoton: false,
              hayPassword: false, rutaDeAutenticacion: false };
  try {
    // ¿Esto es una pantalla de INICIO DE SESIÓN? Si lo es, ninguna de las tres señales
    // significa nada: en un login típico (usuario + contraseña, sin `.field-title` y con
    // el botón diciendo "Iniciar sesión") el recuento da `hayFormulario:false` y
    // `hayBoton:false`, o sea que las señales 2 y 3 se cumplen SOLAS dos tomas seguidas y
    // se afirmaría "enviada" sobre un login. Se mira por dos vías independientes: que haya
    // una caja de contraseña y que la ruta sea de autenticación.
    // POR SEGMENTOS COMPLETOS, NUNCA POR SUBCADENA. Es la diferencia entre que funcione y
    // que rompa cosas buenas, y está MEDIDO sobre las 23 URLs de formulario que la
    // extensión conoce más 8 pantallas legítimas y 6 de sesión caducada:
    //     por subcadena -> 5 falsos descartes de 8 legítimas | 0 malas coladas
    //     por segmentos -> 0 falsos descartes de 8 legítimas | 0 malas coladas
    // El caso que lo destapa: los formularios de suplantación de X viven bajo
    // `/es/forms/AUTHenticity/impersonation/...` y hay otro en `/auth-to-rep`. Por
    // subcadena, "auth" se los lleva por delante y X deja de confirmar envíos buenos SIN
    // QUE NADIE SE ENTERE; por segmentos, "authenticity" no es "auth" y se salvan.
    // La prueba lleva esas dos URLs como caso de control: si alguien relaja esto a
    // `indexOf`, la prueba lo dice sola.
    //
    // La lista es LARGA a propósito. Los dos modos de fallo no son simétricos: si sobra una
    // palabra, la extensión no confirma y le dice al usuario "pulsé Enviar, mira la
    // pantalla" —que es lo honesto y lo que hacía antes—; si falta, dice "denuncia
    // enviada" sobre un login, que es una mentira sobre la prueba legal del usuario.
    // Las 10 primeras las validó QA; `signup`, `challenge`, `verify` y `two-factor` se
    // midieron aparte contra las mismas 23 URLs: 0 falsos descartes cada una.
    const SEGMENTOS_DE_AUTENTICACION = [
      "login", "log-in", "log_in", "signin", "sign-in", "sign_in",
      "signup", "sign-up", "sign_up", "auth", "oauth", "authenticate", "authorize",
      "session", "checkpoint", "challenge", "verify", "accounts",
      "two-factor", "two_factor"
    ];
    // SUFIJOS: `facebook.com/login.php` es la URL de inicio de sesión canónica de Facebook,
    // y `login.php` no es el segmento `login`. Se compara también el segmento sin su
    // extensión, y se descodifica antes (`/Log%2Din` -> `log-in`). Gana además
    // `instagram.com/signin.html`. Medido: 0 falsos descartes sobre las 23 URLs reales.
    //
    // OJO, Y ESTO NO SE "MEJORA": sigue siendo comparación EXACTA, nunca por prefijo, así
    // que `/login2` y `/oauth2` NO se cubren. Es deliberado. Cubrirlos exigiría comparar
    // por prefijo, y el prefijo es justo lo que se midió como incorrecto: `authenticity`
    // empieza por `auth` y se llevaría por delante los dos formularios de suplantación de
    // X. El coste de no cubrir `/login2` es que el usuario recibe el texto honesto; el de
    // cubrirlo mal es dejar de confirmar envíos buenos sin que nadie se entere.
    try {
      const partes = (new URL(location.href)).pathname.toLowerCase().split("/").filter(Boolean);
      r.rutaDeAutenticacion = partes.some(function (x) {
        let y = x;
        try { y = decodeURIComponent(x); } catch (e) {}
        y = y.split(".")[0];   // "login.php" -> "login"
        return SEGMENTOS_DE_AUTENTICACION.indexOf(x) >= 0 ||
               SEGMENTOS_DE_AUTENTICACION.indexOf(y) >= 0;
      });
    } catch (x) {}
    // (1) MISMO sitio, RUTA DISTINTA. Ojo: irse de la ruta dentro del MISMO sitio es la
    //     señal buena —Meta y Cloudflare navegan a su pantalla de confirmación—, no un
    //     motivo para callarse. Cambiar de HOST es otra cosa y lo decide quien llama.
    try {
      const a = new URL(location.href), b = new URL(urlForm);
      const ha = a.host.replace(/^www\./, ""), hb = b.host.replace(/^www\./, "");
      const mismoSitio = (ha === hb || ha.endsWith("." + hb));
      const pa = a.pathname.toLowerCase().replace(/\/+$/, ""), pb = b.pathname.toLowerCase().replace(/\/+$/, "");
      r.rutaDistinta = mismoSitio && pa !== pb;
    } catch (x) {}
    // (2) ¿Sigue habiendo formulario? Mismo recuento que la sonda del bucle.
    try {
      const seVe = (e) => {
        const rr = e.getBoundingClientRect();
        if (rr.width < 1 && rr.height < 1) return false;
        const st = window.getComputedStyle(e);
        return st.display !== "none" && st.visibility !== "hidden";
      };
      const TIPOS = ["text", "email", "url", "tel", "number", "search", "password"];
      let cajas = 0, opciones = 0, rotulos = 0;
      const campos = document.querySelectorAll("input,textarea");
      for (let i = 0; i < campos.length; i++) {
        const e = campos[i], et = (e.tagName || "").toLowerCase(), tp = (e.type || "").toLowerCase();
        if (!seVe(e)) continue;
        if (tp === "password") r.hayPassword = true; // sale gratis: ya se recorren los input
        if (tp === "radio" || tp === "checkbox") { opciones++; continue; }
        if (et === "textarea") { cajas++; continue; }
        if (et === "input" && TIPOS.indexOf(tp) >= 0) cajas++;
      }
      const tit = document.querySelectorAll(".field-title");
      for (let j = 0; j < tit.length; j++) if (seVe(tit[j])) rotulos++;
      r.hayFormulario = (opciones >= 2 && cajas >= 1) || cajas >= 3 || rotulos >= 3;
    } catch (x) {}
    // (3) ¿Sigue estando el botón de envío?
    try {
      const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const ok = new RegExp(labelRegexSrc);
      const no = /(siguiente|next|continuar|continue|cancel|cancelar|atras|back|volver|adjuntar|upload|examinar|browse|guardar borrador|save draft|anadir|add)/;
      const els = Array.prototype.slice.call(document.querySelectorAll("button,input[type=submit],input[type=button],[role=button],a[role=button]"));
      r.hayBoton = els.some(function (e) {
        if (e.disabled) return false;
        const txt = norm(e.innerText || e.value || (e.getAttribute && e.getAttribute("aria-label")) || "");
        if (!txt || !ok.test(txt) || no.test(txt)) return false;
        const rr = e.getBoundingClientRect();
        return rr.width > 2 && rr.height > 2;
      });
    } catch (x) {}
  } catch (e) {}
  return r;
}

// Tras pulsar Enviar, MIRA la pantalla a los 3, 6 y 10 s y decide si puede afirmarse que
// se envió. Corta a los 10 s pase lo que pase. Devuelve { confirmada, porQue }.
async function confirmarEnvio(tabId, urlForm, labelRegexSrc) {
  const momentos = [3000, 3000, 4000]; // 3 s, 6 s, 10 s
  let anterior = null;
  for (let i = 0; i < momentos.length; i++) {
    await dormir(momentos[i]);
    // Si la pestaña se cerró o se fue a OTRO SITIO: no se afirma nada y no se sondea más.
    let t = null;
    try { t = await chrome.tabs.get(tabId); } catch (e) { return { confirmada: false, porQue: "la pestaña se cerró" }; }
    if (urlForm) {
      try {
        const a = new URL((t && t.url) || ""), b = new URL(urlForm);
        const ha = a.host.replace(/^www\./, ""), hb = b.host.replace(/^www\./, "");
        if (!(ha === hb || ha.endsWith("." + hb))) return { confirmada: false, porQue: "la pestaña se fue a otro sitio" };
      } catch (e) { return { confirmada: false, porQue: "no se pudo leer la dirección" }; }
    }
    let s = null;
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: SENALES_DE_ENVIO, args: [urlForm || "", labelRegexSrc] });
      s = (r && r[0] && r[0].result) || null;
    } catch (e) { s = null; }
    if (!s) { anterior = null; continue; }
    // PUERTA DE AUTENTICACIÓN, LO PRIMERO DE CADA TOMA y antes de mirar ninguna señal.
    // Va aquí y no dentro de la señal 1 porque en un login se disparan solas las TRES.
    // Se recalcula en cada toma (no hay estado): a los 3 s se suele seguir viendo el
    // formulario y no pasa nada; si a los 6 la pestaña acabó en un login, se corta.
    if (s.hayPassword || s.rutaDeAutenticacion) {
      return { confirmada: false, porQue: "la pestaña acabó en una pantalla de inicio de sesión" };
    }
    // SEÑAL (1): mismo sitio, RUTA DISTINTA. Vale SOLA a partir de la toma de los 6 s.
    // En la primera (3 s) no, porque una SPA puede empujar una ruta intermedia y volver;
    // ahí se exige que aguante a la toma siguiente. Y no se le pide siempre dos tomas: si
    // la navegación llega a los 7 s, la única que la ve es la de los 10 y no hay una cuarta
    // para confirmarla —se diría "no puedo confirmar" de un envío que sí funcionó, que es
    // justo el caso lento para el que existe esa última toma—.
    if (s.rutaDistinta && i > 0) return { confirmada: true, porQue: "la página cambió de pantalla" };
    // SEÑALES (2) y (3): siempre dos tomas seguidas. Al pulsar Enviar, React desmonta el
    // formulario un instante para pintar su spinner, y una toma única diría "confirmado"
    // sin haberse enviado nada —justo la mentira que estamos quitando—.
    if (anterior) {
      if (!s.hayFormulario && !anterior.hayFormulario) return { confirmada: true, porQue: "el formulario ya no está" };
      if (!s.hayBoton && !anterior.hayBoton) return { confirmada: true, porQue: "el botón Enviar ya no está" };
    }
    anterior = s;
  }
  return { confirmada: false, porQue: "la pantalla no cambió" };
}

// FLUJO DE ENVÍO: activar pestaña -> capturar comprobante -> cuenta atrás 5 s -> clic Enviar.
// `extra` es OPCIONAL: { idDenuncia, urlForm }. Sin él se comporta como siempre.
//   idDenuncia -> a qué denuncia del Registro se pega el comprobante (ver guardarComprobante).
//   urlForm    -> ANCLA: se comprueba ANTES de capturar y OTRA VEZ antes de pulsar Enviar.
// Lo segundo no es paranoia: entre las dos cosas hay una cuenta atrás de 5 s en la que la
// pestaña puede irse (o haberse ido ya durante la pasada de relleno, de 13,7 s medidos), y
// `clicRealEnviar` busca el botón por su TEXTO (enviar|send|submit) quedándose con el
// ÚLTIMO que case: en la pantalla de inicio de sesión de TikTok eso puede ser el botón de
// "Iniciar sesión". Si la pestaña ya no está en el formulario: ni captura, ni envío, y aviso.
async function enviarFormulario(tabId, marca, enviarLabel, extra) {
  extra = extra || {};
  const urlForm = extra.urlForm || "";
  const fueraDelFormulario = async () => {
    if (!urlForm) return false; // sin URL de referencia no hay nada que comparar
    return !(await sigueEnElFormulario(tabId, urlForm, {}));
  };
  try {
    // MODO PRUEBA: no se envia NADA, ni siquiera en las redes de autoenvio. Se comprueban
    // las DOS cosas: la bandera que trajo el mensaje (por si el usuario apaga la casilla
    // mientras un bucle de 30 min sigue vivo) y el interruptor actual del storage.
    if (extra.modoPrueba || await enModoPrueba()) {
      ctxAvisar(tabId, "Denuncias RS · 🧪 MODO PRUEBA: el formulario quedó rellenado, pero NO lo envié " +
        "ni guardé comprobante. Revísalo y ciérralo sin enviar.", false);
      return;
    }
    if (await fueraDelFormulario()) {
      await avisarDenunciaPendiente(tabId, "Denuncias RS: la pestaña salió de la página del formulario antes de enviar, " +
        "así que NO capturé comprobante ni envié nada. Vuelve al formulario y repítelo.", "se fue");
      return;
    }
    await activarPestana(tabId);
    await guardarComprobante(tabId, extra.idDenuncia); // el comprobante queda en el Registro antes de enviar
    let cancelado = false;
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId }, func: overlayEnvio, args: [5, "Denuncias RS: enviando la denuncia de «" + marca + "»"] });
      cancelado = !!(r && r[0] && r[0].result && r[0].result.cancelado);
    } catch (e) { cancelado = false; }
    if (cancelado) { ctxAvisar(tabId, "Denuncias RS: envío cancelado. Revísalo y pulsa Enviar cuando quieras (el comprobante ya se guardó).", false); return; }
    // Última comprobación, ya pegada al clic: durante los 5 s de la cuenta atrás la pestaña
    // ha podido navegar (o el propio sitio mandar al login).
    if (await fueraDelFormulario()) {
      await avisarDenunciaPendiente(tabId, "Denuncias RS: la pestaña salió del formulario durante la cuenta atrás, " +
        "así que NO pulsé Enviar. Vuelve al formulario y envíalo tú.", "se fue");
      return;
    }
    const etiqueta = enviarLabel || ENVIAR_LABEL_DEFECTO;
    const ok = await clicRealEnviar(tabId, etiqueta);
    if (!ok) {
      ctxAvisar(tabId, "Denuncias RS: no encontré el botón «Enviar». Revisa y envíalo tú (el comprobante ya se guardó).", true);
      return;
    }
    // Se pulsó el botón. Eso NO es lo mismo que "la red lo aceptó": hay que mirar.
    const conf = await confirmarEnvio(tabId, urlForm, etiqueta);
    ctxAvisar(tabId, conf.confirmada
      ? "Denuncias RS: denuncia enviada (" + conf.porQue + "). El comprobante quedó guardado en el Registro."
      // Sin señal NO se afirma que se envió: se dice exactamente lo que pasó.
      : "Denuncias RS: pulsé el botón Enviar. Mira la pantalla para confirmar que la red lo aceptó; " +
        "si sale un número de caso, apúntalo en el Registro. El comprobante ya se guardó.",
      !conf.confirmada);
  } catch (e) { /* si algo falla, el usuario envía a mano */ }
}

// Formulario NO progresivo ya rellenado: si faltan campos requeridos, avisa; si no, envía.
// `extra` (opcional) = { idDenuncia, urlForm }; se pasa tal cual a enviarFormulario.
async function finalizarEnvio(tabId, marca, enviarLabel, faltan, extra) {
  extra = extra || {};
  if (faltan && faltan.length) {
    // SIEMPRE se captura el comprobante, aunque falten campos: la captura es la prueba de
    // la denuncia y el usuario la necesita igual (antes esto se salía sin capturar, y como
    // casi siempre falta algún campo, parecía que la extensión había dejado de capturar).
    // Salvo que la pestaña ya no esté en el formulario: entonces la foto sería de otra
    // pantalla y falsearía el Registro.
    if (extra.urlForm && !(await sigueEnElFormulario(tabId, extra.urlForm, {}))) {
      await avisarDenunciaPendiente(tabId, "Denuncias RS: la pestaña salió de la página del formulario, " +
        "así que no capturé comprobante. Vuelve al formulario y repítelo.", "se fue");
      return;
    }
    await activarPestana(tabId);
    await guardarComprobante(tabId, extra.idDenuncia);
    ctxAvisar(tabId, "Denuncias RS: para «" + marca + "» faltan datos (" + faltan.join(", ") +
      "). Complétalos y pulsa Enviar tú. El comprobante ya se capturó.", true);
    return;
  }
  await enviarFormulario(tabId, marca, enviarLabel, extra);
}

// ============================================================================
//  ATAJO DE TECLADO (Alt+Shift+S por defecto): dispara la captura del formulario
//  en el CONTENT SCRIPT (captura_flotante.js), que sí tiene DOM y reutiliza el
//  método probado del popup (Image + canvas). El worker ya NO redimensiona ni
//  guarda: solo produce el screenshot de página completa vía `capturarCompleta`.
// ============================================================================

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "capturar_comprobante") return;
  // Pestaña del formulario (la activa de la ventana enfocada).
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && tab.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { accion: "disparaCaptura" });
    } catch (e) { /* pestaña sin content script (chrome://, PDF, etc.) */ }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Solo aceptamos mensajes de los propios contextos de la extensión
  // (popup/options/content script propio), nunca de páginas o extensiones
  // externas (blindaje ante futuros cambios de config).
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (msg && msg.accion === "clicsReales") {
    // El popup manda `msg.tabId`; el VIGILANTE (mundo isolated) no lo conoce, así que
    // usamos la pestaña del emisor (`sender.tab.id`), igual que en `capturaCompleta`.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (!tabId) return; // sin pestaña: nada que clicar
    // ANCLA. Este es el camino que usa el popup en CADA relleno, o sea TODAS las redes.
    // Entre la pasada de APLICAR del popup (segundos) y este mensaje la pestaña puede
    // haberse ido, y aquí se dan clics REALES con el depurador sobre lo que haya cargado.
    // `urlForm` es OPCIONAL por retrocompatibilidad, PERO hoy no hay ningún emisor sin
    // ella: el único que manda `clicsReales` es popup.js y sí la pone. O sea que la rama
    // sin ancla no la usa nadie. Si algún día se añade otro emisor (un content script, un
    // vigilante inyectado…) y se olvida el `urlForm`, se quedará SIN ancla y en silencio.
    (async () => {
      if (msg.urlForm && !(await sigueEnElFormulario(tabId, msg.urlForm, {}))) {
        ctxAvisar(tabId, "Denuncias RS: la pestaña salió de la página del formulario, así que no marqué las opciones.", true);
        return { ok: 0, fuera: true };
      }
      return hacerClics(tabId, msg.selectores || []);
    })().then(sendResponse, () => sendResponse({ ok: 0 }));
    return true; // respuesta asíncrona
  }
  if (msg && msg.accion === "capturaCompleta") {
    // El popup manda `msg.tabId`; el content script no lo conoce, así que
    // usamos la pestaña del emisor (`sender.tab.id`).
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) { capturarCompleta(tabId).then(sendResponse); return true; }
    return; // sin pestaña: nada que capturar
  }
  if (msg && msg.accion === "iniciarAutorelleno") {
    // El popup pide que el service worker siga rellenando la 2.ª etapa por su cuenta.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    // `urlForm` ANCLA el bucle a la página del formulario, igual que en insistirRelleno: si la
    // pestaña se va (TikTok manda a iniciar sesión, el usuario navega), el bucle para en vez de
    // escribir los datos de la marca en otra pantalla o guardarla como comprobante.
    // `modoPrueba` e `idDenuncia` son OPCIONALES: un mensaje viejo sin ellos se comporta
    // exactamente como antes (idDenuncia -> la denuncia en curso; modoPrueba -> false).
    if (tabId && Array.isArray(msg.pasos)) autorelleno(tabId, msg.pasos, { autoenviar: !!msg.autoenviar, marca: msg.marca, enviarLabel: msg.enviarLabel, urlForm: msg.urlForm || "", idDenuncia: msg.idDenuncia, modoPrueba: !!msg.modoPrueba }); // bucle en segundo plano; envía al completar si procede
    sendResponse({ ok: true });
    return; // no necesitamos mantener el canal abierto
  }
  if (msg && msg.accion === "insistirRelleno") {
    // La 1.ª pasada del popup no reconoció NINGÚN campo (Meta · Derechos de autor suele
    // tardar en pintar el formulario, o lo mete en un iframe). El service worker reintenta
    // solo hasta 3 min: el usuario NO tiene que volver a pulsar Rellenar.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    // `urlForm` ANCLA el bucle a la página del formulario: sin ella el bucle escribiría en
    // lo que la pestaña muestre en ese momento (p. ej. el login al que redirige Meta).
    if (tabId && Array.isArray(msg.pasos)) insistirRelleno(tabId, msg.pasos, { autoenviar: !!msg.autoenviar, marca: msg.marca, enviarLabel: msg.enviarLabel, urlForm: msg.urlForm || "", idDenuncia: msg.idDenuncia, modoPrueba: !!msg.modoPrueba });
    sendResponse({ ok: true });
    return; // no necesitamos mantener el canal abierto
  }
  if (msg && msg.accion === "finalizar") {
    // Formulario NO progresivo ya rellenado: en redes sin captcha, captura + envía solo;
    // en las de captcha, captura + avisa. Corre en el service worker (sobrevive a cerrar el popup).
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) {
      // Este es el camino de los formularios NO progresivos (Meta, Cloudflare, Google, X,
      // LinkedIn), o sea la mayoría. `urlForm` ANCLA la captura y el envío, e `idDenuncia`
      // fija a qué denuncia del Registro va el comprobante: los dos son OPCIONALES, así que
      // un mensaje viejo sin ellos se comporta exactamente como antes.
      const extra = { idDenuncia: msg.idDenuncia, urlForm: msg.urlForm || "", modoPrueba: !!msg.modoPrueba };
      (async () => {
        if (msg.autoenviar) { await finalizarEnvio(tabId, msg.marca || "", msg.enviarLabel, msg.faltan || [], extra); return; }
        if (extra.urlForm && !(await sigueEnElFormulario(tabId, extra.urlForm, {}))) {
          await avisarDenunciaPendiente(tabId, "Denuncias RS: la pestaña salió de la página del formulario, así que no " +
            "capturé comprobante. Vuelve al formulario y pulsa Rellenar otra vez.", "se fue");
          return;
        }
        // En modo prueba no se captura (guardarComprobante lo corta) y tampoco se activa
        // la pestaña: se dice lo que de verdad pasó, no "comprobante capturado".
        if (extra.modoPrueba || await enModoPrueba()) {
          ctxAvisar(tabId, "Denuncias RS · 🧪 MODO PRUEBA: formulario rellenado. NO guardé comprobante " +
            "ni registré denuncia. Revísalo y ciérralo sin enviar.", false);
          return;
        }
        await activarPestana(tabId);
        await guardarComprobante(tabId, extra.idDenuncia);
        ctxAvisar(tabId, "Denuncias RS: comprobante capturado. Resuelve el captcha y pulsa Enviar.", false);
      })().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true; // respuesta asíncrona
    }
    return;
  }
  if (msg && msg.accion === "limpiarAvisoDenuncia") {
    // El popup se abrió: el usuario ya está mirando, el "!" del icono ya cumplió.
    limpiarAvisoDelIcono();
    sendResponse({ ok: true });
    return;
  }
  if (msg && msg.accion === "detenerAutorelleno") {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId && AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true;
    return;
  }
  // El popup abrió/rellenó una denuncia en esta pestaña: queda MARCADA como pestaña de
  // denuncia para que el botón "📸 Capturar comprobante" se vea aquí (y siga viéndose
  // al avanzar el formulario, que recarga la página). Ver marcarPestanaDeDenuncia.
  // El popup pregunta si esta PC/navegador tiene la última versión (y fuerza la
  // comprobación al abrirse, para no esperar a la ronda de cada hora).
  if (msg && msg.accion === "comprobarActualizacion") {
    comprobarActualizacion("popup").then(
      () => chrome.storage.local.get("estado_version").then((g) => sendResponse(g.estado_version || null)),
      () => sendResponse(null));
    return true; // respuesta asíncrona
  }
  if (msg && msg.accion === "activarCaptura") {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) marcarPestanaDeDenuncia(tabId);
    sendResponse({ ok: true });
    return;
  }
});

// ============================================================================
//  MENÚ CONTEXTUAL (clic derecho) — aparece en CUALQUIER página del navegador.
//  Estructura:  🚩 Denuncias RS ▸ [cada MARCA] ▸ ("✍ Rellenar ESTA página" + TODOS
//  los formularios).  "Rellenar ESTA página" autodetecta el formulario por la URL de
//  la pestaña actual y lo rellena.  Cada formulario ABRE la denuncia (los web en una
//  pestaña nueva y la rellena; los de correo generan el borrador) con esa marca — así
//  se denuncia desde donde sea, no solo estando en el formulario.
//  Reutiliza los mismos planes (FORMULARIOS), datos de marca (MARCAS = base + editadas
//  − eliminadas) y URLs del Excel que el popup. Justificación: ESPAÑOL en formularios
//  web (regla del proyecto); en los correos se conserva el bilingüe en/es.
// ============================================================================
const CLAVE_URLS_CTX = "urls_denuncia";        // misma clave que el popup (CLAVE_URLS)
const CLAVE_URLS_MANUALES_CTX = "urls_manuales"; // las 1-2 URLs escritas a mano en el popup
const CLAVE_AVISO_EXCEL_CTX = "aviso_del_excel";  // por qué ya no está el Excel (lo pinta el popup)
const RS_CONTEXTS = ["page", "frame", "selection", "link", "image", "editable"];
const rsEnc = (s) => encodeURIComponent(String(s)); // marca -> id de menú (nunca lleva '|')
const rsDec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

// Limpia una lista de correos EXACTAMENTE igual que ⚙ Marcas (depurar_lista_de_correos de
// opciones.js) y que depurar_correos_de_marca del popup: parte los pegados con coma o punto
// y coma, quita los caracteres de control (un "\r\n" en el remitente permitiría colar
// cabeceras de correo), recorta, tira los vacíos y quita los repetidos SIN distinguir
// mayúsculas conservando el PRIMERO (para no cambiar cuál es el principal).
function ctxDepurarCorreosDeMarca(lista) {
  const vistos = new Set();   // Set y no objeto: un correo "__proto__" no debe romper nada
  const limpia = [];
  (lista || []).forEach((crudo) => {
    String(crudo == null ? "" : crudo).split(/[,;]+/).forEach((trozo) => {
      const texto = trozo.replace(/[\x00-\x1f\x7f]/g, "").trim();
      if (!texto) return;
      const llave = texto.toLowerCase();
      if (vistos.has(llave)) return;
      vistos.add(llave);
      limpia.push(texto);
    });
  });
  return limpia;
}

// Deja `correos` (array con TODOS, el 1.º el principal) y `correo` (string) coherentes.
// Si `correos` NO EXISTE se deriva partiendo `correo` por comas (MARCAS_BASE y las marcas
// guardadas antes de que se creara el campo). Si EXISTE manda ella aunque esté vacía:
// vacía = el usuario borró todos los correos en ⚙ Marcas, y entonces tampoco se hereda el
// `correo` de la base (si no, el menú del clic derecho seguiría usando un correo borrado).
// El principal es SIEMPRE el primero de la lista, la misma regla que ⚙ Marcas (insignia
// «Principal») y que normalizar_correos_de_marca() del popup: si cada parte lo decidiera
// a su manera, la denuncia se firmaría con un correo distinto del que enseña el panel.
function ctxNormalizarCorreosDeMarca(o) {
  o.correos = ctxDepurarCorreosDeMarca(Array.isArray(o.correos) ? o.correos : [o.correo]);
  o.correo = o.correos[0] || "";
  return o;
}

// Marcas: base + editadas − eliminadas (idéntico a obtener_marcas() del popup).
async function ctxObtenerMarcas() {
  const d = await chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"]);
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  const PELIGROSA = (k) => k === "__proto__" || k === "constructor" || k === "prototype";
  const todas = Object.assign({}, self.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    if (PELIGROSA(m)) return; // evita contaminación de prototipo por un nombre de marca malicioso
    const base = self.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => {
      if (PELIGROSA(k)) return;
      // `correos` es una LISTA que el usuario puede DEJAR VACÍA en ⚙ Marcas: si el campo
      // está guardado se respeta tal cual. Con la regla general ("lo vacío no pisa") un
      // correo borrado reaparecía y el menú del clic derecho lo volvía a usar.
      if (k === "correos") { o.correos = g[k]; return; }
      if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k];
    });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  Object.keys(todas).forEach((m) => { todas[m] = ctxNormalizarCorreosDeMarca(Object.assign({}, todas[m])); });
  return todas;
}

// Detecta qué formulario web corresponde a la URL de la pestaña (mismo dominio raíz
// + la ruta del formulario más específica que sea prefijo de la ruta de la pestaña).
function ctxDetectarForm(urlTab) {
  let host = "", path = "";
  try { const u = new URL(urlTab); host = u.host.replace(/^www\./, ""); path = (u.pathname || "").toLowerCase(); }
  catch (e) { return null; }
  let mejor = null, mejorLargo = -1;
  Object.keys(self.FORMULARIOS).forEach((k) => {
    const f = self.FORMULARIOS[k];
    if (!f.url || f.tipo === "email") return; // los reportes por correo no se rellenan en página
    let fh = "", fp = "";
    try { const fu = new URL(f.url); fh = fu.host.replace(/^www\./, ""); fp = (fu.pathname || "").toLowerCase(); }
    catch (e) { return; }
    // Sitio del formulario, p.ej. tiktok.com. OJO al añadir formularios: si alguno llegara
    // a estar en un dominio de DOS niveles (algo.com.mx, algo.co.uk), este slice(-2) daría
    // "com.mx" y valdría CUALQUIER web de ese país -> habría que tratarlo aparte.
    // Hoy todos los formularios son .com planos (facebook, instagram, meta, tiktok,
    // google, linkedin, github, x), así que la raíz de dos etiquetas es correcta.
    const raiz = fh.split(".").slice(-2).join(".");
    // La pestaña tiene que SER ese sitio o un subdominio suyo. Antes se comparaba por
    // subcadena (y en los dos sentidos), y así colaban webs falsas como
    // "instagram.com.tienda-falsa.ru", "notfacebook.com" o "facebook.com.cdn-x.io":
    // la extensión creía estar en el formulario bueno y escribía en ESA página los datos
    // de la marca (correo, teléfono, país, perfiles oficiales, N.º de registro). Y es el
    // caso normal, porque el usuario suele estar en la web que va a denunciar.
    if (host !== raiz && !host.endsWith("." + raiz)) return;
    if (fp && fp.length > 1 && path.indexOf(fp) === 0) {         // ruta distintiva coincide
      if (fp.length > mejorLargo) { mejor = k; mejorLargo = fp.length; }
    } else if (mejorLargo < 0) {                                  // solo coincide el dominio
      mejor = mejor || k;
    }
  });
  return mejor;
}

// ---------------------------------------------------------------------------
//  EL EXCEL ES DE UN SOLO USO (la parte del clic derecho)
// ---------------------------------------------------------------------------
// La lista del Excel (`urls_denuncia`, la misma clave que el popup) vale para UNA
// denuncia y para ninguna más: si se quedara, la siguiente —a menudo de OTRA marca—
// se llevaría los mismos enlaces sin que nadie lo dijera. Por el clic derecho eso era
// lo más fácil de que pasara: es la vía rápida, sin popup donde ver lo que hay puesto.
// Se deja escrito el motivo en `aviso_del_excel` para que el popup lo explique cuando
// se abra ("El Excel ya se usó en esa denuncia y se limpió"), en vez de quedarse mudo.
async function ctxLimpiarExcelDeUnSoloUso() {
  try {
    const g = await chrome.storage.local.get([CLAVE_URLS_CTX]);
    const urls = Array.isArray(g[CLAVE_URLS_CTX]) ? g[CLAVE_URLS_CTX] : [];
    if (!urls.length) return false;
    await chrome.storage.local.remove([CLAVE_URLS_CTX]);
    await chrome.storage.local.set({ [CLAVE_AVISO_EXCEL_CTX]: "denuncia" });
    return true;
  } catch (e) { return false; }   // el Excel es ayuda: nunca debe romper la denuncia
}

// Da de alta la denuncia y, JUSTO DESPUÉS, agota el Excel que se usó en ella.
// POR QUÉ AQUÍ: por el clic derecho no hay «¿se rellenó bien?» que contestar —la fila
// entra en el Registro ya confirmada—, así que el alta ES el momento en que la denuncia
// queda hecha. Es el único punto de esta ruta por el que pasan los tres caminos
// (rellenar esta página, abrir el formulario en otra pestaña y generar el correo).
// EL ORDEN IMPORTA, y por eso la limpieza va envolviendo al alta y no dentro de ella:
// las URLs que usa esta denuncia ya se leyeron en ctxArmar() y viajan en `ctx.urls`
// (memoria), así que borrarlas del storage AHORA no le quita nada a la denuncia en
// curso; pero borrarlas ANTES del alta dejaría el Excel gastado por una denuncia que
// todavía podría no registrarse.
// En MODO PRUEBA el alta devuelve null (no entra nada en el Registro) y el Excel se
// limpia IGUAL: es de un solo uso, sin excepciones, como en el popup y en el correo.
async function ctxRegistrarDenuncia(marca, form, urlDen) {
  const id = await ctxAltaEnElRegistro(marca, form, urlDen);
  await ctxLimpiarExcelDeUnSoloUso();
  return id;
}

// El alta de siempre: registra —o reutiliza— una entrada "pendiente" (anti doble-clic),
// igual que el popup.
async function ctxAltaEnElRegistro(marca, form, urlDen) {
  // MODO PRUEBA: por el clic derecho no puede entrar NADA en el Registro. Se corta
  // dentro de la funcion (no en cada una de sus llamadas) para que ninguna se quede
  // fuera. Devuelve null: quien llame tiene que aguantar quedarse sin id, y de hecho
  // le conviene —sin id no hay a que pegar un comprobante ni un correo—.
  // Aqui NO hay donde preguntar «¿se relleno bien?» como en el popup, asi que la fila
  // no se crea siquiera: no tendria quien la confirmara ni quien la descartara.
  if (await enModoPrueba()) return null;
  const CLAVE = "denuncias_registro";
  const g = await chrome.storage.local.get([CLAVE]);
  const lista = Array.isArray(g[CLAVE]) ? g[CLAVE] : [];
  const plataforma = form.red;
  const tipo = form.tipo === "email" ? "correo" : "formulario";
  const categoria = form.nombre;
  // "Enviado a" (columna del Registro): el sitio concreto del enlace denunciado.
  const destino = (self.CORREOS_DENUNCIA && urlDen) ? self.CORREOS_DENUNCIA.dominio_de(urlDen) : "";
  const VENTANA = 60 * 1000, ahora = Date.now();
  // NO se adopta una denuncia PROVISIONAL del popup (una que todavia esta esperando a
  // que el usuario confirme si el formulario se relleno bien): el menu del clic derecho
  // no tiene donde preguntar, asi que crea siempre la suya y el Registro la muestra ya.
  const existente = lista.find((d) =>
    d.estado === "pendiente" && d.provisional !== true && d.marca === marca && d.plataforma === plataforma &&
    d.categoria === categoria && (ahora - new Date(d.fecha).getTime()) < VENTANA);
  if (existente) {
    if (urlDen && !existente.url_denunciada) existente.url_denunciada = urlDen; // guarda el enlace clicado
    if (destino && !existente.destino) existente.destino = destino;
    await chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: existente.id });
    return existente.id;
  }
  // Las PROVISIONALES no cuentan para el consecutivo: si acaban descartadas, su numero
  // habria quedado como un hueco en la numeracion de esa marca.
  const consecutivo = lista.filter((d) => d.marca === marca && d.provisional !== true)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({ id, marca, plataforma, tipo, categoria, destino, url_denunciada: urlDen || "", numero_caso: "",
    estado: "pendiente", consecutivo, notas: "", fecha: new Date().toISOString() });
  await chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: id });
  return id;
}

// Muestra un aviso breve DENTRO de la página (toast), sin permiso de notificaciones.
function ctxAvisar(tabId, texto, esError) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (t, err) => {
      try {
        const id = "rs_toast_denuncias";
        let d = document.getElementById(id);
        if (!d) { d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
        d.textContent = t;
        d.style.cssText = "position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);" +
          "max-width:90vw;padding:12px 18px;border-radius:10px;font:600 14px system-ui,Arial,sans-serif;" +
          "color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);background:" + (err ? "#c0392b" : "#1e824c") + ";";
        clearTimeout(window.__rs_toast_t);
        window.__rs_toast_t = setTimeout(() => { try { d.remove(); } catch (e) {} }, 6000);
      } catch (e) {}
    },
    args: [String(texto), !!esError]
  }).catch(() => {});
}

// Adjunta a la denuncia el CONTENIDO del correo generado (para verlo/copiarlo en el
// Registro), igual que guardar_correo_en_denuncia() del popup.
async function ctxGuardarCorreo(id, em) {
  if (!id || !em) return;
  const CLAVE = "denuncias_registro";
  const g = await chrome.storage.local.get([CLAVE]);
  const lista = Array.isArray(g[CLAVE]) ? g[CLAVE] : [];
  const d = lista.find((x) => String(x.id) === String(id));
  if (!d) return;
  d.correo = { to: em.to || "", asunto: em.asunto || "", cuerpo: em.cuerpo || "",
    asunto_es: em.asunto_es || "", cuerpo_es: em.cuerpo_es || "", enviado: false, fecha: new Date().toISOString() };
  await chrome.storage.local.set({ [CLAVE]: lista });
}

// Espera a que la pestaña `tabId` termine de cargar (o 15 s como tope).
function ctxEsperarCarga(tabId) {
  return new Promise((resolve) => {
    const l = (id, info) => { if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
    setTimeout(() => { try { chrome.tabs.onUpdated.removeListener(l); } catch (e) {} resolve(); }, 15000);
  });
}

// Arma el contexto (marca + formulario). Justificación en ESPAÑOL para formularios
// web (regla del proyecto); para los reportes por CORREO se conserva el bilingüe
// (justif=en, justif_es=es) porque Telegram y otros usan ambos. Devuelve {ctx, form,
// datos} o null si falta la marca o el formulario.
async function ctxArmar(marca, formKey, urlsOverride) {
  // El service worker se duerme y al despertar solo tiene los formularios de fábrica:
  // si la denuncia es de una plataforma creada por el usuario, hay que recargarla.
  if (!self.FORMULARIOS[formKey]) await ctxCargarPlataformasDeUsuario();
  const form = self.FORMULARIOS[formKey];
  const MARCAS = await ctxObtenerMarcas();
  const datos = MARCAS[marca];
  if (!form || !datos) return null;
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  const esCorreo = form.tipo === "email";
  // Toda descripción lleva: justificación + política infringida + PERFIL OFICIAL de la
  // marca en la red que se está denunciando (para que la plataforma sepa cuál es la
  // cuenta auténtica). Ver JUSTIF.conPerfilOficial.
  // Mismo criterio que el popup (un solo sitio lo decide): si lo denunciado es un PERFIL
  // que usurpa la marca, va la plantilla larga con los datos registrales y las TRES
  // politicas de esa red; si no, el texto de siempre. Ver JUSTIF.descripcionDeDenuncia.
  const lang = esCorreo ? "en" : "es";
  const justif = self.JUSTIF.descripcionDeDenuncia(form.cat, formKey, redCode, marca, datos, form.red, lang).texto;
  const justif_es = self.JUSTIF.descripcionDeDenuncia(form.cat, formKey, redCode, marca, datos, form.red, "es").texto;
  const g = await chrome.storage.local.get([CLAVE_URLS_CTX, CLAVE_URLS_MANUALES_CTX]);
  const urlsExcel = Array.isArray(g[CLAVE_URLS_CTX]) ? g[CLAVE_URLS_CTX] : [];
  const urlsManuales = Array.isArray(g[CLAVE_URLS_MANUALES_CTX]) ? g[CLAVE_URLS_MANUALES_CTX] : [];
  // Prioridad: 1) clic derecho SOBRE un enlace (o imagen/selección con URL) — ese enlace
  // es el que se denuncia; 2) las URLs escritas a mano en el popup; 3) la lista del Excel.
  const urls = (Array.isArray(urlsOverride) && urlsOverride.length) ? urlsOverride
             : (urlsManuales.length ? urlsManuales : urlsExcel);
  const ctx = { marca, datos, justif, justif_es, correoPersona: self.CORREO_PERSONA, urls };
  return { ctx, form, datos };
}

// ¿Tenemos permiso de Chrome para escribir en el sitio de ESE formulario? Sin él,
// executeScript falla con "Cannot access contents of the page..." y no se rellena nada.
// Desde el service worker NO se puede PEDIR el permiso (Chrome exige un gesto del
// usuario en una página), así que aquí solo se comprueba: si falta, se avisa y se
// manda al popup, que sí puede pedirlo.
async function ctxHayPermisoPara(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    return await chrome.permissions.contains({ origins: [u.origin + "/*"] });
  } catch (e) { return true; }   // ante la duda, que lo intente
}

// El REMITENTE (datos.correo) es el correo de contacto que va en el formulario y el "De:"
// del correo de denuncia. Desde que una marca puede quedarse SIN correos (se borran todos
// en ⚙ Marcas) esto podía salir vacío y la denuncia se iba sin forma de contactar a quien
// denuncia, sin avisar. Devuelve true si falta (y entonces NO se denuncia).
// La comprobación se hace SIEMPRE, haya o no pestaña donde pintar el aviso: en
// chrome.contextMenus.onClicked el parámetro `tab` es OPCIONAL, y cuando llega vacío una
// guardia condicionada a él se saltaba entera y el correo salía igual, sin remitente.
// Lo único que depende de la pestaña es el aviso.
function ctxFaltaElCorreo(tabId, marca, datos) {
  if (String((datos || {}).correo || "").trim()) return false;
  if (tabId) {
    ctxAvisar(tabId, "Denuncias RS: la marca «" + marca + "» no tiene correo desde el que denunciar. " +
      "Agrégalo en ⚙ Marcas (o con el botón + del popup) y vuelve a intentarlo.", true);
  }
  return true;
}

// ============================================================================
//  BOTÓN FLOTANTE "📸 Capturar comprobante": pestañas de DENUNCIA
//  El botón NO debe salir mientras uno solo navega por la red social, pero SÍ
//  durante toda la denuncia (es la prueba de que se hizo). Por eso la pestaña
//  donde se abre/rellena un formulario queda MARCADA: se le avisa al content
//  script ahora y CADA VEZ que esa pestaña termine de cargar, porque el
//  formulario navega entre pasos y cada carga reinyecta el content script (que
//  arranca oculto). La marca vive en storage.session para sobrevivir a que el
//  service worker se duerma, y se borra al cerrar la pestaña.
// ============================================================================
const CLAVE_PESTANAS_DENUNCIA = "pestanas_de_denuncia";

async function pestanasDeDenuncia() {
  try {
    const g = await chrome.storage.session.get([CLAVE_PESTANAS_DENUNCIA]);
    return Array.isArray(g[CLAVE_PESTANAS_DENUNCIA]) ? g[CLAVE_PESTANAS_DENUNCIA] : [];
  } catch (e) { return []; }
}

// Avisa al content script de una pestaña de que la extensión se ha ACTIVADO ahí, para que
// muestre el botón flotante de capturar comprobante. Silencioso si la página no lo tiene.
// Se reintenta un par de veces: si la página acaba de cargar, el content script puede
// tardar un instante en registrar su listener (run_at: document_idle).
function activarBotonCaptura(tabId, intentos) {
  const quedan = (typeof intentos === "number") ? intentos : 3;
  try {
    chrome.tabs.sendMessage(tabId, { accion: "activarBotonCaptura" }, () => {
      const err = chrome.runtime.lastError; // aún sin content script escuchando
      if (err && quedan > 0) setTimeout(() => activarBotonCaptura(tabId, quedan - 1), 700);
    });
  } catch (e) { /* la pestaña no admite content scripts */ }
}

// Marca la pestaña como "pestaña de denuncia" y muestra ya el botón en ella.
async function marcarPestanaDeDenuncia(tabId) {
  if (!tabId) return;
  activarBotonCaptura(tabId);
  try {
    const lista = await pestanasDeDenuncia();
    if (lista.indexOf(tabId) < 0) {
      lista.push(tabId);
      await chrome.storage.session.set({ [CLAVE_PESTANAS_DENUNCIA]: lista });
    }
  } catch (e) { /* sin storage.session: el botón igual se activó arriba */ }
}

// Cada vez que una pestaña MARCADA termina de cargar (el formulario avanza de paso,
// se recarga o se navega dentro del asistente), se vuelve a mostrar el botón.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  pestanasDeDenuncia().then((lista) => {
    if (lista.indexOf(tabId) >= 0) activarBotonCaptura(tabId);
  });
});

// Al cerrar la pestaña se olvida (los ids de pestaña se reutilizan).
chrome.tabs.onRemoved.addListener((tabId) => {
  pestanasDeDenuncia().then((lista) => {
    const i = lista.indexOf(tabId);
    if (i < 0) return;
    lista.splice(i, 1);
    try { chrome.storage.session.set({ [CLAVE_PESTANAS_DENUNCIA]: lista }); } catch (e) {}
  });
});

// Ejecuta un plan (APLICAR + clics reales + autorrelleno persistente) en una pestaña.
// Si la marca no tiene PAÍS (campo obligatorio en los formularios de Meta y compañía) se
// avisa y no se sigue: sin él el formulario no deja avanzar y el usuario se queda con un
// "This field is required" sin explicación.
// `urlEsperada` es la página en la que TIENE que estar la pestaña para rellenar. Por
// defecto es la del plan (la que la extensión acaba de abrir); "Rellenar ESTA página"
// pasa la URL que el usuario tenía y que ctxDetectarForm ya validó, porque ahí el
// formulario bueno puede estar en otra ruta del mismo sitio.
async function ctxEjecutarPlan(tabId, plan, marca, form, datos, urlEsperada) {
  // ANCLA A LA PÁGINA DEL FORMULARIO (misma razón que en insistirRelleno).
  // Hasta aquí se abría la pestaña, se esperaba a "complete" + 1,8 s y se inyectaba el
  // plan SIN mirar en qué URL había acabado. Si Meta redirige al LOGIN, el paso
  // fillLabel «correo electronico|email address» casa con "Correo electrónico o número
  // de teléfono" de esa pantalla: se escribiría ahí el correo de la marca, se le darían
  // clics reales con el depurador y se guardaría esa pantalla como comprobante de la
  // denuncia. Si la pestaña no está donde debe: se avisa y no se toca NADA.
  const urlDeReferencia = urlEsperada || (plan && plan.url) || "";
  if (urlDeReferencia) {
    let t = null;
    try { t = await chrome.tabs.get(tabId); } catch (e) { return; } // pestaña cerrada
    if (!t || !mismaPaginaDelFormulario(t.url || "", urlDeReferencia)) {
      ctxAvisar(tabId, "Denuncias RS: la página no es el formulario (puede que te haya mandado a iniciar sesión), " +
        "así que NO se rellenó nada ni se capturó comprobante. Inicia sesión, vuelve al formulario y repite.", true);
      return;
    }
  }
  // Denunciar en esta pestaña = activar la extensión aquí: se muestra el botón flotante
  // de capturar comprobante (que por defecto está oculto mientras solo se navega) y la
  // pestaña queda marcada para que el botón siga visible al avanzar el formulario.
  marcarPestanaDeDenuncia(tabId);
  limpiarAvisoDelIcono(); // empieza un relleno nuevo: el aviso anterior del icono ya no aplica
  if (datos && !(datos.pais || "").trim() && form && form.tipo !== "email") {
    ctxAvisar(tabId, "Denuncias RS: la marca «" + marca + "» no tiene PAÍS configurado y el formulario lo exige. " +
      "Ábrela en Marcas (⚙ Opciones), escribe el país y vuelve a intentarlo.", true);
    return;
  }
  // {informe:true}: guarda también el paso a paso para el botón "📋 Copiar informe"
  // del popup, igual que cuando se rellena desde ahí (aquí se llega por el clic derecho).
  // `urlForm` dentro de las opciones: APLICAR aborta solo si al ejecutarse la página ya no
  // es el formulario (ver el aviso en motor.js). Va `urlDeReferencia` por lo mismo que el
  // resto de esta función: es la página en la que el usuario está de verdad.
  const r = await chrome.scripting.executeScript({ target: { tabId }, func: APLICAR, args: [plan.pasos, { informe: true, urlForm: urlDeReferencia }] });
  const res = (r && r[0] && r[0].result) || { ok: 0, faltan: [], clicsReales: [] };
  try {
    const inf = res.informe || {};
    chrome.storage.local.set({ ultimo_informe: {
      fecha: new Date().toLocaleString(), version: chrome.runtime.getManifest().version,
      form: (form.red || "") + " · " + (form.nombre || "") + " (clic derecho)", marca: marca,
      ok: res.ok, faltan: res.faltan || [], pasos: inf.pasos || [], inventario: inf.inventario || null
    } });
  } catch (e) { /* el informe es solo ayuda */ }
  if (res.clicsReales && res.clicsReales.length) {
    // ANCLA OTRA VEZ. La URL se comprobó al ENTRAR en esta función; entre medias va una
    // pasada de APLICAR con `{informe:true}` (la variante más lenta, porque además arma el
    // inventario). Si en ese hueco la pestaña se fue, `hacerClics` daría clics REALES sobre
    // una pantalla ajena. Sin `urlDeReferencia` no hay nada que comparar: se hace como siempre.
    if (!urlDeReferencia || (await sigueEnElFormulario(tabId, urlDeReferencia, {}))) {
      try { await hacerClics(tabId, res.clicsReales); } catch (e) {}
    } else {
      ctxAvisar(tabId, "Denuncias RS: la pestaña salió de la página del formulario, así que no marqué las opciones " +
        "ni capturé comprobante. Vuelve al formulario y repítelo.", true);
      return;
    }
  }
  // MODO PRUEBA: la red podra permitir autoenvio, pero HOY no se envia.
  const enPrueba = await enModoPrueba();
  const autoenv = permiteAutoenvio(form) && !enPrueba;
  // A qué denuncia del Registro va el comprobante: se fija AQUÍ, antes de arrancar nada
  // largo (ver guardarComprobante). En modo prueba NO se resuelve: `denunciaEnCurso()`
  // devolveria la ULTIMA denuncia de verdad y el bucle largo se la quedaria fijada.
  const idDenuncia = enPrueba ? null : await denunciaEnCurso();
  if (plan.autorepetir) {
    // ANCLA: va `urlDeReferencia`, NO `plan.url`. Es la página en la que el usuario está de
    // verdad y que ctxDetectarForm ya validó: con "Rellenar ESTA página", y porque Meta
    // sirve el mismo formulario en dos direcciones distintas, la del plan puede no ser la
    // suya y el bucle se cortaría solo estando donde debe. Sin esto, el bucle arrancado por
    // el clic derecho no comprobaba la URL ni una vez en 30 minutos.
    // Los desplegables van marcados `soloSiVacio`, NO se quitan. Es el mismo fallo que
    // ya se corrigió en popup.js: al FILTRARLOS, si el desplegable "¿Qué problema tienes?"
    // se perdía (recarga, sesión reiniciada, llegar por otro camino), el bucle no lo volvía
    // a elegir NUNCA, y sin él TikTok no muestra ni un campo: Marca comercial en blanco
    // durante los 30 minutos enteros. Con `soloSiVacio`, si sigue respondido el paso se
    // salta, y si volvió a "Select" se vuelve a elegir. Se COPIA el paso (Object.assign)
    // para no tocar el plan original, que se sigue usando para el informe de este clic.
    autorelleno(tabId, plan.pasos.map((p) => (p.tipo === "dropdown" ? Object.assign({}, p, { soloSiVacio: true }) : p)),
      { autoenviar: autoenv, marca: marca, enviarLabel: plan.enviarLabel, urlForm: urlDeReferencia, idDenuncia: idDenuncia, modoPrueba: enPrueba });
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». " +
      (enPrueba ? "🧪 MODO PRUEBA: no registré la denuncia, no guardaré comprobante y no enviaré nada."
                : autoenv ? "Cuando el formulario quede completo se capturará y enviará solo (5 s para cancelar)."
                          : "Resuelve el captcha y envíalo tú."), false);
    return;
  }
  // MODO PRUEBA: se relleno y ya esta. Ni comprobante, ni envio, ni un mensaje que
  // diga «comprobante capturado» cuando no se capturo nada.
  if (enPrueba) {
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». " +
      "🧪 MODO PRUEBA: no registré la denuncia, no guardé comprobante y no envié nada. " +
      "Revísalo y ciérralo sin enviar.", false);
    return;
  }
  if (autoenv) {
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». Capturando y enviando (5 s para cancelar)…", false);
    await finalizarEnvio(tabId, marca, plan.enviarLabel, res.faltan, { idDenuncia: idDenuncia, urlForm: urlDeReferencia });
  } else {
    await activarPestana(tabId);
    await guardarComprobante(tabId, idDenuncia);
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». Comprobante capturado. Resuelve el captcha y pulsa Enviar.", false);
  }
}

// "Rellenar ESTA página": autodetecta el formulario por la URL de la pestaña actual.
async function ctxRellenarPagina(tab, marca, objetivo) {
  const formKey = ctxDetectarForm(tab.url || "");
  if (!formKey) {
    ctxAvisar(tab.id, "Denuncias RS: esta página no es un formulario de denuncia. Usa la marca ▸ el formulario que quieras para abrirlo.", true);
    return;
  }
  const a = await ctxArmar(marca, formKey, objetivo);
  if (!a) { ctxAvisar(tab.id, "Denuncias RS: no encuentro la marca «" + marca + "».", true); return; }
  if (ctxFaltaElCorreo(tab.id, marca, a.datos)) return;
  await ctxRegistrarDenuncia(marca, a.form, (objetivo && objetivo[0]) || "");
  // La referencia es la URL que el usuario TENÍA (la que ctxDetectarForm reconoció como
  // formulario), no la del plan: Meta sirve el mismo formulario en dos direcciones
  // distintas, y aquí el usuario ya estaba en una de ellas. Aun así se comprueba, para
  // cortar si la página se fue al login entre el clic del menú y la inyección.
  try { await ctxEjecutarPlan(tab.id, a.form.construirPlan(a.ctx), marca, a.form, a.datos, tab.url || ""); }
  catch (e) { ctxAvisar(tab.id, "Denuncias RS: no se pudo rellenar aquí (" + (e.message || e) + ").", true); }
}

// Abre la denuncia elegida con esa marca: los formularios WEB en una pestaña NUEVA (no
// pierdes la página actual) y los rellena; los de CORREO generan el borrador (correo.html).
async function ctxAbrirDenuncia(tabOrigen, marca, formKey, objetivo) {
  const a = await ctxArmar(marca, formKey, objetivo);
  if (!a) { if (tabOrigen && tabOrigen.id) ctxAvisar(tabOrigen.id, "Denuncias RS: no encuentro la marca «" + marca + "».", true); return; }
  if (ctxFaltaElCorreo(tabOrigen && tabOrigen.id, marca, a.datos)) return;
  const form = a.form, ctx = a.ctx, datos = a.datos;
  const urlDen = (objetivo && objetivo[0]) || "";
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    // En modo prueba `ctxRegistrarDenuncia` devuelve null y `ctxGuardarCorreo` no hace
    // nada con un id vacio: no se toca el Registro.
    const idDen = await ctxRegistrarDenuncia(marca, form, urlDen);
    await ctxGuardarCorreo(idDen, em);
    // red/cat/urls viajan para la MEMORIA DE CORREOS (ver datos/correos_denuncia.js).
    // `modo_prueba` va SIEMPRE: sin el, correo.html escribiria el correo enviado sobre
    // la ULTIMA denuncia de verdad (la que apunta `ultima_denuncia_registro`), que es
    // justo lo que el modo prueba tiene que impedir. Mismo contrato que el popup.
    const enPrueba = await enModoPrueba();
    await chrome.storage.local.set({ email_reporte: Object.assign({}, em, {
      from: datos.correo || "", red: form.red || "", cat: form.cat || "",
      urls: (ctx.urls || []).concat(urlDen && (ctx.urls || []).indexOf(urlDen) < 0 ? [urlDen] : []),
      modo_prueba: enPrueba
    }) });
    chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    return;
  }
  const plan = form.construirPlan(ctx);
  // Sin permiso sobre ese sitio no se puede rellenar: se abre igual el formulario (para
  // no perder el viaje) pero se dice CLARO qué hay que hacer, en vez de dejar la página
  // en blanco sin explicación.
  const hayPermiso = await ctxHayPermisoPara(plan.url);
  if (!hayPermiso) {
    try { await chrome.tabs.create({ url: plan.url, active: true }); } catch (e) {}
    if (tabOrigen && tabOrigen.id) {
      ctxAvisar(tabOrigen.id, "Denuncias RS: falta el permiso de Chrome para escribir en " +
        (new URL(plan.url).host) + ". Abre la extensión en esa pestaña y pulsa «Rellenar formulario» una vez: " +
        "Chrome te lo pedirá y ya queda dado para siempre.", true);
    }
    return;
  }
  await ctxRegistrarDenuncia(marca, form, urlDen);
  let nueva;
  // active:false: abre la denuncia en una pestaña APARTE en segundo plano para NO sacar
  // al usuario de la pestaña que está viendo. El autorrelleno funciona igual (usa nueva.id).
  try { nueva = await chrome.tabs.create({ url: plan.url, active: false }); } catch (e) { return; }
  await ctxEsperarCarga(nueva.id);
  await dormir(1800); // deja aparecer los campos
  try { await ctxEjecutarPlan(nueva.id, plan, marca, form, datos); }
  catch (e) { /* la pestaña abrió; el usuario puede rellenar con el clic derecho de nuevo */ }
}

// ============================================================================
//  MENÚ DEL CLIC DERECHO: 🚩 Denuncias RS ▸ [marca] ▸ [red] ▸ [formulario]
//
//  POR QUÉ ESTÁ ESCRITO ASÍ (bug recurrente: "solo salen 2 marcas"):
//  el menú completo son ~64 items POR MARCA (marca + rellenar + separador + 17 redes
//  + 44 formularios). Con 20 marcas eso pasa de 1.200 items y el navegador deja de
//  crearlos. Antes TODO el bucle estaba dentro de un solo try/catch, así que el
//  PRIMER item que fallaba abortaba el bucle entero y se perdían todas las marcas que
//  faltaban por recorrer: por eso sobrevivían solo las primeras del alfabeto.
//
//  Ahora se construye en DOS PASADAS:
//   · Pasada 1 (garantizada): root + por cada marca su nodo, "✍ Rellenar ESTA página"
//     y el separador. Son ~3 items por marca (~61 en total). Al acabar esta pasada
//     TODAS las marcas ya están visibles y se pueden usar.
//   · Pasada 2: TODAS las redes con TODOS sus formularios, recorriendo EN ANCHURA
//     (bucle externo por RED, interno por MARCA), de principio a fin y SIN cortarse.
//     La anchura importa por si algún navegador se plantara a mitad: el reparto queda
//     parejo entre marcas en vez de dejar completas las primeras y vacías las últimas.
//
//  REGLA QUE MANDA SOBRE TODO LO DEMÁS: aquí no se borra ni se descarta NADA.
//  Se intentan crear SIEMPRE los 1.281 items del menú completo (con 20 marcas), uno por
//  uno, hasta el final. Un item que falle se cuenta y se anota en el diagnóstico, pero
//  NO hace que se retire nada ya creado ni que se deje de intentar lo que viene después.
//
//  MEDIDO EN CHROME REAL (2026-08-12) — por eso el código es tan simple:
//   · chrome.contextMenus no tiene límite práctico: 20.000 items, 0 fallos, ~3 s.
//   · El caso real (1.281 items) se crea entero en 0,3 s, sin un solo fallo.
//   · create() NUNCA lanza excepción: los errores (id duplicado, padre inexistente,
//     title vacío…) llegan SOLO por chrome.runtime.lastError.
//   · Tras un error, create() SIGUE funcionando: en un bucle de 200 items con el 3.º
//     fallando, los otros 199 se crean sin problema. Por eso abortar sería absurdo:
//     solo serviría para perder todo lo que venía detrás.
//  El try/catch de ctxCrearItemDeMenu se queda igualmente como red de seguridad barata,
//  por si otro Chromium (Edge, Brave, Opera) se comporta distinto.
// ============================================================================

// ---- FRENO ANTIBUCLE. NO ES UNA POLÍTICA DE "ESTO NO CABE" ----
// Único papel: cortar por lo sano si algún día los datos se descontrolan (una marca
// duplicada en bucle, un formulario que se multiplica) y la construcción se volviera
// interminable. Está MUY por encima de lo que el menú necesita de verdad (con 20 marcas,
// 17 redes y 44 formularios son 1.281 items) y de lo que aguanta el navegador (medido:
// 20.000 items sin un fallo), así que en uso normal NUNCA llega a actuar y NUNCA descarta
// contenido. Si algún día hiciera falta tocarlo, se cambia AQUÍ: es el único sitio donde
// vive el número. PROHIBIDO usarlo para dejar redes o reportes fuera del menú: si no
// cupieran, se rediseña o se pregunta al usuario, no se recorta por nuestra cuenta.
// Al cambiarlo, volver a pasar: python pruebas\probar_menu_contextual.py
const RS_MAXIMO_DE_ITEMS_DE_MENU = 20000;

// Cuántos ids fallidos se guardan en el diagnóstico. Con una muestra basta para saber QUÉ
// falló; guardarlos todos podría meter miles de cadenas en chrome.storage.local.
const RS_MAXIMO_DE_IDS_FALLIDOS = 20;

// Contadores de la construcción en curso; se vuelcan a chrome.storage.local para que el
// usuario/QA pueda ver el estado REAL del menú sin adivinar (clave diagnostico_menu_contextual).
let rsDiagnosticoMenu = { intentados: 0, creados: 0, fallidos: 0, primerError: "", idsFallidos: [] };

function ctxAnotarFalloDeMenu(id, mensaje) {
  rsDiagnosticoMenu.fallidos++;
  rsDiagnosticoMenu.creados--; // se había contado como creado de forma optimista
  const texto = String(mensaje || "desconocido");
  if (!rsDiagnosticoMenu.primerError) rsDiagnosticoMenu.primerError = texto;
  // Solo una muestra: qué items concretos fallaron, para poder investigarlo después.
  if (rsDiagnosticoMenu.idsFallidos.length < RS_MAXIMO_DE_IDS_FALLIDOS) {
    rsDiagnosticoMenu.idsFallidos.push(String(id) + " → " + texto);
  }
}

// Crea UN item de menú sin que un fallo pueda propagarse. Devuelve true/false.
// El error llega por chrome.runtime.lastError, y hay que LEERLO: si no, Chrome lo apunta
// como "error no comprobado" y ensucia la consola. El try/catch es red de seguridad: en
// Chrome create() no lanza nunca (medido), pero otro Chromium podría hacerlo.
function ctxCrearItemDeMenu(opciones) {
  rsDiagnosticoMenu.intentados++;
  try {
    chrome.contextMenus.create(opciones, () => {
      const err = chrome.runtime.lastError;
      if (err) ctxAnotarFalloDeMenu(opciones.id, err.message || err);
    });
    rsDiagnosticoMenu.creados++;
    return true;
  } catch (e) {
    ctxAnotarFalloDeMenu(opciones.id, e && e.message ? e.message : e);
    return false;
  }
}

// Los callbacks de create() son asíncronos: este respiro deja que lleguen los lastError
// pendientes antes de dar por cerrada una tanda y anotar el resultado.
const ctxEsperarCallbacksDeMenu = () => dormir(0);

// Mezcla en self.FORMULARIOS las plataformas que el usuario creó desde el popup
// (chrome.storage.local -> plataformas_usuario). Se llama ANTES de armar el menú y
// antes de preparar una denuncia, para que salgan igual que las de fábrica en el
// clic derecho. Las de fábrica nunca se pisan (lo garantiza formularios.js).
async function ctxCargarPlataformasDeUsuario() {
  try {
    if (typeof self.APLICAR_PLATAFORMAS_DE_USUARIO !== "function") return;
    const d = await chrome.storage.local.get(["plataformas_usuario"]);
    self.APLICAR_PLATAFORMAS_DE_USUARIO(d.plataformas_usuario || {});
  } catch (e) { /* sin ellas, el menú sale con las de fábrica */ }
}

async function ctxConstruirMenusUnaVez() {
  await ctxCargarPlataformasDeUsuario();
  rsDiagnosticoMenu = { intentados: 0, creados: 0, fallidos: 0, primerError: "", idsFallidos: [] };
  // redesConItemsRechazados: aquellas en las que el NAVEGADOR rechazó algún item. Es solo
  // información para el diagnóstico: la red se queda en el menú con lo que sí se creó.
  // frenoAntibucle: ver RS_MAXIMO_DE_ITEMS_DE_MENU.
  let marcas = [], redes = [], pasada2Completa = true, redesCreadas = 0;
  const redesConItemsRechazados = [];
  let frenoAntibucle = false;
  try {
    await new Promise((res) => chrome.contextMenus.removeAll(res));
    const base = { contexts: RS_CONTEXTS }; // sin documentUrlPatterns: aparece en TODA página
    ctxCrearItemDeMenu(Object.assign({ id: "rs_root", title: "🚩 Denuncias RS" }, base));
    const MARCAS = await ctxObtenerMarcas();
    marcas = Object.keys(MARCAS).sort((a, b) => a.localeCompare(b, "es"));
    // Formularios ordenados por "Red: Nombre" (se listan dentro de cada marca).
    const forms = Object.keys(self.FORMULARIOS).sort((a, b) =>
      (self.FORMULARIOS[a].red + ": " + self.FORMULARIOS[a].nombre)
        .localeCompare(self.FORMULARIOS[b].red + ": " + self.FORMULARIOS[b].nombre, "es"));
    // Lista de redes sociales presentes (ordenadas), para agrupar los formularios.
    forms.forEach((fk) => { const r = self.FORMULARIOS[fk].red; if (redes.indexOf(r) < 0) redes.push(r); });
    redes.sort((a, b) => a.localeCompare(b, "es"));

    // ---- PASADA 1: lo imprescindible de cada marca, y va PRIMERO. Nada la frena: si un
    // item falla se anota y se sigue con la marca siguiente, nunca se corta el bucle.
    // Al acabar aquí, las 20 marcas ya están en el menú pase lo que pase después.
    marcas.forEach((m) => {
      const pid = "rs_m|" + rsEnc(m);
      ctxCrearItemDeMenu(Object.assign({ id: pid, parentId: "rs_root", title: m }, base));
      ctxCrearItemDeMenu(Object.assign({ id: "rs_fill|" + rsEnc(m), parentId: pid, title: "✍ Rellenar ESTA página" }, base));
      ctxCrearItemDeMenu(Object.assign({ id: "rs_sep|" + rsEnc(m), parentId: pid, type: "separator" }, base));
    });
    await ctxEsperarCallbacksDeMenu();

    // ---- PASADA 2: TODAS las redes con TODOS sus formularios, para TODAS las marcas.
    // Se recorre entera SIEMPRE, de la primera red a la última y de la primera marca a la
    // última. Aquí no hay ni un `break` ni una sola línea que borre algo ya creado:
    //   · No se elige qué crear: se crea todo.
    //   · Un item que falle NO retira nada (ni su red, ni sus hermanos): quitar contenido
    //     bueno para que todas las marcas queden simétricas sería destruir lo que sí se
    //     pudo crear. Manda que el usuario tenga TODO lo que el navegador acepte.
    //   · Un item que falle NO corta el recorrido: create() sigue funcionando después de
    //     un error (medido), así que abortar solo perdería lo que viene detrás.
    // El fallo se cuenta, se guarda su id en el diagnóstico, y se sigue.
    // Se va EN ANCHURA (bucle externo por RED, interno por MARCA): si algún navegador se
    // plantara, el reparto quedaría parejo entre marcas en vez de vaciar las últimas.
    for (const red of redes) {
      // Freno ANTIBUCLE, no un "esto no cabe": ver RS_MAXIMO_DE_ITEMS_DE_MENU. En uso
      // normal no salta nunca (el menú completo son 1.281 items y el tope son 20.000).
      if (rsDiagnosticoMenu.creados >= RS_MAXIMO_DE_ITEMS_DE_MENU) { frenoAntibucle = true; break; }
      const fallidosAntes = rsDiagnosticoMenu.fallidos;
      const susForms = forms.filter((fk) => self.FORMULARIOS[fk].red === red);
      for (const m of marcas) {
        const rid = "rs_red|" + rsEnc(m) + "|" + rsEnc(red);
        ctxCrearItemDeMenu(Object.assign({ id: rid, parentId: "rs_m|" + rsEnc(m), title: red }, base));
        for (const fk of susForms) {
          const f = self.FORMULARIOS[fk];
          ctxCrearItemDeMenu(Object.assign({ id: "rs_open|" + rsEnc(m) + "|" + fk, parentId: rid, title: f.nombre }, base));
        }
      }
      await ctxEsperarCallbacksDeMenu(); // que lleguen los lastError de esta tanda
      // Solo para el informe: qué redes salieron limpias y en cuáles rechazó algo el
      // navegador. Ninguna de las dos ramas toca el menú.
      if (rsDiagnosticoMenu.fallidos > fallidosAntes) redesConItemsRechazados.push(red);
      else redesCreadas++;
    }
    // "Completa" = el navegador no rechazó ni un item. Nunca es falso por decisión propia.
    pasada2Completa = rsDiagnosticoMenu.fallidos === 0 && !frenoAntibucle;

    // El aviso SOLO si de verdad hubo items rechazados por el navegador (con 0 fallos no
    // aparece). Va en cada marca para que el usuario sepa POR QUÉ le faltaría algo ahí y a
    // dónde ir: el popup los tiene todos, siempre.
    if (!pasada2Completa) {
      marcas.forEach((m) => {
        ctxCrearItemDeMenu(Object.assign({
          id: "rs_aviso|" + rsEnc(m), parentId: "rs_m|" + rsEnc(m),
          title: "⚠ El navegador no admitió más: usa el popup", enabled: false
        }, base));
      });
      await ctxEsperarCallbacksDeMenu();
    }
  } catch (e) {
    // Nunca debería llegar aquí (cada item se crea a prueba de fallos), pero si pasa se anota.
    ctxAnotarFalloDeMenu("(construcción del menú)", e && e.message ? e.message : e);
    pasada2Completa = false;
  }
  try {
    await chrome.storage.local.set({ diagnostico_menu_contextual: {
      fecha: new Date().toLocaleString(),
      marcas: marcas.length,
      redes_totales: redes.length,
      redes_creadas: redesCreadas, // las que salieron sin que el navegador rechazara nada
      // Redes donde el navegador rechazó ALGÚN item. Siguen en el menú con lo que sí se
      // creó: no se borra nada. `borrados_por_decision_propia` es 0 fijo y está aquí a
      // propósito, como constancia de que el programa nunca quita contenido; si algún día
      // no fuera 0, sería un fallo que corregir, no una política.
      redes_con_items_rechazados: redesConItemsRechazados,
      borrados_por_decision_propia: 0,
      freno_antibucle: frenoAntibucle,
      items_intentados: rsDiagnosticoMenu.intentados,
      items_creados: rsDiagnosticoMenu.creados,
      items_fallidos: rsDiagnosticoMenu.fallidos,
      pasada2_completa: pasada2Completa,
      primer_error: rsDiagnosticoMenu.primerError,
      ids_fallidos: rsDiagnosticoMenu.idsFallidos, // muestra, tope RS_MAXIMO_DE_IDS_FALLIDOS
      maximo_de_items_antibucle: RS_MAXIMO_DE_ITEMS_DE_MENU
    } });
  } catch (e) { /* el diagnóstico es solo ayuda, no puede romper el menú */ }
}

// (Re)construye el menú al instalar/arrancar y al cambiar las marcas.
// Antes, si llegaba un cambio mientras se estaba construyendo, se DESCARTABA (`return`) y
// el menú se quedaba viejo: agregar una marca en ese momento no se veía hasta reiniciar.
// Ahora se encola: al terminar se vuelve a construir una vez más con los datos nuevos.
let rsConstruyendo = false;
let rsReconstruirPendiente = false;
async function ctxConstruirMenus() {
  if (rsConstruyendo) { rsReconstruirPendiente = true; return; }
  rsConstruyendo = true;
  try {
    do {
      rsReconstruirPendiente = false; // lo que llegue a partir de aquí obliga a otra vuelta
      await ctxConstruirMenusUnaVez();
    } while (rsReconstruirPendiente);
  } finally { rsConstruyendo = false; }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId || "");
  // Si el clic derecho fue SOBRE un enlace (o una imagen/media, o texto seleccionado que
  // es una URL), ese enlace es el que se denuncia; si no, se usan las URLs del Excel.
  const esUrl = (s) => /^https?:\/\//i.test((s || "").trim());
  let objetivo = [];
  if (esUrl(info.linkUrl)) objetivo = [info.linkUrl.trim()];
  else if (esUrl(info.srcUrl)) objetivo = [info.srcUrl.trim()];
  else if (esUrl(info.selectionText)) objetivo = [info.selectionText.trim()];
  if (id.indexOf("rs_fill|") === 0) {
    if (tab && tab.id) ctxRellenarPagina(tab, rsDec(id.slice("rs_fill|".length)), objetivo);
  } else if (id.indexOf("rs_open|") === 0) {
    const resto = id.slice("rs_open|".length);
    const i = resto.indexOf("|"); // "<marca URL-encoded>|<formKey>" — la marca no lleva '|'
    if (i > 0) ctxAbrirDenuncia(tab, rsDec(resto.slice(0, i)), resto.slice(i + 1), objetivo);
  }
});

// Reconstruye el menú al instalar/arrancar y cuando cambian las marcas (no en cada relleno).
chrome.runtime.onInstalled.addListener(ctxConstruirMenus);
chrome.runtime.onStartup.addListener(ctxConstruirMenus);
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== "local") return;
  // plataformas_usuario: al crear (o quitar) una plataforma desde el popup, el menú
  // del clic derecho se rehace para que aparezca (o desaparezca) al momento.
  if (cambios.marcas_usuario || cambios.marcas_eliminadas || cambios.plataformas_usuario) ctxConstruirMenus();
});

// ============================================================================
//  ACTUALIZACIÓN AUTOMÁTICA — "lo que cambie llega solo a TODOS los navegadores
//  y a TODAS las computadoras".
//
//  Cómo funciona el conjunto (3 piezas):
//   1) Al publicar un cambio, los archivos van al repo PÚBLICO denunciasrs-ext.
//   2) En cada PC, DENUNCIAS_RS.bat (tarea programada: al iniciar sesión y cada
//      hora) descarga ese repo y REEMPLAZA la carpeta DenunciasRS_extension. Como
//      Chrome, Edge, Brave… cargan TODOS esa MISMA carpeta, el archivo nuevo les
//      llega a los tres a la vez.
//   3) Falta que el navegador RELEA esos archivos: hasta ahora eso solo pasaba al
//      reiniciarlo (por eso se veían cambios "que no llegaban"). De eso se encarga
//      este bloque: cada hora compara la versión que está corriendo con la
//      PUBLICADA y, cuando hay una nueva, recarga la extensión sola.
//
//  Seguridad: solo se LEE un archivo público del repo (la versión). No se descarga
//  ni se ejecuta código desde la red: el código lo instala el .bat en el disco, y
//  chrome.runtime.reload() se limita a releer la carpeta local ya instalada.
// ============================================================================
const URL_VERSION_PUBLICADA =
  "https://raw.githubusercontent.com/diegoarias-prog/denunciasrs-ext/main/extension/manifest.json";

// Compara "1.2.10" vs "1.2.9" por NÚMERO de cada parte (no como texto: "1.2.10"
// es MENOR que "1.2.9" al comparar cadenas, y nunca se actualizaría).
function versionMayor(a, b) {
  const pa = String(a || "0").split("."), pb = String(b || "0").split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] || "0", 10) || 0, nb = parseInt(pb[i] || "0", 10) || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

// ¿Está la extensión ocupada rellenando una denuncia? Nunca se recarga en medio de
// un formulario a medio llenar (se perdería el autorrelleno de la 2.ª etapa).
function ocupadaRellenando() {
  return Object.keys(AUTORRELLENO).some((t) => AUTORRELLENO[t] && !AUTORRELLENO[t].cancelar);
}

// Versión que hay AHORA MISMO en la carpeta del disco. Para una extensión cargada
// "descomprimida", los archivos se sirven del disco, así que si el .bat ya copió lo
// nuevo, aquí se ve la versión nueva aunque la que corre siga siendo la vieja: es la
// señal exacta de "ya se puede recargar". Si el navegador lo sirviera de memoria,
// devolverá la versión vieja y no pasa nada: queda el reintento por hora de abajo.
async function versionEnDisco() {
  try {
    const r = await fetch(chrome.runtime.getURL("version.json"), { cache: "no-store" });
    if (!r.ok) return "";
    return (await r.json()).version || "";
  } catch (e) { return ""; }
}

async function comprobarActualizacion(motivo) {
  const propia = chrome.runtime.getManifest().version;
  let publicada = "";
  try {
    const r = await fetch(URL_VERSION_PUBLICADA, { cache: "no-store" });
    if (r.ok) publicada = (await r.json()).version || "";
  } catch (e) { /* sin internet: se reintenta en la próxima ronda */ }

  const enDisco = await versionEnDisco();
  const hayNueva = !!publicada && versionMayor(publicada, propia);
  const listaEnDisco = !!enDisco && versionMayor(enDisco, propia); // ya bajada por el .bat

  await chrome.storage.local.set({
    estado_version: {
      propia: propia, publicada: publicada, enDisco: enDisco,
      hayNueva: hayNueva, listaEnDisco: listaEnDisco,
      revisado: Date.now(), motivo: motivo || ""
    }
  });
  // Aviso visible en el icono. Pasa por `pintarAvisoDelIcono` para que la ronda por hora NO
  // borre el "!" de una denuncia que quedó a medias (antes ponía "" a secas y se lo comía).
  await pintarAvisoDelIcono();

  if (!hayNueva && !listaEnDisco) return;
  if (ocupadaRellenando()) return; // se aplicará en la siguiente ronda

  // Con la versión nueva YA en el disco, recargar la aplica al instante.
  // Si aún no está (el .bat no ha corrido), se prueba igualmente una vez por hora:
  // la recarga es inofensiva (si los archivos siguen igual, se queda como estaba) y
  // así no depende de que el usuario reinicie el navegador.
  const g = await chrome.storage.local.get("reintento_recarga");
  const prev = g.reintento_recarga || {};
  const ahora = Date.now();
  const clave = publicada || enDisco;                 // versión a la que se quiere llegar
  const mismos = prev.version === clave;
  const veces = mismos ? (prev.veces || 0) : 0;
  // TOPES para no acabar recargando sin parar si algo impidiera aplicar la versión
  // nueva (la recarga solo sirve si los archivos nuevos ya están en la carpeta).
  if (listaEnDisco) {
    if (veces >= 3) return;                           // ya está en disco: 3 intentos bastan
  } else {
    if (mismos && (ahora - (prev.cuando || 0)) < 55 * 60 * 1000) return; // como mucho, uno por hora
    if (veces >= 24) return;                          // ~un día insistiendo: parar
  }
  await chrome.storage.local.set({
    reintento_recarga: { version: clave, cuando: ahora, veces: veces + 1 }
  });
  chrome.runtime.reload(); // relee la carpeta del disco: aplica lo nuevo sin reiniciar el navegador
}

chrome.alarms.create("buscar_actualizacion", { delayInMinutes: 1, periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a && a.name === "buscar_actualizacion") comprobarActualizacion("ronda por hora");
});
chrome.runtime.onStartup.addListener(() => comprobarActualizacion("arranque del navegador"));
chrome.runtime.onInstalled.addListener(() => {
  // Tras aplicarse una versión nueva: se limpia el aviso y se vuelve a comprobar.
  chrome.storage.local.remove("reintento_recarga");
  // Se quita el "↑" de la versión, pero se respeta el "!" de una denuncia pendiente de mirar.
  pintarAvisoDelIcono();
  comprobarActualizacion("instalacion/actualizacion");
});
