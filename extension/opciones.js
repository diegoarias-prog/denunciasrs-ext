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
//  CORREOS DE LA MARCA (varios, con orden):
//   Son los correos DESDE LOS QUE se denuncia (el remitente / correo de contacto
//   que se escribe en los formularios y en los correos), NO los destinatarios
//   (esos viven en datos/correos_denuncia.js).
//   Cada marca guarda DOS campos de correo que SIEMPRE van coherentes:
//     • `correos` = array con todos los correos en el orden que eligió el usuario.
//                   El PRIMERO es el principal.
//     • `correo`  = texto con ese primer correo. Se mantiene porque TODO el resto
//                   de la extensión (formularios.js, correo.js, Gmail, background)
//                   lee `datos.correo` y espera UN solo correo.
//   Las marcas viejas solo tienen `correo` (y a veces con varios separados por
//   coma): de ahí se deriva la lista al cargar (ver lista_de_correos_de).
//   OJO: el popup también agrega correos a una marca con su botón "+", con este
//   MISMO formato. Como esta página guarda el diccionario ENTERO, podría pisar lo
//   que el popup escribió mientras estaba abierta: por eso se guarda una foto de
//   los correos conocidos y se conservan los que aparezcan de fuera (ver
//   fusionar_correos_de_fuera). No se agrega ningún campo más al registro.
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
// SIN PROTOTIPO (Object.create(null)): el nombre de la marca es la clave, así que
// un nombre como "__proto__", "toString" o "valueOf" no puede leer ni pisar nada
// heredado de Object.prototype.
let marcas_en_memoria = Object.create(null);
// Clave (nombre) de la marca que se está mostrando en el panel.
// null = panel en modo "marca nueva" (aún no existe en el diccionario).
let clave_en_edicion = null;

// Nombres de marca que NO se admiten: son las claves que ensucian el prototipo.
// background.js los descarta igual al armar el menú del clic derecho, así que
// una marca con ese nombre no funcionaría en el resto de la extensión: mejor
// avisar al usuario que dejarle guardar algo que luego no sirve.
const CLAVES_PELIGROSAS = ["__proto__", "constructor", "prototype"];
// Misma lista para las dos cosas: el nombre de una marca y el nombre de un campo
// dentro del registro, porque en los dos casos acaban siendo claves de un objeto.
function clave_peligrosa(clave) {
  return CLAVES_PELIGROSAS.indexOf(String(clave)) >= 0;
}
function nombre_de_marca_prohibido(nombre) {
  return clave_peligrosa(nombre);
}
// ¿El diccionario tiene ESA marca como propiedad propia? (nunca heredada).
function existe_la_marca(diccionario, nombre) {
  return Object.prototype.hasOwnProperty.call(diccionario || {}, nombre);
}

// Orden y agrupación de los campos que se muestran/guardan en el panel.
// clave = clave real en el objeto de la marca (la misma que se guarda).
// `tipo: "lista_de_correos"` = campo especial que se dibuja como una lista de
// filas (input + subir + bajar + quitar), no como una caja de texto suelta.
const SECCIONES_DE_MARCA = [
  { titulo: "📇 Contacto", campos: [
    { clave: "pais",      etiqueta: "🌎 País",          placeholder: "Ej. Guatemala" },
    { clave: "telefono",  etiqueta: "☎️ Teléfono",       placeholder: "Sin código de país" },
  ]},
  { titulo: "✉️ Correos del remitente", campos: [
    { clave: "correos",   etiqueta: "✉️ Correos desde los que se denuncia", tipo: "lista_de_correos" },
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
    { clave: "clase_bienes", etiqueta: "🏷️ Clase de bienes y servicios", placeholder: "Ej. Negocios financieros, bancarios, de crédito. Negocios Monetarios." },
  ]},
];

// Todas las claves de datos que maneja una marca (para reconstruir al guardar).
// NO incluye "marca" (el nombre), que se maneja aparte como clave del diccionario.
// Se agrega "correo" a mano: ya no se dibuja como campo propio (lo sustituyó la
// lista "correos"), pero SIGUE guardándose porque el resto de la extensión lo lee.
const CLAVES_DE_MARCA = SECCIONES_DE_MARCA.reduce(
  (acc, sec) => acc.concat(sec.campos.map((c) => c.clave)), []).concat(["correo"]);

// Devuelve la inicial (mayúscula) del nombre o un emoji si está vacío.
function inicial_de_marca(nombre) {
  const limpio = String(nombre || "").trim();
  return limpio ? limpio.charAt(0).toUpperCase() : "🏦";
}

// ---------------------------------------------------------------------------
//  CORREOS DE LA MARCA: ayudantes.
// ---------------------------------------------------------------------------

// Deja un correo en limpio: sin caracteres de control (\r, \n, tabuladores…) y
// sin espacios alrededor. Los saltos de línea se quitan SIEMPRE porque este
// correo acaba de remitente en el correo de denuncia, y un "\r\n" ahí permite
// colar cabeceras (inyección de cabeceras de correo).
function limpiar_texto_de_correo(texto) {
  return String(texto == null ? "" : texto).replace(/[\x00-\x1f\x7f]/g, "").trim();
}

// Limpia una lista de correos: parte los que vengan pegados, recorta espacios,
// quita los vacíos y quita los repetidos SIN distinguir mayúsculas (se conserva
// el primero de cada repetido, para respetar el orden que eligió el usuario y no
// cambiarle el principal).
function depurar_lista_de_correos(lista) {
  const vistos = new Set();   // Set y no objeto: un correo tipo "__proto__" no debe romper nada
  const limpia = [];
  (lista || []).forEach((crudo) => {
    // Una sola entrada puede traer VARIOS correos pegados con coma o punto y
    // coma (se pegan de otro sitio, o vienen del campo viejo `correo`). Si no se
    // parten, "yo@marca.com, otro@ajeno.com" se guardaría como UN correo y
    // podría acabar de principal metiendo un segundo destinatario de tapadillo.
    String(crudo == null ? "" : crudo).split(/[,;]+/).forEach((trozo) => {
      const texto = limpiar_texto_de_correo(trozo);
      if (!texto) return;
      const llave = texto.toLowerCase();
      if (vistos.has(llave)) return;
      vistos.add(llave);
      limpia.push(texto);
    });
  });
  return limpia;
}

// Saca la lista de correos de un registro de marca, venga en el formato nuevo
// (`correos` como array) o en el viejo (`correo` como texto, donde a veces hay
// varios separados por coma o punto y coma; los parte depurar_lista_de_correos).
// Si `correos` es un array VACÍO se respeta: significa que el usuario borró
// todos los correos a propósito y NO hay que resucitarlos desde `correo`.
function lista_de_correos_de(datos) {
  const d = datos || {};
  return depurar_lista_de_correos(Array.isArray(d.correos) ? d.correos : [d.correo]);
}

// ---------------------------------------------------------------------------
//  CONVIVENCIA CON OTRAS PARTES DE LA EXTENSIÓN (el "+" del popup, sobre todo).
//  Esta página guarda el diccionario ENTERO, así que sin cuidado pisaría lo que
//  otra parte escribió mientras estaba abierta. Para no hacerlo se guarda una
//  FOTO de las marcas tal como estaban en storage la última vez que las leímos:
//    • lo que cambió fuera y aquí no se tocó  -> se conserva lo de fuera,
//    • lo que aquí se editó o se quitó        -> manda lo de aquí.
//  La foto vive solo en memoria, NUNCA se guarda.
// ---------------------------------------------------------------------------
let marcas_conocidas_de_storage = Object.create(null);
// Bandera para no reaccionar al cambio de storage que provoca esta misma página.
let estamos_guardando = false;

// Rehace la foto entera con lo que hay (o acabamos de dejar) en storage.
function recordar_marcas_conocidas(guardadas) {
  const foto = Object.create(null); // sin prototipo: un nombre de marca raro no rompe nada
  Object.keys(guardadas || {}).forEach((nombre) => {
    if (nombre_de_marca_prohibido(nombre)) return;
    foto[nombre] = Object.assign(Object.create(null), guardadas[nombre] || {});
  });
  marcas_conocidas_de_storage = foto;
}

// Actualiza en la foto SOLO los correos de una marca (se usa cuando el popup
// agrega uno y lo incorporamos al vuelo). El resto de campos de la foto se deja
// intacto a propósito: si alguno cambió fuera y aquí no lo hemos incorporado,
// tiene que seguir viéndose como "cambio de fuera" al guardar.
//   Si la marca todavía NO estaba en la foto (lo normal en una marca de
//   MARCAS_BASE que el usuario nunca editó), se le crea la entrada. Sin esto, un
//   correo agregado por el popup y borrado luego aquí con 🗑 volvería a colarse
//   al guardar, porque sin foto se seguiría viendo como "correo nuevo de fuera".
function recordar_correos_conocidos_de(nombre, guardada) {
  if (nombre_de_marca_prohibido(nombre)) return;
  if (!existe_la_marca(marcas_conocidas_de_storage, nombre)) {
    marcas_conocidas_de_storage[nombre] = Object.create(null);
  }
  const foto = marcas_conocidas_de_storage[nombre];
  foto.correos = lista_de_correos_de(guardada);
  foto.correo  = foto.correos[0] || "";
}

// Añade AL FINAL los correos que otra parte agregó a esta marca y que aquí no
// conocíamos. Al final para no cambiarle al usuario cuál es el principal.
function fusionar_correos_de_fuera(nombre, correos_de_aqui, guardada) {
  const foto = existe_la_marca(marcas_conocidas_de_storage, nombre)
    ? marcas_conocidas_de_storage[nombre] : null;
  const conocidos = new Set(lista_de_correos_de(foto).map((c) => c.toLowerCase()));
  const yaEstan   = new Set(correos_de_aqui.map((c) => c.toLowerCase()));
  const nuevos = lista_de_correos_de(guardada).filter((c) => {
    const llave = c.toLowerCase();
    return !conocidos.has(llave) && !yaEstan.has(llave);
  });
  return nuevos.length ? correos_de_aqui.concat(nuevos) : correos_de_aqui;
}

// Igual que lo anterior pero para el RESTO de campos (M-4): conserva lo que otra
// parte haya escrito en un campo que aquí no se editó. `correos`/`correo` no
// entran: tienen su propia fusión, que respeta el orden y el principal.
function conservar_campos_de_fuera(nombre, registro, guardada) {
  if (!guardada || !existe_la_marca(marcas_conocidas_de_storage, nombre)) return;
  const foto = marcas_conocidas_de_storage[nombre];
  CLAVES_DE_MARCA.forEach((k) => {
    if (k === "correos" || k === "correo") return;
    const de_fuera = guardada[k];
    const de_la_foto = foto[k];
    if (de_fuera === de_la_foto) return;      // fuera no lo tocó: nada que conservar
    if (registro[k] !== de_la_foto) return;   // aquí SÍ se editó: manda lo de aquí
    registro[k] = (de_fuera != null) ? de_fuera : "";
  });
}

// Validación SUAVE de formato: solo sirve para pintar el borde en rojo y avisar.
// Nunca bloquea el guardado (lo dice el pedido del usuario). La lista blanca de
// caracteres deja fuera < > " ' y demás, que no pintan nada en un correo y sí
// sirven para colar cosas donde este texto se reutiliza.
function es_correo_valido(texto) {
  const limpio = limpiar_texto_de_correo(texto);
  if (!limpio || limpio.length > 254) return false;   // 254 = tope real de una dirección
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(limpio);
}

// Pinta (o despinta) de rojo una caja de correo mal escrita. Vacío NO es error:
// las cajas vacías simplemente no se guardan. Si en una caja hay varios correos
// pegados con coma, se revisan todos: al guardar se parten en filas distintas.
function marcar_correo_invalido(entrada) {
  const hay_algo = limpiar_texto_de_correo(entrada.value) !== "";
  const partes = depurar_lista_de_correos([entrada.value]);
  const esta_mal = hay_algo && (!partes.length || !partes.every(es_correo_valido));
  entrada.classList.toggle("correo_invalido", esta_mal);
}

// Lee los correos TAL COMO están escritos en las filas del panel, en orden.
// Devuelve null si el panel no tiene lista construida (así quien llama sabe que
// no debe tocar los correos que ya estaban en memoria).
function leer_correos_del_panel() {
  const contenedorLista = contenedor_del_panel.querySelector('[data-lista="correos"]');
  if (!contenedorLista) return null;
  return Array.from(contenedorLista.querySelectorAll(".entrada_de_correo"))
    .map((entrada) => entrada.value);
}

// ¿Hay alguna caja de correo marcada en rojo en el panel visible?
function hay_correos_invalidos_en_panel() {
  return !!contenedor_del_panel.querySelector(".entrada_de_correo.correo_invalido");
}

// Botón pequeño de una fila de correo (↑, ↓, 🗑) con su texto accesible.
function crear_boton_de_correo(simbolo, descripcion, clase_extra, al_pulsar) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "boton_de_correo" + (clase_extra ? " " + clase_extra : "");
  boton.textContent = simbolo;
  boton.title = descripcion;
  boton.setAttribute("aria-label", descripcion);
  boton.addEventListener("click", al_pulsar);
  return boton;
}

// ---------------------------------------------------------------------------
//  Dibuja TODAS las filas de la lista de correos (se vuelve a llamar entera
//  cada vez que se agrega, quita o reordena: así los índices, la insignia
//  "Principal" y los botones deshabilitados siempre quedan bien).
//   `foco` = { indice, papel } para devolver el cursor donde estaba el usuario
//   tras redibujar ("entrada", "subir" o "bajar").
// ---------------------------------------------------------------------------
function dibujar_filas_de_correos(contenedorLista, correos, foco) {
  contenedorLista.textContent = ""; // limpia las filas anteriores (sin innerHTML)

  // Siempre al menos una fila: una marca sin correos debe poder escribir el suyo.
  const filas = (correos && correos.length) ? correos : [""];

  filas.forEach((valor, indice) => {
    const fila = document.createElement("div");
    fila.className = "fila_de_correo";

    const entrada = document.createElement("input");
    entrada.type = "email";
    entrada.className = "entrada_de_campo entrada_de_correo";
    entrada.placeholder = "correo@dominio.com";
    entrada.value = valor;                       // por propiedad, nunca innerHTML
    entrada.setAttribute("aria-label", indice === 0
      ? "Correo principal desde el que se denuncia"
      : "Correo " + (indice + 1) + " desde el que se denuncia");
    // Mientras escribe se le quita el rojo (no molestar a medio teclear) y se
    // vuelve a revisar al salir de la caja.
    entrada.addEventListener("input", () => entrada.classList.remove("correo_invalido"));
    entrada.addEventListener("blur", () => marcar_correo_invalido(entrada));
    marcar_correo_invalido(entrada);             // marca lo que ya venía mal escrito

    // Insignia "Principal" solo en el primero; en el resto queda el hueco del
    // mismo ancho para que todas las filas queden alineadas.
    const celdaInsignia = document.createElement("span");
    celdaInsignia.className = "celda_de_insignia";
    if (indice === 0) {
      const insignia = document.createElement("span");
      insignia.className = "insignia_de_principal";
      insignia.textContent = "Principal";
      insignia.title = "Es el correo que se usa por defecto para denunciar (remitente)";
      celdaInsignia.appendChild(insignia);
    }

    const botonSubir = crear_boton_de_correo("↑", "Subir este correo", "boton_subir_correo",
      () => mover_correo_en_lista(contenedorLista, indice, indice - 1));
    botonSubir.disabled = (indice === 0);

    const botonBajar = crear_boton_de_correo("↓", "Bajar este correo", "boton_bajar_correo",
      () => mover_correo_en_lista(contenedorLista, indice, indice + 1));
    botonBajar.disabled = (indice === filas.length - 1);

    const botonQuitar = crear_boton_de_correo("🗑", "Quitar este correo", "quitar_correo",
      () => quitar_correo_de_lista(contenedorLista, indice));
    // Si solo queda una fila y está vacía no hay nada que quitar.
    botonQuitar.disabled = (filas.length === 1 && !String(valor || "").trim());

    fila.appendChild(entrada);
    fila.appendChild(celdaInsignia);
    fila.appendChild(botonSubir);
    fila.appendChild(botonBajar);
    fila.appendChild(botonQuitar);
    contenedorLista.appendChild(fila);
  });

  devolver_foco_a_fila_de_correo(contenedorLista, foco);
}

// Devuelve el cursor a la fila indicada después de redibujar la lista.
function devolver_foco_a_fila_de_correo(contenedorLista, foco) {
  if (!foco) return;
  const filasDom = contenedorLista.querySelectorAll(".fila_de_correo");
  if (!filasDom.length) return;
  const indice = Math.min(Math.max(foco.indice, 0), filasDom.length - 1);
  const filaDom = filasDom[indice];
  const selector = foco.papel === "subir" ? ".boton_subir_correo"
                 : foco.papel === "bajar" ? ".boton_bajar_correo"
                 : ".entrada_de_correo";
  const objetivo = filaDom.querySelector(selector);
  // Si el botón quedó deshabilitado (primera/última fila), el foco va a la caja.
  if (objetivo && !objetivo.disabled) objetivo.focus();
  else { const caja = filaDom.querySelector(".entrada_de_correo"); if (caja) caja.focus(); }
}

// Intercambia dos correos de sitio. Al mover el primero cambia el PRINCIPAL.
function mover_correo_en_lista(contenedorLista, desde, hacia) {
  const actuales = leer_correos_del_panel() || [];
  if (hacia < 0 || hacia >= actuales.length) return;
  const guardado = actuales[desde];
  actuales[desde] = actuales[hacia];
  actuales[hacia] = guardado;
  // El foco sigue al correo movido, en su botón (así se puede seguir moviendo).
  dibujar_filas_de_correos(contenedorLista, actuales,
    { indice: hacia, papel: (hacia < desde) ? "subir" : "bajar" });
}

// Quita un correo de la lista. Si era el único, queda una fila vacía.
function quitar_correo_de_lista(contenedorLista, indice) {
  const actuales = leer_correos_del_panel() || [];
  actuales.splice(indice, 1);
  dibujar_filas_de_correos(contenedorLista, actuales,
    { indice: Math.min(indice, Math.max(actuales.length - 1, 0)), papel: "entrada" });
}

// ---------------------------------------------------------------------------
//  Construye el campo completo de correos (etiqueta + nota + lista + botón
//  "Agregar correo"). Devuelve el bloque listo para meter en la rejilla.
// ---------------------------------------------------------------------------
function construir_campo_de_correos(campo, datos) {
  const grupo = document.createElement("div");
  // Ancho completo: cada correo es una fila con insignia y botones.
  grupo.className = "campo_de_marca campo_ancho_completo";

  // Es un <div> y no un <label> porque agrupa VARIAS cajas, no una sola.
  const etiqueta = document.createElement("div");
  etiqueta.className = "etiqueta_de_campo";
  etiqueta.id = "etiqueta_de_lista_de_correos";
  etiqueta.textContent = campo.etiqueta;

  const nota = document.createElement("p");
  nota.className = "nota_de_correos";
  nota.textContent = "Correos DESDE los que se denuncia (el remitente / correo de contacto). " +
    "Puedes guardar varios. El PRIMERO de la lista es el principal: es el que se usa por " +
    "defecto en los formularios y correos de denuncia. Usa ↑ y ↓ para cambiar cuál es el principal.";

  const contenedorLista = document.createElement("div");
  contenedorLista.className = "lista_de_correos";
  contenedorLista.setAttribute("data-lista", "correos");
  contenedorLista.setAttribute("role", "group");
  contenedorLista.setAttribute("aria-labelledby", "etiqueta_de_lista_de_correos");

  dibujar_filas_de_correos(contenedorLista, lista_de_correos_de(datos), null);

  const pie = document.createElement("div");
  pie.className = "pie_de_correos";
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "boton_de_marca agregar_correo";
  botonAgregar.textContent = "➕ Agregar correo";
  botonAgregar.title = "Agregar otro correo desde el que denunciar con esta marca";
  botonAgregar.setAttribute("aria-label", "Agregar otro correo desde el que denunciar con esta marca");
  botonAgregar.addEventListener("click", () => {
    const actuales = leer_correos_del_panel() || [];
    actuales.push("");
    // El foco va a la caja recién creada para escribir de una vez.
    dibujar_filas_de_correos(contenedorLista, actuales,
      { indice: actuales.length - 1, papel: "entrada" });
  });
  pie.appendChild(botonAgregar);

  grupo.appendChild(etiqueta);
  grupo.appendChild(nota);
  grupo.appendChild(contenedorLista);
  grupo.appendChild(pie);
  return grupo;
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
  const datos = (clave != null && existe_la_marca(marcas_en_memoria, clave))
    ? marcas_en_memoria[clave] : {};
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
      // Campo especial: la lista de correos se dibuja aparte (varias filas).
      if (campo.tipo === "lista_de_correos") {
        rejillaCampos.appendChild(construir_campo_de_correos(campo, datos));
        return;
      }

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

  // Nombre prohibido: no se toca NADA. Si no, al cambiar de marca en el
  // desplegable se borraría la marca original del diccionario (por el renombrado)
  // y la nueva se descartaría al guardar: se perdería en silencio. Guardar avisa.
  if (nombre_de_marca_prohibido(nombre)) return clave_en_edicion;

  // Reconstruye el registro de la marca desde los campos del panel.
  const registro = {};
  CLAVES_DE_MARCA.forEach((k) => {
    // "correos" (lista de varias filas) y "correo" (derivado del primero) no son
    // cajas sueltas: se resuelven juntos más abajo.
    if (k === "correos" || k === "correo") return;
    const el = contenedor_del_panel.querySelector('[data-campo="' + k + '"]');
    registro[k] = el ? el.value.trim() : "";
  });

  // Correos: se leen todas las filas en orden. Si el panel no tuviera lista, se
  // conservan los que la marca ya tenía en memoria (nunca se pierden en silencio).
  const previos = (clave_en_edicion != null && existe_la_marca(marcas_en_memoria, clave_en_edicion))
    ? marcas_en_memoria[clave_en_edicion] : {};
  const crudos  = leer_correos_del_panel();
  const correos = depurar_lista_de_correos(
    (crudos !== null) ? crudos : lista_de_correos_de(previos));
  registro.correos = correos;
  registro.correo  = correos[0] || "";   // el principal: es el que lee el resto de la extensión

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
//
//  ANTES de escribir se RELEE lo guardado: otra parte de la extensión (el "+"
//  del popup) puede haber tocado una marca mientras esta página estaba abierta, y
//  como aquí se guarda el diccionario ENTERO lo estaríamos pisando. Se compara
//  contra la foto para conservar lo que cambió fuera y no se editó aquí; lo que
//  el usuario quitó AQUÍ sí se va.
// ---------------------------------------------------------------------------
function persistir_en_storage(callback) {
  chrome.storage.local.get(["marcas_usuario"], (d) => {
    const guardadas = d.marcas_usuario || {};

    const marcas = Object.create(null); // sin prototipo: la clave es el nombre de la marca
    Object.keys(marcas_en_memoria).forEach((nombre) => {
      if (nombre_de_marca_prohibido(nombre)) return; // no se guardan (ver guardar_cambios_de_marca)
      const origen = marcas_en_memoria[nombre] || {};
      const registro = {};
      CLAVES_DE_MARCA.forEach((k) => {
        // "correos" es una LISTA: se guarda como array, no como texto (el resto de
        // campos sí son texto). Se depura por si venía de una marca aún sin editar.
        if (k === "correos") { registro.correos = lista_de_correos_de(origen); return; }
        registro[k] = origen[k] != null ? origen[k] : "";
      });
      // Lo que otra parte escribió y aquí no se editó, se conserva.
      conservar_campos_de_fuera(nombre, registro, guardadas[nombre]);
      registro.correos = fusionar_correos_de_fuera(nombre, registro.correos, guardadas[nombre]);
      // `correo` SIEMPRE = el primero de la lista, para que quede coherente con
      // `correos` incluso en marcas que el usuario nunca abrió en el panel.
      registro.correo = registro.correos[0] || "";
      // La memoria queda igual que lo escrito (así el panel muestra de una vez
      // los correos que hubiera agregado el popup).
      Object.keys(registro).forEach((k) => { origen[k] = registro[k]; });
      origen.correos = registro.correos.slice();
      marcas[nombre] = registro;
    });

    // Marcas que aparecieron en storage mientras esta página estaba abierta (no
    // estaban en la foto): se conservan tal cual. Las que el usuario quitó AQUÍ
    // no vuelven, porque esas SÍ estaban en la foto.
    Object.keys(guardadas).forEach((nombre) => {
      if (nombre_de_marca_prohibido(nombre)) return;
      if (existe_la_marca(marcas, nombre)) return;
      if (existe_la_marca(marcas_conocidas_de_storage, nombre)) return; // se quitó aquí
      marcas[nombre] = guardadas[nombre];
    });

    // Marcas BASE que ya no existen en memoria = eliminadas (no reaparecen).
    const eliminadas = Object.keys(window.MARCAS_BASE).filter((n) => !existe_la_marca(marcas, n));

    estamos_guardando = true; // para no reaccionar a nuestro propio cambio de storage
    chrome.storage.local.set({ marcas_usuario: marcas, marcas_eliminadas: eliminadas }, () => {
      // Lo que acabamos de escribir pasa a ser la nueva foto de referencia
      // (primero la foto y luego la bandera, para no reaccionar a medias).
      recordar_marcas_conocidas(marcas);
      estamos_guardando = false;
      if (typeof callback === "function") callback(Object.keys(marcas).length);
    });
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

  // Foto de las marcas tal como están guardadas: sirve para no pisar lo que otra
  // parte de la extensión escriba mientras esta página esté abierta.
  recordar_marcas_conocidas(guardadas);

  // Combina POR CAMPO: lo guardado no vacío tiene prioridad; los campos nuevos
  // de la base (p.ej. facebook, instagram, x, youtube, linkedin) no se pierden
  // aunque exista una copia vieja guardada.
  const todas = Object.assign(Object.create(null), window.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    if (nombre_de_marca_prohibido(m)) return; // nombre que ensucia el prototipo: se ignora
    const base = window.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => {
      if (clave_peligrosa(k)) return; // igual que en popup.js y background.js
      // `correos` va aparte: es una LISTA y un array VACÍO significa "el usuario
      // borró todos los correos a propósito". Con el criterio de "vacío" del
      // resto de campos se le resucitaría el borrado desde `correo`/MARCAS_BASE.
      if (k === "correos") return;
      if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k];
    });
    if (Array.isArray(g.correos)) o.correos = g.correos;
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);

  // Deja coherentes los dos campos de correo de CADA marca antes de mostrarlas:
  // `correos` (lista que edita el panel) y `correo` (texto con el principal).
  // Se trabaja sobre una copia para no mutar window.MARCAS_BASE.
  Object.keys(todas).forEach((n) => {
    if (nombre_de_marca_prohibido(n)) { delete todas[n]; return; }
    const registro = Object.assign({}, todas[n] || {});
    // lista_de_correos_de respeta el array (aunque venga vacío) y solo deriva de
    // `correo` cuando no hay lista guardada.
    const lista = lista_de_correos_de(registro);
    registro.correos = lista;
    registro.correo  = lista[0] || "";
    todas[n] = registro;
  });

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
  // Antes desaparecía en silencio al guardar: ahora se dice por qué. Estos
  // nombres tampoco los admite el menú del clic derecho (background.js).
  if (nombre_de_marca_prohibido(nombre)) {
    mostrar_aviso('El nombre "' + nombre + '" no se puede usar como marca. Escribe otro.', true);
    if (entradaNombre) entradaNombre.focus();
    return;
  }

  // Revisa el formato de los correos ANTES de redibujar el panel. Es un aviso,
  // no un bloqueo: lo demás se guarda igual (los vacíos simplemente no se guardan).
  contenedor_del_panel.querySelectorAll(".entrada_de_correo").forEach(marcar_correo_invalido);
  const hay_correos_en_rojo = hay_correos_invalidos_en_panel();

  // Vuelca el panel visible a memoria (puede crear o renombrar la marca).
  const nombreGuardado = volcar_panel_a_memoria();
  clave_en_edicion = nombreGuardado;

  // Persiste TODAS las marcas del diccionario en memoria. El refresco de la UI va
  // DENTRO del callback porque al guardar se conservan los correos que el popup
  // hubiera agregado mientras tanto: así se ven de una vez en el panel.
  persistir_en_storage((total) => {
    if (hay_correos_en_rojo) {
      mostrar_aviso("Guardado (" + total + " marcas), pero revisa los correos marcados en rojo.", true);
    } else {
      mostrar_aviso("✓ Guardado (" + total + " marcas).", false);
    }
    // Refresca el desplegable dejando seleccionada la marca vigente.
    poblar_desplegable_de_marcas(clave_en_edicion);
    mostrar_marca_en_panel(clave_en_edicion);
  });
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
    mostrar_aviso('✓ Marca "' + nombre + '" quitada (quedan ' + total + ').', false);
  });

  // Muestra la primera marca restante (o el modo "marca nueva").
  const restantes = Object.keys(marcas_en_memoria).sort((a, b) => a.localeCompare(b, "es"));
  const siguiente = restantes.length ? restantes[0] : null;
  poblar_desplegable_de_marcas(siguiente);
  mostrar_marca_en_panel(siguiente);
}

// ---------------------------------------------------------------------------
//  El popup agregó un correo (su botón "+") con esta página abierta: se mete en
//  la marca al vuelo para que el usuario lo vea y para no pisarlo al guardar.
//  Solo se AÑADEN correos nuevos: nunca se toca lo que el usuario esté editando
//  ni se resucitan marcas que aquí se hayan quitado.
// ---------------------------------------------------------------------------
function incorporar_correos_de_otras_partes(guardadas) {
  let llegaron_correos = false;

  Object.keys(guardadas || {}).forEach((nombre) => {
    if (nombre_de_marca_prohibido(nombre)) return;
    // hasOwnProperty y no `marcas_en_memoria[nombre]`: con un nombre heredado
    // ("toString", "valueOf"…) la lectura devolvería algo del prototipo y
    // acabaríamos escribiendo EN el prototipo, o sea en todas las marcas.
    if (!existe_la_marca(marcas_en_memoria, nombre)) return; // aquí no existe: no se resucita
    const enMemoria = marcas_en_memoria[nombre];

    // En la marca visible manda lo que hay ESCRITO en el panel (aún sin guardar).
    const es_la_visible = (nombre === clave_en_edicion);
    const del_panel = es_la_visible ? leer_correos_del_panel() : null;
    const actuales = depurar_lista_de_correos(
      (del_panel !== null) ? del_panel : lista_de_correos_de(enMemoria));

    const fusionados = fusionar_correos_de_fuera(nombre, actuales, guardadas[nombre]);

    // Los correos de esta marca pasan a ser conocidos: si ahora el usuario quita
    // uno a mano, se irá de verdad al guardar. Se actualizan SOLO los correos:
    // los demás campos de la foto se dejan como estaban, porque un cambio de
    // fuera en ellos aún tiene que rescatarse al guardar (ver M-4).
    recordar_correos_conocidos_de(nombre, guardadas[nombre]);

    if (fusionados.length === actuales.length) return; // no llegó nada nuevo

    enMemoria.correos = fusionados;
    enMemoria.correo  = fusionados[0] || "";
    llegaron_correos = true;
    if (es_la_visible) repintar_lista_de_correos_visible(fusionados);
  });

  if (llegaron_correos) mostrar_aviso("Se agregó un correo desde el popup.", false);
}

// Vuelve a dibujar la lista de correos del panel conservando dónde estaba el
// cursor (el popup puede agregar justo mientras el usuario escribe).
function repintar_lista_de_correos_visible(correos) {
  const contenedorLista = contenedor_del_panel.querySelector('[data-lista="correos"]');
  if (!contenedorLista) return;

  const cajas = Array.prototype.slice.call(contenedorLista.querySelectorAll(".entrada_de_correo"));
  const indiceFoco = cajas.indexOf(document.activeElement);
  const inicio = (indiceFoco >= 0) ? cajas[indiceFoco].selectionStart : null;
  const fin    = (indiceFoco >= 0) ? cajas[indiceFoco].selectionEnd   : null;

  dibujar_filas_de_correos(contenedorLista, correos,
    (indiceFoco >= 0) ? { indice: indiceFoco, papel: "entrada" } : null);

  if (indiceFoco >= 0 && inicio != null) {
    const caja = contenedorLista.querySelectorAll(".entrada_de_correo")[indiceFoco];
    // Chrome no deja mover la selección en un <input type="email">: si no puede,
    // basta con que el foco haya vuelto a su caja.
    if (caja) { try { caja.setSelectionRange(inicio, fin); } catch (e) {} }
  }
}

// ---------------------------------------------------------------------------
//  Eventos.
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== "local" || !cambios.marcas_usuario) return;
  if (estamos_guardando) return; // es el guardado de esta misma página
  incorporar_correos_de_otras_partes(cambios.marcas_usuario.newValue || {});
});

selector_de_marcas.addEventListener("change", al_cambiar_de_marca);
document.getElementById("boton_guardar_marcas").addEventListener("click", guardar_cambios_de_marca);
document.getElementById("boton_quitar_marca").addEventListener("click", quitar_marca_seleccionada);

cargar_marcas();

// ============================================================================
//  💾 COPIAR MIS DATOS A OTRA COMPUTADORA  (exportar / importar por archivo)
//
//  EL PROBLEMA QUE RESUELVE: todo lo que el usuario acumula (Registro de
//  denuncias con sus comprobantes, marcas propias, plataformas propias, memoria
//  de correos, plantillas) vive en chrome.storage.local, que NO sale nunca de
//  esa máquina. Al abrir la extensión en una computadora nueva, no hay nada.
//  Aquí se hace el traspaso A MANO: un archivo .json que se exporta en la PC
//  vieja y se importa en la nueva. Sin nube, sin base de datos, sin
//  chrome.storage.sync y sin permisos nuevos en el manifest (la descarga se
//  hace con un Blob y un enlace `download` de esta misma página).
//
//  LOS COMPROBANTES VIAJAN SOLOS: las capturas son dataURLs guardadas DENTRO de
//  cada denuncia (`comprobante_img` y la galería `respuestas_img`), así que
//  volcar `denuncias_registro` ya se las lleva. No hay nada aparte que empacar.
//
//  REGLA INNEGOCIABLE DE LA IMPORTACIÓN: SOLO AÑADE. Nunca borra ni pisa nada
//  de lo que ya hay en la PC de destino (CLAUDE.md: "los datos del usuario son
//  sagrados"). Cuando algo ya existe, gana SIEMPRE lo que ya estaba.
//    • denuncias_registro .... se fusiona por `id`; el id repetido se respeta.
//    • marcas_usuario ........ se añaden solo los nombres que no existan.
//    • plataformas_usuario ... se añaden solo las que no existan (identidad
//                              natural = red + tipo, igual que en popup.js).
//    • plantillas ............ se añaden solo las que no existan (tema+nombre).
//    • memoria_correos ....... se fusiona por sitio+correo y se SUMAN los
//                              contadores de uso de las dos PCs.
//    • marcas_eliminadas ..... NO SE IMPORTA NUNCA: es una lista de marcas
//                              ocultadas, e importarla haría DESAPARECER marcas
//                              en la PC de destino.
//    • claves de trabajo momentáneo (ver CLAVES_QUE_NO_SE_IMPORTAN): tampoco.
//    • cualquier otra clave desconocida: solo si aquí no existe todavía.
//
//  CONSECUTIVOS: dos PCs pueden haber creado denuncias con el MISMO número
//  consecutivo para la misma marca. Esos números ya se usaron en denuncias
//  enviadas de verdad, así que NO se renumera nada: se detectan las
//  coincidencias y se le listan al usuario para que él decida.
//
//  IMPORTAR DOS VECES NO DUPLICA NADA: todo se fusiona por identidad. Lo único
//  que no es idempotente por naturaleza es la SUMA de los contadores de uso de
//  la memoria de correos, así que cada archivo dice de qué computadora salió
//  (`id_computadora`) y aquí se apunta, por sitio y correo, cuánto se le contó
//  ya a esa máquina (`aportes_de_respaldos`). De cada archivo entra solo la
//  SUBIDA desde el anterior: da igual que la otra PC exporte cinco veces o que
//  el mismo archivo se importe diez, el total nunca se infla.
//
//  Seguridad: el archivo viene de fuera, así que se trata como dato y nunca
//  como código. Todo el render del resumen es por DOM (.textContent), jamás
//  innerHTML; las claves peligrosas (__proto__, constructor, prototype) se
//  descartan igual que en el resto de la extensión.
// ============================================================================

// Marca que identifica un archivo como respaldo de ESTA extensión.
const MARCA_DE_ARCHIVO_DE_TRASPASO = "denuncias_rs_respaldo";

// Claves que la importación NUNCA toca.
//  - marcas_eliminadas: ocultaría marcas en la PC de destino.
//  - ultima_exportacion y respaldo_pospuesto_hasta: dicen cuándo hizo copia ESTA
//    computadora. Traerlas de otra apagaría el recordatorio del popup aquí (o lo
//    encendería sin motivo), que es justo lo que no puede pasar.
//  - el resto son del momento y de esa máquina (el borrador de un correo, la
//    denuncia que se está llenando, el estado del actualizador, el diagnóstico
//    del menú, la bandera de migración de plantillas y el propio historial de
//    traspasos). Traerlas de otra PC solo puede confundir.
const CLAVES_QUE_NO_SE_IMPORTAN = [
  "marcas_eliminadas",
  "ultima_exportacion", "respaldo_pospuesto_hasta",
  "id_de_esta_computadora", "aportes_de_respaldos",
  "email_reporte", "ultima_denuncia_registro", "reintento_recarga",
  "estado_version", "ultimo_informe", "aviso_denuncia",
  "urls_denuncia", "urls_manuales", "pestanas_de_denuncia",
  "modo_prueba_denuncias", "diagnostico_menu_contextual",
  "plantillas_migradas", "traspasos_importados",
  // El candado de "importación en curso" de la otra PC: si viajara, dejaría esta
  // computadora sin poder importar hasta que caducara.
  "importacion_en_curso"
];

// Identificador de ESTA computadora (se crea en la primera exportación) y lo que
// ya se contó de cada computadora de origen. Con los dos, los contadores de uso
// de la memoria de correos se pueden SUMAR sin sumar dos veces lo mismo, aunque
// la otra PC exporte cinco veces: de cada archivo solo entra lo que subió desde
// el último que se importó de esa misma máquina. Ninguna de las dos viaja.
const CLAVE_ID_DE_ESTA_COMPUTADORA = "id_de_esta_computadora";
const CLAVE_APORTES_DE_RESPALDOS = "aportes_de_respaldos";

// Fecha del último respaldo hecho en ESTA computadora y hasta cuándo se calló el
// recordatorio con "Ahora no". Las lee el popup para avisar cuando toca (ver el
// cintillo de respaldo en popup.js). Viven solo aquí: no viajan en el archivo.
const CLAVE_ULTIMA_EXPORTACION = "ultima_exportacion";
const CLAVE_RESPALDO_POSPUESTO = "respaldo_pospuesto_hasta";

// Claves con fusión propia (las demás son "solo si aquí no existe").
const CLAVES_CON_FUSION_PROPIA = [
  "denuncias_registro", "marcas_usuario", "plataformas_usuario",
  "plantillas", "memoria_correos"
];

// Historial de archivos ya importados en ESTA PC (para no sumar dos veces los
// contadores de la memoria de correos). Se guarda solo el identificador y la
// fecha: ni un dato del contenido.
const CLAVE_TRASPASOS_IMPORTADOS = "traspasos_importados";
const MAXIMO_TRASPASOS_APUNTADOS = 50;

// A partir de este peso se avisa antes de exportar, para no colgar la pestaña.
const BYTES_PARA_AVISAR_DE_TAMANO = 150 * 1024 * 1024;

// El archivo de traspaso en espera de que el usuario confirme la importación.
// Se llena con la vista previa y se vacía al aplicar o al cancelar.
let archivo_de_traspaso_en_espera = null;

// ---------------------------------------------------------------------------
//  Ayudantes menudos (sin DOM: son los que prueba el banco de pruebas).
// ---------------------------------------------------------------------------
function texto_plano(valor) {
  return (valor === 0 ? "0" : (valor == null ? "" : valor)) + "";
}
function lista_de(valor) {
  return Array.isArray(valor) ? valor : [];
}
function diccionario_de(valor) {
  return (valor && typeof valor === "object" && !Array.isArray(valor)) ? valor : {};
}
// Quita las claves que ensucian el prototipo (__proto__, constructor, prototype)
// EN TODOS LOS NIVELES del valor. `clave_peligrosa` ya cuida el nivel de arriba
// (nombres de marca, claves de plataforma, sitios), pero dentro de cada objeto
// no miraba nadie: JSON.parse SÍ crea un "__proto__" como propiedad propia, y
// una marca importada podía acabar con campos que el guardado normal no permite
// (ése construye desde la lista blanca CLAVES_DE_MARCA). Trabaja in situ, sobre
// lo que se acaba de leer del archivo.
function limpiar_claves_peligrosas(valor) {
  if (!valor || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) { valor.forEach(limpiar_claves_peligrosas); return valor; }
  CLAVES_PELIGROSAS.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(valor, k)) delete valor[k];
  });
  Object.keys(valor).forEach((k) => limpiar_claves_peligrosas(valor[k]));
  return valor;
}

// Copia profunda barata (y limpia) para no compartir objetos con lo que ya está
// en memoria. OJO: no se usa con las denuncias, que llevan las capturas dentro y
// copiarlas saldría caro; ésas se limpian in situ con limpiar_claves_peligrosas.
function copia_profunda(valor) {
  return (valor == null) ? valor : limpiar_claves_peligrosas(JSON.parse(JSON.stringify(valor)));
}
function plural_de(n, singular, plural) {
  return n + " " + (n === 1 ? singular : plural);
}
// Una lista larga no cabe en la vista previa: se enseñan las primeras y se dice
// cuántas quedan, en vez de tragarse la pantalla (o de callarse las que faltan).
function lista_recortada(items, tope) {
  const lista = lista_de(items);
  if (lista.length <= tope) return lista.slice();
  return lista.slice(0, tope).concat(["…y " + (lista.length - tope) + " más"]);
}

// Imágenes de respuesta de una denuncia (lista nueva o el campo antiguo).
function imagenes_de_respuesta_de(denuncia) {
  if (!denuncia) return [];
  if (Array.isArray(denuncia.respuestas_img)) return denuncia.respuestas_img;
  if (texto_plano(denuncia.respuesta_img)) return [denuncia.respuesta_img];
  return [];
}

function version_de_la_extension() {
  try {
    const m = (chrome && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : null;
    return texto_plano(m && m.version);
  } catch (e) { return ""; }
}

function fecha_corta_de(fecha) {
  const f = (fecha instanceof Date) ? fecha : new Date();
  const dos = (n) => (n < 10 ? "0" : "") + n;
  return f.getFullYear() + "-" + dos(f.getMonth() + 1) + "-" + dos(f.getDate());
}

function nombre_de_archivo_de_traspaso(fecha) {
  return "denuncias_rs_respaldo_" + fecha_corta_de(fecha) + ".json";
}

// Identificador único del archivo (para el historial de importaciones).
function identificador_de_respaldo() {
  try {
    if (self.crypto && typeof self.crypto.randomUUID === "function") return self.crypto.randomUUID();
  } catch (e) {}
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
//  ERRORES DEL STORAGE (CRÍTICO).
//  chrome.storage NO lanza excepciones: si la escritura falla (disco lleno,
//  storage corrupto, error de E/S) el callback corre IGUAL y solo se entera
//  quien mire chrome.runtime.lastError DENTRO del callback. Sin esto se le
//  anunciaría al usuario "✓ Listo, se añadieron N denuncias" sin haber escrito
//  nada — y este usuario acaba de llegar con una computadora nueva vacía: si se
//  fía, borra la vieja y pierde su Registro entero. Por eso TODA lectura y toda
//  escritura de esta sección pasa por estos dos ayudantes.
// ---------------------------------------------------------------------------
function error_de_storage() {
  try {
    const e = chrome.runtime && chrome.runtime.lastError;
    return e ? (texto_plano(e.message) || "el navegador no dijo por qué") : "";
  } catch (e) { return ""; }
}
// cb(datos, error). `error` viene vacío cuando todo fue bien.
function leer_storage(claves, cb) {
  chrome.storage.local.get(claves, (datos) => {
    const err = error_de_storage();   // se lee DENTRO del callback o no vale
    cb(diccionario_de(datos), err);
  });
}
// cb(error). `error` vacío = escrito de verdad.
function escribir_storage(objeto, cb) {
  chrome.storage.local.set(objeto, () => {
    const err = error_de_storage();
    if (cb) cb(err);
  });
}
function borrar_de_storage(claves, cb) {
  chrome.storage.local.remove(claves, () => {
    const err = error_de_storage();
    if (cb) cb(err);
  });
}

function texto_de_peso(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " bytes";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

// ---------------------------------------------------------------------------
//  IDENTIDADES: con qué se decide que dos cosas son "la misma".
// ---------------------------------------------------------------------------
// Denuncia: el `id`. Las que no lo tengan (registros muy viejos) se identifican
// por marca+consecutivo+fecha+plataforma, que es estable: así importar dos veces
// el mismo archivo tampoco las duplica.
function identidad_de_denuncia(denuncia) {
  const id = texto_plano(denuncia && denuncia.id).trim();
  if (id) return "id:" + id;
  return "sin_id:" + [
    texto_plano(denuncia && denuncia.marca).trim().toLowerCase(),
    texto_plano(denuncia && denuncia.consecutivo).trim(),
    texto_plano(denuncia && denuncia.fecha).trim(),
    texto_plano(denuncia && denuncia.plataforma).trim().toLowerCase()
  ].join("|");
}

// Consecutivo por marca: "marca|n.º". "" si a la denuncia le falta alguno.
function llave_de_consecutivo(denuncia) {
  const marca = texto_plano(denuncia && denuncia.marca).trim().toLowerCase();
  const consecutivo = texto_plano(denuncia && denuncia.consecutivo).trim();
  if (!marca || !consecutivo) return "";
  return marca + "|" + consecutivo;
}

// Plataforma propia: red + tipo, la MISMA identidad que usa popup.js en
// clave_de_plataforma_de_usuario (la clave interna "u_..._form" no sirve: dos
// PCs pueden haberle puesto claves distintas a la misma plataforma, o la misma
// clave a plataformas distintas).
function identidad_de_plataforma(plataforma) {
  const red = texto_plano(plataforma && plataforma.red).trim().toLowerCase();
  const tipo = (plataforma && plataforma.tipo === "email") ? "correo" : "formulario";
  return red + "|" + tipo;
}

// Plantilla: tema + nombre (plantilla.js no les pone id).
function identidad_de_plantilla(plantilla) {
  return texto_plano(plantilla && plantilla.tema).trim().toLowerCase() + "|" +
         texto_plano(plantilla && plantilla.nombre).trim().toLowerCase();
}

// Clave interna libre para una plataforma que entra: si la clave del archivo ya
// está ocupada por OTRA plataforma distinta, se le busca una libre. Nunca se
// pisa la que ya estaba.
function clave_libre_de_plataforma(clave, ocupadas) {
  const base = texto_plano(clave) || "u_importada";
  if (!Object.prototype.hasOwnProperty.call(ocupadas, base)) return base;
  let n = 2;
  while (Object.prototype.hasOwnProperty.call(ocupadas, base + "_" + n)) n++;
  return base + "_" + n;
}

// Una línea corta para describir una denuncia en el aviso de consecutivos.
function descripcion_corta_de_denuncia(denuncia) {
  const partes = [];
  const plataforma = texto_plano(denuncia && denuncia.plataforma).trim();
  const fecha = texto_plano(denuncia && denuncia.fecha).trim();
  if (plataforma) partes.push(plataforma);
  if (fecha) partes.push(fecha.slice(0, 10));
  const url = texto_plano(denuncia && denuncia.url_denunciada).trim();
  if (url) partes.push(url.slice(0, 60));
  return partes.join(" · ") || "(sin datos)";
}

// ---------------------------------------------------------------------------
//  EXPORTAR: resumen, cabecera y troceado del JSON.
// ---------------------------------------------------------------------------
// Conteo de lo que lleva un volcado. Es lo que permite ver de un vistazo que el
// archivo NO vino vacío.
function resumen_de_traspaso(datos) {
  const d = diccionario_de(datos);
  const denuncias = lista_de(d.denuncias_registro);
  let comprobantes = 0, respuestas = 0;
  denuncias.forEach((x) => {
    if (x && texto_plano(x.comprobante_img)) comprobantes++;
    respuestas += imagenes_de_respuesta_de(x).length;
  });
  const memoria = diccionario_de(d.memoria_correos);
  let correos = 0;
  Object.keys(memoria).forEach((k) => { correos += lista_de(diccionario_de(memoria[k]).correos).length; });
  return {
    denuncias: denuncias.length,
    comprobantes: comprobantes,
    imagenes_de_respuesta: respuestas,
    marcas: Object.keys(diccionario_de(d.marcas_usuario)).length,
    plataformas: Object.keys(diccionario_de(d.plataformas_usuario)).length,
    plantillas: lista_de(d.plantillas).length,
    fichas_de_correo: Object.keys(memoria).length,
    correos_recordados: correos,
    claves: Object.keys(d).length
  };
}

function encabezado_de_traspaso(datos, fecha, id_computadora) {
  return {
    archivo: MARCA_DE_ARCHIVO_DE_TRASPASO,
    formato: 1,
    version_extension: version_de_la_extension(),
    fecha: ((fecha instanceof Date) ? fecha : new Date()).toISOString(),
    id_respaldo: identificador_de_respaldo(),
    id_computadora: texto_plano(id_computadora),
    resumen: resumen_de_traspaso(datos)
  };
}

// De qué máquina viene un archivo, para no volver a sumar contadores de uso que
// ya se contaron. Lo mejor es el id de la computadora que lo creó; si el archivo
// es de una versión anterior y no lo trae, sirve el id del propio archivo (con
// eso al menos importarlo dos veces no suma dos veces).
function origen_del_archivo(archivo) {
  const enc = diccionario_de(archivo && archivo.encabezado);
  const pc = texto_plano(enc.id_computadora).trim();
  if (pc) return "pc:" + pc;
  const id = texto_plano(enc.id_respaldo).trim();
  return id ? "archivo:" + id : "";
}

// El JSON SE ARMA A TROZOS (un texto por clave) en vez de con un solo
// JSON.stringify del objeto entero: el Registro con comprobantes puede pesar
// decenas de MB y así no se crea una copia gigante más del volcado completo.
// El Blob se queda con los trozos tal cual.
function trozos_json_de_traspaso(datos, encabezado) {
  const d = diccionario_de(datos);
  const trozos = ['{"encabezado":', JSON.stringify(encabezado), ',"datos":{'];
  let primero = true;
  Object.keys(d).forEach((clave) => {
    // El Registro se trocea DENUNCIA A DENUNCIA. Trocear por clave no servía de
    // nada justo donde hacía falta: toda la carga (las capturas) está en esta
    // sola clave, y un JSON.stringify del array entero puede reventar por
    // tamaño (RangeError) con el Registro de años que tiene el usuario.
    if (clave === "denuncias_registro" && Array.isArray(d[clave])) {
      trozos.push((primero ? "" : ",") + JSON.stringify(clave) + ":[");
      d[clave].forEach((denuncia, i) => {
        trozos.push((i ? "," : "") + JSON.stringify(denuncia === undefined ? null : denuncia));
      });
      trozos.push("]");
      primero = false;
      return;
    }
    const valor = JSON.stringify(d[clave]);
    if (valor === undefined) return; // no es representable en JSON: se omite
    trozos.push((primero ? "" : ",") + JSON.stringify(clave) + ":");
    trozos.push(valor);
    primero = false;
  });
  trozos.push("}}");
  return trozos;
}

// Lee TODO chrome.storage.local y devuelve el archivo listo para descargar.
//  cb(archivo, error): si la lectura falla NO se inventa un archivo vacío.
function preparar_archivo_de_traspaso(cb) {
  leer_storage(null, (datos, err) => {
    if (err) { cb(null, err); return; }
    // El id de esta computadora se bautiza aquí si hace falta; si algo revienta,
    // se contesta con error en vez de dejar la pantalla congelada.

    // Esta computadora se bautiza en su primera exportación y ya no cambia: es
    // lo que permite reconocer sus archivos en la otra PC. Si el bautizo NO se
    // puede guardar, el archivo sale SIN id de computadora: mejor eso que
    // ponerle uno que aquí no queda apuntado, porque la próxima exportación
    // llevaría otro distinto y la otra PC creería que son dos máquinas (y le
    // sumaría dos veces los contadores de uso).
    const id_guardado = texto_plano(datos[CLAVE_ID_DE_ESTA_COMPUTADORA]).trim();
    if (id_guardado) { armar(datos, id_guardado); return; }

    const nuevo = identificador_de_respaldo();
    const bautizo = {}; bautizo[CLAVE_ID_DE_ESTA_COMPUTADORA] = nuevo;
    // El id va en la CABECERA, no dentro de los datos: `armar` deja fuera del
    // archivo todo lo que es de esta máquina.
    escribir_storage(bautizo, (err2) => armar(datos, err2 ? "" : nuevo));

    function armar(datos, id_computadora) {
      try {
        // Lo que es de ESTA máquina y no pinta nada en el archivo: el id de la
        // computadora (va en la CABECERA, que es de donde depende la cuenta de
        // los contadores) y el historial de qué máquinas se importaron aquí. Al
        // importar se ignoran igualmente, pero no hay por qué pasearlos.
        const para_el_archivo = {};
        Object.keys(datos).forEach((k) => {
          if (k === CLAVE_ID_DE_ESTA_COMPUTADORA || k === CLAVE_APORTES_DE_RESPALDOS) return;
          para_el_archivo[k] = datos[k];
        });
        const fecha = new Date();
        const encabezado = encabezado_de_traspaso(para_el_archivo, fecha, id_computadora);
        cb({
          nombre: nombre_de_archivo_de_traspaso(fecha),
          encabezado: encabezado,
          trozos: trozos_json_de_traspaso(para_el_archivo, encabezado)
        }, "");
      } catch (e) {
        // Un RangeError aquí moriría dentro del callback de chrome.storage y
        // dejaría el botón muerto y el mensaje congelado en "Preparando…".
        cb(null, texto_plano(e && e.message) || "el archivo es demasiado grande para armarlo de una vez");
      }
    }
  });
}

// Apunta que se hizo una copia: es lo que apaga el recordatorio del popup (y
// borra el "Ahora no", que ya no pinta nada). Solo se llama cuando el USUARIO
// confirma que el archivo se guardó de verdad (ver pintar_resultado_de_
// exportacion): el navegador puede haberle preguntado dónde guardarlo y él
// haber cancelado, y entonces no hay copia ninguna.
//  cb(error): si la escritura falla NO se apunta nada, y así el cintillo sigue
//  insistiendo. Es el lado bueno del error: mejor que moleste de más a que se
//  calle 7 días creyendo que hay un respaldo que no existe.
function apuntar_que_se_hizo_respaldo(cb) {
  const apunte = {};
  apunte[CLAVE_ULTIMA_EXPORTACION] = new Date().toISOString();
  apunte[CLAVE_RESPALDO_POSPUESTO] = 0;
  escribir_storage(apunte, (err) => { if (cb) cb(err); });
}

// Peso aproximado de lo guardado SIN cargarlo (para avisar antes de volcar).
// Devuelve -1 si el navegador no sabe decirlo.
function medir_datos_guardados(cb) {
  try {
    if (chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        // Si no se puede medir no se para la exportación: solo se pierde el
        // aviso de "esto es muy grande". Pero el error se consume igual, para
        // que no se quede colgado y lo herede la siguiente llamada.
        cb(error_de_storage() ? -1 : (Number(bytes) || 0));
      });
      return;
    }
  } catch (e) {}
  cb(-1);
}

// ---------------------------------------------------------------------------
//  IMPORTAR: validación del archivo.
// ---------------------------------------------------------------------------
function validar_archivo_de_traspaso(archivo) {
  if (!archivo || typeof archivo !== "object" || Array.isArray(archivo)) {
    return { ok: false, motivo: "El archivo no contiene un respaldo (no es un objeto JSON)." };
  }
  const enc = archivo.encabezado;
  if (!enc || typeof enc !== "object" || Array.isArray(enc)) {
    return { ok: false, motivo: "El archivo no trae la cabecera de un respaldo de Denuncias RS." };
  }
  if (texto_plano(enc.archivo) !== MARCA_DE_ARCHIVO_DE_TRASPASO) {
    return { ok: false, motivo: "Ese archivo no es un respaldo de esta extensión." };
  }
  if (!archivo.datos || typeof archivo.datos !== "object" || Array.isArray(archivo.datos)) {
    return { ok: false, motivo: "El respaldo no trae la sección de datos." };
  }
  return { ok: true, motivo: "" };
}

// ¿Este mismo archivo ya se importó antes en esta PC? Devuelve la fecha en que
// entró, o "" si es la primera vez.
function fecha_en_que_ya_se_importo(datos_actuales, archivo) {
  const id = texto_plano(archivo && archivo.encabezado && archivo.encabezado.id_respaldo).trim();
  if (!id) return "";
  const apuntes = lista_de(diccionario_de(datos_actuales)[CLAVE_TRASPASOS_IMPORTADOS]);
  const ya = apuntes.filter((a) => texto_plano(a && a.id_respaldo) === id)[0];
  return ya ? texto_plano(ya.importado) : "";
}

function historial_de_traspasos_actualizado(datos_actuales, archivo, resumen) {
  const apuntes = lista_de(diccionario_de(datos_actuales)[CLAVE_TRASPASOS_IMPORTADOS]).slice();
  const enc = diccionario_de(archivo && archivo.encabezado);
  const id = texto_plano(enc.id_respaldo).trim();
  const nuevo = {
    id_respaldo: id,
    fecha_del_archivo: texto_plano(enc.fecha),
    importado: new Date().toISOString(),
    denuncias_agregadas: resumen.denuncias_nuevas,
    marcas_agregadas: resumen.marcas_nuevas
  };
  const sin_este = id ? apuntes.filter((a) => texto_plano(a && a.id_respaldo) !== id) : apuntes;
  sin_este.push(nuevo);
  return sin_este.slice(-MAXIMO_TRASPASOS_APUNTADOS);
}

// ---------------------------------------------------------------------------
//  IMPORTAR: el plan. Función PURA (no toca storage ni el DOM): recibe el
//  archivo y lo que hay ahora, y devuelve exactamente qué se escribiría.
//  Esto es lo que se enseña en la vista previa y lo que luego se aplica.
// ---------------------------------------------------------------------------
function planificar_importacion(archivo, datos_actuales, ya_se_importo) {
  const validacion = validar_archivo_de_traspaso(archivo);
  if (!validacion.ok) return { ok: false, motivo: validacion.motivo };

  const deFuera = diccionario_de(archivo.datos);
  const aqui = diccionario_de(datos_actuales);
  const cambios = {};
  const resumen = {
    denuncias_nuevas: 0, denuncias_respetadas: 0,
    comprobantes_nuevos: 0,
    marcas_nuevas: 0, marcas_respetadas: 0, marcas_borradas_aqui: 0,
    plataformas_nuevas: 0, plataformas_respetadas: 0,
    plantillas_nuevas: 0, plantillas_respetadas: 0,
    fichas_de_correo_nuevas: 0, fichas_de_correo_respetadas: 0,
    correos_nuevos: 0, correos_sumados: 0,
    otras_claves_nuevas: [], claves_no_importadas: []
  };
  // Para que la vista previa pueda enseñar QUÉ entra, no solo cuántos: los
  // correos nuevos y el destino completo de cada plataforma deciden a dónde van
  // a parar las denuncias del usuario, así que tiene que poder verlos antes.
  const nombres_nuevos = { marcas: [], plataformas: [], correos: [], borradas_aqui: [] };
  const coincidencias_de_consecutivo = [];

  // CONTADORES DE USO SIN CONTAR DOS VECES: de cada computadora de origen se
  // recuerda cuánto se le contó ya a cada correo. Lo que entra es solo la
  // SUBIDA desde entonces, así que da igual cuántas veces se exporte allá o se
  // importe aquí: el total nunca se infla.
  const origen = origen_del_archivo(archivo);
  const aportes_previos = origen
    ? diccionario_de(diccionario_de(aqui[CLAVE_APORTES_DE_RESPALDOS])[origen]) : {};
  const aportes_ahora = Object.assign({}, aportes_previos);
  let cambiaron_los_aportes = false;
  // Cuántas veces de las que trae este correo son NUEVAS para nosotros.
  function subida_de(sitio, direccion, trae) {
    const llave = sitio + "||" + direccion.toLowerCase();
    const contado = Number(aportes_previos[llave]) || 0;
    if (trae > contado) { aportes_ahora[llave] = trae; cambiaron_los_aportes = true; }
    // Sin origen conocido no se puede llevar la cuenta: se suma tal cual (solo
    // pasa con archivos hechos a mano, sin cabecera completa).
    return origen ? Math.max(0, trae - contado) : trae;
  }

  // ---- denuncias_registro: fusión por id, gana SIEMPRE la que ya estaba ----
  const denuncias_fuera = lista_de(deFuera.denuncias_registro);
  if (denuncias_fuera.length) {
    const denuncias_aqui = lista_de(aqui.denuncias_registro);
    const vistas = Object.create(null);
    denuncias_aqui.forEach((d) => { vistas[identidad_de_denuncia(d)] = 1; });
    // Consecutivos ya ocupados en ESTA PC, para cazar las coincidencias.
    const consecutivos = Object.create(null);
    denuncias_aqui.forEach((d) => {
      const k = llave_de_consecutivo(d);
      if (k && !consecutivos[k]) consecutivos[k] = d;
    });

    const fusion = denuncias_aqui.slice();
    denuncias_fuera.forEach((d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return;
      const identidad = identidad_de_denuncia(d);
      if (vistas[identidad]) { resumen.denuncias_respetadas++; return; }
      vistas[identidad] = 1;

      const k = llave_de_consecutivo(d);
      if (k && consecutivos[k]) {
        // NO se renumera: ese número ya se usó en una denuncia enviada de
        // verdad. Se apunta para avisarle al usuario y que decida él.
        coincidencias_de_consecutivo.push({
          marca: texto_plano(d.marca),
          consecutivo: texto_plano(d.consecutivo),
          aqui: descripcion_corta_de_denuncia(consecutivos[k]),
          entra: descripcion_corta_de_denuncia(d)
        });
      } else if (k) {
        consecutivos[k] = d;
      }

      // In situ y sin copiar: la denuncia lleva las capturas dentro (dataURLs de
      // cientos de KB) y duplicarlas en memoria saldría carísimo.
      fusion.push(limpiar_claves_peligrosas(d));
      resumen.denuncias_nuevas++;
      if (texto_plano(d.comprobante_img)) resumen.comprobantes_nuevos++;
    });
    if (resumen.denuncias_nuevas) cambios.denuncias_registro = fusion;
  }

  // ---- marcas_usuario: se añaden solo los nombres que aquí no existan ----
  //  Y NUNCA una marca que el usuario haya BORRADO en esta computadora. Al
  //  borrar una marca de las de fábrica, `persistir_en_storage` la saca de
  //  `marcas_usuario` y la apunta en `marcas_eliminadas`; la otra PC, que no la
  //  borró, sí la lleva en su `marcas_usuario`. Sin mirar esa lista, la marca
  //  entraría, reaparecería en el desplegable y el siguiente "Guardar cambios"
  //  la quitaría de `marcas_eliminadas`, deshaciendo el borrado PARA SIEMPRE.
  //  Aquí no se revive nada por iniciativa propia: se le dice al usuario cuáles
  //  se quedaron fuera y ya decide él si las recupera a mano.
  const borradas_aqui = Object.create(null);
  lista_de(aqui.marcas_eliminadas).forEach((n) => { borradas_aqui[texto_plano(n)] = 1; });

  const marcas_fuera = diccionario_de(deFuera.marcas_usuario);
  const nombres_de_fuera = Object.keys(marcas_fuera);
  if (nombres_de_fuera.length) {
    const marcas_aqui = diccionario_de(aqui.marcas_usuario);
    const marcas = Object.assign(Object.create(null), marcas_aqui);
    nombres_de_fuera.forEach((nombre) => {
      if (clave_peligrosa(nombre)) return; // nombre que ensuciaría el prototipo
      if (borradas_aqui[nombre]) {
        resumen.marcas_borradas_aqui++;
        nombres_nuevos.borradas_aqui.push(nombre);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(marcas_aqui, nombre)) { resumen.marcas_respetadas++; return; }
      marcas[nombre] = copia_profunda(marcas_fuera[nombre]);
      nombres_nuevos.marcas.push(nombre);
      resumen.marcas_nuevas++;
    });
    if (resumen.marcas_nuevas) cambios.marcas_usuario = marcas;
  }

  // ---- plataformas_usuario: identidad natural = red + tipo ----
  const plataformas_fuera = diccionario_de(deFuera.plataformas_usuario);
  const claves_de_fuera = Object.keys(plataformas_fuera);
  if (claves_de_fuera.length) {
    const plataformas_aqui = diccionario_de(aqui.plataformas_usuario);
    const plataformas = Object.assign(Object.create(null), plataformas_aqui);
    const identidades = Object.create(null);
    Object.keys(plataformas_aqui).forEach((k) => { identidades[identidad_de_plataforma(plataformas_aqui[k])] = 1; });
    claves_de_fuera.forEach((clave) => {
      if (clave_peligrosa(clave)) return;
      const p = plataformas_fuera[clave];
      if (!p || typeof p !== "object" || Array.isArray(p)) return;
      const identidad = identidad_de_plataforma(p);
      if (identidades[identidad]) { resumen.plataformas_respetadas++; return; }
      identidades[identidad] = 1;
      plataformas[clave_libre_de_plataforma(clave, plataformas)] = copia_profunda(p);
      // Con el DESTINO completo: una plataforma de formulario aporta una URL que
      // se abre y se autorrellena con el nombre, el correo, el teléfono y el
      // país del usuario; una de correo, el buzón al que saldrán sus denuncias.
      // Eso tiene que verse ANTES de aceptar, no después.
      nombres_nuevos.plataformas.push(
        (texto_plano(p.red) || clave) +
        ((p.tipo === "email") ? " (por correo) → " + (texto_plano(p.destino) || "(sin buzón)")
                              : " (formulario) → " + (texto_plano(p.url) || "(sin enlace)")));
      resumen.plataformas_nuevas++;
    });
    if (resumen.plataformas_nuevas) cambios.plataformas_usuario = plataformas;
  }

  // ---- plantillas: identidad = tema + nombre ----
  const plantillas_fuera = lista_de(deFuera.plantillas);
  if (plantillas_fuera.length) {
    const plantillas_aqui = lista_de(aqui.plantillas);
    const vistas = Object.create(null);
    plantillas_aqui.forEach((p) => { vistas[identidad_de_plantilla(p)] = 1; });
    const fusion = plantillas_aqui.slice();
    plantillas_fuera.forEach((p) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return;
      const identidad = identidad_de_plantilla(p);
      if (vistas[identidad]) { resumen.plantillas_respetadas++; return; }
      vistas[identidad] = 1;
      fusion.push(copia_profunda(p));
      resumen.plantillas_nuevas++;
    });
    if (resumen.plantillas_nuevas) cambios.plantillas = fusion;
  }

  // ---- memoria_correos: fusión por sitio + correo, SUMANDO los contadores ----
  const memoria_fuera = diccionario_de(deFuera.memoria_correos);
  const sitios_de_fuera = Object.keys(memoria_fuera);
  if (sitios_de_fuera.length) {
    const memoria_aqui = diccionario_de(aqui.memoria_correos);
    const memoria = {};
    Object.keys(memoria_aqui).forEach((k) => { memoria[k] = copia_profunda(memoria_aqui[k]); });
    let toco_algo = false;

    sitios_de_fuera.forEach((sitio) => {
      if (clave_peligrosa(sitio)) return;
      const ficha_fuera = diccionario_de(memoria_fuera[sitio]);
      // `oculto` es una ficha que el usuario BORRÓ a mano en la otra PC:
      // importarlo escondería correos aquí, así que nunca se trae.
      if (ficha_fuera.oculto) return;
      const ficha_aqui = Object.prototype.hasOwnProperty.call(memoria, sitio) ? diccionario_de(memoria[sitio]) : null;
      // Si aquí la escondió el usuario, se respeta su decisión: no se resucita.
      if (ficha_aqui && ficha_aqui.oculto) { resumen.fichas_de_correo_respetadas++; return; }

      if (!ficha_aqui) {
        const correos = lista_de(ficha_fuera.correos)
          .filter((c) => texto_plano(c && c.correo).trim())
          .map((c) => {
            const direccion = texto_plano(c.correo).trim();
            nombres_nuevos.correos.push(sitio + " → " + direccion);
            return { correo: direccion, veces: subida_de(sitio, direccion, Number(c.veces) || 0), ultima: texto_plano(c.ultima) };
          });
        memoria[sitio] = { nombre: texto_plano(ficha_fuera.nombre), nota: texto_plano(ficha_fuera.nota), correos: correos };
        resumen.fichas_de_correo_nuevas++;
        resumen.correos_nuevos += correos.length;
        toco_algo = true;
        return;
      }

      resumen.fichas_de_correo_respetadas++;
      if (!Array.isArray(ficha_aqui.correos)) ficha_aqui.correos = [];
      // Solo se rellena lo que aquí estuviera VACÍO: nunca se pisa un texto.
      if (!texto_plano(ficha_aqui.nombre) && texto_plano(ficha_fuera.nombre)) {
        ficha_aqui.nombre = texto_plano(ficha_fuera.nombre); toco_algo = true;
      }
      if (!texto_plano(ficha_aqui.nota) && texto_plano(ficha_fuera.nota)) {
        ficha_aqui.nota = texto_plano(ficha_fuera.nota); toco_algo = true;
      }
      lista_de(ficha_fuera.correos).forEach((c) => {
        const direccion = texto_plano(c && c.correo).trim();
        if (!direccion) return;
        const ya = ficha_aqui.correos.filter(
          (o) => texto_plano(o && o.correo).trim().toLowerCase() === direccion.toLowerCase())[0];
        const sube = subida_de(sitio, direccion, Number(c.veces) || 0);
        if (!ya) {
          ficha_aqui.correos.push({ correo: direccion, veces: sube, ultima: texto_plano(c.ultima) });
          nombres_nuevos.correos.push(sitio + " → " + direccion);
          resumen.correos_nuevos++; toco_algo = true;
          return;
        }
        if (sube) { ya.veces = (Number(ya.veces) || 0) + sube; resumen.correos_sumados++; toco_algo = true; }
        if (texto_plano(c.ultima) > texto_plano(ya.ultima)) { ya.ultima = texto_plano(c.ultima); toco_algo = true; }
      });
      memoria[sitio] = ficha_aqui;
    });

    if (toco_algo) cambios.memoria_correos = memoria;
    // Lo contado de esta computadora de origen, para el siguiente archivo suyo.
    if (origen && cambiaron_los_aportes) {
      const todos = Object.assign({}, diccionario_de(aqui[CLAVE_APORTES_DE_RESPALDOS]));
      todos[origen] = aportes_ahora;
      cambios[CLAVE_APORTES_DE_RESPALDOS] = todos;
    }
  }

  // ---- el resto de claves ----
  Object.keys(deFuera).forEach((clave) => {
    if (CLAVES_CON_FUSION_PROPIA.indexOf(clave) >= 0) return;
    if (CLAVES_QUE_NO_SE_IMPORTAN.indexOf(clave) >= 0) { resumen.claves_no_importadas.push(clave); return; }
    if (clave_peligrosa(clave)) return;
    // Si aquí ya hay algo con ese nombre, NO se toca (la importación solo añade).
    if (Object.prototype.hasOwnProperty.call(aqui, clave)) return;
    cambios[clave] = copia_profunda(deFuera[clave]);
    resumen.otras_claves_nuevas.push(clave);
  });

  return {
    ok: true,
    cambios: cambios,
    resumen: resumen,
    nombres_nuevos: nombres_nuevos,
    coincidencias_de_consecutivo: coincidencias_de_consecutivo,
    ya_se_importo: texto_plano(ya_se_importo),
    encabezado: diccionario_de(archivo.encabezado)
  };
}

// `planificar_importacion` recorre y copia TODO el archivo. Si algo revienta ahí
// (un respaldo enorme, memoria que no da), la excepción moriría dentro de un
// callback de chrome.storage y dejaría la pantalla congelada en "Añadiendo los
// datos…" con el botón muerto. Aquí se convierte en un plan con motivo, que sí
// se sabe pintar.
function planificar_sin_reventar(archivo, actuales) {
  try {
    return planificar_importacion(archivo, actuales, fecha_en_que_ya_se_importo(actuales, archivo));
  } catch (e) {
    return { ok: false, motivo: "No se pudo preparar la importación (" +
      (texto_plano(e && e.message) || "sin detalle") + "). No se tocó nada." };
  }
}

// Vista previa: planifica contra lo que hay AHORA, sin escribir nada.
function planificar_importacion_contra_storage(archivo, cb) {
  leer_storage(null, (actuales, err) => {
    if (err) { cb({ ok: false, motivo: "No se pudieron leer tus datos (" + err + ")." }); return; }
    cb(planificar_sin_reventar(archivo, actuales));
  });
}

// ---------------------------------------------------------------------------
//  APLICAR LA IMPORTACIÓN SIN COMERSE LO QUE ESCRIBA OTRO MIENTRAS TANTO.
//
//  El peligro: aquí se escriben claves ENTERAS (el array completo de
//  `denuncias_registro`, el diccionario entero de `marcas_usuario`…) calculadas
//  sobre una foto leída antes. Si entre esa lectura y la escritura otra parte de
//  la extensión escribe esas claves, su escritura desaparece: background.js crea
//  denuncias desde el menú del clic derecho y el "+" del popup escribe
//  `marcas_usuario`. Una denuncia creada en ese hueco se perdería con su
//  comprobante. Y con dos pestañas de opciones importando a la vez, la segunda
//  borraría lo que añadió la primera.
//
//  Tres defensas, el mismo patrón que `persistir_en_storage` usa para las marcas:
//   1) CANDADO en storage (`importacion_en_curso`) con caducidad, para que dos
//      pestañas no importen a la vez. Si la pestaña se cierra a media faena, el
//      candado caduca solo y no deja a nadie encerrado.
//   2) RELEER JUSTO ANTES de escribir y planificar sobre eso, no sobre la foto de
//      la vista previa: lo que haya entrado mientras tanto entra en la fusión.
//   3) COMPROBAR DESPUÉS: se relee y se verifica que está TODO (lo que había y lo
//      que se añadía). Si falta algo (alguien escribió justo después y nos pisó),
//      se vuelve a fusionar sobre lo nuevo y se reescribe, hasta 3 intentos. Si
//      al final no cuadra, se dice que NO cuadró: nunca se pinta un éxito falso.
//
//  Lo que esto NO puede evitar: chrome.storage no tiene transacciones, así que
//  queda una ventana de microsegundos entre la relectura (2) y la escritura. Si
//  otro escribe justo ahí, su cambio se pierde sin que se pueda detectar. Se
//  acorta todo lo posible y se deja dicho.
// ---------------------------------------------------------------------------
const CLAVE_IMPORTACION_EN_CURSO = "importacion_en_curso";
const MS_DE_CADUCIDAD_DEL_CANDADO = 2 * 60 * 1000;
const INTENTOS_DE_IMPORTACION = 3;

function aplicar_importacion(archivo, cb) {
  leer_storage([CLAVE_IMPORTACION_EN_CURSO], (d, err) => {
    if (err) { cb({ ok: false, motivo: "No se pudieron leer tus datos (" + err + "). NO se importó nada." }); return; }
    const candado = diccionario_de(d[CLAVE_IMPORTACION_EN_CURSO]);
    const desde = Number(candado.desde) || 0;
    if (desde && (Date.now() - desde) < MS_DE_CADUCIDAD_DEL_CANDADO) {
      cb({ ok: false, motivo: "Hay otra importación en marcha (¿tienes esta página abierta en otra pestaña?). " +
        "Espera a que termine y vuelve a intentarlo. No se importó nada." });
      return;
    }
    const mio = { desde: Date.now(), quien: identificador_de_respaldo() };
    escribir_storage({ [CLAVE_IMPORTACION_EN_CURSO]: mio }, (err2) => {
      if (err2) {
        cb({ ok: false, motivo: "NO se pudo empezar la importación (" + err2 + "). Tus datos siguen como estaban." });
        return;
      }
      importar_con_comprobacion(archivo, mio, 1, (resultado) => {
        soltar_candado_de_importacion(mio, () => cb(resultado));
      });
    });
  });
}

function soltar_candado_de_importacion(mio, cb) {
  leer_storage([CLAVE_IMPORTACION_EN_CURSO], (d) => {
    const actual = diccionario_de(d[CLAVE_IMPORTACION_EN_CURSO]);
    // Si el candado ya es de otra pestaña (el nuestro caducó), no se le quita.
    if (actual.quien && actual.quien !== mio.quien) { cb(); return; }
    borrar_de_storage(CLAVE_IMPORTACION_EN_CURSO, () => cb());
  });
}

function importar_con_comprobacion(archivo, mio, intento, cb) {
  leer_storage(null, (actuales, err) => {
    if (err) { cb({ ok: false, motivo: "No se pudieron leer tus datos (" + err + "). NO se importó nada." }); return; }

    const plan = planificar_sin_reventar(archivo, actuales);
    if (!plan.ok) { cb(plan); return; }

    const cambios = Object.assign({}, plan.cambios);
    cambios[CLAVE_TRASPASOS_IMPORTADOS] = historial_de_traspasos_actualizado(actuales, archivo, plan.resumen);
    cambios[CLAVE_IMPORTACION_EN_CURSO] = mio;   // el candado sigue siendo nuestro

    // Esta misma página escucha los cambios de `marcas_usuario`: la bandera evita
    // tratar nuestra propia escritura como "el popup agregó un correo".
    estamos_guardando = true;
    escribir_storage(cambios, (err2) => {
      estamos_guardando = false;
      if (err2) {
        cb({ ok: false, motivo: "NO se pudo guardar (" + err2 + "). No se importó nada: " +
          "tus datos de antes siguen exactamente como estaban." });
        return;
      }
      leer_storage(null, (despues, err3) => {
        if (err3) {
          cb({ ok: false, motivo: "Se escribió, pero NO se pudo comprobar que quedara bien (" + err3 + "). " +
            "Antes de fiarte, abre el Registro y míralo." });
          return;
        }
        let falta = "";
        try {
          falta = lo_que_falta_tras_importar(actuales, plan, despues);
          if (!falta) aplicar_marcas_importadas_en_la_pagina(despues);
        } catch (e) {
          // Ni siquiera la comprobación puede dejar la pantalla colgada.
          cb({ ok: false, motivo: "Se escribió, pero falló la comprobación de que quedara bien (" +
            (texto_plano(e && e.message) || "sin detalle") + "). Abre el Registro y míralo antes de fiarte." });
          return;
        }
        if (!falta) {
          plan.intentos = intento;
          cb(plan);
          return;
        }
        // Alguien escribió justo después y nos pisó: se vuelve a fusionar sobre
        // lo suyo (así no se pierde ni lo de él ni lo del archivo).
        if (intento < INTENTOS_DE_IMPORTACION) { importar_con_comprobacion(archivo, mio, intento + 1, cb); return; }
        cb({ ok: false, motivo: "Se intentó " + INTENTOS_DE_IMPORTACION + " veces y la comprobación siguió " +
          "fallando (" + falta + "). Revisa el Registro: puede que falte algo por importar." });
      });
    });
  });
}

// Comprobación de que la escritura quedó COMPLETA. Devuelve "" si todo está, o
// un texto con lo primero que falte. Se compara contra lo que se pretendía
// dejar escrito (`plan.cambios`), y donde no había cambio, contra lo que ya
// había: si algo de eso no aparece en la relectura, alguien lo pisó.
function lo_que_falta_tras_importar(antes, plan, despues) {
  const esperado = plan.cambios;

  const denuncias = lista_de(esperado.denuncias_registro || antes.denuncias_registro);
  const hay_denuncias = Object.create(null);
  lista_de(despues.denuncias_registro).forEach((d) => { hay_denuncias[identidad_de_denuncia(d)] = 1; });
  for (let i = 0; i < denuncias.length; i++) {
    if (!hay_denuncias[identidad_de_denuncia(denuncias[i])]) {
      return "falta una denuncia de " + (texto_plano(denuncias[i].marca) || "sin marca");
    }
  }

  const marcas = diccionario_de(esperado.marcas_usuario || antes.marcas_usuario);
  const marcas_despues = diccionario_de(despues.marcas_usuario);
  const nombres = Object.keys(marcas);
  for (let i = 0; i < nombres.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(marcas_despues, nombres[i])) return "falta la marca " + nombres[i];
  }

  const plataformas = diccionario_de(esperado.plataformas_usuario || antes.plataformas_usuario);
  const ident_despues = Object.create(null);
  const dic_despues = diccionario_de(despues.plataformas_usuario);
  Object.keys(dic_despues).forEach((k) => { ident_despues[identidad_de_plataforma(dic_despues[k])] = 1; });
  const claves = Object.keys(plataformas);
  for (let i = 0; i < claves.length; i++) {
    if (!ident_despues[identidad_de_plataforma(plataformas[claves[i]])]) {
      return "falta la plataforma " + (texto_plano(plataformas[claves[i]].red) || claves[i]);
    }
  }

  const plantillas = lista_de(esperado.plantillas || antes.plantillas);
  const hay_plantillas = Object.create(null);
  lista_de(despues.plantillas).forEach((p) => { hay_plantillas[identidad_de_plantilla(p)] = 1; });
  for (let i = 0; i < plantillas.length; i++) {
    if (!hay_plantillas[identidad_de_plantilla(plantillas[i])]) {
      return "falta la plantilla " + (texto_plano(plantillas[i].nombre) || "sin nombre");
    }
  }

  return "";
}

// Deja la página al día con lo que hay DE VERDAD en storage tras importar.
//  Ojo al orden: primero se meten en memoria TODAS las marcas que hay guardadas
//  (las del archivo y las que otra parte haya creado mientras tanto) y solo
//  DESPUÉS se rehace la foto. Al revés, una marca que estuviera en la foto pero
//  no en memoria se daría por "quitada aquí" y el siguiente "Guardar cambios" la
//  borraría.
function aplicar_marcas_importadas_en_la_pagina(despues) {
  const guardadas = diccionario_de(despues.marcas_usuario);
  if (!Object.keys(guardadas).length) return;
  incorporar_marcas_importadas(guardadas, despues.marcas_eliminadas);
  recordar_marcas_conocidas(guardadas);
}

// Mete en memoria (y en el desplegable) las marcas recién importadas. No toca
// el panel visible ni `clave_en_edicion`: lo que el usuario esté escribiendo se
// queda como está.
function incorporar_marcas_importadas(marcas_guardadas, marcas_borradas) {
  // El MISMO filtro que el planificador: una marca que el usuario borró aquí no
  // puede reaparecer en el desplegable. Si reapareciera, el siguiente "Guardar
  // cambios" la sacaría de `marcas_eliminadas` (ahí se recalcula como "las de
  // MARCAS_BASE que ya no están en memoria") y el borrado quedaría deshecho.
  const borradas = Object.create(null);
  lista_de(marcas_borradas).forEach((n) => { borradas[texto_plano(n)] = 1; });

  let entro_alguna = false;
  Object.keys(diccionario_de(marcas_guardadas)).forEach((nombre) => {
    if (nombre_de_marca_prohibido(nombre)) return;
    if (borradas[nombre]) return;                 // borrada aquí: no se revive
    if (existe_la_marca(marcas_en_memoria, nombre)) return;
    marcas_en_memoria[nombre] = Object.assign(Object.create(null), marcas_guardadas[nombre] || {});
    entro_alguna = true;
  });
  if (entro_alguna) poblar_desplegable_de_marcas(clave_en_edicion);
}

// ---------------------------------------------------------------------------
//  PINTADO (DOM). Todo con createElement/textContent: el archivo viene de
//  fuera y jamás se mete en innerHTML.
// ---------------------------------------------------------------------------
const caja_de_resultado_de_traspaso = () => document.getElementById("resultado_traspaso_datos");
const caja_de_vista_previa = () => document.getElementById("vista_previa_de_importacion");

function limpiar_caja(caja) { if (caja) caja.textContent = ""; }

function crear_linea(texto, clase) {
  const p = document.createElement("p");
  p.className = "linea_de_traspaso" + (clase ? " " + clase : "");
  p.textContent = texto;
  return p;
}

function crear_lista_de_lineas(titulo, lineas, clase) {
  const bloque = document.createElement("div");
  bloque.className = "bloque_de_traspaso" + (clase ? " " + clase : "");
  if (titulo) {
    const h = document.createElement("p");
    h.className = "titulo_de_bloque_de_traspaso";
    h.textContent = titulo;
    bloque.appendChild(h);
  }
  const ul = document.createElement("ul");
  ul.className = "lista_de_traspaso";
  lineas.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  });
  bloque.appendChild(ul);
  return bloque;
}

function mostrar_mensaje_de_traspaso(texto, clase) {
  const caja = caja_de_resultado_de_traspaso();
  if (!caja) return;
  limpiar_caja(caja);
  caja.appendChild(crear_linea(texto, clase));
}

// Igual pero SIN borrar lo que ya hay: para no llevarse por delante la pregunta
// de "¿se guardó el archivo?" y sus botones al contestar algo.
function anadir_mensaje_de_traspaso(texto, clase) {
  const caja = caja_de_resultado_de_traspaso();
  if (!caja) return;
  caja.appendChild(crear_linea(texto, clase));
}

// Las líneas del conteo de un volcado (se usan al exportar).
function lineas_del_resumen(resumen) {
  return [
    plural_de(resumen.denuncias, "denuncia en el Registro", "denuncias en el Registro"),
    plural_de(resumen.comprobantes, "comprobante (captura)", "comprobantes (capturas)"),
    plural_de(resumen.imagenes_de_respuesta, "imagen de respuesta", "imágenes de respuesta"),
    plural_de(resumen.marcas, "marca guardada", "marcas guardadas"),
    plural_de(resumen.plataformas, "plataforma propia", "plataformas propias"),
    plural_de(resumen.plantillas, "plantilla", "plantillas"),
    plural_de(resumen.fichas_de_correo, "sitio en la memoria de correos", "sitios en la memoria de correos") +
      " (" + plural_de(resumen.correos_recordados, "correo", "correos") + ")"
  ];
}

// ---------------------------------------------------------------------------
//  EXPORTAR (acción del botón).
// ---------------------------------------------------------------------------
function exportar_datos_a_un_archivo() {
  const boton = document.getElementById("boton_exportar_datos");
  if (boton) boton.disabled = true;
  mostrar_mensaje_de_traspaso("Preparando el archivo…", "");

  medir_datos_guardados((bytes) => {
   // Red de seguridad: ningún fallo puede dejar el botón deshabilitado y el
   // mensaje congelado en "Preparando el archivo…".
   try {
    if (bytes > BYTES_PARA_AVISAR_DE_TAMANO) {
      const seguir = confirm(
        "Tus datos ocupan " + texto_de_peso(bytes) + " (sobre todo las capturas).\n\n" +
        "Armar el archivo puede tardar y dejar la pestaña sin responder un rato.\n\n" +
        "¿Continuar de todos modos?");
      if (!seguir) {
        if (boton) boton.disabled = false;
        mostrar_mensaje_de_traspaso("Exportación cancelada. No se creó ningún archivo.", "aviso_de_traspaso");
        return;
      }
    }

    preparar_archivo_de_traspaso((archivo, err) => {
      if (err || !archivo) {
        mostrar_mensaje_de_traspaso("NO se pudo preparar el archivo (" + (err || "sin detalle") +
          "). No se creó ningún archivo y tus datos siguen intactos.", "error_de_traspaso");
        if (boton) boton.disabled = false;
        return;
      }
      try {
        const blob = new Blob(archivo.trozos, { type: "application/json" });
        // Los trozos ya están dentro del Blob: se sueltan para no tener dos
        // copias del volcado en memoria mientras se descarga.
        archivo.trozos.length = 0;
        pintar_resultado_de_exportacion(archivo, blob);
        descargar_blob(blob, archivo.nombre);
      } catch (e) {
        mostrar_mensaje_de_traspaso("No se pudo crear el archivo: " + texto_plano(e && e.message), "error_de_traspaso");
      }
      if (boton) boton.disabled = false;
    });
   } catch (e) {
    mostrar_mensaje_de_traspaso("No se pudo exportar (" +
      (texto_plano(e && e.message) || "sin detalle") + "). No se creó ningún archivo.", "error_de_traspaso");
    if (boton) boton.disabled = false;
   }
  });
}

function pintar_resultado_de_exportacion(archivo, blob) {
  const caja = caja_de_resultado_de_traspaso();
  if (!caja) return;
  limpiar_caja(caja);
  caja.appendChild(crear_linea("✓ Archivo creado: " + archivo.nombre + " (" + texto_de_peso(blob.size) + ")", "exito_de_traspaso"));
  caja.appendChild(crear_lista_de_lineas("Lleva dentro:", lineas_del_resumen(archivo.encabezado.resumen), ""));
  caja.appendChild(crear_linea(
    "Guárdalo en una memoria USB o donde prefieras y, en la otra computadora, usa " +
    "«⬆ Importar desde un archivo». Si algún número sale en cero, revisa que estés " +
    "exportando desde la computadora correcta.", "nota_de_traspaso"));

  // AQUÍ NO SE DA NADA POR HECHO. `descargar_blob` solo pulsa un enlace: si el
  // navegador está puesto en "preguntar dónde guardar cada archivo" y el usuario
  // CANCELA ese diálogo, no hay archivo ninguno. Averiguarlo desde aquí pediría
  // el permiso "downloads", que no se va a añadir por esto. Así que se pregunta:
  // la copia solo se apunta como hecha cuando el usuario dice que la tiene. Si no
  // contesta, el recordatorio del popup seguirá insistiendo, que es el lado
  // seguro del error.
  caja.appendChild(crear_linea(
    "¿Se guardó el archivo? Si tu navegador te preguntó dónde guardarlo y cancelaste, no hay copia.",
    "titulo_de_vista_previa"));
  const fila = document.createElement("div");
  fila.className = "botones_de_importacion";
  fila.appendChild(crear_boton_de_traspaso("boton_confirmar_respaldo_guardado",
    "✓ Sí, ya lo tengo guardado", "", confirmar_que_el_respaldo_se_guardo));
  fila.appendChild(crear_boton_de_traspaso("boton_respaldo_no_guardado",
    "No se guardó", "secundario", avisar_de_que_no_hay_respaldo));
  caja.appendChild(fila);
}

function crear_boton_de_traspaso(id, texto, clase_extra, al_pulsar) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.id = id;
  boton.className = "boton_de_traspaso" + (clase_extra ? " " + clase_extra : "");
  boton.textContent = texto;
  boton.addEventListener("click", al_pulsar);   // por addEventListener, nunca por onclick=
  return boton;
}

function confirmar_que_el_respaldo_se_guardo() {
  const boton = document.getElementById("boton_confirmar_respaldo_guardado");
  if (boton) boton.disabled = true;
  apuntar_que_se_hizo_respaldo((err) => {
    if (err) {
      // NO quedó apuntada: se dice tal cual y se deja volver a intentarlo. El
      // recordatorio seguirá avisando, que es justo lo que tiene que pasar.
      if (boton) boton.disabled = false;
      anadir_mensaje_de_traspaso("El archivo es tuyo, pero NO se pudo apuntar la copia (" + err +
        "). El recordatorio seguirá avisando; no pasa nada.", "error_de_traspaso");
      return;
    }
    if (boton) boton.textContent = "✓ Copia apuntada";
    const otro = document.getElementById("boton_respaldo_no_guardado");
    if (otro) otro.disabled = true;
    anadir_mensaje_de_traspaso("✓ Copia apuntada. El recordatorio no volverá a molestarte por ahora.",
      "exito_de_traspaso");
  });
}

function avisar_de_que_no_hay_respaldo() {
  anadir_mensaje_de_traspaso(
    "Entendido: no se apuntó ninguna copia. Vuelve a pulsar «⬇ Exportar todo a un archivo» " +
    "cuando puedas guardarlo; el recordatorio seguirá avisándote.", "aviso_de_traspaso");
}

// Descarga sin permiso "downloads": Blob + enlace con `download` en esta misma
// página de la extensión.
function descargar_blob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  // Se libera la URL cuando el navegador ya arrancó la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------------------------------------------------------------------------
//  IMPORTAR (acciones de la interfaz).
// ---------------------------------------------------------------------------
function al_elegir_archivo_para_importar(evento) {
  const entrada = evento.target;
  const fichero = entrada.files && entrada.files[0];
  cancelar_importacion_en_espera(false);
  if (!fichero) return;

  // Leer el archivo tiene tres copias en memoria a la vez (el texto, el objeto
  // del JSON.parse y lo que ya hay en storage). Con un respaldo enorme eso deja
  // la pestaña sin responder un buen rato: se avisa antes, igual que al exportar.
  if (fichero.size > BYTES_PARA_AVISAR_DE_TAMANO) {
    const seguir = confirm(
      "Ese archivo ocupa " + texto_de_peso(fichero.size) + ".\n\n" +
      "Leerlo puede tardar y dejar esta pestaña sin responder un rato.\n\n" +
      "¿Continuar de todos modos?");
    if (!seguir) {
      mostrar_mensaje_de_traspaso("Importación cancelada. No se tocó nada.", "aviso_de_traspaso");
      return;
    }
  }

  mostrar_mensaje_de_traspaso("Leyendo el archivo…", "");
  const lector = new FileReader();
  lector.onerror = () => {
    mostrar_mensaje_de_traspaso("No se pudo leer el archivo. No se tocó nada.", "error_de_traspaso");
  };
  lector.onload = () => {
    let archivo = null;
    try {
      archivo = JSON.parse(lector.result);
    } catch (e) {
      mostrar_mensaje_de_traspaso(
        "Ese archivo no es un JSON válido (¿se abrió y se guardó con otro programa?). No se tocó nada.",
        "error_de_traspaso");
      return;
    }
    const validacion = validar_archivo_de_traspaso(archivo);
    if (!validacion.ok) {
      mostrar_mensaje_de_traspaso(validacion.motivo + " No se tocó nada.", "error_de_traspaso");
      return;
    }
    planificar_importacion_contra_storage(archivo, (plan) => {
      if (!plan.ok) {
        // Sin repetirlo si el motivo ya lo dice.
        const cola = (plan.motivo.indexOf("No se tocó nada") >= 0) ? "" : " No se tocó nada.";
        mostrar_mensaje_de_traspaso(plan.motivo + cola, "error_de_traspaso");
        return;
      }
      archivo_de_traspaso_en_espera = archivo;
      pintar_vista_previa_de_importacion(plan, fichero);
    });
  };
  lector.readAsText(fichero);
}

function pintar_vista_previa_de_importacion(plan, fichero) {
  const caja = caja_de_vista_previa();
  if (!caja) return;
  limpiar_caja(caja);
  limpiar_caja(caja_de_resultado_de_traspaso());

  const r = plan.resumen;
  caja.appendChild(crear_linea("Vista previa — todavía NO se ha cambiado nada.", "titulo_de_vista_previa"));

  const enc = plan.encabezado;
  const origen = [];
  if (texto_plano(fichero && fichero.name)) origen.push(fichero.name);
  if (texto_plano(enc.fecha)) origen.push("del " + texto_plano(enc.fecha).slice(0, 10));
  if (texto_plano(enc.version_extension)) origen.push("extensión " + texto_plano(enc.version_extension));
  caja.appendChild(crear_linea("Archivo: " + origen.join(" · "), "nota_de_traspaso"));

  caja.appendChild(crear_lista_de_lineas("Se AÑADIRÍA:", [
    plural_de(r.denuncias_nuevas, "denuncia nueva", "denuncias nuevas") +
      " (" + plural_de(r.comprobantes_nuevos, "con comprobante", "con comprobante") + ")",
    plural_de(r.marcas_nuevas, "marca nueva", "marcas nuevas") +
      (plan.nombres_nuevos.marcas.length ? ": " + plan.nombres_nuevos.marcas.join(", ") : ""),
    plural_de(r.plataformas_nuevas, "plataforma nueva", "plataformas nuevas") +
      (plan.nombres_nuevos.plataformas.length ? ": " + plan.nombres_nuevos.plataformas.join(", ") : ""),
    plural_de(r.plantillas_nuevas, "plantilla nueva", "plantillas nuevas"),
    plural_de(r.fichas_de_correo_nuevas, "sitio nuevo en la memoria de correos", "sitios nuevos en la memoria de correos") +
      " y " + plural_de(r.correos_nuevos, "correo nuevo", "correos nuevos")
  ], "bloque_anadir"));

  // A DÓNDE VAN A IR LAS DENUNCIAS. La memoria de correos decide el "Para" de
  // los reportes por correo (se ordena por veces de uso y correo.html rellena el
  // del sitio más probable), así que un correo colado ahí con un contador alto
  // se convertiría en el destinatario por omisión. Por eso no basta con decir
  // CUÁNTOS entran: hay que enseñar CUÁLES, antes de aceptar.
  if (plan.nombres_nuevos.correos.length) {
    caja.appendChild(crear_lista_de_lineas(
      "✉️ Correos que entrarían en la memoria (a estas direcciones se enviarían las denuncias de esos sitios):",
      lista_recortada(plan.nombres_nuevos.correos, 40), "bloque_anadir"));
  }

  caja.appendChild(crear_lista_de_lineas("Se RESPETA lo que ya tienes aquí:", [
    plural_de(r.denuncias_respetadas, "denuncia del archivo ya está en esta computadora", "denuncias del archivo ya están en esta computadora") + " (se dejan como están)",
    plural_de(r.marcas_respetadas, "marca ya existe aquí", "marcas ya existen aquí") + " (no se pisan)",
    plural_de(r.plataformas_respetadas, "plataforma ya existe aquí", "plataformas ya existen aquí"),
    plural_de(r.plantillas_respetadas, "plantilla ya existe aquí", "plantillas ya existen aquí"),
    "La lista de marcas ocultadas (marcas_eliminadas) NO se importa nunca: si se trajera, te harían falta marcas en esta computadora."
  ], "bloque_respetar"));

  if (plan.ya_se_importo) {
    caja.appendChild(crear_linea(
      "Este mismo archivo ya se importó aquí el " + plan.ya_se_importo.slice(0, 10) +
      ". No pasa nada por repetirlo: de los contadores de uso solo entra lo que haya " +
      "subido desde entonces, así que no se suman dos veces.", "nota_de_traspaso"));
  } else if (r.correos_sumados) {
    caja.appendChild(crear_linea(
      "Se sumarán los contadores de uso de " + plural_de(r.correos_sumados, "correo", "correos") +
      " que están en las dos computadoras.", "nota_de_traspaso"));
  }

  if (plan.coincidencias_de_consecutivo.length) {
    caja.appendChild(crear_lista_de_lineas(
      "⚠ " + plural_de(plan.coincidencias_de_consecutivo.length, "número consecutivo repetido", "números consecutivos repetidos") +
      " (no se renumera nada: esos números ya se usaron en denuncias enviadas)",
      plan.coincidencias_de_consecutivo.map(
        (c) => "#" + c.consecutivo + " de " + c.marca + " — aquí: " + c.aqui + " | entra: " + c.entra),
      "bloque_aviso"));
  }

  // Marcas que el usuario borró AQUÍ y que el archivo trae: no se reviven solas,
  // pero se le dicen para que sepa que esa decisión suya sigue en pie y pueda
  // recuperarlas a mano si le apetece.
  if (plan.nombres_nuevos.borradas_aqui.length) {
    caja.appendChild(crear_lista_de_lineas(
      plural_de(r.marcas_borradas_aqui, "marca del archivo NO entra porque la borraste en esta computadora",
        "marcas del archivo NO entran porque las borraste en esta computadora") +
      " (si la quieres de vuelta, créala a mano)",
      lista_recortada(plan.nombres_nuevos.borradas_aqui, 40), "bloque_aviso"));
  }

  if (r.otras_claves_nuevas.length) {
    caja.appendChild(crear_linea("También entran datos nuevos de: " + r.otras_claves_nuevas.join(", "), "nota_de_traspaso"));
  }

  const hay_algo = Object.keys(plan.cambios).length > 0;
  if (!hay_algo) {
    caja.appendChild(crear_linea(
      "Este archivo no trae nada nuevo: ya tienes aquí todo lo que lleva dentro.", "nota_de_traspaso"));
  }

  caja.hidden = false;
  const confirmar = document.getElementById("boton_confirmar_importacion");
  const cancelar = document.getElementById("boton_cancelar_importacion");
  if (confirmar) { confirmar.hidden = false; confirmar.disabled = !hay_algo; }
  if (cancelar) cancelar.hidden = false;
}

function confirmar_importacion_de_datos() {
  if (!archivo_de_traspaso_en_espera) return;
  const confirmar = document.getElementById("boton_confirmar_importacion");
  if (confirmar) confirmar.disabled = true;
  mostrar_mensaje_de_traspaso("Añadiendo los datos…", "");

  // Red de seguridad: pase lo que pase, la pantalla NO se queda congelada en
  // "Añadiendo los datos…" con el botón muerto.
  try {
    aplicar_importacion(archivo_de_traspaso_en_espera, al_terminar_de_importar);
  } catch (e) {
    cancelar_importacion_en_espera(true);
    mostrar_mensaje_de_traspaso("No se pudo importar (" +
      (texto_plano(e && e.message) || "sin detalle") + "). No se tocó nada.", "error_de_traspaso");
  }

  function al_terminar_de_importar(plan) {
    cancelar_importacion_en_espera(true);
    if (!plan.ok) {
      // El motivo ya dice qué pasó y en qué estado quedaron los datos: NO se le
      // añade un "no se tocó nada" que podría ser mentira (hay fallos que pasan
      // con la escritura ya hecha). Y no se pinta NI UN resumen de éxito.
      mostrar_mensaje_de_traspaso(plan.motivo, "error_de_traspaso");
      return;
    }
    pintar_resultado_de_importacion(plan);
  }
}

function pintar_resultado_de_importacion(plan) {
  const caja = caja_de_resultado_de_traspaso();
  if (!caja) return;
  const r = plan.resumen;
  limpiar_caja(caja);
  caja.appendChild(crear_linea("✓ Listo. Tus datos de antes siguen intactos.", "exito_de_traspaso"));
  caja.appendChild(crear_lista_de_lineas("Se añadió:", [
    plural_de(r.denuncias_nuevas, "denuncia", "denuncias") + " (" + plural_de(r.comprobantes_nuevos, "con comprobante", "con comprobante") + ")",
    plural_de(r.marcas_nuevas, "marca", "marcas"),
    plural_de(r.plataformas_nuevas, "plataforma", "plataformas"),
    plural_de(r.plantillas_nuevas, "plantilla", "plantillas"),
    plural_de(r.correos_nuevos, "correo nuevo", "correos nuevos") + " en la memoria de correos" +
      (r.correos_sumados ? " y " + plural_de(r.correos_sumados, "contador sumado", "contadores sumados") : "")
  ], "bloque_anadir"));
  caja.appendChild(crear_lista_de_lineas("Se respetó por ya existir aquí:", [
    plural_de(r.denuncias_respetadas, "denuncia", "denuncias"),
    plural_de(r.marcas_respetadas, "marca", "marcas"),
    plural_de(r.plataformas_respetadas, "plataforma", "plataformas"),
    plural_de(r.plantillas_respetadas, "plantilla", "plantillas")
  ], "bloque_respetar"));

  if (plan.coincidencias_de_consecutivo.length) {
    caja.appendChild(crear_lista_de_lineas(
      "⚠ Revisa estos números consecutivos repetidos (NO se renumeró nada):",
      plan.coincidencias_de_consecutivo.map(
        (c) => "#" + c.consecutivo + " de " + c.marca + " — aquí: " + c.aqui + " | entró: " + c.entra),
      "bloque_aviso"));
  }
  caja.appendChild(crear_linea(
    "El Registro y el popup ya tienen lo nuevo. Puedes importar este archivo otra vez cuando quieras: " +
    "no se duplica nada.", "nota_de_traspaso"));
}

function cancelar_importacion_en_espera(silencioso) {
  archivo_de_traspaso_en_espera = null;
  const caja = caja_de_vista_previa();
  if (caja) { limpiar_caja(caja); caja.hidden = true; }
  const confirmar = document.getElementById("boton_confirmar_importacion");
  const cancelar = document.getElementById("boton_cancelar_importacion");
  if (confirmar) { confirmar.hidden = true; confirmar.disabled = false; }
  if (cancelar) cancelar.hidden = true;
  const entrada = document.getElementById("archivo_para_importar");
  if (entrada) entrada.value = ""; // permite volver a elegir el MISMO archivo
  if (!silencioso) limpiar_caja(caja_de_resultado_de_traspaso());
}

// ---------------------------------------------------------------------------
//  Eventos de la sección de traspaso.
// ---------------------------------------------------------------------------
// El cintillo del popup abre esta página como "opciones.html#respaldo": la
// sección tiene que quedar A LA VISTA, no hacérsela buscar al usuario.
function mostrar_seccion_de_respaldo_si_toca() {
  if (String(location.hash || "").toLowerCase() !== "#respaldo") return;
  const caja = document.getElementById("caja_traspaso_datos");
  if (!caja) return;
  caja.scrollIntoView({ block: "center" });
  caja.classList.add("caja_traspaso_datos_resaltada");
  setTimeout(() => caja.classList.remove("caja_traspaso_datos_resaltada"), 2500);
}
mostrar_seccion_de_respaldo_si_toca();

document.getElementById("boton_exportar_datos").addEventListener("click", exportar_datos_a_un_archivo);
document.getElementById("archivo_para_importar").addEventListener("change", al_elegir_archivo_para_importar);
document.getElementById("boton_confirmar_importacion").addEventListener("click", confirmar_importacion_de_datos);
document.getElementById("boton_cancelar_importacion").addEventListener("click", () => cancelar_importacion_en_espera(false));
