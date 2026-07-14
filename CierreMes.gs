/**
 * CIERRE DE MES — FVLco
 * Copia la foto del mes desde PROGRAMACION 20XX hacia HISTORICO_CAPACIDAD.
 *
 * CÓMO PUBLICARLO (una sola vez):
 *  1. Abre script.google.com → Nuevo proyecto → pega este archivo completo.
 *  2. En ⚙ Configuración del proyecto → Propiedades del script, agrega:
 *       CLAVE_CIERRE = una clave secreta que tú inventes (ej. Fylco2026#cierre)
 *  3. Implementar → Nueva implementación → Aplicación web:
 *       Ejecutar como: TÚ · Acceso: Cualquier usuario
 *  4. Copia la URL /exec que te da y pásasela a Claude para conectar el botón.
 */

const CIERRE_CFG = {
  PROG_FILES: {
    2026: '1dYm44LKn6TQm2fWLY5ZG9_kI_GMGwWcTm7Wq_wDrKs8',
    2027: '1hFfhndWwoEoTdEjYoafYRveXFHpRgb_BB04SZGaX6Zk',
    2028: '1_mupUu7TEqC5HNEdhfO5bVSCCyXPyW_FJKnGdRZaNbQ',
  },
  HISTORICO_ID: '13jI4d9NhsDbHLj4nYV4NlAXToglTrC1wsC7AKGPFlFs',
  HISTORICO_HOJA: 'HISTORICO_CAPACIDAD', // se autodetecta si el nombre difiere
  MESES: ['','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
          'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'],
};

function doPost(e) {
  const out = { ok: false };
  try {
    const body  = JSON.parse(e.postData.contents || '{}');
    const clave = PropertiesService.getScriptProperties().getProperty('CLAVE_CIERRE');
    if (!clave || body.clave !== clave) { out.error = 'Clave incorrecta'; return _json(out); }

    const mes  = parseInt(body.mes), anio = parseInt(body.anio);
    const rows = body.filas; // filas ya calculadas por el dashboard
    if (!mes || !anio || !Array.isArray(rows) || !rows.length) { out.error = 'Datos incompletos'; return _json(out); }

    const ss   = SpreadsheetApp.openById(CIERRE_CFG.HISTORICO_ID);
    const hoja = ss.getSheetByName(CIERRE_CFG.HISTORICO_HOJA) || ss.getSheets()[0];
    const mesN = CIERRE_CFG.MESES[mes];

    // anti-duplicado: ¿ya existe este mes/año en el histórico?
    const datos = hoja.getDataRange().getValues();
    const yaExiste = datos.some(r => String(r[0]).trim().toUpperCase() === mesN &&
                                     String(r[1]).trim() == String(anio));
    if (yaExiste && !body.forzar) { out.error = 'YA_CERRADO'; out.detalle = mesN+' '+anio+' ya está en el histórico'; return _json(out); }

    // formato: MES|AÑO|PRODUCTO|CAVIDADES|CICLO|EFICIENCIA|UND_TURNO_8H|PROYECCION|TURNOS|DIAS|OPERARIOS|MAQUINA|HORAS_HOMBRE|TURNOS_DISP|DIAS_MES
    const nuevas = rows.map(f => [mesN, anio, f.producto, f.cav, f.ciclo, f.rend,
      f.undTurno, f.requerida, f.turnos, f.dias, f.operarios||'', f.maquina, f.hh||'', f.turnosDisp, f.diasMes]);
    hoja.getRange(hoja.getLastRow()+1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);

    out.ok = true; out.filas = nuevas.length; out.mes = mesN; out.anio = anio;
    out.cerradoEl = Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy HH:mm');
  } catch (err) { out.error = String(err); }
  return _json(out);
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
