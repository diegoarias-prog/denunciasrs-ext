// ============================================================================
//  Plantillas reutilizables: crear, guardar (chrome.storage.local), copiar y
//  eliminar. Pensado para reutilizar textos en las denuncias.
// ============================================================================
const $ = (id) => document.getElementById(id);
const CLAVE = "plantillas";

function aviso(t) { $("aviso").textContent = t; setTimeout(() => ($("aviso").textContent = ""), 2500); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function leer() {
  return new Promise((res) => chrome.storage.local.get(CLAVE, (d) => res(Array.isArray(d[CLAVE]) ? d[CLAVE] : [])));
}
function guardar(arr) {
  return new Promise((res) => chrome.storage.local.set({ [CLAVE]: arr }, res));
}

function copiar(texto) {
  navigator.clipboard.writeText(texto).then(() => aviso("✓ Copiado")).catch(() => {
    const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); aviso("✓ Copiado"); } catch (e) {} document.body.removeChild(ta);
  });
}

// ============================================================================
//  SANEADOR DE HTML (lista blanca, sin librerías). Se aplica SIEMPRE antes de
//  guardar, cargar al editor y renderizar en la lista. El parseo se hace en un
//  <template> INERTE: su contenido no ejecuta <script> ni carga <img>/onerror.
// ============================================================================
const ETIQUETAS_PERMITIDAS = new Set(["B", "STRONG", "I", "EM", "U", "SPAN", "BR", "DIV", "P", "FONT"]);
const ETIQUETAS_ELIMINAR = new Set(["SCRIPT", "STYLE", "IMG", "SVG", "IFRAME", "OBJECT", "LINK", "META"]);
const STYLE_PERMITIDO = new Set(["color", "font-weight", "font-style", "text-decoration", "background-color"]);

// Deja solo las propiedades de style de la lista blanca y rechaza valores peligrosos.
function filtrar_style(valor) {
  const salida = [];
  String(valor || "").split(";").forEach((decl) => {
    const i = decl.indexOf(":");
    if (i < 0) return;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!STYLE_PERMITIDO.has(prop) || !val) return;
    const bajo = val.toLowerCase();
    if (bajo.includes("url(") || bajo.includes("expression") || bajo.includes("javascript:") || bajo.includes("/*")) return;
    salida.push(prop + ": " + val);
  });
  return salida.join("; ");
}

// Recorre y limpia el árbol in situ (sirve para DocumentFragment y elementos).
function limpiar_nodo(nodo) {
  Array.from(nodo.childNodes).forEach((h) => {
    if (h.nodeType === 8) { h.remove(); return; } // comentarios fuera
    if (h.nodeType !== 1) return;                  // deja nodos de texto
    const tag = h.tagName.toUpperCase();
    if (ETIQUETAS_ELIMINAR.has(tag)) { h.remove(); return; } // elimina etiqueta y su contenido
    if (!ETIQUETAS_PERMITIDAS.has(tag)) {
      // Etiqueta no permitida: limpiar hijos y "desenvolver" (conservar solo texto/hijos válidos).
      limpiar_nodo(h);
      const padre = h.parentNode;
      while (h.firstChild) padre.insertBefore(h.firstChild, h);
      padre.removeChild(h);
      return;
    }
    // Etiqueta permitida: quitar TODOS los atributos salvo los de la lista blanca.
    Array.from(h.attributes).forEach((a) => {
      const nombre = a.name.toLowerCase();
      if (tag === "FONT" && nombre === "color") {
        const v = String(a.value).toLowerCase();
        if (v.includes("url(") || v.includes("javascript:") || v.includes("expression")) h.removeAttribute(a.name);
        return; // conserva color válido en <font>
      }
      if (nombre === "style" && (tag === "SPAN" || tag === "FONT" || tag === "DIV" || tag === "P")) {
        const limpio = filtrar_style(a.value);
        if (limpio) h.setAttribute("style", limpio); else h.removeAttribute("style");
        return;
      }
      h.removeAttribute(a.name); // on*, href, src, class, id, style no permitido, etc.
    });
    limpiar_nodo(h);
  });
}

function sanitizar_html(html) {
  try {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html == null ? "" : html);
    limpiar_nodo(tpl.content);
    const salida = document.createElement("div");
    salida.appendChild(tpl.content.cloneNode(true));
    return salida.innerHTML;
  } catch (e) {
    // Respaldo seguro: nunca dejar la vista sin pintar por un fallo del saneo.
    return esc(String(html == null ? "" : html));
  }
}

// Devuelve HTML SEGURO para mostrar/editar/copiar una plantilla, distinguiendo
// las nuevas (formato:"html") de las viejas (texto plano con saltos \n).
function plantilla_a_html(p) {
  p = p || {};
  if (p.formato === "html") return sanitizar_html(p.texto || "");
  // Legacy texto plano: escapar (queda seguro y el "<" pegado no se interpreta)
  // y convertir los saltos de línea en <br> para que se vean y se copien.
  return esc(p.texto || "").replace(/\n/g, "<br>");
}

// HTML (ya saneado) → texto plano preservando saltos. Se mide adjuntando el nodo
// fuera de pantalla para que innerText calcule bien los saltos de línea.
function html_a_texto_plano(html) {
  const tmp = document.createElement("div");
  tmp.style.position = "fixed"; tmp.style.left = "-9999px"; tmp.style.top = "0";
  tmp.style.whiteSpace = "pre-wrap"; // conserva los saltos de línea en innerText
  tmp.innerHTML = html;
  document.body.appendChild(tmp);
  const plano = tmp.innerText;
  document.body.removeChild(tmp);
  return plano;
}

// Copia CON formato: pone text/html + text/plain en el portapapeles. Si el
// navegador no soporta ClipboardItem/clipboard.write, cae al copiado de texto.
function copiar_rico(html) {
  const limpio = sanitizar_html(html);
  const plano = html_a_texto_plano(limpio);
  const puede = typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write;
  if (!puede) { copiar(plano); return; }
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([limpio], { type: "text/html" }),
      "text/plain": new Blob([plano], { type: "text/plain" })
    });
    navigator.clipboard.write([item]).then(() => aviso("✓ Copiado")).catch(() => copiar(plano));
  } catch (e) { copiar(plano); }
}

const TEMA_POR_DEFECTO = "Banco de Guatemala";
const SIN_TEMA = "Sin tema";
const CLAVE_MIGRADAS = "plantillas_migradas";

// Migración one-time (con bandera): SOLO la primera vez, las plantillas legacy
// sin tema pasan a "Banco de Guatemala". Tras marcar la bandera no vuelve a
// correr, así una plantilla nueva guardada con tema vacío queda estable en
// "Sin tema" y nunca se le pisa el tema al recargar.
async function migrar() {
  const ya = await new Promise((res) => chrome.storage.local.get(CLAVE_MIGRADAS, (d) => res(d[CLAVE_MIGRADAS] === true)));
  if (ya) return;
  const arr = await leer();
  arr.forEach((p) => {
    if (p.tema === undefined || p.tema === null || String(p.tema).trim() === "") {
      p.tema = TEMA_POR_DEFECTO;
    }
  });
  await guardar(arr);
  await new Promise((res) => chrome.storage.local.set({ [CLAVE_MIGRADAS]: true }, res));
}

// Marcas del proyecto: base (window.MARCAS_BASE) + las agregadas/editadas en
// Opciones (marcas_usuario, heredando campos) − las eliminadas (marcas_eliminadas).
// MISMA lógica que obtener_marcas_registro() de registro.js. Devuelve NOMBRES.
async function obtener_marcas() {
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

// Temas para los selects = UNIÓN de todas las marcas + los temas ya usados en
// plantillas que no sean marcas (para no perder temas personalizados). Únicos,
// ordenados en español.
function lista_temas_union(arr, marcas) {
  const usados = arr.map((p) => (p.tema || "").trim()).filter(Boolean);
  return [...new Set([...marcas, ...usados])].sort((a, b) => a.localeCompare(b, "es"));
}

// Genera el HTML de una <option> escapando value (atributo) y texto (contenido).
function opcion(valor, texto, seleccionado) {
  return '<option value="' + esc(valor) + '"' + (seleccionado ? " selected" : "") + ">" + esc(texto) + "</option>";
}

// Llena el <select> del formulario (Tema) y el <select> de filtro con la unión
// de temas (marcas + personalizados). Preserva la selección de cada uno.
function llenar_selects_de_temas(arr, temas) {
  const hay_sin_tema = arr.some((p) => !(p.tema && String(p.tema).trim()));

  // Select del formulario: "Nuevo…" (value="") + un tema por opción.
  const sel = $("tema_sel");
  const sel_prev = sel.value;
  let html_sel = opcion("", "➕ Escribir un tema nuevo…", sel_prev === "");
  temas.forEach((t) => { html_sel += opcion(t, t, sel_prev === t); });
  sel.innerHTML = html_sel;
  if (sel.value !== sel_prev) sel.value = ""; // el tema previo ya no existe → modo nuevo

  // Select de filtro: "Todas las marcas" (value="") + temas + "Sin tema" si aplica.
  const fil = $("filtro_tema");
  const fil_prev = fil.value;
  let html_fil = opcion("", "Todas las marcas", fil_prev === "");
  temas.forEach((t) => { html_fil += opcion(t, t, fil_prev === t); });
  if (hay_sin_tema) html_fil += opcion(SIN_TEMA, SIN_TEMA, fil_prev === SIN_TEMA);
  fil.innerHTML = html_fil;
  // Si el tema filtrado ya no existe, vuelve a "Todas las marcas".
  if (fil.value !== fil_prev) fil.value = "";
}

// Lista PLANA: todas las plantillas a la vista, ordenadas por marca (tema) y
// luego por nombre, con "Sin tema" al final. Cada una lleva una insignia con
// su marca. El filtro de arriba solo reduce esta lista; no hay nada plegado.
async function pintar() {
  const arr = await leer();
  const marcas = await obtener_marcas();
  const temas_union = lista_temas_union(arr, marcas);
  llenar_selects_de_temas(arr, temas_union);
  // Si el select de Tema quedó en "nuevo" (p. ej. su tema dejó de existir),
  // sincroniza la visibilidad de la caja de texto de tema nuevo.
  actualizar_visibilidad_tema_nuevo();
  const lista = $("lista");
  const contador = $("contador_plantillas");
  if (!arr.length) {
    contador.textContent = "";
    lista.innerHTML = '<p class="vacio">Aún no hay plantillas guardadas.</p>';
    return;
  }

  const filtro = $("filtro_tema").value; // "" = todas; SIN_TEMA = sin tema; otro = esa marca

  // Conserva SIEMPRE el índice real dentro de arr (idx), que es el que se usa
  // en los data-attributes para copiar/editar/eliminar.
  const visibles = [];
  arr.forEach((p, idx) => {
    const tema = (p.tema && String(p.tema).trim()) ? String(p.tema).trim() : SIN_TEMA;
    if (filtro && tema !== filtro) return;
    visibles.push({ p, idx, tema });
  });

  contador.textContent = filtro
    ? "Mostrando " + visibles.length + " de " + arr.length + " plantillas"
    : arr.length + (arr.length === 1 ? " plantilla" : " plantillas");

  if (!visibles.length) { lista.innerHTML = '<p class="vacio">No hay plantillas para la marca seleccionada.</p>'; return; }

  visibles.sort((x, y) => {
    if (x.tema !== y.tema) {
      if (x.tema === SIN_TEMA) return 1;
      if (y.tema === SIN_TEMA) return -1;
      return x.tema.localeCompare(y.tema, "es");
    }
    return String(x.p.nombre || "").localeCompare(String(y.p.nombre || ""), "es");
  });

  let html = "";
  visibles.forEach(({ p, idx, tema }) => {
    const chip = p.etiqueta ? '<span class="chip_etiqueta">' + esc(p.etiqueta) + "</span>" : "";
    const clase_insignia = "insignia_marca_plantilla" + (tema === SIN_TEMA ? " sin_marca_plantilla" : "");
    html +=
      '<div class="item" data-marca-plantilla="' + esc(tema) + '">' +
      '<div class="tit"><span class="nombre_plantilla_lista">' + esc(p.nombre || "(sin nombre)") + "</span>" +
      '<span class="' + clase_insignia + '" title="Marca de la plantilla">' + esc(tema) + "</span>" + chip + "</div>" +
      '<div class="txt">' + plantilla_a_html(p) + "</div>" +
      '<div class="acc"><button class="boton mini" data-copiar="' + idx + '">Copiar</button>' +
      '<button class="boton mini sec" data-editar="' + idx + '">Editar</button>' +
      '<button class="boton del mini" data-eliminar="' + idx + '">Eliminar</button></div>' +
      "</div>";
  });
  lista.innerHTML = html;
}

// Tema efectivo del formulario: si está en modo "nuevo" (select en value ""),
// se usa el texto escrito; si no, el tema elegido en el select.
function tema_del_formulario() {
  const sel = $("tema_sel").value;
  return sel === "" ? $("tema_nuevo").value.trim() : sel;
}

// Al elegir "Nuevo…" (value "") muestra la caja de texto; con otra, la oculta y limpia.
function actualizar_visibilidad_tema_nuevo() {
  const nuevo = $("tema_nuevo");
  if ($("tema_sel").value === "") { nuevo.style.display = "block"; }
  else { nuevo.style.display = "none"; nuevo.value = ""; }
}
$("tema_sel").addEventListener("change", actualizar_visibilidad_tema_nuevo);

// Deja el formulario en modo "tema nuevo" con la caja oculta y vacía.
function reset_campos_tema() {
  $("tema_sel").value = "";
  $("tema_nuevo").value = "";
  $("tema_nuevo").style.display = "none";
}

$("guardar").addEventListener("click", async () => {
  const nombre = $("nombre").value.trim();
  // Vacío se decide por el TEXTO VISIBLE; se guarda el HTML saneado.
  const visible = $("texto").innerText.trim();
  const texto = visible ? sanitizar_html($("texto").innerHTML) : "";
  const tema = tema_del_formulario();
  const etiqueta = $("etiqueta").value.trim();
  if (!nombre && !visible) { aviso("Escribe un nombre y/o texto."); return; }
  const arr = await leer();
  const idx = arr.findIndex((p) => (p.nombre || "").toLowerCase() === nombre.toLowerCase() && nombre);
  if (idx >= 0) arr[idx] = { nombre, texto, tema, etiqueta, formato: "html" }; else arr.push({ nombre, texto, tema, etiqueta, formato: "html" });
  await guardar(arr);
  $("nombre").value = ""; $("texto").innerHTML = ""; $("etiqueta").value = "";
  reset_campos_tema();
  aviso("✓ Guardada");
  pintar();
});

$("limpiar").addEventListener("click", () => {
  $("nombre").value = ""; $("texto").innerHTML = ""; $("etiqueta").value = "";
  reset_campos_tema();
});

$("filtro_tema").addEventListener("change", pintar);

$("lista").addEventListener("click", async (e) => {
  const arr = await leer();
  const c = e.target.getAttribute("data-copiar");
  const ed = e.target.getAttribute("data-editar");
  const el = e.target.getAttribute("data-eliminar");
  if (c !== null) { copiar_rico(plantilla_a_html(arr[+c] || {})); return; }
  if (ed !== null) {
    const p = arr[+ed] || {};
    $("nombre").value = p.nombre || ""; $("texto").innerHTML = plantilla_a_html(p);
    $("etiqueta").value = p.etiqueta || "";
    // El tema de una plantilla existente ya figura entre las opciones: se
    // selecciona directamente (no modo nuevo). Si por algún caso no existiera
    // como opción, se cae a modo "nuevo" con la caja mostrando ese tema.
    const sel = $("tema_sel");
    const temaP = (p.tema || "").trim();
    sel.value = temaP;
    if (sel.value === temaP && temaP !== "") {
      $("tema_nuevo").style.display = "none"; $("tema_nuevo").value = "";
    } else {
      sel.value = "";
      $("tema_nuevo").style.display = "block";
      $("tema_nuevo").value = temaP;
    }
    window.scrollTo(0, 0); return;
  }
  if (el !== null) {
    if (!confirm('¿Eliminar la plantilla "' + ((arr[+el] || {}).nombre || "") + '"?')) return;
    arr.splice(+el, 1); await guardar(arr); pintar();
  }
});

// ============================================================================
//  Barra de formato del editor (negrita, cursiva, subrayado, color, quitar).
//  Cada botón hace preventDefault en mousedown para NO perder la selección del
//  editor; luego enfoca el editor y ejecuta el execCommand correspondiente.
// ============================================================================
let rango_guardado = null;
function guardar_rango() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && $("texto").contains(sel.anchorNode)) {
    rango_guardado = sel.getRangeAt(0).cloneRange();
  }
}
function restaurar_rango() {
  if (!rango_guardado) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(rango_guardado);
}
// Mantén fresca la última selección hecha dentro del editor.
$("texto").addEventListener("keyup", guardar_rango);
$("texto").addEventListener("mouseup", guardar_rango);

// Botones de comando simple: mousedown preventDefault conserva la selección.
function enlazar_boton_formato(id, comando) {
  const b = $(id);
  b.addEventListener("mousedown", (e) => { e.preventDefault(); });
  b.addEventListener("click", () => { $("texto").focus(); document.execCommand(comando, false, null); });
}
enlazar_boton_formato("fmt_negrita", "bold");
enlazar_boton_formato("fmt_cursiva", "italic");
enlazar_boton_formato("fmt_subrayado", "underline");
enlazar_boton_formato("fmt_quitar", "removeFormat");

// Color: el selector nativo roba el foco, así que guardamos el rango al abrirlo
// (mousedown) y lo restauramos antes de aplicar foreColor.
const color_texto = $("color_texto");
color_texto.addEventListener("mousedown", guardar_rango);
color_texto.addEventListener("input", () => {
  $("texto").focus();
  restaurar_rango();
  document.execCommand("foreColor", false, color_texto.value);
});

(async () => {
  await migrar();
  await pintar();
  // Al abrir, el select arranca en "Nuevo…": muestra la caja para poder escribir.
  actualizar_visibilidad_tema_nuevo();
})();
