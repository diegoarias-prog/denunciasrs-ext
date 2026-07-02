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

// Lista de temas existentes (únicos, no vacíos, ordenados en español).
function temas_existentes(arr) {
  return [...new Set(arr.map((p) => (p.tema || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

// Genera el HTML de una <option> escapando value (atributo) y texto (contenido).
function opcion(valor, texto, seleccionado) {
  return '<option value="' + esc(valor) + '"' + (seleccionado ? " selected" : "") + ">" + esc(texto) + "</option>";
}

// Llena el <select> del formulario (Tema) y el <select> de filtro.
// Preserva la selección actual de cada uno entre re-pintados.
function llenar_selects_de_temas(arr) {
  const temas = temas_existentes(arr);
  const hay_sin_tema = arr.some((p) => !(p.tema && String(p.tema).trim()));

  // Select del formulario: "Nuevo…" (value="") + un tema por opción.
  const sel = $("tema_sel");
  const sel_prev = sel.value;
  let html_sel = opcion("", "➕ Escribir un tema nuevo…", sel_prev === "");
  temas.forEach((t) => { html_sel += opcion(t, t, sel_prev === t); });
  sel.innerHTML = html_sel;
  if (sel.value !== sel_prev) sel.value = ""; // el tema previo ya no existe → modo nuevo

  // Select de filtro: "Todos los temas" (value="") + temas + "Sin tema" si aplica.
  const fil = $("filtro_tema");
  const fil_prev = fil.value;
  let html_fil = opcion("", "Todos los temas", fil_prev === "");
  temas.forEach((t) => { html_fil += opcion(t, t, fil_prev === t); });
  if (hay_sin_tema) html_fil += opcion(SIN_TEMA, SIN_TEMA, fil_prev === SIN_TEMA);
  fil.innerHTML = html_fil;
  // Si el tema filtrado ya no existe, vuelve a "Todos los temas".
  if (fil.value !== fil_prev) fil.value = "";
}

async function pintar() {
  const arr = await leer();
  llenar_selects_de_temas(arr);
  // Si el select de Tema quedó en "nuevo" (p. ej. su tema dejó de existir),
  // sincroniza la visibilidad de la caja de texto de tema nuevo.
  actualizar_visibilidad_tema_nuevo();
  const lista = $("lista");
  if (!arr.length) { lista.innerHTML = '<p class="vacio">Aún no hay plantillas guardadas.</p>'; return; }

  const filtro = $("filtro_tema").value; // "" = todos; SIN_TEMA = sin tema; otro = ese tema

  // Agrupar por tema conservando SIEMPRE el índice real dentro de arr (idx),
  // que es el que se usa en los data-attributes para copiar/editar/eliminar.
  const grupos = new Map();
  arr.forEach((p, idx) => {
    const tema = (p.tema && String(p.tema).trim()) ? String(p.tema).trim() : SIN_TEMA;
    if (filtro && tema !== filtro) return; // aplica filtro por tema
    if (!grupos.has(tema)) grupos.set(tema, []);
    grupos.get(tema).push({ p, idx });
  });

  if (!grupos.size) { lista.innerHTML = '<p class="vacio">No hay plantillas para el tema seleccionado.</p>'; return; }

  // Orden de grupos alfabético, dejando "Sin tema" al final.
  const temas_ordenados = [...grupos.keys()].sort((a, b) => {
    if (a === SIN_TEMA) return 1;
    if (b === SIN_TEMA) return -1;
    return a.localeCompare(b, "es");
  });

  let html = "";
  temas_ordenados.forEach((tema) => {
    html += '<div class="grupo_tema">' + esc(tema) + "</div>";
    grupos.get(tema).forEach(({ p, idx }) => {
      const chip = p.etiqueta ? '<span class="chip_etiqueta">' + esc(p.etiqueta) + "</span>" : "";
      html +=
        '<div class="item">' +
        '<div class="tit">' + esc(p.nombre || "(sin nombre)") + chip + "</div>" +
        '<div class="txt">' + esc(p.texto || "") + "</div>" +
        '<div class="acc"><button class="boton mini" data-copiar="' + idx + '">Copiar</button>' +
        '<button class="boton mini sec" data-editar="' + idx + '">Editar</button>' +
        '<button class="boton del mini" data-eliminar="' + idx + '">Eliminar</button></div>' +
        "</div>";
    });
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
  const texto = $("texto").value.trim();
  const tema = tema_del_formulario();
  const etiqueta = $("etiqueta").value.trim();
  if (!nombre && !texto) { aviso("Escribe un nombre y/o texto."); return; }
  const arr = await leer();
  const idx = arr.findIndex((p) => (p.nombre || "").toLowerCase() === nombre.toLowerCase() && nombre);
  if (idx >= 0) arr[idx] = { nombre, texto, tema, etiqueta }; else arr.push({ nombre, texto, tema, etiqueta });
  await guardar(arr);
  $("nombre").value = ""; $("texto").value = ""; $("etiqueta").value = "";
  reset_campos_tema();
  aviso("✓ Guardada");
  pintar();
});

$("limpiar").addEventListener("click", () => {
  $("nombre").value = ""; $("texto").value = ""; $("etiqueta").value = "";
  reset_campos_tema();
});

$("filtro_tema").addEventListener("change", pintar);

$("lista").addEventListener("click", async (e) => {
  const arr = await leer();
  const c = e.target.getAttribute("data-copiar");
  const ed = e.target.getAttribute("data-editar");
  const el = e.target.getAttribute("data-eliminar");
  if (c !== null) { copiar((arr[+c] || {}).texto || ""); return; }
  if (ed !== null) {
    const p = arr[+ed] || {};
    $("nombre").value = p.nombre || ""; $("texto").value = p.texto || "";
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

(async () => {
  await migrar();
  await pintar();
  // Al abrir, el select arranca en "Nuevo…": muestra la caja para poder escribir.
  actualizar_visibilidad_tema_nuevo();
})();
