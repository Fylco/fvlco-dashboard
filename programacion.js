// programacion.js — Reconciliación de "Real acum." (FVLco), fuente única
// Cargado por index.html vía <script src="programacion.js"> ANTES del <script>
// principal, y por programacion.test.js vía require() en Node. Lógica pura.
// Ver docs/superpowers/specs/2026-07-24-avance-real-vs-plan-fix-design.md
//
// PROBLEMA: "Avance Real vs Plan" y "Cumplimiento por Cliente" tomaban el
// acumulado real directo de la fila ACUM REAL del Sheet de PROGRAMACIÓN — una
// fórmula de acumulado corrido que se puede romper al editar el Sheet (pegar
// un valor fijo, insertar/borrar una columna). Verificado en julio 2026: para
// "Tapa 15 mm terra" esa fila se reinició a mitad de mes, mostrando 402.549
// cuando el acumulado real era 1.843.472 (según SUMA TOTAL REAL, calculado en
// el Sheet por otra fórmula). Este archivo reconstruye el acumulado sumando la
// única fila que el operario escribe a mano: CANTIDAD REAL (MANUAL).

// Suma corrida de la fila diaria. Trata "no reportado" (null) como 0 para la
// suma, pero NO como "hay dato": lastIdx solo avanza en días con una celda
// real, incluyendo el 0 explícito ("se reportó cero producción" ese día).
function reconstruirAcumReal(realDiario) {
  const acum = [];
  let running = 0, lastIdx = -1;
  (realDiario || []).forEach((v, i) => {
    if (v != null) { running += v; lastIdx = i; }
    acum.push(running);
  });
  return { acum, lastIdx, total: running };
}

// ¿el acumulado reconstruido no coincide con el total que el propio Sheet
// calcula por otra fórmula (SUMA TOTAL REAL)? Ambos se derivan de la misma
// fila diaria por caminos distintos — si no coinciden, es una señal real de
// inconsistencia (no necesariamente en ACUM REAL). Tolerancia: la mayor entre
// 50 unidades y 0.5% del total del Sheet, para no disparar por redondeos.
function datosInconsistentes(totalReconstruido, totalSheet) {
  if (!(totalSheet > 0) && !(totalReconstruido > 0)) return false;
  const tol = Math.max(50, Math.abs(totalSheet) * 0.005);
  return Math.abs(totalReconstruido - totalSheet) > tol;
}

// Proyecta cuándo se cumple la meta al ritmo actual (mismo método que ya
// usaba el bloque de sugerencias, generalizado a TODOS los productos, no solo
// los que están en rojo/amarillo) — texto para la columna "Día cumplim.".
function proyectarDiaCumplimiento({ requerida, acum, lastIdx, fechas }) {
  if (!(requerida > 0) || !fechas || !fechas.length) return '—';
  const realHoy = lastIdx >= 0 ? acum[lastIdx] : 0;
  if (realHoy >= requerida) {
    const idxCumplido = acum.findIndex(v => v >= requerida);
    return `Cumplido el ${fechas[idxCumplido] || ''}`.trim();
  }
  if (lastIdx < 0) return 'Sin producción registrada';
  const diasTransc = lastIdx + 1;
  const ritmo = realHoy / diasTransc;
  if (!(ritmo > 0)) return 'Sin avance al ritmo actual';
  const diasParaCumplir = Math.ceil((requerida - realHoy) / ritmo);
  if (diasParaCumplir > fechas.length - diasTransc) return 'No alcanza en el mes';
  return fechas[lastIdx + diasParaCumplir] || 'No alcanza en el mes';
}

// El "Requerido" de PROGRAMACIÓN es una celda manual — puede quedar desactualizado
// frente a lo que los clientes realmente pidieron ese mes. Compara contra la
// demanda real (hoja "pedidos") y avisa solo cuando los pedidos SUPERAN el
// requerido más allá de una tolerancia (5%): ese es el sentido en que cumplir
// el 100% del plan no bastaría para cubrir lo comprometido con clientes.
// `normalizador` se inyecta (ej. capNorm de capacidad.js) para no acoplar este
// módulo a esa dependencia — cruza nombres que las dos hojas escriben distinto.
function comparaRequeridoVsPedidos(blocks, pedidos, normalizador) {
  const TOL = 1.05;
  const sumaPorClave = {};
  (pedidos || []).forEach(p => {
    const k = normalizador(p.producto);
    sumaPorClave[k] = (sumaPorClave[k] || 0) + (p.cant || 0);
  });
  const alertas = [];
  (blocks || []).forEach(b => {
    const sumaPedidos = sumaPorClave[normalizador(b.producto)] || 0;
    if (sumaPedidos > (b.requerida || 0) * TOL) {
      alertas.push({
        producto: b.producto,
        requerido: b.requerida || 0,
        pedidos: Math.round(sumaPedidos),
        diferencia: Math.round(sumaPedidos - (b.requerida || 0)),
      });
    }
  });
  return alertas;
}

// El plan turno-a-turno (cavidades × ciclo × turnos asignados, acumulado a fin
// de mes en SUMA TOTAL PLANEADA) puede no coincidir con la celda "Requerido" —
// avisa para que el planeador ajuste cavidades/turnos asignados a ese producto.
function comparaRequeridoVsPlan(blocks) {
  const TOL_ABS = 50, TOL_PCT = 0.03;
  const alertas = [];
  (blocks || []).forEach(b => {
    const requerida = b.requerida || 0, plan = b.totalPlaneada || 0;
    if (requerida === 0 && plan === 0) return;
    if (requerida === 0 && plan > 0) {
      alertas.push({ producto: b.producto, tipo: 'sin_requerido', plan: Math.round(plan) });
      return;
    }
    const tol = Math.max(TOL_ABS, requerida * TOL_PCT);
    const diferencia = plan - requerida;
    if (Math.abs(diferencia) > tol) {
      alertas.push({
        producto: b.producto,
        tipo: diferencia > 0 ? 'plan_de_mas' : 'plan_de_menos',
        requerido: requerida, plan: Math.round(plan), diferencia: Math.round(diferencia),
      });
    }
  });
  return alertas;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reconstruirAcumReal, datosInconsistentes, proyectarDiaCumplimiento,
    comparaRequeridoVsPedidos, comparaRequeridoVsPlan,
  };
}
