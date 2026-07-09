// ============================================================================
//  Editor de marcas (diseño de MENÚ DESPLEGABLE + panel de UNA sola marca).
//
//  Cómo funciona la navegación:
//   - Arriba hay un <select> que lista TODAS las marcas por nombre (alfabético)
//     más la opción especial "➕ Agregar marca nueva…".
//   - Al elegir una marca, debajo se muestra/edita SOLO esa marca en un panel
//     amplio con todos sus campos. No hay buscador ni scroll de tarjetas.
//   - Al elegir "➕ Agregar marca nueva…", el panel sale VACÍO para llenarlo.
//
//  Diccionario en MEMORIA (clave del diseño, NO perder ediciones):
//   Como solo se muestra UNA marca a la vez, NO se puede reconstruir todas las
//   marcas desde el DOM al guardar. Por eso mantenemos el diccionario COMPLETO
//   de marcas en la variable `marcas_en_memoria`, cargado al inicio.
//     • Al CAMBIAR de marca en el desplegable, primero VOLCAMOS los valores del
//       panel visible a `marcas_en_memoria` (función volcar_panel_a_memoria) y
//       LUEGO cargamos la nueva marca. Así no se pierden ediciones sin guardar.
//     • "Guardar cambios" persiste TODO `marcas_en_memoria` (todas las marcas),
//       no solo la visible.
//
//  Semántica de persistencia (IDÉNTICA a la versión anterior de tarjetas):
//     - Cargar: combina window.MARCAS_BASE con lo guardado en chrome.storage
//       (marcas_usuario, marcas_eliminadas) COMBINANDO POR CAMPO: lo guardado no
//       vacío tiene prioridad; los campos nuevos de la base no se pierden.
//     - Guardar: marcas_usuario = diccionario completo; marcas_eliminadas =
//       marcas de MARCAS_BASE que ya no existen.
//
//  Seguridad: todo el render es por DOM (createElement + .value/.textContent),
//  NUNCA innerHTML con datos del usuario.
// ============================================================================

const selector_de_marcas   = document.getElementById("selector_de_marcas");
const contenedor_del_panel = document.getElementById("contenedor_del_panel");
const aviso_de_guardado    = document.getElementById("aviso_de_guardado");

// Valor centinela para la opción "➕ Agregar marca nueva…" del desplegable.
const OPCION_NUEVA_MARCA = "__NUEVA_MARCA__";

// ---------------------------------------------------------------------------
//  Estado en memoria.
// ---------------------------------------------------------------------------
// Diccionario COMPLETO de marcas { "Nombre": { pais, correo, ... } }.
let marcas_en_memoria = {};
// Clave (nombre) de la marca que se está mostrando en el panel.
// null = panel en modo "marca nueva" (aún no existe en el diccionario).
let clave_en_edicion = null;

// Orden y agrupación de los campos que se muestran/guardan en el panel.
// clave = clave real en el objeto de la marca (la misma que se guarda).
const SECCIONES_DE_MARCA = [
  { titulo: "📇 Contacto", campos: [
    { clave: "pais",      etiqueta: "🌎 País",          placeholder: "Ej. Guatemala" },
    { clave: "correo",    etiqueta: "✉️ Correo",         placeholder: "correo@dominio.com" },
    { clave: "telefono",  etiqueta: "☎️ Teléfono",       placeholder: "Sin código de país" },
  ]},
  { titulo: "🌐 Perfiles oficiales", campos: [
    { clave: "sitio",     etiqueta: "🌐 Sitio (opcional)",  placeholder: "https://…" },
    { clave: "tiktok",    etiqueta: "🎵 TikTok oficial",    placeholder: "https://www.tiktok.com/@marca" },
    { clave: "facebook",  etiqueta: "📘 Facebook oficial",  placeholder: "https://www.facebook.com/marca" },
    { clave: "instagram", etiqueta: "📷 Instagram oficial", placeholder: "https://www.instagram.com/marca" },
    { clave: "x",         etiqueta: "✖️ X (Twitter) oficial", placeholder: "https://x.com/marca" },
    { clave: "youtube",   etiqueta: "▶️ YouTube oficial",   placeholder: "https://www.youtube.com/@marca" },
    { clave: "linkedin",  etiqueta: "💼 LinkedIn oficial",  placeholder: "https://www.linkedin.com/company/marca" },
    { clave: "dominio",   etiqueta: "🔗 Dominio",           placeholder: "Ej. credix.com" },
  ]},
  { titulo: "📱 Apps", campos: [
    { clave: "play",      etiqueta: "▶️ Play Store",     placeholder: "https://play.google.com/…" },
    { clave: "appstore",  etiqueta: "🍎 App Store",      placeholder: "https://apps.apple.com/…" },
  ]},
  { titulo: "⚖️ Legal", campos: [
    { clave: "registro",  etiqueta: "⚖️ N.º de registro", placeholder: "N.º de marca registrada" },
    { clave: "tmurl",     etiqueta: "🔗 Enlace al registro (TM_URL)", placeholder: "https://branddb.wipo.int/…" },
  ]},
];

// Todas las claves de datos que maneja una marca (para reconstruir al guardar).
// NO incluye "marca" (el nombre), que se maneja aparte como clave del diccionario.
const CLAVES_DE_MARCA = SECCIONES_DE_MARCA.reduce(
  (acc, sec) => acc.concat(sec.campos.map((c) => c.clave)), []);

// Devuelve la inicial (mayúscula) del nombre o un emoji si está vacío.
function inicial_de_marca(nombre) {
  const limpio = String(nombre || "").trim();
  return limpio ? limpio.charAt(0).toUpperCase() : "🏦";
}

// ---------------------------------------------------------------------------
//  Rellena el <select> con las marcas (alfabético) + "➕ Agregar marca nueva…".
//  `clave_a_seleccionar` = nombre de la marca a dejar seleccionada, o
//  OPCION_NUEVA_MARCA para dejar seleccionada la opción de agregar.
// ---------------------------------------------------------------------------
function poblar_desplegable_de_marcas(clave_a_seleccionar) {
  selector_de_marcas.textContent = ""; // limpia opciones anteriores (sin innerHTML)

  // Opción especial al inicio: agregar marca nueva.
  const opcionNueva = document.createElement("option");
  opcionNueva.value = OPCION_NUEVA_MARCA;
  opcionNueva.textContent = "➕ Agregar marca nueva…";
  selector_de_marcas.appendChild(opcionNueva);

  // Marcas existentes en orden alfabético.
  Object.keys(marcas_en_memoria).sort((a, b) => a.localeCompare(b, "es")).forEach((nombre) => {
    const opcion = document.createElement("option");
    opcion.value = nombre;          // el valor es el nombre exacto de la marca
    opcion.textContent = nombre;    // por .textContent, nunca innerHTML
    selector_de_marcas.appendChild(opcion);
  });

  // Deja seleccionada la marca indicada (o la opción de agregar).
  selector_de_marcas.value =
    (clave_a_seleccionar == null) ? OPCION_NUEVA_MARCA : clave_a_seleccionar;
}

// ---------------------------------------------------------------------------
//  Construye y muestra el PANEL de UNA marca.
//   `clave` = nombre de la marca existente a mostrar, o null para "marca nueva".
//  Deja actualizada `clave_en_edicion`.
//  Los valores se asignan por PROPIEDAD (.value), nunca por innerHTML.
// ---------------------------------------------------------------------------
function mostrar_marca_en_panel(clave) {
  clave_en_edicion = clave;
  const datos = (clave != null && marcas_en_memoria[clave]) ? marcas_en_memoria[clave] : {};
  const nombre = (clave != null) ? clave : "";

  contenedor_del_panel.textContent = ""; // limpia el panel anterior

  const panel = document.createElement("div");
  panel.className = "panel_de_marca";

  // --- Cabecera: avatar + nombre editable + país ---
  const cabecera = document.createElement("div");
  cabecera.className = "cabecera_del_panel";

  const avatar = document.createElement("div");
  avatar.className = "avatar_de_marca";
  avatar.textContent = inicial_de_marca(nombre);

  const datosCabecera = document.createElement("div");
  datosCabecera.className = "datos_cabecera_del_panel";

  const etiquetaNombre = document.createElement("label");
  etiquetaNombre.className = "etiqueta_nombre_de_marca";
  etiquetaNombre.textContent = "Nombre de la marca";
  etiquetaNombre.setAttribute("for", "entrada_nombre_de_marca");

  const entradaNombre = document.createElement("input");
  entradaNombre.type = "text";
  entradaNombre.id = "entrada_nombre_de_marca";
  entradaNombre.className = "nombre_de_marca";
  entradaNombre.setAttribute("data-campo", "marca");
  entradaNombre.setAttribute("aria-label", "Nombre de la marca");
  entradaNombre.placeholder = "Nombre de la marca";
  entradaNombre.value = nombre;

  const paisCabecera = document.createElement("div");
  paisCabecera.className = "pais_cabecera_de_marca";
  paisCabecera.textContent = datos.pais || "Sin país";

  datosCabecera.appendChild(etiquetaNombre);
  datosCabecera.appendChild(entradaNombre);
  datosCabecera.appendChild(paisCabecera);
  cabecera.appendChild(avatar);
  cabecera.appendChild(datosCabecera);

  // El avatar se actualiza al teclear el nombre.
  entradaNombre.addEventListener("input", () => {
    avatar.textContent = inicial_de_marca(entradaNombre.value);
  });

  // --- Cuerpo: secciones con sus campos ---
  const cuerpo = document.createElement("div");
  cuerpo.className = "cuerpo_del_panel";

  SECCIONES_DE_MARCA.forEach((sec) => {
    const bloque = document.createElement("div");
    bloque.className = "seccion_del_panel";

    const titulo = document.createElement("div");
    titulo.className = "titulo_de_seccion";
    titulo.textContent = sec.titulo;
    bloque.appendChild(titulo);

    const rejillaCampos = document.createElement("div");
    rejillaCampos.className = "campos_de_seccion";

    sec.campos.forEach((campo) => {
      const grupo = document.createElement("div");
      grupo.className = "campo_de_marca";

      const idCampo = "campo_" + campo.clave;

      const etiqueta = document.createElement("label");
      etiqueta.className = "etiqueta_de_campo";
      etiqueta.textContent = campo.etiqueta;
      etiqueta.setAttribute("for", idCampo);

      const entrada = document.createElement("input");
      entrada.type = "text";
      entrada.className = "entrada_de_campo";
      entrada.id = idCampo;
      entrada.setAttribute("data-campo", campo.clave);
      entrada.placeholder = campo.placeholder || "";
      entrada.value = datos[campo.clave] || "";

      // El país escrito se refleja en la cabecera.
      if (campo.clave === "pais") {
        entrada.addEventListener("input", () => {
          paisCabecera.textContent = entrada.value.trim() || "Sin país";
        });
      }

      grupo.appendChild(etiqueta);
      grupo.appendChild(entrada);
      rejillaCampos.appendChild(grupo);
    });

    bloque.appendChild(rejillaCampos);
    cuerpo.appendChild(bloque);
  });

  panel.appendChild(cabecera);
  panel.appendChild(cuerpo);
  contenedor_del_panel.appendChild(panel);

  if (clave == null) entradaNombre.focus(); // en "marca nueva", enfoca el nombre
}

// ---------------------------------------------------------------------------
//  VOLCAR: guarda los valores del panel visible en `marcas_en_memoria`.
//  Se llama ANTES de cambiar de marca (para no perder ediciones sin guardar) y
//  también al guardar. Maneja el RENOMBRADO: si el nombre cambió respecto a
//  `clave_en_edicion`, elimina la clave antigua del diccionario.
//  Devuelve el nombre bajo el que quedó guardada la marca, o null si el panel
//  no tenía nombre (marca nueva vacía => no se agrega nada).
// ---------------------------------------------------------------------------
function volcar_panel_a_memoria() {
  const entradaNombre = contenedor_del_panel.querySelector('[data-campo="marca"]');
  if (!entradaNombre) return clave_en_edicion; // no hay panel construido aún

  const nombre = entradaNombre.value.trim();

  // Reconstruye el registro de la marca desde los campos del panel.
  const registro = {};
  CLAVES_DE_MARCA.forEach((k) => {
    const el = contenedor_del_panel.querySelector('[data-campo="' + k + '"]');
    registro[k] = el ? el.value.trim() : "";
  });

  // Si se renombró la marca, quita la clave antigua para no duplicar.
  if (clave_en_edicion != null && clave_en_edicion !== nombre) {
    delete marcas_en_memoria[clave_en_edicion];
  }

  // Solo se agrega/actualiza si hay nombre (una marca sin nombre no existe).
  if (nombre) {
    marcas_en_memoria[nombre] = registro;
    return nombre;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Serializa TODO el diccionario en memoria y lo persiste en chrome.storage.
//  marcas_eliminadas = marcas de MARCAS_BASE que ya no existen en memoria.
// ---------------------------------------------------------------------------
function persistir_en_storage(callback) {
  const marcas = {};
  Object.keys(marcas_en_memoria).forEach((nombre) => {
    const origen = marcas_en_memoria[nombre] || {};
    const registro = {};
    CLAVES_DE_MARCA.forEach((k) => { registro[k] = origen[k] != null ? origen[k] : ""; });
    marcas[nombre] = registro;
  });

  // Marcas BASE que ya no existen en memoria = eliminadas (no reaparecen).
  const eliminadas = Object.keys(window.MARCAS_BASE).filter((n) => !(n in marcas));

  chrome.storage.local.set({ marcas_usuario: marcas, marcas_eliminadas: eliminadas }, () => {
    if (typeof callback === "function") callback(Object.keys(marcas).length);
  });
}

// Muestra un aviso breve en la barra inferior.
function mostrar_aviso(texto, es_error) {
  aviso_de_guardado.textContent = texto;
  aviso_de_guardado.className = "aviso_de_guardado " + (es_error ? "error" : "correcto");
  clearTimeout(mostrar_aviso._t);
  mostrar_aviso._t = setTimeout(() => { aviso_de_guardado.textContent = ""; }, 2800);
}

// ---------------------------------------------------------------------------
//  Carga inicial: combina la base con lo guardado (misma semántica de siempre)
//  y llena el diccionario en memoria + el desplegable + el panel.
// ---------------------------------------------------------------------------
async function cargar_marcas() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas  = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];

  // Combina POR CAMPO: lo guardado no vacío tiene prioridad; los campos nuevos
  // de la base (p.ej. facebook, instagram, x, youtube, linkedin) no se pierden
  // aunque exista una copia vieja guardada.
  const todas = Object.assign({}, window.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    const base = window.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => { if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k]; });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);

  marcas_en_memoria = todas;

  // Selecciona la primera marca (alfabético) o el modo "marca nueva" si no hay.
  const primeras = Object.keys(marcas_en_memoria).sort((a, b) => a.localeCompare(b, "es"));
  const inicial = primeras.length ? primeras[0] : null;
  poblar_desplegable_de_marcas(inicial);
  mostrar_marca_en_panel(inicial);
}

// ---------------------------------------------------------------------------
//  Cambio de marca en el desplegable:
//   1) VOLCAR el panel actual a memoria (no perder ediciones sin guardar).
//   2) Refrescar el desplegable (por si el volcado renombró una marca).
//   3) Mostrar la marca elegida (o el panel vacío de "marca nueva").
// ---------------------------------------------------------------------------
function al_cambiar_de_marca() {
  const elegido = selector_de_marcas.value;

  // 1) Guardar en memoria lo que había en el panel visible.
  volcar_panel_a_memoria();

  // 2 y 3) Determinar destino y refrescar UI.
  const destino = (elegido === OPCION_NUEVA_MARCA) ? null : elegido;
  poblar_desplegable_de_marcas(destino);
  mostrar_marca_en_panel(destino);
}

// ---------------------------------------------------------------------------
//  Guardar cambios: vuelca el panel, persiste TODO el diccionario y refresca
//  el desplegable manteniendo seleccionada la marca vigente.
// ---------------------------------------------------------------------------
function guardar_cambios_de_marca() {
  const entradaNombre = contenedor_del_panel.querySelector('[data-campo="marca"]');
  const nombre = entradaNombre ? entradaNombre.value.trim() : "";
  if (!nombre) {
    mostrar_aviso("Escribe un nombre para la marca antes de guardar.", true);
    if (entradaNombre) entradaNombre.focus();
    return;
  }

  // Vuelca el panel visible a memoria (puede crear o renombrar la marca).
  const nombreGuardado = volcar_panel_a_memoria();
  clave_en_edicion = nombreGuardado;

  // Persiste TODAS las marcas del diccionario en memoria.
  persistir_en_storage((total) => {
    mostrar_aviso("✓ Guardado (" + total + " marcas).", false);
  });

  // Refresca el desplegable dejando seleccionada la marca vigente.
  poblar_desplegable_de_marcas(clave_en_edicion);
  mostrar_marca_en_panel(clave_en_edicion);
}

// ---------------------------------------------------------------------------
//  Quitar esta marca: elimina la marca seleccionada del diccionario, persiste
//  y muestra la siguiente marca disponible (o el panel de "marca nueva").
// ---------------------------------------------------------------------------
function quitar_marca_seleccionada() {
  // Si estamos en "marca nueva" (aún sin guardar), no hay nada que quitar:
  // simplemente se limpia el panel.
  if (clave_en_edicion == null) {
    mostrar_marca_en_panel(null);
    return;
  }

  const nombre = clave_en_edicion;
  const confirmar = window.confirm('¿Quitar la marca "' + nombre + '"? Esta acción se guarda al instante.');
  if (!confirmar) return;

  delete marcas_en_memoria[nombre];

  // Persiste el diccionario sin esa marca.
  persistir_en_storage((total) => {
    mostrar_aviso('✓ Marca "' + nombre + '" quitada.', false);
  });

  // Muestra la primera marca restante (o el modo "marca nueva").
  const restantes = Object.keys(marcas_en_memoria).sort((a, b) => a.localeCompare(b, "es"));
  const siguiente = restantes.length ? restantes[0] : null;
  poblar_desplegable_de_marcas(siguiente);
  mostrar_marca_en_panel(siguiente);
}

// ---------------------------------------------------------------------------
//  Eventos.
// ---------------------------------------------------------------------------
selector_de_marcas.addEventListener("change", al_cambiar_de_marca);
document.getElementById("boton_guardar_marcas").addEventListener("click", guardar_cambios_de_marca);
document.getElementById("boton_quitar_marca").addEventListener("click", quitar_marca_seleccionada);

cargar_marcas();
