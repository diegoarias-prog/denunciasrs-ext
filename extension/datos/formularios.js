// ============================================================================
//  Definición de cada FORMULARIO: red, nombre, categoría (para la justificación),
//  URL y construirPlan() que arma la lista de pasos de relleno para una marca.
//
//  Tipos de paso que aplica el motor (popup.js -> APLICAR):
//    {tipo:'select',     name, texto, esperaMs}  -> opción del <select name> que contenga 'texto'
//    {tipo:'selectPais', name, valor}            -> país (sin acentos)
//    {tipo:'radio',      name, texto, esperaMs}  -> marca radio por value/label (o el 1.º si no hay texto)
//    {tipo:'check',      name}                   -> marca una casilla
//    {tipo:'fillName',   name, valor}            -> escribe en [name=...]
//    {tipo:'fillCss',    css,  valor}            -> escribe en un selector CSS (p.ej. #id)
//
//  ESTADO: LinkedIn (difamación, marca, derechos de autor) completo y validado
//  en vivo. FB/IG y los progresivos (TikTok/WhatsApp/X) se agregan después.
// ============================================================================
(function () {
  // Nombre/Apellidos en LinkedIn: si el correo es el de la persona -> Diego/Arias;
  // si no, se parte el nombre de la marca (1.ª palabra = Nombre, el resto = Apellidos).
  function nombreLinkedIn(marca, correo, correoPersona) {
    marca = (marca || "").trim();
    if ((correo || "").trim().toLowerCase() === (correoPersona || "").trim().toLowerCase()) {
      return { nom: "Diego", ape: "Arias" };
    }
    var p = marca.split(/\s+/).filter(Boolean);
    return { nom: p[0] || marca, ape: p.length > 1 ? p.slice(1).join(" ") : "" };
  }

  // ==========================================================================
  //  NOMBRE DE LA PERSONA QUE DENUNCIA (no el de la marca)
  //  Formularios como el de Cloudflare piden "Your full name" y "Digital
  //  signature": ahí va quien firma, no la marca. Se busca por el CORREO elegido
  //  en window.PERSONAS_POR_CORREO (datos/marcas.js) y, si no está, se deduce de
  //  lo que hay antes de la @ partiendo por punto, guion o guion bajo.
  //  Si ni eso da un nombre razonable se devuelve vacío, y quien llama decide
  //  (nunca se rellena con la marca: seria firmar con quien no es).
  // ==========================================================================
  function personaDeCorreo(correo) {
    var c = String(correo || "").trim().toLowerCase();
    var tabla = window.PERSONAS_POR_CORREO || {};
    if (Object.prototype.hasOwnProperty.call(tabla, c)) {
      var f = tabla[c];
      return { nom: f.nom || "", ape: f.ape || "", completo: ((f.nom || "") + " " + (f.ape || "")).trim() };
    }
    var local = c.split("@")[0] || "";
    if (!local) return { nom: "", ape: "", completo: "" };
    var partes = local.split(/[._-]+/).filter(Boolean).map(function (t) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    });
    if (!partes.length) return { nom: "", ape: "", completo: "" };
    return { nom: partes[0], ape: partes.slice(1).join(" "), completo: partes.join(" ") };
  }

  // Navegador y sistema, para los formularios que preguntan el "User agent" (Cloudflare
  // lo pide para saber dónde se vio el abuso). Se lee del navegador REAL, no se inventa.
  function navegadorYSistema() {
    try {
      var ua = (self.navigator && self.navigator.userAgent) || "";
      var chrome = (ua.match(/Chrome\/(\d+)/) || [])[1];
      var so = /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
      if (!chrome && !so) return "";
      return (chrome ? "Chrome/" + chrome : "") + (chrome && so ? " " : "") + so;
    } catch (e) { return ""; }
  }

  // Une la versión inglesa (la que se envía) y la española (referencia) de un correo.
  function bilingue(en, es) {
    return { to: en.to, asunto: en.asunto, asunto_es: es.asunto, cuerpo: en.cuerpo, cuerpo_es: es.cuerpo };
  }

  // Si hay URLs cargadas del Excel, las devuelve (una por línea) para pegarlas en el
  // correo; si no, deja el placeholder manual original.
  function urlsODefault(ctx, placeholder) {
    var u = (ctx && Array.isArray(ctx.urls)) ? ctx.urls.filter(Boolean) : [];
    return u.length ? u.join("\n") : placeholder;
  }

  // Convierte letras A-Z/a-z y dígitos 0-9 a su variante Unicode "Mathematical Bold"
  // para resaltar en correos de TEXTO PLANO. Los acentos (áéíóú), la ñ y la puntuación
  // NO tienen variante en negrita: se dejan tal cual.
  function negrita(s) {
    return (s || "").replace(/[A-Za-z0-9]/g, function (ch) {
      var c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D400 + (c - 65));   // A-Z
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D41A + (c - 97));  // a-z
      return String.fromCodePoint(0x1D7CE + (c - 48));                            // 0-9
    });
  }

  // Párrafo con el perfil OFICIAL de la marca en la red que se está denunciando
  // (o su sitio web oficial si esa red aún no tiene perfil guardado en ⚙ Marcas).
  // Va en TODA denuncia para que la plataforma identifique la cuenta AUTÉNTICA
  // frente al impostor. La redacción vive en JUSTIF.conPerfilOficial (un solo
  // sitio para formularios y correos); aquí solo se le añade el salto de párrafo.
  function lineaPerfilOficial(d, redNombre, marca, lang) {
    var t = "";
    try { t = window.JUSTIF.conPerfilOficial("", redNombre, marca, d, lang) || ""; } catch (e) { return ""; }
    t = t.replace(/^\n+/, "");
    return t ? (t + "\n\n") : "";
  }

  // ==========================================================================
  //  AVISOS OFICIALES YA PUBLICADOS POR LA MARCA
  //  Enlaces donde la propia marca ADVIRTIÓ públicamente de la estafa (su blog,
  //  sus posts en redes). Son la prueba más fuerte de una denuncia por sitios
  //  fraudulentos: demuestran que la marca ya desmintió la oferta y que no pagó
  //  esa publicidad. Se citan en el correo de Cloudflare (puntos 6 y 8).
  //  Para AGREGAR una marca: añade aquí su entrada con los enlaces reales. Si
  //  una marca no está, se usan sus perfiles oficiales de ⚙ Marcas y, si tampoco
  //  hay, el correo deja el hueco MARCADO con [ ... ] en vez de inventar nada.
  // ==========================================================================
  //  `web` = la web CORPORATIVA de la marca para este correo. Existe aparte del
  //  campo `sitio` de ⚙ Marcas porque en varias marcas `sitio` guarda su página
  //  de Facebook (se usa como perfil oficial), y en una denuncia de dominio
  //  fraudulento hay que enseñar el dominio legítimo, no una red social.
  var AVISOS_OFICIALES = {
    "Banco Industrial Guatemala": {
      web: "https://www.corporacionbi.com/gt/bancoindustrial/",
      avisos: [
        "https://blog.corporacionbi.com/seguridad/cuidado-con-las-promociones-falsas",
        "https://www.facebook.com/BancoIndustrial/photos/a.177701498908250/6628425313835804/",
        "https://www.corporacionbi.com/gt/bancoindustrial/estafas-de-inversion/",
        "https://www.facebook.com/BancoIndustrial/posts/774884964677711",
        "https://www.facebook.com/BancoIndustrial/posts/863310599168480",
        "https://www.linkedin.com/posts/bancoindustrial_juntossiemprehaciaadelante-activity-7199439002540589056-2F6-/"
      ]
    }
  };

  // Web corporativa de la marca: la de la tabla de arriba si la tiene; si no, el
  // `dominio` de ⚙ Marcas y, como último recurso, su `sitio`.
  function webOficialDe(marca, d) {
    var ficha = AVISOS_OFICIALES[marca];
    if (ficha && ficha.web) return ficha.web;
    var dom = ((d || {}).dominio || "").trim();
    if (dom) return /^https?:/i.test(dom) ? dom : ("https://" + dom);
    return ((d || {}).sitio || "").trim();
  }

  function avisosOficialesDe(marca, d) {
    var ficha = AVISOS_OFICIALES[marca];
    var propios = ficha && ficha.avisos;
    if (Array.isArray(propios) && propios.length) return propios.slice();
    // Sin avisos propios: se ofrecen los perfiles oficiales de la marca, que al
    // menos sirven para identificar cuál es la cuenta auténtica.
    return [(d || {}).facebook, (d || {}).linkedin, (d || {}).instagram, (d || {}).sitio]
      .map(function (u) { return (u || "").trim(); })
      .filter(function (u, i, a) { return u && a.indexOf(u) === i; });
  }

  // Correo de denuncia (propiedad intelectual / suplantación) para una red social,
  // en inglés (lang "en") o español (lang "es"). Correo propio -> "We are [marca]";
  // si usa el de Seguridad Máxima -> "representing". Cita las normas de esa red.
  function emailIP(ctx, redNombre, destino, lang) {
    var marca = ctx.marca, d = ctx.datos;
    var repres = /seguridadmaxima\.net/i.test(d.correo || "");
    var pols = (window.POLITICAS_GENERALES && window.POLITICAS_GENERALES[redNombre]) || [];
    if (lang === "es") {
      var quienesE = repres
        ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "."
        : "Somos " + marca + ".";
      var firmaE = repres ? "Seguridad Máxima en Redes Informáticas" : marca;
      var polTxtE = pols.length
        ? "\n\nEste contenido infringe las políticas y normas comunitarias de " + redNombre + ", incluyendo:\n" +
          pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n")
        : "";
      var lineaPerfilE = lineaPerfilOficial(d, redNombre, marca, "es");
      var cuerpoE =
        "Hola,\n\n" + quienesE + "\n\n" +
        "Reportamos contenido en " + redNombre + " que infringe la propiedad intelectual y los derechos de marca de " + marca + ".\n\n" +
        "Motivos por los que debe eliminarse:\n" +
        "- Usa el nombre, el logotipo y la identidad de marca de " + marca + " sin autorización, suplantándola.\n" +
        "- Engaña y confunde a los clientes de " + marca + " y puede usarse para solicitar información confidencial o defraudarlos.\n" +
        "- No tiene ninguna relación comercial ni legal con " + marca + " e infringe sus derechos de marca y propiedad intelectual." +
        polTxtE + "\n\n" +
        lineaPerfilE +
        "Solicitamos respetuosa y URGENTEMENTE la eliminación inmediata del siguiente contenido:\n\n" +
        negrita("Contenido a denunciar (URL del perfil / página / publicación):") + "\n" +
        urlsODefault(ctx, "[ Pega aquí el/los enlace(s) de " + redNombre + " a denunciar ]") + "\n\n" +
        "Saludos,\n" + firmaE + (d.correo ? "\nContacto: " + d.correo : "");
      return { to: destino, asunto: "Suplantación de marca / infracción de PI en " + redNombre + " - solicitud urgente de eliminación", cuerpo: cuerpoE };
    }
    var quienes = repres
      ? "We are Security Maximum in Computer Networks, writing on behalf of " + marca + "."
      : "We are " + marca + ".";
    var firma = repres ? "Security Maximum in Computer Networks" : marca;
    var polTxt = pols.length
      ? "\n\nThis content violates " + redNombre + "'s policies and community standards, including:\n" +
        pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n")
      : "";
    var lineaPerfil = lineaPerfilOficial(d, redNombre, marca, "en");
    var cuerpo =
      "Hello,\n\n" + quienes + "\n\n" +
      "We are reporting content on " + redNombre + " that infringes the intellectual property and brand rights of " + marca + ".\n\n" +
      "Reasons this content must be removed:\n" +
      "- It uses the name, logo and brand identity of " + marca + " without authorization, impersonating it.\n" +
      "- It misleads and confuses " + marca + "'s customers and may be used to request confidential information or to defraud them.\n" +
      "- It has no business or legal relationship with " + marca + " and infringes its trademark and intellectual property rights." +
      polTxt + "\n\n" +
      lineaPerfil +
      "We respectfully and URGENTLY request the immediate removal of the following content:\n\n" +
      negrita("Reported content (profile / page / post URL):") + "\n" +
      urlsODefault(ctx, "[ Paste here the " + redNombre + " link(s) you are reporting ]") + "\n\n" +
      "Sincerely,\n" + firma + (d.correo ? "\nContact: " + d.correo : "");
    return { to: destino, asunto: "Brand impersonation / IP infringement on " + redNombre + " - urgent removal request", cuerpo: cuerpo };
  }

  // Correo de DIFAMACIÓN para una red social (paralelo a emailIP). Explica con 4
  // motivos por qué debe eliminarse, cita las POLÍTICAS/normas comunitarias de la
  // red (con enlace, desde POLITICAS_GENERALES) y la LEY PENAL del país de la marca
  // (delitos contra el honor: calumnia, injuria y difamación) vía JUSTIF.leyPenal.
  function emailDifamacion(ctx, redNombre, destino, lang) {
    var marca = ctx.marca, d = ctx.datos;
    var repres = /seguridadmaxima\.net/i.test(d.correo || "");
    var pols = (window.POLITICAS_GENERALES && window.POLITICAS_GENERALES[redNombre]) || [];
    var pais = d.pais || "";
    var ley = (window.JUSTIF && window.JUSTIF.leyPenal)
      ? window.JUSTIF.leyPenal(pais, lang)
      : (lang === "en" ? "the applicable criminal law on crimes against honor" : "la legislación penal aplicable sobre delitos contra el honor");
    if (lang === "es") {
      var quienesE = repres
        ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "."
        : "Somos " + marca + ".";
      var firmaE = repres ? "Seguridad Máxima en Redes Informáticas" : marca;
      var polTxtE = pols.length
        ? "\n\nEste contenido infringe las políticas y normas comunitarias de " + redNombre +
          ", en particular sus normas sobre suplantación de identidad, información falsa o engañosa y acoso u hostigamiento, incluyendo:\n" +
          pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n")
        : "";
      var lineaPerfilE = lineaPerfilOficial(d, redNombre, marca, "es");
      var cuerpoE =
        "Hola,\n\n" + quienesE + "\n\n" +
        "Reportamos contenido difamatorio publicado en " + redNombre + " en contra de " + marca + ". Solicitamos su eliminación inmediata por las siguientes razones:\n" +
        "- Difunde información FALSA y difamatoria sobre " + marca + ", dañando su reputación y su buen nombre ante el público y sus clientes.\n" +
        "- Se hace pasar por " + marca + " o la ataca directamente sin autorización, generando confusión y engaño entre sus clientes.\n" +
        "- El contenido puede facilitar fraudes, estafas o extorsiones contra los clientes de " + marca + ", aprovechando el descrédito y la suplantación.\n" +
        "- No existe relación comercial ni legal con " + marca + ", ni base veraz para las afirmaciones; su permanencia agrava el daño reputacional cada día que sigue publicado." +
        polTxtE + "\n\n" +
        "Además, los hechos pueden constituir delitos contra el honor (calumnia, injuria y difamación) conforme a " + ley + (pais ? " (" + pais + ")" : "") + ".\n\n" +
        lineaPerfilE +
        "Solicitamos respetuosa y URGENTEMENTE la eliminación inmediata del siguiente contenido:\n\n" +
        negrita("Contenido a denunciar (URL del perfil / página / publicación):") + "\n" +
        urlsODefault(ctx, "[ Pega aquí el/los enlace(s) de " + redNombre + " a denunciar ]") + "\n\n" +
        "Saludos,\n" + firmaE + (d.correo ? "\nContacto: " + d.correo : "");
      return { to: destino, asunto: "Contenido difamatorio contra " + marca + " en " + redNombre + " - solicitud urgente de eliminación", cuerpo: cuerpoE };
    }
    var quienes = repres
      ? "We are Security Maximum in Computer Networks, writing on behalf of " + marca + "."
      : "We are " + marca + ".";
    var firma = repres ? "Security Maximum in Computer Networks" : marca;
    var polTxt = pols.length
      ? "\n\nThis content violates " + redNombre +
        "'s policies and community standards, in particular its rules on impersonation, false or misleading information and harassment or bullying, including:\n" +
        pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n")
      : "";
    var lineaPerfil = lineaPerfilOficial(d, redNombre, marca, "en");
    var cuerpo =
      "Hello,\n\n" + quienes + "\n\n" +
      "We are reporting defamatory content published on " + redNombre + " against " + marca + ". We request its immediate removal for the following reasons:\n" +
      "- It spreads FALSE and defamatory information about " + marca + ", damaging its reputation and good name before the public and its customers.\n" +
      "- It impersonates " + marca + " or attacks it directly without authorization, causing confusion and misleading its customers.\n" +
      "- The content may facilitate fraud, scams or extortion against " + marca + "'s customers, exploiting the disrepute and impersonation.\n" +
      "- There is no business or legal relationship with " + marca + ", nor any truthful basis for the claims; leaving it online aggravates the reputational harm every day it remains." +
      polTxt + "\n\n" +
      "Furthermore, these facts may constitute crimes against honor (slander, libel and defamation) under " + ley + (pais ? " (" + pais + ")" : "") + ".\n\n" +
      lineaPerfil +
      "We respectfully and URGENTLY request the immediate removal of the following content:\n\n" +
      negrita("Reported content (profile / page / post URL):") + "\n" +
      urlsODefault(ctx, "[ Paste here the " + redNombre + " link(s) you are reporting ]") + "\n\n" +
      "Sincerely,\n" + firma + (d.correo ? "\nContact: " + d.correo : "");
    return { to: destino, asunto: "Defamatory content against " + marca + " on " + redNombre + " - urgent removal request", cuerpo: cuerpo };
  }

  // Correo para denunciar un SITIO WEB malicioso (phishing) que usa la imagen de un
  // funcionario del Banco de Guatemala. Fijo a Banco de Guatemala (banguat.gob.gt);
  // 'personaEn'/'personaEs' es el nombre (+cargo) del funcionario suplantado. El
  // destinatario (abuse del hosting) y la(s) URL(s) del sitio los completa el usuario.
  function correoBanguatMalicioso(ctx, personaEn, personaEs) {
    var contacto = "diegoarias@seguridadmaxima.net";
    var en = {
      to: "",
      asunto: "¡¡Urgent!! - Malicious site(1) - sitio web malicioso - Banco de Guatemala",
      cuerpo:
        "Dear Abuse Team,\n\n" +
        "We are Seguridad Maxima en Redes Informáticas, acting on behalf of Banco de Guatemala.\n\n" +
        "For all incident-related communications, please contact us at: " + contacto + "\n\n" +
        "We have identified the following fraudulent domain actively used in phishing campaigns targeting Banco de Guatemala's customers.\n\n" +
        "We respectfully request the immediate suspension and removal of the malicious content from your infrastructure.\n\n" +
        "Findings and Security Concerns:\n\n" +
        "They use the image of Mr. " + personaEn + " without authorization and commit fraud.\n\n" +
        "Brand Impersonation: The site uses the logos, visual identity and trademarks of Banco de Guatemala without authorization, deceiving users into believing it is an official service.\n\n" +
        "Active Phishing Campaign: The domain is being used to harvest sensitive credentials (banking data, personal information) from victims.\n\n" +
        "Mobile Access Enabled: The malicious site is fully accessible from mobile devices, increasing the attack surface and facilitating the scam.\n\n" +
        "Geo-Restricted Access (IMPORTANT): In many cases, the malicious site can ONLY be viewed/accessed from Guatemala. The attackers geo-restrict the domain so that it does not load from other countries, which can make the URL appear inactive or unavailable from your location. If the link does not open on your end, this is expected: we can provide screenshots, video evidence and/or verification performed from a Guatemalan connection upon request.\n\n" +
        "Acceptable Use Policy Violation: Hosting phishing content is an explicit violation of your AUP / Terms of Service.\n\n" +
        "No Commercial Relationship: Banco de Guatemala has no commercial, operational or legal relationship with this website or its owner.\n\n" +
        "Reputational and Financial Damage: End users are at real risk of financial loss and identity theft, and the legitimate brand suffers ongoing reputational harm.\n\n" +
        "Official Domain: The only authorized and legitimate website of Banco de Guatemala is: https://banguat.gob.gt\n\n" +
        negrita("Reported malicious site(s):") + "\n" + urlsODefault(ctx, "[ Paste here the malicious URL(s)/domain(s) you are reporting ]") + "\n\n" +
        "Below you will find screenshots of the phishing site and the legitimate website for visual reference.\n\n" +
        "Sincerely,\nSeguridad Maxima en Redes Informáticas\nOn behalf of Banco de Guatemala\nContact: " + contacto
    };
    var es = {
      asunto: "¡¡Urgente!! - Sitio web malicioso - Banco de Guatemala",
      cuerpo:
        "Estimado equipo de Abuso,\n\n" +
        "Somos Seguridad Máxima en Redes Informáticas, actuando en representación del Banco de Guatemala.\n\n" +
        "Para toda comunicación relacionada con el incidente, contáctenos en: " + contacto + "\n\n" +
        "Hemos identificado el siguiente dominio fraudulento usado activamente en campañas de phishing dirigidas a los clientes del Banco de Guatemala.\n\n" +
        "Solicitamos respetuosamente la suspensión y eliminación inmediata del contenido malicioso de su infraestructura.\n\n" +
        "Hallazgos y preocupaciones de seguridad:\n\n" +
        "Utilizan la imagen del Sr. " + personaEs + " sin autorización y cometen fraude.\n\n" +
        "Suplantación de marca: El sitio usa los logotipos, la identidad visual y las marcas del Banco de Guatemala sin autorización, engañando a los usuarios para que crean que es un servicio oficial.\n\n" +
        "Campaña de phishing activa: El dominio se usa para robar credenciales sensibles (datos bancarios, información personal) de las víctimas.\n\n" +
        "Acceso móvil habilitado: El sitio malicioso es totalmente accesible desde dispositivos móviles, ampliando la superficie de ataque y facilitando la estafa.\n\n" +
        "Acceso restringido por geografía (IMPORTANTE): En muchos casos, el sitio malicioso SOLO puede verse/accederse desde Guatemala. Los atacantes restringen el dominio por geografía para que no cargue desde otros países, lo que puede hacer que la URL parezca inactiva o no disponible desde su ubicación. Si el enlace no abre de su lado, es lo esperado: podemos proporcionar capturas, evidencia en video y/o verificación hecha desde una conexión en Guatemala si lo solicitan.\n\n" +
        "Violación de la política de uso aceptable: Alojar contenido de phishing es una violación explícita de su AUP / Términos de Servicio.\n\n" +
        "Sin relación comercial: El Banco de Guatemala no tiene ninguna relación comercial, operativa ni legal con este sitio web ni con su propietario.\n\n" +
        "Daño reputacional y financiero: Los usuarios finales están en riesgo real de pérdida financiera y robo de identidad, y la marca legítima sufre un daño reputacional continuo.\n\n" +
        "Dominio oficial: El único sitio web autorizado y legítimo del Banco de Guatemala es: https://banguat.gob.gt\n\n" +
        negrita("Sitio(s) malicioso(s) a denunciar:") + "\n" + urlsODefault(ctx, "[ Pega aquí la(s) URL(s)/dominio(s) malicioso(s) a denunciar ]") + "\n\n" +
        "A continuación encontrará capturas del sitio de phishing y del sitio web legítimo como referencia visual.\n\n" +
        "Atentamente,\nSeguridad Máxima en Redes Informáticas\nEn representación del Banco de Guatemala\nContacto: " + contacto
    };
    return bilingue(en, es);
  }

  function postalDe(pais) {
    try { return window.JUSTIF.POSTAL[window.JUSTIF.norm(pais)] || ""; } catch (e) { return ""; }
  }
  // URL de la base de datos de marcas del país (campo TM_URL); OMPI como fallback.
  function baseMarcasDe(pais) { try { return window.JUSTIF.baseMarcasDe(pais); } catch (e) { return "https://branddb.wipo.int/"; } }

  // Enlace de EJEMPLO a la obra protegida ("Añade un enlace a la obra protegida por
  // derechos de autor"). Es OBLIGATORIO en los dos formularios de Meta: sin él no deja
  // enviar. Se busca por orden: perfil OFICIAL de la marca en ESA red -> sitio web ->
  // dominio legítimo -> ficha oficial en Google Play -> ficha oficial en App Store. Casi
  // ninguna marca tiene los cinco vacíos, y así el campo deja de quedarse en blanco.
  // Devuelve {url, que} para poder decir en la descripción QUÉ es ese enlace.
  function obraEjemploDe(d, red) {
    var cand = [
      { u: (red === "Instagram" ? d.instagram : d.facebook), q: "perfil oficial en " + red },
      { u: d.sitio,    q: "sitio web oficial" },
      { u: d.dominio ? ("https://" + String(d.dominio).replace(/^https?:\/\//i, "")) : "", q: "sitio web oficial" },
      { u: d.play,     q: "aplicación oficial en Google Play" },
      { u: d.appstore, q: "aplicación oficial en la App Store" }
    ];
    for (var i = 0; i < cand.length; i++) {
      var u = (cand[i].u || "").toString().trim();
      if (u) return { url: u, que: cand[i].q };
    }
    return { url: "", que: "" };
  }

  // Constructores de plan para los formularios de Meta (Facebook/Instagram), que
  // comparten estructura y nombres de campo. 'this' es el objeto del formulario.
  //
  // DERECHOS DE AUTOR de Facebook/Instagram: Meta sirve DOS formularios distintos para
  // lo mismo, y cuál te toca depende del día, del país y de la cuenta. El plan lleva LAS
  // DOS VARIANTES y el motor ejecuta solo la que de verdad está en pantalla (pasos con
  // `siHay`/`siNoHay`, ver la GUARDA DE VARIANTE en motor.js). Antes el plan solo cubría
  // el portal nuevo: cuando salía el clásico no se rellenaba NADA.
  //
  //  A) CLÁSICO — facebook.com/help/contact/1758255661104383 y
  //     help.instagram.com/contact/552695131608132. Todo en UNA página, campos con
  //     atributo `name` IDÉNTICOS en Facebook y en Instagram (volcados reales en
  //     estructura_fb_da.json / estructura_ig_copyright.json) y las URL en las cajas
  //     "Enlace 1..30" (+ casilla "Tengo enlaces adicionales" para las 11..30).
  //     Se reconoce porque existe el radio [name="copyright_owner"].
  //
  //  B) PORTAL NUEVO — help.meta.com/requests/1523801815366035. ASISTENTE DE 2 PASOS,
  //     los campos NO tienen `name` (se localizan por su rótulo en español) y las URLs
  //     van TODAS en UNA sola caja (hasta 30, separadas por coma).
  //       Paso 1 - "Danos más detalles sobre el propietario de los derechos de autor":
  //                país + "¿Eres el propietario de los derechos?" = Sí + nombre del
  //                propietario -> botón "Siguiente".
  //       Paso 2 - "Danos más detalles sobre lo que quieres reportar y envía el reporte":
  //                URLs, ejemplo de la obra, descripción de la obra, cómo infringe,
  //                nombre, correo (x2), declaración y firma.
  // Instructivo que ve el usuario: sirve para las DOS variantes de Meta (ver planCopyright).
  var META_COPY_MANUAL = "Meta usa dos formularios distintos para esto y la extensión rellena el que te toque: " +
    "si sale el CLÁSICO (todo en una página), llena también las cajas «Enlace 1..30»; si sale el PORTAL NUEVO " +
    "(asistente de 2 pasos), las URL van todas en una sola caja (tope 30). Comprueba el enlace de ejemplo a tu obra " +
    "y las casillas de la Declaración, y pulsa Enviar.";

  function planCopyright(ctx) {
    var d = ctx.datos, marca = ctx.marca, red = this.red;
    var obra = obraEjemploDe(d, red), perfil = obra.url;
    // DESCRIPCIÓN DE LA OBRA. Es un campo DISTINTO del de "cómo infringe" (ctx.justif):
    // aquí Meta pregunta QUÉ es la obra y de quién es, no qué hace el infractor.
    var descObra = "Logotipo, nombre comercial, imágenes y materiales gráficos originales de " + marca +
      ", obra protegida por derechos de autor cuya titularidad corresponde en exclusiva a " + marca + "." +
      (perfil ? " Puede verse en su " + obra.que + ": " + perfil + "." : "");
    var avisos = [];
    if (!perfil) avisos.push("La marca «" + marca + "» no tiene <b>perfil de " + red + "</b>, <b>sitio web</b>, " +
      "<b>dominio</b> ni <b>app</b> guardados, y Meta exige un enlace de ejemplo a la obra. " +
      "Añade uno en <b>⚙ Marcas</b> o pégalo a mano antes de enviar.");
    var C = '[name="copyright_owner"]'; // marca de agua del formulario CLÁSICO
    return { url: this.url, manual: this.manual, avisos: avisos, pasos: [
      // ================= A) Formulario CLÁSICO (campos con `name`) =================
      { tipo: "radio", siHay: C, name: "copyright_owner",
        texto: "soy el propietario|i am the rights owner", esperaMs: 800 },
      { tipo: "fillName", siHay: C, name: "your_name", valor: marca },
      { tipo: "fillName", siHay: C, name: "email", valor: d.correo },
      { tipo: "fillName", siHay: C, name: "confirm_email", valor: d.correo },
      // "Nombre del propietario de los derechos" (puede ser la organización representada).
      { tipo: "fillName", siHay: C, name: "reporter_name", valor: marca },
      // "¿Cuál de estas afirmaciones describe mejor la obra?" -> Foto/Photo (el logotipo y
      // los materiales gráficos de la marca son obra visual; opciones: Foto/Vídeo/Texto/Otro).
      { tipo: "select", siHay: C, name: "describe_copyrighted_work_me", texto: "foto|photo", esperaMs: 400 },
      { tipo: "fillName", siHay: C, name: "copyright_url", valor: perfil },
      { tipo: "fillName", siHay: C, name: "describe_copyrighted_work_me_URLs", valor: descObra },
      // "¿Qué tipo de contenido quieres denunciar?" -> Foto, vídeo o publicación.
      { tipo: "check", siHay: C, name: "Content_type[]", texto: "foto, video o publicacion|photo, video or post" },
      // Cajas "Enlace 1..30" con las URL del Excel (marca sola "Tengo enlaces adicionales").
      { tipo: "fillUrlList", siHay: C, dominio: (red === "Instagram" ? "instagram.com" : "facebook.com"),
        checkLabel: "enlaces adicionales|additional links to report|enlaces adicionales que denunciar",
        urls: (ctx.urls || []) },
      { tipo: "fillName", siHay: C, name: "why_reporting_other", valor: ctx.justif },
      // Dirección postal: en derechos de autor va oculta salvo en algunos países.
      { tipo: "fillName", siHay: C, name: "Address", valor: postalDe(d.pais), opcional: true },
      { tipo: "fillName", siHay: C, name: "Electronic_sig", valor: marca },
      // El PAÍS va al final a propósito: en el formulario clásico, elegirlo es lo que a
      // veces te manda al portal nuevo; así el resto ya quedó escrito antes del salto.
      { tipo: "select", siHay: C, name: "rights_owner_country_routing", texto: d.pais },
      { tipo: "radio", siHay: C, name: "copyright_owner",
        texto: "soy el propietario|i am the rights owner", opcional: true }, // re-marcar al final

      // ================= B) Portal NUEVO help.meta.com (por rótulo) =================
      // OJO CON LOS RÓTULOS: Meta cambia la redacción según el español regional. En es-419
      // dice "propietario de los derechos" / "¿Dónde estás defendiendo derechos?" y en es-ES
      // "titular de los derechos" / "¿Dónde estás ejerciendo tus derechos?". Por eso se casa
      // por PALABRAS CLAVE cortas comunes a ambas, nunca por la frase completa.
      // -------- Paso 1: titular/propietario de los derechos --------
      // El país sale del campo "🌎 País" de la marca (panel Marcas). Si está vacío o no
      // coincide con la lista de Meta, `desc` hace que el aviso lo diga con claridad en vez
      // de dejar el desplegable vacío en silencio ("This field is required").
      { tipo: "dropdown", siNoHay: C, pregunta: "defendiendo derechos|ejerciendo tus derechos|asserting rights",
        opcion: d.pais, desc: "el país de la marca", esperaMs: 1200 },
      { tipo: "radioPregunta", siNoHay: C, pregunta: "titular de los derechos|propietario de los derechos|rights owner",
        opcion: "si|yes", esperaMs: 1200 },
      { tipo: "fillLabel", siNoHay: C, label: "como se llama el titular|nombre del titular|nombre del propietario|name of the rights owner|rights owner name",
        valor: marca, reintentos: 6 },
      { tipo: "clickBoton", siNoHay: C, texto: "siguiente|next", avanza: true, esperaMs: 2500 },
      // -------- Paso 2: contenido a denunciar (en ORDEN de aparición) --------
      // Todas las URLs del Excel en UNA sola caja, separadas por coma (tope 30 de Meta).
      // `excluir`: la caja del "ejemplo de tu obra" comparte el ejemplo facebook.com/… y sin
      // esto se llevaba las URL a denunciar, que es justo lo contrario.
      { tipo: "fillUrlsUnaCaja", siNoHay: C,
        label: "url o los identificadores|urls o identificadores|urls or identifiers|contenido que quieres reportar|contenido que quieres denunciar",
        placeholder: "instagram.com|facebook.com", excluir: "ejemplo de tu obra|obra protegida|copyrighted work",
        urls: (ctx.urls || []), separador: ", ", reintentos: 6 },
      { tipo: "selectLabel", siNoHay: C, label: "describe mejor la obra|describes the copyrighted work|tipo de obra",
        opcion: "foto|photo", opcional: true },
      { tipo: "fillLabel", siNoHay: C, label: "ejemplo de tu obra|ejemplo de la obra|obra con derechos de autor|obra protegida por derechos de autor|enlace a la obra|example of your copyrighted work",
        valor: perfil, reintentos: 6 },
      { tipo: "fillLabel", siNoHay: C, label: "describe tu obra|describe la obra|descripcion de la obra|describe your copyrighted work",
        valor: descObra, opcional: true, reintentos: 3 },
      { tipo: "checkLabel", siNoHay: C, texto: "foto, video o publicacion|photo, video or post", opcional: true },
      { tipo: "fillLabel", siNoHay: C, label: "derechos de propiedad intelectual|intellectual property rights|de que manera crees|describe como crees|how you believe this content",
        valor: ctx.justif, reintentos: 6 },
      { tipo: "fillLabel", siNoHay: C, label: "tu nombre completo|nombre y apellidos|your full name", valor: marca, reintentos: 6 },
      { tipo: "fillLabel", siNoHay: C, label: "correo electronico|email address", valor: d.correo, reintentos: 6 },
      // OJO: el rótulo real es "Confirmar DIRECCIÓN de correo electrónico", así que
      // "confirmar correo electronico" (todo seguido) NO casa. Se listan las redacciones
      // que de verdad usa Meta; basta con que una case.
      { tipo: "fillLabel", siNoHay: C, label: "confirmar direccion|confirma tu direccion|confirmar tu direccion|confirmar correo|confirma tu correo|confirm email|confirm your email",
        valor: d.correo, reintentos: 6 },
      { tipo: "fillLabel", siNoHay: C, label: "direccion postal|mailing address", valor: postalDe(d.pais), opcional: true },
      // Casillas de la "Declaración" (buena fe / bajo pena de perjurio / autorización).
      { tipo: "checkVarios", siNoHay: C, etiquetas: "buena fe|perjurio|good faith|penalty of perjury|autorizacion para actuar|authorized to act",
        max: 4, opcional: true, reintentos: 3 },
      { tipo: "fillLabel", siNoHay: C, label: "firma electronica|electronic signature", valor: marca, reintentos: 6 },
      // Re-marcar al final: React del portal nuevo revierte el radio al rellenar lo demás.
      { tipo: "radioPregunta", siNoHay: C, pregunta: "titular de los derechos|propietario de los derechos|rights owner",
        opcion: "si|yes", opcional: true }
    ] };
  }
  // Clase de bienes/servicios de la marca (campo "Clase de bienes y servicios de marca
  // comercial" de TikTok y similares). Valor por defecto; se puede sobrescribir por marca
  // con el campo `clase_bienes` en los datos de la marca.
  var CLASE_BIENES_DEFECTO = "Negocios financieros, bancarios, de crédito. Negocios Monetarios.";
  function planMarca(ctx) {
    var d = ctx.datos, marca = ctx.marca;
    return { url: this.url, manual: this.manual, pasos: [
      { tipo: "radio", name: "continuereport", texto: "trademark", esperaMs: 800 },
      { tipo: "radio", name: "relationship_rightsowner", texto: "rights owner", esperaMs: 1500 },
      { tipo: "fillName", name: "your_name", valor: marca },
      { tipo: "fillName", name: "email", valor: d.correo },
      { tipo: "fillName", name: "confirm_email", valor: d.correo },
      { tipo: "fillName", name: "reporter_name", valor: marca },
      // Web del titular: perfil OFICIAL de la marca en esta red (Instagram/Facebook) con
      // fallback a d.sitio si el perfil de la red aún no está configurado en "Marcas".
      { tipo: "fillName", name: "websiterightsholder", valor: (this.red === "Instagram" ? (d.instagram || d.sitio) : (d.facebook || d.sitio)) || "" },
      { tipo: "fillName", name: "what_is_your_trademark", valor: marca },
      // N.º de registro: el campo ya tiene name propio (TMREGNUMBER); se deja además la
      // búsqueda por rótulo como respaldo por si Meta le vuelve a cambiar el name.
      { tipo: "fillName", name: "TMREGNUMBER", valor: (d.registro || "") },
      { tipo: "fillLabel", label: "numero de registro de la marca comercial|numero de registro|registration number|trademark registration number|registration number of the trademark", valor: (d.registro || ""), opcional: true },
      // Enlace directo al registro de la marca en una base de datos de marcas: usa d.tmurl
      // (override por marca, editable en el panel de Marcas) si está definido; si no, cae en
      // la base por país (OMPI si el país no tiene buscador público fiable).
      { tipo: "fillName", name: "TM_URL", valor: (d.tmurl && String(d.tmurl).trim()) ? String(d.tmurl).trim() : baseMarcasDe(d.pais) },
      { tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (d.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true },
      { tipo: "select", name: "rights_owner_country_routing", texto: d.pais },
      { tipo: "check", name: "content_type[]", texto: "uses the rights owner" },
      { tipo: "fillName", name: "why_reporting_other", valor: ctx.justif },
      { tipo: "fillName", name: "signature", valor: marca },
      { tipo: "radio", name: "continuereport", texto: "trademark" },          // re-marcar al final
      { tipo: "radio", name: "relationship_rightsowner", texto: "rights owner" },
      // Autollena las cajas "Enlace 1..30" con la lista de URLs del Excel (si la hay).
      // checkLabel: Meta cambió la redacción ("...adicionales PARA REPORTAR", antes "que
      // denunciar"); se dejan varias redacciones + el value en inglés como respaldo.
      { tipo: "fillUrlList", dominio: (this.red === "Instagram" ? "instagram.com" : "facebook.com"), checkLabel: "enlaces adicionales|additional links to report|enlaces adicionales que denunciar", urls: (ctx.urls || []) }
    ] };
  }
  function planDifam(ctx) {
    var d = ctx.datos, marca = ctx.marca;
    return { url: this.url, manual: this.manual, pasos: [
      { tipo: "radio", name: "reporting_party", texto: "", esperaMs: 1500 },
      { tipo: "select", name: "gb_country", texto: d.pais },
      { tipo: "select", name: "japan_idpa_category", texto: "honor" },
      { tipo: "fillName", name: "your_name", valor: marca },
      { tipo: "fillName", name: "organization", valor: marca },
      { tipo: "fillName", name: "client_name", valor: marca },
      { tipo: "fillName", name: "Address", valor: postalDe(d.pais) },
      { tipo: "fillName", name: "email", valor: d.correo },
      { tipo: "fillDifamUrls", urls: (ctx.urls || []), motivo: ctx.justif },
      { tipo: "fillName", name: "Yes_submit", valor: marca },
      { tipo: "radio", name: "reporting_party", texto: "" } // re-marcar la 1.ª opción al final
    ] };
  }

  // WhatsApp: formulario único (un solo URL). El tipo (copyright/marca/falsif.) y la
  // relación se eligen con radios; se denuncia por "Private Message Chat / Phone Number".
  var WA_URL = "https://www.whatsapp.com/contact/forms/5071674689613749/";
  function planWhatsApp(ctx) {
    var d = ctx.datos, marca = ctx.marca, pasos = [];
    pasos.push({ tipo: "radio", name: "srt_report_type", texto: this.tipoTexto, esperaMs: 700 });
    pasos.push({ tipo: "radio", name: this.relName, texto: "rights owner", esperaMs: 900 });
    pasos.push({ tipo: "fillName", name: "your_name", valor: marca });
    pasos.push({ tipo: "fillName", name: "Address", valor: postalDe(d.pais) });
    pasos.push({ tipo: "fillName", name: "email", valor: d.correo });
    pasos.push({ tipo: "fillName", name: "confirm_email", valor: d.correo });
    pasos.push({ tipo: "fillName", name: "reporter_name", valor: marca });
    if (this.esCopy) {
      pasos.push({ tipo: "select", name: "where_asserting_rights_2", texto: d.pais });
      pasos.push({ tipo: "select", name: "copyrighted_work", texto: "other" });
      pasos.push({ tipo: "fillName", name: "website_rights_holder", valor: d.sitio || "" });
      pasos.push({ tipo: "fillName", name: "provide_link_copyrighted_work", valor: "Perfil oficial de " + marca });
    } else {
      pasos.push({ tipo: "fillName", name: "website_rights_holder", valor: d.sitio || "" });
      pasos.push({ tipo: "fillName", name: "what_is_your_trademark", valor: marca });
      pasos.push({ tipo: "select", name: "registration_trademark", texto: d.pais });
      pasos.push({ tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (d.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true });
    }
    pasos.push({ tipo: "radio", name: "srt_content_type", texto: "Private Message", esperaMs: 1200 });
    pasos.push({ tipo: "radio", name: "content_type_private_message", texto: "Phone Number", esperaMs: 800 });
    pasos.push({ tipo: "fillName", name: "describe_how", valor: ctx.justif });
    pasos.push({ tipo: "fillName", name: "signature", valor: marca });
    // re-marcar los radios al final (React los revierte al rellenar lo demás)
    pasos.push({ tipo: "radio", name: "srt_report_type", texto: this.tipoTexto });
    pasos.push({ tipo: "radio", name: this.relName, texto: "rights owner" });
    pasos.push({ tipo: "radio", name: "srt_content_type", texto: "Private Message" });
    pasos.push({ tipo: "radio", name: "content_type_private_message", texto: "Phone Number" });
    return { url: this.url, manual: this.manual, pasos: pasos };
  }

  window.FORMULARIOS = {
    // ----------------------------------------------------------------------
    li_copy: {
      red: "LinkedIn", nombre: "Derechos de autor", cat: "li_copy",
      url: "https://www.linkedin.com/help/linkedin/ask/TS-NCI?lang=es",
      manual: "Pega la URL del contenido a denunciar y, si quieres, adjunta archivo. Resuelve el reCAPTCHA y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var marca = (ctx.marca || "").trim(), correo = (ctx.datos.correo || "").trim(), pais = (ctx.datos.pais || "").trim();
        var n = nombreLinkedIn(marca, correo, ctx.correoPersona);
        var firma = (n.nom + " " + n.ape).trim();
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "select", name: "relationship_with_the_rights_owner", texto: "agente autorizado", esperaMs: 1800 },
          { tipo: "select", name: "type_of_content", texto: "otro", esperaMs: 400 },
          { tipo: "selectPais", name: "country", valor: pais },
          { tipo: "fillName", name: "first_name", valor: n.nom },
          { tipo: "fillName", name: "last_name", valor: n.ape },
          { tipo: "fillName", name: "email", valor: correo },
          { tipo: "fillName", name: "copyright_owner", valor: marca },
          { tipo: "fillName", name: "authorized_agent_name:", valor: marca },
          { tipo: "fillName", name: "consent_auth_sig", valor: firma },
          { tipo: "fillCss", css: "#dyna-content_description", valor: ctx.justif },
          { tipo: "fillCss", css: "#dyna-copyright_description", valor: ctx.justif }
        ] };
      }
    },
    // ----------------------------------------------------------------------
    li_difam: {
      red: "LinkedIn", nombre: "Difamación", cat: "li_difam",
      url: "https://www.linkedin.com/help/linkedin/ask/TS-NDC?lang=es",
      manual: "Pega el enlace al contenido difamatorio. Resuelve el reCAPTCHA y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var marca = (ctx.marca || "").trim(), correo = (ctx.datos.correo || "").trim(), pais = (ctx.datos.pais || "").trim();
        var n = nombreLinkedIn(marca, correo, ctx.correoPersona);
        var autoriz = "Actúo como agente autorizado de " + marca + " para presentar esta denuncia en su representación.";
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "select", name: "guidance_select", texto: "difamatorio", esperaMs: 1800 },
          { tipo: "select", name: "defamation_type", texto: "agente autorizado", esperaMs: 1800 },
          { tipo: "selectPais", name: "country", valor: pais },
          { tipo: "fillName", name: "first_name", valor: n.nom },
          { tipo: "fillName", name: "last_name", valor: n.ape },
          { tipo: "fillName", name: "email", valor: correo },
          { tipo: "fillCss", css: "#dyna-explain_authorization", valor: autoriz },
          { tipo: "fillName", name: "defamatory_contact_name", valor: marca },
          { tipo: "fillName", name: "defamator_contact_email", valor: correo },
          { tipo: "fillCss", css: "#dyna-defamatory_information_description", valor: ctx.justif },
          { tipo: "check", name: "required_statements_is_true" },
          { tipo: "check", name: "required_statements_may_forward" }
        ] };
      }
    },
    // ----------------------------------------------------------------------
    // El formulario de marca de LinkedIn está en inglés (LinkedIn no lo traduce).
    li_marca: {
      red: "LinkedIn", nombre: "Marca registrada", cat: "li_marca",
      url: "https://www.linkedin.com/help/linkedin/ask/TS-NTMI?lang=es",
      manual: "Completa 'Content Location' y la URL del contenido, adjunta el registro de marca y la carta de autorización, marca las casillas de adjuntos, resuelve el reCAPTCHA y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var marca = (ctx.marca || "").trim(), correo = (ctx.datos.correo || "").trim(), pais = (ctx.datos.pais || "").trim(), sitio = (ctx.datos.sitio || "").trim();
        var n = nombreLinkedIn(marca, correo, ctx.correoPersona);
        var firma = (n.nom + " " + n.ape).trim();
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "select", name: "report_reasons", texto: "infringement", esperaMs: 1800 },
          { tipo: "select", name: "trademark-select", texto: "authorized agent", esperaMs: 1800 },
          { tipo: "fillName", name: "first_name", valor: n.nom },
          { tipo: "fillName", name: "last_name", valor: n.ape },
          { tipo: "fillName", name: "email", valor: correo },
          { tipo: "fillName", name: "trademark_name", valor: marca },
          { tipo: "fillName", name: "trademark_country", valor: pais },
          { tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (ctx.datos.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true },
          { tipo: "fillName", name: "trademark_company_name", valor: marca },
          // URL de la empresa titular: página OFICIAL de la marca en LinkedIn con fallback a sitio.
          { tipo: "fillName", name: "trademark_company_url", valor: (ctx.datos.linkedin || sitio) },
          { tipo: "fillName", name: "trademark_company_contact", valor: marca },
          { tipo: "fillName", name: "trademark_contact_email", valor: correo },
          { tipo: "fillCss", css: "#dyna-content_description", valor: ctx.justif },
          { tipo: "fillName", name: "digital_signature_name", valor: firma }
        ] };
      }
    },
    // ================= Facebook / Instagram (motor Meta) =================
    // Derechos de autor: portal NUEVO de Meta (el antiguo help/contact ya solo redirige aquí).
    fb_da:        { red: "Facebook",  nombre: "Derechos de autor", cat: "autor", url: "https://help.meta.com/requests/1523801815366035?claim_type=IP_COPYRIGHT&platform_copyright=FACEBOOK_CORE",  manual: META_COPY_MANUAL, construirPlan: planCopyright },
    ig_copyright: { red: "Instagram", nombre: "Derechos de autor", cat: "autor", url: "https://help.meta.com/requests/1523801815366035?claim_type=IP_COPYRIGHT&platform_copyright=INSTAGRAM_CORE", manual: META_COPY_MANUAL, construirPlan: planCopyright },
    fb_marca:     { red: "Facebook",  nombre: "Marca registrada",  cat: "marca", url: "https://www.facebook.com/help/contact/1057530390957243", manual: "Pega las URL del contenido infractor y el N.º de registro si lo tienes. Revisa antes de enviar.", construirPlan: planMarca },
    ig_marca:     { red: "Instagram", nombre: "Marca registrada",  cat: "marca", url: "https://help.instagram.com/contact/230197320740525",        manual: "Pega las URL del contenido infractor. Revisa antes de enviar.", construirPlan: planMarca },
    fb_difam:     { red: "Facebook",  nombre: "Difamación",        cat: "difam", url: "https://www.facebook.com/help/contact/430253071144967", manual: "Selecciona cuántas URL y pega cada enlace con su motivo. Revisa antes de enviar.", construirPlan: planDifam },
    ig_difam:     { red: "Instagram", nombre: "Difamación",        cat: "difam", url: "https://help.instagram.com/contact/653100351788502",        manual: "Selecciona cuántas URL y pega cada enlace con su motivo. Revisa antes de enviar.", construirPlan: planDifam },
    // ================= WhatsApp (formulario único) =================
    wa_copy:  { red: "WhatsApp", nombre: "Derechos de autor", cat: "autor", url: WA_URL, tipoTexto: "Copyright",  relName: "relationship_copyright",              esCopy: true,  manual: "Escribe el N.º de teléfono de la cuenta a denunciar (obligatorio). Revisa antes de enviar.", construirPlan: planWhatsApp },
    wa_marca: { red: "WhatsApp", nombre: "Marca comercial",  cat: "marca", url: WA_URL, tipoTexto: "Trademark",   relName: "relationship_trademark_counterfeit", esCopy: false, manual: "Escribe el N.º de teléfono de la cuenta a denunciar (obligatorio). Revisa antes de enviar.", construirPlan: planWhatsApp },
    wa_fals:  { red: "WhatsApp", nombre: "Falsificación",    cat: "fals",  url: WA_URL, tipoTexto: "Counterfeit", relName: "relationship_trademark_counterfeit", esCopy: false, manual: "Escribe el N.º de teléfono de la cuenta a denunciar (obligatorio). Revisa antes de enviar.", construirPlan: planWhatsApp },
    // ================= X (Twitter) =================
    // OJO: X usa nombres dinamicos (suf:true => coincidencia por sufijo). Los
    // formularios estan tras Cloudflare/SPA; PROBAR en el navegador real.
    x_acoso: {
      red: "X", nombre: "Acoso", cat: "x_acoso",
      url: "https://help.x.com/es/forms/safety-and-sensitive-content/violent-threats",
      manual: "Primero, en el menu de X, elige el problema y 'El contenido va dirigido a: Otra persona' para que aparezcan los campos; luego pulsa Rellenar. Completa la @cuenta/URL a denunciar y resuelve el captcha.",
      construirPlan: function (ctx) {
        var d = ctx.datos;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillName", name: "Form_Email__c", valor: d.correo },
          { tipo: "fillName", name: "DescriptionText", valor: ctx.justif },
          { tipo: "check", name: "Communicate_Reported_Content__c" }
        ] };
      }
    },
    x_privado: {
      red: "X", nombre: "Contenido privado", cat: "x_privado",
      url: "https://help.x.com/es/forms/safety-and-sensitive-content/violent-threats",
      manual: "Primero, en el menu de X, elige el problema y 'dirigido a: Otra persona' para que aparezcan los campos; luego pulsa Rellenar. Completa la @cuenta/URL y resuelve el captcha.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillName", name: "Form_Email__c", valor: d.correo },
          { tipo: "fillName", name: "DescriptionText", valor: ctx.justif },
          { tipo: "fillName", name: "signature", valor: marca },
          { tipo: "check", name: "Communicate_Reported_Content__c" },
          { tipo: "check", name: "i-am-authorized" },
          { tipo: "check", name: "information-is-accurate" },
          { tipo: "check", name: "Private_info_posted_what__c", texto: "cuenta bancaria o financiera" }
        ] };
      }
    },
    x_privado_rep: {
      red: "X", nombre: "Contenido privado (representante)", cat: "x_privado",
      url: "https://help.x.com/es/forms/safety-and-sensitive-content/private-information/auth-to-rep",
      manual: "Completa la @cuenta/URL a denunciar y resuelve el captcha.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillName", name: "Form_Email__c", valor: d.correo },
          { tipo: "fillName", name: "DescriptionText", valor: ctx.justif },
          { tipo: "fillName", name: "signature", valor: marca },
          { tipo: "check", name: "Communicate_Reported_Content__c" },
          { tipo: "check", name: "i-am-authorized" },
          { tipo: "check", name: "information-is-accurate" },
          { tipo: "check", name: "Private_info_posted_what__c", texto: "cuenta bancaria o financiera" }
        ] };
      }
    },
    x_suplantacion: {
      red: "X", nombre: "Suplantación", cat: "x_supl",
      url: "https://help.x.com/es/forms/authenticity/impersonation/me-or-someone-i-represent/i-am-being-impersonated",
      manual: "Completa la VERIFICACIÓN DE IDENTIDAD gubernamental (obligatoria), tu @usuario y el @ de la cuenta impostora. Resuelve el captcha.",
      construirPlan: function (ctx) {
        var d = ctx.datos;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillName", suf: true, name: "Form_Email__c", valor: d.correo },
          { tipo: "fillName", suf: true, name: "userDesc", valor: ctx.justif },
          { tipo: "check", name: "govIdv_consent" }
        ] };
      }
    },
    x_falsif: {
      red: "X", nombre: "Falsificación de marca", cat: "x_falsif",
      url: "https://help.x.com/es/forms/ipi/counterfeit/trademark-holder",
      manual: "Completa la @cuenta/URL a denunciar y, si los tienes, el número y la clase de registro de la marca. Resuelve el captcha.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "radio", name: "Type_of_Issue__c", texto: "falsificacion", esperaMs: 1200 },
          { tipo: "radio", suf: true, name: "Where_Displayed__c", texto: "una cuenta de x", esperaMs: 600 },
          { tipo: "fillName", suf: true, name: "Form_Name__c", valor: marca },
          { tipo: "fillName", suf: true, name: "Form_Email__c", valor: d.correo },
          { tipo: "fillName", suf: true, name: "DescriptionText", valor: ctx.justif },
          { tipo: "fillName", suf: true, name: "Content_Owner_Name__c", valor: marca },
          { tipo: "fillName", suf: true, name: "trademark-holder-address", valor: d.pais },
          // Web del titular: perfil OFICIAL de la marca en X con fallback a d.sitio.
          { tipo: "fillName", suf: true, name: "trademark-holder-website", valor: d.x || d.sitio || "" },
          { tipo: "fillName", suf: true, name: "trademark-word", valor: marca },
          { tipo: "select", suf: true, name: "trademark-holder-country", texto: d.pais },
          { tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (d.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true },
          { tipo: "check", name: "confirm-1" },
          { tipo: "check", name: "confirm-2" },
          { tipo: "check", name: "confirm-3" },
          { tipo: "check", name: "confirm-4" }
        ] };
      }
    },
    // ================= TikTok (progresivo: menús + campos por etiqueta) =================
    // Se rellena en partes: al pulsar Rellenar se llena lo que esté visible; avanzas
    // el formulario y vuelves a pulsar Rellenar para lo que se vaya revelando.
    tk_copy: {
      red: "TikTok", nombre: "Derechos de autor", cat: "autor",
      url: "https://www.tiktok.com/legal/report/Copyright",
      manual: "Con UN solo clic en Rellenar basta: no vuelvas a pulsarlo. La extensión marca 'Tipo de obra'='Logotipo' y 'Origen de la obra'='Fuera de TikTok', pone el PERFIL OFICIAL de la marca en 'URL al material original con copyright' y rellena la 'Descripción de la obra' sola en cuanto aparece. Si la marca no tiene perfil de TikTok configurado en 'Marcas', se usa su sitio web oficial. Si TikTok te pide verificar tu correo, hazlo con calma: la extensión sigue marcando y rellenando sola los campos que aparezcan después (Tipo de obra, Origen, las dos URLs, Descripción y casillas) durante varios minutos, sin volver a pulsar Rellenar. Deja ESTA pestaña abierta mientras verificas el correo. Si tu caso es otro tipo de obra (video, foto…), cámbialo tú con un clic. Revisa la URL antes de Enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        // Perfil OFICIAL de la marca en TikTok (respaldo: su sitio web oficial). Es lo que se
        // pone como "URL al material original con copyright".
        var perfilTikTok = (d.tiktok || d.sitio || "").trim();
        return { url: this.url, manual: this.manual, autorepetir: true, pasos: [
          // Palabras clave en ESPAÑOL (el form siempre sale en español) + respaldo por posición.
          { tipo: "dropdown", opcion: "autor&contenido|copyright&contenido|derechos de autor|infraccion de copyright", opcionIndice: 0, esperaMs: 2500 },
          // "¿Puedes verificar a quién afecta esta infracción?" -> "TENGO AUTORIZACIÓN del
          // propietario del copyright para actuar en su nombre" (es lo que somos: agente
          // autorizado de la marca, no el titular). Las alternativas van EN ORDEN: antes
          // ganaba "propietari&autor", que casaba de rebote porque "autorización" contiene
          // "autor"; ahora la opción correcta se elige a propósito y no por casualidad.
          { tipo: "dropdown", opcion: "autorizacion&nombre|tengo autorizacion|autorizacion del propietario|actuar en su nombre|represento|agente|propietari&autor|propietari&copyright", opcionIndice: 0, esperaMs: 2000 },
          { tipo: "fillLabel", label: "enter your email|verify your email|email address|verifica tu correo|correo electronico|introduce tu correo", valor: d.correo },
          { tipo: "fillLabel", label: "tu nombre completo|nombre completo|full name", valor: marca },
          { tipo: "fillLabel", label: "nombre del titular de los derechos de autor|titular de los derechos de autor|name of the copyright owner|copyright owner", valor: marca },
          // El teléfono va ANTES que la dirección: así ese campo nunca queda vacío y el paso de
          // dirección (valor=país) no se "derrama" sobre el campo del teléfono al repetirse.
          { tipo: "fillLabel", label: "tu numero de telefono|numero de telefono|phone number|telephone number|tu telefono", valor: d.telefono },
          { tipo: "fillLabel", label: "tu direccion fisica|direccion fisica|physical address", valor: d.pais },
          { tipo: "fillLabel", label: "tu direccion de correo electronico|direccion de correo|your email address|email address", valor: d.correo },
          // La extensión MARCA por texto visible (TikTok ya no usa 'name'): "Tipo de obra"
          // = Logotipo (al marcarlo aparece la Descripción) y "Origen de la obra con copyright"
          // = "FUERA DE TIKTOK" (la obra —el logotipo y la identidad de la marca— es anterior
          // y ajena a TikTok). Al marcar ese Origen, TikTok revela UNA caja de URL opcional:
          // "Si está disponible, proporciona la URL al material original con copyright", que se
          // rellena con el PERFIL OFICIAL de la marca (su TikTok; si no lo tiene, su sitio).
          { tipo: "clickOpcion", texto: "logotipo|logo", esperaMs: 600, vigilar: true },
          { tipo: "clickOpcion", texto: "fuera de tiktok|no esta en tiktok|outside of tiktok|off tiktok|outside tiktok", esperaMs: 600, vigilar: true },
          // URL del material original. Debe ir ANTES de fillUrlsUnaCaja: al quedar NO vacía,
          // fillUrlsUnaCaja la salta (comprueba e.value) y no le mete por error las URLs a
          // denunciar, aunque compartan el placeholder "e.g.https://www.tiktok.com/@...".
          { tipo: "fillLabel", label: "url al material original con copyright|proporciona la url al material original|material original con copyright|url to the original copyrighted material|original copyrighted material",
            valor: perfilTikTok, reintentos: 8, opcional: true, tardio: true, vigilar: true },
          // Campo TARDÍO: "Descripción de la obra con copyright" aparece SOLO al marcar el
          // 'Tipo de obra'. Lo llena el VIGILANTE (ver popup.js) en cuanto surge. Se busca
          // también por su texto de ayuda ("Incluye una descripción clara y completa…"), que
          // está pegado a la caja, para no depender de una sola redacción. La justificación ya
          // trae la política infringida y el perfil oficial (skill citar-politica-violada).
          { tipo: "fillLabel", label: "descripcion de la obra con copyright|incluye una descripcion clara y completa|descripcion clara y completa de tu obra|describe la obra con copyright|descripcion de la obra|descripcion de tu obra|description of the copyrighted work|describe your copyrighted work|clear and complete description",
            valor: ctx.justif, reintentos: 8, opcional: true, tardio: true, vigilar: true },
          { tipo: "fillLabel", label: "firma de forma electronica|firma|signature|electronic signature", valor: marca },
          // Las 3 casillas de "Declaración" (TikTok exige LAS TRES para poder enviar).
          { tipo: "checkVarios", etiquetas: "buena fe|good faith|correcta|exacta|accurate|perjurio|penalty of perjury|reconozco|acknowledge|acepto que toda la informacion|se reenvie|reenvie a la persona|se comparta con la persona|i acknowledge|i agree", max: 3, reintentos: 4 },
          // Casilla de REINCIDENCIA: "Evita que en el futuro aparezcan copias de estos
          // vídeos en TikTok". Va como paso PROPIO porque interesa marcarla (impide que
          // vuelvan a subir el mismo contenido) y porque antes se marcaba por accidente,
          // gastando uno de los 3 cupos de la Declaración y dejando la 3.ª sin marcar.
          { tipo: "checkLabel", texto: "evita que en el futuro|copias de estos videos|futuras copias|prevent future copies|future copies", opcional: true, tardio: true },
          { tipo: "clickBoton", texto: "siguiente|next|continuar|continue", esperaMs: 1500, opcional: true },
          // URLs A DENUNCIAR. 'excluir' protege la caja del material original (comparte el
          // placeholder de ejemplo "e.g.https://www.tiktok.com/@…"): sin eso, si esa caja
          // quedaba vacía se llevaba estas URLs, que son justo lo contrario.
          { tipo: "fillUrlsUnaCaja", urls: (ctx.urls || []), label: "introduce la url del contenido que quieres denunciar|introduce la url del contenido|url del contenido que quieres denunciar|url of the content you want to report|enter the url of the content", placeholder: "tiktok.com/@|e.g.https|e.g. https", excluir: "material original con copyright|original copyrighted material" }
        ] };
      }
    },
    tk_marca: {
      red: "TikTok", nombre: "Marca comercial", cat: "marca",
      url: "https://www.tiktok.com/legal/report/Trademark",
      manual: "Con UN solo clic en Rellenar basta, no vuelvas a pulsarlo. MARCA TÚ las opciones que dependan del contenido (tipo/origen de la marca); si al marcarlas aparece un campo de 'Descripción', la extensión lo RELLENA SOLO. Si TikTok te pide verificar tu correo, hazlo con calma: la extensión sigue marcando y rellenando sola los campos que aparezcan después durante varios minutos, sin volver a pulsar Rellenar (deja abierta la pestaña). Revisa la URL antes de Enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, autorepetir: true, pasos: [
          // 0) "¿Qué problema tienes?" SIGUE siendo un MENÚ desplegable (Select): hay que
          // elegirlo PRIMERO para que aparezcan las preguntas de radio de abajo. NO quitar este
          // paso: sin él el formulario no avanza ("de aquí no pasa"). Casa por palabras clave
          // (marca + contenido/infracción) con respaldo por posición (opcionIndice:0).
          { tipo: "dropdown", opcion: "marca&contenido|marca&infracc|marca&incumplimiento", opcionIndice: 0, esperaMs: 2500 },
          // Tras elegir el desplegable, TikTok muestra estas preguntas como BOTONES DE OPCIÓN
          // (radios), NO desplegables. Se marcan con 'radioPregunta' (ver motor.js), anclando
          // cada radio a SU pregunta: varias preguntas repiten "Sí/No", así que sin anclar se
          // marcaría el grupo equivocado. Respuestas confirmadas con el usuario (2026-07-24).
          // 1) "¿Se trata de un problema relacionado con productos falsificados?" -> Sí
          { tipo: "radioPregunta", pregunta: "productos falsificados|falsificados|tipo de problema", opcion: "si", esperaMs: 1500 },
          // 2) "Tu relación con el propietario de la marca comercial" -> representante/agente/administrador
          { tipo: "radioPregunta", pregunta: "relacion con el propietario|tu relacion con el propietario|derechos de marca comercial", opcion: "representante&agente&administrador|representante, agente o administrador", esperaMs: 1500 },
          // 3) "¿El contenido denunciado era de tu cuenta personal de TikTok?" -> No
          { tipo: "radioPregunta", pregunta: "cuenta personal de tiktok|contenido denunciado era de tu cuenta|cuenta personal", opcion: "no", esperaMs: 1500 },
          { tipo: "fillLabel", label: "enter your email|verify your email|email address|verifica tu correo|correo electronico|introduce tu correo", valor: d.correo },
          { tipo: "fillLabel", label: "full name|nombre completo|tu nombre completo", valor: marca },
          { tipo: "fillLabel", label: "trademark owner|owner of the trademark|propietario de marca|propietario de la marca|nombre del titular de la marca", valor: marca },
          // El teléfono va ANTES que la dirección (mismo motivo que en tk_copy): evita que el
          // país se derrame sobre el campo del teléfono al repetirse el autorrelleno.
          { tipo: "fillLabel", label: "tu numero de telefono|numero de telefono|phone number|telephone number|tu telefono", valor: d.telefono },
          { tipo: "fillLabel", label: "physical address|direccion fisica|tu direccion fisica", valor: d.pais },
          { tipo: "fillLabel", label: "your email address|email address|direccion de correo|correo electronico", valor: d.correo },
          { tipo: "fillLabel", label: "jurisdiction|jurisdiccion|jurisdiccion del registro", valor: d.pais },
          { tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (d.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true },
          { tipo: "fillLabel", label: "describe|description|how you believe|descripcion de la marca|descripcion|como crees", valor: ctx.justif, opcional: true, tardio: true },
          { tipo: "fillLabel", label: "electronic signature|sign electronically|firma electronica|firma de forma electronica|firma", valor: marca },
          { tipo: "checkVarios", etiquetas: "buena fe|good faith|correcta|exacta|accurate|perjurio|penalty of perjury|reconozco|acknowledge|acepto que toda la informacion|se reenvie|reenvie a la persona|se comparta con la persona|i acknowledge|i agree", max: 3 },
          { tipo: "clickBoton", texto: "siguiente|next|continuar|continue", esperaMs: 1500, opcional: true },
          { tipo: "fillUrlsUnaCaja", urls: (ctx.urls || []), label: "introduce la url del contenido que quieres denunciar|introduce la url del contenido|url del contenido que quieres denunciar|url of the content you want to report|enter the url of the content", placeholder: "tiktok.com/@|e.g.https|e.g. https" }
        ] };
      }
    },
    tk_difam: {
      red: "TikTok", nombre: "Difamación", cat: "difam",
      url: "https://www.tiktok.com/legal/report/feedback",
      manual: "TikTok se llena por partes: pulsa Rellenar, avanza por los menús (Continuar) y vuelve a pulsar Rellenar. Completa la @cuenta y el enlace a denunciar.",
      construirPlan: function (ctx) {
        var d = ctx.datos;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "dropdown", opcion: "denuncia una posible infraccion|report a possible violation|report a potential", esperaMs: 1500 },
          { tipo: "dropdown", opcion: "incumplimiento de normas por el contenido|content violates|violacion de normas|community guidelines", esperaMs: 1500 },
          { tipo: "dropdown", opcion: "otros|other", esperaMs: 1800 },
          { tipo: "fillName", name: "email", valor: d.correo },
          { tipo: "fillName", name: "feedback", valor: ctx.justif },
          { tipo: "clickBoton", texto: "continuar|continue|siguiente|next", esperaMs: 1500 },
          { tipo: "fillUrlsUnaCaja", urls: (ctx.urls || []), label: "introduce la url del contenido que quieres denunciar|introduce la url del contenido|url del contenido que quieres denunciar|url of the content you want to report|enter the url of the content", placeholder: "tiktok.com/@|e.g.https|e.g. https" }
        ] };
      }
    },
    // ================= Telegram (NO tiene formulario web: es por CORREO) =================
    telegram_abuso: {
      red: "Telegram", nombre: "Reporte de abuso (por correo)", cat: "telegram", tipo: "email",
      destino: "abuse@telegram.org",
      manual: "Pega los enlaces (t.me/...) de los mensajes, canal o usuario a denunciar, revisa y envía el correo.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var pais = d.pais ? " (" + d.pais + ")" : "";
        var en = { to: dest,
          asunto: "Content removal request / abuse report — " + marca,
          cuerpo:
            "Dear Telegram team (abuse@telegram.org),\n\n" + ctx.justif +
            "\n\nAffected brand: " + marca + pais + "\n" +
            "Contact email: " + (d.correo || "") + "\n\n" +
            negrita("Content / channel / user to report:") + "\n" + urlsODefault(ctx, "[ Paste here the t.me/... link(s) ]") + "\n\n" +
            "We appreciate your prompt action.\n" + marca };
        var es = {
          asunto: "Solicitud de eliminación de contenido / Reporte de abuso — " + marca,
          cuerpo:
            "Estimado equipo de Telegram (abuse@telegram.org):\n\n" + (ctx.justif_es || ctx.justif) +
            "\n\nMarca afectada: " + marca + pais + "\n" +
            "Correo de contacto: " + (d.correo || "") + "\n\n" +
            negrita("Enlaces del contenido / canal / usuario a denunciar:") + "\n" + urlsODefault(ctx, "[ Pega aquí los enlaces t.me/... ]") + "\n\n" +
            "Agradecemos su pronta gestión.\n" + marca };
        return bilingue(en, es);
      }
    },
    // ================= Google Ads (publicidad maliciosa) =================
    // Formulario "Denunciar un anuncio o una ficha de shopping" de Google. Es corto y sus
    // campos SÍ tienen name estable: violating_policy (radios), email_field y clickstring.
    // El ancla #ts=6006595 abre directamente el paso "Infringe las políticas de Google".
    // Flujo pedido: 1.ª opción marcada + enlace del anuncio + captura del comprobante + Enviar
    // (el envío automático lo hace el service worker, con 5 s para cancelar).
    go_ads: {
      red: "Google", nombre: "Publicidad maliciosa", cat: "malic",
      url: "https://support.google.com/ads/troubleshooter/4578507?hl=es#ts=6006595",
      manual: "Se marca la 1.ª opción («Es engañoso o trata de estafar a los usuarios») y se pega el enlace del anuncio. Se captura el comprobante y se envía solo (5 s para cancelar).",
      enviarLabel: "enviar|submit",
      construirPlan: function (ctx) {
        var d = ctx.datos;
        // Enlace del anuncio: el del clic derecho si se usó el menú contextual; si no, el
        // primero de la lista cargada del Excel. Este formulario admite UN solo anuncio.
        var enlace = ((ctx.urls || [])[0] || "").toString().trim();
        return { url: this.url, manual: this.manual, enviarLabel: this.enviarLabel, pasos: [
          // 1.ª opción del grupo (sin texto => el primer radio): "Es engañoso o trata de
          // estafar a los usuarios (ofertas falsas, suplantación, phishing, clickbait…)".
          { tipo: "radio", name: "violating_policy", texto: "", esperaMs: 900 },
          { tipo: "fillName", name: "email_field", valor: d.correo },
          // "Enlace del anuncio o de la ficha (si se rellena automáticamente, no lo cambie)".
          { tipo: "fillName", name: "clickstring", valor: enlace },
          // "Comentarios": campo OBLIGATORIO que Google revela AL marcar la opción. Lleva la
          // justificación, que ya incluye la política de Google infringida y su enlace.
          // OJO: aquí NO se puede usar fillLabel; el rótulo de la caja anterior ("Enlace del
          // anuncio…") queda dentro del contexto de este campo y acabaría metiendo la URL.
          { tipo: "fillAny", names: ["comments_mandetory", "comments_mandatory", "comments"], valor: ctx.justif },
          // Re-marcar la 1.ª opción al final (el formulario la revierte al rellenar el resto).
          { tipo: "radio", name: "violating_policy", texto: "", opcional: true }
        ] };
      }
    },
    // ================= YouTube (formularios de soporte de Google, sin login) =================
    yt_marca: {
      red: "YouTube", nombre: "Marca registrada", cat: "marca",
      url: "https://support.google.com/youtube/contact/trademark_complaint?hl=es",
      // Formulario de Google (support.google.com): NO expone atributos `name` estables, así que
      // se rellena SIEMPRE por RÓTULO en español (fillLabel/selectLabel/radioPregunta/checkLabel),
      // igual que hacemos en formularios SPA. Textos tomados del formulario real (?hl=es).
      manual: "Completa lo que falte (URL del vídeo/canal infractor y N.º de registro si lo tienes) y verifica las 3 casillas de declaración y la firma. El formulario tiene captcha: resuélvelo y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          // --- Datos del reclamante (campos de texto por rótulo) ---
          { tipo: "fillLabel", label: "nombre y apellidos|nombre y apellido|nombre legal completo|nombre completo", valor: marca, reintentos: 6 },
          { tipo: "fillLabel", label: "direccion de correo de contacto|correo de contacto|direccion de correo|correo electronico", valor: d.correo, reintentos: 6 },
          { tipo: "fillLabel", label: "cargo|puesto", valor: "Representante autorizado", reintentos: 6 },
          { tipo: "fillLabel", label: "nombre de la empresa|razon social", valor: marca, reintentos: 6 },
          { tipo: "fillLabel", label: "titular de la marca|propietario de la marca", valor: marca, reintentos: 6 },
          { tipo: "fillLabel", label: "relacion con el titular de la marca|relacion con el titular|relacion con el propietario", valor: "Representante autorizado del titular de la marca", reintentos: 6 },
          // --- Datos de la marca (desplegables y radios por rótulo) ---
          { tipo: "selectLabel", label: "cuantas infracciones de marca|cuantas infracciones|numero de infracciones", opcion: "una", opcional: true },
          { tipo: "selectLabel", label: "selecciona el tipo de marca|tipo de marca", opcion: "denominativa y logotipo", opcional: true },
          // ¿Está registrada? -> "Sí" (son radios en el formulario real). Al marcarlo aparecen
          // jurisdicción/país/N.º de registro, que se llenan como campos "tardíos".
          { tipo: "radioPregunta", pregunta: "esta registrada|registrada", opcion: "si", opcional: true, esperaMs: 800 },
          { tipo: "selectLabel", label: "jurisdiccion", opcion: "otra", opcional: true, tardio: true },
          { tipo: "selectLabel", label: "pais en el que esta registrada|selecciona el pais|pais de registro", opcion: d.pais, opcional: true, tardio: true },
          { tipo: "fillLabel", label: "numero de registro", valor: (d.registro || ""), opcional: true, tardio: true },
          // --- Contenido infractor y descripción ---
          { tipo: "selectLabel", label: "tipo de contenido infractor|tipo de contenido", opcion: "video y canal", opcional: true },
          { tipo: "fillLabel", label: "describe especificamente la infraccion de marca|describe la infraccion|infraccion de marca que presuntamente|descripcion de la infraccion", valor: ctx.justif, reintentos: 6, tardio: true },
          // --- Declaraciones juradas (3 casillas por su texto en español) + firma ---
          { tipo: "checkLabel", texto: "creo de buena fe|de buena fe que el uso de las marcas", opcional: true, tardio: true },
          { tipo: "checkLabel", texto: "informacion contenida en esta notificacion es correcta|correcta y veraz|autorizacion para actuar en nombre", opcional: true, tardio: true },
          { tipo: "checkLabel", texto: "doy mi consentimiento para que se reenvie|se reenvie mi reclamacion|reenvie mi reclamacion al usuario", opcional: true, tardio: true },
          { tipo: "fillLabel", label: "firma", valor: marca, opcional: true, tardio: true }
        ] };
      }
    },
    yt_difam: {
      red: "YouTube", nombre: "Difamación", cat: "difam",
      url: "https://support.google.com/youtube/contact/defamation_complaint?hl=es",
      manual: "Completa: la URL del vídeo/canal/post, las afirmaciones difamatorias exactas y dónde aparecen. Resuelve el captcha y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "select", name: "country", texto: d.pais },
          { tipo: "fillName", name: "Fulllegalname", valor: marca },
          { tipo: "radio", name: "behalf", texto: "self" },
          { tipo: "fillName", name: "email", valor: d.correo },
          { tipo: "fillName", name: "country_law_one", valor: ctx.justif },
          { tipo: "check", name: "identify_complaint_one", texto: "business name|business_name|nombre de la empresa" }
        ] };
      }
    },
    // ============= Outlook / Hotmail (NO tiene form web: es por CORREO) =============
    outlook_phish: {
      red: "Outlook / Hotmail", nombre: "Phishing / suplantación (por correo)", cat: "outlook", tipo: "email",
      destino: "phish@office365.microsoft.com, abuse@hotmail.com, junk@office365.microsoft.com, report_spam@hotmail.com",
      manual: "Donde dice [ ... ] pega la(s) dirección(es) de correo @outlook/@hotmail a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var dominio = (d.sitio || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var dom = dominio ? " (" + dominio + ")" : "";
        var en = { to: dest,
          asunto: "Phishing and brand impersonation report - urgent request for removal",
          cuerpo:
            "Hello,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, representing " + marca + "." : "We are " + marca + ".") + "\n\n" +
            "We request that you delete or classify the reported email address(es) below as malicious (phishing / brand impersonation), for the following reasons:\n\n" +
            "- They are using our brand without consent and impersonating our name, " + marca + ".\n" +
            "- They are using the " + marca + " name and logo to request confidential information from our clients (phishing).\n" +
            "- This email address does NOT belong to " + marca + " and is impersonating it in order to defraud users.\n" +
            "- Official " + marca + " communications come only from its official domain" + dom + ".\n" +
            "- This email address has NO business or legal relationship with " + marca + ".\n\n" +
            "This is a clear case of phishing and brand impersonation that puts our clients at risk of fraud and theft of confidential data. We respectfully and URGENTLY request that you delete or block this account/content, which is confusing and endangering " + marca + "'s clients.\n\n" +
            "We appreciate your help in keeping the internet free of accounts that put users at risk.\n\n" +
            negrita("Reported email address(es):") + "\n" + urlsODefault(ctx, "[ Paste here the email address(es) you are reporting ]") + "\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Reporte de phishing y suplantación de marca - solicitud urgente de eliminación",
          cuerpo:
            "Hola,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
            "Solicitamos que eliminen o clasifiquen como maliciosa(s) la(s) dirección(es) de correo reportada(s) abajo (phishing / suplantación de marca), por los siguientes motivos:\n\n" +
            "- Están usando nuestra marca sin consentimiento y suplantando nuestro nombre, " + marca + ".\n" +
            "- Usan el nombre y el logotipo de " + marca + " para solicitar información confidencial a nuestros clientes (phishing).\n" +
            "- Esta dirección de correo NO pertenece a " + marca + " y la está suplantando para defraudar a los usuarios.\n" +
            "- Las comunicaciones oficiales de " + marca + " provienen únicamente de su dominio oficial" + dom + ".\n" +
            "- Esta dirección de correo NO tiene ninguna relación comercial ni legal con " + marca + ".\n\n" +
            "Este es un caso claro de phishing y suplantación de marca que pone a los clientes en riesgo de fraude y robo de datos confidenciales. Solicitamos respetuosa y URGENTEMENTE que eliminen o bloqueen esta cuenta/contenido, que confunde y pone en peligro a los clientes de " + marca + ".\n\n" +
            "Agradecemos su ayuda para mantener internet libre de cuentas que ponen en riesgo a los usuarios.\n\n" +
            negrita("Dirección(es) de correo a denunciar:") + "\n" + urlsODefault(ctx, "[ Pega aquí la(s) dirección(es) de correo a denunciar ]") + "\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ============= Scribd (NO tiene form web: es por CORREO) =============
    scribd_reporte: {
      red: "Scribd", nombre: "Información confidencial / copyright (por correo)", cat: "scribd", tipo: "email",
      destino: "copyright@scribd.com, support@scribd.com, legal@scribd.com, privacy@scribd.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de Scribd a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var en = { to: dest,
          asunto: "Unauthorized use of confidential information - urgent removal request",
          cuerpo:
            "Hello,\n\n" +
            (repres
              ? "We are Security Maximum in Computer Networks, writing on behalf of " + marca + " regarding an important matter related to the unauthorized use of its information."
              : "We are " + marca + ", writing regarding an important matter related to the unauthorized use of our information.") + "\n\n" +
            "We have detected that confidential information belonging to " + marca + " is being shared on your platform without authorization.\n\n" +
            "- This is a violation of intellectual property rights and a serious breach of the privacy and security of " + marca + "'s customers. As an organization, " + marca + " considers the confidentiality of its customers' data a top priority, and any unauthorized use of this information is unacceptable.\n\n" +
            "We strongly and URGENTLY request that you immediately remove the document(s)/link(s) below and any other content that includes " + marca + "'s information without authorization, including any content disseminated through your platform.\n\n" +
            "We trust that you will take the necessary steps to address this situation and prevent any future violations. We would like to resolve this matter quickly and efficiently.\n\n" +
            negrita("Reported document(s)/link(s):") + "\n" + urlsODefault(ctx, "[ Paste here the Scribd link(s) you are reporting, e.g. https://www.scribd.com/document/... ]") + "\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Uso no autorizado de información confidencial - solicitud urgente de eliminación",
          cuerpo:
            "Hola,\n\n" +
            (repres
              ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + ", en relación con un asunto importante sobre el uso no autorizado de su información."
              : "Somos " + marca + ", en relación con un asunto importante sobre el uso no autorizado de nuestra información.") + "\n\n" +
            "Hemos detectado que información confidencial perteneciente a " + marca + " se está compartiendo en su plataforma sin autorización.\n\n" +
            "- Esto constituye una violación de los derechos de propiedad intelectual y una grave vulneración de la privacidad y la seguridad de los clientes de " + marca + ". Como organización, " + marca + " considera la confidencialidad de los datos de sus clientes una prioridad absoluta, y cualquier uso no autorizado de esta información es inaceptable.\n\n" +
            "Solicitamos firme y URGENTEMENTE que eliminen de inmediato el/los documento(s)/enlace(s) indicados abajo y cualquier otro contenido que incluya información de " + marca + " sin autorización, incluido cualquier contenido difundido a través de su plataforma.\n\n" +
            "Confiamos en que tomarán las medidas necesarias para resolver esta situación y prevenir futuras infracciones. Deseamos resolver este asunto de forma rápida y eficaz.\n\n" +
            negrita("Documento(s) / enlace(s) a denunciar:") + "\n" + urlsODefault(ctx, "[ Pega aquí el/los enlace(s) de Scribd, ej. https://www.scribd.com/document/... ]") + "\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== Sitios maliciosos Banguat (phishing que usa la imagen de funcionarios) — por CORREO =====
    banguat_mal_alvaro: {
      red: "Sitios maliciosos Banguat", nombre: "Sitio malicioso — Álvaro González Ricci", cat: "banguat_mal", tipo: "email",
      destino: "",
      manual: "En 'Para' pega el correo de abuse del proveedor/hosting del sitio malicioso. Donde dice [ ... ] pega la(s) URL(s) del sitio, revisa y envía.",
      construirEmail: function (ctx) { return correoBanguatMalicioso(ctx, "Alvaro Gonzalez Ricci (President of Banco de Guatemala)", "Álvaro González Ricci (Presidente del Banco de Guatemala)"); }
    },
    banguat_mal_jonathan: {
      red: "Sitios maliciosos Banguat", nombre: "Sitio malicioso — Jonathan Menkos", cat: "banguat_mal", tipo: "email",
      destino: "",
      manual: "En 'Para' pega el correo de abuse del proveedor/hosting del sitio malicioso. Donde dice [ ... ] pega la(s) URL(s) del sitio, revisa y envía.",
      construirEmail: function (ctx) { return correoBanguatMalicioso(ctx, "Jonathan Menkos", "Jonathan Menkos"); }
    },
    // ===== "Por correo" dentro del cintillo de cada red (propiedad intelectual) =====
    fb_correo: {
      red: "Facebook", nombre: "Por correo (propiedad intelectual)", cat: "ip", tipo: "email",
      destino: "ip@fb.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de Facebook a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailIP(ctx, "Facebook", this.destino, "en"), emailIP(ctx, "Facebook", this.destino, "es")); }
    },
    ig_correo: {
      red: "Instagram", nombre: "Por correo (propiedad intelectual)", cat: "ip", tipo: "email",
      destino: "ip@instagram.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de Instagram a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailIP(ctx, "Instagram", this.destino, "en"), emailIP(ctx, "Instagram", this.destino, "es")); }
    },
    wa_correo: {
      red: "WhatsApp", nombre: "Por correo (propiedad intelectual)", cat: "ip", tipo: "email",
      destino: "ip@whatsapp.com",
      manual: "Donde dice [ ... ] pega el/los datos o enlace(s) a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailIP(ctx, "WhatsApp", this.destino, "en"), emailIP(ctx, "WhatsApp", this.destino, "es")); }
    },
    tk_correo: {
      red: "TikTok", nombre: "Por correo (propiedad intelectual)", cat: "ip", tipo: "email",
      destino: "copyright@tiktok.com, ip-reports@tiktok.com, ip_reports@tiktok.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de TikTok a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailIP(ctx, "TikTok", this.destino, "en"), emailIP(ctx, "TikTok", this.destino, "es")); }
    },
    // ===== "Por correo (difamación)" dentro del cintillo de cada red =====
    // Las plataformas NO publican un buzón de difamación (suelen exigir formulario),
    // por eso el 'destino' va vacío: se escribe el correo correcto al enviar.
    fb_correo_difam: {
      red: "Facebook", nombre: "Por correo (difamación)", cat: "difam", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo legal/de contacto correcto (Facebook no tiene un buzón público de difamación). Donde dice [ ... ] pega el/los enlace(s) de Facebook a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailDifamacion(ctx, "Facebook", this.destino, "en"), emailDifamacion(ctx, "Facebook", this.destino, "es")); }
    },
    ig_correo_difam: {
      red: "Instagram", nombre: "Por correo (difamación)", cat: "difam", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo legal/de contacto correcto (Instagram no tiene un buzón público de difamación). Donde dice [ ... ] pega el/los enlace(s) de Instagram a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailDifamacion(ctx, "Instagram", this.destino, "en"), emailDifamacion(ctx, "Instagram", this.destino, "es")); }
    },
    wa_correo_difam: {
      red: "WhatsApp", nombre: "Por correo (difamación)", cat: "difam", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo legal/de contacto correcto (WhatsApp no tiene un buzón público de difamación). Donde dice [ ... ] pega el/los datos o enlace(s) a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailDifamacion(ctx, "WhatsApp", this.destino, "en"), emailDifamacion(ctx, "WhatsApp", this.destino, "es")); }
    },
    tk_correo_difam: {
      red: "TikTok", nombre: "Por correo (difamación)", cat: "difam", tipo: "email",
      // El 'destino' lo pone solo el bloque de DESTINOS FIJOS del final de este
      // archivo: TODO correo a TikTok va a sus tres buzones de propiedad intelectual.
      destino: "",
      manual: "El 'Para' ya viene con los tres buzones de TikTok (copyright@ / ip-reports@ / ip_reports@). Donde dice [ ... ] pega el/los enlace(s) de TikTok a denunciar, revisa y envía.",
      construirEmail: function (ctx) { return bilingue(emailDifamacion(ctx, "TikTok", this.destino, "en"), emailDifamacion(ctx, "TikTok", this.destino, "es")); }
    },
    // ============= Studocu (NO tiene form web: es por CORREO, en español) =============
    studocu_reporte: {
      red: "Studocu", nombre: "Eliminación de información (por correo)", cat: "studocu", tipo: "email",
      destino: "privacy@studocu.com, support@studocu.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de Studocu a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var en = { to: dest,
          asunto: "Request to remove " + marca + "'s information",
          cuerpo:
            "Hello,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
            "We kindly and respectfully request the removal of " + marca + "'s information that appears in the following document(s) on your platform. " + marca + " does not authorize the use of its name or information in this content, and its dissemination infringes its trademark rights and the privacy of its customers.\n\n" +
            negrita("Document(s) / link(s) to report:") + "\n" + urlsODefault(ctx, "[ Paste here the Studocu link(s) you are reporting, e.g. https://www.studocu.com/... ]") + "\n\n" +
            "We look forward to your response.\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Solicitud de eliminación de información de " + marca,
          cuerpo:
            "Hola,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, representantes de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
            "Solicitamos muy amable y respetuosamente que se elimine la información de " + marca + " que aparece en el/los siguiente(s) documento(s) de su plataforma. " + marca + " no autoriza el uso de su nombre ni de su información en dicho contenido, y su difusión vulnera los derechos de marca y la privacidad de sus clientes.\n\n" +
            negrita("Documento(s) / enlace(s) a denunciar:") + "\n" + urlsODefault(ctx, "[ Pega aquí el/los enlace(s) de Studocu, ej. https://www.studocu.com/... ]") + "\n\n" +
            "Quedamos atentos a sus comentarios.\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== Apps maliciosas (red propia, NO tiene form web: es por CORREO) =====
    // Denuncia ante el SITIO que aloja una app falsa que esa app NO es oficial,
    // citando la app OFICIAL de la marca en Google Play y Apple App Store.
    apps_maliciosas: {
      red: "Apps maliciosas", nombre: "App no oficial / falsa (por correo)", cat: "apps_maliciosas", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo de abuso/contacto del SITIO que aloja la app falsa. Donde dice [ ... ] pega el/los enlace(s) del sitio o de la app no autorizada a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pais = d.pais ? " (" + d.pais + ")" : "";
        var valPlay = (d.play || "").trim();
        var valApp = (d.appstore || "").trim();
        var playEn = valPlay || "[ Paste here the official Google Play Store link ]";
        var appEn = valApp || "[ Paste here the official Apple App Store link ]";
        var playEs = valPlay || "[ Pega aquí el enlace oficial de Google Play Store ]";
        var appEs = valApp || "[ Pega aquí el enlace oficial de Apple App Store ]";
        var en = { to: dest,
          asunto: "Unauthorized / fake mobile app impersonating " + marca + " - urgent removal request",
          cuerpo:
            "Hi,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
            marca + " informs you that the application(s) published on this website are NOT authorized or approved by the brand.\n\n" +
            "The only official applications are available exclusively on the official stores:\n" +
            "- Google Play Store: " + playEn + "\n" +
            "- Apple App Store: " + appEn + "\n\n" +
            marca + " requests the immediate removal of the application(s) published on unauthorized sites, as they pose security risks, intellectual property violations, and undermine user confidence.\n\n" +
            "Please remove all information related to " + marca + pais + ".\n\n" +
            negrita("Reported link(s) (unauthorized site / app):") + "\n" + urlsODefault(ctx, "[ Paste here the link(s) you are reporting ]") + "\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "App móvil no autorizada / falsa que suplanta a " + marca + " - solicitud urgente de eliminación",
          cuerpo:
            "Hola,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
            marca + " informa que la(s) aplicación(es) publicada(s) en este sitio web NO están autorizadas ni aprobadas por la marca.\n\n" +
            "Las únicas aplicaciones oficiales están disponibles exclusivamente en las tiendas oficiales:\n" +
            "- Google Play Store: " + playEs + "\n" +
            "- Apple App Store: " + appEs + "\n\n" +
            marca + " solicita la eliminación inmediata de la(s) aplicación(es) publicada(s) en sitios no autorizados, ya que suponen riesgos de seguridad, infracciones de propiedad intelectual y minan la confianza de los usuarios.\n\n" +
            "Por favor, eliminen toda la información relacionada con " + marca + pais + ".\n\n" +
            negrita("Enlace(s) a denunciar (sitio / app no autorizada):") + "\n" + urlsODefault(ctx, "[ Pega aquí el/los enlace(s) a denunciar ]") + "\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ======================================================================
    //  CLOUDFLARE — formulario WEB de denuncia por derechos de autor (DMCA)
    //  https://abuse.cloudflare.com/dmca
    //
    //  OJO (2026-08-13): Cloudflare protege esta pagina contra el trafico
    //  automatizado, asi que NO se pudo volcar su DOM ni con descarga directa
    //  (403) ni con navegador controlado (bloquea Playwright). Por eso el plan
    //  va TODO por ROTULO visible (fillLabel/selectLabel/checkLabel), en ingles
    //  —la pagina no se traduce— y con varias redacciones por campo separadas
    //  por "|": asi cada paso encuentra su caja aunque la redaccion cambie, en
    //  vez de depender de `name` inventados. Los campos que no aparezcan se
    //  quedan en FALTAN y salen listados en el informe del popup.
    //  PENDIENTE: pasar una vez en vivo y pulsar "📋 Copiar informe" para
    //  cerrar los rotulos exactos y meter la copia fiel en pruebas/.
    // ======================================================================
    cf_dmca: {
      red: "Cloudflare", nombre: "Derechos de autor (DMCA)", cat: "cf_dmca",
      url: "https://abuse.cloudflare.com/dmca",
      manual: "Marca TÚ la casilla «Verifique que es un ser humano» (es de Cloudflare y va en su " +
              "propio marco: la extensión no puede tocarla). Revisa los enlaces denunciados y pulsa Submit.",
      construirPlan: function (ctx) {
        var marca = ctx.marca, d = ctx.datos;
        // OJO: el nombre y la FIRMA son de la PERSONA que denuncia, no de la marca.
        // Antes salía "Aki" en los dos y la denuncia quedaba firmada por quien no es.
        var persona = personaDeCorreo(d.correo);
        var firmante = persona.completo;            // vacío si el correo no dice quién es
        var pais = (d.pais || "").trim();
        var ua = navegadorYSistema();
        return { url: this.url, manual: this.manual, pasos: [
          // ---- Quién denuncia (rótulos EXACTOS del formulario) ----
          { tipo: "fillLabel", label: "your full name", valor: firmante, reintentos: 4 },
          // El titular de los derechos SÍ es la marca.
          { tipo: "fillLabel", label: "copyright holder's full name|copyright holders full name|copyright holder", valor: marca },
          { tipo: "fillLabel", label: "your email address", valor: d.correo || "" },
          // Cloudflare pide el correo DOS veces y no deja enviar si no coinciden.
          { tipo: "fillLabel", label: "confirm email address|confirm email", valor: d.correo || "" },
          { tipo: "fillLabel", label: "title", valor: "Phishing - " + marca, opcional: true },
          { tipo: "fillLabel", label: "company name", valor: marca, opcional: true },
          { tipo: "fillLabel", label: "telephone|phone", valor: d.telefono || "", opcional: true },
          // Dirección: la marca no guarda calle ni ciudad, así que en los tres campos va
          // su PAÍS (es lo que el usuario pidió y es información cierta, no inventada).
          // excluir "email": "address" casa tambien con "Your email address" y
          // "Confirm email address", que ya estan llenas, y la direccion se quedaba vacia.
          { tipo: "fillLabel", label: "address", excluir: "email", valor: pais },
          { tipo: "fillLabel", label: "city", valor: pais },
          { tipo: "fillLabel", label: "state / province|state/province|state / province|state|province", valor: pais },
          // Los dos desplegables de país. El de "Country" va PRIMERO en la página, así que
          // se busca por "country" a secas; el otro por su rótulo completo.
          { tipo: "selectLabel", label: "country", opcion: pais, opcional: true },
          { tipo: "selectLabel", label: "reporter current country", opcion: pais, opcional: true },
          // ---- Qué se denuncia ----
          // Una URL por línea, como pide el propio campo.
          // fillUrlsUnaCaja lee las URL de p.urls: hay que pasarselas.
          { tipo: "fillUrlsUnaCaja", label: "infringing urls|infringing url",
            urls: (ctx.urls || []), separador: "\n" },
          { tipo: "fillLabel", label: "describe the original work|original work", valor: ctx.justif },
          { tipo: "fillLabel", label: "user agent", valor: ua, opcional: true },
          // ---- Declaración y firma ----
          // Casilla única de "512(f) acknowledgment, Good faith belief, Authority to act".
          // Sin ella Cloudflare NO deja enviar.
          { tipo: "checkLabel", texto: "i understand and agree|understand and agree", reintentos: 4 },
          { tipo: "fillLabel", label: "digital signature", valor: firmante, reintentos: 4 }
          // "Please forward my report..." ya vienen marcadas de fábrica: no se tocan.
          // La casilla "Verifique que es un ser humano" es el widget de Cloudflare y vive
          // en un marco suyo (challenges.cloudflare.com): ni el content script ni el motor
          // pueden entrar ahí. La marca el usuario, y es lo único que le queda por hacer.
        ] };
      }
    },
    // ======================================================================
    //  CLOUDFLARE — denuncia por CORREO (abuse@cloudflare.com)
    //  Cloudflare no aloja el contenido: es el proveedor de CDN/DNS que está
    //  delante del sitio fraudulento. Se le denuncia para que traslade el aviso
    //  al hosting real y al titular del dominio (así lo describe su Abuse
    //  Approach). El texto sale del correo que el usuario ya venía enviando a
    //  mano; aquí se rellena solo con los datos de la marca elegida.
    // ======================================================================
    cf_correo: {
      red: "Cloudflare", nombre: "Sitio fraudulento / phishing (por correo)", cat: "cf_phishing", tipo: "email",
      destino: "abuse@cloudflare.com",
      manual: "Adjunta la CAPTURA del anuncio o del sitio (el correo la menciona). Donde diga [ ... ] pega el/los enlace(s) a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var sitio = webOficialDe(marca, d);   // web corporativa, no su Facebook
        var avisos = avisosOficialesDe(marca, d);
        var pols = (window.POLITICAS_GENERALES && window.POLITICAS_GENERALES["Cloudflare"]) || [];

        // Punto 5: el dominio y la web oficial de la marca. Si la marca no tiene
        // `sitio` en ⚙ Marcas se deja el hueco marcado en vez de inventarlo.
        var sitioEn = sitio || "[ Paste here the official website of " + marca + " ]";
        var sitioEs = sitio || "[ Pega aquí el sitio web oficial de " + marca + " ]";
        // Puntos 6 y 8: avisos oficiales que la marca ya publicó. Si no hay
        // ninguno guardado, se marca el hueco: son la prueba más fuerte del correo.
        var avisoEn = avisos.length ? avisos[0] : "[ Paste here the official warning published by " + marca + " ]";
        var avisoEs = avisos.length ? avisos[0] : "[ Pega aquí el aviso oficial publicado por " + marca + " ]";
        var listaEn = avisos.length ? avisos.join("\n") : "[ Paste here the links to the official warnings published by " + marca + " ]";
        var listaEs = avisos.length ? avisos.join("\n") : "[ Pega aquí los enlaces a los avisos oficiales publicados por " + marca + " ]";

        var polEn = pols.length ? "\n\nThis content violates Cloudflare's own policies, including:\n" +
          pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n") : "";
        var polEs = pols.length ? "\n\nEste contenido infringe las propias políticas de Cloudflare, incluyendo:\n" +
          pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n") : "";

        var en = { to: dest,
          asunto: "Fraudulent / phishing websites impersonating " + marca + " - urgent removal request",
          cuerpo:
            "Hello\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, representing " + marca : "We are " + marca) + "\n\n" +
            "Our complaint email is: " + (d.correo || "[ Paste here your contact email ]") + "\n\n" +
            "We request the removal of the following websites for the following reasons:\n\n" +
            urlsODefault(ctx, "[ Paste here the link(s) you are reporting ]") + "\n\n" +
            "They are running a malicious campaign against " + marca + ".\n\n" +
            "These phishing websites are found in malicious Facebook ads. We're sharing a screenshot.\n\n" +
            "1. They are using the " + marca + " brand to sell services from our company, with which they have no relationship.\n\n" +
            "2. They are defaming " + marca + " by offering to buy shares and invest in " + marca + ".\n\n" +
            "3. They are conducting a malicious campaign against " + marca + ", deceiving users into buying shares.\n\n" +
            "4. The sole purpose of creating the domain was to commit fraud.\n\n" +
            "5. The domain and our official website are: " + sitioEn + "\n\n" +
            "6. " + marca + " has reported the publication of investment offers in alleged shares: " + avisoEn + "\n\n" +
            "7. " + marca + " has not paid for advertising on Facebook to invest in alleged shares.\n\n" +
            "8. " + marca + " has provided the following information to warn users about this type of malicious publications:\n" +
            listaEn + "\n\n" +
            lineaPerfilOficial(d, "Cloudflare", marca, "en") +
            "Thank you very much for your work and helping us keep the Internet clean of false profiles to create scams" +
            polEn + "\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };

        var es = {
          asunto: "Sitios fraudulentos / phishing que suplantan a " + marca + " - solicitud urgente de eliminación",
          cuerpo:
            "Hola\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca : "Somos " + marca) + "\n\n" +
            "Nuestro correo de denuncia es: " + (d.correo || "[ Pega aquí tu correo de contacto ]") + "\n\n" +
            "Solicitamos la eliminación de los siguientes sitios web por las siguientes razones:\n\n" +
            urlsODefault(ctx, "[ Pega aquí el/los enlace(s) a denunciar ]") + "\n\n" +
            "Están llevando a cabo una campaña maliciosa contra " + marca + ".\n\n" +
            "Estos sitios de phishing aparecen en anuncios maliciosos de Facebook. Adjuntamos una captura de pantalla.\n\n" +
            "1. Están usando la marca " + marca + " para vender servicios de nuestra empresa, con la que no tienen ninguna relación.\n\n" +
            "2. Están difamando a " + marca + " ofreciendo comprar acciones e invertir en " + marca + ".\n\n" +
            "3. Están realizando una campaña maliciosa contra " + marca + ", engañando a los usuarios para que compren acciones.\n\n" +
            "4. El único propósito de la creación del dominio fue cometer fraude.\n\n" +
            "5. El dominio y nuestro sitio web oficial son: " + sitioEs + "\n\n" +
            "6. " + marca + " ha denunciado la publicación de ofertas de inversión en supuestas acciones: " + avisoEs + "\n\n" +
            "7. " + marca + " no ha pagado publicidad en Facebook para invertir en supuestas acciones.\n\n" +
            "8. " + marca + " ha facilitado la siguiente información para advertir a los usuarios sobre este tipo de publicaciones maliciosas:\n" +
            listaEs + "\n\n" +
            lineaPerfilOficial(d, "Cloudflare", marca, "es") +
            "Muchas gracias por su trabajo y por ayudarnos a mantener Internet limpio de perfiles falsos creados para estafar" +
            polEs + "\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== Ofertas falsas de trabajo (red propia, NO tiene form web: es por CORREO) =====
    // Denuncia ante el SITIO / red / bolsa de empleo que aloja una oferta de trabajo
    // falsa que suplanta a la marca. Mismo formato que Apps maliciosas / Studocu.
    ofertas_falsas: {
      red: "Ofertas falsas de trabajo", nombre: "Oferta de empleo falsa (por correo)", cat: "ofertas_falsas", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo de abuso/contacto del SITIO, red o bolsa de empleo que aloja la oferta de trabajo falsa. Donde dice [ ... ] pega el/los enlace(s) de la oferta a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pais = d.pais ? " (" + d.pais + ")" : "";
        var en = { to: dest,
          asunto: "Fraudulent job offer impersonating " + marca + " - urgent removal request",
          cuerpo:
            "Hi,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
            marca + " informs you that the job offer(s) published in this content are NOT authorized, published or endorsed by the brand. " + marca + " is not carrying out any recruitment process through this posting.\n\n" +
            "We respectfully but firmly request the immediate removal of this content for the following reasons:\n" +
            "- It uses the name, logo and corporate identity of " + marca + " without authorization, impersonating the brand.\n" +
            "- It advertises a job that does not exist and has no connection whatsoever with " + marca + "'s official recruitment channels.\n" +
            "- It misleads job seekers and may be used to obtain personal data, documents or payments from the victims (recruitment fraud).\n" +
            "- It damages the reputation and the trust that " + marca + " has built with the public, and infringes its trademark and intellectual property rights.\n\n" +
            marca + "'s official job openings are published exclusively through its official website and verified channels; any offer outside those channels is not legitimate.\n\n" +
            "Given the direct risk of fraud to the public, we kindly ask you to remove all content related to this fake job offer associated with " + marca + pais + " as soon as possible.\n\n" +
            negrita("Reported link(s) (fake job offer):") + "\n" + urlsODefault(ctx, "[ Paste here the link(s) you are reporting ]") + "\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Oferta de trabajo fraudulenta que suplanta a " + marca + " - solicitud urgente de eliminación",
          cuerpo:
            "Hola,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
            marca + " informa que la(s) oferta(s) de empleo publicada(s) en este contenido NO están autorizadas, publicadas ni respaldadas por la marca. " + marca + " no está llevando a cabo ningún proceso de contratación a través de esta publicación.\n\n" +
            "Solicitamos respetuosa pero firmemente la eliminación inmediata de este contenido por las siguientes razones:\n" +
            "- Utiliza el nombre, el logotipo y la identidad corporativa de " + marca + " sin autorización, suplantando a la marca.\n" +
            "- Anuncia un empleo que no existe y no tiene ninguna relación con los canales oficiales de contratación de " + marca + ".\n" +
            "- Engaña a las personas que buscan trabajo y puede usarse para obtener datos personales, documentos o pagos de las víctimas (fraude de reclutamiento).\n" +
            "- Daña la reputación y la confianza que " + marca + " ha construido con el público, e infringe sus derechos de marca y de propiedad intelectual.\n\n" +
            "Las vacantes oficiales de " + marca + " se publican exclusivamente a través de su sitio web oficial y sus canales verificados; cualquier oferta fuera de esos canales no es legítima.\n\n" +
            "Ante el riesgo directo de fraude para el público, solicitamos amablemente que eliminen a la brevedad todo el contenido relacionado con esta oferta de trabajo falsa asociada a " + marca + pais + ".\n\n" +
            negrita("Enlace(s) a denunciar (oferta de trabajo falsa):") + "\n" + urlsODefault(ctx, "[ Pega aquí el/los enlace(s) a denunciar ]") + "\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== Delisting (red propia, NO tiene form web: es por CORREO) =====
    // Pide a una lista negra / antispam que QUITE de su base un dominio LEGÍTIMO
    // de la marca marcado por error (falso positivo). Adjunta el reporte de VirusTotal.
    delisting: {
      red: "Delisting", nombre: "Quitar dominio de lista negra (por correo)", cat: "delisting", tipo: "email",
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo de delisting / falsos positivos del servicio o lista negra que marcó tu dominio. Carga el Excel de URLs como evidencia; revisa antes de enviar.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pais = d.pais ? " " + d.pais : "";
        var dom = (d.dominio || "").trim();
        var dominioEn = dom || "[ your domain, e.g. credix.com ]";
        var dominioEs = dom || "[ tu dominio, ej. credix.com ]";
        var en = { to: dest,
          asunto: "Delisting request: remove " + (dom || "our domain") + " from your spam/blacklist database",
          cuerpo:
            "Hello,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + pais + "." : "We are " + marca + pais + ".") + "\n\n" +
            "Our domain is: " + dominioEn + "\n\n" +
            "We kindly ask for your help to remove the " + dominioEn + " website, which is currently listed as spam/malicious in your database. This is a legitimate domain used for the brand's own and internal email and websites; it has been flagged by mistake (false positive) and has no malicious activity.\n\n" +
            negrita("As supporting evidence, please review the following URL(s):") + "\n" +
            urlsODefault(ctx, "[ Paste here the evidence link(s) ]") + "\n\n" +
            "We look forward to your comments and appreciate your prompt action to delist it.\n\n" +
            "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Solicitud de delisting: quitar " + (dom || "nuestro dominio") + " de su base de datos de spam/lista negra",
          cuerpo:
            "Hola,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + pais + "." : "Somos " + marca + pais + ".") + "\n\n" +
            "Nuestro dominio es: " + dominioEs + "\n\n" +
            "Solicitamos amablemente su ayuda para quitar el sitio web " + dominioEs + ", que actualmente figura como spam/malicioso en su base de datos. Es un dominio legítimo usado para el correo y los sitios web propios e internos de la marca; fue marcado por error (falso positivo) y no tiene ninguna actividad maliciosa.\n\n" +
            negrita("Como prueba de respaldo, revisen la(s) siguiente(s) URL(s):") + "\n" +
            urlsODefault(ctx, "[ Pega aquí el/los enlace(s) de evidencia ]") + "\n\n" +
            "Quedamos atentos a sus comentarios y agradecemos su pronta gestión para quitarlo de la lista.\n\n" +
            "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== GitHub (red propia, NO tiene form web: es por CORREO) =====
    // Reporta a Trust & Safety / DMCA un repositorio que aloja un kit de phishing o
    // suplanta a la marca. Argumento basado en las Acceptable Use Policies de GitHub.
    github_repo: {
      red: "GitHub", nombre: "Repositorio malicioso / phishing (por correo)", cat: "github", tipo: "email",
      destino: "support@github.com, abuse@github.com, security@github.com, dmca@github.com",
      manual: "Pega la URL del repositorio donde dice [ ... ] y, en el bloque de indicadores, los datos concretos del caso (archivos, qué roba cada uno, despliegue activo). Revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos, dest = this.destino;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pols = ((window.POLITICAS_GENERALES && window.POLITICAS_GENERALES["GitHub"]) || []).slice(0, 2);
        var polEn = pols.length ? "\n\nGitHub policies being violated (please review):\n" + pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n") : "";
        var polEs = pols.length ? "\n\nPolíticas de GitHub que se están infringiendo (para su revisión):\n" + pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n") : "";
        var en = { to: dest,
          asunto: "Active phishing kit impersonating " + marca + " hosted on GitHub - urgent removal request",
          cuerpo:
            "Hello GitHub Trust & Safety team,\n\n" +
            (repres ? "We are Security Maximum in Computer Networks, writing on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
            "I am reporting the following public repository because it appears to host an active phishing kit impersonating " + marca + ":\n\n" +
            negrita("Repository:") + "\n" + urlsODefault(ctx, "[ Paste here the GitHub repository URL, e.g. https://github.com/<user>/<repo> ]") + "\n\n" +
            "Observed indicators:\n" +
            "- The repository is publicly accessible and contains files used as a phishing flow that impersonates " + marca + ".\n" +
            "- It reproduces " + marca + "'s name, logo, branding and services without authorization, impersonating it.\n" +
            "- It is designed to harvest personal data, credentials and/or sensitive information (and in some cases biometric data) from victims and exfiltrate it to an external destination.\n" +
            "[ Add here the specific indicators of this case, for example:\n" +
            "  - Links to an active deployment: <url>\n" +
            "  - <file>.html collects <data> and sends it to <destination, e.g. a Discord webhook / external server>\n" +
            "  - <file>.html requests camera access and captures a selfie/photo of the victim ]\n\n" +
            "This content is not security research. It is an active phishing kit used for credential / PII / biometric data theft and brand impersonation.\n\n" +
            "This repository violates GitHub's Acceptable Use Policies, including the prohibitions on phishing, active malware or exploits, impersonation, and posting other people's private and sensitive information. It puts " + marca + "'s customers at direct risk of fraud and identity theft." + polEn + "\n\n" +
            "Please review and remove or restrict the repository and the related account/organization as appropriate.\n\n" +
            "Thank you,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
        var es = {
          asunto: "Kit de phishing activo que suplanta a " + marca + " alojado en GitHub - solicitud urgente de eliminación",
          cuerpo:
            "Estimado equipo de Trust & Safety de GitHub,\n\n" +
            (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
            "Reporto el siguiente repositorio público porque parece alojar un kit de phishing activo que suplanta a " + marca + ":\n\n" +
            negrita("Repositorio:") + "\n" + urlsODefault(ctx, "[ Pega aquí la URL del repositorio de GitHub, ej. https://github.com/<usuario>/<repo> ]") + "\n\n" +
            "Indicadores observados:\n" +
            "- El repositorio es de acceso público y contiene archivos usados como flujo de phishing que suplanta a " + marca + ".\n" +
            "- Reproduce el nombre, el logotipo, la identidad y los servicios de " + marca + " sin autorización, suplantándola.\n" +
            "- Está diseñado para robar datos personales, credenciales y/o información sensible (y en algunos casos datos biométricos) de las víctimas y enviarlos a un destino externo.\n" +
            "[ Agrega aquí los indicadores específicos de este caso, por ejemplo:\n" +
            "  - Enlaza a un despliegue activo: <url>\n" +
            "  - <archivo>.html recopila <dato> y lo envía a <destino, ej. un webhook de Discord / servidor externo>\n" +
            "  - <archivo>.html solicita acceso a la cámara y captura una selfie/foto de la víctima ]\n\n" +
            "Este contenido no es investigación de seguridad. Es un kit de phishing activo usado para el robo de credenciales / datos personales / datos biométricos y la suplantación de marca.\n\n" +
            "Este repositorio infringe las Políticas de Uso Aceptable de GitHub, incluidas las prohibiciones de phishing, malware o exploits activos, suplantación y publicación de información privada y sensible de terceros. Pone a los clientes de " + marca + " en riesgo directo de fraude y robo de identidad." + polEs + "\n\n" +
            "Por favor, revisen y eliminen o restrinjan el repositorio y la cuenta/organización relacionada según corresponda.\n\n" +
            "Gracias,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
        return bilingue(en, es);
      }
    },
    // ===== GitHub: FORMULARIOS web de soporte (autollenado parcial por etiqueta) =====
    // Solo se rellenan los campos de TEXTO/textarea brand-aware; desplegables, casillas
    // juradas, firma y captcha los hace el usuario (ver 'manual'). Igual que TikTok (tk_*),
    // se usa el patrón 'fillLabel' porque no tenemos los nombres internos de los campos.
    gh_abuso: {
      red: "GitHub", nombre: "Denunciar abuso o spam (formulario)", cat: "github",
      url: "https://support.github.com/contact/report-abuse?category=report-abuse&report=other&report_type=unspecified",
      manual: "Elige TÚ la categoría (ej. Phishing), pega el usuario/repo/URL a denunciar, resuelve el captcha y revisa antes de enviar. El cuadro '¿De qué quieres informar?' se rellena solo.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pols = ((window.POLITICAS_GENERALES && window.POLITICAS_GENERALES["GitHub"]) || []).slice(0, 2);
        var polLista = pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n");
        var desc =
          "This GitHub repository hosts an active phishing kit that impersonates " + marca + ". " +
          "It reproduces " + marca + "'s name, logo, branding and services without authorization, and it is designed to steal personal data, credentials and/or biometric information from the victims, putting " + marca + "'s customers at direct risk of fraud and identity theft.\n\n" +
          (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
          "This is not security research; it is an active phishing kit used for credential / PII / biometric data theft and brand impersonation." +
          (pols.length ? "\n\nGitHub policies being violated (please review):\n" + polLista : "") + "\n\n" +
          "[ Paste here the repository URL and the specific indicators: files, what each one steals, active deployment, Discord webhook, etc. ]";
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillLabel", label: "mayor nivel de detalles|comportamiento que estas denunciando|ejemplos especificos en forma de url|de que quieres informar|de qué quieres informar|que quieres reportar|what would you like to report|what do you want to report|provide as much detail|report", valor: desc }
        ] };
      }
    },
    gh_dmca: {
      red: "GitHub", nombre: "Aviso DMCA / derechos de autor (formulario)", cat: "github",
      url: "https://support.github.com/contact/dmca-takedown",
      manual: "Se rellenan los desplegables, las descripciones (en inglés, es lo que se explica a GitHub) y las 4 casillas juradas del final. ELIGE TÚ: el desplegable 'teléfono o dirección' y complétalo, pega la URL del repositorio infractor, y revisa la FIRMA con tu nombre legal completo (GitHub no acepta nombre de empresa). Revisa todo antes de enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var pols = ((window.POLITICAS_GENERALES && window.POLITICAS_GENERALES["GitHub"]) || []).slice(0, 2);
        var polLista = pols.map(function (p) { return "- " + p.t + ": " + p.u; }).join("\n");
        var titular = repres
          ? "We are Security Maximum in Computer Networks, acting as the authorized agent of " + marca + " and duly authorized to act on behalf of the rights owner to submit this notice."
          : "We are the brand protection team of " + marca + ", duly authorized to act on behalf of " + marca + " (the owner of the intellectual property and brand rights described in this notice).";
        var obra =
          "The original protected work is the official brand identity of " + marca + ": its registered name, its logo, its official website and its original published content. " +
          "The infringing repository copies and reproduces this material without authorization in order to impersonate " + marca + " and mislead its customers." +
          (pols.length ? "\n\nGitHub policies being violated (please review):\n" + polLista : "");
        var urlObra = (d.sitio || "[ paste here the URL of the brand's official content ]");
        var firma = repres ? "Diego Arias" : marca;
        var codTel = "";
        try { codTel = (window.JUSTIF && window.JUSTIF.CODIGO[window.JUSTIF.norm(d.pais || "")]) || ""; } catch (e) {}
        var telNum = (d.telefono || "").replace(/\s+/g, "") || "[ phone number ]";
        var codNum = (codTel || "").replace(/[^0-9]/g, "");
        return { url: this.url, manual: this.manual, pasos: [
          // Desplegables (por etiqueta en inglés)
          { tipo: "selectLabel", label: "are you the copyright holder or authorized", opcion: "authorized to act on the copyright owner", esperaMs: 250 },
          { tipo: "selectLabel", label: "submitting a revised dmca notice", opcion: "no", esperaMs: 250 },
          { tipo: "selectLabel", label: "does your claim involve content on github or npm", opcion: "github", esperaMs: 250 },
          { tipo: "selectLabel", label: "based on the above, i confirm", opcion: "entire repository is infringing", esperaMs: 250 },
          { tipo: "selectLabel", label: "technological measures in place to control access", opcion: "no", esperaMs: 250 },
          { tipo: "selectLabel", label: "licensed under an open source license", opcion: "no", esperaMs: 250 },
          { tipo: "selectLabel", label: "what would be the best solution for the alleged infringement|best solution for the alleged infringement", opcion: "content must be removed", esperaMs: 250 },
          { tipo: "selectLabel", label: "provide either your telephone number or physical address|get back to you|telephone number or physical address", opcion: "telephone", esperaMs: 600 },
          { tipo: "selectLabel", label: "country code|codigo de pais|codigo del pais|country", opcion: codNum, esperaMs: 300 },
          // Descripciones (por etiqueta en inglés) -> contenido en inglés (se explica a GitHub)
          { tipo: "fillLabel", label: "describe the nature of your copyright ownership|nature of your copyright ownership or authorization", valor: titular },
          { tipo: "fillLabel", label: "detailed description of the original copyrighted work|original copyrighted work that has allegedly been infringed", valor: obra },
          { tipo: "fillLabel", label: "if the original work referenced above is available online|original work referenced above is available online", valor: urlObra },
          { tipo: "fillLabel", label: "identify the full repository url that is infringing|full repository url that is infringing", valor: "[ Paste here the full infringing repository URL ]" },
          { tipo: "fillLabel", label: "phone number|enter your phone|your phone number|numero de telefono", valor: telNum },
          // Casillas finales juradas (cada una por su propio rótulo, sin confundirse entre sí)
          { tipo: "checkLabel", texto: "good faith belief that use of the copyrighted" },
          { tipo: "checkLabel", texto: "penalty of perjury" },
          { tipo: "checkLabel", texto: "taken fair use into consideration" },
          { tipo: "checkLabel", texto: "read and understand github" },
          // Firma (nombre legal)
          { tipo: "fillLabel", label: "type your full name for your signature|full name for your signature", valor: firma }
        ] };
      }
    },
    gh_priv: {
      red: "GitHub", nombre: "Eliminación de información privada (formulario)", cat: "github",
      url: "https://support.github.com/contact/private-information",
      manual: "Se rellenan los desplegables y un enlace de EJEMPLO para poder avanzar al siguiente paso. REEMPLAZA el enlace de ejemplo por el real (Gist/Pages/issue/PR/Discussion/archivo) a denunciar antes de enviar.",
      construirPlan: function (ctx) {
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "selectLabel", label: "cuenta de empresa de github|cuenta de empresa|github enterprise account|enterprise account", opcion: "no aplicable", esperaMs: 250 },
          { tipo: "selectLabel", label: "trabajo protegido por derechos de autor que te pertenece|derechos de autor que te pertenece|copyrighted work that you own|content you are reporting a copyrighted", opcion: "no", esperaMs: 250 },
          { tipo: "fillLabel", label: "enlace de gist|sitio de pages|archivo especifico en el repositorio|discussion o un archivo|link to the gist|pages site|specific file in the repository", valor: "https://github.com/usuario-ejemplo/repositorio-a-denunciar" }
        ] };
      }
    }
  };

  // ==========================================================================
  //  PLATAFORMAS QUE CREA EL USUARIO (desde el popup: "➕ Nueva plataforma…")
  //
  //  Sirven para denunciar en un sitio que la extensión todavía no conoce, sin
  //  esperar a que se programe campo por campo. Se guardan en
  //  chrome.storage.local -> plataformas_usuario y se MEZCLAN con FORMULARIOS al
  //  arrancar el popup y el menú del clic derecho, así aparecen igual que las de
  //  fábrica en las dos listas.
  //
  //  Dos tipos:
  //   · "formulario": abre la URL que dio el usuario e intenta rellenar POR
  //     RÓTULO los datos que pide cualquier formulario de denuncia (quién
  //     denuncia, su correo, teléfono, país, la marca, la descripción y los
  //     enlaces). Todos los pasos son OPCIONALES: lo que esa página no tenga se
  //     salta sin romper nada, y lo que no encuentre sale listado en el informe
  //     del popup ("📋 Copiar informe") para poder programarlo bien después.
  //   · "email": genera el borrador de correo al buzón que dio el usuario, con
  //     el mismo formato bilingüe que el resto de denuncias por correo.
  //
  //  Las de fábrica MANDAN: si el usuario crea una con una clave que ya existe,
  //  no se pisa la de fábrica (se le pone un sufijo al guardar, ver popup.js).
  // ==========================================================================

  // Rótulos por los que se busca cada dato. Van en español e inglés porque una
  // plataforma nueva puede estar en cualquiera de los dos, y separados por "|"
  // que es como el motor admite varias redacciones para el mismo campo.
  var ROTULOS_GENERICOS = {
    nombre:      "nombre completo|nombre y apellidos|tu nombre|nombre del solicitante|full name|your name|first and last name|contact name",
    correo:      "correo electronico|correo|email|e-mail|email address|tu correo",
    telefono:    "telefono|teléfono|numero de telefono|phone|telephone|phone number",
    empresa:     "empresa|compania|compañia|organizacion|organización|company|organization",
    marca:       "marca|nombre de la marca|titular|titular de los derechos|brand|trademark|rights holder|copyright holder|company name",
    sitio:       "sitio web oficial|sitio oficial|web oficial|pagina oficial|official website|official site|your website",
    descripcion: "descripcion|descripción|detalles|explica|explique|motivo|mensaje|comentarios|description|details|explain|message|comments|additional information|reason",
    enlaces:     "enlace|enlaces|url|urls|direccion|dirección|link|links|reported url|infringing|contenido denunciado|content to report",
    firma:       "firma|firma electronica|signature|electronic signature|type your name"
  };

  function planGenericoDeUsuario(ctx, url, manual) {
    var marca = ctx.marca, d = ctx.datos || {};
    var repres = /seguridadmaxima\.net/i.test(d.correo || "");
    var quien = repres ? "Security Maximum in Computer Networks" : marca;
    var R = ROTULOS_GENERICOS;
    // TODOS opcionales: es un formulario desconocido, así que ningún paso puede
    // dar la denuncia por fallida solo porque esa página no tenga ese campo.
    return { url: url, manual: manual, pasos: [
      { tipo: "fillLabel", label: R.nombre,   valor: quien,          opcional: true, reintentos: 4 },
      { tipo: "fillLabel", label: R.correo,   valor: d.correo || "", opcional: true },
      { tipo: "fillLabel", label: R.telefono, valor: d.telefono || "", opcional: true },
      { tipo: "fillLabel", label: R.empresa,  valor: quien,          opcional: true },
      { tipo: "fillLabel", label: R.marca,    valor: marca,          opcional: true },
      { tipo: "fillLabel", label: R.sitio,    valor: d.sitio || "",  opcional: true },
      { tipo: "selectPais", label: "pais|país|country", valor: d.pais || "", opcional: true },
      { tipo: "fillLabel", label: R.descripcion, valor: ctx.justif,  opcional: true },
      { tipo: "fillUrlsUnaCaja", label: R.enlaces, separador: "\n",  opcional: true },
      { tipo: "fillLabel", label: R.firma,    valor: quien,          opcional: true }
    ] };
  }

  function emailGenericoDeUsuario(ctx, destino, nombrePlataforma) {
    var marca = ctx.marca, d = ctx.datos || {};
    var repres = /seguridadmaxima\.net/i.test(d.correo || "");
    var pais = d.pais ? " (" + d.pais + ")" : "";
    var en = { to: destino,
      asunto: "Content impersonating " + marca + " - urgent removal request",
      cuerpo:
        "Hello,\n\n" +
        (repres ? "We are Security Maximum in Computer Networks, on behalf of " + marca + "." : "We are " + marca + ".") + "\n\n" +
        "We request the removal of the following content, which uses the " + marca +
        " brand without any authorization and misleads users:\n\n" +
        negrita("Reported link(s):") + "\n" + urlsODefault(ctx, "[ Paste here the link(s) you are reporting ]") + "\n\n" +
        ctx.justif + "\n\n" +
        lineaPerfilOficial(d, nombrePlataforma || "", marca, "en") +
        "Please remove all content related to " + marca + pais + ".\n\n" +
        "Sincerely,\n" + (repres ? "Security Maximum in Computer Networks" : marca) + (d.correo ? "\nContact: " + d.correo : "") };
    var es = {
      asunto: "Contenido que suplanta a " + marca + " - solicitud urgente de eliminación",
      cuerpo:
        "Hola,\n\n" +
        (repres ? "Somos Seguridad Máxima en Redes Informáticas, en representación de " + marca + "." : "Somos " + marca + ".") + "\n\n" +
        "Solicitamos la eliminación del siguiente contenido, que usa la marca " + marca +
        " sin autorización alguna e induce a error a los usuarios:\n\n" +
        negrita("Enlace(s) denunciado(s):") + "\n" + urlsODefault(ctx, "[ Pega aquí el/los enlace(s) a denunciar ]") + "\n\n" +
        (ctx.justif_es || ctx.justif) + "\n\n" +
        lineaPerfilOficial(d, nombrePlataforma || "", marca, "es") +
        "Por favor, eliminen todo el contenido relacionado con " + marca + pais + ".\n\n" +
        "Saludos,\n" + (repres ? "Seguridad Máxima en Redes Informáticas" : marca) + (d.correo ? "\nContacto: " + d.correo : "") };
    return bilingue(en, es);
  }

  // Convierte UNA plataforma guardada en un formulario como los de fábrica.
  window.CREAR_FORMULARIO_DE_USUARIO = function (p) {
    if (!p || !p.red) return null;
    var esCorreo = (p.tipo === "email");
    if (esCorreo) {
      return {
        red: p.red, nombre: p.nombre || "Denuncia (por correo)", cat: "usuario", tipo: "email",
        destino: p.destino || "", de_usuario: true,
        manual: "Plataforma creada por ti. Revisa el correo antes de enviarlo.",
        construirEmail: function (ctx) { return emailGenericoDeUsuario(ctx, this.destino, this.red); }
      };
    }
    return {
      red: p.red, nombre: p.nombre || "Denuncia (formulario)", cat: "usuario",
      url: p.url || "", de_usuario: true,
      manual: "Plataforma creada por ti: la extensión rellena por el RÓTULO de cada campo lo que reconoce " +
              "(nombre, correo, teléfono, país, marca, descripción y enlaces). Revisa la página entera antes de enviar; " +
              "lo que no encontró sale en «📋 Copiar informe».",
      construirPlan: function (ctx) { return planGenericoDeUsuario(ctx, this.url, this.manual); }
    };
  };

  // Mezcla en FORMULARIOS todas las plataformas del usuario. Devuelve cuántas
  // entraron. Las de fábrica nunca se pisan.
  window.APLICAR_PLATAFORMAS_DE_USUARIO = function (guardadas) {
    var n = 0;
    Object.keys(guardadas || {}).forEach(function (clave) {
      // Una clave "__proto__"/"constructor" contaminaría el objeto de formularios.
      if (clave === "__proto__" || clave === "constructor" || clave === "prototype") return;
      if (Object.prototype.hasOwnProperty.call(window.FORMULARIOS, clave)) return; // de fábrica manda
      var f = window.CREAR_FORMULARIO_DE_USUARIO(guardadas[clave]);
      if (f) { window.FORMULARIOS[clave] = f; n++; }
    });
    return n;
  };

  // ==========================================================================
  //  DESTINOS FIJOS POR RED
  //  Hay redes con buzones de denuncia únicos: TODO correo dirigido a esa red
  //  —de cualquier marca, de cualquier categoría (propiedad intelectual,
  //  difamación, apps, lo que sea) y en cualquier formato— tiene que salir a
  //  esos correos. En vez de repetirlos formulario por formulario (y olvidarlos
  //  al crear uno nuevo), se aplican aquí de una vez a TODOS los formularios de
  //  tipo "email" de esa red. La lista vive en datos/correos_denuncia.js.
  //  Hoy: TikTok -> copyright@tiktok.com, ip-reports@tiktok.com, ip_reports@tiktok.com.
  // ==========================================================================
  (function aplicar_destinos_fijos_por_red() {
    var CD = window.CORREOS_DENUNCIA;
    if (!CD) return;   // sin la agenda cargada, cada formulario conserva su destino
    Object.keys(window.FORMULARIOS).forEach(function (clave) {
      var f = window.FORMULARIOS[clave];
      if (!f || f.tipo !== "email") return;
      var fijos = CD.fijos_de_red(f.red);
      if (!fijos.length) return;
      // Se SUMAN a lo que ya tuviera ese formulario (sin repetir correos).
      f.destino = CD.unir_correos(f.destino || "", fijos);
    });
  })();
})();
