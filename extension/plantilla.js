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

// Minúsculas + sin acentos, para buscar sin distinguir tildes.
function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

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

// Rellena el <datalist> con los temas ya usados (para reutilizarlos al escribir).
function llenar_datalist_temas(arr) {
  const temas = [...new Set(arr.map((p) => (p.tema || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  $("lista_temas").innerHTML = temas.map((t) => '<option value="' + esc(t) + '"></option>').join("");
}

function coincide_busqueda(p, q) {
  if (!q) return true;
  const campos = normalizar((p.tema || "") + " " + (p.etiqueta || "") + " " + (p.nombre || ""));
  return campos.includes(q);
}

async function pintar() {
  const arr = await leer();
  llenar_datalist_temas(arr);
  const lista = $("lista");
  if (!arr.length) { lista.innerHTML = '<p class="vacio">Aún no hay plantillas guardadas.</p>'; return; }

  const q = normalizar($("buscar").value.trim());

  // Agrupar por tema conservando SIEMPRE el índice real dentro de arr (idx),
  // que es el que se usa en los data-attributes para copiar/editar/eliminar.
  const grupos = new Map();
  arr.forEach((p, idx) => {
    if (!coincide_busqueda(p, q)) return;
    const tema = (p.tema && String(p.tema).trim()) ? String(p.tema).trim() : SIN_TEMA;
    if (!grupos.has(tema)) grupos.set(tema, []);
    grupos.get(tema).push({ p, idx });
  });

  if (!grupos.size) { lista.innerHTML = '<p class="vacio">No hay plantillas que coincidan con la búsqueda.</p>'; return; }

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

$("guardar").addEventListener("click", async () => {
  const nombre = $("nombre").value.trim();
  const texto = $("texto").value.trim();
  const tema = $("tema").value.trim();
  const etiqueta = $("etiqueta").value.trim();
  if (!nombre && !texto) { aviso("Escribe un nombre y/o texto."); return; }
  const arr = await leer();
  const idx = arr.findIndex((p) => (p.nombre || "").toLowerCase() === nombre.toLowerCase() && nombre);
  if (idx >= 0) arr[idx] = { nombre, texto, tema, etiqueta }; else arr.push({ nombre, texto, tema, etiqueta });
  await guardar(arr);
  $("nombre").value = ""; $("texto").value = ""; $("tema").value = ""; $("etiqueta").value = "";
  aviso("✓ Guardada");
  pintar();
});

$("limpiar").addEventListener("click", () => {
  $("nombre").value = ""; $("texto").value = ""; $("tema").value = ""; $("etiqueta").value = "";
});

$("buscar").addEventListener("input", pintar);

$("lista").addEventListener("click", async (e) => {
  const arr = await leer();
  const c = e.target.getAttribute("data-copiar");
  const ed = e.target.getAttribute("data-editar");
  const el = e.target.getAttribute("data-eliminar");
  if (c !== null) { copiar((arr[+c] || {}).texto || ""); return; }
  if (ed !== null) {
    const p = arr[+ed] || {};
    $("nombre").value = p.nombre || ""; $("texto").value = p.texto || "";
    $("tema").value = p.tema || ""; $("etiqueta").value = p.etiqueta || "";
    window.scrollTo(0, 0); return;
  }
  if (el !== null) {
    if (!confirm('¿Eliminar la plantilla "' + ((arr[+el] || {}).nombre || "") + '"?')) return;
    arr.splice(+el, 1); await guardar(arr); pintar();
  }
});

(async () => { await migrar(); pintar(); })();
