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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { canonicalizeTurnos, windowForRow };
}
