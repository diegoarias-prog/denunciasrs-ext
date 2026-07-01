// ============================================================================
//  Configuración del envío directo por la API de Gmail (OAuth).
//  - client_id: ID de cliente OAuth (aplicación web) del proyecto de Google Cloud.
//    NO es secreto: es público y puede ir versionado en la extensión.
//  - dominios: cuentas de Google Workspace propias desde las que se puede ENVIAR
//    directamente (un clic). Si el remitente de un reporte pertenece a uno de estos
//    dominios, se muestra el botón "Enviar ahora".
//  El permiso solicitado es SOLO envío (gmail.send): la extensión no puede leer correo.
// ============================================================================
window.CONFIG_GMAIL = {
  client_id: "656838260592-l95p0iptdv8na3lf5teti0l4ebnuoueg.apps.googleusercontent.com",
  dominios: ["seguridadmaxima.net", "securesoft-antifraude.com"]
};
