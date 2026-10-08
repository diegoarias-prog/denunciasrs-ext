// ============================================================================
//  AGENDA + MEMORIA DE CORREOS DE DENUNCIA
//
//  Dos cosas distintas viven aquí:
//
//  1) DESTINOS FIJOS POR RED (FIJOS_POR_RED): correos que van SIEMPRE en toda
//     denuncia por correo de esa red, sea cual sea la marca, la categoría del
//     reporte (propiedad intelectual, difamación, apps, lo que sea) y el
//     formato. Se aplican solos a TODOS los formularios tipo "email" de esa red
//     (ver el final de datos/formularios.js) y también al abrir correo.html.
//     TikTok: copyright@tiktok.com, ip-reports@tiktok.com, ip_reports@tiktok.com.
//
//  2) MEMORIA DE CORREOS (chrome.storage.local -> "memoria_correos"): la libreta
//     de direcciones que se llena SOLA. Cada vez que se envía (o se abre en
//     Gmail / en el cliente de correo) un reporte, se guarda a qué correo se
//     mandó, indexado por el DOMINIO del sitio denunciado (softonic.com,
//     mediafire.com…). La próxima vez que se denuncie algo de ese mismo sitio,
//     correo.html propone —y rellena si el "Para" viene vacío— el correo que ya
//     funcionó, sin tener que buscarlo otra vez en la web oficial.
//     La memoria arranca con una SEMILLA de correos ya confirmados y se puede
//     ver/editar/borrar a mano en la página "📒 Correos" (memoria_correos.html).
//
//  3) CLAVE DE LA RED (clave_de_red): además del sitio denunciado, cada reporte
//     se apunta también bajo la clave de SU RED. Si la red tiene dominio conocido
//     (DOMINIO_DE_RED) la clave es ese dominio ("cloudflare.com"); si no —las
//     plataformas que crea el usuario en el popup, con nombres libres— la clave
//     es "red:" + el nombre en minúsculas ("red:miplataforma"). Un dominio nunca
//     lleva ":", así que las dos clases de clave no pueden chocar.
//     Una clave "red:" SOLO guarda correos "para siempre": muchas de esas redes
//     son categorías ("Apps maliciosas", "Delisting") cuyo buzón depende del
//     sitio, así que no se le apunta nada al enviar ni se usa para sugerir.
//     Y las que son categorías conocidas (REDES_POR_SITIO, punto 5) ni siquiera
//     guardan "para siempre" bajo "red:": lo guardan bajo el sitio denunciado.
//     SEGURIDAD: ninguna clave con nombre del prototipo ("toString",
//     "constructor"…) y cada correo guardado tiene que ser UNO solo.
//
//  4) CORREOS GUARDADOS PARA SIEMPRE (`siempre: true` en la ficha de una red):
//     con el botón "💾 Guardar estos correos para futuros reportes" de
//     correo.html se guarda EXACTAMENTE la lista del "Para" de ese momento, y en
//     cada reporte futuro de esa red se ponen solos en el "Para". Una ficha
//     "siempre" no se mezcla con la semilla: es la lista que dejó el usuario, así
//     que quitar un correo y volver a guardar lo quita de verdad.
//
//  5) REDES QUE SON CATEGORÍAS POR SITIO (REDES_POR_SITIO): hoy SOLO "Apps
//     maliciosas" (Delisting, Ofertas falsas y Banguat siguen por red, como en la
//     v1.2.101). No es una plataforma con UN buzón: agrupa muchos sitios
//     (aptoide.com, apkpure.com…) y cada uno tiene el suyo. En ellas los correos "para siempre" se guardan y se leen bajo el
//     DOMINIO del enlace denunciado, NUNCA bajo "red:<categoría>": si no, los
//     buzones de Aptoide se ponían solos en la denuncia de APKPure.
//     Las fichas "red:<categoría>" con `siempre` que dejaron versiones
//     anteriores se MIGRAN solas al leer (migrar_categorias): a la ficha del
//     sitio si todos sus correos son de un mismo sitio, o se APAGAN (siguen
//     visibles en "📒 Correos", pero ya no se ponen solas). No se borra nada.
// ============================================================================
(function () {
  "use strict";

  // ---- 1) Destinos fijos por red (clave = nombre de la red en minúsculas) ----
  var FIJOS_POR_RED = {
    "tiktok": ["copyright@tiktok.com", "ip-reports@tiktok.com", "ip_reports@tiktok.com"],
    // Cloudflare: abuso general, respuestas de abuso y abuso del registrador.
    "cloudflare": ["abuse@cloudflare.com", "abusereply@cloudflare.com", "registrar-abuse@cloudflare.com"]
  };

  // Dominio "oficial" de cada red, para que un reporte de esa red comparta la
  // misma ficha de memoria que un enlace denunciado de ese mismo sitio.
  var DOMINIO_DE_RED = {
    "tiktok": "tiktok.com",
    "facebook": "facebook.com",
    "instagram": "instagram.com",
    "whatsapp": "whatsapp.com",
    "linkedin": "linkedin.com",
    "youtube": "youtube.com",
    "x": "x.com",
    "x / twitter": "x.com",
    "twitter": "x.com",
    "telegram": "telegram.org",
    "github": "github.com",
    "studocu": "studocu.com",
    "scribd": "scribd.com",
    "cloudflare": "cloudflare.com"
  };

  // ---- 2) Semilla de la agenda: correos de denuncia YA confirmados ----
  //  clave = dominio del sitio al que se le denuncia (no el del contenido).
  var SEMILLA = {
    "tiktok.com":    { nombre: "TikTok",    correos: ["copyright@tiktok.com", "ip-reports@tiktok.com", "ip_reports@tiktok.com"], nota: "Propiedad intelectual / derechos de autor (van los tres siempre)" },
    "softonic.com":  { nombre: "Softonic",  correos: ["dmca.softonic@delevitagent.com"], nota: "DMCA / apps no oficiales que suplantan a la marca" },
    "facebook.com":  { nombre: "Facebook",  correos: ["ip@fb.com"], nota: "Propiedad intelectual" },
    "instagram.com": { nombre: "Instagram", correos: ["ip@instagram.com"], nota: "Propiedad intelectual" },
    "whatsapp.com":  { nombre: "WhatsApp",  correos: ["ip@whatsapp.com"], nota: "Propiedad intelectual" },
    "studocu.com":   { nombre: "Studocu",   correos: ["privacy@studocu.com", "support@studocu.com"], nota: "Eliminación de información" },
    "scribd.com":    { nombre: "Scribd",    correos: ["copyright@scribd.com", "support@scribd.com"], nota: "Información confidencial / derechos de autor" },
    "cloudflare.com": { nombre: "Cloudflare", correos: ["abuse@cloudflare.com", "abusereply@cloudflare.com", "registrar-abuse@cloudflare.com"], nota: "Sitios fraudulentos / phishing alojados o registrados en Cloudflare (van los tres siempre)" },
    // Tiendas de apps (red "Apps maliciosas"): cada una con SUS buzones. Son
    // sugerencias para ESE sitio, nunca para otra tienda de la misma categoría.
    "aptoide.com":   { nombre: "Aptoide",   correos: ["support@aptoide.com", "publishers@aptoide.com", "partners@aptoide.com", "personal-data@aptoide.com", "abuse.report@aptoide.com"], nota: "Apps maliciosas / no oficiales publicadas en Aptoide" },
    "apkpure.com":   { nombre: "APKPure",   correos: ["support@apkpure.com", "market@apkpure.com"], nota: "Apps maliciosas / no oficiales publicadas en APKPure" },
    "filehippo.com": { nombre: "FileHippo", correos: ["dmca.filehippo@delevitagent.com"], nota: "DMCA / apps no oficiales publicadas en FileHippo (agente DMCA)" },
    "apkcombo.com":  { nombre: "APKCombo",  correos: ["support@apkcombo.com"], nota: "Apps maliciosas / no oficiales publicadas en APKCombo" }
  };

  // ---- 5) Redes que son CATEGORÍAS: su buzón depende del sitio denunciado ----
  //  Reportes por correo de fábrica con `destino: ""` (datos/formularios.js) cuya
  //  "red" no es una plataforma sino un tipo de sitio y cuyo buzón es el de CADA
  //  sitio. Clave = nombre de la red en minúsculas. Facebook/Instagram/WhatsApp/TikTok también tienen algún
  //  reporte con destino vacío (difamación), pero son UNA plataforma con dominio
  //  propio: esas no van aquí. Las plataformas que crea el usuario tampoco.
  //  `buzon_del_sitio`: el buzón de denuncia es del PROPIO sitio denunciado (o un
  //  agente suyo que está en la SEMILLA). Ahí las sugerencias aprendidas que no son
  //  de ese sitio se esconden (ver sugerencias): son restos del fallo de las
  //  categorías (buzones de Aptoide aprendidos en apkpure.com).
  //  SOLO "Apps maliciosas" (decisión del usuario, 2026-10-08: «esos cambios solo
  //  eran en Apps maliciosas, lo demás está funcionando bien»). Delisting, Ofertas
  //  falsas de trabajo y Sitios maliciosos Banguat siguen como en la v1.2.101: su
  //  lista "para siempre" es la de la RED ("red:delisting"…). Lo que la v1.2.103 les
  //  cambió en los datos lo deshace restaurar_categorias (más abajo).
  var REDES_POR_SITIO = {
    "apps maliciosas": { buzon_del_sitio: true }
  };
  // Las que la v1.2.103 trató por sitio y vuelven a ir por red (ver restaurar_categorias).
  var CATEGORIAS_DEVUELTAS_A_RED = {
    "delisting": "Delisting",
    "ofertas falsas de trabajo": "Ofertas falsas de trabajo",
    "sitios maliciosos banguat": "Sitios maliciosos Banguat"
  };

  var CLAVE_MEMORIA = "memoria_correos";

  // Sufijos de dos niveles (dominio.com.gt, dominio.co.uk…): para quedarnos con
  // el dominio de verdad y no con "com.gt".
  var SEGUNDO_NIVEL = { com: 1, co: 1, net: 1, org: 1, gob: 1, gov: 1, edu: 1, ac: 1, mil: 1, info: 1 };

  function texto(s) { return (s === 0 ? "0" : (s || "")) + ""; }

  // Dominio (registrable) de una URL o de un host suelto. "" si no se puede.
  function dominio_de(u) {
    var v = texto(u).trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
    var host = "";
    try { host = new URL(v).hostname; } catch (e) { return ""; }
    host = host.replace(/^www\./i, "").toLowerCase();
    if (!host || host.indexOf(".") < 0) return "";
    var p = host.split(".");
    if (p.length <= 2) return host;
    var ultimo = p[p.length - 1], penultimo = p[p.length - 2];
    if (ultimo.length === 2 && SEGUNDO_NIVEL[penultimo]) return p.slice(-3).join(".");
    return p.slice(-2).join(".");
  }

  // Dominios (sin repetir) de una lista de URLs.
  function dominios_de(urls) {
    var out = [], vistos = {};
    (Array.isArray(urls) ? urls : []).forEach(function (u) {
      var d = dominio_de(u);
      if (d && !vistos[d]) { vistos[d] = 1; out.push(d); }
    });
    return out;
  }

  // Correos VÁLIDOS que hay en un texto (acepta comas, punto y coma o saltos).
  // Filtro estricto: lo que se guarde o se ponga en el "Para" tiene que ser un
  // correo de verdad (evita basura y cabeceras raras en el envío).
  function lista_correos(t) {
    var out = [], vistos = {};
    texto(t).split(/[\s,;]+/).forEach(function (c) {
      c = c.trim().replace(/^[<("']+|[>)"'.,;]+$/g, "");
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(c)) return;
      var k = c.toLowerCase();
      if (vistos[k]) return;
      vistos[k] = 1;
      out.push(c);
    });
    return out;
  }

  // UNA dirección de correo, y nada más. Devuelve la dirección (sin espacios en los
  // extremos) o "" si `t` no es exactamente un correo válido. Lo que se GUARDA en la
  // memoria pasa por aquí: una entrada "ip@instagram.com\r\nx@evil.com" contaría
  // como un correo y, al pasar al "Para", se partiría en dos destinatarios.
  var REGEX_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  function correo_unico(t) {
    var c = texto(t).trim();
    return REGEX_CORREO.test(c) ? c : "";
  }

  // Clave de ficha ADMITIDA: cualquier texto no vacío salvo los nombres que existen
  // en el prototipo de los objetos ("__proto__", "constructor", "toString",
  // "valueOf", "hasOwnProperty"…) y "prototype": una clave así rompía leer() y
  // dejaba la memoria vacía. NO se exige forma de dominio: versiones anteriores
  // guardaban la clave tal cual la escribía el usuario ("softonic", "mi sitio") y
  // esas fichas no pueden desaparecer. Los dominios IDN (.xn--p1ai) también valen.
  function clave_valida(k) {
    var t = texto(k);
    return t.trim() !== "" && t !== "prototype" && t !== "__proto__" && !(t in Object.prototype);
  }
  function propia(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

  // Une varios textos/listas de correos en una sola cadena "a@x, b@y" sin repetir.
  function unir_correos() {
    var partes = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      partes = partes.concat(Array.isArray(a) ? a : [texto(a)]);
    }
    return lista_correos(partes.join(", ")).join(", ");
  }

  // Correos fijos de una red (array vacío si esa red no tiene).
  function fijos_de_red(red) {
    var k = texto(red).trim().toLowerCase();
    return propia(FIJOS_POR_RED, k) ? FIJOS_POR_RED[k] : [];
  }

  function dominio_de_red(red) {
    var k = texto(red).trim().toLowerCase();
    return propia(DOMINIO_DE_RED, k) ? DOMINIO_DE_RED[k] : "";
  }

  // Clave de memoria PROPIA de una red. Toda red tiene una:
  //   - con dominio conocido (DOMINIO_DE_RED): ese dominio ("cloudflare.com"), y así
  //     comparte ficha con los enlaces denunciados de ese mismo sitio;
  //   - si no (plataformas creadas por el usuario, nombres libres): PREFIJO_RED +
  //     el nombre en minúsculas con los espacios juntados ("red:mi plataforma").
  //     Un dominio nunca lleva ":", así que no puede chocar con uno;
  //   - sin red: "".
  var PREFIJO_RED = "red:";
  function clave_de_red(red) {
    var dom = dominio_de_red(red);
    if (dom) return dom;
    var nombre = texto(red).trim().toLowerCase().replace(/\s+/g, " ");
    return nombre ? PREFIJO_RED + nombre : "";
  }

  function es_clave_de_categoria(k) { return texto(k).indexOf(PREFIJO_RED) === 0; }

  // ¿Es esta red una CATEGORÍA cuyo buzón depende del sitio denunciado?
  // (ver REDES_POR_SITIO). Una red con dominio propio nunca lo es.
  function es_red_por_sitio(red) {
    var k = texto(red).trim().toLowerCase().replace(/\s+/g, " ");
    return !!k && propia(REDES_POR_SITIO, k) && !dominio_de_red(red);
  }
  // ¿Es una categoría cuyo buzón es el del PROPIO sitio denunciado? (REDES_POR_SITIO)
  function buzon_del_sitio(red) {
    var k = texto(red).trim().toLowerCase().replace(/\s+/g, " ");
    return es_red_por_sitio(red) && REDES_POR_SITIO[k].buzon_del_sitio === true;
  }
  // ¿Es esta clave de memoria la "red:<categoría>" de una de esas redes?
  function es_clave_de_red_por_sitio(k) {
    var t = texto(k);
    return t.indexOf(PREFIJO_RED) === 0 && propia(REDES_POR_SITIO, t.slice(PREFIJO_RED.length));
  }

  // DÓNDE se guardan (y de dónde se leen) los correos "para siempre" de un reporte:
  //   - red normal (TikTok, Cloudflare, plataformas del usuario): su clave de red;
  //   - red POR SITIO (categoría): el dominio del enlace denunciado. Sin enlaces no
  //     hay dónde ("sin_enlace"); con enlaces de VARIOS sitios no se elige a ciegas
  //     ("varios_sitios"): hace falta `sitio_elegido`, que tiene que ser uno de ellos.
  //  Devuelve { clave, por_sitio, sitios:[dominios de los enlaces], motivo }.
  function destino_para_siempre(red, urls, sitio_elegido) {
    if (!es_red_por_sitio(red)) {
      var k = clave_de_red(red);
      return { clave: k, por_sitio: false, sitios: [], motivo: k ? "" : "sin_red" };
    }
    var sitios = dominios_de(urls);
    if (!sitios.length) return { clave: "", por_sitio: true, sitios: sitios, motivo: "sin_enlace" };
    if (sitios.length === 1) return { clave: sitios[0], por_sitio: true, sitios: sitios, motivo: "" };
    var elegido = texto(sitio_elegido).trim().toLowerCase();
    if (elegido && sitios.indexOf(elegido) >= 0) return { clave: elegido, por_sitio: true, sitios: sitios, motivo: "" };
    return { clave: "", por_sitio: true, sitios: sitios, motivo: "varios_sitios" };
  }

  // Claves de memoria que aplican a un reporte: la clave de la red + los
  // dominios de los enlaces que se están denunciando. ORDEN: el dominio de la red
  // (si lo tiene) va primero, como siempre; una clave "red:" va al FINAL, detrás
  // de los sitios denunciados.
  // OJO: una clave "red:" (red SIN dominio) SOLO sirve para los correos guardados
  // "para siempre". Muchas de esas "redes" son categorías ("Apps maliciosas",
  // "Delisting", "Ofertas falsas"…) cuyo buzón depende del sitio: si se fueran
  // acumulando ahí los buzones de cada envío, un sitio nuevo sin ficha heredaría
  // el de OTRO sitio. Por eso recordar_uso no la llena y sugerencias solo la usa
  // si está marcada `siempre`. Y en una red POR SITIO (REDES_POR_SITIO) la clave
  // "red:" ni siquiera entra: ahí solo cuentan los sitios denunciados.
  function claves_de(red, urls) {
    var claves = [], vistos = {};
    var de_red = es_red_por_sitio(red) ? "" : clave_de_red(red);
    var primero = de_red.indexOf(PREFIJO_RED) === 0 ? [] : [de_red];
    var ultimo = primero.length ? [] : [de_red];
    primero.concat(dominios_de(urls), ultimo).forEach(function (d) {
      if (d && !vistos[d]) { vistos[d] = 1; claves.push(d); }
    });
    return claves;
  }

  // ---- MIGRACIÓN: fichas "red:<categoría>" con `siempre` de versiones anteriores ----
  //  Antes, el botón 💾 de una red POR SITIO guardaba bajo "red:apps maliciosas", y
  //  esa lista se ponía sola en TODOS los sitios de la categoría. Ahora:
  //   - si todos sus correos son de UN mismo sitio, sus correos se MUEVEN a la
  //     ficha de ese sitio (fusionando sin duplicar). "siempre" solo se enciende
  //     ahí si la ficha resultante tiene ÚNICAMENTE correos de ese sitio
  //     (correo_es_del_sitio): una apkpure.com con buzones de Aptoide aprendidos
  //     durante el fallo NO se enciende, o los de Aptoide se pondrían solos;
  //   - si el sitio está BORRADO a mano (`oculto`) o es el dominio de una red con
  //     dominio propio que ya tiene su lista "siempre", no se mueve nada;
  //   - en esos casos, y si los correos son de varios sitios, la ficha de la
  //     categoría se APAGA (`siempre: false`): sigue en "📒 Correos", no se pone sola.
  //  Nada se borra. Es IDEMPOTENTE y corre en CADA lectura (leer_memoria), así que
  //  también cubre lo que llegue por la importación de opciones.js. Lo que hace se
  //  apunta en CLAVE_AVISOS para que "📒 Correos" se lo enseñe al usuario.

  // Dominios de las redes con dominio propio (facebook.com, tiktok.com…). Sus
  // fichas van por RED: las migraciones nunca les encienden "siempre".
  function es_dominio_de_red(sitio) {
    var s = texto(sitio).trim().toLowerCase();
    return Object.keys(DOMINIO_DE_RED).some(function (k) { return DOMINIO_DE_RED[k] === s; });
  }

  // ¿Es `correo` de `sitio`? SOLO si el dominio del correo es EXACTAMENTE el del
  // sitio, o si el correo está en la SEMILLA de ese sitio (agentes DMCA como
  // dmca.filehippo@delevitagent.com). Sin subdominios: en github.io, netlify.app y
  // compañía cada subdominio es de un dueño distinto.
  function correo_es_del_sitio(correo, sitio) {
    var c = texto(correo).trim().toLowerCase(), s = texto(sitio).trim().toLowerCase();
    if (!c || !s) return false;
    if ((c.split("@")[1] || "") === s) return true;
    return propia(SEMILLA, s) && SEMILLA[s].correos.some(function (x) { return x.toLowerCase() === c; });
  }

  // Correos de una ficha que NO son de su sitio.
  function correos_ajenos(f, sitio) {
    return (f && Array.isArray(f.correos) ? f.correos : []).map(function (o) { return texto(o && o.correo); })
      .filter(function (c) { return c && !correo_es_del_sitio(c, sitio); });
  }

  // Une `correos` ([{correo, veces, ultima}]) a la ficha `f` sin duplicar.
  // Devuelve los que de verdad se añadieron.
  function fusionar_correos(f, correos) {
    if (!Array.isArray(f.correos)) f.correos = [];
    var nuevos = [];
    correos.forEach(function (c) {
      var ya = f.correos.filter(function (o) { return texto(o && o.correo).toLowerCase() === c.correo.toLowerCase(); })[0];
      if (ya) { ya.veces = Math.max(ya.veces || 0, c.veces || 0); if (texto(c.ultima) > texto(ya.ultima)) ya.ultima = c.ultima; return; }
      f.correos.push({ correo: c.correo, veces: c.veces || 0, ultima: texto(c.ultima) });
      nuevos.push(c.correo);
    });
    return nuevos;
  }

  // Al ENCENDER "siempre" en un sitio de la semilla, sus correos de fábrica entran
  // también: una ficha "siempre" no se mezcla con la semilla, y sin esto las
  // sugerencias de ese sitio se quedarían reducidas a lo enviado.
  function sumar_semilla(f, sitio) {
    if (!propia(SEMILLA, sitio)) return;
    fusionar_correos(f, SEMILLA[sitio].correos.map(function (c) { return { correo: c, veces: 0, ultima: "" }; }));
  }

  // Sitio al que pertenecen TODOS estos correos, o "" si no hay uno solo:
  //  1) un sitio de la SEMILLA cuya lista los contiene todos (FileHippo usa un
  //     agente con otro dominio: dmca.filehippo@delevitagent.com);
  //  2) si no, el dominio EXACTO de los correos, si es el mismo para todos.
  function sitio_de_correos(dirs) {
    if (!dirs.length) return "";
    var bajos = dirs.map(function (d) { return d.toLowerCase(); });
    var de_semilla = Object.keys(SEMILLA).filter(function (k) {
      var suyos = SEMILLA[k].correos.map(function (c) { return c.toLowerCase(); });
      return bajos.every(function (d) { return suyos.indexOf(d) >= 0; });
    });
    if (de_semilla.length === 1) return de_semilla[0];
    var doms = {};
    bajos.forEach(function (d) { doms[d.split("@")[1] || ""] = 1; });
    var lista = Object.keys(doms);
    return (lista.length === 1 && dominio_de(lista[0]) === lista[0] && clave_valida(lista[0])) ? lista[0] : "";
  }

  // Función PURA sobre el objeto crudo `mem` (lo modifica). Devuelve la lista de
  // cambios [{ de, a, correos, razon, ajenos }]; vacía si nada cambió.
  //   razon: "encendida" (movida y "siempre"), "ya_encendida" (movida a una lista
  //   "siempre" que ya existía), "ajenos", "apagada", "red_con_dominio" (movida
  //   como sugerencias), "oculta", "red_con_dominio_siempre" y "varios_sitios"
  //   (no se movió: la de la categoría se apagó).
  function migrar_categorias(mem) {
    var cambios = [];
    if (!mem || typeof mem !== "object") return cambios;
    Object.keys(mem).forEach(function (k) {
      if (!es_clave_de_red_por_sitio(k)) return;
      var f = mem[k];
      if (!f || typeof f !== "object" || f.oculto || f.siempre !== true) return;
      var vistos = {};
      var suyos = (Array.isArray(f.correos) ? f.correos : []).map(function (c) {
        return { correo: correo_unico(c && c.correo), veces: (c && c.veces) || 0, ultima: texto(c && c.ultima) };
      }).filter(function (c) {
        var id = c.correo.toLowerCase();
        if (!c.correo || vistos[id]) return false;
        vistos[id] = 1;
        return true;
      });
      var dirs = suyos.map(function (c) { return c.correo; });
      var sitio = sitio_de_correos(dirs);
      var existe = sitio && propia(mem, sitio) && mem[sitio] && typeof mem[sitio] === "object";
      var previa = existe ? mem[sitio] : null;
      var no_mover = !sitio ? "varios_sitios"
        : (previa && previa.oculto) ? "oculta"
        : (es_dominio_de_red(sitio) && previa && previa.siempre === true) ? "red_con_dominio_siempre" : "";
      if (no_mover) {
        // No hay a dónde moverla sin tocar algo que no se debe: se APAGA, no se borra.
        f.siempre = false;
        cambios.push({ de: k, a: sitio || "", correos: dirs, razon: no_mover, ajenos: [] });
        return;
      }
      var destino = previa || {
        nombre: propia(SEMILLA, sitio) ? SEMILLA[sitio].nombre : "",
        nota: propia(SEMILLA, sitio) ? SEMILLA[sitio].nota : "",
        correos: []
      };
      fusionar_correos(destino, suyos);
      var razon, ajenos = [];
      if (destino.siempre === true) razon = "ya_encendida";
      else if (destino.siempre === false) razon = "apagada";          // la apagó el usuario: se respeta
      else if (es_dominio_de_red(sitio)) razon = "red_con_dominio";   // va por red: solo sugerencias
      else {
        ajenos = correos_ajenos(destino, sitio);
        if (ajenos.length) razon = "ajenos";
        else { sumar_semilla(destino, sitio); destino.siempre = true; razon = "encendida"; }
      }
      mem[sitio] = destino;
      delete mem[k];
      cambios.push({ de: k, a: sitio, correos: dirs, razon: razon, ajenos: ajenos });
    });
    return cambios;
  }

  // Avisos de las migraciones que corren en cada lectura (migrar_categorias), para
  // enseñarlos UNA vez en "📒 Correos". { visto, avisos: [...] }. No viaja en el
  // traspaso (CLAVES_QUE_NO_SE_IMPORTAN en opciones.js).
  var CLAVE_AVISOS = "avisos_memoria_correos";

  // La memoria CRUDA del storage, ya migrada (si la migración cambió algo, se
  // guarda antes de seguir, con su aviso). TODO lo que lee o escribe la memoria
  // pasa por aquí.
  function leer_memoria(cb) {
    chrome.storage.local.get([CLAVE_MEMORIA, CLAVE_AVISOS], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      var cambios = migrar_categorias(mem);
      if (!cambios.length) { cb(mem); return; }
      var previos = (x && x[CLAVE_AVISOS] && typeof x[CLAVE_AVISOS] === "object" && x[CLAVE_AVISOS].visto === false &&
        Array.isArray(x[CLAVE_AVISOS].avisos)) ? x[CLAVE_AVISOS].avisos : [];
      var set = {};
      set[CLAVE_MEMORIA] = mem;
      set[CLAVE_AVISOS] = { visto: false, avisos: previos.concat(cambios).slice(-100) };
      chrome.storage.local.set(set, function () { cb(mem); });
    });
  }

  function avisos_pendientes(cb) {
    chrome.storage.local.get([CLAVE_AVISOS], function (x) {
      var a = x && x[CLAVE_AVISOS];
      cb(a && typeof a === "object" && a.visto === false && Array.isArray(a.avisos) && a.avisos.length ? a.avisos : null);
    });
  }
  function marcar_avisos_vistos(cb) {
    chrome.storage.local.get([CLAVE_AVISOS], function (x) {
      var a = x && x[CLAVE_AVISOS];
      if (!a || typeof a !== "object") { if (cb) cb(); return; }
      a.visto = true;
      var set = {}; set[CLAVE_AVISOS] = a;
      chrome.storage.local.set(set, function () { if (cb) cb(); });
    });
  }

  // ---- Lectura de la memoria (semilla + lo aprendido/editado a mano) ----
  //  Devuelve { clave: {nombre, nota, correos:[{correo, veces, ultima}], base:bool, siempre:bool} }
  //  Una ficha `siempre` NO se mezcla con la semilla: su lista es la que dejó el
  //  usuario, tal cual (si quitó un correo de fábrica, no vuelve).
  function leer(cb) {
    leer_memoria(function (guardado) {
      // Sin prototipo: out["toString"] no puede devolver una función heredada.
      var out = Object.create(null);
      Object.keys(SEMILLA).forEach(function (k) {
        out[k] = {
          nombre: SEMILLA[k].nombre, nota: SEMILLA[k].nota || "", base: true,
          correos: SEMILLA[k].correos.map(function (c) { return { correo: c, veces: 0, ultima: "" }; })
        };
      });
      Object.keys(guardado).forEach(function (k) {
        if (!clave_valida(k)) return;              // clave del prototipo: se ignora, no rompe
        var g = (guardado[k] && typeof guardado[k] === "object") ? guardado[k] : {};
        if (g.oculto) { delete out[k]; return; }   // ficha base borrada a mano
        var base = out[k] || { nombre: "", nota: "", base: false, correos: [] };
        var correos = g.siempre === true ? [] : base.correos.slice();
        (Array.isArray(g.correos) ? g.correos : []).forEach(function (c) {
          var dir = correo_unico(c && c.correo);
          if (!dir) return;
          var ya = correos.filter(function (o) { return o.correo.toLowerCase() === dir.toLowerCase(); })[0];
          if (ya) { ya.veces = Math.max(ya.veces || 0, c.veces || 0); ya.ultima = c.ultima || ya.ultima; }
          else correos.push({ correo: dir, veces: c.veces || 0, ultima: c.ultima || "" });
        });
        // Los más usados primero; a igual uso, el más reciente.
        correos.sort(function (a, b) {
          return (b.veces || 0) - (a.veces || 0) || texto(b.ultima).localeCompare(texto(a.ultima));
        });
        out[k] = {
          nombre: texto(g.nombre) || base.nombre || "",
          nota: g.nota !== undefined ? texto(g.nota) : (base.nota || ""),
          base: !!base.base, siempre: g.siempre === true, correos: correos
        };
      });
      cb(out);
    });
  }

  // Escribe una ficha completa en la memoria (la usa la página de edición).
  // `ficha.siempre` (true/false) lo fija; si no viene, se conserva el que tuviera.
  function guardar_ficha(clave, ficha, cb) {
    var k = texto(clave).trim().toLowerCase();
    if (!clave_valida(k)) { if (cb) cb(false); return; }
    leer_memoria(function (mem) {
      var previa = (propia(mem, k) && mem[k] && typeof mem[k] === "object") ? mem[k] : {};
      var siempre = (ficha && typeof ficha.siempre === "boolean") ? ficha.siempre : previa.siempre === true;
      var vistos = {};
      mem[k] = {
        nombre: texto(ficha && ficha.nombre),
        nota: texto(ficha && ficha.nota),
        // Solo entradas que son UN correo válido, sin repetir.
        correos: (ficha && Array.isArray(ficha.correos) ? ficha.correos : []).map(function (c) {
          return { correo: correo_unico(c && c.correo), veces: (c && c.veces) || 0, ultima: texto(c && c.ultima) };
        }).filter(function (c) {
          var id = c.correo.toLowerCase();
          if (!c.correo || vistos[id]) return false;
          vistos[id] = 1;
          return true;
        })
      };
      // También se guarda el `false` de una ficha que el usuario APAGÓ: así la
      // importación (opciones.js) sabe que aquí se apagó a propósito y no la
      // vuelve a encender con lo que traiga otra PC.
      if (siempre || typeof previa.siempre === "boolean") mem[k].siempre = siempre;
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Borra una ficha. Si venía de la SEMILLA se marca como oculta para que no vuelva.
  function borrar_ficha(clave, cb) {
    var k = texto(clave).trim().toLowerCase();
    leer_memoria(function (mem) {
      if (propia(SEMILLA, k)) mem[k] = { oculto: true };
      else if (propia(mem, k)) delete mem[k];
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Apunta en la memoria que se usaron estos correos para denunciar a estos
  // sitios (sube el contador y la fecha). Es lo que hace que la próxima denuncia
  // al mismo sitio ya traiga el correo puesto. Nunca debe romper el envío.
  function recordar_uso(claves, correos, extra, cb) {
    var dirs = lista_correos(Array.isArray(correos) ? correos.join(", ") : correos);
    var ks = (Array.isArray(claves) ? claves : [claves]).map(function (k) { return texto(k).trim().toLowerCase(); }).filter(clave_valida);
    if (!dirs.length || !ks.length) { if (cb) cb(false); return; }
    var ahora = new Date().toISOString();
    leer_memoria(function (mem) {
      ks.forEach(function (k) {
        var existe = propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto;
        // Clave "red:" (red sin dominio, a menudo una CATEGORÍA): no se le apunta
        // nada; solo suben los contadores si es una ficha "para siempre".
        if (es_clave_de_categoria(k) && !(existe && mem[k].siempre === true)) return;
        var f = existe ? mem[k] : { nombre: "", nota: "", correos: [] };
        if (!Array.isArray(f.correos)) f.correos = [];
        if (!f.nombre) f.nombre = texto(extra && extra.nombre) || (propia(SEMILLA, k) ? SEMILLA[k].nombre : "");
        dirs.forEach(function (dir) {
          var ya = f.correos.filter(function (o) { return texto(o.correo).toLowerCase() === dir.toLowerCase(); })[0];
          if (ya) { ya.veces = (ya.veces || 0) + 1; ya.ultima = ahora; }
          // Una ficha "para siempre" es la lista EXACTA que guardó el usuario: un
          // correo suelto de un envío no se le cuela (solo suben los contadores).
          else if (f.siempre !== true) f.correos.push({ correo: dir, veces: 1, ultima: ahora });
        });
        delete f.oculto;
        mem[k] = f;
      });
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Sugerencias para un reporte concreto: [{clave, nombre, correo, veces, ultima}]
  // ordenadas por uso. La red con dominio va primero (es el destinatario más
  // probable). Una ficha "red:" solo cuenta si está marcada `siempre`.
  //
  // En una categoría cuyo buzón es el del PROPIO sitio (Apps maliciosas) solo se proponen —y solo rellenan el «Para» vacío— los
  // correos de ESE sitio (correo_es_del_sitio: su dominio exacto o su semilla,
  // p. ej. dmca.filehippo@delevitagent.com para filehippo.com). Los demás son
  // restos del fallo de las categorías (los buzones de Aptoide que se aprendieron
  // en apkpure.com): NO se borran —siguen en la ficha y en "📒 Correos"—, solo no
  // se proponen. EXCEPCIÓN: una ficha marcada `siempre` es la lista que el usuario
  // guardó a propósito con 💾 para ESE sitio (la reparación de la migración v2 ya
  // apagó las que mezclaban buzones de otro sitio), así que un agente externo que
  // el usuario guardó ahí sí sale.
  function sugerencias(red, urls, cb) {
    var claves = claves_de(red, urls);
    if (!claves.length) { cb([], claves); return; }
    var solo_del_sitio = buzon_del_sitio(red);
    leer(function (mem) {
      var out = [], vistos = {};
      claves.forEach(function (k) {
        var f = mem[k];
        if (!f) return;
        if (es_clave_de_categoria(k) && !f.siempre) return;
        f.correos.forEach(function (c) {
          if (solo_del_sitio && !f.siempre && !correo_es_del_sitio(c.correo, k)) return;
          // El mismo correo puede estar en la ficha del sitio y en la de la red:
          // se propone una sola vez (con la clave que va primero).
          var id = texto(c.correo).toLowerCase();
          if (vistos[id]) return;
          vistos[id] = 1;
          out.push({ clave: k, nombre: f.nombre || k, nota: f.nota || "", correo: c.correo, veces: c.veces || 0, ultima: c.ultima || "" });
        });
      });
      cb(out, claves);
    });
  }

  // ---- Correos guardados PARA SIEMPRE de una red ----
  // Guarda EXACTAMENTE la lista de `texto_correos` (el "Para" de correo.html) en la
  // ficha de la red, marcada `siempre: true`. Reemplaza la lista anterior —así,
  // quitar un correo y volver a guardar lo quita— pero conserva los contadores de
  // uso de los que sigan. cb(ok, clave, correos, motivo).
  // En una red POR SITIO (Apps maliciosas) la ficha es la del SITIO
  // denunciado: `opciones.urls` son los enlaces del reporte y `opciones.sitio` el
  // que eligió el usuario si hay enlaces de varios sitios (ver destino_para_siempre).
  // Sin un sitio claro NO se guarda: motivo "sin_enlace" o "varios_sitios".
  function guardar_para_siempre(red, texto_correos, cb, opciones) {
    var o = opciones || {};
    var dest = destino_para_siempre(red, o.urls, o.sitio);
    var k = dest.clave;
    // lista_correos ya devuelve entradas que son, cada una, UN correo válido.
    var dirs = lista_correos(texto_correos).filter(correo_unico);
    if (!k || !clave_valida(k) || !dirs.length) { if (cb) cb(false, k, dirs, dest.motivo || (dirs.length ? "" : "sin_correos")); return; }
    leer_memoria(function (mem) {
      var previa = (propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto) ? mem[k] : {};
      var antes = Array.isArray(previa.correos) ? previa.correos : [];
      mem[k] = {
        // Una ficha de SITIO no se llama como la categoría: si no hay nombre, el dominio.
        nombre: texto(previa.nombre) || (propia(SEMILLA, k) ? SEMILLA[k].nombre : "") || (dest.por_sitio ? k : texto(red).trim()),
        nota: previa.nota !== undefined ? texto(previa.nota) : (propia(SEMILLA, k) ? SEMILLA[k].nota : ""),
        siempre: true,
        correos: dirs.map(function (dir) {
          var ya = antes.filter(function (o) { return texto(o && o.correo).toLowerCase() === dir.toLowerCase(); })[0];
          return { correo: dir, veces: (ya && ya.veces) || 0, ultima: texto(ya && ya.ultima) };
        })
      };
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true, k, dirs, ""); });
    });
  }

  // Correos que van SOLOS en el "Para" de un reporte: los de la ficha marcada
  // `siempre`. cb([correos], grupos) con grupos = [{ clave, nombre, correos }]
  // (para decir DE DÓNDE sale cada uno); vacío si no hay.
  //   - red normal: la ficha de la red, como siempre (`urls` no cuenta);
  //   - red POR SITIO: la ficha de CADA sitio denunciado (`urls`). La ficha de la
  //     categoría ("red:apps maliciosas") nunca: los buzones de Aptoide no van
  //     solos en la denuncia de APKPure.
  function correos_para_siempre(red, cb, urls) {
    var claves = es_red_por_sitio(red) ? dominios_de(urls) : [clave_de_red(red)].filter(Boolean);
    if (!claves.length) { cb([], []); return; }
    leer(function (mem) {
      var todos = [], vistos = {}, grupos = [];
      claves.forEach(function (k) {
        var f = mem[k];
        if (!f || !f.siempre) return;
        var suyos = f.correos.map(function (c) { return c.correo; });
        if (!suyos.length) return;
        grupos.push({ clave: k, nombre: f.nombre || k, correos: suyos });
        suyos.forEach(function (c) {
          if (vistos[c.toLowerCase()]) return;
          vistos[c.toLowerCase()] = 1;
          todos.push(c);
        });
      });
      cb(todos, grupos);
    });
  }

  // Enciende o apaga la marca `siempre` de una ficha (la usa la página de la
  // memoria). Al encenderla queda fija la lista que el usuario ve en ese momento
  // (semilla incluida); al apagarla los correos se quedan como simples sugerencias.
  function marcar_siempre(clave, valor, cb) {
    var k = texto(clave).trim().toLowerCase();
    if (!clave_valida(k)) { if (cb) cb(false); return; }
    leer(function (vista) {
      var v = vista[k];
      if (!v) { if (cb) cb(false); return; }
      leer_memoria(function (mem) {
        var f = (propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto) ? mem[k] : { nombre: v.nombre || "", nota: v.nota || "", correos: [] };
        if (valor) {
          // La vista de leer() ya trae solo correos válidos; se vuelve a filtrar por si acaso.
          f.correos = v.correos.filter(function (c) { return correo_unico(c.correo); })
            .map(function (c) { return { correo: correo_unico(c.correo), veces: c.veces || 0, ultima: c.ultima || "" }; });
        }
        f.siempre = !!valor;
        mem[k] = f;
        var set = {}; set[CLAVE_MEMORIA] = mem;
        chrome.storage.local.set(set, function () { if (cb) cb(true); });
      });
    });
  }

  // ==========================================================================
  //  MIGRACIÓN DE UNA SOLA VEZ: los correos YA ENVIADOS (Registro) -> ficha
  //  "para siempre" del SITIO al que se denunció. + REPARACIÓN.
  //  Recorre `denuncias_registro` y, por cada denuncia confirmada (no provisional,
  //  no de modo prueba) con destinatarios y ENLACE denunciado, apunta esos correos
  //  en la ficha del dominio de ese enlace, sin duplicar y sin quitar nada.
  //   - El sitio sale SOLO de `url_denunciada`. NO de `destino` ("Enviado a"):
  //     correo.js lo rellena con el dominio de los DESTINATARIOS cuando no hay
  //     enlace, y entonces cualquier correo "sería de su sitio" (filtro circular).
  //     Una denuncia sin enlace se salta y se lista en el resumen ("sin enlace").
  //   - FILTRO OBLIGATORIO (correo_es_del_sitio): por el fallo de las categorías,
  //     una denuncia de APKPure pudo salir con los buzones de Aptoide. Un correo
  //     solo se asigna a un sitio si su dominio es EXACTAMENTE el del sitio o si
  //     está en su SEMILLA. Los demás se DESCARTAN y se listan en el resumen.
  //   - "siempre" solo se enciende si TODOS los correos que trae el Registro para
  //     ese sitio constan como ENVIADOS (`correo.enviado === true`) y la ficha
  //     resultante no tiene correos de otro sitio. Si no, quedan como sugerencias.
  //   - Las fichas de redes con dominio propio (facebook.com, tiktok.com…) van por
  //     red: solo se les añaden correos si no son "siempre", y nunca se encienden.
  //   - REPARACIÓN (reparar_fichas_siempre): la primera versión de esta migración
  //     (bandera v1) pudo correr ya en vivo y encender fichas con buzones ajenos.
  //     Toda ficha de SITIO "siempre" con correos que no son de ese sitio se APAGA
  //     (sin borrar ningún correo) y se lista para revisarla con ✏ Editar.
  //  Una sola vez: bandera CLAVE_MIGRACION_REGISTRO (v2: la v1 tenía fallos y hay
  //  que volver a evaluar). No viaja en el traspaso (ver CLAVES_QUE_NO_SE_IMPORTAN
  //  en opciones.js). Guarda el RESUMEN que enseña una vez la página "📒 Correos".
  //  Nunca se borra una denuncia ni una ficha.
  // ==========================================================================
  var CLAVE_MIGRACION_REGISTRO = "correos_del_registro_migrados_v2";

  // Sitios (dominios) de una denuncia del Registro: SOLO los de su URL denunciada.
  function sitios_de_denuncia(d) {
    return dominios_de(texto(d.url_denunciada).split(/[\s,;]+/).filter(Boolean));
  }

  // Función PURA: aplica a `mem` (memoria cruda, la modifica) los correos de `lista`
  // (denuncias_registro) y devuelve el resumen:
  //   { guardados: [{ sitio, correos, siempre }], descartados: [{ correo, sitios }],
  //     sin_siempre: [{ sitio, razon, ajenos, correos }], sin_enlace: [{ marca,
  //     plataforma, correos }], denuncias: n.º de denuncias usadas }
  //   razon de sin_siempre: "apagada", "borrada", "ajenos", "red_con_dominio",
  //   "sin_confirmar_envio" (correos que se quedan como sugerencia) y
  //   "no_anadidos_sin_envio" (lista "siempre" que ya existía: lo no confirmado
  //   como enviado NO se le añade, que se pondría solo).
  // `reparadas` (opcional): las fichas que la reparación acaba de apagar; su motivo
  // en el resumen es "ajenos", no "apagada" (no la apagó el usuario).
  function aplicar_registro_a_memoria(lista, mem, reparadas) {
    var recien_apagadas = {};
    (Array.isArray(reparadas) ? reparadas : []).forEach(function (r) { recien_apagadas[r.sitio] = r.ajenos || []; });
    var por_sitio = {}, orden = [], descartados = [], vistos_desc = {}, sin_enlace = [], usadas = 0;
    (Array.isArray(lista) ? lista : []).forEach(function (d) {
      if (!d || typeof d !== "object" || d.provisional === true || d.modo_prueba) return;
      // SOLO Apps maliciosas (REDES_POR_SITIO). TikTok, Cloudflare… van por red, y
      // Delisting, Ofertas falsas, Banguat y las plataformas del usuario, también.
      if (!es_red_por_sitio(d.plataforma)) return;
      var to = lista_correos(d.correo && d.correo.to);
      if (!to.length) return;
      var sitios = sitios_de_denuncia(d);
      if (!sitios.length) {
        sin_enlace.push({ marca: texto(d.marca), plataforma: texto(d.plataforma), correos: to });
        return;
      }
      usadas++;
      var enviado = !!(d.correo && d.correo.enviado === true);
      var cuando = texto((d.correo && d.correo.fecha) || d.fecha);
      to.forEach(function (c) {
        var suyos = sitios.filter(function (s) { return correo_es_del_sitio(c, s); });
        if (!suyos.length) {
          var id = c.toLowerCase() + "|" + sitios.join(",");
          if (!vistos_desc[id]) { vistos_desc[id] = 1; descartados.push({ correo: c, sitios: sitios.slice() }); }
          return;
        }
        suyos.forEach(function (s) {
          if (!clave_valida(s)) return;
          if (!por_sitio[s]) { por_sitio[s] = []; orden.push(s); }
          var ya = por_sitio[s].filter(function (o) { return o.correo.toLowerCase() === c.toLowerCase(); })[0];
          if (ya) { if (cuando > ya.ultima) ya.ultima = cuando; ya.enviado = ya.enviado || enviado; }
          else por_sitio[s].push({ correo: c, veces: 0, ultima: cuando, enviado: enviado });
        });
      });
    });

    var guardados = [], sin_siempre = [];
    orden.forEach(function (s) {
      var existe = propia(mem, s) && mem[s] && typeof mem[s] === "object";
      if (existe && mem[s].oculto) {
        // El usuario BORRÓ esa ficha a mano: no se resucita.
        sin_siempre.push({ sitio: s, razon: "borrada", ajenos: [], correos: por_sitio[s].map(function (c) { return c.correo; }) });
        return;
      }
      var f = existe ? mem[s] : {
        nombre: propia(SEMILLA, s) ? SEMILLA[s].nombre : "",
        nota: propia(SEMILLA, s) ? SEMILLA[s].nota : "",
        correos: []
      };
      var red_dom = es_dominio_de_red(s);
      var sin_envio = por_sitio[s].filter(function (c) { return !c.enviado; }).map(function (c) { return c.correo; });
      var nuevos;
      if (f.siempre === true) {
        // Lista "siempre" que ya existía: lo que se le añada se pondrá solo. Solo
        // entra lo ENVIADO; en una red con dominio propio, nada.
        if (red_dom) {
          sin_siempre.push({ sitio: s, razon: "red_con_dominio", ajenos: [], correos: por_sitio[s].map(function (c) { return c.correo; }) });
          return;
        }
        nuevos = fusionar_correos(f, por_sitio[s].filter(function (c) { return c.enviado; }));
        if (sin_envio.length) sin_siempre.push({ sitio: s, razon: "no_anadidos_sin_envio", ajenos: [], correos: sin_envio });
      } else {
        nuevos = fusionar_correos(f, por_sitio[s]);
        var ajenos = correos_ajenos(f, s);
        if (f.siempre === false && propia(recien_apagadas, s)) sin_siempre.push({ sitio: s, razon: "ajenos", ajenos: recien_apagadas[s], correos: [] });
        else if (f.siempre === false) sin_siempre.push({ sitio: s, razon: "apagada", ajenos: [], correos: [] });
        else if (red_dom) sin_siempre.push({ sitio: s, razon: "red_con_dominio", ajenos: [], correos: [] });
        else if (sin_envio.length) sin_siempre.push({ sitio: s, razon: "sin_confirmar_envio", ajenos: [], correos: sin_envio });
        else if (ajenos.length) sin_siempre.push({ sitio: s, razon: "ajenos", ajenos: ajenos, correos: [] });
        else { sumar_semilla(f, s); f.siempre = true; }
      }
      mem[s] = f;
      guardados.push({ sitio: s, correos: nuevos, siempre: f.siempre === true });
    });
    return { guardados: guardados, descartados: descartados, sin_siempre: sin_siempre, sin_enlace: sin_enlace, denuncias: usadas };
  }

  // REPARACIÓN (función PURA, modifica `mem`): toda ficha de SITIO (clave con forma
  // de dominio, no "red:", no de una red con dominio propio) marcada "siempre" que
  // tenga correos que NO son de ese sitio se APAGA, sin borrar ningún correo.
  // Devuelve [{ sitio, ajenos }]. Idempotente: una ficha apagada ya no cuenta.
  // `solo_sitios` (opcional): { sitio: 1 } — si viene, solo se miran esos sitios
  // (los de Apps maliciosas, ver sitios_de_apps).
  function reparar_fichas_siempre(mem, solo_sitios) {
    var reparadas = [];
    if (!mem || typeof mem !== "object") return reparadas;
    Object.keys(mem).forEach(function (k) {
      if (solo_sitios && !solo_sitios[k]) return;
      var f = mem[k];
      if (!f || typeof f !== "object" || f.oculto || f.siempre !== true) return;
      if (!clave_valida(k) || es_clave_de_categoria(k) || dominio_de(k) !== k || es_dominio_de_red(k)) return;
      var ajenos = correos_ajenos(f, k);
      if (!ajenos.length) return;
      f.siempre = false;
      reparadas.push({ sitio: k, ajenos: ajenos });
    });
    return reparadas;
  }

  // ¿Dice algo este resumen? (uno "vacío" no puede pisar a uno pendiente de ver)
  function resumen_con_algo(r) {
    if (!r || typeof r !== "object") return false;
    return (r.guardados || []).some(function (g) { return g.correos && g.correos.length; }) ||
      ["descartados", "sin_siempre", "sin_enlace", "reparadas"].some(function (k) { return (r[k] || []).length > 0; });
  }

  // La corre UNA vez (bandera). cb(resumen) si la hizo ahora; cb(null) si ya estaba.
  // ==========================================================================
  //  RESTAURACIÓN DE UNA SOLA VEZ (v1.2.104): la v1.2.103 trató también Delisting,
  //  Ofertas falsas de trabajo y Sitios maliciosos Banguat como categorías por
  //  sitio, y el usuario lo descartó («esos cambios solo eran en Apps maliciosas»).
  //  Esto deshace en sus datos lo que se pueda deshacer CON SEGURIDAD, sin borrar
  //  nada que no se sepa que añadió la migración:
  //   a) cada ficha "red:<una de esas tres>" que migrar_categorias movió a un sitio
  //      o apagó (lo dice `avisos_memoria_correos`) vuelve a existir con sus correos
  //      y `siempre: true` (los contadores de uso no se apuntaron: vuelven a 0). Si
  //      la migración le ENCENDIÓ "siempre" al sitio de destino, se le devuelve el
  //      de antes (no tenía); los correos movidos se quedan ahí como sugerencia;
  //   b) con el resumen de la migración del Registro (v1 y v2): a las fichas de
  //      SITIO de denuncias que no son de Apps maliciosas se les QUITAN los correos
  //      que esa migración añadió (están en el resumen y no estaban antes), salvo
  //      los que se usaron después (veces > 0). Si la ficha se queda vacía es que la
  //      creó la migración y se quita. Las que la reparación APAGÓ vuelven a
  //      "siempre". Lo que no se puede saber (si un sitio ya era "siempre" antes)
  //      se deja como está y se apunta en `dudas`;
  //   c) nada de Apps maliciosas se toca.
  //  Bandera propia (no viaja en el traspaso: CLAVES_QUE_NO_SE_IMPORTAN). Guarda
  //  un INFORME que "📒 Correos" enseña una vez.
  // ==========================================================================
  var CLAVE_RESTAURACION = "correos_categorias_restauradas";
  var CLAVE_MIGRACION_REGISTRO_V1 = "correos_del_registro_migrados";
  // Tiendas de fábrica de Apps maliciosas (con buzones en la SEMILLA).
  var SITIOS_DE_APPS_DE_FABRICA = ["aptoide.com", "apkpure.com", "filehippo.com", "apkcombo.com"];

  function lista_de_array(v) { return Array.isArray(v) ? v : []; }
  function ficha_viva(mem, k) {
    return (propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto) ? mem[k] : null;
  }
  function es_denuncia_de_apps(d) { return !!d && typeof d === "object" && es_red_por_sitio(d.plataforma); }

  // Sitios que son de Apps maliciosas: las tiendas de fábrica, los enlaces de sus
  // denuncias y los sitios a los que se movió la antigua "red:apps maliciosas".
  function sitios_de_apps(lista, avisos) {
    var s = Object.create(null);
    SITIOS_DE_APPS_DE_FABRICA.forEach(function (k) { s[k] = 1; });
    lista_de_array(lista).forEach(function (d) { if (es_denuncia_de_apps(d)) sitios_de_denuncia(d).forEach(function (x) { s[x] = 1; }); });
    lista_de_array(avisos).forEach(function (a) { if (a && a.de === PREFIJO_RED + "apps maliciosas" && a.a) s[a.a] = 1; });
    return s;
  }

  // Le QUITA a una ficha de sitio el "siempre" que le puso la migración y, con él,
  // los correos de la SEMILLA que sumar_semilla le copió (veces 0, sin fecha).
  // Quitar esas copias es INVISIBLE: una ficha que no es "siempre" vuelve a mostrar
  // su semilla al leerla (leer() la mezcla), así que no se pierde nada.
  function devolver_siempre_de_sitio(f, sitio) {
    delete f.siempre;
    if (!propia(SEMILLA, sitio) || !Array.isArray(f.correos)) return;
    var de_fabrica = SEMILLA[sitio].correos.map(function (c) { return c.toLowerCase(); });
    f.correos = f.correos.filter(function (o) {
      var c = texto(o && o.correo).toLowerCase();
      return !(de_fabrica.indexOf(c) >= 0 && !((o && o.veces) > 0) && !texto(o && o.ultima));
    });
  }
  // ¿Tiene la ficha un nombre o una nota que escribió el USUARIO? (no el dominio
  // ni los de fábrica). Una ficha así no se quita aunque se quede sin correos.
  function ficha_con_texto_del_usuario(f, sitio) {
    var nombre = texto(f && f.nombre).trim(), nota = texto(f && f.nota).trim();
    var sem = propia(SEMILLA, sitio) ? SEMILLA[sitio] : null;
    var nombre_propio = nombre && nombre.toLowerCase() !== sitio && !(sem && nombre === sem.nombre);
    var nota_propia = nota && !(sem && nota === sem.nota);
    return !!(nombre_propio || nota_propia);
  }

  // Función PURA (modifica `mem`). datos = { avisos, resumen_v2, resumen_v1,
  // denuncias, hubo_v1 }. Devuelve el informe.
  function restaurar_categorias(mem, datos) {
    var inf = { recreadas: [], reencendidas: [], siempre_devuelto: [], quitados: [], fichas_quitadas: [], dudas: [] };
    if (!mem || typeof mem !== "object") return inf;
    datos = datos || {};
    var avisos = lista_de_array(datos.avisos), lista = lista_de_array(datos.denuncias);
    var apps = sitios_de_apps(lista, avisos);

    // a) Fichas "red:<categoría>" que la v1.2.103 movió o apagó.
    avisos.forEach(function (a) {
      if (!a || typeof a.de !== "string" || a.de.indexOf(PREFIJO_RED) !== 0) return;
      var cat = a.de.slice(PREFIJO_RED.length);
      if (!propia(CATEGORIAS_DEVUELTAS_A_RED, cat)) return;
      var dirs = lista_de_array(a.correos).map(correo_unico).filter(Boolean);
      var f = ficha_viva(mem, a.de);
      if (!f) {
        if (!dirs.length) { inf.dudas.push(a.de + ": el aviso no trae sus correos; no se pudo volver a crear."); return; }
        f = { nombre: CATEGORIAS_DEVUELTAS_A_RED[cat], nota: "", correos: [] };
        mem[a.de] = f;
        inf.recreadas.push({ clave: a.de, correos: dirs });
      } else if (f.siempre !== true) {
        inf.reencendidas.push(a.de);
      }
      fusionar_correos(f, dirs.map(function (c) { return { correo: c, veces: 0, ultima: "" }; }));
      f.siempre = true;
      // "encendida": la migración le puso "siempre" al sitio, que antes NO lo tenía.
      if (a.razon === "encendida" && a.a && !apps[a.a]) {
        var fs = ficha_viva(mem, a.a);
        if (fs && fs.siempre === true) { devolver_siempre_de_sitio(fs, a.a); inf.siempre_devuelto.push(a.a); }
      }
      if (a.a && ["encendida", "ya_encendida", "apagada", "red_con_dominio", "ajenos"].indexOf(a.razon) >= 0) {
        inf.dudas.push(a.de + ": sus correos se quedan también en " + a.a + " como sugerencia (no se sabe si ya estaban ahí).");
      }
    });

    // b) Lo que hizo la migración del Registro (v2 y la v1 de pruebas) en sitios
    //    que NO son de Apps maliciosas.
    var otros = Object.create(null);
    lista.forEach(function (d) {
      if (!d || typeof d !== "object" || es_denuncia_de_apps(d) || dominio_de_red(d.plataforma)) return;
      sitios_de_denuncia(d).forEach(function (s) { otros[s] = 1; });
    });
    [datos.resumen_v2, datos.resumen_v1].forEach(function (r) {
      if (!r || typeof r !== "object") return;
      lista_de_array(r.reparadas).forEach(function (x) {
        if (!x || apps[x.sitio]) return;
        var f = ficha_viva(mem, x.sitio);
        // La reparación solo apaga fichas que eran "siempre": se les devuelve.
        if (f && f.siempre === false) { f.siempre = true; inf.siempre_devuelto.push(x.sitio); }
      });
      lista_de_array(r.guardados).forEach(function (g) {
        if (!g || !otros[g.sitio]) return;
        if (apps[g.sitio]) { inf.dudas.push(g.sitio + ": tiene denuncias de Apps maliciosas y de otra categoría; no se toca."); return; }
        var f = ficha_viva(mem, g.sitio);
        if (!f || !Array.isArray(f.correos)) return;
        var quitar = lista_de_array(g.correos).map(function (c) { return texto(c).toLowerCase(); });
        var fuera = [];
        f.correos = f.correos.filter(function (o) {
          var c = texto(o && o.correo).toLowerCase();
          // Solo lo que añadió la migración y no se ha usado desde entonces.
          if (quitar.indexOf(c) >= 0 && !((o && o.veces) > 0)) { fuera.push(o.correo); return false; }
          return true;
        });
        if (fuera.length) inf.quitados.push({ sitio: g.sitio, correos: fuera });
        // "siempre" de la ficha del SITIO. El resumen dice que la migración la dejó
        // "siempre" (g.siempre), pero no si ya lo era: en la v1.2.101 una ficha de
        // sitio solo se encendía con el botón «📌 Siempre» de "📒 Correos", y además
        // ahí NO tenía ningún efecto (correos_para_siempre solo leía la ficha de la
        // RED). Por eso se le QUITA: el comportamiento vuelve a ser exactamente el de
        // la v1.2.101 —y en Apps maliciosas ese sitio deja de ponerse solo, que es lo
        // que la v1.2.101 hacía—, y se apunta en `dudas` por si el usuario la había
        // marcado a mano. Nunca en una red con dominio propio (facebook.com…): esa
        // ficha SÍ se usa por red y la migración nunca se la enciende.
        if (g.siempre === true && f.siempre === true && !es_dominio_de_red(g.sitio)) {
          devolver_siempre_de_sitio(f, g.sitio);
          inf.siempre_devuelto.push(g.sitio);
          if (f.correos.length || propia(SEMILLA, g.sitio)) inf.dudas.push(g.sitio + ": se le quitó «siempre» (lo puso la migración). Si lo habías marcado tú, vuelve a pulsar 📌 Siempre.");
        }
        if (!f.correos.length && !propia(SEMILLA, g.sitio) && !ficha_con_texto_del_usuario(f, g.sitio)) {
          // Solo tenía lo que puso la migración: la ficha la creó ella.
          delete mem[g.sitio];
          inf.fichas_quitadas.push(g.sitio);
          // Si estaba recién apuntada como "siempre devuelto", sobra: ya no existe.
          inf.siempre_devuelto = inf.siempre_devuelto.filter(function (k) { return k !== g.sitio; });
        }
      });
    });
    if (datos.hubo_v1) {
      inf.dudas.push("La versión de pruebas anterior (v1) pudo mover o apagar fichas red:delisting / red:ofertas falsas de trabajo / " +
        "red:sitios maliciosos banguat sin dejar rastro: si alguna falta o está apagada, revísala aquí.");
    }
    return inf;
  }

  function informe_con_algo(i) {
    return !!i && ["recreadas", "reencendidas", "siempre_devuelto", "quitados", "fichas_quitadas", "dudas"]
      .some(function (k) { return lista_de_array(i[k]).length > 0; });
  }

  function restaurar_categorias_una_vez(cb) {
    var claves = [CLAVE_RESTAURACION, CLAVE_AVISOS, CLAVE_MIGRACION_REGISTRO, CLAVE_MIGRACION_REGISTRO_V1, "denuncias_registro"];
    chrome.storage.local.get(claves, function (x) {
      x = x || {};
      if (x[CLAVE_RESTAURACION]) { if (cb) cb(null); return; }
      var av = x[CLAVE_AVISOS], v2 = x[CLAVE_MIGRACION_REGISTRO], v1 = x[CLAVE_MIGRACION_REGISTRO_V1];
      var datos = {
        avisos: av && typeof av === "object" ? av.avisos : [],
        resumen_v2: v2 && typeof v2 === "object" ? v2.resumen : null,
        resumen_v1: v1 && typeof v1 === "object" ? v1.resumen : null,
        denuncias: x.denuncias_registro,
        hubo_v1: !!v1
      };
      leer_memoria(function (mem) {
        var inf = restaurar_categorias(mem, datos);
        var set = {};
        set[CLAVE_MEMORIA] = mem;
        set[CLAVE_RESTAURACION] = { fecha: new Date().toISOString(), visto: !informe_con_algo(inf), informe: inf };
        chrome.storage.local.set(set, function () { if (cb) cb(inf); });
      });
    });
  }

  function informe_restauracion_pendiente(cb) {
    chrome.storage.local.get([CLAVE_RESTAURACION], function (x) {
      var m = x && x[CLAVE_RESTAURACION];
      cb(m && typeof m === "object" && m.visto === false && m.informe ? m.informe : null);
    });
  }
  function marcar_restauracion_vista(cb) {
    chrome.storage.local.get([CLAVE_RESTAURACION], function (x) {
      var m = x && x[CLAVE_RESTAURACION];
      if (!m || typeof m !== "object") { if (cb) cb(); return; }
      m.visto = true;
      var set = {}; set[CLAVE_RESTAURACION] = m;
      chrome.storage.local.set(set, function () { if (cb) cb(); });
    });
  }

  // Antes que nada, la RESTAURACIÓN de una vez de lo que la v1.2.103 cambió en
  // Delisting / Ofertas falsas / Banguat (restaurar_categorias_una_vez).
  function migrar_correos_del_registro(cb) {
    restaurar_categorias_una_vez(function () { migrar_correos_del_registro_sin_restaurar(cb); });
  }
  function migrar_correos_del_registro_sin_restaurar(cb) {
    chrome.storage.local.get([CLAVE_MIGRACION_REGISTRO, "denuncias_registro", CLAVE_AVISOS], function (x) {
      if (x && x[CLAVE_MIGRACION_REGISTRO]) { if (cb) cb(null); return; }
      leer_memoria(function (mem) {
        // La reparación va PRIMERO: así el resumen no puede decir que una ficha quedó
        // "siempre" (guardados) y a la vez que se apagó (reparadas). Y solo sobre
        // sitios de Apps maliciosas.
        var av = x && x[CLAVE_AVISOS];
        var reparadas = reparar_fichas_siempre(mem, sitios_de_apps(x && x.denuncias_registro, av && av.avisos));
        var resumen = aplicar_registro_a_memoria(x && x.denuncias_registro, mem, reparadas);
        resumen.reparadas = reparadas;
        // Otra pasada a la vez (service worker + página) pudo dejar ya SU resumen:
        // si está pendiente de ver y dice algo, no se pisa con este.
        chrome.storage.local.get([CLAVE_MIGRACION_REGISTRO], function (y) {
          var previa = y && y[CLAVE_MIGRACION_REGISTRO];
          var set = {};
          set[CLAVE_MEMORIA] = mem;
          var pisar = !(previa && typeof previa === "object" && previa.visto === false && resumen_con_algo(previa.resumen));
          if (pisar) set[CLAVE_MIGRACION_REGISTRO] = { fecha: new Date().toISOString(), visto: false, resumen: resumen };
          chrome.storage.local.set(set, function () { if (cb) cb(resumen); });
        });
      });
    });
  }

  // El resumen guardado, si todavía no se enseñó. cb(resumen | null).
  function resumen_migracion_registro_pendiente(cb) {
    chrome.storage.local.get([CLAVE_MIGRACION_REGISTRO], function (x) {
      var m = x && x[CLAVE_MIGRACION_REGISTRO];
      cb(m && typeof m === "object" && m.visto === false && m.resumen ? m.resumen : null);
    });
  }
  function marcar_resumen_migracion_visto(cb) {
    chrome.storage.local.get([CLAVE_MIGRACION_REGISTRO], function (x) {
      var m = x && x[CLAVE_MIGRACION_REGISTRO];
      if (!m || typeof m !== "object") { if (cb) cb(); return; }
      m.visto = true;
      var set = {}; set[CLAVE_MIGRACION_REGISTRO] = m;
      chrome.storage.local.set(set, function () { if (cb) cb(); });
    });
  }

  window.CORREOS_DENUNCIA = {
    CLAVE_MIGRACION_REGISTRO: CLAVE_MIGRACION_REGISTRO,
    CLAVE_AVISOS: CLAVE_AVISOS,
    correo_es_del_sitio: correo_es_del_sitio,
    es_dominio_de_red: es_dominio_de_red,
    aplicar_registro_a_memoria: aplicar_registro_a_memoria,
    reparar_fichas_siempre: reparar_fichas_siempre,
    migrar_correos_del_registro: migrar_correos_del_registro,
    resumen_migracion_registro_pendiente: resumen_migracion_registro_pendiente,
    marcar_resumen_migracion_visto: marcar_resumen_migracion_visto,
    avisos_pendientes: avisos_pendientes,
    marcar_avisos_vistos: marcar_avisos_vistos,
    CLAVE_RESTAURACION: CLAVE_RESTAURACION,
    restaurar_categorias: restaurar_categorias,
    restaurar_categorias_una_vez: restaurar_categorias_una_vez,
    informe_restauracion_pendiente: informe_restauracion_pendiente,
    marcar_restauracion_vista: marcar_restauracion_vista,
    CLAVE_MEMORIA: CLAVE_MEMORIA,
    FIJOS_POR_RED: FIJOS_POR_RED,
    SEMILLA: SEMILLA,
    dominio_de: dominio_de,
    dominios_de: dominios_de,
    dominio_de_red: dominio_de_red,
    PREFIJO_RED: PREFIJO_RED,
    REDES_POR_SITIO: REDES_POR_SITIO,
    clave_de_red: clave_de_red,
    es_red_por_sitio: es_red_por_sitio,
    buzon_del_sitio: buzon_del_sitio,
    es_clave_de_red_por_sitio: es_clave_de_red_por_sitio,
    destino_para_siempre: destino_para_siempre,
    migrar_categorias: migrar_categorias,
    claves_de: claves_de,
    lista_correos: lista_correos,
    correo_unico: correo_unico,
    clave_valida: clave_valida,
    unir_correos: unir_correos,
    fijos_de_red: fijos_de_red,
    leer: leer,
    guardar_ficha: guardar_ficha,
    borrar_ficha: borrar_ficha,
    recordar_uso: recordar_uso,
    sugerencias: sugerencias,
    guardar_para_siempre: guardar_para_siempre,
    correos_para_siempre: correos_para_siempre,
    marcar_siempre: marcar_siempre
  };
})();
