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

  // Devuelve la URL del perfil OFICIAL de la marca en la red indicada (campo
  // dedicado por red en los datos de la marca). "" si no hay. Se incluye en los
  // correos para que la red identifique la cuenta AUTÉNTICA frente al impostor.
  function perfilDeRed(d, redNombre) {
    var map = { "Facebook": "facebook", "Instagram": "instagram", "TikTok": "tiktok", "X": "x", "YouTube": "youtube", "LinkedIn": "linkedin" };
    var k = map[redNombre];
    return (k && d && d[k]) ? String(d[k]).trim() : "";
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
      var lineaPerfilE = (function(){ var p = perfilDeRed(d, redNombre); return p ? ("El perfil oficial de " + marca + " en " + redNombre + " es: " + p + "\n\n") : ""; })();
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
    var lineaPerfil = (function(){ var p = perfilDeRed(d, redNombre); return p ? ("The official " + redNombre + " profile of " + marca + " is: " + p + "\n\n") : ""; })();
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
      var lineaPerfilE = (function(){ var p = perfilDeRed(d, redNombre); return p ? ("El perfil oficial de " + marca + " en " + redNombre + " es: " + p + "\n\n") : ""; })();
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
    var lineaPerfil = (function(){ var p = perfilDeRed(d, redNombre); return p ? ("The official " + redNombre + " profile of " + marca + " is: " + p + "\n\n") : ""; })();
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

  // Constructores de plan para los formularios de Meta (Facebook/Instagram), que
  // comparten estructura y nombres de campo. 'this' es el objeto del formulario.
  function planCopyright(ctx) {
    var d = ctx.datos, marca = ctx.marca;
    return { url: this.url, manual: this.manual, pasos: [
      { tipo: "radio", name: "copyright_owner", texto: "rights owner", esperaMs: 1200 },
      { tipo: "fillName", name: "your_name", valor: marca },
      { tipo: "fillName", name: "email", valor: d.correo },
      { tipo: "fillName", name: "confirm_email", valor: d.correo },
      { tipo: "select", name: "rights_owner_country_routing", texto: d.pais },
      { tipo: "select", name: "describe_copyrighted_work_me", texto: "otro" },
      { tipo: "fillName", name: "reporter_name", valor: marca },
      // URL del titular: perfil OFICIAL de la marca en esta red (Instagram/Facebook) con
      // fallback a d.sitio si el perfil de la red aún no está configurado en "Marcas".
      { tipo: "fillName", name: "copyright_url", valor: (this.red === "Instagram" ? (d.instagram || d.sitio) : (d.facebook || d.sitio)) || "" },
      { tipo: "fillName", name: "describe_copyrighted_work_me_URLs", valor: "Perfil oficial de " + marca },
      { tipo: "check", name: "Content_type[]", texto: "publicacion" },
      { tipo: "fillName", name: "why_reporting_other", valor: ctx.justif },
      { tipo: "fillName", name: "Electronic_sig", valor: marca },
      { tipo: "radio", name: "copyright_owner", texto: "rights owner" }, // re-marcar al final
      // Autollena las cajas "Enlace 1..30" con la lista de URLs del Excel (si la hay).
      { tipo: "fillUrlList", dominio: (this.red === "Instagram" ? "instagram.com" : "facebook.com"), checkLabel: "Tengo enlaces adicionales que denunciar", urls: (ctx.urls || []) }
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
      { tipo: "fillLabel", label: "numero de registro de la marca comercial|numero de registro|registration number|trademark registration number|registration number of the trademark", valor: (d.registro || "") },
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
      { tipo: "fillUrlList", dominio: (this.red === "Instagram" ? "instagram.com" : "facebook.com"), checkLabel: "Tengo enlaces adicionales que denunciar", urls: (ctx.urls || []) }
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
    fb_da:        { red: "Facebook",  nombre: "Derechos de autor", cat: "autor", url: "https://www.facebook.com/help/contact/1758255661104383", manual: "Pega las URL del contenido infractor en el campo de enlaces. Revisa antes de enviar.", construirPlan: planCopyright },
    ig_copyright: { red: "Instagram", nombre: "Derechos de autor", cat: "autor", url: "https://help.instagram.com/contact/552695131608132",        manual: "Pega las URL del contenido infractor. Revisa antes de enviar.", construirPlan: planCopyright },
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
      manual: "Con UN solo clic en Rellenar basta: no vuelvas a pulsarlo. La extensión marca 'Tipo de obra'='Logotipo' y 'Origen'='Mi cuenta de TikTok personal', rellena las DOS URLs de la cuenta personal (la cuenta que posees y el contenido publicado originalmente) con el perfil de TikTok de la marca, y rellena la 'Descripción' sola en cuanto aparece. Si la marca no tiene perfil de TikTok configurado en 'Marcas', esas dos URLs quedarán vacías para que las llenes a mano. Si TikTok te pide verificar tu correo, hazlo con calma: la extensión sigue marcando y rellenando sola los campos que aparezcan después (Tipo de obra, Origen, las dos URLs, Descripción y casillas) durante varios minutos, sin volver a pulsar Rellenar. Deja ESTA pestaña abierta mientras verificas el correo. Si tu caso es otro tipo de obra (video, foto…), cámbialo tú con un clic. Revisa la URL antes de Enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, autorepetir: true, pasos: [
          // Palabras clave en ESPAÑOL (el form siempre sale en español) + respaldo por posición.
          { tipo: "dropdown", opcion: "autor&contenido|copyright&contenido|derechos de autor|infraccion de copyright", opcionIndice: 0, esperaMs: 2500 },
          { tipo: "dropdown", opcion: "propietari&autor|propietari&copyright|titular&autor|soy propietario", opcionIndice: 0, esperaMs: 2000 },
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
          // = "Mi cuenta de TikTok personal". Al marcar el Origen, TikTok revela DOS campos de
          // URL (la cuenta que posees y el contenido que publicaste originalmente); ambos se
          // rellenan con el perfil oficial de TikTok de la marca (d.tiktok) en los dos fillLabel
          // de más abajo. Si la marca no tiene perfil de TikTok, esos dos campos quedan vacíos.
          { tipo: "clickOpcion", texto: "logotipo|logo", esperaMs: 600, vigilar: true },
          { tipo: "clickOpcion", texto: "mi cuenta de tiktok personal|my personal tiktok account|personal tiktok account", esperaMs: 300, vigilar: true },
          // Dos URLs que aparecen SOLO al marcar "Mi cuenta de TikTok personal". Ambas van con
          // el perfil oficial de la marca (d.tiktok). Deben ir ANTES de fillUrlsUnaCaja: al
          // quedar NO vacías, fillUrlsUnaCaja las salta (comprueba e.value) y no les mete por
          // error las URLs a denunciar, aunque compartan el placeholder "tiktok.com/@".
          { tipo: "fillLabel", label: "url directa a la cuenta de tiktok que posees|cuenta de tiktok que posees y gestionas|la cuenta de tiktok que posees|direct url to the tiktok account you own|tiktok account you own and currently manage|account you own and manage", valor: d.tiktok, opcional: true, tardio: true, vigilar: true },
          { tipo: "fillLabel", label: "url del contenido que publicaste originalmente en tiktok|contenido que publicaste originalmente|que publicaste originalmente en tiktok|url of the content you originally posted on tiktok|content you originally posted|originally posted on tiktok", valor: d.tiktok, opcional: true, tardio: true, vigilar: true },
          // Campo TARDÍO: "Descripción de la obra con copyright" aparece SOLO al marcar el
          // 'Tipo de obra'. Lo llena el VIGILANTE (ver popup.js) en cuanto surge. La
          // justificación ya trae la política infringida citada (skill citar-politica-violada).
          { tipo: "fillLabel", label: "descripcion de la obra con copyright|descripcion de la obra|describe la obra con copyright|description of the copyrighted work|describe your copyrighted work|descripcion de tu obra", valor: ctx.justif, opcional: true, tardio: true, vigilar: true },
          { tipo: "fillLabel", label: "firma de forma electronica|firma|signature|electronic signature", valor: marca },
          { tipo: "checkVarios", etiquetas: "buena fe|good faith|correcta|exacta|accurate|perjurio|penalty of perjury|reconozco|acknowledge|acepto que toda la informacion|se reenvie|reenvie a la persona|se comparta con la persona|i acknowledge|i agree", max: 3 },
          { tipo: "clickBoton", texto: "siguiente|next|continuar|continue", esperaMs: 1500, opcional: true },
          { tipo: "fillUrlsUnaCaja", urls: (ctx.urls || []), label: "introduce la url del contenido que quieres denunciar|introduce la url del contenido|url del contenido que quieres denunciar|url of the content you want to report|enter the url of the content", placeholder: "tiktok.com/@|e.g.https|e.g. https" }
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
          // 1.ª pregunta "¿Qué problema tienes?": la PRIMERA opción (infracción de marca en el
          // contenido de un usuario). Casa por palabras clave en ESPAÑOL —el formulario SIEMPRE
          // sale en español— sin depender de la frase exacta; si TikTok la reescribe, el respaldo
          // por posición (opcionIndice:0) elige igualmente la primera.
          { tipo: "dropdown", opcion: "marca&contenido|marca&infracc|marca&incumplimiento", opcionIndice: 0, esperaMs: 2500 },
          // "Rol" tras verificar el correo: propietario/titular de la marca (primera opción).
          { tipo: "dropdown", opcion: "propietari&marca|titular&marca|soy propietario", opcionIndice: 0, esperaMs: 2000 },
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
    // ================= YouTube (formularios de soporte de Google, sin login) =================
    yt_marca: {
      red: "YouTube", nombre: "Marca registrada", cat: "marca",
      url: "https://support.google.com/youtube/contact/trademark_complaint?hl=es",
      manual: "Completa: tipo de marca/registro y N.º de registro (si lo tienes), la URL del vídeo o canal infractor, adjuntos. Resuelve el captcha y revisa antes de enviar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "fillName", name: "Fulllegalname", valor: marca },
          { tipo: "fillName", name: "email_prefill", valor: d.correo },
          { tipo: "fillName", name: "Title", valor: "Representante autorizado" },
          { tipo: "fillName", name: "CompanyName", valor: marca },
          { tipo: "fillName", name: "TrademarkOwnerName", valor: marca },
          { tipo: "fillName", name: "OwnerRelationship", valor: "Propietario / representante autorizado" },
          { tipo: "select", name: "Brand_one", texto: "denominativa y logotipo" },
          { tipo: "select", name: "Jurisdiction_one", texto: "otra" },
          { tipo: "select", name: "Jurisdiction_one_other", texto: d.pais },
          { tipo: "fillLabel", label: "clase de bienes y servicios de marca comercial|clase de bienes y servicios|clase de los bienes y servicios|bienes y servicios de la marca|clase de la marca|goods and services|class of goods|bienes y/o servicios", valor: (d.clase_bienes || CLASE_BIENES_DEFECTO), opcional: true, tardio: true },
          { tipo: "fillName", name: "AllegedlyInfringed", valor: ctx.justif },
          { tipo: "fillName", name: "Signature", valor: marca },
          { tipo: "check", name: "AffirmationOne" },
          { tipo: "check", name: "AffirmationTwo" },
          { tipo: "check", name: "AffirmationThree" }
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
      destino: "",
      manual: "El 'Para' va vacío: escribe el correo legal/de contacto correcto (TikTok no tiene un buzón público de difamación). Donde dice [ ... ] pega el/los enlace(s) de TikTok a denunciar, revisa y envía.",
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
})();
