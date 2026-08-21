// turnos.js — Canonicalización del código de turno (FVLco)
// Cargado por index.html vía <script src="turnos.js"> ANTES del <script> principal,
// y por turnos.test.js vía require() en Node. Lógica pura: opera sobre filas ya
// normalizadas por normalizeProd. Ver docs/superpowers/specs/2026-07-16-...
//
// PROBLEMA: el operario a veces mal-digita el turno entre códigos que se solapan.
// Un turno físico de 6am-6pm (12h) puede quedar como T1 y T4 mezclados; uno de
// 6pm-6am como T3 y T5. Como TODO el resto del código ya trata '4'/'5' como 12h,
// aquí reescribimos _turno de las filas de 12h a '4' (diurno) o '5' (nocturno),
// solo cuando ese código de 12h existe en el grupo (fecha, máquina). Así los
// slots ${fecha}|${maq}|${turno} colapsan y la producción se suma sola.
// El código original se preserva en _turnoRaw.

// Ventana física ('D'/'N') de una fila, dado si su grupo (fecha+máquina) tiene
// algún T4 (has4) o T5 (has5). Devuelve el código crudo si el turno es desconocido.
function windowForRow(row, has4, has5) {
  const t = String(row._turno || '');
  if (t === '1' || t === '4') return 'D';
  if (t === '3' || t === '5') return 'N';
  if (t === '2') {
    const ts = row._ts;
    if (ts != null) return new Date(ts).getHours() >= 18 ? 'N' : 'D';
    if (has4 && !has5) return 'D';
    if (has5 && !has4) return 'N';
    return 'D'; // default determinista cuando no hay señal
  }
  return t;
}

// Reescribe _turno a '4'/'5' para filas que pertenecen a un turno físico de 12h.
function canonicalizeTurnos(rows) {
  const groupKey = r => (r._fechaKey || r._diaTurno || '?') + '|' + (r._maq || '?');
  // 1er pase: detectar has4/has5 por grupo (usa el turno crudo)
  const groups = {};
  for (const r of rows) {
    const gk = groupKey(r);
    if (!groups[gk]) groups[gk] = { has4: false, has5: false };
    const t = String(r._turno || '');
    if (t === '4') groups[gk].has4 = true;
    if (t === '5') groups[gk].has5 = true;
  }
  // 2do pase: reescribir _turno (preservando _turnoRaw)
  for (const r of rows) {
    if (r._turnoRaw === undefined) r._turnoRaw = r._turno;
    const g = groups[groupKey(r)];
    const win = windowForRow(r, g.has4, g.has5);
    if (win === 'D' && g.has4) r._turno = '4';
    else if (win === 'N' && g.has5) r._turno = '5';
    // else: sin código de 12h en el grupo → _turno queda igual
  }
  return rows;
}

// Horas trabajadas de un conjunto de turnos YA canónicos de un día+máquina.
// Los códigos de turno tienen ventanas físicas que SE SOLAPAN, así que NO se
// pueden sumar sus duraciones (daría >24h). Se calcula la UNIÓN de las ventanas
// y se cuentan las horas cubiertas (tope 24). Ventanas (reloj 24h):
//   T1 6-14 · T2 14-22 · T3 22-6 · T4 6-18 (12h diurno) · T5 18-6 (12h nocturno)
// Ejemplos: T4+T2-noche = 6-22 = 16h (T2 extiende más allá de T4), pero T5+T3
// = 12h (T3 va DENTRO de T5, no suma). Antes se devolvía 12 en cuanto había un
// T4/T5 y se perdían las horas extra → "Unidades Programadas" y Rendimiento
// salían subvaluados (producción > programado, faltantes imposibles). Ver
// 2026-07-16 Máquina 1 (T4+T2-noche): 12h→16h, 79.754→106.338 programadas.
const _TURNO_WINDOWS = {
  '1': [[6, 14]],
  '2': [[14, 22]],
  '3': [[22, 24], [0, 6]],
  '4': [[6, 18]],
  '5': [[18, 24], [0, 6]],
};
function calcShiftHours(turnosSet) {
  const covered = new Array(24).fill(false);
  turnosSet.forEach(t => {
    (_TURNO_WINDOWS[String(t)] || []).forEach(([a, b]) => {
      for (let h = a; h < b; h++) covered[h] = true;
    });
  });
  return covered.reduce((s, c) => s + (c ? 1 : 0), 0);
}

// Segundos nominales de un turno: 12h (43200) para T4/T5, 8h (28800) para el
// resto. Fuente ÚNICA — antes esta tabla estaba duplicada en 6 lugares del
// dashboard (_TSEG, _TSEG2, _TSEG3, _TSEG_P, TURNO_SEG×2).
function turnoSeconds(turnoCode) {
  const t = String(turnoCode);
  return (t === '4' || t === '5') ? 43200 : 28800;
}

// Unidades teóricas producibles en un tiempo dado = round(tiempoSeg/ciclo × cav).
// Núcleo compartido de "Unidades Programadas" (con tiempo disponible del turno)
// y de la producción ideal del Rendimiento OEE (con run-time). Antes esta
// fórmula estaba copiada en 8 lugares; un error en una copia no llegaba a las
// otras → inconsistencias entre pestañas. El manejo de cav<=0 y los fallbacks
// (usar undProd, etc.) los decide cada llamador con sus propias guardas.
function unidadesTeoricas(tiempoSeg, cicloEst, cavTeor) {
  if (!(cicloEst > 0)) return 0;
  return Math.round((tiempoSeg / cicloEst) * cavTeor);
}

// ¿La razón de paro corresponde a un paro PROGRAMADO?
// Fuente ÚNICA de la clasificación: antes cada pestaña llevaba su propia copia
// de /programado/i (13 sitios en index.html) y ese regex también hacía match
// con "PARO NO PROGRAMADO" — el tablero descontaba esos paros del tiempo
// disponible como si hubieran sido planeados e inflaba la Disponibilidad
// (1.629 min en julio y agosto de 2026; ver informe de paros abr-ago 2026).
// Regla: la razón menciona "programado" y NO viene precedido de "no".
// Solo el paro NO programado descuenta Disponibilidad; el programado nunca fue
// tiempo de producción planeado. Ver docs de metodología OEE.
function esParoProgramado(razon) {
  const s = String(razon == null ? '' : razon);
  if (!/programad/i.test(s)) return false;
  return !/\bno\s*programad/i.test(s);
}

const _MESES_ES_NUM = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
// Arma "D/M/YYYY" desde las columnas DIA/MES/AÑO (selección directa del
// operario en el formulario), o '' si no son usables (blanco, #REF!, etc.)
function _diaMesAnoToFecha(row) {
  const dia = parseInt(row['DIA'], 10);
  const mesRaw = row['MES'];
  let mes = null;
  if (typeof mesRaw === 'number') mes = mesRaw;
  else if (typeof mesRaw === 'string') mes = _MESES_ES_NUM[mesRaw.trim().toLowerCase()] || (parseInt(mesRaw, 10) || null);
  const anio = parseInt(row['AÑO'], 10);
  if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && anio) return `${dia}/${mes}/${anio}`;
  return '';
}

// Columna cruda de fecha de turno para una fila del sheet de producción/NC.
// El día de planta va de 6:00am a 6:00am del día siguiente (ej. "3 de agosto"
// arranca 6am del 3 y cierra 6am del 4).
//
// Turnos 1/2/4 NUNCA cruzan medianoche: su día es DIRECTAMENTE el de las
// columnas DIA/MES/AÑO (lo que el operario seleccionó al reportar). NO usar
// "FECHAS SEGUN TURNO DE TRABAJO" para estos turnos — esa columna es una
// fórmula del sheet pensada para turnos 3/5 y le hereda a un T1/T2/T4 vecino
// el ajuste "día en que arrancó" de un T3/T5 de la MISMA caja partida entre
// turnos (ej. caja partida 11.000 en T3 + 1.000 en T4: la fórmula copiaba el
// día del T3 también a la fila del T4, corriendo esas 1.000 und un día atrás
// — Máquina 1, caja 40, 3/4-ago-2026). También retrasa un día los reportes
// de Turno 1 de madrugada (~6:00-6:15am, los de arranque/paro), cuando DIA
// ya trae el día correcto (verificado contra la hora real del reporte).
// NUNCA usar "FECHA Y HORA ULTIMO REPORTE" (hora de DIGITACIÓN, no de
// producción) para esto: puede ser horas o días después de producida, y en
// el sheet no es un timestamp confiable por caja (se repite igual en varias
// filas de un mismo lote de digitación).
//
// Turnos 3/5 SÍ cruzan medianoche: ahí "FECHAS SEGUN TURNO DE TRABAJO" es la
// autoridad (agrupa correctamente bajo el día en que arrancó el turno; DIA
// por sí solo reflejaría el día CALENDARIO del reporte, partiendo un mismo
// turno físico en dos días si cruzó la medianoche).
// Ver 2026-08-04.
function resolveFechaTurnoRaw(row) {
  const turno = String(row['TURNO'] ?? '').trim();
  const cruzaMedianoche = (turno === '3' || turno === '5');

  if (!cruzaMedianoche) {
    const dmy = _diaMesAnoToFecha(row);
    if (dmy) return dmy;
  }

  // Prioridad 1 (turnos 3/5, o fallback si DIA/MES/AÑO no sirven): columna
  // que contenga FECHA y TURNO en el encabezado
  for (const k of Object.keys(row)) {
    const ku = k.toUpperCase();
    if (ku.includes('FECHA') && ku.includes('TURNO')) { return String(row[k] || '').trim(); }
  }
  // Prioridad 2: cualquier columna FECHA con formato de fecha válido
  for (const k of Object.keys(row)) {
    const ku = k.toUpperCase();
    if (ku.includes('FECH')) {
      const v = String(row[k] || '').trim();
      if (v.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) return v;
    }
  }
  // Prioridad 3: cualquier columna con valor de formato fecha DD/MM/YYYY
  for (const k of Object.keys(row)) {
    const v = String(row[k] || '').trim();
    if (v.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) return v;
  }
  // Último recurso: DIA/MES/AÑO aunque el turno cruce medianoche
  return _diaMesAnoToFecha(row);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { canonicalizeTurnos, windowForRow, calcShiftHours, turnoSeconds, unidadesTeoricas, resolveFechaTurnoRaw, esParoProgramado };
}
