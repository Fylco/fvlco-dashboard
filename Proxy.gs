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
var PROXY_VERSION = '4.0.0';

var ALLOWED_IDS = [
  '1o7bDszJpE4t0xL6AdKWhJ9MEanmz5n7xTQlKBDxVAE8', // Producción / No Conformes / Ventas ...
  '1vZTs6xImawkKwiWEPmFaY4y6LrVRKrMaAHKuCz0dy98', // BD Productos / Pedidos (forecast)
  '1FJO1LSIdNIfZhvAg4NVBJKG2Q90lenEB49xXMrWceI8', // Restricciones / Inventario MP
  '1P9-3iiJMyXQRqV22dL5TJ8n6L1lcgNM5WejOPMbHH6A', // RECURSOS (máquinas/personal)
  // PROGRAMACION 20XX — fuente única de Capacidad (turnos, costos maquila e histórico
  // salen todos de aquí; ya no se usa PLANEACION ni la hoja aparte de histórico)
  '1dYm44LKn6TQm2fWLY5ZG9_kI_GMGwWcTm7Wq_wDrKs8', // PROGRAMACION 2026
  '1hFfhndWwoEoTdEjYoafYRveXFHpRgb_BB04SZGaX6Zk', // PROGRAMACION 2027
  '1_mupUu7TEqC5HNEdhfO5bVSCCyXPyW_FJKnGdRZaNbQ'  // PROGRAMACION 2028
];

/* Prueba de salud. Abrir la URL /exec (o con curl) dice QUÉ VERSIÓN está
   desplegada y si el whitelist está completo. Antes esto devolvía el texto
   fijo 'FVLco proxy OK', idéntico en las tres versiones del archivo: no había
   forma de saber desde fuera qué código estaba arriba ni cuántos libros tenía
   autorizados, y un despliegue viejo podía pasar inadvertido.
   NO entrega datos: ni una celda, ni nombres de hoja. Solo los primeros 8
   caracteres de cada ID, que además son inútiles porque los libros son privados.
     curl "<URL /exec>"              -> version + cuántos IDs
     curl "<URL /exec>?health=full"  -> además, si cada libro ABRE de verdad */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var out = {
    ok: true,
    servicio: 'FVLco proxy',
    version: PROXY_VERSION,
    idsAutorizados: ALLOWED_IDS.length
  };
  if (p.health === 'full') {
    out.libros = ALLOWED_IDS.map(function (id) {
      var r = { id: id.slice(0, 8) + '…', abre: false };
      try { SpreadsheetApp.openById(id).getSheets().length; r.abre = true; }
      catch (err) { r.error = String(err.message || err).slice(0, 120); }
      return r;
    });
    out.librosQueAbren = out.libros.filter(function (l) { return l.abre; }).length;
  }
  return ContentService.createTextOutput(JSON.stringify(out, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkPassword(String(req.pw || ''))) return _out('__FVLCO_AUTH_FAIL__');

    if (req.action === 'login') return _out(JSON.stringify({ ok: true }));
    if (req.action === 'fetch') return _out(fetchSheetCsv(String(req.url || '')));
    if (req.action === 'gids')  return _out(listGids(String(req.id || '')));
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

  /* El NOMBRE manda sobre el gid.
     El gid es un número opaco: si alguien recrea o duplica una pestaña, deja de
     apuntar a la hoja viva. Eso pasó el 2026-09-03 con la hoja de producción y,
     como abajo había un "si no la encuentro, devuelvo la primera", el proxy
     entregó OTRA hoja como si fuera la pedida: el tablero mostró el día en
     ceros teniendo registros. El nombre es estable y es lo que ya usaba el
     backend, así que es la fuente de verdad. */
  var mName = url.match(/[?&]sheet=([^&]+)/);
  if (mName) {
    var name = decodeURIComponent(mName[1]).replace(/\+/g, ' ').trim();
    sheet = ss.getSheetByName(name) || ss.getSheetByName(name + ' ') || ss.getSheetByName(name.replace(/\s+$/, ''));
    if (!sheet) return '__FVLCO_ERR__ el libro ' + id.slice(0, 8) + '… no tiene ninguna hoja llamada "' + name + '"';
  }

  var mGid = url.match(/[?&]gid=(\d+)/);
  if (!sheet && mGid) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].getSheetId()) === mGid[1]) { sheet = all[i]; break; }
    }
    // Prohibido sustituir: si el gid no existe, es un ERROR, no otra hoja.
    if (!sheet) {
      return '__FVLCO_ERR__ el libro ' + id.slice(0, 8) + '… no tiene ninguna hoja con gid ' + mGid[1] +
             ' — el gid se desvió; pide la hoja por nombre (&sheet=NOMBRE)';
    }
  }

  // Sin gid ni nombre → primera hoja, igual que export?format=csv de Google.
  // Esto solo aplica cuando NO se pidió ninguna hoja en concreto.
  if (!sheet && !mGid && !mName) sheet = ss.getSheets()[0];
  if (!sheet) return '__FVLCO_ERR__ hoja no encontrada';

  // getDisplayValues conserva el formato visible (ej. "3.476.000", "85%",
  // fechas) igual que export?format=csv, para no romper los parseadores.
  return toCsv(sheet.getDataRange().getDisplayValues());
}

// Nombre de pestaña -> gid, para un libro de la whitelist. El dashboard lo
// necesita en PROGRAMACION 20XX (los meses son pestañas y su gid cambia cada
// año). Sin proxy eso sale de /htmlview, que este backend no puede servir
// porque no es una hoja: de ahí que exista esta acción aparte.
function listGids(id) {
  if (!id || ALLOWED_IDS.indexOf(id) < 0) return '__FVLCO_ERR__ sheet no autorizado';
  var sheets = SpreadsheetApp.openById(id).getSheets();
  var map = {};
  for (var i = 0; i < sheets.length; i++) {
    map[sheets[i].getName().trim().toUpperCase()] = String(sheets[i].getSheetId());
  }
  return JSON.stringify(map);
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
