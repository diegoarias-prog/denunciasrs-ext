// ============================================================================
//  Registro de denuncias enviadas (por marca). Guarda en chrome.storage.local
//  bajo la clave `denuncias_registro` un arreglo de objetos con la forma:
//  { id, marca, plataforma, tipo, categoria, url_denunciada, numeros_caso,
//    estado, consecutivo, notas, fecha }
//  El diseño espeja la futura BD (Marcas / Plataformas / Denuncias) para migrar
//  limpio. No hace llamados remotos: todo offline.
// ============================================================================

const CLAVE_REGISTRO = "denuncias_registro";

// RESPALDO HISTÓRICO. Ésta era la lista fija de plataformas del Registro y se
// CONSERVA a propósito: hoy la lista se arma sola desde window.FORMULARIOS
// (obtener_plataformas_registro), pero si ese archivo no cargara, el desplegable
// seguiría funcionando con estas 16. NO borrar: es la red de seguridad.
const PLATAFORMAS_REGISTRO = [
  "Facebook", "Instagram", "WhatsApp", "TikTok", "X", "LinkedIn", "YouTube",
  "Telegram", "GitHub", "Apps maliciosas", "Delisting", "Ofertas falsas de trabajo",
  "Outlook / Hotmail", "Scribd", "Studocu", "Sitios maliciosos Banguat"
];

// Clave donde el popup guarda las plataformas que crea el usuario ("➕ Nueva
// plataforma…"). Es la MISMA que usa popup.js.
const CLAVE_PLATAFORMAS_USUARIO = "plataformas_usuario";

// "borrador" se conserva por compatibilidad con registros antiguos; el alta usa
// pendiente / enviada / resuelta.
const ESTADOS_REGISTRO = { pendiente: "Pendiente", borrador: "Borrador", enviada: "Enviada", resuelta: "Resuelta" };
const TIPOS_REGISTRO = { formulario: "Formulario", correo: "Correo" };

const $ = (id) => document.getElementById(id);

let DENUNCIAS = [];   // arreglo en memoria, espejo de chrome.storage
let comprobante_img_actual = "";  // imagen en edición en el formulario de alta (dataURL)

// Chip de la tabla activo: "todas" | "sin_caso" | "sin_captura". Son excluyentes
// entre sí y se combinan con los selects y el buscador (ver denuncias_filtradas).
let chip_activo = "todas";

// Un cambio del registro llegado de FUERA (popup, captura, correo, otra pestaña)
// mientras el usuario escribe: se anota y se pinta cuando termine.
let repintado_pendiente = false;
// Cuántos guardados de N.º de caso hay en vuelo. Es un CONTADOR, no un sí/no:
// si dos se solapan (el usuario teclea rápido y salta de celda), el primero en
// terminar no puede dar por acabado el trabajo del segundo y dejar la tabla sin
// el repintado que quedó pendiente.
let guardados_de_caso_en_curso = 0;
// Retrato del formulario al abrir el cajón, para detectar cambios sin guardar.
let instantanea_cajon = "";
// Días concretos marcados en el desplegable de fechas ("dd/mm/aaaa"). Vacío = todas.
let fechas_seleccionadas = [];

// ----------------------------------------------------------------------------
//  NÚMEROS DE CASO: una denuncia puede tener VARIOS.
//  Campo canónico: `numeros_caso` (arreglo de textos). Se conserva SIEMPRE
//  `numero_caso` (los mismos, unidos por ", ") porque no es sólo nuestro: el
//  popup y el background crean denuncias con `numero_caso: ""` y los registros
//  antiguos del usuario ÚNICAMENTE tienen ese campo.
//  Regla: para LEER se usa siempre numeros_de_caso(); para GUARDAR, siempre
//  cambios_de_numeros_de_caso(), que deja los dos campos sincronizados.
// ----------------------------------------------------------------------------

// Deja la lista limpia: sin espacios sobrantes, sin vacíos, sin repetidos y en
// el orden en que los escribió el usuario.
function limpiar_numeros_de_caso(valores) {
  const salida = [];
  (valores || []).forEach((v) => {
    const n = String(v == null ? "" : v).trim();
    if (n && salida.indexOf(n) === -1) salida.push(n);
  });
  return salida;
}

// Texto escrito a mano ("123, 456") -> lista. Acepta coma, punto y coma y saltos.
function partir_numeros_de_caso(texto) {
  return limpiar_numeros_de_caso(String(texto == null ? "" : texto).split(/[,;\n\r]+/));
}

// LA ÚNICA forma de leer los números de caso de una denuncia (nueva o antigua).
// NO muta la denuncia: la migración al arreglo ocurre sólo al GUARDAR (mismo
// criterio que normalizar_respuestas con las imágenes de respuesta).
// REGLA ANTE UN CONFLICTO: manda el arreglo, SALVO que esté vacío y el texto
// tenga contenido; entonces mandan los del texto. Un arreglo vacío nunca puede
// borrar de la vista un número que el usuario sí tiene escrito —y esto pasa de
// verdad, porque popup.js y background.js no conocen `numeros_caso` y escriben
// únicamente `numero_caso`. La siguiente vez que el Registro guarde esa
// denuncia, el arreglo se reconstruye a partir del texto (nunca al revés).
function numeros_de_caso(d) {
  if (!d) return [];
  const del_arreglo = Array.isArray(d.numeros_caso) ? limpiar_numeros_de_caso(d.numeros_caso) : [];
  if (del_arreglo.length) return del_arreglo;
  return partir_numeros_de_caso(d.numero_caso);   // registros de siempre y respaldo
}

// LA ÚNICA forma de guardarlos: escribe el arreglo y su espejo de texto.
function cambios_de_numeros_de_caso(valores) {
  const limpia = limpiar_numeros_de_caso(valores);
  return { numeros_caso: limpia, numero_caso: limpia.join(", ") };
}

// --- Escape de TODO valor del usuario antes de meterlo al DOM (anti-XSS) ---
function escapar_html(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----------------------------------------------------------------------------
//  Marcas: base + las editadas/agregadas en Opciones − las eliminadas.
//  MISMA lógica que obtener_marcas() del popup (combina POR CAMPO).
// ----------------------------------------------------------------------------
async function obtener_marcas_registro() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  const base = window.MARCAS_BASE || {};
  const todas = Object.assign({}, base);
  Object.keys(guardadas).forEach((m) => {
    const b = base[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, b);
    Object.keys(g).forEach((k) => { if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k]; });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  return Object.keys(todas).sort();
}

// ----------------------------------------------------------------------------
//  Plataformas: se arman SOLAS, no se escriben a mano.
//  Antes el desplegable traía una lista fija de 16 y por eso faltaban redes que
//  sí existen (Cloudflare, Google) y nunca aparecían las que el usuario crea
//  desde el popup. Ahora se juntan tres fuentes, sin repetir:
//    1) window.FORMULARIOS (las de fábrica) + las del usuario ya mezcladas,
//       usando la MISMA función que usa el popup (APLICAR_PLATAFORMAS_DE_USUARIO).
//    2) PLATAFORMAS_REGISTRO, como respaldo por si formularios.js no cargara.
//    3) Las plataformas que ya aparecen en denuncias guardadas, para que un
//       registro viejo con una plataforma retirada siga siendo editable y
//       filtrable (nunca se pierde nada de lo ya guardado).
// ----------------------------------------------------------------------------
async function obtener_plataformas_registro() {
  // 1) Plataformas creadas por el usuario -> se mezclan dentro de FORMULARIOS.
  const guardadas = await new Promise((res) =>
    chrome.storage.local.get([CLAVE_PLATAFORMAS_USUARIO], (x) => res((x && x[CLAVE_PLATAFORMAS_USUARIO]) || {})));
  // Las del usuario se vuelven a montar desde cero: si el usuario QUITÓ una en el
  // popup, aquí también tiene que desaparecer (APLICAR_… sólo agrega, nunca borra).
  // Sus claves siempre empiezan por "u_" (popup.js, clave_nueva_de_plataforma), así
  // que las de fábrica no se tocan. Lo ya guardado en denuncias no se pierde: el
  // punto 3 lo vuelve a añadir.
  const forms_previos = window.FORMULARIOS || {};
  Object.keys(forms_previos).forEach((clave) => {
    if (clave.indexOf("u_") === 0 && !Object.prototype.hasOwnProperty.call(guardadas, clave)) {
      delete forms_previos[clave];
    }
  });
  if (typeof window.APLICAR_PLATAFORMAS_DE_USUARIO === "function") {
    window.APLICAR_PLATAFORMAS_DE_USUARIO(guardadas);
  }

  const lista = [];
  const agregar = (nombre) => {
    const n = String(nombre == null ? "" : nombre).trim();
    if (n && lista.indexOf(n) === -1) lista.push(n);
  };

  const forms = window.FORMULARIOS || {};
  Object.keys(forms).forEach((clave) => {
    const f = forms[clave];
    if (f && f.red) agregar(f.red);
  });

  // 2) Respaldo histórico (si FORMULARIOS no cargó, esto salva el desplegable).
  PLATAFORMAS_REGISTRO.forEach(agregar);

  // 3) Lo que ya está guardado en el registro manda: siempre debe poder editarse.
  (DENUNCIAS || []).forEach((d) => { if (d && d.plataforma) agregar(d.plataforma); });

  return lista.sort((a, b) => a.localeCompare(b, "es"));
}

// Rellena los dos desplegables de plataforma CONSERVANDO lo que el usuario
// tuviera elegido (una edición en curso no se puede perder).
function poblar_selects_de_plataforma(plataformas) {
  [
    { sel: $("campo_plataforma"), inicial: { value: "", texto: "— Elige plataforma —" } },
    { sel: $("filtro_plataforma"), inicial: { value: "", texto: "Todas" } }
  ].forEach(({ sel, inicial }) => {
    if (!sel) return;
    const elegido = sel.value;                 // se guarda ANTES de vaciar
    llenar_select(sel, plataformas, inicial);
    // Sólo se reasigna si la opción sigue existiendo; si no, queda el valor inicial.
    if (elegido && plataformas.indexOf(elegido) !== -1) sel.value = elegido;
  });
}

// ----------------------------------------------------------------------------
//  Persistencia
// ----------------------------------------------------------------------------
function leer_registro() {
  return new Promise((res, rej) =>
    chrome.storage.local.get([CLAVE_REGISTRO], (x) => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) { rej(new Error(err.message || "no se pudo leer el registro")); return; }
      res(Array.isArray(x[CLAVE_REGISTRO]) ? x[CLAVE_REGISTRO] : []);
    }));
}

// Escritura de la clave completa. SIEMPRE revisa chrome.runtime.lastError: si la
// escritura falla (cuota llena, o el contexto de la extensión quedó inválido
// tras una recarga) la promesa se RECHAZA, para no confirmar algo que no se
// guardó. Nadie debería llamarla directamente: se usa desde
// guardar_cambio_en_registro, que es quien garantiza el read-modify-write.
function escribir_registro_en_storage(lista) {
  return new Promise((res, rej) =>
    chrome.storage.local.set({ [CLAVE_REGISTRO]: lista }, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) rej(new Error(err.message || "no se pudo guardar en el navegador"));
      else res();
    }));
}

// ----------------------------------------------------------------------------
//  GUARDADO SEGURO (read-modify-write). CRÍTICO: NO SE PUEDE VOLCAR `DENUNCIAS`
//  ENTERO SOBRE LA CLAVE.
//  `denuncias_registro` no es sólo de esta página: también la escriben el popup
//  (alta automática de la denuncia), el background (captura del comprobante por
//  atajo o menú contextual) y el envío de correo. Como el usuario deja esta
//  pestaña abierta mientras denuncia, la copia en memoria se queda vieja: si
//  guárdaramos el arreglo completo, borraríamos en silencio todo lo que esos
//  otros sitios hubieran añadido mientras tanto.
//  Por eso cada guardado: 1) LEE lo último que hay en el navegador, 2) aplica
//  sólo SU cambio localizando la denuncia por id, 3) escribe, y 4) deja
//  DENUNCIAS igual a lo que quedó guardado.
//
//  operacion = { tipo: "alta",     denuncia: {...} }            -> añade (calcula el consecutivo)
//              { tipo: "edicion",  id, cambios: {...}, quitar: ["campo"] }
//              { tipo: "borrado",  id }
//  Devuelve la denuncia resultante (o null en el borrado) y lanza Error si algo
//  falla o si la denuncia a editar/borrar ya no existe.
//
//  LAS OPERACIONES VAN DE UNA EN UNA (cola_de_guardado). Entre la lectura y la
//  escritura hay saltos asíncronos, y si dos guardados de esta misma página se
//  solapan, el segundo lee un estado anterior a la escritura del primero y lo
//  pisa: el mismo "cambio perdido" que evitamos con los otros contextos, pero
//  dentro de casa. Pasa de verdad: el usuario escribe un N.º de caso y pulsa el
//  \ud83d\uddd1 de otra fila; el blur lanza el guardado del caso, el confirm() del
//  borrado CONGELA el hilo, y al aceptar el borrado leería antes de que la
//  edición llegara a escribir: el número desaparecería tras un toast verde.
//  Con la cola, nada empieza hasta que lo anterior terminó.
// ----------------------------------------------------------------------------
let cola_de_guardado = Promise.resolve();

function guardar_cambio_en_registro(operacion) {
  // Se encadena con los DOS manejadores (éxito y fallo): si una operación falla,
  // la siguiente igual se ejecuta y la cola no se queda atascada.
  cola_de_guardado = cola_de_guardado.then(
    () => aplicar_cambio_en_registro(operacion),
    () => aplicar_cambio_en_registro(operacion)
  );
  return cola_de_guardado;
}

async function aplicar_cambio_en_registro(operacion) {
  const lista = await leer_registro();   // lo último que hay en el navegador
  let resultado = null;

  if (operacion.tipo === "alta") {
    // El consecutivo por marca se calcula sobre la lista FRESCA: si el popup dio
    // de alta otra denuncia de la misma marca mientras tanto, no se repite.
    const marca = operacion.denuncia.marca;
    const consecutivo = lista.filter((x) => x.marca === marca)
      .reduce((m, x) => Math.max(m, parseInt(x.consecutivo, 10) || 0), 0) + 1;
    resultado = Object.assign({}, operacion.denuncia, { consecutivo: consecutivo });
    lista.push(resultado);

  } else if (operacion.tipo === "edicion") {
    const d = lista.find((x) => String(x.id) === String(operacion.id));
    if (!d) throw new Error("esa denuncia ya no está en el registro (¿se eliminó desde otra ventana?)");
    Object.assign(d, operacion.cambios || {});
    (operacion.quitar || []).forEach((campo) => { delete d[campo]; });
    resultado = d;

  } else if (operacion.tipo === "borrado") {
    const i = lista.findIndex((x) => String(x.id) === String(operacion.id));
    if (i === -1) throw new Error("esa denuncia ya no está en el registro");
    lista.splice(i, 1);

  } else {
    throw new Error("operación de guardado desconocida");
  }

  await escribir_registro_en_storage(lista);
  DENUNCIAS = lista;   // la memoria queda EXACTAMENTE igual que lo guardado
  return resultado;
}

// ----------------------------------------------------------------------------
//  Utilidades
// ----------------------------------------------------------------------------
function formatear_fecha(iso) {
  const f = new Date(iso);
  if (isNaN(f.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(f.getDate()) + "/" + p(f.getMonth() + 1) + "/" + f.getFullYear() + " " + p(f.getHours()) + ":" + p(f.getMinutes());
}

// ----------------------------------------------------------------------------
//  "Enviado a": A QUÉ SITIO concreto se mandó la denuncia. La columna Plataforma
//  solo dice el tipo de denuncia ("Apps maliciosas"), no si fue a Softonic, a
//  AppBrain o a Uptodown. Esto lo resuelve de un vistazo.
//  Orden: 1) lo escrito a mano en la denuncia, 2) el dominio de la(s) URL(s)
//  denunciada(s), 3) el dominio de los correos destinatarios. Si no hay nada, "—".
// ----------------------------------------------------------------------------
function correos_destino_de(d) {
  const to = (d && d.correo && d.correo.to) || "";
  return window.CORREOS_DENUNCIA ? window.CORREOS_DENUNCIA.lista_correos(to) : [];
}

function destino_de(d) {
  const escrito = (d && d.destino ? String(d.destino) : "").trim();
  if (escrito) return escrito;
  const CD = window.CORREOS_DENUNCIA;
  if (!CD) return "";
  const doms = CD.dominios_de(String((d && d.url_denunciada) || "").split(/[\s,;]+/));
  if (doms.length) return doms.slice(0, 3).join(", ") + (doms.length > 3 ? " (+" + (doms.length - 3) + ")" : "");
  // Sin URL: al menos el dominio de a quién se le escribió.
  const dominios_correo = correos_destino_de(d)
    .map((c) => c.split("@")[1] || "")
    .filter((v, i, a) => v && a.indexOf(v) === i);
  return dominios_correo.slice(0, 2).join(", ");
}

// Texto del tooltip de la celda: los correos exactos y la URL denunciada.
function detalle_destino_de(d) {
  const partes = [];
  const correos = correos_destino_de(d);
  if (correos.length) partes.push("Correo(s): " + correos.join(", "));
  if (d && d.url_denunciada) partes.push("URL denunciada: " + d.url_denunciada);
  return partes.length ? partes.join("\n") : "Sin datos del destinatario";
}

function llenar_select(sel, items, opcion_inicial) {
  sel.innerHTML = "";
  if (opcion_inicial != null) {
    const o = document.createElement("option");
    o.value = opcion_inicial.value; o.textContent = opcion_inicial.texto;
    sel.appendChild(o);
  }
  items.forEach((it) => {
    const o = document.createElement("option");
    if (typeof it === "string") { o.value = it; o.textContent = it; }
    else { o.value = it.value; o.textContent = it.texto; }
    sel.appendChild(o);
  });
}

// Avisos del formulario (errores de validación: "Elige una marca."). Se pintan
// en el span #aviso, que vive DENTRO del cajón; si el cajón está cerrado el
// usuario no lo vería, así que el mensaje sale también en la barra flotante.
function mostrar_aviso(texto) {
  const a = $("aviso");
  a.textContent = texto;
  setTimeout(() => (a.textContent = ""), 2500);
  if (!cajon_esta_abierto()) mostrar_toast(texto);
}

// Barra flotante abajo a la derecha: confirmaciones que deben verse aunque el
// cajón ya se haya cerrado (guardado, borrado, N.º de caso cargado…).
let temporizador_toast = null;
function mostrar_toast(texto, es_error) {
  const t = $("toast_registro");
  if (!t) return;
  t.textContent = texto;
  t.classList.toggle("error", !!es_error);
  t.classList.add("visible");
  if (temporizador_toast) clearTimeout(temporizador_toast);
  // Los errores se quedan más tiempo: el usuario TIENE que enterarse de que no
  // se guardó (si no, creería que su número de caso quedó registrado).
  temporizador_toast = setTimeout(() => { t.classList.remove("visible"); t.textContent = ""; }, es_error ? 6500 : 2800);
}

// Aviso de ERROR (rojo). Nunca se usa para confirmar nada.
function mostrar_error(texto) {
  mostrar_toast(texto, true);
}

// ----------------------------------------------------------------------------
//  Contadores
// ----------------------------------------------------------------------------
function refrescar_contadores() {
  const total = DENUNCIAS.length;
  $("contador_total").textContent = total;
  $("contador_con_caso").textContent = DENUNCIAS.filter((d) => numeros_de_caso(d).length > 0).length;
  $("contador_resueltas").textContent = DENUNCIAS.filter((d) => d.estado === "resuelta").length;
  // Denuncias POR FORMULARIO que aún no tienen la captura del formulario adjunta.
  $("contador_sin_captura").textContent = DENUNCIAS.filter((d) => d.tipo === "formulario" && !d.comprobante_img).length;

  // Subtítulo de la barra superior, con el total REAL.
  $("subtitulo_registro").textContent =
    total + (total === 1 ? " denuncia" : " denuncias") + " · guardado en este navegador";

  // 5.º dato: las que aún no tienen número de caso. No es una tarjeta más, es un
  // aviso que lleva directo al trabajo pendiente; si no queda ninguna, se oculta.
  const sin_caso = DENUNCIAS.filter((d) => numeros_de_caso(d).length === 0).length;
  $("conteo_sin_caso").textContent = sin_caso;
  $("aviso_sin_caso").style.display = sin_caso ? "flex" : "none";
}

// ----------------------------------------------------------------------------
//  Tabla (con buscador + filtros)
// ----------------------------------------------------------------------------
function denuncias_filtradas() {
  const q = $("filtro_busqueda").value.trim().toLowerCase();
  // Buscador DEDICADO: mira sólo los números de caso. Se normalizan los espacios
  // de sobra en los dos lados para que "0148 - 77" encuentre "0148 - 77321".
  const qCaso = normalizar_para_buscar($("filtro_numero_caso").value);
  const fMarca = $("filtro_marca").value;
  const fPlat = $("filtro_plataforma").value;
  const fEstado = $("filtro_estado").value;
  return DENUNCIAS.filter((d) => {
    // Chips (excluyentes entre sí) ADEMÁS de los selects y de los buscadores.
    if (chip_activo === "sin_caso" && numeros_de_caso(d).length > 0) return false;
    if (chip_activo === "sin_captura" && !(d.tipo === "formulario" && !d.comprobante_img)) return false;
    if (fMarca && d.marca !== fMarca) return false;
    if (fPlat && d.plataforma !== fPlat) return false;
    if (fEstado && d.estado !== fEstado) return false;
    // Días CONCRETOS marcados (no un rango). Sin ninguno marcado, pasan todas.
    if (fechas_seleccionadas.length && fechas_seleccionadas.indexOf(dia_de_denuncia(d)) === -1) return false;
    if (qCaso && normalizar_para_buscar(numeros_de_caso(d).join(" ")).indexOf(qCaso) < 0) return false;
    if (q) {
      // El buscador general incluye el destino (softonic.com…), los correos a los
      // que se envió y TODOS los números de caso de la denuncia.
      const heno = (numeros_de_caso(d).join(" ") + " " + (d.marca || "") + " " + (d.url_denunciada || "") + " " +
        destino_de(d) + " " + correos_destino_de(d).join(" ")).toLowerCase();
      if (heno.indexOf(q) < 0) return false;
    }
    return true;
  });
}

// Divide la fecha en día y hora: la tabla pinta la hora en la línea pequeña.
function partes_de_fecha(iso) {
  const partes = formatear_fecha(iso).split(" ");
  return { dia: partes[0] || "", hora: partes[1] || "" };
}

// Compara sin distinguir mayúsculas ni espacios de sobra.
function normalizar_para_buscar(texto) {
  return String(texto == null ? "" : texto).trim().replace(/\s+/g, " ").toLowerCase();
}

// Día LOCAL de la denuncia, "dd/mm/aaaa" (el mismo criterio que formatear_fecha,
// nunca la cadena ISO: en ISO cambia el día según la zona horaria).
function dia_de_denuncia(d) {
  return partes_de_fecha(d && d.fecha).dia;
}

function pintar_tabla() {
  const cuerpo = $("cuerpo_registro");
  const lista = denuncias_filtradas();
  cuerpo.innerHTML = "";
  $("mensaje_vacio").style.display = lista.length ? "none" : "block";

  lista.forEach((d) => {
    const tr = document.createElement("tr");
    const clase_estado = (d.estado || "enviada");
    // Indicadores de adjuntos: 📎 comprobante · 💬 respuesta(s) de la red.
    const num_respuestas = respuestas_de(d).length;
    // Denuncia POR FORMULARIO sin la captura del formulario: se marca en rojo (⚠).
    const falta_captura = (d.tipo === "formulario") && !d.comprobante_img;
    // Denuncia POR CORREO con el texto del correo guardado (ver/copiar en el modal): ✉.
    const tiene_correo = !!(d.correo && (d.correo.cuerpo || d.correo.asunto));
    const marcas_adjuntos = [];
    if (d.comprobante_img) marcas_adjuntos.push("Comprobante 📎");
    if (num_respuestas) marcas_adjuntos.push("Respuestas 💬 (" + num_respuestas + ")");
    if (tiene_correo) marcas_adjuntos.push("Correo ✉ (abre 👁 para ver/copiar)");
    if (falta_captura) marcas_adjuntos.push("⚠ FALTA la captura del formulario");
    const titulo_adjuntos = marcas_adjuntos.length ? marcas_adjuntos.join(" · ") : "Sin adjuntos";
    const iconos_adjuntos = (d.comprobante_img ? "📎" : "") + (num_respuestas ? "💬" + num_respuestas : "") +
      (tiene_correo ? "✉" : "") +
      (falta_captura ? '<span class="falta_captura" title="Falta la captura del formulario">⚠</span>' : "");

    // Marca en negrita con "Plataforma · Tipo" debajo (antes eran tres columnas).
    const f = partes_de_fecha(d.fecha);
    const plataforma_y_tipo = [d.plataforma || "", TIPOS_REGISTRO[d.tipo] || d.tipo || ""]
      .filter((x) => x !== "").join(" · ");

    // OJO: la celda del N.º de caso se deja VACÍA aquí y se pinta aparte
    // (pintar_celda_caso), porque lleva eventos y un <input> creado con
    // createElement: ningún dato del usuario entra por innerHTML.
    tr.innerHTML =
      '<td class="celda_indice">' + escapar_html(d.consecutivo) + '</td>' +
      '<td class="celda_fecha">' + escapar_html(f.dia) + '<span class="sub_celda">' + escapar_html(f.hora) + '</span></td>' +
      '<td><span class="marca_celda">' + escapar_html(d.marca) + '</span>' +
        '<span class="sub_celda">' + escapar_html(plataforma_y_tipo) + '</span></td>' +
      '<td class="celda_destino" title="' + escapar_html(detalle_destino_de(d)) + '">' +
        escapar_html(destino_de(d) || "—") + '</td>' +
      '<td>' + escapar_html(d.categoria || "—") + '</td>' +
      '<td class="celda_caso"></td>' +
      '<td><span class="pastilla ' + escapar_html(clase_estado) + '">' + escapar_html(ESTADOS_REGISTRO[d.estado] || d.estado || "") + '</span></td>' +
      '<td class="celda_adjuntos" title="' + escapar_html(titulo_adjuntos) + '">' + iconos_adjuntos + '</td>' +
      '<td class="acciones_fila">' +
        '<button type="button" class="icono_btn" data-accion="ver" title="Ver comprobante">👁</button>' +
        '<button type="button" class="icono_btn" data-accion="editar" title="Editar">✏️</button>' +
        '<button type="button" class="icono_btn rojo" data-accion="eliminar" title="Eliminar">🗑</button>' +
      '</td>';

    const celda_caso = tr.querySelector("td.celda_caso");
    celda_caso.dataset.idDenuncia = d.id;   // permite saltar de celda en celda
    pintar_celda_caso(celda_caso, d);

    tr.querySelector('[data-accion="ver"]').addEventListener("click", () => abrir_comprobante(d.id));
    tr.querySelector('[data-accion="editar"]').addEventListener("click", () => cargar_para_editar(d.id));
    tr.querySelector('[data-accion="eliminar"]').addEventListener("click", () => eliminar_denuncia(d.id));
    cuerpo.appendChild(tr);
  });
}

// ----------------------------------------------------------------------------
//  N.º DE CASO EDITABLE EN LA PROPIA TABLA (carga en tanda)
//  Sin abrir el formulario: clic en la celda, se escribe, Enter/✓ guarda,
//  Escape cancela y Tab salta al siguiente para cargar muchos de corrido.
//  Al guardar se repinta SÓLO esa celda (nunca la tabla entera) para que no se
//  mueva nada de sitio mientras el usuario está cargando números seguidos.
// ----------------------------------------------------------------------------

// Modo LECTURA de la celda: los números uno debajo de otro (monoespaciada), o el
// botón punteado si la denuncia todavía no tiene ninguno.
function pintar_celda_caso(celda, d) {
  celda.innerHTML = "";
  const numeros = numeros_de_caso(d);
  if (numeros.length) {
    const lista = document.createElement("span");
    lista.className = "lista_casos_celda";
    lista.title = numeros.length > 1
      ? "Clic para editar los " + numeros.length + " números de caso"
      : "Clic para editar el N.º de caso";
    numeros.forEach((numero) => {
      const texto = document.createElement("span");
      texto.className = "caso_num";
      texto.textContent = numero;                // por propiedad (anti-XSS)
      lista.appendChild(texto);
    });
    lista.addEventListener("click", () => activar_edicion_caso(celda, d));
    celda.appendChild(lista);
  } else {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "caso_vacio";
    boton.title = "Escribir el N.º de caso sin abrir el formulario";
    boton.textContent = "＋ N.º de caso";
    boton.addEventListener("click", () => activar_edicion_caso(celda, d));
    celda.appendChild(boton);
  }
}

// Todas las celdas de N.º de caso que hay pintadas ahora mismo, en orden.
function celdas_caso_de_la_tabla() {
  return Array.prototype.slice.call($("cuerpo_registro").querySelectorAll("td.celda_caso"));
}

// Salta a la celda de N.º de caso siguiente (direccion 1) o anterior (-1) y la
// pone en modo edición: es lo que permite cargar varios números con Tab.
function saltar_a_celda_caso(celda_actual, direccion) {
  const celdas = celdas_caso_de_la_tabla();
  const indice = celdas.indexOf(celda_actual);
  // Si la celda de partida ya no está en la tabla (se repintó por un cambio de
  // filtro o por una denuncia llegada de fuera), NO se salta: con indice -1 y
  // direccion 1 se caería en la PRIMERA fila y el usuario escribiría el número
  // de caso sobre la denuncia equivocada.
  if (indice === -1) return;
  const siguiente = celdas[indice + direccion];
  if (!siguiente) return;
  const d = DENUNCIAS.find((x) => String(x.id) === String(siguiente.dataset.idDenuncia));
  if (d) activar_edicion_caso(siguiente, d);
}

// Modo EDICIÓN de la celda: UNA línea por número, con su ✕ para quitarla y un
// botón para añadir otra. Todo se crea con createElement y los valores se asignan
// por PROPIEDAD (jamás innerHTML con datos del usuario).
// Teclas: Enter guarda todo · Escape cancela · Tab pasa al siguiente número de la
// misma denuncia y, desde el último, guarda y salta a la denuncia siguiente
// (así la carga en tanda de muchos casos seguidos se mantiene).
function activar_edicion_caso(celda, d) {
  celda.innerHTML = "";
  const caja = document.createElement("span");
  caja.className = "caso_editando";
  const lineas = document.createElement("span");
  lineas.className = "lineas_caso";
  caja.appendChild(lineas);

  let cerrada = false;
  const entradas_actuales = () => Array.prototype.slice.call(lineas.querySelectorAll("input"));

  // Guarda TODOS los números de la celda en una sola operación de edición.
  const terminar = async (direccion) => {
    if (cerrada) return;
    cerrada = true;
    const valores = entradas_actuales().map((i) => i.value);
    // Mientras se guarda y se salta a la siguiente celda, un cambio llegado de
    // fuera (popup, captura…) NO puede repintar la tabla: se deja pendiente.
    guardados_de_caso_en_curso++;
    try {
      await guardar_caso_en_linea(celda, d, valores);
    } finally {
      if (direccion) saltar_a_celda_caso(celda, direccion);
      guardados_de_caso_en_curso--;
      aplicar_repintado_pendiente();
    }
  };

  const cancelar = () => {
    cerrada = true;
    // Se repinta con lo que hay AHORA (no con la copia que tenía la fila): si la
    // denuncia cambió por fuera mientras se editaba, se ve el dato bueno.
    const fresca = DENUNCIAS.find((x) => String(x.id) === String(d.id)) || d;
    pintar_celda_caso(celda, fresca);
    aplicar_repintado_pendiente();    // por si llegó un cambio de fuera mientras editaba
  };

  const al_teclear = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Con el filtro "Sin N.º de caso" activo, Enter encadena con la siguiente.
      terminar(chip_activo === "sin_caso" ? 1 : 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();            // no debe cerrar además el cajón ni el menú
      cancelar();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const entradas = entradas_actuales();
      const destino = entradas.indexOf(e.target) + (e.shiftKey ? -1 : 1);
      if (destino >= 0 && destino < entradas.length) {   // otro número de ESTA denuncia
        entradas[destino].focus();
        entradas[destino].select();
        return;
      }
      terminar(e.shiftKey ? -1 : 1);  // guarda y salta de denuncia (carga en tanda)
    }
  };

  // Salir de la celda guarda; moverse DENTRO de ella (otro número, la ✕, el ＋)
  // no, porque el usuario sigue trabajando en la misma denuncia.
  const al_perder_foco = () => {
    setTimeout(() => {
      if (!cerrada && !celda.contains(document.activeElement)) terminar(0);
    }, 0);
  };

  const agregar_linea = (valor, enfocar) => {
    const linea = document.createElement("span");
    linea.className = "linea_caso";

    const entrada = document.createElement("input");
    entrada.type = "text";
    entrada.autocomplete = "off";
    entrada.className = "entrada_caso";
    entrada.setAttribute("aria-label", "N.º de caso de la denuncia #" + d.consecutivo);
    entrada.value = valor || "";                 // por propiedad, no innerHTML
    entrada.addEventListener("keydown", al_teclear);
    entrada.addEventListener("blur", al_perder_foco);

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "quitar_caso";
    quitar.title = "Quitar este número";
    quitar.setAttribute("aria-label", "Quitar este número de caso");
    quitar.textContent = "✕";
    quitar.addEventListener("mousedown", (e) => e.preventDefault());   // no roba el foco
    quitar.addEventListener("click", () => {
      // Si era la única línea se vacía (así se puede borrar el número guardado).
      if (entradas_actuales().length > 1) linea.remove(); else entrada.value = "";
      const primera = lineas.querySelector("input");
      if (primera) primera.focus();
    });

    linea.appendChild(entrada);
    linea.appendChild(quitar);
    lineas.appendChild(linea);
    if (enfocar) { entrada.focus(); entrada.select(); }
    return entrada;
  };

  const acciones = document.createElement("span");
  acciones.className = "acciones_caso";

  const anadir = document.createElement("button");
  anadir.type = "button";
  anadir.className = "boton_anadir_caso";
  anadir.textContent = "＋ Añadir otro número";
  anadir.addEventListener("mousedown", (e) => e.preventDefault());
  anadir.addEventListener("click", () => agregar_linea("", true));

  const aceptar = document.createElement("button");
  aceptar.type = "button";
  aceptar.className = "boton exito mini";
  aceptar.title = "Guardar los números de caso";
  aceptar.textContent = "✓";
  // mousedown con preventDefault: el ✓ no roba el foco, así el blur no se
  // adelanta al click y el guardado ocurre UNA sola vez.
  aceptar.addEventListener("mousedown", (e) => e.preventDefault());
  aceptar.addEventListener("click", () => terminar(0));

  acciones.appendChild(anadir);
  acciones.appendChild(aceptar);
  caja.appendChild(acciones);
  celda.appendChild(caja);   // en el DOM ANTES de enfocar

  const existentes = numeros_de_caso(d);
  if (existentes.length) existentes.forEach((numero, i) => agregar_linea(numero, i === 0));
  else agregar_linea("", true);
}

// Guarda el N.º de caso escrito en la tabla y repinta SÓLO esa celda.
// El valor NO se toca en memoria hasta que la escritura ha salido bien: si falla,
// la celda vuelve sola al número anterior y se avisa en rojo (nunca se confirma
// un guardado que no ocurrió).
async function guardar_caso_en_linea(celda, denuncia_de_la_fila, valores) {
  // La fila guarda la denuncia tal y como estaba al pintarse. Si mientras tanto
  // cambió por fuera (el popup, otra pestaña…), comparar contra esa copia vieja
  // haría creer que "no cambió nada" y se perdería lo que el usuario acaba de
  // escribir; por eso se resuelve por id contra lo que hay AHORA.
  const d = DENUNCIAS.find((x) => String(x.id) === String(denuncia_de_la_fila.id)) || denuncia_de_la_fila;
  const nuevos = limpiar_numeros_de_caso(valores);
  // Se compara la lista entera: si no cambió nada, no se toca el navegador.
  if (nuevos.join("|") === numeros_de_caso(d).join("|")) { pintar_celda_caso(celda, d); return; }
  try {
    // Una sola operación de edición con los dos campos (arreglo + texto espejo).
    const actualizada = await guardar_cambio_en_registro({
      tipo: "edicion", id: d.id, cambios: cambios_de_numeros_de_caso(nuevos)
    });
    // Tras el guardado, DENUNCIAS es una lista NUEVA (leída del navegador): hay
    // que trabajar con el objeto fresco, no con la referencia vieja.
    const fresca = actualizada || DENUNCIAS.find((x) => String(x.id) === String(d.id)) || d;
    // Si esa misma denuncia está abierta en el cajón, su campo se sincroniza para
    // que al "Guardar cambios" no se pise el número recién cargado.
    if ($("campo_id_edicion").value && String($("campo_id_edicion").value) === String(d.id)) {
      $("campo_numero_caso").value = nuevos.join(", ");
    }
    pintar_celda_caso(celda, fresca);   // sólo esta celda: la tabla no se rearma
    refrescar_contadores();             // contadores + subtítulo + aviso de sin caso
    mostrar_toast(!nuevos.length ? "N.º de caso borrado."
      : "✓ " + (nuevos.length > 1 ? nuevos.length + " números de caso guardados" : "N.º de caso guardado") +
        " (#" + fresca.consecutivo + " " + fresca.marca + ").");
  } catch (err) {
    pintar_celda_caso(celda, d);        // se quedan los valores anteriores, sin tocar
    mostrar_error("⚠ NO se guardó el N.º de caso de #" + d.consecutivo + " " + d.marca + ": " + err.message);
  }
}

// ----------------------------------------------------------------------------
//  Chips de la tabla y cajón lateral del formulario
// ----------------------------------------------------------------------------

// Chips excluyentes: "todas" | "sin_caso" | "sin_captura".
function activar_chip(valor) {
  chip_activo = valor || "todas";
  document.querySelectorAll(".chip_filtro").forEach((b) => {
    const es_activo = b.dataset.chip === chip_activo;
    b.classList.toggle("activo", es_activo);
    b.setAttribute("aria-pressed", es_activo ? "true" : "false");
  });
  pintar_tabla();
}

// Botón "Registrarlos ahora" del aviso: filtra las que no tienen número de caso
// y deja el cursor puesto en la primera, listo para escribir.
// Limpia ANTES los demás filtros: si no, el aviso puede decir 12 y la tabla
// enseñar 3 porque había una marca o un buscador puestos.
function ir_a_registrar_numeros_de_caso() {
  $("filtro_busqueda").value = "";
  $("filtro_marca").value = "";
  $("filtro_plataforma").value = "";
  $("filtro_estado").value = "";
  activar_chip("sin_caso");
  const primera = celdas_caso_de_la_tabla()[0];
  if (!primera) return;
  const d = DENUNCIAS.find((x) => String(x.id) === String(primera.dataset.idDenuncia));
  if (d) activar_edicion_caso(primera, d);
}

// ----------------------------------------------------------------------------
//  FILTRO POR FECHAS CONCRETAS (no un rango): casillas con los días que existen
//  de verdad en el registro, de la más nueva a la más vieja y con su conteo.
//  Marcando 2 días se ven SÓLO esos 2; sin ninguno marcado, todas.
// ----------------------------------------------------------------------------

// "dd/mm/aaaa" -> "aaaammdd", para poder ordenar por fecha de verdad.
function clave_de_orden_del_dia(dia) {
  const p = String(dia).split("/");
  return (p[2] || "") + (p[1] || "") + (p[0] || "");
}

// Días que aparecen en el registro con cuántas denuncias tiene cada uno.
function fechas_del_registro() {
  const cuenta = {};
  DENUNCIAS.forEach((d) => {
    const dia = dia_de_denuncia(d);
    if (dia) cuenta[dia] = (cuenta[dia] || 0) + 1;
  });
  return Object.keys(cuenta)
    .map((dia) => ({ dia: dia, cuantas: cuenta[dia] }))
    .sort((a, b) => clave_de_orden_del_dia(b.dia).localeCompare(clave_de_orden_del_dia(a.dia)));
}

// Rehace la lista de casillas. Se llama también cuando el registro cambia desde
// fuera; lo que estuviera marcado se conserva si esas fechas siguen existiendo.
function renderizar_menu_de_fechas() {
  const lista = $("lista_fechas");
  if (!lista) return;
  const fechas = fechas_del_registro();
  const existentes = fechas.map((f) => f.dia);
  fechas_seleccionadas = fechas_seleccionadas.filter((f) => existentes.indexOf(f) !== -1);

  lista.innerHTML = "";   // se vacía; las opciones se re-crean con createElement
  if (!fechas.length) {
    const vacio = document.createElement("div");
    vacio.className = "sin_fechas";
    vacio.textContent = "Todavía no hay denuncias con fecha.";
    lista.appendChild(vacio);
  }
  fechas.forEach((f) => {
    const opcion = document.createElement("label");
    opcion.className = "opcion_fecha";

    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.value = f.dia;                                     // por propiedad
    casilla.checked = fechas_seleccionadas.indexOf(f.dia) !== -1;
    casilla.addEventListener("change", () => marcar_fecha(f.dia, casilla.checked));

    const texto = document.createElement("span");
    texto.textContent = f.dia;                                 // por propiedad
    const conteo = document.createElement("span");
    conteo.className = "conteo_fecha";
    conteo.textContent = "(" + f.cuantas + ")";

    opcion.appendChild(casilla);
    opcion.appendChild(texto);
    opcion.appendChild(conteo);
    lista.appendChild(opcion);
  });

  actualizar_resumen_de_fechas();
}

function marcar_fecha(dia, marcada) {
  const i = fechas_seleccionadas.indexOf(dia);
  if (marcada && i === -1) fechas_seleccionadas.push(dia);
  if (!marcada && i !== -1) fechas_seleccionadas.splice(i, 1);
  actualizar_resumen_de_fechas();
  pintar_tabla();
}

function limpiar_filtro_de_fechas() {
  fechas_seleccionadas = [];
  $("lista_fechas").querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
  actualizar_resumen_de_fechas();
  pintar_tabla();
}

// El botón resume el estado: "Todas las fechas" / la fecha / "N fechas seleccionadas".
function actualizar_resumen_de_fechas() {
  const n = fechas_seleccionadas.length;
  $("resumen_fechas").textContent = n === 0 ? "Todas las fechas"
    : (n === 1 ? fechas_seleccionadas[0] : n + " fechas seleccionadas");
  $("boton_menu_fechas").classList.toggle("con_filtro", n > 0);
  $("casilla_todas_las_fechas").checked = n === 0;
}

function menu_de_fechas_abierto() {
  const panel = $("panel_menu_fechas");
  return !!panel && !panel.hidden;
}

function abrir_menu_de_fechas() {
  $("panel_menu_fechas").hidden = false;
  $("boton_menu_fechas").setAttribute("aria-expanded", "true");
}

function cerrar_menu_de_fechas() {
  $("panel_menu_fechas").hidden = true;
  $("boton_menu_fechas").setAttribute("aria-expanded", "false");
}

function cajon_esta_abierto() {
  const fondo = $("fondo_cajon");
  return !!fondo && fondo.classList.contains("abierto");
}

// Retrato de lo que hay escrito en el formulario, para saber si el usuario tiene
// trabajo sin guardar y no cerrarle el cajón perdiéndole unas notas largas.
function estado_actual_del_formulario() {
  return JSON.stringify([
    $("campo_id_edicion").value, $("campo_marca").value, $("campo_plataforma").value,
    $("campo_tipo").value, $("campo_categoria").value, $("campo_estado").value,
    $("campo_numero_caso").value, $("campo_destino").value, $("campo_url_denunciada").value,
    $("campo_notas").value, comprobante_img_actual ? "con_imagen" : ""
  ]);
}

function hay_cambios_sin_guardar_en_el_cajon() {
  return cajon_esta_abierto() && estado_actual_del_formulario() !== instantanea_cajon;
}

function abrir_cajon_denuncia() {
  $("fondo_cajon").classList.add("abierto");
  instantanea_cajon = estado_actual_del_formulario();   // punto de partida
  const marca = $("campo_marca");
  if (marca) marca.focus();
}

// `pedir_confirmacion` sólo lo ponen los cierres que vienen del usuario (la ✕,
// Escape y el clic en el velo): si hay algo escrito que no se ha guardado, se
// pregunta antes de descartarlo. Los cierres del propio programa (después de
// guardar, o "Cancelar edición") no preguntan. Devuelve si se cerró.
function cerrar_cajon_denuncia(pedir_confirmacion) {
  if (pedir_confirmacion && hay_cambios_sin_guardar_en_el_cajon() &&
      !confirm("Hay cambios sin guardar en el formulario.\n¿Cerrar y descartar lo escrito?")) {
    return false;
  }
  $("fondo_cajon").classList.remove("abierto");
  $("aviso").textContent = "";
  instantanea_cajon = "";
  aplicar_repintado_pendiente();   // repinta lo que hubiera llegado mientras tanto
  return true;
}

// ----------------------------------------------------------------------------
//  Repintados llegados de FUERA (otra pestaña, el popup, el background…).
//  Nunca se repinta la tabla mientras el usuario está escribiendo un N.º de caso
//  o tiene el cajón abierto: se le borraría lo que está tecleando. Se anota como
//  pendiente y se pinta en cuanto termina.
// ----------------------------------------------------------------------------
function hay_edicion_en_curso() {
  return guardados_de_caso_en_curso > 0 || cajon_esta_abierto() ||
    !!document.querySelector(".caso_editando");
}

function aplicar_repintado_pendiente() {
  if (!repintado_pendiente || hay_edicion_en_curso()) return;
  repintado_pendiente = false;
  pintar_tabla();
}

function refrescar_vista() {
  refrescar_contadores();
  renderizar_menu_de_fechas();   // la lista de días depende de las denuncias
  pintar_tabla();
}

// ----------------------------------------------------------------------------
//  Alta / edición
// ----------------------------------------------------------------------------
function limpiar_formulario() {
  $("campo_id_edicion").value = "";
  $("campo_marca").selectedIndex = 0;
  $("campo_plataforma").selectedIndex = 0;
  $("campo_tipo").value = "formulario";
  $("campo_categoria").value = "";
  $("campo_estado").value = "enviada";
  $("campo_numero_caso").value = "";
  $("campo_destino").value = "";
  $("campo_url_denunciada").value = "";
  $("campo_notas").value = "";
  comprobante_img_actual = "";
  $("campo_comprobante_img").value = "";
  mostrar_previsualizacion_comprobante();
  $("titulo_formulario").textContent = "Agregar denuncia";
  $("boton_guardar_denuncia").textContent = "Guardar denuncia";
  $("boton_cancelar_edicion").style.display = "none";
  // El formulario vacío pasa a ser el nuevo punto de partida: así, tras pulsar
  // "Limpiar", cerrar el cajón no pregunta nada (no hay nada que perder).
  if (cajon_esta_abierto()) instantanea_cajon = estado_actual_del_formulario();
}

// ----------------------------------------------------------------------------
//  Imagen de comprobante en el formulario de alta/edición
// ----------------------------------------------------------------------------
// Lee un File de imagen, lo redimensiona a 1280px de ancho y lo recomprime a
// JPEG ~0.7 (igual que el botón de captura del popup), y devuelve el dataURL.
function leer_y_redimensionar(file, maxAncho, calidad) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = function () {
      const img = new Image();
      img.onload = function () {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxAncho) { h = Math.round(h * (maxAncho / w)); w = maxAncho; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", calidad));
      };
      img.onerror = function () { reject(new Error("imagen inválida")); };
      img.src = fr.result;
    };
    fr.onerror = function () { reject(new Error("no se pudo leer el archivo")); };
    fr.readAsDataURL(file);
  });
}

function mostrar_previsualizacion_comprobante() {
  const cont = $("previsualizacion_comprobante");
  const img = $("img_previsualizacion_comprobante");
  if (comprobante_img_actual) {
    img.src = comprobante_img_actual;          // por propiedad, no innerHTML (anti-XSS)
    cont.style.display = "block";
  } else {
    img.removeAttribute("src");
    cont.style.display = "none";
  }
}

async function al_elegir_comprobante(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    comprobante_img_actual = await leer_y_redimensionar(file, 1280, 0.7);
    mostrar_previsualizacion_comprobante();
    mostrar_aviso("✓ Imagen lista. Guarda la denuncia para conservarla.");
  } catch (err) {
    mostrar_aviso("No se pudo procesar la imagen.");
  }
  e.target.value = ""; // permite volver a elegir el mismo archivo
}

function quitar_comprobante_formulario() {
  comprobante_img_actual = "";
  $("campo_comprobante_img").value = "";
  mostrar_previsualizacion_comprobante();
}

function cargar_para_editar(id) {
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  $("campo_id_edicion").value = d.id;
  $("campo_marca").value = d.marca || "";
  $("campo_plataforma").value = d.plataforma || "";
  $("campo_tipo").value = d.tipo || "formulario";
  $("campo_categoria").value = d.categoria || "";
  $("campo_estado").value = d.estado || "enviada";
  $("campo_numero_caso").value = numeros_de_caso(d).join(", ");   // varios, separados por coma
  // Si no se escribió a mano, se muestra el destino deducido para poder corregirlo.
  $("campo_destino").value = d.destino || destino_de(d) || "";
  $("campo_url_denunciada").value = d.url_denunciada || "";
  $("campo_notas").value = d.notas || "";
  comprobante_img_actual = d.comprobante_img || "";
  $("campo_comprobante_img").value = "";
  mostrar_previsualizacion_comprobante();
  $("titulo_formulario").textContent = "Editar denuncia";
  $("boton_guardar_denuncia").textContent = "Guardar cambios";
  $("boton_cancelar_edicion").style.display = "inline-flex";
  abrir_cajon_denuncia();   // antes hacía scroll arriba; ahora el formulario vive en el cajón
}

async function guardar_denuncia() {
  const marca = $("campo_marca").value;
  const plataforma = $("campo_plataforma").value;
  if (!marca) { mostrar_aviso("Elige una marca."); return; }
  if (!plataforma) { mostrar_aviso("Elige una plataforma."); return; }

  const id_edicion = $("campo_id_edicion").value;
  const comunes = {
    marca: marca,
    plataforma: plataforma,
    tipo: $("campo_tipo").value,
    categoria: $("campo_categoria").value.trim(),
    destino: $("campo_destino").value.trim(),
    url_denunciada: $("campo_url_denunciada").value.trim(),
    estado: $("campo_estado").value,
    notas: $("campo_notas").value.trim(),
    comprobante_img: comprobante_img_actual || ""
  };
  // El campo admite VARIOS números separados por coma; se guardan como arreglo
  // y como texto espejo (compatibilidad con el resto de la extensión).
  Object.assign(comunes, cambios_de_numeros_de_caso(partir_numeros_de_caso($("campo_numero_caso").value)));

  // El guardado va contra lo ÚLTIMO que hay en el navegador (el consecutivo por
  // marca se calcula allí dentro). Si falla —o si la denuncia que se editaba ya
  // no existe— se avisa y el cajón NO se cierra: lo escrito no se pierde.
  try {
    if (id_edicion) {
      // Editar: conserva id, consecutivo y fecha originales.
      await guardar_cambio_en_registro({ tipo: "edicion", id: id_edicion, cambios: comunes });
    } else {
      await guardar_cambio_en_registro({ tipo: "alta", denuncia: Object.assign({
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        fecha: new Date().toISOString()
      }, comunes) });
    }
  } catch (err) {
    mostrar_aviso("⚠ No se guardó: " + err.message);
    mostrar_error("⚠ No se pudo guardar la denuncia: " + err.message);
    return;   // el cajón sigue abierto con todo lo escrito
  }

  limpiar_formulario();
  cerrar_cajon_denuncia();
  refrescar_vista();
  // El cajón acaba de cerrarse, así que el span #aviso ya no se ve: la
  // confirmación sale en la barra flotante.
  mostrar_toast(id_edicion ? "✓ Denuncia actualizada." : "✓ Denuncia guardada.");
}

async function eliminar_denuncia(id) {
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  if (!confirm("¿Eliminar la denuncia #" + d.consecutivo + " de " + d.marca + "? Esta acción no se puede deshacer.")) return;
  try {
    // Borra SÓLO esa denuncia de la lista guardada; lo que otros hayan añadido
    // mientras la página estaba abierta se conserva.
    await guardar_cambio_en_registro({ tipo: "borrado", id: id });
  } catch (err) {
    mostrar_error("⚠ No se pudo eliminar: " + err.message);
    return;
  }
  // Si se estaba editando esa denuncia, limpia el formulario.
  if ($("campo_id_edicion").value && String($("campo_id_edicion").value) === String(id)) limpiar_formulario();
  refrescar_vista();
  mostrar_aviso("Denuncia eliminada.");
}

// ----------------------------------------------------------------------------
//  Comprobante (modal + impresión)
// ----------------------------------------------------------------------------
function abrir_comprobante(id) {
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  $("compro_marca").textContent = d.marca + " · Denuncia #" + d.consecutivo;
  $("compro_sub").textContent = "Registrada el " + formatear_fecha(d.fecha);

  const casos_del_comprobante = numeros_de_caso(d);
  const filas = [
    ["Marca", d.marca],
    ["N.º consecutivo", d.consecutivo],
    ["Fecha", formatear_fecha(d.fecha)],
    ["Plataforma", d.plataforma],
    ["Enviado a", destino_de(d) || "—"],
    ["Correo(s) destinatario(s)", correos_destino_de(d).join(", ") || "—"],
    ["Tipo", TIPOS_REGISTRO[d.tipo] || d.tipo],
    ["Categoría", d.categoria || "—"],
    ["URL denunciada", d.url_denunciada || "—"],
    // Si hay varios números de caso se listan TODOS (uno por línea: el valor del
    // comprobante respeta los saltos con white-space: pre-wrap).
    [casos_del_comprobante.length > 1 ? "N.º de caso (" + casos_del_comprobante.length + ")" : "N.º de caso",
      casos_del_comprobante.join("\n") || "—"],
    ["Estado", ESTADOS_REGISTRO[d.estado] || d.estado],
    ["Notas", d.notas || "—"]
  ];
  $("compro_cuerpo").innerHTML = filas.map((f) =>
    '<div class="fila_dato"><span class="clave">' + escapar_html(f[0]) + '</span>' +
    '<span class="valor">' + escapar_html(f[1]) + '</span></div>').join("");

  // Imagen del comprobante: src por propiedad (no innerHTML), se imprime con el modal.
  const bloque = $("bloque_imagen_comprobante");
  const imgEl = $("img_comprobante");
  if (d.comprobante_img) {
    imgEl.src = d.comprobante_img;
    bloque.style.display = "block";
  } else {
    imgEl.removeAttribute("src");
    bloque.style.display = "none";
  }

  // Respuesta(s) de la red social (campo aparte, se pegan con Ctrl+V, galería
  // acumulable). Normaliza el viejo campo único `respuesta_img` a la lista
  // `respuestas_img` y pinta TODAS las imágenes (src por propiedad, no innerHTML).
  normalizar_respuestas(d);
  renderizar_galeria_respuestas(d);

  // Correo enviado (solo denuncias por correo): muestra asunto + cuerpo y permite copiar.
  const bloqueCorreo = $("bloque_correo_enviado");
  if (d.correo && (d.correo.cuerpo || d.correo.asunto)) {
    const c = d.correo;
    const metaFilas = [
      ["Para", c.to || "—"],
      ["Asunto", c.asunto || "—"],
      ["Enviado", c.enviado ? ("Sí — " + formatear_fecha(c.fecha)) : "Generado (revisa/envía desde la pestaña de correo)"]
    ];
    $("correo_meta").innerHTML = metaFilas.map((f) =>
      '<div class="fila_dato"><span class="clave">' + escapar_html(f[0]) + '</span>' +
      '<span class="valor">' + escapar_html(f[1]) + '</span></div>').join("");
    $("correo_cuerpo").textContent = c.cuerpo || ""; // textContent: sin riesgo de inyección
    bloqueCorreo.style.display = "block";
  } else {
    bloqueCorreo.style.display = "none";
  }

  // Aviso: denuncia POR FORMULARIO sin la captura del formulario adjunta.
  $("aviso_falta_captura").style.display =
    (d.tipo === "formulario" && !d.comprobante_img) ? "block" : "none";

  $("modal_comprobante").dataset.idActivo = d.id;

  $("fondo_comprobante").classList.add("abierto");
}

function cerrar_comprobante() {
  $("fondo_comprobante").classList.remove("abierto");
}

// Copia al portapapeles el correo (Para + Asunto + Cuerpo) de la denuncia abierta.
function copiar_correo_modal() {
  const id = $("modal_comprobante").dataset.idActivo;
  const d = DENUNCIAS.find((x) => String(x.id) === String(id));
  if (!d || !d.correo) return;
  const c = d.correo;
  const texto = "Para: " + (c.to || "") + "\nAsunto: " + (c.asunto || "") + "\n\n" + (c.cuerpo || "");
  const boton = $("boton_copiar_correo");
  const et = boton.textContent;
  const ok = () => { boton.textContent = "✅ Copiado"; setTimeout(() => { boton.textContent = et; }, 1500); };
  navigator.clipboard.writeText(texto).then(ok).catch(() => {
    const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch (e) {}
    document.body.removeChild(ta);
  });
}

// Quita la imagen adjunta de la denuncia abierta en el modal.
async function quitar_imagen_comprobante() {
  const id = $("modal_comprobante").dataset.idActivo;
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  if (!confirm("¿Quitar la imagen del comprobante de la denuncia #" + d.consecutivo + "?")) return;
  try {
    await guardar_cambio_en_registro({ tipo: "edicion", id: d.id, quitar: ["comprobante_img"] });
  } catch (err) {
    mostrar_error("⚠ No se pudo quitar la imagen: " + err.message);
    return;
  }
  $("bloque_imagen_comprobante").style.display = "none";
  $("img_comprobante").removeAttribute("src");
  refrescar_vista();
  mostrar_aviso("Imagen del comprobante quitada.");
}

// ----------------------------------------------------------------------------
//  Respuesta(s) de la red social: se PEGAN con Ctrl+V (sin adjuntar archivo).
//  Se guardan como una LISTA de dataURLs en `respuestas_img` de la denuncia
//  activa (galería acumulable), SEPARADA de `comprobante_img`. Las imágenes sólo
//  van a chrome.storage.local (nada de red).
//
//  Compatibilidad: denuncias antiguas guardaban una sola imagen en el string
//  `respuesta_img`. `respuestas_de` la lee siempre como array sin mutar; y
//  `normalizar_respuestas` la migra a `respuestas_img = [respuesta_img]` sin
//  perder ninguna imagen ya pegada.
// ----------------------------------------------------------------------------

// Devuelve SIEMPRE un array con las respuestas de la denuncia, sin mutarla.
function respuestas_de(d) {
  if (!d) return [];
  if (Array.isArray(d.respuestas_img)) return d.respuestas_img;
  if (typeof d.respuesta_img === "string" && d.respuesta_img) return [d.respuesta_img];
  return [];
}

// Migra en memoria el viejo `respuesta_img` (string) al array `respuestas_img` y
// devuelve ese array (para poder hacerle push/splice). No pierde imágenes.
function normalizar_respuestas(d) {
  if (!d) return [];
  if (!Array.isArray(d.respuestas_img)) {
    d.respuestas_img = (typeof d.respuesta_img === "string" && d.respuesta_img) ? [d.respuesta_img] : [];
  }
  if ("respuesta_img" in d) delete d.respuesta_img; // ya migrado a la lista
  return d.respuestas_img;
}

// Pinta TODAS las imágenes de respuesta en la galería del modal. Cada <img>
// recibe su src por PROPIEDAD (nunca dataURL dentro de innerHTML) y su propio
// botón "Quitar" (que sólo elimina esa, por índice). Si no hay ninguna, oculta
// la galería y deja visible sólo el área de pegado.
function renderizar_galeria_respuestas(d) {
  const bloque = $("bloque_imagen_respuesta");
  const galeria = $("galeria_respuestas");
  const conteo = $("conteo_respuestas");
  const lista = respuestas_de(d);
  galeria.innerHTML = ""; // se vacía; las imágenes se re-crean con src por propiedad

  if (!lista.length) {
    bloque.style.display = "none";
    conteo.textContent = "";
    return;
  }
  bloque.style.display = "block";
  conteo.textContent = "Respuestas pegadas: " + lista.length;

  lista.forEach((dataURL, indice) => {
    const item = document.createElement("div");
    item.className = "item_respuesta_galeria";

    const img = document.createElement("img");
    img.className = "img_respuesta_galeria";
    img.alt = "Respuesta de la red social " + (indice + 1);
    img.src = dataURL; // por propiedad, jamás en un string de innerHTML (anti-XSS)
    item.appendChild(img);

    const barra = document.createElement("div");
    barra.className = "barra no_imprimir";
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton gris mini";   // mismas clases que el resto de la página
    boton.textContent = "Quitar";
    boton.addEventListener("click", () => quitar_imagen_respuesta(indice));
    barra.appendChild(boton);
    item.appendChild(barra);

    galeria.appendChild(item);
  });
}

async function al_pegar_respuesta(e) {
  const dt = e.clipboardData || window.clipboardData;
  const items = dt ? dt.items : null;
  let file = null;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image/") === 0) {
        file = items[i].getAsFile();
        break;
      }
    }
  }
  e.preventDefault(); // no pegar como texto ni dejar el comportamiento por defecto

  if (!file) { mostrar_aviso("No hay una imagen en el portapapeles (copia primero la captura)."); return; }

  const id = $("modal_comprobante").dataset.idActivo;
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) { mostrar_aviso("Abre una denuncia antes de pegar la respuesta."); return; }

  try {
    // Redimensiona (máx 1280px de ancho) y recomprime a JPEG 0.85 para no llenar
    // el storage. El File proviene del portapapeles y es image/*.
    const dataURL = await leer_y_redimensionar(file, 1280, 0.85);
    // Se arma la lista NUEVA sin tocar la denuncia en memoria: sólo se aplica si
    // el guardado sale bien (si falla, no queda una respuesta fantasma).
    const lista = respuestas_de(d).slice();
    lista.push(dataURL);                     // AGREGA (no reemplaza): galería acumulable
    const actualizada = await guardar_cambio_en_registro({
      tipo: "edicion", id: d.id,
      cambios: { respuestas_img: lista },
      quitar: ["respuesta_img"]              // el campo viejo de una sola imagen
    });
    renderizar_galeria_respuestas(actualizada || d);
    refrescar_vista();
    mostrar_toast("✓ Respuesta agregada (" + lista.length + ").");
  } catch (err) {
    mostrar_error("⚠ No se guardó la respuesta pegada: " + (err && err.message ? err.message : "imagen no válida"));
  }
}

// Escucha el pegado a nivel documento SÓLO cuando el modal está abierto y el foco
// está en la zona de pegado (o dentro del modal, no en un campo de texto).
function al_pegar_documento(e) {
  if (!$("fondo_comprobante").classList.contains("abierto")) return;
  const area = $("area_pegar_respuesta");
  const activo = document.activeElement;
  const tag = activo && activo.tagName ? activo.tagName.toLowerCase() : "";
  const en_campo = tag === "input" || tag === "textarea" || tag === "select";
  if (activo === area || (!en_campo && $("modal_comprobante").contains(activo))) {
    al_pegar_respuesta(e);
  }
}

// Quita SÓLO la imagen de respuesta en la posición `indice` de la denuncia
// abierta en el modal, sin afectar las demás. Si la lista queda vacía, la galería
// se oculta sola al re-renderizar.
async function quitar_imagen_respuesta(indice) {
  const id = $("modal_comprobante").dataset.idActivo;
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  const lista = respuestas_de(d).slice();
  if (indice < 0 || indice >= lista.length) return;
  if (!confirm("¿Quitar esta imagen de respuesta de la denuncia #" + d.consecutivo + "?")) return;
  lista.splice(indice, 1); // elimina sólo esa
  let actualizada = null;
  try {
    actualizada = await guardar_cambio_en_registro({
      tipo: "edicion", id: d.id, cambios: { respuestas_img: lista }, quitar: ["respuesta_img"]
    });
  } catch (err) {
    mostrar_error("⚠ No se pudo quitar la imagen de respuesta: " + err.message);
    return;
  }
  renderizar_galeria_respuestas(actualizada || d);
  refrescar_vista();
  mostrar_toast("Imagen de respuesta quitada.");
}

// ----------------------------------------------------------------------------
//  Arranque
// ----------------------------------------------------------------------------
async function inicializar_registro() {
  const marcas = await obtener_marcas_registro();
  // Selects de marca (del alta y del filtro).
  llenar_select($("campo_marca"), marcas, { value: "", texto: "— Elige marca —" });
  llenar_select($("filtro_marca"), marcas, { value: "", texto: "Todas" });

  // Las denuncias se leen ANTES que los selects de plataforma: la lista de
  // plataformas incluye las que ya aparecen en los registros guardados.
  DENUNCIAS = await leer_registro();
  poblar_selects_de_plataforma(await obtener_plataformas_registro());
  refrescar_vista();

  // Eventos.
  $("boton_guardar_denuncia").addEventListener("click", guardar_denuncia);
  // "Limpiar" vacía el formulario pero DEJA el cajón abierto (para seguir dando
  // de alta); "Cancelar edición" sí limpia Y cierra.
  $("boton_limpiar_formulario").addEventListener("click", limpiar_formulario);
  $("boton_cancelar_edicion").addEventListener("click", () => { limpiar_formulario(); cerrar_cajon_denuncia(); });

  // Cajón lateral: se abre con "＋ Nueva denuncia" y se cierra con la ✕, con
  // Escape y haciendo clic en el velo.
  $("boton_nueva_denuncia").addEventListener("click", () => { limpiar_formulario(); abrir_cajon_denuncia(); });
  $("boton_cerrar_cajon").addEventListener("click", () => cerrar_cajon_denuncia(true));
  // El velo sólo cierra si el botón se APRETÓ y se SOLTÓ sobre él: si no, al
  // seleccionar texto dentro del área de Notas y soltar fuera, el clic acaba en
  // el velo y se cerraría el cajón perdiendo lo escrito.
  let apretado_en_el_velo = false;
  $("fondo_cajon").addEventListener("mousedown", (e) => { apretado_en_el_velo = (e.target === $("fondo_cajon")); });
  $("fondo_cajon").addEventListener("click", (e) => {
    if (e.target === $("fondo_cajon") && apretado_en_el_velo) cerrar_cajon_denuncia(true);
    apretado_en_el_velo = false;
  });
  // Escape también pregunta si hay algo escrito sin guardar (el foco puede estar
  // dentro de Notas con un texto largo).
  // Un ÚNICO manejador de Escape con prioridades: primero el desplegable de
  // fechas (si está abierto) y sólo si no, el cajón. Así cerrar el menú nunca
  // cierra de paso el formulario. (La edición de N.º de caso se queda el evento
  // con stopPropagation, y no llega hasta aquí.)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menu_de_fechas_abierto()) { cerrar_menu_de_fechas(); return; }
    if (cajon_esta_abierto()) cerrar_cajon_denuncia(true);
  });

  // Chips de la tabla y atajo del aviso de "sin número de caso".
  document.querySelectorAll(".chip_filtro").forEach((b) =>
    b.addEventListener("click", () => activar_chip(b.dataset.chip)));
  $("boton_ir_sin_caso").addEventListener("click", ir_a_registrar_numeros_de_caso);
  $("campo_comprobante_img").addEventListener("change", al_elegir_comprobante);
  $("boton_quitar_comprobante").addEventListener("click", quitar_comprobante_formulario);
  $("boton_quitar_imagen_comprobante").addEventListener("click", quitar_imagen_comprobante);
  // Los botones "Quitar" de cada respuesta se enlazan al renderizar la galería
  // (renderizar_galeria_respuestas), por índice; no hay un botón único.
  // Un solo listener a nivel documento evita el doble disparo (el evento del área
  // burbujea al documento); al_pegar_documento filtra por modal abierto + foco en el área.
  document.addEventListener("paste", al_pegar_documento);
  ["filtro_busqueda", "filtro_numero_caso", "filtro_marca", "filtro_plataforma", "filtro_estado"].forEach((id) =>
    $(id).addEventListener("input", pintar_tabla));

  // Desplegable de fechas concretas: abre/cierra, marca días y limpia.
  $("boton_menu_fechas").addEventListener("click", () => {
    if (menu_de_fechas_abierto()) cerrar_menu_de_fechas(); else abrir_menu_de_fechas();
  });
  $("casilla_todas_las_fechas").addEventListener("click", () => {
    limpiar_filtro_de_fechas();                  // "Todas" = ninguna marcada
    $("casilla_todas_las_fechas").checked = true;
  });
  $("boton_limpiar_fechas").addEventListener("click", () => { limpiar_filtro_de_fechas(); cerrar_menu_de_fechas(); });
  // Clic fuera del desplegable: se cierra (el clic en su propio botón no cuenta,
  // porque el botón vive dentro de #menu_fechas). Igual que con el velo del
  // cajón, sólo cierra si el botón se APRETÓ y se SOLTÓ fuera: así, seleccionar
  // una fecha con el ratón y soltar fuera no cierra el menú de golpe.
  let apretado_fuera_del_menu = false;
  document.addEventListener("mousedown", (e) => {
    apretado_fuera_del_menu = !$("menu_fechas").contains(e.target);
  });
  document.addEventListener("click", (e) => {
    if (menu_de_fechas_abierto() && apretado_fuera_del_menu && !$("menu_fechas").contains(e.target)) {
      cerrar_menu_de_fechas();
    }
  });
  $("boton_imprimir_comprobante").addEventListener("click", () => window.print());
  $("boton_cerrar_comprobante").addEventListener("click", cerrar_comprobante);
  $("boton_copiar_correo").addEventListener("click", copiar_correo_modal);
  $("fondo_comprobante").addEventListener("click", (e) => { if (e.target === $("fondo_comprobante")) cerrar_comprobante(); });

  // Si el usuario crea (o quita) una plataforma en el popup mientras esta página
  // está abierta, los desplegables se actualizan solos, sin recargar y sin perder
  // lo que estuviera seleccionado ni la edición en curso.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (cambios, area) => {
      if (area !== "local") return;

      if (cambios[CLAVE_PLATAFORMAS_USUARIO]) {
        poblar_selects_de_plataforma(await obtener_plataformas_registro());
      }

      // El REGISTRO cambió fuera de esta página: el popup dio de alta una
      // denuncia, el atajo adjuntó la captura del comprobante, se envió un
      // correo… La copia en memoria se pone al día al instante (si no, el
      // siguiente guardado trabajaría con datos viejos) y la tabla se repinta
      // —salvo que el usuario esté escribiendo, en cuyo caso se hace en cuanto
      // termine para no borrarle lo que teclea.
      if (cambios[CLAVE_REGISTRO]) {
        const nueva = cambios[CLAVE_REGISTRO].newValue;
        DENUNCIAS = Array.isArray(nueva) ? nueva : [];
        refrescar_contadores();
        renderizar_menu_de_fechas();   // pueden aparecer días nuevos
        if (hay_edicion_en_curso()) repintado_pendiente = true;
        else pintar_tabla();
      }
    });
  }
}

inicializar_registro();
