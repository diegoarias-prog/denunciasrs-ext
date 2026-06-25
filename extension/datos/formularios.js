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

  function postalDe(pais) {
    try { return window.JUSTIF.POSTAL[window.JUSTIF.norm(pais)] || ""; } catch (e) { return ""; }
  }

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
      { tipo: "fillName", name: "copyright_url", valor: d.sitio || "" },
      { tipo: "fillName", name: "describe_copyrighted_work_me_URLs", valor: "Perfil oficial de " + marca },
      { tipo: "check", name: "Content_type[]", texto: "publicacion" },
      { tipo: "fillName", name: "why_reporting_other", valor: ctx.justif },
      { tipo: "fillName", name: "Electronic_sig", valor: marca },
      { tipo: "radio", name: "copyright_owner", texto: "rights owner" } // re-marcar al final
    ] };
  }
  function planMarca(ctx) {
    var d = ctx.datos, marca = ctx.marca;
    return { url: this.url, manual: this.manual, pasos: [
      { tipo: "radio", name: "continuereport", texto: "trademark", esperaMs: 800 },
      { tipo: "radio", name: "relationship_rightsowner", texto: "rights owner", esperaMs: 1500 },
      { tipo: "fillName", name: "your_name", valor: marca },
      { tipo: "fillName", name: "email", valor: d.correo },
      { tipo: "fillName", name: "confirm_email", valor: d.correo },
      { tipo: "fillName", name: "reporter_name", valor: marca },
      { tipo: "fillName", name: "websiterightsholder", valor: d.sitio || "" },
      { tipo: "fillName", name: "what_is_your_trademark", valor: marca },
      { tipo: "select", name: "rights_owner_country_routing", texto: d.pais },
      { tipo: "check", name: "content_type[]", texto: "uses the rights owner" },
      { tipo: "fillName", name: "why_reporting_other", valor: ctx.justif },
      { tipo: "fillName", name: "signature", valor: marca },
      { tipo: "radio", name: "continuereport", texto: "trademark" },          // re-marcar al final
      { tipo: "radio", name: "relationship_rightsowner", texto: "rights owner" }
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
      { tipo: "fillAny", names: ["Please_identify_1", "Please_Identify_1"], valor: ctx.justif },
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
          { tipo: "fillName", name: "trademark_company_name", valor: marca },
          { tipo: "fillName", name: "trademark_company_url", valor: sitio },
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
          { tipo: "fillName", suf: true, name: "trademark-holder-website", valor: d.sitio || "" },
          { tipo: "fillName", suf: true, name: "trademark-word", valor: marca },
          { tipo: "select", suf: true, name: "trademark-holder-country", texto: d.pais },
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
      manual: "TikTok se llena por partes: pulsa Rellenar, avanza (verifica tu correo, Siguiente) y vuelve a pulsar Rellenar para lo que aparezca. MARCA TÚ el 'Tipo de obra' y el 'Origen' (2 opciones), y completa la URL del contenido a denunciar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "dropdown", opcion: "copyright infringement in user-generated|infraccion de copyright en contenido generado|posible infraccion de copyright en contenido", esperaMs: 2500 },
          { tipo: "dropdown", opcion: "i am the copyright owner|copyright owner|soy propietario del copyright", esperaMs: 2000 },
          { tipo: "fillLabel", label: "enter your email|verify your email|email address|verifica tu correo|correo electronico|introduce tu correo", valor: d.correo },
          { tipo: "fillLabel", label: "tu nombre completo|nombre completo|full name", valor: marca },
          { tipo: "fillLabel", label: "nombre del titular de los derechos de autor|titular de los derechos de autor|name of the copyright owner|copyright owner", valor: marca },
          { tipo: "fillLabel", label: "tu direccion fisica|direccion fisica|physical address", valor: d.pais },
          { tipo: "fillLabel", label: "tu direccion de correo electronico|direccion de correo|your email address|email address", valor: d.correo },
          { tipo: "fillLabel", label: "firma de forma electronica|firma|signature|electronic signature", valor: marca },
          { tipo: "radioVal", name: "typeCopyRight", value: "6", esperaMs: 300 },
          { tipo: "radioVal", name: "copyrightedWorkSource", value: "3", esperaMs: 300 },
          { tipo: "checkVarios", etiquetas: "buena fe|good faith|correcta|exacta|accurate|perjurio|penalty of perjury|reconozco|acknowledge", max: 3 },
          { tipo: "clickBoton", texto: "siguiente|next|continuar|continue", esperaMs: 1500 }
        ] };
      }
    },
    tk_marca: {
      red: "TikTok", nombre: "Marca comercial", cat: "marca",
      url: "https://www.tiktok.com/legal/report/Trademark",
      manual: "TikTok se llena por partes: pulsa Rellenar, avanza (verifica tu correo) y vuelve a pulsar Rellenar para lo que aparezca. Completa la URL del contenido a denunciar.",
      construirPlan: function (ctx) {
        var d = ctx.datos, marca = ctx.marca;
        return { url: this.url, manual: this.manual, pasos: [
          { tipo: "dropdown", opcion: "trademark infringement in user-generated|infraccion de marca comercial en contenido generado|infraccion de marca en contenido generado", esperaMs: 2500 },
          { tipo: "dropdown", opcion: "i am the trademark owner|trademark owner|soy propietario de la marca", esperaMs: 2000 },
          { tipo: "fillLabel", label: "enter your email|verify your email|email address|verifica tu correo|correo electronico|introduce tu correo", valor: d.correo },
          { tipo: "fillLabel", label: "full name|nombre completo|tu nombre completo", valor: marca },
          { tipo: "fillLabel", label: "trademark owner|owner of the trademark|propietario de marca|propietario de la marca", valor: marca },
          { tipo: "fillLabel", label: "physical address|direccion fisica|tu direccion fisica", valor: d.pais },
          { tipo: "fillLabel", label: "your email address|email address|direccion de correo|correo electronico", valor: d.correo },
          { tipo: "fillLabel", label: "jurisdiction|jurisdiccion|jurisdiccion del registro", valor: d.pais },
          { tipo: "fillLabel", label: "describe|description|how you believe|descripcion|como crees", valor: ctx.justif },
          { tipo: "fillLabel", label: "electronic signature|sign electronically|firma electronica|firma", valor: marca },
          { tipo: "clickBoton", texto: "siguiente|next|continuar|continue", esperaMs: 1500 }
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
          { tipo: "clickBoton", texto: "continuar|continue|siguiente|next", esperaMs: 1500 }
        ] };
      }
    },
    // ================= Telegram (NO tiene formulario web: es por CORREO) =================
    telegram_abuso: {
      red: "Telegram", nombre: "Reporte de abuso (por correo)", cat: "telegram", tipo: "email",
      destino: "abuse@telegram.org",
      manual: "Pega los enlaces (t.me/...) de los mensajes, canal o usuario a denunciar, revisa y envía el correo.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos;
        var asunto = "Solicitud de eliminación de contenido / Reporte de abuso — " + marca;
        var cuerpo =
          "Estimado equipo de Telegram (abuse@telegram.org):\n\n" +
          ctx.justif +
          "\n\nEnlaces del contenido / canal / usuario a denunciar:\n[Pega aquí los enlaces t.me/... ]\n\n" +
          "Marca afectada: " + marca + (d.pais ? " (" + d.pais + ")" : "") + "\n" +
          "Correo de contacto: " + (d.correo || "") + "\n\n" +
          "Agradecemos su pronta gestión.\n" + marca;
        return { to: this.destino, asunto: asunto, cuerpo: cuerpo };
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
        var marca = ctx.marca, d = ctx.datos;
        var dominio = (d.sitio || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
        // Si la marca tiene su PROPIO correo (no @seguridadmaxima.net), denuncia como ella misma.
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var quienes = repres
          ? "We are Security Maximum in Computer Networks, representing " + marca + "."
          : "We are " + marca + ".";
        var firma = repres ? "Security Maximum in Computer Networks" : marca;
        var asunto = "Phishing and brand impersonation report - urgent request for removal";
        var cuerpo =
          "Hello,\n\n" +
          quienes + "\n\n" +
          "We request that you delete or classify the following email address(es) as malicious (phishing / brand impersonation):\n" +
          "[ Paste here the email address(es) you are reporting ]\n\n" +
          "For the following reasons:\n\n" +
          "- They are using our brand without consent and impersonating our name, " + marca + ".\n" +
          "- They are using the " + marca + " name and logo to request confidential information from our clients (phishing).\n" +
          "- This email address does NOT belong to " + marca + " and is impersonating it in order to defraud users.\n" +
          "- Official " + marca + " communications come only from its official domain" + (dominio ? " (" + dominio + ")" : "") + ".\n" +
          "- This email address has NO business or legal relationship with " + marca + ".\n\n" +
          "This is a clear case of phishing and brand impersonation that puts our clients at risk of fraud and theft of confidential data. " +
          "We respectfully and URGENTLY request that you delete or block this account/content, which is confusing and endangering " + marca + "'s clients.\n\n" +
          "We appreciate your help in keeping the internet free of accounts that put users at risk.\n\n" +
          "Sincerely,\n" +
          firma +
          (d.correo ? "\nContact: " + d.correo : "");
        return { to: this.destino, asunto: asunto, cuerpo: cuerpo };
      }
    },
    // ============= Scribd (NO tiene form web: es por CORREO) =============
    scribd_reporte: {
      red: "Scribd", nombre: "Información confidencial / copyright (por correo)", cat: "scribd", tipo: "email",
      destino: "copyright@scribd.com, support@scribd.com, legal@scribd.com, privacy@scribd.com",
      manual: "Donde dice [ ... ] pega el/los enlace(s) de Scribd a denunciar, revisa y envía.",
      construirEmail: function (ctx) {
        var marca = ctx.marca, d = ctx.datos;
        var repres = /seguridadmaxima\.net/i.test(d.correo || "");
        var apertura = repres
          ? "We are Security Maximum in Computer Networks, writing on behalf of " + marca + " regarding an important matter related to the unauthorized use of its information."
          : "We are " + marca + ", writing regarding an important matter related to the unauthorized use of our information.";
        var firma = repres ? "Security Maximum in Computer Networks" : marca;
        var asunto = "Unauthorized use of confidential information - urgent removal request";
        var cuerpo =
          "Hello,\n\n" +
          apertura + "\n\n" +
          "We have detected that confidential information belonging to " + marca + " is being shared on your platform without authorization.\n\n" +
          "- This is a violation of intellectual property rights and a serious breach of the privacy and security of " + marca + "'s customers. As an organization, " + marca + " considers the confidentiality of its customers' data a top priority, and any unauthorized use of this information is unacceptable.\n" +
          "- We have identified the following document(s)/link(s) on your platform containing confidential information of " + marca + ":\n" +
          "[ Paste here the Scribd link(s) you are reporting, e.g. https://www.scribd.com/document/... ]\n\n" +
          "We strongly and URGENTLY request that you immediately remove the above link(s) and any other documents that include " + marca + "'s information without authorization, including any content disseminated through your platform.\n\n" +
          "We trust that you will take the necessary steps to address this situation and prevent any future violations. We would like to resolve this matter quickly and efficiently.\n\n" +
          "Sincerely,\n" +
          firma +
          (d.correo ? "\nContact: " + d.correo : "");
        return { to: this.destino, asunto: asunto, cuerpo: cuerpo };
      }
    }
  };
})();
