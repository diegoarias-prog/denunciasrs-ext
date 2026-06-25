// ============================================================================
//  Plantillas reutilizables: crear, guardar (chrome.storage.local), copiar y
//  eliminar. Pensado para reutilizar textos en las denuncias.
// ============================================================================
const $ = (id) => document.getElementById(id);
const CLAVE = "plantillas";

function aviso(t) { $("aviso").textContent = t; setTimeout(() => ($("aviso").textContent = ""), 2500); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

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

async function pintar() {
  const arr = await leer();
  const lista = $("lista");
  if (!arr.length) { lista.innerHTML = '<p class="vacio">Aún no hay plantillas guardadas.</p>'; return; }
  lista.innerHTML = "";
  arr.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML =
      '<div class="tit">' + esc(p.nombre || "(sin nombre)") + "</div>" +
      '<div class="txt">' + esc(p.texto || "") + "</div>" +
      '<div class="acc"><button class="boton mini" data-copiar="' + i + '">Copiar</button>' +
      '<button class="boton mini sec" data-editar="' + i + '">Editar</button>' +
      '<button class="boton del mini" data-eliminar="' + i + '">Eliminar</button></div>';
    lista.appendChild(div);
  });
}

$("guardar").addEventListener("click", async () => {
  const nombre = $("nombre").value.trim();
  const texto = $("texto").value.trim();
  if (!nombre && !texto) { aviso("Escribe un nombre y/o texto."); return; }
  const arr = await leer();
  const idx = arr.findIndex((p) => p.nombre.toLowerCase() === nombre.toLowerCase() && nombre);
  if (idx >= 0) arr[idx] = { nombre, texto }; else arr.push({ nombre, texto });
  await guardar(arr);
  $("nombre").value = ""; $("texto").value = "";
  aviso("✓ Guardada");
  pintar();
});

$("limpiar").addEventListener("click", () => { $("nombre").value = ""; $("texto").value = ""; });

$("lista").addEventListener("click", async (e) => {
  const arr = await leer();
  const c = e.target.getAttribute("data-copiar");
  const ed = e.target.getAttribute("data-editar");
  const el = e.target.getAttribute("data-eliminar");
  if (c !== null) { copiar(arr[+c].texto || ""); return; }
  if (ed !== null) { $("nombre").value = arr[+ed].nombre; $("texto").value = arr[+ed].texto; window.scrollTo(0, 0); return; }
  if (el !== null) {
    if (!confirm('¿Eliminar la plantilla "' + (arr[+el].nombre || "") + '"?')) return;
    arr.splice(+el, 1); await guardar(arr); pintar();
  }
});

pintar();
