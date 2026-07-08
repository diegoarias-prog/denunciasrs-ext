// ============================================================================
//  Generador de justificaciones por país y tipo de formulario, EN ESPAÑOL e INGLÉS.
//  justificacion(cat, red, nombre, pais, lang) -> lang "es" (def.) o "en".
//  Los formularios web se llenan con la versión EN; el español queda para mostrar
//  como referencia en los correos.
// ============================================================================
(function () {
  function norm(s) {
    return (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  const POSTAL = { honduras: "11101", ecuador: "170150", nicaragua: "11001", "costa rica": "10101",
    guatemala: "01001", panama: "0801", "el salvador": "01101" };
  const CODIGO = { honduras: "+504", ecuador: "+593", nicaragua: "+505", "costa rica": "+506",
    guatemala: "+502", panama: "+507", "el salvador": "+503" };

  // URL de la base de datos PÚBLICA de marcas comerciales por país, para el campo TM_URL
  // del formulario de Marca Registrada de Facebook/Instagram. Se usa la base nacional donde
  // hay buscador público fiable; para El Salvador, Honduras y Nicaragua (sin buscador
  // público estable) se usa la Global Brand Database de la OMPI, que también sirve de
  // fallback universal para cualquier país fuera del mapa.
  const BASE_MARCAS = {
    guatemala: "https://econsulta.rpi.gob.gt/erpiconsulta/eRPIConsultas.aspx",
    panama: "https://consulta.digerpi.gob.pa/",
    ecuador: "https://www.derechosintelectuales.gob.ec/senadi-en-linea/",
    "costa rica": "https://rpi.rnp.go.cr/wipofileindex/xhtml/sesion/index.xhtml",
    "el salvador": "https://branddb.wipo.int/",
    honduras: "https://branddb.wipo.int/",
    nicaragua: "https://branddb.wipo.int/"
  };
  const OMPI_BASE_MARCAS = "https://branddb.wipo.int/"; // fallback universal (OMPI Global Brand Database)

  const LEY_PENAL = {
    honduras: "el Código Penal de Honduras en sus disposiciones sobre delitos contra el honor (calumnia, injuria y difamación)",
    ecuador: "el Código Orgánico Integral Penal (COIP) del Ecuador, art. 182 (calumnia) y normas sobre injuria",
    nicaragua: "el Código Penal de Nicaragua en materia de injurias y calumnias (delitos contra el honor)",
    "el salvador": "el Código Penal de El Salvador, arts. 177 a 179 (calumnia, difamación e injuria)",
    guatemala: "el Código Penal de Guatemala, arts. 159 a 165 (calumnia, injuria y difamación)",
    panama: "el Código Penal de Panamá en sus disposiciones sobre delitos contra el honor (calumnia e injuria)",
    "costa rica": "el Código Penal de Costa Rica, arts. 145 a 152 (injuria, calumnia y difamación)" };
  const LEY_AUTOR = {
    honduras: "la Ley del Derecho de Autor y de los Derechos Conexos de Honduras",
    ecuador: "el Código Orgánico de la Economía Social de los Conocimientos del Ecuador",
    nicaragua: "la Ley de Derecho de Autor y Derechos Conexos de Nicaragua",
    "costa rica": "la Ley de Derechos de Autor y Derechos Conexos de Costa Rica",
    guatemala: "la Ley de Derecho de Autor y Derechos Conexos de Guatemala",
    panama: "la Ley de Derecho de Autor de Panamá",
    "el salvador": "la Ley de Fomento y Protección de la Propiedad Intelectual de El Salvador" };
  const LEY_MARCA = {
    honduras: "la Ley de Propiedad Industrial de Honduras",
    ecuador: "el Código Orgánico de la Economía Social de los Conocimientos del Ecuador",
    nicaragua: "la Ley de Marcas y Otros Signos Distintivos de Nicaragua",
    "costa rica": "la Ley de Marcas y Otros Signos Distintivos de Costa Rica",
    guatemala: "la Ley de Propiedad Industrial de Guatemala",
    panama: "la Ley de Propiedad Industrial de Panamá",
    "el salvador": "la Ley de Marcas y Otros Signos Distintivos de El Salvador" };
  const POL = { fb: "las Normas Comunitarias de Facebook", ig: "las Normas Comunitarias de Instagram",
    tk: "las Normas de la Comunidad de TikTok" };

  // ---- Inglés ----
  const LEY_PENAL_EN = {
    honduras: "the Penal Code of Honduras regarding crimes against honor (slander, libel and defamation)",
    ecuador: "the Comprehensive Organic Penal Code (COIP) of Ecuador, art. 182 (slander) and rules on libel",
    nicaragua: "the Penal Code of Nicaragua regarding libel and slander (crimes against honor)",
    "el salvador": "the Penal Code of El Salvador, arts. 177 to 179 (slander, defamation and libel)",
    guatemala: "the Penal Code of Guatemala, arts. 159 to 165 (slander, libel and defamation)",
    panama: "the Penal Code of Panama regarding crimes against honor (slander and libel)",
    "costa rica": "the Penal Code of Costa Rica, arts. 145 to 152 (libel, slander and defamation)" };
  const LEY_AUTOR_EN = {
    honduras: "the Copyright and Related Rights Law of Honduras",
    ecuador: "the Organic Code of the Social Economy of Knowledge of Ecuador",
    nicaragua: "the Copyright and Related Rights Law of Nicaragua",
    "costa rica": "the Copyright and Related Rights Law of Costa Rica",
    guatemala: "the Copyright and Related Rights Law of Guatemala",
    panama: "the Copyright Law of Panama",
    "el salvador": "the Law for the Promotion and Protection of Intellectual Property of El Salvador" };
  const LEY_MARCA_EN = {
    honduras: "the Industrial Property Law of Honduras",
    ecuador: "the Organic Code of the Social Economy of Knowledge of Ecuador",
    nicaragua: "the Law on Trademarks and Other Distinctive Signs of Nicaragua",
    "costa rica": "the Law on Trademarks and Other Distinctive Signs of Costa Rica",
    guatemala: "the Industrial Property Law of Guatemala",
    panama: "the Industrial Property Law of Panama",
    "el salvador": "the Law on Trademarks and Other Distinctive Signs of El Salvador" };
  const POL_EN = { fb: "Facebook's Community Standards", ig: "Instagram's Community Guidelines",
    tk: "TikTok's Community Guidelines" };

  // Política concreta infringida + enlace, por clave de formulario.
  const POLITICAS = {
    fb_da:        ["Políticas de propiedad intelectual de Facebook e Instagram", "https://www.facebook.com/help/1020633957973118 | https://help.instagram.com/535503073130320"],
    ig_copyright: ["Políticas de propiedad intelectual de Facebook e Instagram", "https://www.facebook.com/help/1020633957973118 | https://help.instagram.com/535503073130320"],
    fb_marca:     ["Políticas de propiedad intelectual de Facebook e Instagram", "https://www.facebook.com/help/1020633957973118 | https://help.instagram.com/535503073130320"],
    ig_marca:     ["Políticas de propiedad intelectual de Facebook e Instagram", "https://www.facebook.com/help/1020633957973118 | https://help.instagram.com/535503073130320"],
    tk_copy:      ["Política de Propiedad Intelectual de TikTok", "https://www.tiktok.com/legal/page/global/copyright-policy/es"],
    tk_marca:     ["Política de Propiedad Intelectual de TikTok", "https://www.tiktok.com/legal/page/global/copyright-policy/es"],
    fb_difam:     ["Normas Comunitarias de Facebook", "https://transparency.meta.com/es-la/policies/community-standards/"],
    ig_difam:     ["Normas Comunitarias de Instagram", "https://help.instagram.com/477434105621119"],
    tk_difam:     ["Normas de la Comunidad de TikTok", "https://www.tiktok.com/community-guidelines/es"],
    wa_copy:      ["Condiciones del Servicio de WhatsApp", "https://www.whatsapp.com/legal/terms-of-service"],
    wa_marca:     ["Condiciones del Servicio de WhatsApp", "https://www.whatsapp.com/legal/terms-of-service"],
    wa_fals:      ["Política Comercial de WhatsApp", "https://www.whatsapp.com/legal/commerce-policy"],
    x_acoso:      ["Política de conducta abusiva de X", "https://help.x.com/es/rules-and-policies/abusive-behavior"],
    x_privado:    ["Política de información privada de X", "https://help.x.com/es/rules-and-policies/personal-information"],
    x_suplantacion:["Política de suplantación de identidad de X", "https://help.x.com/es/rules-and-policies/x-impersonation-policy"],
    x_falsif:     ["Política de falsificaciones de X", "https://help.x.com/es/rules-and-policies/counterfeit-goods-policy"],
    li_difam:     ["Políticas de la Comunidad Profesional de LinkedIn", "https://www.linkedin.com/legal/professional-community-policies"],
    li_marca:     ["Políticas de propiedad intelectual de LinkedIn", "https://www.linkedin.com/legal/copyright-policy"],
    li_copy:      ["Política de Derechos de Autor de LinkedIn", "https://www.linkedin.com/legal/copyright-policy"],
    telegram_abuso: ["Condiciones del Servicio de Telegram", "https://telegram.org/tos"],
    yt_difam:     ["Normas de la Comunidad de YouTube", "https://www.youtube.com/howyoutubeworks/policies/community-guidelines/"],
    yt_marca:     ["Política de marcas registradas de YouTube", "https://support.google.com/youtube/answer/6154218"]
  };

  function justifES(cat, red, nombre, pais) {
    const pn = norm(pais);
    const en = pais ? (" (en " + pais + ")") : "";
    const M = (t, d) => (t[pn] || d);
    if (cat === "x_acoso") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable sobre delitos contra el honor (calumnia, injuria y difamación)");
      return "La cuenta denunciada acosa y difama a " + nombre + ", haciéndose pasar por la entidad y publicando información falsa que daña su reputación y confunde a sus clientes. Infringe las Reglas de X sobre conducta abusiva y acoso. Además, los hechos constituyen delitos contra el honor (calumnia, injuria y difamación) conforme a " + ley + ". Solicitamos la suspensión de la cuenta y la eliminación del contenido.";
    }
    if (cat === "x_privado") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable y de protección de datos");
      return "La cuenta denunciada publica sin autorización información privada y financiera relacionada con " + nombre + " y se hace pasar por la entidad, en perjuicio de sus clientes. Infringe las Reglas de X sobre publicación de información privada. Además, vulnera la protección de datos y el derecho al honor de " + nombre + " conforme a " + ley + ". Solicitamos la eliminación del contenido y la suspensión de la cuenta.";
    }
    if (cat === "x_supl") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable sobre delitos contra el honor y usurpación de identidad");
      return "La cuenta denunciada suplanta la identidad de " + nombre + ", haciéndose pasar por la entidad oficial para engañar a sus clientes y facilitar fraudes. Infringe la Política de Suplantación de Identidad de las Reglas de X. Además, constituye usurpación de identidad y delitos contra el honor conforme a " + ley + ". Solicitamos la suspensión inmediata de la cuenta.";
    }
    if (cat === "x_falsif") {
      const ley = M(LEY_MARCA, "la legislación de propiedad industrial y marcas aplicable");
      return "La cuenta denunciada utiliza sin autorización la marca " + nombre + " y ofrece productos o servicios falsificados haciéndose pasar por la entidad, en perjuicio de los consumidores. Infringe la Política de Falsificaciones de X y los derechos de marca de " + nombre + ". Conforme a " + ley + " y al Convenio de París, solicitamos la eliminación del contenido y la suspensión de la cuenta.";
    }
    if (cat === "li_difam") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable sobre delitos contra el honor");
      return "El perfil o contenido denunciado difama a " + nombre + " y difunde información falsa que daña su reputación, haciéndose pasar por la entidad o atacándola. Infringe las Políticas de la Comunidad Profesional de LinkedIn. Además, constituye delitos contra el honor (calumnia, injuria y difamación) conforme a " + ley + ". Solicitamos la retirada del contenido y la suspensión de la cuenta.";
    }
    if (cat === "li_marca") {
      const ley = M(LEY_MARCA, "la legislación de propiedad industrial aplicable");
      return "El perfil o contenido denunciado utiliza sin autorización la marca " + nombre + " (nombre, logotipo y signos distintivos), generando riesgo de confusión y suplantando a la entidad. Infringe las políticas de propiedad intelectual de LinkedIn. Conforme a " + ley + " y al Convenio de París, solicitamos su retirada.";
    }
    if (cat === "li_copy") {
      const ley = M(LEY_AUTOR, "la legislación de derecho de autor aplicable");
      return "El contenido denunciado reproduce y utiliza sin autorización obras protegidas por derechos de autor de " + nombre + " (logotipos, imágenes y materiales). Infringe la Política de Derechos de Autor de LinkedIn. Conforme a " + ley + " y al Convenio de Berna, solicitamos su retirada inmediata.";
    }
    if (cat === "difam") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable sobre delitos contra el honor (calumnia, injuria y difamación)");
      return "Solicitamos la eliminación inmediata de esta publicación porque utiliza el nombre, la marca y/o la imagen de " + nombre + " sin autorización para difundir información falsa y difamatoria, haciéndose pasar por la entidad e induciendo a engaño a los usuarios. Este contenido daña la reputación de " + nombre + ", confunde a sus clientes y puede facilitar fraudes en su perjuicio.\n\nLa publicación infringe " + (POL[red] || "las normas de la plataforma") + ", en particular sus normas sobre suplantación de identidad, información falsa y engañosa, y acoso y hostigamiento.\n\nAdemás, los hechos constituyen delitos contra el honor (calumnia, injuria y difamación) conforme a " + ley + en + ". Solicitamos su retiro inmediato.";
    }
    if (cat === "autor") {
      const ley = M(LEY_AUTOR, "la legislación de derecho de autor aplicable");
      return "El contenido reportado reproduce y utiliza sin autorización obras protegidas por derechos de autor de " + nombre + " (logotipos, imágenes, nombre e identidad de marca), haciéndose pasar por la entidad. Infringe los derechos de autor de " + nombre + " y las políticas de propiedad intelectual de la plataforma. Conforme a " + ley + " y al Convenio de Berna, solicitamos su eliminación inmediata.";
    }
    if (cat === "fals") {
      const ley = M(LEY_MARCA, "la legislación de propiedad industrial y marcas aplicable");
      return "El contenido o canal reportado suplanta a " + nombre + " y promueve productos o servicios falsificados y fraudulentos usando su marca, logotipo e identidad sin autorización, en perjuicio de los consumidores. Constituye falsificación de marca e infringe los derechos de " + nombre + ". Conforme a " + ley + " y al Convenio de París, solicitamos su eliminación inmediata.";
    }
    if (cat === "telegram") {
      const ley = M(LEY_MARCA, "la legislación de propiedad industrial y marcas aplicable");
      return "El canal, grupo o usuario reportado utiliza sin autorización el nombre, la marca y la identidad de " + nombre + " para suplantar a la entidad, difundir información falsa y promover fraudes o estafas en perjuicio de sus clientes. Esto infringe las Condiciones del Servicio de Telegram (que prohíben la suplantación de identidad, el spam y las estafas) y vulnera los derechos de marca de " + nombre + " conforme a " + ley + " y al Convenio de París. Solicitamos la eliminación inmediata del contenido y del canal o usuario infractor.";
    }
    const ley = M(LEY_MARCA, "la legislación de propiedad industrial y marcas aplicable");
    return "El contenido reportado utiliza sin autorización la marca " + nombre + " (nombre, logotipo y signos distintivos) para hacerse pasar por la entidad e inducir a engaño a los usuarios, con riesgo de confusión y daño a su reputación. Infringe los derechos de marca de " + nombre + " y las políticas de propiedad intelectual de la plataforma. Conforme a " + ley + " y al Convenio de París, solicitamos su eliminación inmediata.";
  }

  function justifEN(cat, red, nombre, pais) {
    const pn = norm(pais);
    const inc = pais ? (" (in " + pais + ")") : "";
    const M = (t, d) => (t[pn] || d);
    if (cat === "x_acoso") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal law on crimes against honor (slander, libel and defamation)");
      return "The reported account harasses and defames " + nombre + ", impersonating the entity and posting false information that damages its reputation and confuses its customers. It violates X's Rules on abusive behavior and harassment. Furthermore, these acts constitute crimes against honor (slander, libel and defamation) under " + ley + ". We request the suspension of the account and the removal of the content.";
    }
    if (cat === "x_privado") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal and data protection law");
      return "The reported account publishes, without authorization, private and financial information related to " + nombre + " and impersonates the entity, to the detriment of its customers. It violates X's Rules on posting private information. Furthermore, it infringes the data protection and the right to honor of " + nombre + " under " + ley + ". We request the removal of the content and the suspension of the account.";
    }
    if (cat === "x_supl") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal law on crimes against honor and identity theft");
      return "The reported account impersonates the identity of " + nombre + ", posing as the official entity to deceive its customers and facilitate fraud. It violates the Impersonation Policy of X's Rules. Furthermore, it constitutes identity theft and crimes against honor under " + ley + ". We request the immediate suspension of the account.";
    }
    if (cat === "x_falsif") {
      const ley = M(LEY_MARCA_EN, "the applicable industrial property and trademark law");
      return "The reported account uses the " + nombre + " trademark without authorization and offers counterfeit products or services while impersonating the entity, to the detriment of consumers. It violates X's Counterfeit Goods Policy and the trademark rights of " + nombre + ". Under " + ley + " and the Paris Convention, we request the removal of the content and the suspension of the account.";
    }
    if (cat === "li_difam") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal law on crimes against honor");
      return "The reported profile or content defames " + nombre + " and spreads false information that damages its reputation, impersonating the entity or attacking it. It violates LinkedIn's Professional Community Policies. Furthermore, it constitutes crimes against honor (slander, libel and defamation) under " + ley + ". We request the removal of the content and the suspension of the account.";
    }
    if (cat === "li_marca") {
      const ley = M(LEY_MARCA_EN, "the applicable industrial property law");
      return "The reported profile or content uses the " + nombre + " trademark (name, logo and distinctive signs) without authorization, creating a likelihood of confusion and impersonating the entity. It violates LinkedIn's intellectual property policies. Under " + ley + " and the Paris Convention, we request its removal.";
    }
    if (cat === "li_copy") {
      const ley = M(LEY_AUTOR_EN, "the applicable copyright law");
      return "The reported content reproduces and uses, without authorization, works protected by " + nombre + "'s copyright (logos, images and materials). It violates LinkedIn's Copyright Policy. Under " + ley + " and the Berne Convention, we request its immediate removal.";
    }
    if (cat === "difam") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal law on crimes against honor (slander, libel and defamation)");
      return "We request the immediate removal of this post because it uses the name, trademark and/or image of " + nombre + " without authorization to spread false and defamatory information, impersonating the entity and misleading users. This content damages " + nombre + "'s reputation, confuses its customers and may facilitate fraud against them.\n\nThe post violates " + (POL_EN[red] || "the platform's policies") + ", in particular its rules on impersonation, false and misleading information, and harassment and bullying.\n\nFurthermore, these acts constitute crimes against honor (slander, libel and defamation) under " + ley + inc + ". We request its immediate removal.";
    }
    if (cat === "autor") {
      const ley = M(LEY_AUTOR_EN, "the applicable copyright law");
      return "The reported content reproduces and uses, without authorization, works protected by " + nombre + "'s copyright (logos, images, name and brand identity), impersonating the entity. It infringes " + nombre + "'s copyright and the platform's intellectual property policies. Under " + ley + " and the Berne Convention, we request its immediate removal.";
    }
    if (cat === "fals") {
      const ley = M(LEY_MARCA_EN, "the applicable industrial property and trademark law");
      return "The reported content or channel impersonates " + nombre + " and promotes counterfeit and fraudulent products or services using its trademark, logo and identity without authorization, to the detriment of consumers. It constitutes trademark counterfeiting and infringes " + nombre + "'s rights. Under " + ley + " and the Paris Convention, we request its immediate removal.";
    }
    if (cat === "telegram") {
      const ley = M(LEY_MARCA_EN, "the applicable industrial property and trademark law");
      return "The reported channel, group or user uses the name, trademark and identity of " + nombre + " without authorization to impersonate the entity, spread false information and promote fraud or scams against its customers. This violates Telegram's Terms of Service (which prohibit impersonation, spam and scams) and infringes " + nombre + "'s trademark rights under " + ley + " and the Paris Convention. We request the immediate removal of the content and of the infringing channel or user.";
    }
    const ley = M(LEY_MARCA_EN, "the applicable industrial property and trademark law");
    return "The reported content uses the " + nombre + " trademark (name, logo and distinctive signs) without authorization to impersonate the entity and mislead users, with a risk of confusion and damage to its reputation. It infringes " + nombre + "'s trademark rights and the platform's intellectual property policies. Under " + ley + " and the Paris Convention, we request its immediate removal.";
  }

  function justificacion(cat, red, nombre, pais, lang) {
    return (lang === "en") ? justifEN(cat, red, nombre, pais) : justifES(cat, red, nombre, pais);
  }

  // Ley penal (delitos contra el honor) del país indicado, ES o EN. Se usa para
  // citar la ley por difamación en los correos. Si no hay país conocido, cae en
  // una fórmula genérica ("legislación penal aplicable...").
  function leyPenal(pais, lang) {
    const pn = norm(pais);
    const mapa = (lang === "en") ? LEY_PENAL_EN : LEY_PENAL;
    return mapa[pn] || ((lang === "en")
      ? "the applicable criminal law on crimes against honor (slander, libel and defamation)"
      : "la legislación penal aplicable sobre delitos contra el honor (calumnia, injuria y difamación)");
  }

  // Devuelve la URL de la base de datos de marcas para el país indicado (campo TM_URL de
  // Facebook/Instagram Marca Registrada). Si el país no está en el mapa o viene vacío,
  // cae en la OMPI (Global Brand Database).
  function baseMarcasDe(pais) {
    var k = norm(pais);
    return (k && BASE_MARCAS[k]) ? BASE_MARCAS[k] : OMPI_BASE_MARCAS;
  }

  // Agrega la línea de política infringida según la clave de formulario (es/en).
  function conPolitica(texto, formKey, lang) {
    const p = POLITICAS[formKey];
    if (!p) return texto;
    const etq = (lang === "en") ? "Infringed policy: " : "Política infringida: ";
    return texto + "\n\n" + etq + p[0] + " — " + p[1];
  }

  window.JUSTIF = {
    norm: norm, POSTAL: POSTAL, CODIGO: CODIGO, POLITICAS: POLITICAS,
    // BASE_MARCAS: URL de la base de datos pública de marcas por país; baseMarcasDe: getter
    // con fallback a la OMPI (Global Brand Database). Se usan para el campo TM_URL del
    // formulario de Marca Registrada de Facebook/Instagram.
    BASE_MARCAS: BASE_MARCAS, baseMarcasDe: baseMarcasDe,
    justificacion: justificacion, conPolitica: conPolitica, leyPenal: leyPenal
  };
})();
