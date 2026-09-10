// ===========================================================================
//  MOTOR DE RELLENO COMPARTIDO (motor.js)
//  Lo usan el popup (primer clic) y el service worker (repeticiones automaticas
//  tras verificar el correo). APLICAR se inyecta y ejecuta DENTRO de la pagina
//  del formulario con chrome.scripting.executeScript, por eso debe ser AUTONOMO
//  (sin variables externas): su codigo fuente se serializa completo.
// ===========================================================================
async function APLICAR(pasos, opciones) {
  opciones = opciones || {}; // { unaPasada: true } => una sola pasada (para el bucle del service worker)
  const dur = (ms) => new Promise((r) => setTimeout(r, ms));

  // ===========================================================================
  //  ANCLA DENTRO DE LA PROPIA PÁGINA (opciones.urlForm).
  //  OJO: ESTA LÓGICA ESTÁ DUPLICADA A PROPÓSITO. Es una copia de
  //  `mismaPaginaDelFormulario` (background.js); SI SE TOCA UNA, HAY QUE TOCAR LA OTRA.
  //  No se puede compartir: APLICAR se serializa entero para inyectarlo y no puede usar
  //  nada de fuera.
  //  POR QUÉ AQUÍ Y NO SOLO EN EL SERVICE WORKER: entre que el worker pregunta a Chrome
  //  en qué URL está la pestaña y que `chrome.scripting.executeScript` llega a ejecutar,
  //  pasan milisegundos, y en ese hueco la pestaña puede navegar. MEDIDO por QA: con la
  //  navegación justo ahí se coló UNA escritura en la página ajena. `chrome.scripting` no
  //  valida URL, así que ninguna comprobación desde fuera puede cerrar esa carrera: la
  //  única que la cierra es esta, hecha en el MISMO contexto y en el MISMO instante que
  //  la escritura. Importa porque el login de TikTok tiene una caja de correo cuyo rótulo
  //  casa, y ahí se escribiría el correo de la marca.
  //  RETROCOMPATIBLE: sin `opciones.urlForm` no se comprueba nada (comportamiento de
  //  siempre). Lo usan el popup, el clic derecho y los dos bucles.
  // ===========================================================================
  function esLaPaginaDelFormulario(urlActual, urlForm) {
    try {
      const a = new URL(urlActual), b = new URL(urlForm);
      const ha = a.host.replace(/^www\./, ""), hb = b.host.replace(/^www\./, "");
      if (!(ha === hb || ha.endsWith("." + hb))) return false;
      const pa = a.pathname.toLowerCase().replace(/\/+$/, ""), pb = b.pathname.toLowerCase().replace(/\/+$/, "");
      if (!pb) return pa === pb;
      return pa === pb || pa.indexOf(pb + "/") === 0;
    } catch (e) { return false; }
  }
  if (opciones.urlForm && !esLaPaginaDelFormulario(location.href, opciones.urlForm)) {
    const porQue = "abortado: la pagina ya no es el formulario";
    return {
      ok: 0, faltan: [], clicsReales: [], hechos: 0, abortado: porQue,
      informe: opciones.informe
        ? { pasos: [{ paso: "(no se ejecutó ningún paso)", estado: porQue, hizo: [], pasada: 0 }], inventario: null }
        : { pasos: [], inventario: null }
    };
  }
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // ---------------------------------------------------------------------------
  //  INFORME DE DIAGNÓSTICO. Anota QUÉ campo se rellenó/marcó y con qué rótulo lo
  //  reconoció, para poder ver desde el popup por qué un campo quedó vacío sin
  //  tener que adivinar el HTML de la web. Se acumula siempre (es barato); el
  //  INVENTARIO completo de la página solo se arma si lo piden (opciones.informe).
  // ---------------------------------------------------------------------------
  const registro = [];
  // Rótulo VISIBLE de un campo, tal como lo vería una persona: su etiqueta propia y,
  // si no tiene, el texto que lleva justo encima. Recortado (es solo para el informe).
  function rotuloDe(el) {
    if (!el) return "?";
    let t = (el.getAttribute && (el.getAttribute("aria-label") || "")) || "";
    try { if (!t && el.id) { const lf = document.querySelector('label[for="' + (window.CSS ? CSS.escape(el.id) : el.id) + '"]'); if (lf) t = lf.textContent || ""; } } catch (e) {}
    try { if (!t && el.closest) { const lc = el.closest("label"); if (lc) t = lc.textContent || ""; } } catch (e) {}
    let nodo = el, k = 0;
    while (!t.trim() && nodo && k < 4) {
      let ps = nodo.previousElementSibling, j = 0;
      while (ps && j < 3 && !t.trim()) { const x = (ps.textContent || "").trim(); if (x && x.length < 200) t = x; ps = ps.previousElementSibling; j++; }
      nodo = nodo.parentElement; k++;
    }
    if (!t.trim()) t = (el.placeholder || el.name || el.id || el.tagName || "?");
    return (t + "").replace(/\s+/g, " ").trim().slice(0, 90);
  }
  // ACCIONES QUE NO SON "RELLENAR". Salen en el informe (son útiles para diagnosticar)
  // pero NO cuentan en `hechos`, que significa "campos que de VERDAD se tocaron".
  // PULSAR UN BOTÓN NO ES ESCRIBIR, y `hechos` existe justo para excluirlo: es la única
  // guarda de "NUNCA UN COMPROBANTE EN BLANCO" del service worker, y el buscador de
  // `clickBoton` acepta cualquier enlace o botón visible cuyo texto contenga "continuar",
  // así que un banner con un «Continuar» bastaría para dar por rellenada una página vacía
  // y guardar en el Registro la foto de un formulario en blanco. También cortaría antes de
  // tiempo el bucle `insistirRelleno` de Meta, cuya condición de salida es `hechos > 0`.
  // "respetada la eleccion del usuario" es el segundo caso, y por definicion: esa rama
  // existe JUSTAMENTE para no tocar la pagina -el usuario ya eligio otra cosa-. La llaman
  // tres caminos (marcarRadioEl, el clic real y clickOpcion), asi que podia inflar `hechos`
  // en radios, casillas y opciones. Ojo: cuando lo respetado es una CASILLA, el paso SIGUE
  // yendo a `faltan` ("respetada:...") para que el formulario no se de por completo; eso
  // no se toca aqui, aqui solo se deja de contar como campo rellenado.
  const ACCIONES_QUE_NO_RELLENAN = ["pulso", "respetada la eleccion del usuario"];
  let tocados = 0;   // lo que cuenta en `hechos` (ver el aviso de arriba)
  function anotar(accion, el, extra) {
    try {
      registro.push({ accion: accion, rotulo: rotuloDe(el), detalle: extra || "" });
      if (ACCIONES_QUE_NO_RELLENAN.indexOf(accion) < 0) tocados++;
    } catch (e) {}
  }
  function setNative(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    // Queda marcado que ESTE contenido lo pusimos nosotros: es lo que permite que el
    // informe muestre nuestros datos y no lo que teclee el usuario (ver el inventario).
    try { el.setAttribute("data-rs-escrito-por-la-extension", "1"); } catch (e) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    anotar("escribio", el, (v == null ? "" : (v + "")).replace(/\s+/g, " ").slice(0, 70));
  }
  // Marca un radio/checkbox de forma robusta (sirve para formularios React de FB/IG/
  // WhatsApp/TikTok): secuencia de puntero + clic + setter nativo de 'checked' + eventos.
  function marcarRadioEl(target) {
    if (!target) return false;
    if (target.checked) return true;
    // La elección del usuario manda: se devuelve `true` (paso dado por bueno) para que
    // el reintento no insista y el campo no salga como "falta".
    if (respetarAlUsuario(target, "marcar")) return true;
    let lab = null;
    try { if (target.id) lab = document.querySelector('label[for="' + (window.CSS ? CSS.escape(target.id) : target.id) + '"]'); } catch (e) {}
    try { target.scrollIntoView({ block: "center" }); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); } catch (e) {}
    try { (lab || target).click(); } catch (e) {}
    try {
      const tipo = target.type === "checkbox" ? "checked" : "checked";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, tipo).set.call(target, true);
    } catch (e) { try { target.checked = true; } catch (e2) {} }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    anotar("marco", target, target.checked ? "quedo marcado" : "NO quedo marcado (falta el clic real)");
    return !!target.checked;
  }
  // Elige una opción de un <select> por su TEXTO. Dos detalles importantes:
  //  - Acepta ALTERNATIVAS separadas por "|" ("foto|photo"), como el resto del motor:
  //    el mismo paso vale con el formulario en español o en inglés.
  //  - Busca por PRIORIDAD (exacto -> empieza por -> contiene) para no quedarse con una
  //    opción que solo CONTENGA a la buscada (el caso clásico: "Guinea" cogía "Guinea
  //    Ecuatorial", y así el país del reporte salía mal).
  function setSelect(name, texto, suf) {
    const s = document.querySelector('select[name' + (suf ? "$" : "") + '="' + (name + "").replace(/"/g, '\\"') + '"]');
    if (!s) return false;
    const alts = norm(texto).split("|").map((x) => x.trim()).filter(Boolean);
    if (!alts.length) return false;
    const textos = [];
    for (let i = 0; i < s.options.length; i++) textos.push(norm(s.options[i].text).replace(/\s+/g, " ").trim());
    // Si YA está puesta la opción que queremos, no se vuelve a elegir: disparar `change`
    // otra vez hace que React repinte la sección (y en X eso borra lo ya escrito), y
    // además contaría como trabajo hecho algo que no se ha tocado.
    const elegir = (i) => {
      if (s.selectedIndex === i) return true;
      s.selectedIndex = i;
      s.dispatchEvent(new Event("change", { bubbles: true }));
      // `anotar` es lo que cuenta en `hechos`, y `hechos` decide si el bucle guarda
      // comprobante y si la espera del paso se paga. Un menú elegido ES trabajo hecho.
      anotar("eligio", s, (s.options[i].text || "").replace(/\s+/g, " ").trim().slice(0, 70));
      return true;
    };
    for (const t of alts) {
      let i = textos.indexOf(t);                                // exacto
      if (i < 0) i = textos.findIndex((x) => x.indexOf(t) === 0); // empieza por
      if (i < 0) i = textos.findIndex((x) => x.indexOf(t) >= 0);  // contiene
      if (i >= 0) return elegir(i);
    }
    return false;
  }
  // Caché de texto NORMALIZADO por elemento. norm() (quitar acentos + minúsculas) es lo
  // caro cuando hay que mirar miles de elementos, y el motor los recorre una vez por
  // cada campo del plan. Se guarda junto al TAMAÑO del texto: si el elemento cambia
  // (React repinta), el tamaño ya no cuadra y se vuelve a calcular.
  const cacheTexto = new Map();
  function textoNorm(el) {
    const t0 = el.textContent || "";
    const c = cacheTexto.get(el);
    if (c && c.len === t0.length) return c.t;
    const t = norm(t0);
    cacheTexto.set(el, { len: t0.length, t: t });
    return t;
  }
  // RÓTULO AJUSTADO de una casilla/radio: su aria-label, su <label>, su hermano
  // siguiente y los ancestros CERCANOS Y CORTOS. El tope de tamaño es lo importante:
  // sin él se acaba subiendo hasta el <form>, cuyo texto contiene TODAS las frases del
  // formulario, y entonces cualquier casilla "coincide" con cualquier etiqueta.
  function etiquetaCasilla(c) {
    let t = " " + (c.getAttribute("aria-label") || "") + " ";
    const lb = c.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) t += " " + (le.textContent || ""); });
    try { if (c.id) { const lf = document.querySelector('label[for="' + (window.CSS ? CSS.escape(c.id) : c.id) + '"]'); if (lf) t += " " + (lf.textContent || ""); } } catch (e) {}
    try { const lc = c.closest && c.closest("label"); if (lc) t += " " + (lc.textContent || ""); } catch (e) {}
    if (c.nextElementSibling) t += " " + (c.nextElementSibling.textContent || "");
    let par = c.parentElement, k = 0;
    while (par && k < 4) {
      const tp = par.textContent || "";
      if (tp.length <= 400) t += " " + tp;   // > 400 = ya no es el rótulo, es la sección/formulario
      par = par.parentElement; k++;
    }
    return norm(t);
  }
  let ok = 0; const faltan = []; const clicsReales = [];
  // ---------------------------------------------------------------------------
  //  MARCAS PARA LOS CLICS REALES: por qué el sufijo tiene que ser ÚNICO.
  //  A los radios/casillas que hay que clicar de verdad (los sintéticos no "pegan" en
  //  React) se les pone un atributo, y el service worker los localiza DESPUÉS por ese
  //  atributo con document.querySelector.
  //  El fallo que hubo aquí: el atributo era "data-cr-" + clicsReales.length, o sea
  //  data-cr-0, data-cr-1... y ese contador vuelve a 0 en CADA invocación de APLICAR,
  //  mientras que los atributos se quedaban pegados en el DOM para siempre. Con varias
  //  pasadas (el bucle del service worker hace muchas) el documento acumulaba varios
  //  data-cr-0 de pasadas distintas, y querySelector devuelve EL PRIMERO: el clic real
  //  podía caer sobre una casilla YA MARCADA y DESMARCARLA. Si esa casilla era una de
  //  la Declaración (buena fe / bajo pena de perjurio), la denuncia se enviaba con una
  //  declaración legal sin firmar. Por eso: sufijo distinto por invocación + limpieza
  //  de las marcas de las pasadas anteriores al entrar.
  // ---------------------------------------------------------------------------
  // Limpieza de lo que dejaron pasadas anteriores. Los nombres de esos atributos se
  // guardan en la propia página (window.__rs_clicsPrevios) porque APLICAR se inyecta de
  // cero cada vez y no puede recordar nada entre invocaciones.
  try {
    const marcasPrevias = window.__rs_clicsPrevios || [];
    for (let i = 0; i < marcasPrevias.length; i++) {
      const nombre = marcasPrevias[i];
      Array.prototype.slice.call(document.querySelectorAll("[" + nombre + "]"))
        .forEach(function (e) { try { e.removeAttribute(nombre); } catch (x) {} });
    }
    window.__rs_clicsPrevios = [];
  } catch (e) { /* página rara sin window/document utilizable: seguimos igual */ }
  // Sufijo irrepetible de ESTA invocación (hora en base 36 + azar): solo letras y
  // números, que es lo que admite un nombre de atributo y un selector [data-...].
  const sufijoDeEstaPasada = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // ===========================================================================
  //  RESPETAR LA ELECCIÓN DEL USUARIO.
  //  El propio manual de tk_copy le dice: "Si tu caso es otro tipo de obra (video,
  //  foto…), cámbialo tú con un clic". Pero el plan marca "Tipo de obra = Logotipo", y
  //  el bucle del service worker repite la pasada cada pocos segundos durante hasta 30
  //  minutos. Como los radios son EXCLUYENTES, si el usuario elegía "Vídeo" el radio de
  //  "Logotipo" quedaba SIN marcar, así que nada frenaba a la extensión —el único freno
  //  que había miraba si el control a clicar ya estaba marcado— y en la vuelta siguiente
  //  le deshacía su elección. Cada ~16 s. Lo mismo con "Origen de la obra" y con las
  //  casillas de la Declaración que el usuario desmarcara a propósito.
  //  Regla: la elección del usuario MANDA sobre el valor por defecto del plan.
  // ===========================================================================
  const MARCA_NUESTRA = "data-rs-marcada-por-la-extension";  // confirmada: la marcamos y quedó marcada
  const MARCA_PEDIDA = "data-rs-marcado-pedido";             // la pedimos, aún sin confirmar
  const yaAnotadoRespeto = [];

  // Radios del MISMO grupo excluyente: por `name` cuando lo hay y, si no (TikTok no
  // siempre lo pone), los que comparten el contenedor más pequeño que agrupa a más de
  // uno, subiendo como mucho 4 niveles para no acabar cogiendo el formulario entero.
  function grupoDeRadio(el) {
    try {
      if (!el || (el.type || "").toLowerCase() !== "radio") return [];
      if (el.name) {
        return Array.prototype.slice.call(
          document.querySelectorAll('input[type=radio][name="' + (el.name + "").replace(/"/g, '\\"') + '"]'));
      }
      let nodo = el.parentElement, k = 0;
      while (nodo && k < 4) {
        const rs = Array.prototype.slice.call(nodo.querySelectorAll("input[type=radio]"));
        if (rs.length > 1) return rs;
        nodo = nodo.parentElement; k++;
      }
      return [el];
    } catch (e) { return [el]; }
  }

  // De un elemento cualquiera (un <label>, un <span> de TikTok…) saca el radio/casilla
  // de verdad al que afecta. `clickOpcion` clica texto visible, no el input.
  function controlDe(el) {
    try {
      if (!el) return null;
      const t = (el.type || "").toLowerCase();
      if (t === "radio" || t === "checkbox") return el;
      const dentro = el.querySelector && el.querySelector("input[type=radio],input[type=checkbox]");
      if (dentro) return dentro;
      const lab = el.closest && el.closest("label");
      if (lab) {
        const c = lab.querySelector("input[type=radio],input[type=checkbox]");
        if (c) return c;
        const f = lab.getAttribute("for");
        if (f) { const c2 = document.getElementById(f); if (c2) return c2; }
      }
      return null;
    } catch (e) { return null; }
  }

  // ¿Esto que vamos a tocar lo eligió el USUARIO? Entonces no se toca.
  function eleccionDelUsuario(c) {
    try {
      if (!c) return false;
      const t = (c.type || "").toLowerCase();
      if (t === "radio") {
        if (c.checked) return false;                       // es la nuestra: nada que hacer
        return grupoDeRadio(c).some((r) => r !== c && r.checked); // otra del grupo: la suya
      }
      if (t === "checkbox") {
        // Solo cuenta si la marcamos NOSOTROS y quedó CONFIRMADA como marcada en una
        // pasada anterior. Sin esa confirmación no se puede distinguir "el usuario la
        // desmarcó" de "React revirtió nuestra marca antes de que el clic real llegara",
        // y confundirlas dejaría la Declaración sin firmar, que es peor.
        return !c.checked && c.hasAttribute(MARCA_NUESTRA);
      }
      return false;
    } catch (e) { return false; }
  }

  function respetarAlUsuario(el, quePaso) {
    const c = controlDe(el);
    if (!c || !eleccionDelUsuario(c)) return false;
    if (yaAnotadoRespeto.indexOf(c) < 0) {   // una sola línea por control y pasada
      yaAnotadoRespeto.push(c);
      anotar("respetada la eleccion del usuario", c, quePaso || "");
      // Y ADEMÁS SALE EN `faltan`, pero SOLO si es una CASILLA.
      // Respetar al usuario no puede significar dar el formulario por completo: una casilla
      // que él desmarcó lo deja INCOMPLETO. Sin esto, `faltan` volvía vacío, el bucle
      // encadenaba 3 rondas limpias, se daba por `completado`, guardaba el comprobante y
      // pulsaba Enviar: TikTok rechaza la denuncia por declaración sin firmar y al usuario
      // se le decía "denuncia enviada". Medido por QA con una y con dos de las tres
      // casillas de la Declaración desmarcadas.
      // UN RADIO NO: si se respeta un radio es porque OTRA opción de su grupo está marcada,
      // y eso es un formulario válido —justo el caso del manual, "cámbialo tú con un clic"—.
      if ((c.type || "").toLowerCase() === "checkbox") faltan.push("respetada:" + rotuloDe(c));
    }
    return true;
  }

  // CONFIRMACIÓN, al entrar en la pasada: toda casilla que pedimos marcar y que AHORA
  // está marcada, pasa a ser "nuestra confirmada". A partir de ahí, si aparece
  // desmarcada, es que la desmarcó el usuario.
  try {
    Array.prototype.slice.call(document.querySelectorAll("[" + MARCA_PEDIDA + "]"))
      .forEach(function (c) { try { if (c.checked) c.setAttribute(MARCA_NUESTRA, "1"); } catch (x) {} });
  } catch (e) { /* página rara: seguimos igual */ }

  // Etiqueta un radio/checkbox para que el service worker le dé un CLIC REAL después.
  function marcarParaClicReal(el) {
    if (!el) return;
    if (respetarAlUsuario(el, "clic real")) return; // el usuario ya eligió: no se toca
    const attr = "data-cr-" + sufijoDeEstaPasada + "-" + clicsReales.length; // ÚNICO en todo el documento
    try { el.setAttribute(attr, "1"); } catch (e) { return; }
    try { (window.__rs_clicsPrevios = window.__rs_clicsPrevios || []).push(attr); } catch (e) {}
    clicsReales.push("[" + attr + "]");
    // Queda anotado que ESTA casilla la pedimos nosotros (ver la confirmación de arriba).
    try { const c = controlDe(el); if (c && (c.type || "").toLowerCase() === "checkbox") c.setAttribute(MARCA_PEDIDA, "1"); } catch (e) {}
  }
  // VARIAS PASADAS automáticas: TikTok revela partes del formulario con retraso, así
  // que en vez de obligar al usuario a volver a pulsar "Rellenar", la propia extensión
  // REINTENTA en pasadas rápidas durante hasta ~16 s, reintentando SOLO los pasos
  // pendientes, hasta que TikTok muestre todo (o no quede nada por hacer). Sale en
  // cuanto no queda nada pendiente. Los pasos marcados p.opcional (p.ej. el botón
  // "Siguiente", que ya no existe en el formulario de una sola página) NO bloquean ni
  // se reportan si no aparecen.
  let pendientes = pasos.slice();
  // Cuántas veces ha vuelto a la cola cada paso TARDÍO (ver el tope, más abajo).
  const reencoladosTardios = new Map();
  const TOPE_REENCOLADO_TARDIO = 2;   // se intenta en las pasadas 1.ª, 2.ª y 3.ª
  // Informe por PASO (el último intento de cada uno; se sobrescribe en cada pasada).
  const informePasos = new Map();
  const describirPaso = (p) => {
    const busca = p.label || p.texto || p.etiquetas || p.pregunta || p.opcion || p.name || p.css || p.dominio || "";
    let d = p.tipo + (busca ? " «" + (busca + "").slice(0, 110) + "»" : "");
    if (p.valor != null && p.valor !== "") d += " -> " + (p.valor + "").replace(/\s+/g, " ").slice(0, 45);
    return d;
  };
  const t0Pasadas = Date.now();
  for (let pasada = 0; pendientes.length; pasada++) {
    if (pasada > 0) {
      if (Date.now() - t0Pasadas > 16000) break; // tope de espera total
      await dur(700);                             // deja que aparezca la sección que faltaba
    }
    faltan.length = 0;               // en cada pasada solo cuentan los fallos de AHORA
    const reintentar = [];
    for (const p of pendientes) {
    const antesFaltan = faltan.length;
    const antesOk = ok, antesReg = registro.length;
    let yaEspero = false;   // el paso ya se espero a si mismo (ver clickBoton con `avanza`)
    // -----------------------------------------------------------------------
    //  GUARDA DE VARIANTE DE FORMULARIO (siHay / siNoHay)
    //  Una misma denuncia puede tener DOS formularios distintos según lo que
    //  sirva la web ese día. Meta es el caso claro de Derechos de autor: el
    //  formulario CLÁSICO (facebook.com/help/contact/…, campos con atributo
    //  `name`, todo en una página, cajas "Enlace 1..30") y el PORTAL NUEVO
    //  (help.meta.com/requests/…, asistente de 2 pasos, sin `name`, una sola
    //  caja de URLs). Un paso puede llevar un selector CSS en `siHay` (solo se
    //  ejecuta si ese campo existe en la página) o en `siNoHay` (solo si NO
    //  existe). El paso que no le toca se SALTA: ni cuenta como hecho, ni se
    //  reporta como fallo, ni se reintenta. Así el plan lleva las dos variantes
    //  y siempre se rellena la que de verdad esté delante, sin adivinar.
    // -----------------------------------------------------------------------
    let noAplica = false;
    try {
      if (p.siHay && !document.querySelector(p.siHay)) noAplica = true;
      if (p.siNoHay && document.querySelector(p.siNoHay)) noAplica = true;
    } catch (e) { /* selector mal escrito: el paso se intenta igual */ }
    if (noAplica) {
      informePasos.set(p, { paso: describirPaso(p), estado: "no es de este formulario", hizo: [], pasada: pasada + 1 });
      continue;
    }
    try {
      if (p.tipo === "select" || p.tipo === "selectPais") {
        const texto = p.tipo === "selectPais" ? p.valor : p.texto;
        if (texto != null && texto !== "") { if (setSelect(p.name, texto, p.suf)) ok++; else faltan.push(p.name); }
      } else if (p.tipo === "radio") {
        const sel = 'input[type=radio][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]';
        const partes = p.texto ? norm(p.texto).split("|").filter(Boolean) : null;
        const buscar = () => {
          const radios = Array.prototype.slice.call(document.querySelectorAll(sel));
          if (!radios.length) return null;
          if (!partes) return radios[0];
          return radios.find((r) => {
            let lab = r.id ? (document.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && r.nextElementSibling) lab = r.nextElementSibling.innerText || "";
            if (!lab && r.parentElement && (r.parentElement.innerText || "").length < 40) lab = r.parentElement.innerText || "";
            const v = norm(r.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          }) || null;
        };
        let marcado = false, destinoFinal = null;
        // Misma guarda: 4 intentos de 300 ms contra una pagina sin radios son 1,2 s tirados.
        const vueltasR = document.querySelector('input[type=radio]') ? 4 : 1;
        for (let it = 0; it < vueltasR && !marcado; it++) {
          const destino = buscar(); // re-buscar fresco cada intento (React reemplaza el nodo)
          if (destino) { destinoFinal = destino; marcado = marcarRadioEl(destino); }
          if (!marcado && it + 1 < vueltasR) await dur(300);
        }
        // NO SE OMITE EL CLIC REAL AUNQUE EL RADIO YA APAREZCA MARCADO. Se intentó
        // (ahorraba ~1 s por vuelta) y es un error: `checked` en el DOM NO prueba que la
        // aplicación lo haya aceptado. `marcarRadioEl` lo pone con el setter nativo y
        // devuelve true aunque React no se entere -que es la razón misma de que exista el
        // clic real por depurador-. Y el service worker cuenta con que cada pasada le
        // vuelva a pedir estos clics: si la pestaña se fue, PAUSA y los repite al volver
        // (ver background.js). Omitirlos deja un radio marcado solo sintéticamente para
        // siempre, con el formulario PARECIENDO relleno y enviándose sin esa respuesta,
        // en una denuncia que se firma bajo pena de perjurio.
        if (destinoFinal) { marcarParaClicReal(destinoFinal); ok++; } else faltan.push(p.name);
      } else if (p.tipo === "radioVal") {
        // Marca radio por NAME+VALUE exactos, como autorrelleno.py (clic en label,
        // dispatch change, reintentos porque React lo revierte).
        let okR = false, targetFinal = null;
        const vueltasRV = document.querySelector('input[type=radio]') ? 4 : 1;
        for (let intento = 0; intento < vueltasRV && !okR; intento++) {
          const els = document.querySelectorAll('input[name="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          let target = null;
          for (let i = 0; i < els.length; i++) { if (els[i].value === p.value) { target = els[i]; break; } }
          if (target) targetFinal = target;
          okR = marcarRadioEl(target);
          if (!okR && intento + 1 < vueltasRV) await dur(300);
        }
        // NO SE OMITE EL CLIC REAL AUNQUE EL RADIO YA APAREZCA MARCADO. Se intentó
        // (ahorraba ~1 s por vuelta) y es un error: `checked` en el DOM NO prueba que la
        // aplicación lo haya aceptado. `marcarRadioEl` lo pone con el setter nativo y
        // devuelve true aunque React no se entere -que es la razón misma de que exista el
        // clic real por depurador-. Y el service worker cuenta con que cada pasada le
        // vuelva a pedir estos clics: si la pestaña se fue, PAUSA y los repite al volver
        // (ver background.js). Omitirlos deja un radio marcado solo sintéticamente para
        // siempre, con el formulario PARECIENDO relleno y enviándose sin esa respuesta,
        // en una denuncia que se firma bajo pena de perjurio.
        if (targetFinal) { marcarParaClicReal(targetFinal); ok++; } else faltan.push("radioVal:" + p.name);
      } else if (p.tipo === "radioPregunta") {
        // Marca un RADIO identificándolo por (a) la PREGUNTA a la que pertenece y (b) el
        // TEXTO de la opción. Necesario para TikTok, que ya NO usa <select>/menús sino radios
        // con texto y REPITE "Sí/No" en varias preguntas: sin anclar a la pregunta se marcaría
        // el grupo equivocado. Casa por palabras clave en español (respaldo a inglés), sin
        // depender de la frase exacta. Marca robusto + clic real (React de TikTok lo exige).
        const kpreg = norm(p.pregunta || "").split("|").filter(Boolean);
        const kop = norm(p.opcion || "").split("|").filter(Boolean);
        // Casa la ETIQUETA de la opción: alternativas con "&" => todas sus palabras presentes;
        // alternativas cortas (sí/no) => coincidencia EXACTA (evita casar "no" dentro de otra
        // palabra); el resto => "contiene".
        const casaOpcion = (label) => kop.some((kw) => {
          if (kw.indexOf("&") >= 0) return kw.split("&").every((tok) => (tok = tok.trim()) && label.indexOf(tok) >= 0);
          if (kw.length <= 4) return label === kw;
          return label.indexOf(kw) >= 0;
        });
        // PREGUNTA más cercana a un radio: el hermano anterior (subiendo por ancestros) que NO
        // contiene a su vez un radio (así saltamos otras OPCIONES y llegamos al título).
        const preguntaDe = (r) => {
          let par = r.parentElement, k = 0;
          while (par && k < 8) {
            let ps = par.previousElementSibling, j = 0;
            while (ps && j < 8) {
              const t = norm(ps.innerText || "");
              if (t && t.length > 4 && !ps.querySelector('input[type=radio],[role=radio]')) return t;
              ps = ps.previousElementSibling; j++;
            }
            par = par.parentElement; k++;
          }
          return "";
        };
        // ETIQUETA propia de un radio: label[for] / aria-label / <label> contenedor / hermano
        // siguiente / texto del padre corto. Se toma UNA sola (sin concatenar) para poder
        // comparar exacto en las opciones cortas.
        const etiquetaDe = (r) => {
          let lab = "";
          if (r.id) { const lf = document.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]'); if (lf) lab = lf.innerText || ""; }
          if (!lab && r.getAttribute("aria-label")) lab = r.getAttribute("aria-label");
          if (!lab && r.closest) { const lc = r.closest("label"); if (lc) lab = lc.innerText || ""; }
          if (!lab && r.nextElementSibling) lab = r.nextElementSibling.innerText || "";
          if (!lab && r.parentElement && (r.parentElement.innerText || "").length < 80) lab = r.parentElement.innerText || "";
          // OJO: hay que NORMALIZAR ESPACIOS. El portal nuevo de Meta devuelve rótulos con
          // saltos de línea ("\nSí\n"), y las opciones cortas (sí/no) se comparan EXACTO:
          // sin recortar, "si\n" nunca casaría con "si" y el radio se quedaba sin marcar.
          return norm(lab).replace(/\s+/g, " ").trim();
        };
        // RESPALDO de anclaje: en el portal nuevo de Meta el título de la pregunta NO es
        // hermano anterior de la opción, así que preguntaDe() devuelve "". Buscamos entonces
        // el ANCESTRO MÁS AJUSTADO (el de texto más corto, hasta 10 niveles) que contenga la
        // pregunta: eso identifica el grupo correcto aunque otras preguntas repitan "Sí/No".
        const cercaniaPregunta = (r) => {
          let par = r.parentElement, k = 0;
          while (par && k < 10) {
            const t = norm(par.innerText || "");
            if (kpreg.some((kw) => t.indexOf(kw) >= 0)) return t.length;
            par = par.parentElement; k++;
          }
          return -1;
        };
        const visible = (r) => { const rr = r.getBoundingClientRect(); return !(rr.width < 1 && rr.height < 1); };
        let okRP = false, destinoRP = null;
        const vueltasRP = document.querySelector('input[type=radio],[role=radio]') ? 4 : 1;
        for (let it = 0; it < vueltasRP && !okRP; it++) {
          const radios = Array.prototype.slice.call(document.querySelectorAll('input[type=radio],[role=radio]'));
          let cand = radios.find((r) => {
            if (!visible(r)) return false; // oculto de verdad
            if (kpreg.length) { const preg = preguntaDe(r); if (!kpreg.some((kw) => preg.indexOf(kw) >= 0)) return false; }
            return casaOpcion(etiquetaDe(r));
          });
          if (!cand && kpreg.length) {
            const conBloque = radios
              .filter((r) => visible(r) && casaOpcion(etiquetaDe(r)))
              .map((r) => ({ r: r, d: cercaniaPregunta(r) }))
              .filter((o) => o.d >= 0)
              .sort((a, b) => a.d - b.d); // el bloque más pequeño = el grupo de esta pregunta
            if (conBloque.length) cand = conBloque[0].r;
          }
          if (cand) { destinoRP = cand; okRP = marcarRadioEl(cand); }
          if (!okRP && it + 1 < vueltasRP) await dur(300);
        }
        // NO SE OMITE EL CLIC REAL AUNQUE EL RADIO YA APAREZCA MARCADO. Se intentó
        // (ahorraba ~1 s por vuelta) y es un error: `checked` en el DOM NO prueba que la
        // aplicación lo haya aceptado. `marcarRadioEl` lo pone con el setter nativo y
        // devuelve true aunque React no se entere -que es la razón misma de que exista el
        // clic real por depurador-. Y el service worker cuenta con que cada pasada le
        // vuelva a pedir estos clics: si la pestaña se fue, PAUSA y los repite al volver
        // (ver background.js). Omitirlos deja un radio marcado solo sintéticamente para
        // siempre, con el formulario PARECIENDO relleno y enviándose sin esa respuesta,
        // en una denuncia que se firma bajo pena de perjurio.
        if (destinoRP) { marcarParaClicReal(destinoRP); ok++; } else faltan.push("radioPregunta:" + (p.pregunta || p.opcion));
      } else if (p.tipo === "check") {
        const cbs = Array.prototype.slice.call(
          document.querySelectorAll('input[type=checkbox][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]'));
        let el = null;
        if (!p.texto) {
          el = cbs[0]; // sin texto => la (única) casilla
        } else {
          const partes = norm(p.texto).split("|").filter(Boolean);
          el = cbs.find((c) => {
            let lab = c.id ? (document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && c.parentElement) lab = c.parentElement.innerText || "";
            const v = norm(c.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          });
        }
        // UNA CASILLA YA MARCADA NO SE VUELVE A CLICAR. Al revés que un radio, una casilla
        // ALTERNA: un segundo clic real la DESMARCA. `insistirRelleno` hace dos pasadas
        // seguidas y solo la segunda dispara los clics, así que la primera la dejaba
        // `checked` sintético y la segunda pedía el clic que la apagaba. Es la misma guarda
        // que ya tienen `checkVarios` y `checkLabel`, y este proyecto ya se llevó ese susto
        // con las casillas de la Declaración de TikTok.
        if (el && el.checked) ok++;
        else if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; }
        else faltan.push(p.name);
      } else if (p.tipo === "fillName") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector('[name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.name);
        }
      } else if (p.tipo === "fillCss") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector(p.css);
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.css);
        }
      } else if (p.tipo === "fillAny") {
        if (p.valor != null && p.valor !== "") {
          let hecho = false;
          for (const nm of (p.names || [])) {
            const el = document.querySelector('[name="' + (nm + "").replace(/"/g, '\\"') + '"]');
            if (el) { setNative(el, p.valor); ok++; hecho = true; break; }
          }
          if (!hecho) faltan.push((p.names || []).join("|"));
        }
      } else if (p.tipo === "dropdown") {
        // Menú-botón de TikTok: abre el desplegable (por su pregunta o índice) y
        // elige la opción cuyo texto contenga 'opcion'.
        // Sin valor que elegir (p.ej. la marca no tiene país configurado) NO se abre el
        // menú: se avisa con un mensaje entendible en vez de dejarlo vacío en silencio.
        const sinValor = !String(p.opcion || "").trim() && typeof p.opcionIndice !== "number";
        const ds = sinValor ? [] : Array.prototype.slice.call(document.querySelectorAll('[aria-haspopup="listbox"],[role="combobox"]'));
        if (sinValor) faltan.push(p.desc || "opcion vacia");
        // Alternativas (es|en) de la opción buscada, con los espacios RECORTADOS: el país
        // de la marca lo escribe el usuario y puede traer espacios sobrantes ("Ecuador ").
        const ops = norm(p.opcion || "").split("|").map((s) => s.trim()).filter(Boolean);
        // ¿El texto de este menú es YA la opción que buscamos? Se compara igual que se
        // elige (palabras clave con "&"), para no depender de la redacción exacta.
        const casaConLoBuscado = (t) => ops.some((kw) => kw.indexOf("&") >= 0
          ? kw.split("&").every((tok) => (tok = tok.trim()) && t.indexOf(tok) >= 0)
          : t.indexOf(kw) >= 0);
        // MENÚ DE **ESTA** PREGUNTA. Se busca el ancestro MÁS AJUSTADO (el de texto más
        // corto) que contenga la pregunta, igual que hace `radioPregunta`: subir un número
        // fijo de niveles no vale, porque TikTok mete el botón dentro de 3 o 4 <div> y el
        // título vive fuera de todos ellos, mientras que subir de más acaba abarcando el
        // formulario entero y casaría con cualquier menú.
        const cercaniaDe = (d) => {
          const partes = norm(p.pregunta || "").split("|").filter(Boolean);
          if (!partes.length) return -1;
          let par = d.parentElement, k = 0;
          while (par && k < 6) {
            const t = norm(par.innerText || "");
            if (partes.some((kw) => t.indexOf(kw) >= 0)) return t.length;
            par = par.parentElement; k++;
          }
          return -1;
        };
        const menuDeLaPregunta = () => {
          const conPregunta = ds.map((d) => ({ d: d, cerca: cercaniaDe(d) }))
                                .filter((x) => x.cerca >= 0)
                                .sort((a, b) => a.cerca - b.cerca);
          return conPregunta.length ? conPregunta[0].d : null;
        };
        // Menús aún SIN RESPONDER (muestran "Select"/"Seleccionar"): el siguiente a llenar
        // es el primero sin selección. Solo se usa en el PRIMER clic, con el usuario delante.
        const sinSel = ds.filter((d) => {
          const t = norm(d.innerText);
          return !t || t.indexOf("select") >= 0 || t.indexOf("seleccion") >= 0 || t.indexOf("elegir") >= 0 || t.indexOf("choose") >= 0;
        });
        // ------------------------------------------------------------------------------
        //  soloSiVacio: lo pone la REPETICIÓN AUTOMÁTICA del service worker (ver popup.js).
        //  Ese bucle corre cada pocos segundos hasta 30 minutos SIN NADIE MIRANDO, sobre una
        //  denuncia que se firma bajo pena de perjurio, así que aquí las reglas son otras:
        //   1) NUNCA a ciegas: sin `pregunta` que lo ancle, el paso no toca ningún menú.
        //      Coger "el primer menú sin responder" podía abrir CUALQUIER otro desplegable
        //      del formulario y ponerle una respuesta que el usuario no eligió.
        //   2) "Ya respondido" NO se adivina por el texto del hueco: se comprueba que el
        //      menú YA MUESTRE la opción que buscábamos. Adivinarlo por palabras ("Select",
        //      "Elegir"…) fallaba con cualquier otra redacción ("Elige una opción") y dejaba
        //      el formulario en blanco dando el paso por hecho.
        //   3) Si su menú todavía no está en pantalla, no pasa nada: el bucle vuelve.
        //  Y si vuelve a estar vacío (recarga, sesión reiniciada), SÍ se re-elige: sin el
        //  desplegable "¿Qué problema tienes?" TikTok no enseña ni un campo.
        // ------------------------------------------------------------------------------
        let btn = null, saltar = false;
        if (p.soloSiVacio) {
          const suyo = p.pregunta ? menuDeLaPregunta() : null;
          if (!suyo) saltar = true; // sin ancla o aún no aparece: no se toca nada
          else if (casaConLoBuscado(norm(suyo.innerText).replace(/\s+/g, " ").trim())) saltar = true; // ya puesto
          else btn = suyo;
        } else {
          const pool = sinSel.length ? sinSel : ds;
          if (p.pregunta) {
            const suyo = menuDeLaPregunta();
            // SU menú ya está respondido (lo puso el usuario a mano, o una pasada anterior):
            // no hay nada que hacer y NO se cae al "primer menú sin responder", que es OTRA
            // pregunta. Caer ahí llegaba a marcar la respuesta de otro campo: en TikTok
            // Derechos de autor declaraba «Soy el propietario de los derechos de autor»
            // cuando el resto de la denuncia dice que actuamos como agente autorizado, y eso
            // se firma bajo pena de perjurio. Se salta sin `anotar()`: no se tocó nada.
            if (suyo && pool.indexOf(suyo) < 0 && sinSel.length) { saltar = true; }
            else btn = suyo;
          }
          if (!btn && !saltar) btn = pool[p.indice || 0] || pool[0];
        }
        if (btn) {
          btn.click();
          // Coincidencia por PALABRAS CLAVE: una alternativa con "&" casa si TODAS sus
          // palabras están presentes (en cualquier orden). Así NO dependemos de la frase
          // exacta de TikTok, que cambia de redacción e idioma. Ej.: "marca&contenido"
          // casa con "Infracción de derechos de marca comercial en el contenido generado…".
          // Para lo demás se busca por PRIORIDAD: exacto -> empieza por -> contiene, para no
          // coger un país que solo CONTENGA al buscado (p.ej. "Guinea" -> "Guinea Ecuatorial").
          const elegirDe = (lista) => {
            const textos = lista.map((x) => norm(x.innerText).replace(/\s+/g, " ").trim());
            for (const kw of ops) {
              if (kw.indexOf("&") >= 0) {
                const i = textos.findIndex((t) => kw.split("&").every((tok) => (tok = tok.trim()) && t.indexOf(tok) >= 0));
                if (i >= 0) return lista[i];
                continue;
              }
              let i = textos.indexOf(kw);                              // exacto
              if (i < 0) i = textos.findIndex((t) => t.indexOf(kw) === 0); // empieza por
              if (i < 0) i = textos.findIndex((t) => t.indexOf(kw) >= 0); // contiene
              if (i >= 0) return lista[i];
            }
            return null;
          };
          // Lista solo las opciones REALMENTE visibles del menú abierto (evita <li> sueltos
          // de otros menús de la página); si no hay role=option/menuitem, cae a <li>.
          const listar = () => {
            let l = Array.prototype.slice.call(document.querySelectorAll('[role=option],[role=menuitem]'))
              .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && norm(x.innerText); });
            if (!l.length) l = Array.prototype.slice.call(document.querySelectorAll('li'))
              .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && norm(x.innerText); });
            return l;
          };
          let o = null, lista = [];
          for (let intento = 0; intento < 7 && !o; intento++) {
            await dur(400);
            lista = listar();
            if (ops.length) o = elegirDe(lista);
          }
          // Respaldo por POSICIÓN: si no casó por texto (TikTok cambió la redacción) y el
          // paso indica la opción por orden, la tomamos por índice (p.ej. la 1.ª).
          // NUNCA dentro de la repetición automática (`soloSiVacio`): elegir "la primera
          // opción de la lista" a ciegas, sin nadie mirando, puede responder cualquier cosa.
          if (!o && !p.soloSiVacio && typeof p.opcionIndice === "number" && lista.length) o = lista[p.opcionIndice] || null;
          if (o) { o.click(); anotar("eligio", btn, (o.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70)); ok++; }
          else {
            // Mensaje entendible: dice QUÉ se buscó y que no está en la lista.
            faltan.push(p.desc ? (p.desc + " «" + p.opcion + "» no está en la lista")
                               : ("opcion:" + (p.opcion || p.opcionIndice)));
            // Se CIERRA el menú que abrimos, y eso SÍ toca la página: hay que darle tiempo
            // a cerrarse antes de que el paso siguiente empiece a buscar, o se pone a mirar
            // una pantalla con el desplegable a medio recoger. No se `anotar()`: abrir y
            // cerrar un menú no es rellenar nada, y `hechos` no puede contarlo; por eso la
            // espera se hace aquí en vez de dejarla a la espera central.
            try { document.body.click(); } catch (e) {}
            yaEspero = true;
            await dur(p.esperaMs || 400);
          }
        } else if (saltar) {
          // Nada que hacer: su menú ya trae la opción buscada, o todavía no está en
          // pantalla. NO se llama a `anotar()` A PROPÓSITO: `hechos` cuenta los campos que
          // se TOCARON de verdad, y es lo que impide guardar el comprobante de un
          // formulario vacío (ver background.js). Un paso que no escribe nada no puede
          // hacer creer que se rellenó algo.
          ok++;
        } else if (!sinValor) faltan.push("menu:" + (p.pregunta || p.indice));
        // Al saltar no se espera: la espera existe para dar tiempo a que TikTok pinte lo
        // que revela el menú, y aquí no se ha tocado nada. Sin esto, cada vuelta del bucle
        // se llevaba 2,5 s por desplegable sin motivo.
      } else if (p.tipo === "fillLabel") {
        // Rellena el primer campo VISIBLE y vacío cuyo texto cercano contenga la etiqueta.
        // REINTENTA unos segundos: TikTok (y otros SPA React) pintan la sección un
        // instante después, así que un solo escaneo la perdía y marcaba todo como
        // "no encontrado". Reintentamos hasta que el campo aparezca.
        if (p.valor != null && p.valor !== "") {
          const kws = (p.label || "").split("|").map(norm).filter(Boolean);
          let yaLleno = false; // el campo que coincide ya tenía valor (p.ej. correo verificado)
          // La palabra clave debe aparecer como PALABRA, no dentro de otra: "firma" no
          // puede casar con "CONFIRMA tu correo" (pasaba: la firma acababa en la caja de
          // confirmar el correo). Delante y detrás debe haber algo que no sea letra/dígito.
          const casa = (c, kw) => {
            let i = c.indexOf(kw);
            while (i >= 0) {
              const antes = i === 0 ? " " : c.charAt(i - 1);
              const desp = (i + kw.length >= c.length) ? " " : c.charAt(i + kw.length);
              if (!/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(desp)) return true;
              i = c.indexOf(kw, i + 1);
            }
            return false;
          };
          const casaAlguna = (c) => kws.some((kw) => casa(c, kw));
          const excluirKws = (p.excluir || "").split("|").map(norm).filter(Boolean);
          // Un TÍTULO de campo es corto y no es una frase acabada; un párrafo explicativo
          // largo que termina en punto es PROSA y no rotula la caja que tenga al lado.
          const esProsa = (t) => { const s = (t || "").trim(); return s.length > 90 && /[.!?]$/.test(s); };
          // Busca el campo cuyo rótulo coincide MÁS DE CERCA. Antes se cogía el primero
          // en orden del DOM, y como el "contexto" incluye los rótulos de las secciones
          // ANTERIORES (se sube por los ancestros), un campo de más abajo podía quedarse
          // con el texto de otro: en TikTok, la caja "URL del material original" se comía
          // la coincidencia y la "Descripción de la obra con copyright" quedaba vacía (o al
          // revés, la Descripción se llenaba con la URL). Ahora cada coincidencia guarda su
          // DISTANCIA (0 = rótulo propio, 1..4 = hermanos anteriores, 5+ = ancestros) y gana
          // la más cercana; a igual distancia, se prefiere el campo VACÍO.
          const buscarCampo = () => {
            const els = Array.prototype.slice.call(
              document.querySelectorAll('textarea,input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],input:not([type])'));
            // Campos VISIBLES en orden de la página: sirven para exigir que entre un
            // rótulo y su caja no haya OTRO campo (si lo hay, ese rótulo es de otro).
            const visibles = els.filter((x) => { const q = x.getBoundingClientRect(); return q.width >= 2 && q.height >= 2; });
            const hayCampoEntre = (rot, campo) => {
              for (const f of visibles) {
                if (f === campo) continue;
                const a = rot.compareDocumentPosition(f), b = f.compareDocumentPosition(campo);
                if ((a & Node.DOCUMENT_POSITION_FOLLOWING) && (b & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
              }
              return false;
            };
            let mejor = null, mejorDist = Infinity, mejorLleno = true;
            for (const e of els) {
              const r = e.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              // Contexto por NIVELES, del más pegado al campo al más lejano. La DISTANCIA
              // es el nivel (0 = rótulo propio, 1 = hermanos del campo, 2 = hermanos del
              // padre…), NO la posición en la lista: dos hermanos del mismo nivel están
              // igual de cerca. Si no, un campo con texto de ayuda ("Verifica tu correo"
              // + "Te enviaremos un código") quedaba "más lejos" de su título que otro
              // campo sin ayuda, y ese otro le robaba el relleno.
              const niveles = [];
              let propio = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
              if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) propio += " " + (lf.innerText || ""); }
              // GitHub asocia el rótulo por aria-labelledby (referencia por id), no por label[for].
              const lblby = e.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) propio += " " + (le.innerText || ""); });
              niveles.push({ t: propio, n: 0, el: null });
              // El rótulo es un hermano ANTERIOR del campo (GitHub) o del ancestro que lo
              // envuelve (TikTok mete la caja en un <div> aparte). Se recogen, de dentro
              // hacia fuera, hasta 3 hermanos anteriores de cada nivel: así el título y su
              // texto de ayuda entran aunque la caja esté envuelta, y lo más cercano manda.
              // OJO RENDIMIENTO: aquí se usa textContent, NUNCA innerText. innerText
              // fuerza al navegador a recalcular el diseño en CADA lectura; en una
              // página real (TikTok tiene miles de elementos) eso deja el formulario
              // colgado y no se rellena nada. textContent no toca el diseño.
              let nodo = e, k = 0;
              while (nodo && k < 12) {
                let ps = nodo.previousElementSibling, j = 0;
                while (ps && j < 3) { niveles.push({ t: ps.textContent || "", n: k + 1, el: ps }); ps = ps.previousElementSibling; j++; }
                nodo = nodo.parentElement; k++;
              }
              // EXCLUIR: palabras que descartan el campo aunque su rótulo case. Hace falta
              // cuando una etiqueta corta es PARTE de otra más larga: en Cloudflare,
              // "Address" casa también con "Your email address" y "Confirm email address",
              // y como esas ya están llenas se daba el paso por hecho y la dirección de
              // verdad quedaba VACÍA. Solo se mira el rótulo CERCANO (niveles 0 y 1): más
              // arriba está el formulario entero y descartaría cualquier cosa.
              if (excluirKws.length) {
                const cerca = niveles.filter((x) => x.n <= 1)
                  .map((x) => x.el ? textoNorm(x.el) : norm(x.t)).join(" ");
                if (excluirKws.some((kw) => cerca.indexOf(kw) >= 0)) continue;
              }
              let dist = -1;
              for (let n = 0; n < niveles.length && dist < 0; n++) {
                const c = niveles[n].el ? textoNorm(niveles[n].el) : norm(niveles[n].t);
                if (!casaAlguna(c) || esProsa(niveles[n].t)) continue;
                // Regla clave: un texto solo rotula a ESTE campo si entre los dos no hay
                // otro campo. Si lo hay, ese texto es el rótulo del otro (así un título de
                // la sección anterior deja de "adoptar" la caja de la siguiente).
                if (niveles[n].el && hayCampoEntre(niveles[n].el, e)) continue;
                dist = niveles[n].n;
              }
              if (dist < 0) continue;
              // Un campo BLOQUEADO (el correo que TikTok ya trae puesto y pinta en gris)
              // cuenta como "ya lleno": no se puede escribir en él y no hay que buscarle
              // sustituto ni marcar el paso como fallido.
              const lleno = !!e.value || e.disabled || e.readOnly;
              if (dist < mejorDist || (dist === mejorDist && mejorLleno && !lleno)) {
                mejor = e; mejorDist = dist; mejorLleno = lleno;
              }
            }
            if (!mejor) return null;
            if (mejorLleno) { yaLleno = true; return null; } // el que toca ya tiene valor
            return mejor;
          };
          // PLAN B — como lo haría una persona: buscar en la página el RÓTULO (el texto
          // visible) y rellenar el primer campo vacío que venga DESPUÉS de él. Sirve
          // cuando el título y la caja no son vecinos en el DOM (TikTok y otros SPA
          // envuelven la caja en varios <div>, y subiendo por ancestros no se llega al
          // título). Si el campo que sigue al rótulo YA tiene valor, no se toca nada.
          const CAMPOS_SEL = 'textarea,input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],input:not([type])';
          // RESPALDO — solo si lo anterior NO encuentra el campo: se busca el RÓTULO
          // visible en la página y se rellena la primera caja VACÍA que va debajo, en su
          // misma sección. Sirve cuando el título y la caja no son vecinos en el DOM.
          // Es CONSERVADOR a propósito: nunca da un paso por hecho (eso solo puede
          // decidirlo la búsqueda principal) y prefiere elementos que parecen rótulos
          // (en TikTok el título es <p class="field-title">, ver html_tk.json).
          const buscarPorRotulo = () => {
            const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
            const pareceRotulo = (e) => {
              const tag = e.tagName;
              if (tag === "LABEL" || tag === "LEGEND" || tag[0] === "H") return true;
              const cls = (e.getAttribute("class") || "").toLowerCase();
              if (/label|title|titulo|field|campo|question|pregunta|caption/.test(cls)) return true;
              return (e.textContent || "").length <= 120; // texto corto = título, no párrafo
            };
            // RENDIMIENTO: se criba con textContent (no recalcula el diseño); solo a los
            // POCOS que casan se les mide tamaño.
            const rotulos = [];
            const todos = document.querySelectorAll("label,legend,h1,h2,h3,h4,h5,p,span,div,strong,b,li,td,th");
            for (let i = 0; i < todos.length; i++) {
              const e = todos[i], t0 = e.textContent;
              if (!t0 || t0.length > 300) continue;
              const t = textoNorm(e); // normalizado con caché (lo caro es normalizar)
              if (!casaAlguna(t) || esProsa(t0)) continue;
              if (!pareceRotulo(e) || !visible(e)) continue;
              rotulos.push(e);
            }
            // Los más INTERNOS (el <div> de toda la sección también contiene el texto) y
            // del más CORTO al más largo: el título del campo es corto y concreto.
            const internos = rotulos
              .filter((e) => !rotulos.some((o) => o !== e && e.contains(o)))
              .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
            const campos = Array.prototype.slice.call(document.querySelectorAll(CAMPOS_SEL));
            let llenoVisto = false; // algún rótulo tenía su caja YA rellena
            for (const rot of internos) {
              for (const e of campos) {
                const pos = rot.compareDocumentPosition(e);
                // debe ir DESPUÉS del rótulo (o estar dentro de él)
                if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) continue;
                if (e.value || e.disabled || e.readOnly) { llenoVisto = true; break; } // la de ESTE rótulo ya está (o está bloqueada): probar otro
                if (!visible(e)) continue;
                // y estar en la MISMA sección: subiendo desde el campo, algún ancestro
                // cercano debe contener también al rótulo (si no, es otra parte del
                // formulario que solo menciona esas palabras de pasada).
                let anc = e.parentElement, k = 0, juntos = false;
                while (anc && k < 12) { if (anc.contains(rot)) { juntos = true; break; } anc = anc.parentElement; k++; }
                if (!juntos) continue;
                return e;
              }
            }
            // Ningún rótulo tiene una caja vacía y al menos uno la tiene ya rellena: el
            // paso está HECHO. (Si no se marcara, se gastarían los reintentos en cada
            // repetición del autorrelleno y el paso saldría como "no encontrado".)
            if (llenoVisto) yaLleno = true;
            return null;
          };
          // ORDEN: primero la búsqueda de siempre (el rótulo más cercano al campo, que es
          // como está montado el formulario real de TikTok: <p class="field-title"> justo
          // encima de la caja) y, SOLO si no encuentra nada, el respaldo por rótulo. Al
          // revés se corría el riesgo de dar por hecho un campo que no se había tocado y
          // dejar el formulario entero en blanco.
          let hit = null;
          // NO AGOTAR LOS REINTENTOS CONTRA UNA PÁGINA QUE NO TIENE NI UNO. Los reintentos
          // existen porque la web pinta la sección con retraso, no porque la sección no
          // exista: si en toda la página no hay ni un campo de texto, insistir solo gasta
          // segundos. Y no se pierde nada, porque el paso vuelve a la cola de reintentos.
          const hayAlgunCampo = Array.prototype.slice.call(document.querySelectorAll(CAMPOS_SEL))
            .some((e) => { const r = e.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; });
          // Y un paso TARDÍO tampoco los agota mientras NO QUEDE NI UNA CAJA VACÍA en la
          // página. Ésta es la señal de verdad, y sustituye a una que no lo era: antes esto
          // miraba `pasada === 0`, que para un `tardio` valía SIEMPRE 0 -no se re-encolaba
          // nunca-, así que la rama de "a partir de la 2.ª pasada" era código muerto y el
          // paso hacía UN intento y se rendía. En TikTok lo tapaba el bucle; en YouTube
          // Marca, que no tiene bucle, la descripción de la infracción se quedaba vacía.
          // POR QUÉ "no queda ni una caja vacía" es la señal buena: si la sección de este
          // campo aún no se ha pintado, el formulario que la traerá tiene por fuerza otras
          // cajas sin rellenar. Si TODO lo demás está lleno, aquí no va a aparecer nada en
          // los próximos 3 segundos. Es justo lo que pasa en la pantalla de verificar el
          // correo de TikTok: la única caja es la del correo y, en cuanto se rellena, no
          // queda ninguna vacía -de ahí los 3,2 s por campo peleándose con una sección que
          // todavía no existe-.
          const hayCajaVacia = Array.prototype.slice.call(document.querySelectorAll(CAMPOS_SEL))
            .some((e) => {
              if (e.value || e.disabled || e.readOnly) return false;
              const r = e.getBoundingClientRect();
              return r.width >= 2 && r.height >= 2;
            });
          const vueltasFL = !hayAlgunCampo ? 1
            : (p.tardio && !hayCajaVacia) ? 1
            : (p.reintentos || 1);
          for (let intentoFL = 0; intentoFL < vueltasFL && !hit && !yaLleno; intentoFL++) {
            hit = buscarCampo();
            if (!hit && !yaLleno) hit = buscarPorRotulo();
            // La espera va ENTRE intentos: tras el ultimo no hay nada que esperar.
            if (!hit && !yaLleno && intentoFL + 1 < vueltasFL) await dur(400);
          }
          if (hit) { setNative(hit, p.valor); ok++; }
          else if (yaLleno) { ok++; } // ya estaba relleno (correo verificado, etc.)
          else faltan.push("etiqueta:" + p.label);
        }
      } else if (p.tipo === "fillUrlsUnaCaja") {
        // UNA sola caja para TODAS las URLs (TikTok: una por línea; portal nuevo de Meta:
        // separadas por coma -> p.separador). Se llena por partes, así que si la caja aún
        // no está visible NO rompe (la llenará un Rellenar posterior).
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (!urls.length) {
          // nada que poner
        } else {
          const etiquetas = (p.label || "").split("|").map(norm).filter(Boolean);
          const placeholders = (p.placeholder || "").split("|").map(norm).filter(Boolean);
          // Cajas PROHIBIDAS: otras del mismo formulario que comparten el placeholder de
          // ejemplo (en TikTok, "URL al material original con copyright" también trae
          // "e.g.https://www.tiktok.com/@..."). Sin esto, si esa caja quedaba vacía se
          // llevaba las URLs a DENUNCIAR, que es justo lo contrario de lo que va ahí.
          const prohibidas = (p.excluir || "").split("|").map(norm).filter(Boolean);
          const texto = urls.join(p.separador || "\n");
          const buscarCaja = () => {
            let candidatoPh = null; // mejor coincidencia SOLO por placeholder (respaldo)
            const campos = Array.prototype.slice.call(
              document.querySelectorAll("textarea, input[type=text], input:not([type])"));
            for (const e of campos) {
              const r = e.getBoundingClientRect();
              if (r.width <= 2 || r.height <= 2) continue;
              if (e.disabled || e.readOnly) continue;                     // caja bloqueada por la web
              if (e.value) { if (e.value === texto) return e; continue; } // ya la llenamos antes
              const ph = norm(e.placeholder || "");
              let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
              if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
              const lblby = e.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
              if (e.previousElementSibling) ctx += " " + (e.previousElementSibling.innerText || "");
              // El rótulo del portal nuevo de Meta es el hermano anterior de un ANCESTRO.
              let par = e.parentElement, k = 0;
              while (par && k < 6) { const ps = par.previousElementSibling; if (ps) ctx += " " + (ps.innerText || ""); ctx += " " + (par.getAttribute("aria-label") || ""); par = par.parentElement; k++; }
              const c = norm(ctx);
              if (prohibidas.some((kw) => c.indexOf(kw) >= 0)) continue; // caja de otro campo
              const porEtiqueta = etiquetas.some((kw) => c.indexOf(kw) >= 0);
              const porPlaceholder = placeholders.some((kw) => ph.indexOf(kw) >= 0);
              // El RÓTULO manda: solo si ninguna caja casa por rótulo se acepta una por
              // placeholder (varias cajas comparten el mismo ejemplo "e.g.https://…").
              if (porEtiqueta) return e;
              if (porPlaceholder && !candidatoPh) candidatoPh = e;
            }
            return candidatoPh || null;
          };
          let hit = null;
          // Misma guarda que en fillLabel: sin ni una caja en pantalla, no hay que insistir.
          const hayCajaUC = Array.prototype.slice.call(
            document.querySelectorAll("textarea, input[type=text], input:not([type])"))
            .some((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; });
          const vueltasUC = hayCajaUC ? (p.reintentos || 1) : 1;
          for (let itUC = 0; itUC < vueltasUC && !hit; itUC++) {
            hit = buscarCaja();
            if (!hit && itUC + 1 < vueltasUC) await dur(400);
          }
          if (hit) { if (hit.value !== texto) setNative(hit, texto); ok++; } else faltan.push("urls_caja_unica");
        }
      } else if (p.tipo === "selectLabel") {
        // Como fillLabel pero para <select> nativos: encuentra el menú por su etiqueta
        // cercana (placeholder/aria-label/label-for/hermano anterior/ancestro) y elige
        // la opción cuyo texto contenga 'opcion'. Para formularios GitHub (sin name).
        const kws = (p.label || "").split("|").map(norm).filter(Boolean);
        const sels = Array.prototype.slice.call(document.querySelectorAll("select"));
        let hit = null;
        for (const s of sels) {
          const r = s.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          let ctx = " " + (s.getAttribute("aria-label") || "") + " ";
          if (s.id) { const lf = document.querySelector('label[for="' + s.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
          const lblbyS = s.getAttribute("aria-labelledby");
          if (lblbyS) lblbyS.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
          let prevS = s.previousElementSibling, js = 0;
          while (prevS && js < 4) { ctx += " " + (prevS.innerText || ""); prevS = prevS.previousElementSibling; js++; }
          let par = s.parentElement, k = 0;
          while (par && k < 6) { const ps = par.previousElementSibling; if (ps) ctx += " " + (ps.innerText || ""); par = par.parentElement; k++; }
          if (kws.some((kw) => norm(ctx).indexOf(kw) >= 0)) { hit = s; break; }
        }
        if (hit) {
          const t = norm(p.opcion);
          let done = false;
          if (t) for (let i = 0; i < hit.options.length; i++) {
            if (norm(hit.options[i].text).indexOf(t) >= 0) {
              // Ya puesta: ni se toca ni se anota (ver setSelect).
              if (hit.selectedIndex !== i) {
                hit.selectedIndex = i;
                hit.dispatchEvent(new Event("input", { bubbles: true }));
                hit.dispatchEvent(new Event("change", { bubbles: true }));
                anotar("eligio", hit, (hit.options[i].text || "").replace(/\s+/g, " ").trim().slice(0, 70));
              }
              done = true; break;
            }
          }
          if (done) ok++; else faltan.push("opcion:" + p.opcion);
        } else faltan.push("selectLabel:" + p.label);
      } else if (p.tipo === "elegirEnMenuPorRotulo") {
        // ============================================================================
        //  <select> NATIVO sin `name`, sin `id` y sin <label for>: el ÚNICO ancla que
        //  tiene es el TEXTO DE SU PREGUNTA. Es lo que sirve X en help.x.com: al cargar,
        //  la página no tiene NI UNA caja de texto, solo dos de estos menús, y hasta que
        //  no se responden los dos no aparece ningún campo. Por eso «Acoso» y «Contenido
        //  privado» no rellenaban nada: `fillName`/`select` exigen `name` (no lo tienen)
        //  y el paso `dropdown` busca [aria-haspopup=listbox] (son <select> nativos).
        //
        //  POR QUÉ NO SE REUTILIZA `selectLabel`, que está justo aquí arriba: lo usan
        //  YouTube, GitHub y Cloudflare y se queda EXACTAMENTE como está. Le faltan
        //  cuatro cosas que aquí son imprescindibles:
        //   1) lee el contexto con innerText, que recalcula el diseño en CADA lectura
        //      (ver el aviso de rendimiento de fillLabel); aquí va con textContent + caché;
        //   2) coge la PRIMERA opción que CONTENGA el texto, sin "&" ni prioridad: con
        //      "otra persona" se llevaría cualquier opción que la contuviera;
        //   3) no mira si el menú YA tiene puesta la opción buscada: la volvía a poner y
        //      la contaba como trabajo hecho (y `hechos` es lo que decide si el bucle
        //      guarda comprobante: contar de más = comprobante de un formulario vacío);
        //   4) no respeta lo que el usuario haya elegido a mano.
        // ============================================================================
        const MENU_NUESTRO = "data-rs-menu-puesto-por-la-extension";
        const kwsMenu = (p.label || "").split("|").map(norm).filter(Boolean);
        const opsMenu = norm(p.opcion || "").split("|").map((s) => s.trim()).filter(Boolean);
        if (!opsMenu.length) {
          // Sin valor que elegir (p.ej. el país de la marca está vacío) NO se toca el
          // menú: se avisa, en vez de dejarlo puesto en cualquier cosa.
          faltan.push(p.desc || ("menu «" + (p.label || "").split("|")[0] + "» sin opcion que elegir"));
        } else {
          // MENÚ DE ESTA PREGUNTA. Igual que fillLabel: cada coincidencia guarda su
          // DISTANCIA (0 = rótulo propio, 1 = hermanos del menú, 2 = hermanos del
          // padre…) y gana la MÁS CERCANA. Sin distancia, subir por los ancestros hace
          // que la 1.ª pregunta de X («¿Qué problema tienes?») adopte también el 2.º
          // menú, porque su texto está más arriba y envuelve a los dos.
          const buscarMenu = () => {
            const visibles = Array.prototype.slice.call(document.querySelectorAll("select"))
              .filter((x) => { const r = x.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; });
            // Regla clave: un texto solo rotula a ESTE menú si entre los dos no hay OTRO
            // menú. Si lo hay, ese texto es el rótulo del otro.
            const hayMenuEntre = (rot, menu) => visibles.some((f) => {
              if (f === menu) return false;
              const a = rot.compareDocumentPosition(f), b = f.compareDocumentPosition(menu);
              return !!(a & Node.DOCUMENT_POSITION_FOLLOWING) && !!(b & Node.DOCUMENT_POSITION_FOLLOWING);
            });
            let mejor = null, mejorDist = Infinity;
            for (const s of visibles) {
              const niveles = [];
              let propio = " " + (s.getAttribute("aria-label") || "") + " ";
              try { if (s.id) { const lf = document.querySelector('label[for="' + (window.CSS ? CSS.escape(s.id) : s.id) + '"]'); if (lf) propio += " " + (lf.textContent || ""); } } catch (e) {}
              const lblby = s.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) propio += " " + (le.textContent || ""); });
              niveles.push({ t: norm(propio), n: 0, el: null });
              // OJO RENDIMIENTO: textContent (con caché), NUNCA innerText.
              let nodo = s, k = 0;
              while (nodo && k < 8) {
                let ps = nodo.previousElementSibling, j = 0;
                while (ps && j < 3) { niveles.push({ t: null, n: k + 1, el: ps }); ps = ps.previousElementSibling; j++; }
                nodo = nodo.parentElement; k++;
              }
              let dist = -1;
              for (let n = 0; n < niveles.length && dist < 0; n++) {
                const c = niveles[n].el ? textoNorm(niveles[n].el) : niveles[n].t;
                if (!kwsMenu.some((kw) => c.indexOf(kw) >= 0)) continue;
                if (niveles[n].el && hayMenuEntre(niveles[n].el, s)) continue;
                dist = niveles[n].n;
              }
              if (dist >= 0 && dist < mejorDist) { mejor = s; mejorDist = dist; }
            }
            return mejor;
          };
          // La OPCIÓN, con las mismas reglas que el resto del motor: alternativas con "&"
          // (todas las palabras presentes, en cualquier orden) y, si no, por PRIORIDAD
          // exacto -> empieza por -> contiene, para no coger una opción que solo
          // CONTENGA a la buscada.
          const elegirOpcion = (menu) => {
            const textos = [];
            for (let i = 0; i < menu.options.length; i++) {
              textos.push(norm(menu.options[i].text).replace(/\s+/g, " ").trim());
            }
            for (const kw of opsMenu) {
              if (kw.indexOf("&") >= 0) {
                const i = textos.findIndex((t) => kw.split("&").every((tok) => (tok = tok.trim()) && t.indexOf(tok) >= 0));
                if (i >= 0) return i;
                continue;
              }
              let i = textos.indexOf(kw);                                  // exacto
              if (i < 0) i = textos.findIndex((t) => t.indexOf(kw) === 0); // empieza por
              if (i < 0) i = textos.findIndex((t) => t.indexOf(kw) >= 0);  // contiene
              if (i >= 0) return i;
            }
            return -1;
          };
          let menu = null;
          for (let itM = 0; itM < (p.reintentos || 1) && !menu; itM++) {
            menu = buscarMenu();
            if (!menu) await dur(400);
          }
          if (!menu) faltan.push("menu por rotulo:" + (p.label || ""));
          else {
            const iOp = elegirOpcion(menu);
            const puestoAhora = norm(((menu.options[menu.selectedIndex] || {}).text) || "").replace(/\s+/g, " ").trim();
            if (iOp < 0) {
              faltan.push("opcion «" + p.opcion + "» no esta en el menu «" + (p.label || "").split("|")[0] + "»");
            } else if (menu.selectedIndex === iOp) {
              // Ya está puesta la que queríamos: NI se toca NI se anota. `anotar` es lo
              // que cuenta en `hechos`, y `hechos` es lo que decide si el bucle guarda
              // comprobante: apuntar aquí sería decir que se rellenó algo que ya estaba.
              // PERO SÍ SE DEJA CONSTANCIA (la misma marca que si lo hubiéramos puesto
              // nosotros). Sin esto quedaba un agujero MEDIDO: con las URLs de X que ya
              // traen el menú respondido no se marcaba nada, así que si el usuario lo
              // cambiaba después, la pasada siguiente no tenía con qué distinguir "lo
              // cambió él" de "es el valor por defecto" y se lo DESHACÍA.
              try { menu.setAttribute(MENU_NUESTRO, puestoAhora); } catch (e) {}
              ok++;
            } else if (menu.hasAttribute(MENU_NUESTRO) && menu.getAttribute(MENU_NUESTRO) !== puestoAhora) {
              // LO CAMBIÓ EL USUARIO. Misma regla que las casillas: solo cuenta si lo
              // pusimos NOSOTROS antes y AHORA muestra otra cosa; así no se confunde
              // "el usuario lo cambió" con "es el valor por defecto de la página".
              // Importa porque el bucle del service worker repite hasta 30 minutos sin
              // nadie mirando: sin esto le deshacía su elección cada pocos segundos.
              // NO va a `faltan` (como un radio): el formulario con SU opción es válido.
              // NO se llama a `anotar()` a propósito: esta rama no escribe nada, y `hechos`
              // (que sale de `registro`) es lo que decide si se rellenó algo y lo que se le
              // enseña al usuario. Contar aquí haría creer que se tocó un campo. Misma regla
              // que la rama de "ya está puesta", unas líneas más arriba.
              ok++;
            } else {
              menu.selectedIndex = iOp;
              menu.dispatchEvent(new Event("input", { bubbles: true }));
              menu.dispatchEvent(new Event("change", { bubbles: true }));
              const elegido = norm(menu.options[iOp].text).replace(/\s+/g, " ").trim();
              try { menu.setAttribute(MENU_NUESTRO, elegido); } catch (e) {}
              anotar("eligio", menu, (menu.options[iOp].text || "").replace(/\s+/g, " ").trim().slice(0, 70));
              ok++;
            }
          }
        }
      } else if (p.tipo === "clickOpcion") {
        // Hace clic en la OPCIÓN VISIBLE cuyo texto coincide (como un humano). Útil
        // para casillas/radios con widget no estándar (TikTok). Reintenta por React.
        const kws = norm(p.texto).split("|").filter(Boolean);
        let okC = false;
        for (let intento = 0; intento < 3 && !okC; intento++) {
          const cands = Array.prototype.slice.call(
            document.querySelectorAll("label,span,div,p,button,li,[role=radio],[role=checkbox]"))
            .filter((e) => {
              // Criba BARATA primero (textContent no recalcula el diseño); solo a los
              // pocos que sobreviven se les mide tamaño. Con innerText sobre toda la
              // página, un formulario grande se arrastra y no llega a marcar nada.
              const t0 = e.textContent;
              if (!t0 || t0.length > 40) return false;
              const t = norm(t0);
              if (!(t && t.length < 32 && kws.some((kw) => t === kw))) return false;
              const r = e.getBoundingClientRect();
              return r.width > 1 && r.height > 1;
            });
          // el más interno (sin hijos con el mismo texto) para no clicar el contenedor
          const el = cands.find((e) => !cands.some((o) => o !== e && e.contains(o))) || cands[0];
          if (el && respetarAlUsuario(el, "clickOpcion:" + p.texto)) {
            // Aquí se comprueba ANTES del `click()`: este paso clica texto visible, y ese
            // clic sintético ya cambiaría el radio por sí solo.
            okC = true;
          } else if (el) {
            try { el.scrollIntoView({ block: "center" }); } catch (e) {}
            el.click();
            anotar("clic", el, (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
            marcarParaClicReal(el); // además, clic REAL (trusted) para que React de TikTok lo fije
            okC = true;
          }
          if (!okC) await dur(300);
        }
        if (okC) ok++; else faltan.push("opcion:" + p.texto);
      } else if (p.tipo === "checkVarios") {
        // Marca TODAS las casillas cuyo texto coincida con alguna etiqueta (p.ej. las
        // 3 de "Declaración" de TikTok), hasta 'max'. Las deja para clic real.
        // REINTENTA: la sección "Declaración" también se pinta con retraso.
        const kws = norm(p.etiquetas).split("|").filter(Boolean);
        const max = p.max || 99;
        const marcarCasillas = () => {
          const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
          let n = 0;
          for (const c of cbs) {
            if (n >= max) break;
            const ct = etiquetaCasilla(c);
            // Solo cuentan (y solo se marcan) las casillas que DE VERDAD son de este
            // paso. Antes se contaba cualquier casilla ya marcada y se subía por los
            // ancestros sin límite: en TikTok, la casilla "Evita que en el futuro
            // aparezcan copias…" heredaba el texto del formulario ENTERO (que contiene
            // "buena fe", "perjurio"…), se llevaba un cupo de los 3 y la TERCERA
            // casilla de la Declaración quedaba SIN MARCAR -> TikTok no deja enviar.
            if (!kws.some((kw) => ct.indexOf(kw) >= 0)) continue;
            if (c.checked) { n++; continue; }
            marcarRadioEl(c); marcarParaClicReal(c); ok++; n++;
          }
          return n;
        };
        let n = 0;
        // Misma guarda: si no hay ni una casilla en la pagina, reintentar no la crea.
        const vueltasCV = document.querySelector('input[type=checkbox]') ? (p.reintentos || 1) : 1;
        for (let intentoCV = 0; intentoCV < vueltasCV && n === 0; intentoCV++) {
          n = marcarCasillas();
          if (n === 0 && intentoCV + 1 < vueltasCV) await dur(400);
        }
        if (n === 0) faltan.push("checkVarios:" + p.etiquetas);
      } else if (p.tipo === "checkLabel") {
        // Marca UNA casilla por su etiqueta cercana (sin name): usa el rótulo AJUSTADO
        // (aria-label / aria-labelledby / label-for / padre corto / hermano) para no
        // confundirse con casillas vecinas que comparten contenedor (formularios GitHub).
        const kws = (p.texto || "").split("|").map(norm).filter(Boolean);
        const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
        let el = null, yaMarcada = false;
        for (const c of cbs) {
          // Mismo rótulo AJUSTADO que checkVarios (ver etiquetaCasilla): sin tope de
          // tamaño se subía hasta el formulario entero y se marcaba la casilla que no era.
          if (!kws.some((kw) => etiquetaCasilla(c).indexOf(kw) >= 0)) continue;
          if (c.checked) { yaMarcada = true; continue; } // ya estaba: paso hecho
          el = c; break;
        }
        if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; }
        else if (yaMarcada) ok++;
        else faltan.push("checkLabel:" + p.texto);
      } else if (p.tipo === "clickBoton") {
        // Pulsa un botón por su texto (p. ej. "Siguiente"/"Next"). Evita Enviar/Submit.
        const kws = norm(p.texto).split("|").filter(Boolean);
        const btns = Array.prototype.slice.call(
          document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a'));
        const btn = btns.find((b) => {
          const t = norm(b.innerText || b.value || b.textContent || "");
          const r = b.getBoundingClientRect();
          return t && r.width > 1 && r.height > 1 && !b.disabled &&
            t.indexOf("enviar") < 0 && t.indexOf("submit") < 0 &&
            kws.some((kw) => t === kw || t.indexOf(kw) >= 0);
        });
        // p.avanza: el botón pasa a la SIGUIENTE página de un asistente (portal de Meta).
        // No basta con pulsarlo: si faltaba un campo, la página NO avanza y el botón sigue
        // ahí. Entonces el paso se marca como NO hecho para que el motor lo reintente en la
        // siguiente pasada (cuando el campo que faltaba ya esté relleno). Y si el botón ya
        // no está, es que YA avanzamos: el paso se da por hecho.
        if (p.avanza) {
          if (!btn) { ok++; }                       // ya no hay "Siguiente" => ya avanzamos
          else {
            btn.click();
            anotar("pulso", btn, (btn.innerText || btn.value || "").replace(/\s+/g, " ").trim().slice(0, 40));
            yaEspero = true;   // esta rama espera aqui; que la espera central no la repita
            await dur(p.esperaMs || 2000);
            const sigue = btns.some((b) => { const r = b.getBoundingClientRect(); return b.isConnected && r.width > 1 && r.height > 1 && kws.some((kw) => norm(b.innerText || "").indexOf(kw) >= 0); });
            if (sigue) faltan.push("boton:" + p.texto); else ok++;
          }
        } else if (btn) {
          btn.click();
          anotar("pulso", btn, (btn.innerText || btn.value || "").replace(/\s+/g, " ").trim().slice(0, 40));
          ok++;
        } else faltan.push("boton:" + p.texto);
      } else if (p.tipo === "fillUrlList") {
        // Autollena las cajas "Enlace 1..30" de Meta (FB/IG) con la lista de URLs del
        // Excel. Si hay más URLs que cajas y existe el checkbox "Tengo enlaces
        // adicionales...", lo marca para que aparezcan las cajas 11..30.
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (urls.length) {
          const dom = norm(p.dominio || "");
          // Devuelve, en orden del DOM, las cajas de URL visibles y vacías cuyo
          // placeholder contenga el dominio (facebook.com / instagram.com).
          const buscarCajas = () => Array.prototype.slice.call(
            document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || ph.indexOf(dom) < 0) return false;
              if (e.value) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          // URLs que YA están puestas en una caja (pasadas anteriores del motor): así el
          // paso se da por hecho en vez de reintentar hasta agotar el tiempo.
          const yaPuestas = () => {
            const dominio = norm(p.dominio || "");
            return Array.prototype.slice.call(
              document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
              .filter((e) => e.value && norm(e.placeholder || "").indexOf(dominio) >= 0 &&
                urls.indexOf(e.value.trim()) >= 0).length;
          };
          let cajas = buscarCajas();
          // ¿Faltan cajas? Marca el checkbox de "enlaces adicionales" y espera a que
          // el formulario revele las cajas 11..30 (React las agrega de forma asíncrona).
          if (urls.length > cajas.length + yaPuestas() && p.checkLabel) {
            const kws = (p.checkLabel || "").split("|").map(norm).filter(Boolean);
            const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
            let cb = null;
            for (const c of cbs) {
              // El value (en inglés) sirve de respaldo cuando Meta reescribe el rótulo.
              let lab = " " + (c.value || "") + " " + (c.getAttribute("aria-label") || "") + " ";
              const lb = c.getAttribute("aria-labelledby");
              if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) lab += " " + (le.innerText || ""); });
              if (c.id) { const lf = document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]'); if (lf) lab += " " + (lf.innerText || ""); }
              if (c.parentElement && (c.parentElement.innerText || "").length < 240) lab += " " + (c.parentElement.innerText || "");
              if (kws.some((kw) => norm(lab).indexOf(kw) >= 0)) { cb = c; break; }
            }
            if (cb && !cb.checked) {
              marcarRadioEl(cb); marcarParaClicReal(cb);
              let previo = cajas.length;
              for (let it = 0; it < 8; it++) {
                await dur(400);
                const ahora = buscarCajas();
                if (ahora.length >= urls.length || ahora.length === previo) { cajas = ahora; if (ahora.length >= urls.length) break; }
                previo = ahora.length; cajas = ahora;
              }
            }
            cajas = buscarCajas();
          }
          // Rellena en orden: la URL i-ésima que aún no esté puesta -> caja libre i.
          const pendientesU = urls.filter((u) => {
            const dominio = norm(p.dominio || "");
            return !Array.prototype.slice.call(
              document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
              .some((e) => e.value && e.value.trim() === u && norm(e.placeholder || "").indexOf(dominio) >= 0);
          });
          let puestas = 0;
          for (let i = 0; i < pendientesU.length && i < cajas.length; i++) { setNative(cajas[i], pendientesU[i]); puestas++; }
          const total = yaPuestas(); // recuenta el DOM: incluye las que se acaban de poner
          if (puestas > 0) ok++;
          if (total < urls.length) faltan.push("urls:" + total + "/" + urls.length + " (tope 30 de Meta)");
        }
      } else if (p.tipo === "fillDifamUrls") {
        // Formulario de difamación (FB/IG): primero elige en el <select> nativo
        // "¿Cuántas URL quieres denunciar?" la cantidad N (= número de URLs del Excel),
        // espera a que el formulario revele los N bloques, llena cada "URL n.º i" con su
        // URL y pone el MISMO texto de difamación (ctx.justif) en cada "Motivo:".
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        const motivo = (p.motivo || "").toString();
        const cant = Math.max(urls.length, 1);
        // Cuenta los inputs/textarea de URL visibles (placeholder contiene "url (http").
        const buscarUrlInputs = () => Array.prototype.slice.call(
          document.querySelectorAll('input, textarea'))
          .filter((e) => {
            const ph = norm(e.placeholder || "");
            if (!ph || ph.indexOf("url (http") < 0) return false;
            const r = e.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
          });
        // a) Ubica el <select> de cantidad por su rótulo cercano.
        const selects = Array.prototype.slice.call(document.querySelectorAll('select'));
        let selCant = null;
        for (const s of selects) {
          let rot = "";
          try { if (s.id) { const lf = document.querySelector('label[for="' + (s.id + "").replace(/"/g, '\\"') + '"]'); if (lf) rot += " " + (lf.innerText || ""); } } catch (e) {}
          if (s.parentElement) rot += " " + (s.parentElement.innerText || "");
          if (s.previousElementSibling) rot += " " + (s.previousElementSibling.innerText || "");
          const nr = norm(rot);
          if (nr.indexOf("cuantas url") >= 0 || nr.indexOf("how many url") >= 0) { selCant = s; break; }
        }
        // b) Elige la opción = cant (match exacto por text/value; si no, la que lo contenga).
        if (selCant) {
          const objetivo = String(cant);
          let idx = -1, idxContiene = -1;
          for (let i = 0; i < selCant.options.length; i++) {
            const op = selCant.options[i];
            const tx = (op.text || "").trim();
            const vl = (op.value || "").trim();
            if (tx === objetivo || vl === objetivo) { idx = i; break; }
            if (idxContiene < 0 && ((tx.match(/\d+/) && tx.match(/\d+/)[0] === objetivo) || (vl.match(/\d+/) && vl.match(/\d+/)[0] === objetivo))) idxContiene = i;
          }
          if (idx < 0) idx = idxContiene;
          if (idx >= 0) {
            selCant.selectedIndex = idx;
            selCant.dispatchEvent(new Event("change", { bubbles: true }));
          }
          // c) Espera (máx. 10 iteraciones) a que aparezcan los bloques de URL.
          for (let it = 0; it < 10; it++) {
            if (buscarUrlInputs().length >= cant) break;
            await dur(300);
          }
        }
        // d) Llena las URLs en orden: URL i -> caja i.
        const urlInputs = buscarUrlInputs();
        let puestasU = 0;
        for (let i = 0; i < urls.length && i < urlInputs.length; i++) { setNative(urlInputs[i], urls[i]); puestasU++; }
        // e) Llena los Motivos con el MISMO texto de difamación en cada uno.
        let puestasM = 0;
        if (motivo) {
          const motTextareas = Array.prototype.slice.call(document.querySelectorAll('textarea'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || (ph.indexOf("perjudica tu reputacion") < 0 && ph.indexOf("afirmaciones concretas") < 0)) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          for (let i = 0; i < cant && i < motTextareas.length; i++) { setNative(motTextareas[i], motivo); puestasM++; }
        }
        // f) Resultado.
        if (puestasU > 0 || puestasM > 0) ok++;
        if (urls.length > urlInputs.length) faltan.push("difam_urls:" + puestasU + "/" + urls.length);
      }
    } catch (e) { faltan.push((p.name || p.css || "?") + ": " + e.message); }
      // ==========================================================================
      //  LA ESPERA SOLO SE PAGA SI EL PASO TOCO LA PAGINA
      //  `esperaMs` esta para dar tiempo a que la web pinte lo que revela la accion
      //  (elegir un menu, marcar un radio, pulsar Siguiente). Si no hubo accion, no
      //  hay nada que esperar. Antes se pagaba SIEMPRE: en TikTok Marca comercial eran
      //  7,6 s por vuelta del bucle sin hacer nada -medido- y 35 s en la pantalla de
      //  verificar el correo, donde no existe ni un campo.
      //  Se mide con `registro` (lo que cuenta `anotar`), NO con `ok`: hay pasos que
      //  suman `ok` sin tocar nada -un menu que ya estaba puesto, un boton "Siguiente"
      //  que no existe, un campo que ya venia relleno-, y esos no deben costar tiempo.
      // ==========================================================================
      if (p.esperaMs && !yaEspero && registro.length > antesReg) await dur(p.esperaMs);
      let fallo = faltan.length > antesFaltan;
      if (fallo) {
        // Pasos opcionales (p.ej. botón "Siguiente" inexistente en el form de una
        // página, o campos "tardíos" que llena el vigilante): ni bloquean ni se reportan.
        if (p.opcional || p.tardio) faltan.length = antesFaltan;
        // UN PASO `tardio` SÍ VUELVE A LA COLA. No ensucia `faltan` (por eso está arriba),
        // pero tiene que reintentarse: `tardio` significa "esto aparece más adelante", y si
        // no se re-encola no hay ningún "más adelante" -se probaba UNA vez y se abandonaba-.
        // En los formularios con bucle (TikTok) lo tapaba el service worker, que vuelve cada
        // pocos segundos; en los que NO tienen bucle (YouTube Marca) la única pasada era la
        // única oportunidad, y la descripción de la infracción se quedaba vacía.
        if (p.opcional && !p.tardio) { /* un botón que no existe no se reintenta */ }
        else if (p.tardio) {
          // PERO CON TOPE. Insistir mientras tenga sentido, rendirse cuando no lo tenga:
          // hay tardíos que NO SIEMPRE EXISTEN (la «clase de bienes y servicios» de Meta,
          // los 8 de YouTube Marca), y perseguirlos hasta el tope de 16 s del bucle de
          // pasadas convertía el clic de «Rellenar» en una espera de 16 s. MEDIDO: un plan
          // con un tardío que no aparece pasaba de 2.400 ms a 16.100. Con el tope se
          // intenta en tres pasadas -sobra para lo que tarda una web en pintar su sección-
          // y después se deja estar, que para eso el paso no bloquea ni sale en `faltan`.
          const veces = (reencoladosTardios.get(p) || 0) + 1;
          if (veces <= TOPE_REENCOLADO_TARDIO) { reencoladosTardios.set(p, veces); reintentar.push(p); }
        }
        else reintentar.push(p); // no se completó: reintentar en la próxima pasada
      }
      // Anotación del paso para el INFORME (se queda el último intento de cada paso).
      informePasos.set(p, {
        paso: describirPaso(p),
        estado: fallo ? (p.opcional || p.tardio ? "no aparece todavia (opcional)" : "NO ENCONTRADO")
                      : (ok > antesOk ? "hecho" : "sin cambios"),
        hizo: registro.slice(antesReg).map((r) => r.accion + " «" + r.rotulo + "»" + (r.detalle ? " = " + r.detalle : "")),
        pasada: pasada + 1
      });
    }
    pendientes = reintentar;
    if (opciones.unaPasada) break; // el service worker repite APLICAR cada pocos segundos
  }
  // (El relleno de campos TARDÍOS de la 2.ª etapa lo repite el service worker llamando
  //  a APLICAR con { unaPasada:true } cada pocos segundos; ver autorelleno() en background.js.)
  // INVENTARIO de la página: qué campos hay AHORA MISMO, con el rótulo que la extensión
  // les reconoce y lo que tienen escrito. Es lo que permite ver de un vistazo si un
  // campo quedó vacío porque la web cambió el rótulo. Solo se arma si lo piden
  // (el popup en el primer clic), nunca en las repeticiones del service worker.
  let inventario = null;
  if (opciones.informe) {
    inventario = { campos: [], opciones: [] };
    try {
      const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
      // CREDENCIALES FUERA DEL INFORME. El informe se guarda en `ultimo_informe`, el
      // usuario lo copia con "📋 Copiar informe" y nos lo manda por correo o chat: NUNCA
      // puede llevar una contraseña, un código de un solo uso ni un número de tarjeta.
      // Estos campos se listan igual (para saber que existen y por qué no se rellenaron),
      // pero con "(campo protegido)" en lugar del valor.
      // ===================================================================
      //  EL CRITERIO DEL INVENTARIO VA AL REVÉS QUE ANTES.
      //  Este informe existe para diagnosticar QUÉ escribió la extensión, no para leer lo
      //  que teclea el usuario. Antes se volcaba TODO menos lo que una lista de palabras
      //  lograra reconocer como secreto, y ninguna lista cubre las formas de pedir un
      //  código: de 7 redacciones reales medidas por QA ("Introduce los 6 dígitos que te
      //  enviamos", "Escribe los números que recibiste", "Clave temporal"…), 6 se
      //  colaban. Ahora solo se muestra el valor que ESCRIBIMOS NOSOTROS (o que coincide
      //  con un dato del propio plan); todo lo demás sale como "(no lo escribió la
      //  extensión)". Así los códigos de un solo uso y el correo de verificación quedan
      //  fuera POR CONSTRUCCIÓN, sin depender de ningún vocabulario. Las listas de abajo
      //  se quedan como segunda línea, pero ya no son lo único que protege.
      // ===================================================================
      const ESCRITO_POR_NOSOTROS = "data-rs-escrito-por-la-extension";
      // Los valores que el propio plan manda escribir: si un campo tiene exactamente eso,
      // es nuestro aunque la marca del DOM se haya perdido en un repintado de React.
      const valoresDelPlan = [];
      try {
        (pasos || []).forEach(function (p) {
          if (p && p.valor != null && (p.valor + "").trim() !== "") valoresDelPlan.push(norm(p.valor));
          if (p && Array.isArray(p.urls)) p.urls.forEach(function (u) { if (u) valoresDelPlan.push(norm(u)); });
        });
      } catch (x) {}
      const loEscribimosNosotros = (e, contenido) => {
        try {
          if (contenido.trim() === "") return true;              // vacío: no hay nada que tapar
          if (e.hasAttribute(ESCRITO_POR_NOSOTROS)) return true;
          const v = norm(contenido);
          return valoresDelPlan.some(function (x) { return x === v || (x.length > 8 && v.indexOf(x) >= 0); });
        } catch (x) { return false; }
      };
      const AUTOCOMPLETADO_SECRETO = /current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp/;
      // Y TAMBIÉN POR RÓTULO. Con `type=password` y `autocomplete` no basta: la caja de
      // "Verifica tu correo electrónico" de TikTok y la del código de 6 dígitos son
      // `type="text"` pelados y sin `autocomplete`, así que el correo tecleado y el código
      // de un solo uso acababan en el informe que el usuario copia y nos manda por correo o
      // chat. Se miran el rótulo reconocido, el placeholder, el `name` y el `id`.
      //
      // LO QUE NO PUEDE TAPAR (falsos positivos medidos por QA). Tapar de más deja el
      // informe inservible, que es justo para lo que existe:
      //   - "código postal" / "postal code" / "ZIP code": no es un secreto y hace falta verlo.
      //     El `(?![\s_-]*postal)` lleva también `_` y `-` porque los `id` reales vienen como
      //     `codigo_postal` / `codigo-postal`, y ahí no hay ningún espacio que excluir.
      //   - "area code" / "código de área" / "country code": son prefijos telefónicos.
      //   - "¿Puedes verificar a quién afecta esta infracción?": es el rótulo REAL del 2.º
      //     menú de TikTok. Por eso "verificar" NO va suelta: exige acompañante
      //     ("verifica tu", "verificacion", "codigo de verificacion").
      // La lista blanca solo puede ganar cuando lo que hizo saltar la alarma es la palabra
      // que ella misma excluye ("code"/"codigo"). Si el campo casó por OTRA cosa —"otp",
      // "token", "contrasena", "passcode"…—, un "postal" o un "prefijo" en el rótulo no
      // puede destaparlo: se seguiria tapando.
      // "DEL" además de "de": el rótulo REAL de GitHub es "codigo del pais"
      // (datos/formularios.js), y sin contemplarlo no casaba ninguna de las dos listas,
      // ganaba la de secretos y el prefijo telefónico de GitHub salía como
      // "(campo protegido)". Medido por QA sobre los 286 rótulos que la extensión conoce.
      const NO_ES_SECRETO = /(codigo|clave)?\s*(postal|zip)|postal\s*code|zip\s*code|area\s*code|country\s*code|codigo\s*(de[l]?\s*)?(area|pais)|prefijo/;
      const SECRETO_POR_LA_PALABRA_CODIGO = /codigo|(^|[^a-z])code([^a-z]|$)/;
      const PALABRAS_SECRETAS = new RegExp(
        "verificacion|verifica tu|codigo de verificacion|" +
        "codigo(?![\\s_-]*(postal|de\\s*area|del?\\s*pais|zip))|" +
        "(^|[^a-z])code([^a-z]|$)|(^|[^a-z])otp([^a-z]|$)|token|(^|[^a-z])pin([^a-z]|$)|passcode|" +
        "confirmacion|confirmation|one[\\s-]?time|un solo uso|single[\\s-]?use|" +
        "contrasena|password|clave de acceso|security code|codigo de seguridad");
      const esSecreto = (e, rotulo) => {
        const t = (e.type || "").toLowerCase();
        if (t === "password") return true;
        const ac = ((e.getAttribute && e.getAttribute("autocomplete")) || "").toLowerCase();
        if (AUTOCOMPLETADO_SECRETO.test(ac)) return true;
        const senas = norm([rotulo || "", e.placeholder || "", e.name || "", e.id || ""].join(" "));
        if (!PALABRAS_SECRETAS.test(senas)) return false;
        // Solo se destapa si lo unico que casó fue "codigo"/"code" Y la lista blanca lo
        // explica (codigo postal, area code…). Si ademas casa cualquier otra palabra
        // secreta, se tapa.
        const soloPorCodigo = SECRETO_POR_LA_PALABRA_CODIGO.test(senas) &&
          !PALABRAS_SECRETAS.test(senas.replace(/codigo|code/g, " "));
        if (soloPorCodigo && NO_ES_SECRETO.test(senas)) return false;
        return true;
      };
      // ¿Se sabe siquiera QUÉ es este campo? Si no hay forma de saber qué contiene, no puede
      // saberse tampoco si es un dato de la marca o un código de un solo uso, así que su
      // valor NO se vuelca al informe. El blindaje no puede depender del HTML de un tercero.
      // OJO con el detalle: `rotuloDe` NUNCA devuelve vacío —cuando no encuentra nada se
      // queda con el nombre de la etiqueta ("input"/"textarea"/"select")—, así que preguntar
      // por el rótulo vacío no detectaba nada. Lo que delata a un campo sin identificar es
      // justo ese último recurso, y que además no tenga placeholder, ni `name`, ni `id`.
      // Un rótulo sacado del texto vecino SÍ vale como identificación: así es como TikTok
      // titula sus campos (un <p class="field-title"> justo encima, sin `name` ni `id`), y
      // tapar esos dejaría el informe inservible.
      const SOLO_EL_NOMBRE_DE_LA_ETIQUETA = /^(input|textarea|select|\?)$/;
      const sinIdentificar = (e, rotulo) => {
        const otras = norm([e.placeholder || "", e.name || "", e.id || ""].join(" ")).trim();
        if (otras !== "") return false;
        const r = norm(rotulo || "").trim();
        return r === "" || SOLO_EL_NOMBRE_DE_LA_ETIQUETA.test(r);
      };
      Array.prototype.slice.call(document.querySelectorAll('textarea,input,select')).forEach(function (e) {
        const t = (e.type || "").toLowerCase();
        if (t === "hidden" || !visible(e)) return;
        if (t === "radio" || t === "checkbox") {
          inventario.opciones.push({ rotulo: rotuloDe(e), tipo: t, marcado: !!e.checked });
        } else {
          // El rótulo se lista SIEMPRE (hace falta para saber que el campo existe y por qué
          // no se rellenó); lo único que se tapa es el VALOR.
          const rot = rotuloDe(e);
          const contenido = ((e.value || "") + "").replace(/\s+/g, " ");
          let valor;
          if (esSecreto(e, rot)) valor = "(campo protegido)";
          else if (sinIdentificar(e, rot)) valor = "(campo sin identificar)";
          else if (!loEscribimosNosotros(e, contenido)) valor = "(no lo escribió la extensión)";
          else valor = contenido.slice(0, 70);
          inventario.campos.push({
            rotulo: rot, tag: e.tagName.toLowerCase(),
            valor: valor,
            // Con el valor tapado sigue haciendo falta saber si el campo tiene algo o está
            // vacío: es lo que dice si un campo del plan se quedó sin rellenar, y también
            // que el correo que TikTok trae puesto ya viene relleno y bloqueado.
            vacio: contenido.trim() === "",
            bloqueado: !!(e.disabled || e.readOnly)
          });
        }
      });
      inventario.titulo = (document.title || "").slice(0, 120);
      // URL SIN QUERY NI ANCLA: la barra de direcciones lleva a veces el correo o un token
      // en la query (?email=…, ?code=…, ?token=…) y este informe se comparte. Se deja
      // esquema + host + ruta, que es lo único que hace falta para saber en qué formulario
      // se estaba.
      inventario.url = (function () {
        try { const u = new URL(location.href); return (u.origin + u.pathname).slice(0, 200); }
        catch (x) { return ((location.href || "").split("?")[0].split("#")[0]).slice(0, 200); }
      })();
    } catch (e) { inventario = { error: e.message }; }
  }
  return {
    ok: ok, faltan: faltan, clicsReales: clicsReales,
    // `hechos` = campos que de VERDAD se rellenaron: lo que se escribió, marcó o eligió.
    // NO cuenta pulsar botones (ver ACCIONES_QUE_NO_RELLENAN), y por eso NO es
    // `registro.length`: el registro sí guarda las pulsaciones, porque en el informe
    // sirven y porque son lo que revela la pantalla siguiente (de ahí que sí paguen su
    // `esperaMs`). Hace falta aparte de `ok` porque `ok` también cuenta pasos que no
    // escriben: p. ej. el `clickBoton` con `avanza:true` suma aunque el botón "Siguiente"
    // no exista (caso "formulario de una sola página"), así que una página SIN formulario
    // devuelve ok=1. Quien quiera saber si no se rellenó NADA debe mirar `hechos`.
    hechos: tocados,
    informe: { pasos: Array.from(informePasos.values()), inventario: inventario }
  };
}

// Exponer APLICAR como global para importScripts() del service worker y para el popup.
if (typeof self !== 'undefined') { self.APLICAR = APLICAR; }
