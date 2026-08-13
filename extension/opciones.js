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
