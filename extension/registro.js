// ============================================================================
//  Registro de denuncias enviadas (por marca). Guarda en chrome.storage.local
//  bajo la clave `denuncias_registro` un arreglo de objetos con la forma:
//  { id, marca, plataforma, tipo, categoria, url_denunciada, numero_caso,
//    estado, consecutivo, notas, fecha }
//  El diseño espeja la futura BD (Marcas / Plataformas / Denuncias) para migrar
//  limpio. No hace llamados remotos: todo offline.
// ============================================================================

const CLAVE_REGISTRO = "denuncias_registro";

// Lista FIJA de plataformas (espeja la tabla Plataformas de la futura BD).
const PLATAFORMAS_REGISTRO = [
  "Facebook", "Instagram", "WhatsApp", "TikTok", "X", "LinkedIn", "YouTube",
  "Telegram", "GitHub", "Apps maliciosas", "Delisting", "Ofertas falsas de trabajo",
  "Outlook / Hotmail", "Scribd", "Studocu"
];

// "borrador" se conserva por compatibilidad con registros antiguos; el alta usa
// pendiente / enviada / resuelta.
const ESTADOS_REGISTRO = { pendiente: "Pendiente", borrador: "Borrador", enviada: "Enviada", resuelta: "Resuelta" };
const TIPOS_REGISTRO = { formulario: "Formulario", correo: "Correo" };

const $ = (id) => document.getElementById(id);

let DENUNCIAS = [];   // arreglo en memoria, espejo de chrome.storage
let comprobante_img_actual = "";  // imagen en edición en el formulario de alta (dataURL)

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
//  Persistencia
// ----------------------------------------------------------------------------
function leer_registro() {
  return new Promise((res) =>
    chrome.storage.local.get([CLAVE_REGISTRO], (x) => res(Array.isArray(x[CLAVE_REGISTRO]) ? x[CLAVE_REGISTRO] : [])));
}

function guardar_registro() {
  return new Promise((res) => chrome.storage.local.set({ [CLAVE_REGISTRO]: DENUNCIAS }, res));
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

function mostrar_aviso(texto) {
  const a = $("aviso");
  a.textContent = texto;
  setTimeout(() => (a.textContent = ""), 2500);
}

// ----------------------------------------------------------------------------
//  Contadores
// ----------------------------------------------------------------------------
function refrescar_contadores() {
  $("contador_total").textContent = DENUNCIAS.length;
  $("contador_con_caso").textContent = DENUNCIAS.filter((d) => (d.numero_caso || "").trim() !== "").length;
  $("contador_resueltas").textContent = DENUNCIAS.filter((d) => d.estado === "resuelta").length;
}

// ----------------------------------------------------------------------------
//  Tabla (con buscador + filtros)
// ----------------------------------------------------------------------------
function denuncias_filtradas() {
  const q = $("filtro_busqueda").value.trim().toLowerCase();
  const fMarca = $("filtro_marca").value;
  const fPlat = $("filtro_plataforma").value;
  const fEstado = $("filtro_estado").value;
  return DENUNCIAS.filter((d) => {
    if (fMarca && d.marca !== fMarca) return false;
    if (fPlat && d.plataforma !== fPlat) return false;
    if (fEstado && d.estado !== fEstado) return false;
    if (q) {
      const heno = ((d.numero_caso || "") + " " + (d.marca || "") + " " + (d.url_denunciada || "")).toLowerCase();
      if (heno.indexOf(q) < 0) return false;
    }
    return true;
  });
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
    const marcas_adjuntos = [];
    if (d.comprobante_img) marcas_adjuntos.push("Comprobante 📎");
    if (num_respuestas) marcas_adjuntos.push("Respuestas 💬 (" + num_respuestas + ")");
    const titulo_adjuntos = marcas_adjuntos.length ? marcas_adjuntos.join(" · ") : "Sin adjuntos";
    const iconos_adjuntos = (d.comprobante_img ? "📎" : "") + (num_respuestas ? "💬" + num_respuestas : "");
    tr.innerHTML =
      '<td>' + escapar_html(d.consecutivo) + '</td>' +
      '<td>' + escapar_html(formatear_fecha(d.fecha)) + '</td>' +
      '<td>' + escapar_html(d.marca) + '</td>' +
      '<td>' + escapar_html(d.plataforma) + '</td>' +
      '<td>' + escapar_html(TIPOS_REGISTRO[d.tipo] || d.tipo || "") + '</td>' +
      '<td>' + escapar_html(d.categoria) + '</td>' +
      '<td>' + escapar_html(d.numero_caso) + '</td>' +
      '<td><span class="etiqueta_estado ' + escapar_html(clase_estado) + '">' + escapar_html(ESTADOS_REGISTRO[d.estado] || d.estado || "") + '</span></td>' +
      '<td style="text-align:center;" title="' + escapar_html(titulo_adjuntos) + '">' + iconos_adjuntos + '</td>' +
      '<td class="celda_accion">' +
        '<button class="boton sec mini" data-accion="ver" title="Ver comprobante">👁</button>' +
        '<button class="boton sec mini" data-accion="editar" title="Editar">✏️</button>' +
        '<button class="boton del mini" data-accion="eliminar" title="Eliminar">🗑</button>' +
      '</td>';
    tr.querySelector('[data-accion="ver"]').addEventListener("click", () => abrir_comprobante(d.id));
    tr.querySelector('[data-accion="editar"]').addEventListener("click", () => cargar_para_editar(d.id));
    tr.querySelector('[data-accion="eliminar"]').addEventListener("click", () => eliminar_denuncia(d.id));
    cuerpo.appendChild(tr);
  });
}

function refrescar_vista() {
  refrescar_contadores();
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
  $("campo_url_denunciada").value = "";
  $("campo_notas").value = "";
  comprobante_img_actual = "";
  $("campo_comprobante_img").value = "";
  mostrar_previsualizacion_comprobante();
  $("titulo_formulario").textContent = "Agregar denuncia";
  $("boton_guardar_denuncia").textContent = "Guardar denuncia";
  $("boton_cancelar_edicion").style.display = "none";
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
  $("campo_numero_caso").value = d.numero_caso || "";
  $("campo_url_denunciada").value = d.url_denunciada || "";
  $("campo_notas").value = d.notas || "";
  comprobante_img_actual = d.comprobante_img || "";
  $("campo_comprobante_img").value = "";
  mostrar_previsualizacion_comprobante();
  $("titulo_formulario").textContent = "Editar denuncia";
  $("boton_guardar_denuncia").textContent = "Guardar cambios";
  $("boton_cancelar_edicion").style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    url_denunciada: $("campo_url_denunciada").value.trim(),
    numero_caso: $("campo_numero_caso").value.trim(),
    estado: $("campo_estado").value,
    notas: $("campo_notas").value.trim(),
    comprobante_img: comprobante_img_actual || ""
  };

  if (id_edicion) {
    // Editar: conserva id, consecutivo y fecha originales.
    const d = DENUNCIAS.find((x) => String(x.id) === String(id_edicion));
    if (d) Object.assign(d, comunes);
  } else {
    // Alta: consecutivo correlativo POR MARCA (máximo existente + 1, así no se
    // repite ni si se borró una denuncia intermedia).
    const consecutivo = DENUNCIAS.filter((x) => x.marca === marca)
      .reduce((m, x) => Math.max(m, parseInt(x.consecutivo, 10) || 0), 0) + 1;
    DENUNCIAS.push(Object.assign({
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      consecutivo: consecutivo,
      fecha: new Date().toISOString()
    }, comunes));
  }

  await guardar_registro();
  limpiar_formulario();
  refrescar_vista();
  mostrar_aviso(id_edicion ? "✓ Denuncia actualizada." : "✓ Denuncia guardada.");
}

async function eliminar_denuncia(id) {
  const d = DENUNCIAS.find((x) => x.id === id);
  if (!d) return;
  if (!confirm("¿Eliminar la denuncia #" + d.consecutivo + " de " + d.marca + "? Esta acción no se puede deshacer.")) return;
  DENUNCIAS = DENUNCIAS.filter((x) => x.id !== id);
  await guardar_registro();
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

  const filas = [
    ["Marca", d.marca],
    ["N.º consecutivo", d.consecutivo],
    ["Fecha", formatear_fecha(d.fecha)],
    ["Plataforma", d.plataforma],
    ["Tipo", TIPOS_REGISTRO[d.tipo] || d.tipo],
    ["Categoría", d.categoria || "—"],
    ["URL denunciada", d.url_denunciada || "—"],
    ["N.º de caso", d.numero_caso || "—"],
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
  delete d.comprobante_img;
  await guardar_registro();
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
    boton.className = "boton sec mini";
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
    const lista = normalizar_respuestas(d); // migra el viejo campo si hiciera falta
    lista.push(dataURL);                     // AGREGA (no reemplaza): galería acumulable
    await guardar_registro();
    renderizar_galeria_respuestas(d);
    refrescar_vista();
    mostrar_aviso("✓ Respuesta agregada (" + lista.length + ").");
  } catch (err) {
    mostrar_aviso("No se pudo procesar la imagen pegada.");
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
  const lista = normalizar_respuestas(d);
  if (indice < 0 || indice >= lista.length) return;
  if (!confirm("¿Quitar esta imagen de respuesta de la denuncia #" + d.consecutivo + "?")) return;
  lista.splice(indice, 1); // elimina sólo esa
  await guardar_registro();
  renderizar_galeria_respuestas(d);
  refrescar_vista();
  mostrar_aviso("Imagen de respuesta quitada.");
}

// ----------------------------------------------------------------------------
//  Arranque
// ----------------------------------------------------------------------------
async function inicializar_registro() {
  const marcas = await obtener_marcas_registro();
  // Selects del formulario de alta.
  llenar_select($("campo_marca"), marcas, { value: "", texto: "— Elige marca —" });
  llenar_select($("campo_plataforma"), PLATAFORMAS_REGISTRO, { value: "", texto: "— Elige plataforma —" });
  // Selects de filtros.
  llenar_select($("filtro_marca"), marcas, { value: "", texto: "Todas" });
  llenar_select($("filtro_plataforma"), PLATAFORMAS_REGISTRO, { value: "", texto: "Todas" });

  DENUNCIAS = await leer_registro();
  refrescar_vista();

  // Eventos.
  $("boton_guardar_denuncia").addEventListener("click", guardar_denuncia);
  $("boton_limpiar_formulario").addEventListener("click", limpiar_formulario);
  $("boton_cancelar_edicion").addEventListener("click", limpiar_formulario);
  $("campo_comprobante_img").addEventListener("change", al_elegir_comprobante);
  $("boton_quitar_comprobante").addEventListener("click", quitar_comprobante_formulario);
  $("boton_quitar_imagen_comprobante").addEventListener("click", quitar_imagen_comprobante);
  // Los botones "Quitar" de cada respuesta se enlazan al renderizar la galería
  // (renderizar_galeria_respuestas), por índice; no hay un botón único.
  // Un solo listener a nivel documento evita el doble disparo (el evento del área
  // burbujea al documento); al_pegar_documento filtra por modal abierto + foco en el área.
  document.addEventListener("paste", al_pegar_documento);
  ["filtro_busqueda", "filtro_marca", "filtro_plataforma", "filtro_estado"].forEach((id) =>
    $(id).addEventListener("input", pintar_tabla));
  $("boton_imprimir_comprobante").addEventListener("click", () => window.print());
  $("boton_cerrar_comprobante").addEventListener("click", cerrar_comprobante);
  $("boton_copiar_correo").addEventListener("click", copiar_correo_modal);
  $("fondo_comprobante").addEventListener("click", (e) => { if (e.target === $("fondo_comprobante")) cerrar_comprobante(); });
}

inicializar_registro();
