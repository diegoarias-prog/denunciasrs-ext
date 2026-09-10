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
    fb_supl:      ["Normas Comunitarias de Meta — Integridad de la cuenta (suplantación de identidad)", "https://transparency.meta.com/es-la/policies/community-standards/account-integrity/"],
    ig_supl:      ["Normas Comunitarias de Instagram — suplantación de identidad", "https://help.instagram.com/477434105621119 | https://transparency.meta.com/es-la/policies/community-standards/account-integrity/"],
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
    yt_marca:     ["Política de marcas registradas de YouTube", "https://support.google.com/youtube/answer/6154218"],
    go_ads:       ["Políticas de publicidad de Google — Tergiversación (estafas y phishing)", "https://support.google.com/adspolicy/answer/6020955"]
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
    // Publicidad maliciosa (Google Ads): anuncio fraudulento que suplanta a la marca.
    if (cat === "malic") {
      const ley = M(LEY_MARCA, "la legislación de propiedad industrial y marcas aplicable");
      return "El anuncio reportado suplanta a " + nombre + ": utiliza sin autorización su nombre, logotipo e identidad de marca y dirige a un sitio fraudulento que imita al oficial para engañar a los usuarios y obtener sus credenciales y datos financieros (phishing). Es un anuncio engañoso y fraudulento que infringe las Políticas de publicidad de Google sobre tergiversación, prácticas comerciales engañosas y phishing, y vulnera los derechos de marca de " + nombre + " conforme a " + ley + en + " y al Convenio de París. Solicitamos la retirada inmediata del anuncio y la suspensión del anunciante.";
    }
    // Suplantación de identidad en Facebook/Instagram: la denuncia la firma un
    // representante de la marca, así que el texto habla de la ENTIDAD suplantada.
    if (cat === "supl") {
      const ley = M(LEY_PENAL, "la legislación penal aplicable sobre usurpación de identidad y delitos contra el honor");
      return "La cuenta denunciada suplanta la identidad de " + nombre + ": utiliza sin autorización su nombre, su logotipo y su imagen de marca para hacerse pasar por la entidad oficial, engañar a sus clientes y facilitar fraudes en su perjuicio. Infringe " + (POL[red] || "las Normas Comunitarias de Meta") + ", en particular sus normas sobre suplantación de identidad y cuentas falsas, que prohíben crear cuentas que se hagan pasar por una empresa o una marca. Además, los hechos constituyen usurpación de identidad y delitos contra el honor conforme a lo dispuesto en " + ley + ". Solicitamos la suspensión inmediata de la cuenta y la eliminación del contenido.";
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
    if (cat === "supl") {
      const ley = M(LEY_PENAL_EN, "the applicable criminal law on identity theft and crimes against honor");
      return "The reported account impersonates " + nombre + ": it uses its name, logo and brand image without authorization to pose as the official entity, deceive its customers and facilitate fraud against them. It violates " + (POL_EN[red] || "Meta's Community Standards") + ", in particular its rules on impersonation and fake accounts, which prohibit creating accounts that pose as a business or a brand. Furthermore, these acts constitute identity theft and crimes against honor under " + ley + ". We request the immediate suspension of the account and the removal of the content.";
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

  // ==========================================================================
  //  PERFIL OFICIAL DE LA MARCA EN LA RED QUE SE ESTÁ DENUNCIANDO (obligatorio)
  //  Regla del proyecto: TODA descripción de denuncia (formulario o correo) debe
  //  decir cuál es el perfil AUTÉNTICO de la marca en esa MISMA red, para que la
  //  plataforma pueda comparar la cuenta denunciada con la oficial. Ej.: si se
  //  denuncia en TikTok va el TikTok oficial de la marca; si es Instagram, su
  //  Instagram oficial. Si la marca todavía no tiene guardado el perfil de esa
  //  red (⚙ Marcas), se cita como referencia su sitio web oficial.
  // ==========================================================================
  // Red -> campo de la marca donde vive su perfil oficial. Se aceptan tanto el
  // nombre visible del formulario ("Facebook", "X / Twitter") como el código corto
  // que usan las justificaciones (fb/ig/tk).
  const RED_A_CAMPO = {
    facebook: "facebook", fb: "facebook",
    instagram: "instagram", ig: "instagram",
    tiktok: "tiktok", tk: "tiktok",
    x: "x", twitter: "x", "x / twitter": "x", "x (twitter)": "x",
    youtube: "youtube", yt: "youtube",
    linkedin: "linkedin", li: "linkedin"
  };
  const NOMBRE_DE_RED = { fb: "Facebook", ig: "Instagram", tk: "TikTok", x: "X",
    yt: "YouTube", li: "LinkedIn", twitter: "X" };

  // Nombre presentable de la red ("tk" -> "TikTok"); si ya viene el nombre largo
  // ("Facebook", "WhatsApp"), se devuelve tal cual.
  function nombreDeRed(red) {
    const k = norm(red);
    return NOMBRE_DE_RED[k] || (red || "").toString().trim();
  }

  // Devuelve {url, esPerfil} con el perfil oficial de la marca en esa red, o el
  // sitio web oficial si esa red no tiene perfil guardado. null si no hay ninguno.
  function perfilOficialDe(datos, red) {
    const campo = RED_A_CAMPO[norm(red)];
    const perfil = (campo && datos && datos[campo]) ? String(datos[campo]).trim() : "";
    if (perfil) return { url: perfil, esPerfil: true };
    const sitio = (datos && datos.sitio) ? String(datos.sitio).trim() : "";
    return sitio ? { url: sitio, esPerfil: false } : null;
  }

  // Agrega al final del texto la línea del perfil oficial (es/en). Si la marca no
  // tiene ni perfil de esa red ni sitio web, devuelve el texto sin tocar.
  function conPerfilOficial(texto, red, marcaNombre, datos, lang) {
    const p = perfilOficialDe(datos, red);
    if (!p) return texto;
    const r = nombreDeRed(red);
    if (lang === "en") {
      return texto + "\n\n" + (p.esPerfil
        ? "Official " + r + " profile of " + marcaNombre + ": " + p.url +
          " — this is the ONLY authentic " + r + " account of " + marcaNombre +
          "; the reported content has no relationship with it."
        : "Official website of " + marcaNombre + ": " + p.url +
          " — it is its only official channel; the reported content is not authorized by the brand.");
    }
    return texto + "\n\n" + (p.esPerfil
      ? "Perfil oficial de " + marcaNombre + " en " + r + ": " + p.url +
        " — es la ÚNICA cuenta auténtica de " + marcaNombre + " en " + r +
        "; el contenido denunciado no tiene ninguna relación con ella."
      : "Sitio web oficial de " + marcaNombre + ": " + p.url +
        " — el contenido denunciado no tiene ninguna relación con él.");
  }

  // Agrega la línea de política infringida según la clave de formulario (es/en).
  function conPolitica(texto, formKey, lang) {
    const p = POLITICAS[formKey];
    if (!p) return texto;
    const etq = (lang === "en") ? "Infringed policy: " : "Política infringida: ";
    return texto + "\n\n" + etq + p[0] + " — " + p[1];
  }

  // ==========================================================================
  //  PERFIL MALICIOSO QUE USURPA UNA MARCA (plantilla del usuario)
  //  --------------------------------------------------------------------
  //  Cuando lo denunciado NO es una publicación suelta sino una CUENTA que se
  //  hace pasar por la marca (categorías marca, supl, fals, x_supl, x_falsif y
  //  li_marca), la descripción usa la plantilla larga del usuario: 7 párrafos
  //  con los datos registrales de la marca, las TRES políticas de la red que se
  //  denuncia (con su enlace, regla del proyecto), el perfil oficial y la
  //  declaración bajo pena de perjurio.
  //
  //  REGLA DE ORO CON LOS DATOS QUE FALTAN: si a la marca le falta el N.º de
  //  registro, la jurisdicción, el perfil de esa red o el sitio web, la frase se
  //  REESCRIBE sin ese dato o se omite entera. NUNCA se inventa un número y
  //  NUNCA queda un corchete «[NÚMERO]» a la vista de la plataforma. Lo que
  //  faltó se devuelve en `faltan` para que el popup pueda avisar al usuario.
  // ==========================================================================

  // Clase de bienes y servicios por defecto. Es EL MISMO valor que usa
  // formularios.js (CLASE_BIENES_DEFECTO): si se cambia allí, cambiarlo aquí.
  const CLASE_BIENES_DEFECTO_JUSTIF = "Negocios financieros, bancarios, de crédito. Negocios Monetarios.";

  // Qué prohíbe cada tipo de política. El texto es el de la plantilla del
  // usuario. En español se usa la fórmula «donde se ...» porque el verbo tiene
  // que concordar con lo prohibido y no con el nombre de la política (que unas
  // veces es singular -«Política de...»- y otras plural -«Normas de...»-).
  const PROHIBE_ES = {
    pi:   "prohíbe el uso no autorizado de la marca de un tercero de manera que pueda causar confusión sobre el origen o la procedencia de los bienes o servicios",
    supl: "prohíben las cuentas que suplantan a otra persona o entidad para engañar a los usuarios",
    tos:  "prohíbe publicar contenido que infrinja los derechos de propiedad intelectual de un tercero"
  };
  // En inglés se conserva la redacción literal del usuario ("which prohibits" /
  // "which prohibit"); el singular/plural lo decide el campo `pl` de cada ficha.
  const PROHIBE_EN = {
    pi:   "the unauthorized use of another party's trademark in a manner likely to cause confusion about the source or origin of goods or services",
    supl: "accounts that impersonate another person or entity in order to mislead users",
    tos:  "posting content that infringes a third party's intellectual property rights"
  };

  // Las TRES políticas de cada red: propiedad intelectual / marcas, suplantación
  // o autenticidad, y condiciones del servicio. Los enlaces son los mismos que
  // ya están verificados en datos/politicas_generales.js y en POLITICAS.
  // `pl` = el nombre de la política es plural (para "which prohibit" en inglés).
  const POLITICAS_DE_PERFIL = {
    tiktok: [
      { tipo: "pi",   pl: false, es: "la Política de Propiedad Intelectual de TikTok", en: "TikTok's Intellectual Property Policy", url: "https://www.tiktok.com/legal/page/global/copyright-policy/es" },
      { tipo: "supl", pl: true,  es: "las Normas de la Comunidad de TikTok sobre integridad y autenticidad", en: "TikTok's Community Guidelines on Integrity and Authenticity", url: "https://www.tiktok.com/community-guidelines/es" },
      { tipo: "tos",  pl: true,  es: "los Términos de Servicio de TikTok", en: "TikTok's Terms of Service", url: "https://www.tiktok.com/legal/page/row/terms-of-service/es" }
    ],
    facebook: [
      { tipo: "pi",   pl: true,  es: "las Políticas de propiedad intelectual de Facebook", en: "Facebook's Intellectual Property Policies", url: "https://www.facebook.com/help/1020633957973118" },
      { tipo: "supl", pl: true,  es: "las Normas Comunitarias de Meta sobre integridad de la cuenta y suplantación de identidad", en: "Meta's Community Standards on Account Integrity and Impersonation", url: "https://transparency.meta.com/es-la/policies/community-standards/account-integrity/" },
      { tipo: "tos",  pl: true,  es: "las Condiciones del Servicio de Facebook", en: "Facebook's Terms of Service", url: "https://www.facebook.com/legal/terms" }
    ],
    instagram: [
      { tipo: "pi",   pl: true,  es: "las Políticas de propiedad intelectual de Instagram", en: "Instagram's Intellectual Property Policies", url: "https://help.instagram.com/535503073130320" },
      { tipo: "supl", pl: true,  es: "las Normas Comunitarias de Instagram sobre suplantación de identidad", en: "Instagram's Community Guidelines on Impersonation", url: "https://help.instagram.com/477434105621119" },
      { tipo: "tos",  pl: true,  es: "las Condiciones de Uso de Instagram", en: "Instagram's Terms of Use", url: "https://help.instagram.com/581066165581870" }
    ],
    whatsapp: [
      { tipo: "pi",   pl: false, es: "la Política de Propiedad Intelectual de WhatsApp", en: "WhatsApp's Intellectual Property Policy", url: "https://www.whatsapp.com/legal/intellectual-property-policy" },
      { tipo: "supl", pl: false, es: "la Política Comercial de WhatsApp", en: "WhatsApp's Commerce Policy", url: "https://www.whatsapp.com/legal/commerce-policy" },
      { tipo: "tos",  pl: true,  es: "las Condiciones del Servicio de WhatsApp", en: "WhatsApp's Terms of Service", url: "https://www.whatsapp.com/legal/terms-of-service" }
    ],
    x: [
      { tipo: "pi",   pl: false, es: "la Política de falsificaciones y marcas registradas de X", en: "X's Counterfeit Goods and Trademark Policy", url: "https://help.x.com/es/rules-and-policies/counterfeit-goods-policy" },
      { tipo: "supl", pl: false, es: "la Política de suplantación de identidad de X", en: "X's Impersonation Policy", url: "https://help.x.com/es/rules-and-policies/x-impersonation-policy" },
      { tipo: "tos",  pl: true,  es: "las Condiciones del Servicio de X", en: "X's Terms of Service", url: "https://x.com/es/tos" }
    ],
    youtube: [
      { tipo: "pi",   pl: false, es: "la Política de marcas registradas de YouTube", en: "YouTube's Trademark Policy", url: "https://support.google.com/youtube/answer/6154218" },
      { tipo: "supl", pl: false, es: "la Política de suplantación de identidad de YouTube", en: "YouTube's Impersonation Policy", url: "https://support.google.com/youtube/answer/2801947" },
      { tipo: "tos",  pl: true,  es: "las Condiciones del Servicio de YouTube", en: "YouTube's Terms of Service", url: "https://www.youtube.com/static?template=terms&hl=es" }
    ],
    linkedin: [
      { tipo: "pi",   pl: true,  es: "las Políticas de propiedad intelectual de LinkedIn", en: "LinkedIn's Intellectual Property Policies", url: "https://www.linkedin.com/legal/copyright-policy" },
      { tipo: "supl", pl: true,  es: "las Políticas de la Comunidad Profesional de LinkedIn sobre autenticidad y suplantación de identidad", en: "LinkedIn's Professional Community Policies on Authenticity and Impersonation", url: "https://www.linkedin.com/legal/professional-community-policies" },
      { tipo: "tos",  pl: false, es: "el Contrato de Usuario de LinkedIn", en: "LinkedIn's User Agreement", url: "https://www.linkedin.com/legal/user-agreement" }
    ]
  };

  // Respaldo para redes que NO están en la tabla (plataformas que crea el propio
  // usuario). No se inventa ninguna URL: se citan las políticas de forma
  // genérica y se cierra con el Convenio de París, que SÍ lleva enlace, para que
  // el bloque nunca se quede sin una referencia verificable.
  const POLITICAS_DE_PERFIL_GENERICAS = [
    { tipo: "pi",   pl: true, es: "las políticas de propiedad intelectual y de marcas registradas de la plataforma", en: "the platform's intellectual property and trademark policies", url: "" },
    { tipo: "supl", pl: true, es: "las normas de autenticidad y de suplantación de identidad de la plataforma", en: "the platform's authenticity and impersonation rules", url: "" },
    { tipo: "tos",  pl: true, es: "las condiciones del servicio de la plataforma", en: "the platform's terms of service", url: "" }
  ];
  const CONVENIO_PARIS = "https://www.wipo.int/treaties/es/ip/paris/";

  // Devuelve las tres fichas de política de esa red, o null si la red no está en
  // la tabla (entonces se usa el respaldo genérico).
  function politicasDePerfilDe(red) {
    const k = norm(nombreDeRed(red));
    return POLITICAS_DE_PERFIL[k] || null;
  }

  // Categorías en las que lo denunciado es un PERFIL que usurpa la marca. Son
  // las únicas que usan esta plantilla; derechos de autor y difamación siguen
  // con su texto de siempre.
  //  "ip" son los reportes POR CORREO de propiedad intelectual (Facebook, Instagram,
  //  WhatsApp y TikTok): es la MISMA denuncia de marca, pero por correo, asi que lleva
  //  la misma plantilla.
  const CATS_PERFIL_MALICIOSO = ["marca", "supl", "fals", "x_supl", "x_falsif", "li_marca", "ip"];
  function esCategoriaDePerfilMalicioso(cat) {
    return CATS_PERFIL_MALICIOSO.indexOf(String(cat || "").trim()) >= 0;
  }

  // DE QUE ESTA HECHA LA CUENTA EN CADA RED. La plantilla afirma, bajo pena de perjurio,
  // DONDE aparece la marca usurpada; no vale decir "avatar y biografia" en un servicio que
  // no tiene ni lo uno ni lo otro. WhatsApp es el caso claro: alli lo denunciado es un
  // NUMERO con nombre de perfil, foto y descripcion, y no hay "publicaciones ni videos".
  const PARTES_DE_LA_CUENTA = {
    whatsapp: {
      es: { donde: "en el nombre del perfil, la foto de perfil y la descripción de la cuenta",
            cierre: "el nombre del perfil, la foto de perfil y la descripción",
            piezas: "los mensajes o difusiones concretos" },
      en: { donde: "in its profile name, profile photo, and business description",
            cierre: "the profile name, profile photo, and description",
            piezas: "the individual messages or broadcasts" }
    }
  };
  const PARTES_POR_DEFECTO = {
    es: { donde: "en su nombre de usuario, su nombre visible, su foto de perfil y su biografía",
          cierre: "el nombre de usuario, el nombre visible, el avatar y la biografía",
          piezas: "las publicaciones o vídeos individuales" },
    en: { donde: "in its username, display name, profile photo, and bio",
          cierre: "the username, display name, avatar, and bio",
          piezas: "the individual posts or videos" }
  };
  function partesDeLaCuenta(red, lang) {
    const k = norm(nombreDeRed(red));
    const ficha = PARTES_DE_LA_CUENTA[k];
    return (ficha && ficha[lang === "en" ? "en" : "es"]) || PARTES_POR_DEFECTO[lang === "en" ? "en" : "es"];
  }

  function limpioJ(v) { return (v == null) ? "" : String(v).trim(); }

  // ¿Son la MISMA direccion? Se compara con tolerancia (mayusculas, barra final, http
  // frente a https y el "www."), porque estos dos campos los escribe el usuario a mano en
  // ⚙ Marcas y la misma pagina aparece escrita de varias formas. Con `===` a secas,
  // "https://x.com/y" y "https://x.com/y/" pasarian por direcciones distintas.
  function mismaDireccion(a, b) {
    const pelar = (u) => String(u || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    const x = pelar(a), y = pelar(b);
    return !!x && x === y;
  }

  // Arma el bloque «Esto infringe:» / «This violates:» de la red indicada.
  function bloquePoliticas(red, lang) {
    const fichas = politicasDePerfilDe(red);
    const lista = fichas || POLITICAS_DE_PERFIL_GENERICAS;
    const lineas = lista.map(function (p, i) {
      const fin = (i === lista.length - 1 && fichas) ? "." : ";";
      const enlace = p.url ? (" (" + p.url + ")") : "";
      if (lang === "en") {
        return "— " + p.en + enlace + ", which prohibit" + (p.pl ? "" : "s") + " " + PROHIBE_EN[p.tipo] + fin;
      }
      return "— " + p.es + enlace + ", donde se " + PROHIBE_ES[p.tipo] + fin;
    });
    if (!fichas) {
      // Sin tabla para esta red: se cierra con el tratado, que sí lleva enlace.
      lineas.push(lang === "en"
        ? "— the Paris Convention for the Protection of Industrial Property, arts. 6bis and 10bis (" + CONVENIO_PARIS + "), which protect the well-known mark against unauthorized reproduction and against acts of unfair competition."
        : "— el Convenio de París para la Protección de la Propiedad Industrial, arts. 6bis y 10bis (" + CONVENIO_PARIS + "), donde se protege a la marca notoria frente a su reproducción no autorizada y frente a los actos de competencia desleal.");
    }
    return (lang === "en" ? "This violates:\n" : "Esto infringe:\n") + lineas.join("\n");
  }

  // ---------------------------------------------------------------------------
  //  justificacionPerfilMaliciosoDetallada(marcaNombre, datos, red, lang)
  //    -> { texto, faltan }
  //  `faltan` es un arreglo de { clave, etiqueta, aviso } con los datos de la
  //  marca que no estaban guardados; el texto ya viene reescrito sin ellos.
  // ---------------------------------------------------------------------------
  function justificacionPerfilMaliciosoDetallada(marcaNombre, datos, red, lang) {
    const d = datos || {};
    const M = limpioJ(marcaNombre) || (lang === "en" ? "the trademark owner" : "el titular de la marca");
    const R = nombreDeRed(red) || (lang === "en" ? "the platform" : "la plataforma");
    const registro = limpioJ(d.registro);
    const jurisdiccion = limpioJ(d.pais);
    const claseGuardada = limpioJ(d.clase_bienes);
    // La clase se incrusta EN MEDIO de la frase ("...para la(s) clase(s) X, en su nombre
    // de usuario..."), asi que se le quita el punto final si lo trae: si no, queda un
    // ".," en mitad de la denuncia.
    const clases = (claseGuardada || CLASE_BIENES_DEFECTO_JUSTIF).replace(/\s*\.\s*$/, "");
    const sitio = limpioJ(d.sitio);
    const p = perfilOficialDe(d, red);
    const perfil = (p && p.esPerfil) ? p.url : "";
    // De que esta hecha la cuenta en ESTA red (WhatsApp no tiene avatar ni biografia).
    const partes_ = partesDeLaCuenta(red, lang);
    const faltan = [];
    const anotar = function (clave, etiqueta, aviso) { faltan.push({ clave: clave, etiqueta: etiqueta, aviso: aviso }); };

    if (!registro) anotar("registro", "N.º de registro",
      "Falta el N.º de registro de «" + M + "» — agrégalo en ⚙ Marcas.");
    if (!jurisdiccion) anotar("pais", "País (jurisdicción del registro)",
      "Falta el país de «" + M + "» — agrégalo en ⚙ Marcas.");
    if (!claseGuardada) anotar("clase_bienes", "Clase de bienes y servicios",
      "«" + M + "» no tiene clase de bienes y servicios: se usó la clase por defecto. Ponla en ⚙ Marcas.");
    if (!perfil) anotar("perfil_" + norm(R), "Perfil oficial en " + R,
      "Falta el perfil oficial de «" + M + "» en " + R + " — agrégalo en ⚙ Marcas.");
    if (!sitio) anotar("sitio", "Sitio web oficial",
      "Falta el sitio web oficial de «" + M + "» — agrégalo en ⚙ Marcas.");

    const partes = [];
    if (lang === "en") {
      partes.push("The reported " + R + " account is not owned by, affiliated with, endorsed by, or authorized by " + M +
        ", and is being operated without any license or permission from the trademark owner.");

      // Párrafo registral. Se arma con los datos que HAY: si no hay número no se
      // menciona el número, y si no hay país no se menciona la jurisdicción.
      let reg = "The account reproduces our registered trademark " + M;
      if (registro) reg += ", registration no. " + registro;
      if (jurisdiccion) reg += ", registered in " + jurisdiccion;
      reg += (registro || jurisdiccion) ? ", in class(es) " : " in class(es) ";
      reg += clases + ", " + partes_.donde + ". It also reproduces our official logo as its avatar and copies the visual identity, tone, and content of our official channels.";
      partes.push(reg);

      partes.push("This use is not nominative, comparative, parodic, or critical. The account uses the mark to designate its own purported goods and services, creating a likelihood of confusion as to source, sponsorship, and affiliation. Users have contacted us believing this account to be an official " + M + " channel.");
      partes.push(bloquePoliticas(red, "en"));

      // Canales oficiales + evidencia. Cada frase solo si hay dato.
      const canales = [];
      if (perfil) canales.push("Our official and only authorized " + R + " account is " + perfil + ".");
      // Si el "sitio" es la MISMA direccion que el perfil, no se repite: quedaria el
      // mismo enlace dos veces seguidas y llamando "sitio web" a un perfil de la red.
      if (sitio && !mismaDireccion(sitio, perfil)) canales.push("Our official website is " + sitio + ".");
      canales.push("Evidence of registration is attached.");
      partes.push(canales.join(" "));

      partes.push("We request the removal of the account and all associated content at the account level, not only " + partes_.piezas + ", as the infringement is present in " + partes_.cierre + ".");
      partes.push("I confirm under penalty of perjury that the information in this notice is accurate and that I am authorized to act on behalf of the trademark owner.");
      return { texto: partes.join("\n\n"), faltan: faltan };
    }

    partes.push("La cuenta denunciada en " + R + " no pertenece a " + M + ", no está afiliada a " + M +
      ", no cuenta con su respaldo ni con su autorización, y se opera sin licencia ni permiso alguno del titular de la marca.");

    let reg = "La cuenta reproduce nuestra marca registrada " + M;
    if (registro) reg += ", registro n.º " + registro;
    if (jurisdiccion) reg += ", registrada en " + jurisdiccion;
    reg += (registro || jurisdiccion) ? ", para la(s) clase(s) " : " para la(s) clase(s) ";
    reg += clases + ", " + partes_.donde + ". También reproduce nuestro logotipo oficial como avatar y copia la identidad visual, el tono y el contenido de nuestros canales oficiales.";
    partes.push(reg);

    partes.push("Este uso no es nominativo, comparativo, paródico ni crítico. La cuenta utiliza la marca para designar sus propios supuestos bienes y servicios, generando riesgo de confusión en cuanto al origen, el patrocinio y la afiliación. Usuarios se han puesto en contacto con nosotros creyendo que esta cuenta es un canal oficial de " + M + ".");
    partes.push(bloquePoliticas(red, "es"));

    const canales = [];
    if (perfil) canales.push("Perfil oficial de " + M + " en " + R + ": " + perfil +
      " — es nuestra ÚNICA cuenta autorizada en " + R + ".");
    // Mismo motivo que en la version inglesa: nada de repetir el enlace.
    if (sitio && !mismaDireccion(sitio, perfil)) canales.push("Sitio web oficial de " + M + ": " + sitio + ".");
    canales.push("Se adjunta la evidencia del registro.");
    partes.push(canales.join(" "));

    partes.push("Solicitamos la eliminación de la cuenta y de todo el contenido asociado a NIVEL DE CUENTA, y no solo de " + partes_.piezas + ", ya que la infracción está presente en " + partes_.cierre + ".");
    partes.push("Declaro bajo pena de perjurio que la información contenida en esta notificación es exacta y que estoy autorizado para actuar en nombre del titular de la marca.");
    return { texto: partes.join("\n\n"), faltan: faltan };
  }

  // ---------------------------------------------------------------------------
  //  DESCRIPCION COMPLETA DE UNA DENUNCIA (la que va en la caja del formulario o
  //  en el cuerpo del correo). Es EL UNICO sitio donde se decide que texto toca,
  //  para que el popup y el menu del clic derecho no se separen nunca:
  //   - Si lo denunciado es un PERFIL que usurpa la marca (marca, supl, fals,
  //     x_supl, x_falsif, li_marca, ip) -> la plantilla larga, que YA trae dentro
  //     las tres politicas con su enlace y el perfil oficial. Por eso a esta NO se
  //     le aplican conPolitica ni conPerfilOficial: duplicarian informacion.
  //   - En cualquier otro caso (derechos de autor, difamacion...) -> el texto de
  //     siempre + politica infringida + perfil oficial, exactamente como hasta hoy.
  //  Devuelve {texto, faltan}; `faltan` solo trae algo en el primer caso.
  // ---------------------------------------------------------------------------
  function descripcionDeDenuncia(cat, formKey, redCode, marcaNombre, datos, red, lang) {
    if (esCategoriaDePerfilMalicioso(cat)) {
      return justificacionPerfilMaliciosoDetallada(marcaNombre, datos, red, lang);
    }
    const pais = (datos && datos.pais) ? datos.pais : "";
    const t = conPerfilOficial(
      conPolitica(justificacion(cat, redCode, marcaNombre, pais, lang), formKey, lang),
      red, marcaNombre, datos, lang);
    return { texto: t, faltan: [] };
  }

  // Igual que la anterior pero devolviendo SOLO el texto, para quien no necesite
  // avisar de los datos que faltan.
  function justificacionPerfilMalicioso(marcaNombre, datos, red, lang) {
    return justificacionPerfilMaliciosoDetallada(marcaNombre, datos, red, lang).texto;
  }

  window.JUSTIF = {
    norm: norm, POSTAL: POSTAL, CODIGO: CODIGO, POLITICAS: POLITICAS,
    // BASE_MARCAS: URL de la base de datos pública de marcas por país; baseMarcasDe: getter
    // con fallback a la OMPI (Global Brand Database). Se usan para el campo TM_URL del
    // formulario de Marca Registrada de Facebook/Instagram.
    BASE_MARCAS: BASE_MARCAS, baseMarcasDe: baseMarcasDe,
    justificacion: justificacion, conPolitica: conPolitica, leyPenal: leyPenal,
    // Perfil oficial de la marca en la red denunciada: perfilOficialDe devuelve
    // {url, esPerfil} y conPerfilOficial agrega la línea al final de la descripción.
    perfilOficialDe: perfilOficialDe, conPerfilOficial: conPerfilOficial,
    nombreDeRed: nombreDeRed,
    // PERFIL MALICIOSO que usurpa la marca (categorias marca, supl, fals, x_supl,
    // x_falsif y li_marca): plantilla larga del usuario, con las TRES politicas de
    // la red y su enlace. La version ...Detallada devuelve {texto, faltan}.
    justificacionPerfilMalicioso: justificacionPerfilMalicioso,
    justificacionPerfilMaliciosoDetallada: justificacionPerfilMaliciosoDetallada,
    // descripcionDeDenuncia: el UNICO sitio que decide que texto lleva cada denuncia.
    descripcionDeDenuncia: descripcionDeDenuncia,
    esCategoriaDePerfilMalicioso: esCategoriaDePerfilMalicioso,
    CATS_PERFIL_MALICIOSO: CATS_PERFIL_MALICIOSO,
    POLITICAS_DE_PERFIL: POLITICAS_DE_PERFIL,
    politicasDePerfilDe: politicasDePerfilDe
  };
})();
