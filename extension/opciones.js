// ============================================================================
//  Editor de marcas (diseño de TARJETAS + buscador).
//  Combina las marcas base (window.MARCAS_BASE) con las guardadas por el usuario
//  en chrome.storage.local y guarda los cambios (país, correo, sitio, tiktok,
//  play, appstore, dominio, teléfono, registro) de vuelta en chrome.storage.local.
//  La semántica de carga/guardado es IDÉNTICA a la versión de tabla anterior:
//    - Combina POR CAMPO: lo guardado no vacío tiene prioridad; los campos nuevos
//      de la base (p.ej. tiktok) no se pierden aunque exista una copia vieja.
//    - marcas_eliminadas = marcas de MARCAS_BASE que el usuario quitó de la UI.
// ============================================================================

const rejilla_de_marcas   = document.getElementById("rejilla_de_marcas");
const sin_resultados       = document.getElementById("sin_resultados_de_marcas");
const buscador_de_marcas   = document.getElementById("buscador_de_marcas");
const contador_de_marcas   = document.getElementById("contador_de_marcas");
const aviso_de_guardado    = document.getElementById("aviso_de_guardado");

// Escapa comillas y "<" para no romper el HTML / evitar inyección en atributos.
function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Orden y agrupación de los campos que se muestran/guardan en cada tarjeta.
// clave = clave real en el objeto de la marca (la misma que se guarda).
const SECCIONES_DE_MARCA = [
  { titulo: "📇 Contacto", campos: [
    { clave: "pais",     etiqueta: "🌎 País",           tipo: "text", placeholder: "Ej. Guatemala" },
    { clave: "correo",   etiqueta: "✉️ Correo",          tipo: "text", placeholder: "correo@dominio.com" },
    { clave: "telefono", etiqueta: "☎️ Teléfono",        tipo: "text", placeholder: "Sin código de país" },
  ]},
  { titulo: "🌐 Perfiles oficiales", campos: [
    { clave: "sitio",    etiqueta: "🌐 Sitio (opcional)", tipo: "text", placeholder: "https://…" },
    { clave: "tiktok",   etiqueta: "🎵 TikTok oficial",   tipo: "text", placeholder: "https://www.tiktok.com/@marca" },
    { clave: "dominio",  etiqueta: "🔗 Dominio",          tipo: "text", placeholder: "Ej. credix.com" },
  ]},
  { titulo: "📱 Apps", campos: [
    { clave: "play",     etiqueta: "▶️ Play Store",       tipo: "text", placeholder: "https://play.google.com/…" },
    { clave: "appstore", etiqueta: "🍎 App Store",        tipo: "text", placeholder: "https://apps.apple.com/…" },
  ]},
  { titulo: "⚖️ Legal", campos: [
    { clave: "registro", etiqueta: "⚖️ N.º de registro",  tipo: "text", placeholder: "N.º de marca registrada" },
  ]},
];

// Todas las claves de datos que maneja una marca (para reconstruir al guardar).
const CLAVES_DE_MARCA = SECCIONES_DE_MARCA.reduce(
  (acc, sec) => acc.concat(sec.campos.map((c) => c.clave)), []);

// Devuelve la inicial (mayúscula) del nombre o un emoji si está vacío.
function inicial_de_marca(nombre) {
  const limpio = String(nombre || "").trim();
  return limpio ? limpio.charAt(0).toUpperCase() : "🏦";
}

// ---------------------------------------------------------------------------
//  Construye una TARJETA de marca. Los valores se asignan por PROPIEDAD (.value),
//  nunca por innerHTML, así ningún dato del usuario puede romper el HTML.
// ---------------------------------------------------------------------------
function crear_tarjeta_de_marca(nombre, datos) {
  datos = datos || {};
  const tarjeta = document.createElement("div");
  tarjeta.className = "tarjeta_de_marca";

  // --- Cabecera: avatar + nombre editable + país ---
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera_de_tarjeta";

  const avatar = document.createElement("div");
  avatar.className = "avatar_de_marca";
  avatar.textContent = inicial_de_marca(nombre);

  const datosCabecera = document.createElement("div");
  datosCabecera.className = "datos_cabecera_de_marca";

  const entradaNombre = document.createElement("input");
  entradaNombre.type = "text";
  entradaNombre.className = "nombre_de_marca";
  entradaNombre.setAttribute("data-campo", "marca");
  entradaNombre.setAttribute("aria-label", "Nombre de la marca");
  entradaNombre.placeholder = "Nombre de la marca";
  entradaNombre.value = nombre || "";

  const paisCabecera = document.createElement("div");
  paisCabecera.className = "pais_cabecera_de_marca";
  paisCabecera.textContent = datos.pais || "Sin país";

  datosCabecera.appendChild(entradaNombre);
  datosCabecera.appendChild(paisCabecera);
  cabecera.appendChild(avatar);
  cabecera.appendChild(datosCabecera);

  // El avatar y el nombre de la cabecera se actualizan al teclear.
  entradaNombre.addEventListener("input", () => {
    avatar.textContent = inicial_de_marca(entradaNombre.value);
  });

  // --- Cuerpo: secciones con sus campos ---
  const cuerpo = document.createElement("div");
  cuerpo.className = "cuerpo_de_tarjeta";

  SECCIONES_DE_MARCA.forEach((sec) => {
    const bloque = document.createElement("div");
    bloque.className = "seccion_de_tarjeta";

    const titulo = document.createElement("div");
    titulo.className = "titulo_de_seccion";
    titulo.textContent = sec.titulo;
    bloque.appendChild(titulo);

    sec.campos.forEach((campo) => {
      const grupo = document.createElement("div");
      grupo.className = "campo_de_marca";

      const idCampo = "campo_" + campo.clave + "_" + Math.random().toString(36).slice(2, 8);

      const etiqueta = document.createElement("label");
      etiqueta.className = "etiqueta_de_campo";
      etiqueta.textContent = campo.etiqueta;
      etiqueta.setAttribute("for", idCampo);

      const entrada = document.createElement("input");
      entrada.type = campo.tipo || "text";
      entrada.className = "entrada_de_campo";
      entrada.id = idCampo;
      entrada.setAttribute("data-campo", campo.clave);
      entrada.placeholder = campo.placeholder || "";
      entrada.value = datos[campo.clave] || "";

      // El país escrito se refleja en la cabecera y en el buscador.
      if (campo.clave === "pais") {
        entrada.addEventListener("input", () => {
          paisCabecera.textContent = entrada.value.trim() || "Sin país";
        });
      }

      grupo.appendChild(etiqueta);
      grupo.appendChild(entrada);
      bloque.appendChild(grupo);
    });

    cuerpo.appendChild(bloque);
  });

  // --- Pie: botón Quitar ---
  const pie = document.createElement("div");
  pie.className = "pie_de_tarjeta";
  const botonQuitar = document.createElement("button");
  botonQuitar.type = "button";
  botonQuitar.className = "boton_de_marca quitar";
  botonQuitar.textContent = "Quitar";
  botonQuitar.addEventListener("click", () => {
    tarjeta.remove();
    aplicar_filtro_de_marcas();
  });
  pie.appendChild(botonQuitar);

  tarjeta.appendChild(cabecera);
  tarjeta.appendChild(cuerpo);
  tarjeta.appendChild(pie);
  return tarjeta;
}

// ---------------------------------------------------------------------------
//  Filtro EN VIVO por nombre de marca y por país.
// ---------------------------------------------------------------------------
function aplicar_filtro_de_marcas() {
  const texto = (buscador_de_marcas.value || "").trim().toLowerCase();
  const tarjetas = rejilla_de_marcas.querySelectorAll(".tarjeta_de_marca");
  let visibles = 0;
  tarjetas.forEach((t) => {
    const nombre = (t.querySelector('[data-campo="marca"]').value || "").toLowerCase();
    const pais   = (t.querySelector('[data-campo="pais"]').value || "").toLowerCase();
    const coincide = !texto || nombre.indexOf(texto) !== -1 || pais.indexOf(texto) !== -1;
    t.style.display = coincide ? "" : "none";
    if (coincide) visibles++;
  });
  sin_resultados.style.display = (tarjetas.length && visibles === 0) ? "block" : "none";
  actualizar_contador_de_marcas(visibles, tarjetas.length);
}

function actualizar_contador_de_marcas(visibles, total) {
  if (total === visibles) {
    contador_de_marcas.textContent = total + (total === 1 ? " marca" : " marcas");
  } else {
    contador_de_marcas.textContent = visibles + " de " + total + " marcas";
  }
}

// ---------------------------------------------------------------------------
//  Carga: combina la base con lo guardado (misma semántica que la tabla previa).
// ---------------------------------------------------------------------------
async function cargar_marcas() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas  = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];

  // Combina POR CAMPO: lo guardado no vacío tiene prioridad; los campos nuevos
  // de la base (p.ej. tiktok) no se pierden aunque exista una copia vieja.
  const todas = Object.assign({}, window.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    const base = window.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => { if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k]; });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);

  rejilla_de_marcas.innerHTML = "";
  Object.keys(todas).sort().forEach((m) =>
    rejilla_de_marcas.appendChild(crear_tarjeta_de_marca(m, todas[m])));
  aplicar_filtro_de_marcas();
}

// ---------------------------------------------------------------------------
//  Agregar una tarjeta vacía nueva y hacer scroll hasta ella.
// ---------------------------------------------------------------------------
function agregar_marca_vacia() {
  const vacia = {};
  CLAVES_DE_MARCA.forEach((k) => { vacia[k] = ""; });
  const tarjeta = crear_tarjeta_de_marca("", vacia);
  rejilla_de_marcas.appendChild(tarjeta);
  // Se ignora el filtro para la nueva tarjeta: se muestra y se enfoca.
  buscador_de_marcas.value = "";
  aplicar_filtro_de_marcas();
  tarjeta.scrollIntoView({ behavior: "smooth", block: "center" });
  const nombre = tarjeta.querySelector('[data-campo="marca"]');
  if (nombre) nombre.focus();
}

// ---------------------------------------------------------------------------
//  Guardar: reconstruye el objeto de marcas desde la UI (incluye tiktok) y
//  calcula marcas_eliminadas. Semántica IDÉNTICA a la versión anterior.
// ---------------------------------------------------------------------------
function guardar_marcas() {
  const marcas = {};
  rejilla_de_marcas.querySelectorAll(".tarjeta_de_marca").forEach((tarjeta) => {
    const v = (c) => {
      const el = tarjeta.querySelector('[data-campo="' + c + '"]');
      return el ? el.value.trim() : "";
    };
    const nombre = v("marca");
    if (!nombre) return;
    const registro = {};
    CLAVES_DE_MARCA.forEach((k) => { registro[k] = v(k); });
    marcas[nombre] = registro;
  });

  // Marcas BASE que el usuario quitó de la UI = eliminadas (no reaparecen).
  const eliminadas = Object.keys(window.MARCAS_BASE).filter((n) => !(n in marcas));

  chrome.storage.local.set({ marcas_usuario: marcas, marcas_eliminadas: eliminadas }, () => {
    aviso_de_guardado.textContent = "✓ Guardado (" + Object.keys(marcas).length + " marcas).";
    setTimeout(() => (aviso_de_guardado.textContent = ""), 2500);
  });
}

// ---------------------------------------------------------------------------
//  Eventos.
// ---------------------------------------------------------------------------
buscador_de_marcas.addEventListener("input", aplicar_filtro_de_marcas);
document.getElementById("boton_agregar_marca").addEventListener("click", agregar_marca_vacia);
document.getElementById("boton_guardar_marcas").addEventListener("click", guardar_marcas);

cargar_marcas();
