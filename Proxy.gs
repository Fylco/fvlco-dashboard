/***********************************************************************
 * FVLco · PROXY DE DATOS AUTENTICADO
 * ---------------------------------------------------------------------
 * Lee los Google Sheets (que ahora son PRIVADOS) del lado del servidor
 * y solo entrega los datos si el navegador envía la clave correcta.
 *
 * La clave NUNCA vive en el dashboard (index.html). Vive aquí, en las
 * Propiedades del Script del servidor. Aunque alguien lea el código del
 * dashboard, no obtiene la clave ni puede leer los sheets.
 *
 * ── CÓMO DESPLEGAR ──────────────────────────────────────────────────
 * 1. Abre https://script.google.com  →  Nuevo proyecto.
 * 2. Pega este archivo como código (borra el Code.gs de ejemplo).
 * 3. Configuración del proyecto (⚙) → Propiedades del script →
 *      Agregar propiedad:   FVLCO_PASSWORD = <la clave que elijas>
 *    (usa una clave larga; se comparte con quien deba entrar).
 * 4. Implementar → Nueva implementación → tipo "Aplicación web":
 *      - Ejecutar como:       Yo  (la cuenta dueña de los sheets)
 *      - Quién tiene acceso:  Cualquier usuario
 *    Copia la URL que termina en /exec.
 * 5. Pega esa URL en index.html, en la constante API_URL_DEFAULT.
 * 6. En cada Google Sheet listado abajo: Compartir → quitar
 *    "cualquiera con el enlace" y quitar "Publicar en la web".
 *    (La cuenta que ejecuta este script debe seguir teniendo acceso.)
 *
 * Al cambiar la clave: edita FVLCO_PASSWORD en Propiedades del script.
 * NO necesitas volver a implementar por cambiar solo la clave.
 ***********************************************************************/

// IDs de los libros autorizados. El proxy SOLO sirve estos; así no se
// convierte en un relay abierto a cualquier sheet de la cuenta.
var ALLOWED_IDS = [
  '1o7bDszJpE4t0xL6AdKWhJ9MEanmz5n7xTQlKBDxVAE8', // Producción / No Conformes / Ventas ...
  '1vZTs6xImawkKwiWEPmFaY4y6LrVRKrMaAHKuCz0dy98', // BD Productos / Pedidos (forecast)
  '1FJO1LSIdNIfZhvAg4NVBJKG2Q90lenEB49xXMrWceI8', // Restricciones / Inventario MP
  '1P9-3iiJMyXQRqV22dL5TJ8n6L1lcgNM5WejOPMbHH6A', // Capacidad / PLANEACION
  '1sdoHXHcZ6_we0k1wPabGNFPGn9NTnCGQOV5qsZr6eOg'  // Histórico de capacidad
];

// Prueba de salud en el navegador: abrir la URL /exec muestra este texto,
// SIN entregar ningún dato. Sirve para confirmar que el deploy quedó bien.
function doGet() {
  return _out('FVLco proxy OK');
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkPassword(String(req.pw || ''))) return _out('__FVLCO_AUTH_FAIL__');

    if (req.action === 'login') return _out(JSON.stringify({ ok: true }));
    if (req.action === 'fetch') return _out(fetchSheetCsv(String(req.url || '')));
    return _out('__FVLCO_ERR__ accion desconocida');
  } catch (err) {
    return _out('__FVLCO_ERR__ ' + err.message);
  }
}

// Comparación en tiempo ~constante para no filtrar la longitud por timing.
function checkPassword(pw) {
  var real = PropertiesService.getScriptProperties().getProperty('FVLCO_PASSWORD');
  if (!real) return false;               // sin clave configurada → nadie entra
  if (pw.length !== real.length) return false;
  var diff = 0;
  for (var i = 0; i < real.length; i++) diff |= pw.charCodeAt(i) ^ real.charCodeAt(i);
  return diff === 0;
}

// Dada una URL de Google Sheets (export?format=csv o gviz/tq), extrae el
// ID + (gid o nombre de hoja), valida contra la whitelist, abre el libro
// COMO DUEÑO (por eso funciona aunque el sheet sea privado) y devuelve CSV.
function fetchSheetCsv(url) {
  // Rechaza el formato "publicado" /d/e/2PACX...  (no es un ID real)
  var mId = url.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]{20,})/);
  var id = mId ? mId[1] : '';
  if (!id || ALLOWED_IDS.indexOf(id) < 0) return '__FVLCO_ERR__ sheet no autorizado';

  var ss = SpreadsheetApp.openById(id);
  var sheet = null;

  var mGid = url.match(/[?&]gid=(\d+)/);
  if (mGid) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].getSheetId()) === mGid[1]) { sheet = all[i]; break; }
    }
  }
  if (!sheet) {
    var mName = url.match(/[?&]sheet=([^&]+)/);
    if (mName) {
      var name = decodeURIComponent(mName[1]).replace(/\+/g, ' ').trim();
      sheet = ss.getSheetByName(name) || ss.getSheetByName(name + ' ') || ss.getSheetByName(name.replace(/\s+$/, ''));
    }
  }
  // export?format=csv sin gid → primera hoja (igual que Google)
  if (!sheet) sheet = ss.getSheets()[0];
  if (!sheet) return '__FVLCO_ERR__ hoja no encontrada';

  // getDisplayValues conserva el formato visible (ej. "3.476.000", "85%",
  // fechas) igual que export?format=csv, para no romper los parseadores.
  return toCsv(sheet.getDataRange().getDisplayValues());
}

function toCsv(rows) {
  var out = [];
  for (var r = 0; r < rows.length; r++) {
    var cols = rows[r];
    var line = [];
    for (var c = 0; c < cols.length; c++) {
      var v = (cols[c] == null) ? '' : String(cols[c]);
      line.push(/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    }
    out.push(line.join(','));
  }
  return out.join('\r\n');
}

function _out(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
