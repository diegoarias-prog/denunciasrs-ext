// ============================================================================
//  Datos base de cada MARCA (entradas que el resto se deriva solo).
//  El usuario puede editar/agregar marcas desde la página de Opciones; lo que
//  edite se guarda en chrome.storage y tiene prioridad sobre esta base.
//  Campos por marca: pais, correo, sitio (opcional), play (URL oficial en Google
//  Play Store, opcional), appstore (URL oficial en Apple App Store, opcional) y
//  dominio (dominio legítimo de la marca, ej. credix.com, opcional) y telefono
//  (número de contacto SIN código de país; el código se deriva del país, opcional) y
//  registro (N.º de registro de la marca comercial, p. ej. para Facebook/Instagram
//  Marca registrada, opcional) y tiktok (URL del perfil oficial de la marca en TikTok,
//  ej. https://www.tiktok.com/@credix; opcional; se usa para autollenar el "Origen de la
//  obra con copyright" de TikTok, es decir las dos URLs de "Mi cuenta de TikTok personal").
//  Además, 5 campos con la URL del perfil OFICIAL de la marca en cada red (todos opcionales;
//  se usan para autollenar la "URL/web del titular" en el formulario de esa misma red, con
//  fallback a 'sitio' si están vacíos): facebook (perfil oficial en Facebook), instagram
//  (perfil oficial en Instagram), x (perfil oficial en X/Twitter), youtube (canal oficial
//  en YouTube) y linkedin (página oficial en LinkedIn).
//  tmurl = enlace directo a la base de datos de marcas para el campo TM_URL de
//  Facebook/Instagram Marca Registrada; si está vacío se usa la base por país
//  (baseMarcasDe). Es OPCIONAL y editable desde el panel de Marcas.
//  El código postal y el código telefónico se derivan del país (ver justificaciones.js).
// ============================================================================
window.MARCAS_BASE = {
  "Banco de Guatemala":          { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=bg.apps.banguapp", appstore: "https://apps.apple.com/us/app/banguapp/id1481911264", dominio: "", telefono: "2429 6000", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banco%20de%20Guatemala" },
  "Banco Industrial Guatemala":  { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BancoIndustrial/", play: "https://play.google.com/store/apps/details?id=gt.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id510761055", dominio: "", telefono: "2420 3000", tiktok: "", facebook: "https://www.facebook.com/BancoIndustrial/", instagram: "https://www.instagram.com/bancoindustrial/", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banco%20Industrial%20Guatemala" },
  "Banco Industrial El Salvador":{ pais: "El Salvador", correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=sv.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id1019352077", dominio: "", telefono: "2213 1717", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banco%20Industrial" },
  "Seguros El Roble":            { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.mediprocesos.roblered&hl=es_419", appstore: "https://apps.apple.com/gt/app/roblered/id1090511544", dominio: "", telefono: "2420 3333", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Seguros%20El%20Roble" },
  "Bi Bank":                     { pais: "Panamá",      correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BiBankPanama/", play: "https://play.google.com/store/apps/details?id=pa.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id1084721017", dominio: "", telefono: "308 0800", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Bi%20Bank" },
  "Banco Promerica Honduras":    { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.soteica.pmmovil.app", appstore: "https://apps.apple.com/app/id1550489214", dominio: "", telefono: "2280 8080", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Promerica" },
  "Banpais":                     { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=hn.com.bi.banpais&hl=es_hn", appstore: "https://apps.apple.com/cr/app/banpa%C3%ADs/id1019342453", dominio: "", telefono: "2545 1212", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banpais" },
  "Produbanco Grupo Promerica":  { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.produbanco", appstore: "https://apps.apple.com/app/id957153659", dominio: "", telefono: "1700 123 123", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/PRODUBANCO" },
  "Banpro Grupo Promerica":      { pais: "Nicaragua",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.banprogrupopromerica.ni.bancadigital.prod", appstore: "https://apps.apple.com/app/id1548537395", dominio: "", telefono: "2255 9595", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banpro" },
  "BANCO PICHINCHA":             { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "https://www.facebook.com/BancoPichinchaEcuador/", play: "https://play.google.com/store/apps/details?id=com.yellowpepper.pichincha&hl=es_419", appstore: "https://apps.apple.com/cr/app/pichincha-banca-movil/id999191728", dominio: "", telefono: "22999999", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/BANCO%20PICHINCHA" },
  "DEUNA":                       { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "", play: "https://play.google.com/store/apps/details?id=com.appdeuna.wallet", appstore: "https://apps.apple.com/app/id1490185584", dominio: "", telefono: "22999999", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/DEUNA" },
  "Diners Club":                 { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.blu.de.diners.club", appstore: "https://apps.apple.com/app/id6744373951", dominio: "", telefono: "22984400", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/DINERS%20CLUB" },
  "Banco Solidario":             { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.solidariosa.banking", appstore: "https://apps.apple.com/app/id1162832934", dominio: "", telefono: "1700 765 432", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/BANCO%20SOLIDARIO" },
  "Credix":                      { pais: "Costa Rica",  correo: "protecciondemarca@credix.com",    sitio: "", play: "https://play.google.com/store/apps/details?id=com.Mobtion.Credix.Credixcel", appstore: "https://apps.apple.com/app/id505208283", dominio: "credix.com", telefono: "2227 3349", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Credix" },
  "Zigi":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=gt.com.bi.zigi&hl=es_gt", appstore: "https://apps.apple.com/gt/app/zigi-cr%C3%A9ditos-sin-drama/id6450487993", dominio: "", telefono: "2215 6002", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Zigi" },
  "FRCL":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "", telefono: "2420 3248", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/FRCL" },
  "Alerta Medica":               { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.doctoronline.alertamedica", appstore: "https://apps.apple.com/app/id6461566805", dominio: "", telefono: "2493 1818", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Alerta%20Medica" },
  "Grupo Hospitalario La Paz":   { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=lapaz.app.starter", appstore: "", dominio: "", telefono: "2217 0300", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Grupo%20Hospitalario%20La%20Paz" },
  "Banco GyT Continental":       { pais: "Guatemala",   correo: "protecciondemarca@gtc.com.gt",   sitio: "", play: "https://play.google.com/store/apps/details?id=com.bancacel.bancacelweb2", appstore: "https://apps.apple.com/app/id571668292", dominio: "", telefono: "2338 6868", tiktok: "", facebook: "", instagram: "", x: "", youtube: "", linkedin: "", registro: "", tmurl: "https://branddb.wipo.int/en/quicksearch/brand/Banco%20GyT%20Continental" }
};

// Correo de la persona: cuando una marca usa este correo, en LinkedIn Derechos de
// autor el Nombre/Apellidos/Firma van como "Diego"/"Arias" (ver formularios.js).
window.CORREO_PERSONA = "diegoarias@seguridadmaxima.net";

// ============================================================================
//  QUIÉN ES LA PERSONA DETRÁS DE CADA CORREO
//  Hay formularios que piden el nombre de la PERSONA que denuncia, no el de la
//  marca: "Your full name" y "Digital signature" de Cloudflare, por ejemplo. Si
//  ahí se pone la marca, la denuncia queda firmada por quien no es.
//  Como una marca puede tener VARIOS correos de remitente (⚙ Marcas), el nombre
//  se busca por el CORREO elegido, no por la marca.
//  Para agregar a alguien: una línea más, con el correo en minúsculas.
//  Si un correo no está aquí, el nombre se deduce de la parte de antes de la @
//  (diego.arias@ / diego_arias@ / diego-arias@ -> "Diego Arias").
// ============================================================================
window.PERSONAS_POR_CORREO = {
  "diegoarias@seguridadmaxima.net":     { nom: "Diego", ape: "Arias" },
  "darias@securesoft-antifraude.com":   { nom: "Diego", ape: "Arias" }
};
