// analisis-paros.js — Motor de análisis de tiempos de paro (FVLco)
//
// Cargado por index.html vía <script src="analisis-paros.js"> ANTES del <script>
// principal, y por analisis-paros.test.js vía require() en Node. Lógica PURA:
// recibe filas ya normalizadas por normalizeProd() y devuelve números y frases.
// No toca el DOM, no lee DATA global, no formatea: eso es del render.
//
// POR QUÉ ESTE MÓDULO EXISTE
// Comparar minutos de paro entre meses engaña: agosto lleva 17 días y abril 30,
// y una máquina que no se programó no puede "mejorar". Todo el análisis se hace
// sobre una TASA — minutos de paro por cada 100 horas programadas — y las horas
// salen de la unión de ventanas de turno por máquina-día (calcShiftHours), no de
// sumar duraciones de turno, que daría más de 24 h en días con turnos solapados.

/* ── Taxonomía de razones ────────────────────────────────────────────────
 * Tres grupos, porque no se atacan igual y mezclados se anulan entre sí:
 *   falla     → averías, ajustes, material, personal. El paro atacable.
 *   planeado  → mantenimiento, montaje/desmontaje de molde. Se decidió no producir.
 *   decision  → "PARO NO PROGRAMADO": orden de gerencia de parar la máquina sin
 *               planearlo. No es una avería; es una decisión, y se mide aparte.
 * OJO con el orden de los ifs: "PARO NO PROGRAMADO" contiene "PROGRAMADO". */
function grupoParo(razon) {
  const r = String(razon == null ? '' : razon).toUpperCase();
  if (/\bNO\s*PROGRAMAD/.test(r)) return 'decision';
  if (/PROGRAMAD/.test(r)) return 'planeado';
  return 'falla';
}

/* Familia dentro de 'falla'. El orden importa: la primera regla que casa manda.
 * MAQUINA CERRADA es avería — las observaciones del turno dicen "se quedó
 * cerrada / problemas de la máquina" — y no una decisión de parar. */
function familiaParo(razon) {
  const r = String(razon == null ? '' : razon).toUpperCase();
  if (!r.trim()) return 'Sin razón anotada';
  if (/TAPADORA/.test(r)) return 'Tapadora';
  if (/MOLDE|CAVIDAD|POMOS/.test(r)) return 'Molde y cavidades';
  if (/AUSENTISMO|PERSONAL|OPERARI|CAPACITACION|REEMPLAZO/.test(r)) return 'Personal';
  if (/MATERIA PRIMA|MATERIAL|\bM\.?\s?P\b|ALIMENTACION|CONTAMINACION|SECADO|MOLINO|TOLVA|BOQUILLA/.test(r)) return 'Material';
  if (/ELECTRIC|MECANIC|LUBRICACION|HIDRAULIC|COMPRESOR|NEUMATIC|CALENTAMIENTO|MAQUINA CERRADA|MOTOR|RESISTENCIA|CHILLER|ACEITE/.test(r)) return 'Avería de máquina';
  if (/AJUSTE|PARAMETRO|CAMBIO COLOR|PURGA|ENSAYO|INICIO PLANTA/.test(r)) return 'Ajuste y alistamiento';
  if (/ASEO|ORDEN|INVENTARIO|CALIDAD|MUESTRA|PESAJE/.test(r)) return 'Calidad, orden y aseo';
  if (/APAGON|ENERGIA|SERVICIOS/.test(r)) return 'Servicios (energía)';
  return 'Otros';
}

/* Familia de molde: "VALVULA TERRA 15MM * 48" y "* 32" son el mismo molde con
 * distinta configuración de cavidades. Agruparlas evita un Pareto de referencias
 * casi iguales que esconde el patrón. */
function familiaMolde(producto) {
  const t = String(producto == null ? '' : producto).toUpperCase().trim();
  if (!t) return '(sin producto)';
  return t.replace(/\s*\*\s*\d+\s*(CAV)?\.?$/, '')
          .replace(/\s+\d+\s*CAV\.?$/, '')
          .replace(/\s{2,}/g, ' ').trim() || '(sin producto)';
}

const _MESES_NOM = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Clave de mes ordenable a partir de _fechaKey (YYYY-MM-DD). Se ordena por
// YYYY-MM y no por el nombre del mes: "abril" < "mayo" alfabéticamente es
// casualidad, y con dos años en el filtro el orden alfabético miente.
function _ym(row) {
  const k = String(row._fechaKey || '');
  return /^\d{4}-\d{2}/.test(k) ? k.slice(0, 7) : null;
}
function nombreMes(ym) {
  const m = parseInt(String(ym).slice(5, 7), 10);
  return (_MESES_NOM[m] || ym) + (String(ym).slice(0, 4) !== '2026' ? ' ' + String(ym).slice(0, 4) : '');
}

/* ── Agregación base ─────────────────────────────────────────────────────
 * Unidad de análisis: la MÁQUINA-DÍA. Un turno completo parado es un dato, no
 * 480. Sin esto, un solo evento catastrófico decide la comparación del mes. */
function construirMaquinaDias(rows, calcHoras) {
  const slots = {};
  rows.forEach(r => {
    const ym = _ym(r); if (!ym || !r._maq) return;
    const k = r._fechaKey + '|' + r._maq;
    if (!slots[k]) slots[k] = { fecha: r._fechaKey, maq: String(r._maq), ym, turnos: new Set(),
                                min: 0, falla: 0, planeado: 0, decision: 0, ev: 0, und: 0 };
    slots[k].turnos.add(String(r._turno || ''));
    slots[k].und += r._cant || 0;
    const p = r._paro || 0;
    if (p > 0) {
      const g = grupoParo(r['RAZON PARO'] || r['RAZÓN PARO']);
      slots[k].min += p; slots[k][g] += p; slots[k].ev++;
    }
  });
  return Object.values(slots).map(s => {
    s.horas = calcHoras(s.turnos);
    return s;
  });
}

const _sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const _tasa = (md, campo) => {
  const h = _sum(md, x => x.horas);
  return h > 0 ? _sum(md, x => x[campo]) / h * 100 : null;   // min por 100 h
};
const _pctVar = (a, b) => (a == null || b == null || !a) ? null : (b - a) / a * 100;

function _stats(vals) {
  if (!vals.length) return { n: 0 };
  const s = vals.slice().sort((x, y) => x - y), n = s.length;
  const q = p => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); };
  return { n, media: _sum(s) / n, mediana: q(.5), p90: q(.9), max: s[n - 1], ceros: s.filter(x => x === 0).length };
}

/* ── Pruebas ─────────────────────────────────────────────────────────────
 * Los minutos de paro por máquina-día son muy asimétricos: la mitad de los días
 * son cero y unos pocos concentran turnos completos. Por eso:
 *   · el intervalo de la razón de tasas sale de BOOTSTRAP remuestreando
 *     máquina-días, no de un supuesto de Poisson (daría intervalos falsamente
 *     estrechos: los minutos no son eventos independientes);
 *   · el contraste de distribución es Mann-Whitney, no una t. */
function _rngLCG(semilla) {
  let s = semilla >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function razonTasas(mdA, mdB, campo, iteraciones, semilla) {
  const ta = _tasa(mdA, campo), tb = _tasa(mdB, campo);
  if (!ta || tb == null || !mdA.length || !mdB.length) return null;
  const rnd = _rngLCG(semilla || 20260821);
  const B = iteraciones || 2000, out = [];
  for (let i = 0; i < B; i++) {
    const sa = [], sb = [];
    for (let j = 0; j < mdA.length; j++) sa.push(mdA[(rnd() * mdA.length) | 0]);
    for (let j = 0; j < mdB.length; j++) sb.push(mdB[(rnd() * mdB.length) | 0]);
    const x = _tasa(sa, campo), y = _tasa(sb, campo);
    if (x > 0 && y != null) out.push(y / x);
  }
  if (!out.length) return null;
  out.sort((p, q) => p - q);
  const q = p => out[Math.min(out.length - 1, Math.max(0, (p * out.length) | 0))];
  const rr = tb / ta, lo = q(.025), hi = q(.975);
  return { rr, lo, hi, significativo: (lo > 1 && hi > 1) || (lo < 1 && hi < 1) };
}
function _normCdf(x) {
  const t = 1 / (1 + .2316419 * Math.abs(x)), d = .3989423 * Math.exp(-x * x / 2);
  const pr = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - pr : pr;
}
function mannWhitney(a, b) {
  const n1 = a.length, n2 = b.length;
  if (!n1 || !n2) return null;
  const todos = a.concat(b).map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const rangos = new Array(n1 + n2); const empates = [];
  let i = 0;
  while (i < todos.length) {
    let j = i; while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) rangos[todos[k][1]] = r;
    if (j > i) empates.push(j - i + 1);
    i = j + 1;
  }
  let R1 = 0; for (let k = 0; k < n1; k++) R1 += rangos[k];
  const U1 = R1 - n1 * (n1 + 1) / 2, N = n1 + n2;
  const corr = empates.reduce((s, t) => s + (t ** 3 - t), 0);
  const sd = Math.sqrt((n1 * n2 / 12) * ((N + 1) - corr / (N * (N - 1))));
  const z = sd > 0 ? (U1 - n1 * n2 / 2) / sd : 0;
  return { z, p: 2 * (1 - _normCdf(Math.abs(z))), n1, n2 };
}

/* ── Análisis completo ───────────────────────────────────────────────────
 * rows: filas ya FILTRADAS (mes/máquina/molde) y normalizadas.
 * calcHoras: función Set(turnos) -> horas (calcShiftHours de turnos.js).
 * Devuelve todo lo que la pestaña necesita pintar, incluida la narrativa. */
function analizarParos(rows, calcHoras, opts) {
  opts = opts || {};
  const md = construirMaquinaDias(rows, calcHoras);
  const yms = [...new Set(md.map(x => x.ym))].sort();

  const meses = yms.map(ym => {
    const g = md.filter(x => x.ym === ym);
    const evs = rows.filter(r => _ym(r) === ym && (r._paro || 0) > 0);
    const fallaEv = evs.filter(r => grupoParo(r['RAZON PARO'] || r['RAZÓN PARO']) === 'falla');
    return {
      ym, nombre: nombreMes(ym),
      horas: _sum(g, x => x.horas),
      min: _sum(g, x => x.min), falla: _sum(g, x => x.falla),
      planeado: _sum(g, x => x.planeado), decision: _sum(g, x => x.decision),
      tasa: _tasa(g, 'min'), tasaFalla: _tasa(g, 'falla'), tasaPlaneado: _tasa(g, 'planeado'),
      eventos: evs.length, eventosFalla: fallaEv.length,
      minEvento: fallaEv.length ? _sum(fallaEv, r => r._paro) / fallaEv.length : null,
      dias: new Set(g.map(x => x.fecha)).size, maqDias: g.length,
      unidades: _sum(g, x => x.und),
      distrib: _stats(g.map(x => x.falla)),
    };
  });

  // Variaciones mes a mes y contra el primero del rango
  const variaciones = [];
  for (let i = 1; i < meses.length; i++) {
    const a = meses[i - 1], b = meses[i];
    variaciones.push({
      de: a.nombre, a: b.nombre,
      varMin: _pctVar(a.falla, b.falla),
      varTasa: _pctVar(a.tasaFalla, b.tasaFalla),
      varTasaTotal: _pctVar(a.tasa, b.tasa),
      varEventos: _pctVar(a.eventosFalla, b.eventosFalla),
    });
  }

  const porGrupo = md.filter(x => x.ym === yms[yms.length - 1]);

  // Por máquina: tasa por mes + variación del último contra el primero
  const maqs = [...new Set(md.map(x => x.maq))].sort((a, b) => (+a || 0) - (+b || 0) || a.localeCompare(b));
  const porMaquina = maqs.map(maq => {
    const fila = { maq, porMes: {}, minPorMes: {}, horasPorMes: {} };
    yms.forEach(ym => {
      const g = md.filter(x => x.maq === maq && x.ym === ym);
      fila.porMes[ym] = _tasa(g, 'falla');
      fila.minPorMes[ym] = _sum(g, x => x.falla);
      fila.horasPorMes[ym] = _sum(g, x => x.horas);
    });
    fila.total = _sum(yms.map(ym => fila.minPorMes[ym] || 0));
    const pri = fila.porMes[yms[0]], ult = fila.porMes[yms[yms.length - 1]];
    const ant = yms.length > 1 ? fila.porMes[yms[yms.length - 2]] : null;
    fila.varPrimeroUltimo = _pctVar(pri, ult);
    fila.varMesAnterior = _pctVar(ant, ult);
    if (yms.length > 1) {
      fila.rr = razonTasas(md.filter(x => x.maq === maq && x.ym === yms[yms.length - 2]),
                           md.filter(x => x.maq === maq && x.ym === yms[yms.length - 1]),
                           'falla', opts.iteraciones || 1000, 4242);
    }
    return fila;
  });

  // Pivotes por molde y por razón/familia (solo paro de falla: es el atacable)
  const pivote = (keyFn) => {
    const t = {};
    rows.forEach(r => {
      if (!((r._paro || 0) > 0)) return;
      if (grupoParo(r['RAZON PARO'] || r['RAZÓN PARO']) !== 'falla') return;
      const ym = _ym(r); if (!ym) return;
      const k = keyFn(r);
      if (!t[k]) t[k] = { clave: k, porMes: {}, total: 0, eventos: 0 };
      t[k].porMes[ym] = (t[k].porMes[ym] || 0) + r._paro;
      t[k].total += r._paro; t[k].eventos++;
    });
    return Object.values(t).sort((a, b) => b.total - a.total).map(x => {
      x.varPrimeroUltimo = _pctVar(x.porMes[yms[0]] || 0, x.porMes[yms[yms.length - 1]] || 0);
      x.varMesAnterior = yms.length > 1
        ? _pctVar(x.porMes[yms[yms.length - 2]] || 0, x.porMes[yms[yms.length - 1]] || 0) : null;
      return x;
    });
  };
  const porMolde = pivote(r => familiaMolde(r._prod));
  const porRazon = pivote(r => String(r['RAZON PARO'] || r['RAZÓN PARO'] || '(sin razón)').trim().toUpperCase());
  const porFamilia = pivote(r => familiaParo(r['RAZON PARO'] || r['RAZÓN PARO']));

  // Pruebas del último mes contra el anterior y contra el primero
  let pruebas = null;
  if (yms.length > 1) {
    const ult = md.filter(x => x.ym === yms[yms.length - 1]);
    const ant = md.filter(x => x.ym === yms[yms.length - 2]);
    const pri = md.filter(x => x.ym === yms[0]);
    pruebas = {
      vsAnterior: {
        rr: razonTasas(ant, ult, 'falla', opts.iteraciones || 2000, 20260821),
        mw: mannWhitney(ant.map(x => x.falla), ult.map(x => x.falla)),
        de: nombreMes(yms[yms.length - 2]), a: nombreMes(yms[yms.length - 1]),
      },
      vsPrimero: yms.length > 2 ? {
        rr: razonTasas(pri, ult, 'falla', opts.iteraciones || 2000, 20260821),
        mw: mannWhitney(pri.map(x => x.falla), ult.map(x => x.falla)),
        de: nombreMes(yms[0]), a: nombreMes(yms[yms.length - 1]),
      } : null,
    };
  }

  const res = { meses, variaciones, porMaquina, porMolde, porRazon, porFamilia, pruebas,
                maquinaDias: md, yms, ultimo: porGrupo };
  res.narrativa = narrar(res, opts);
  return res;
}

/* ── Narrativa ───────────────────────────────────────────────────────────
 * Genera el análisis en palabras a partir de los números ya calculados.
 * Reglas, no plantillas de relleno: cada frase solo aparece si el dato la
 * sostiene, y siempre dice la magnitud y si el cambio se distingue del ruido. */
function narrar(res, opts) {
  opts = opts || {};
  const f0 = n => n == null ? '—' : Math.round(n).toLocaleString('es-CO');
  const pct = n => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  const out = [];
  const M = res.meses;

  if (!M.length) return ['No hay paros registrados con los filtros aplicados.'];
  if (M.length === 1) {
    const m = M[0];
    out.push(`Un solo mes en el filtro (${m.nombre}): ${f0(m.min)} min de paro en ${f0(m.horas)} h programadas — ` +
             `${f0(m.tasaFalla)} min de falla por cada 100 h. Sin un segundo mes no hay comparación posible; ` +
             `agrega meses al filtro para ver si mejoró.`);
    return out;
  }

  const ult = M[M.length - 1], ant = M[M.length - 2], pri = M[0];
  const vTasa = _pctVar(ant.tasaFalla, ult.tasaFalla);
  const p = res.pruebas && res.pruebas.vsAnterior;
  const rr = p && p.rr;

  // 1. Veredicto principal
  let veredicto;
  if (rr && rr.significativo) veredicto = vTasa < 0 ? 'y la diferencia es estadísticamente real' : 'y el deterioro es estadísticamente real';
  else if (rr) veredicto = 'pero el intervalo incluye el 1,00: el cambio no se distingue del ruido';
  else veredicto = 'sin datos suficientes para contrastarlo';
  out.push(`De ${ant.nombre} a ${ult.nombre} el paro por fallas pasó de ${f0(ant.tasaFalla)} a ${f0(ult.tasaFalla)} ` +
           `min por 100 h programadas (${pct(vTasa)}), ${veredicto}` +
           (rr ? ` (RR ${rr.rr.toFixed(2)}; IC95 ${rr.lo.toFixed(2)}–${rr.hi.toFixed(2)})` : '') + '.');

  // 2. Minutos crudos vs tasa: avisar cuando el mes está incompleto
  const vMin = _pctVar(ant.falla, ult.falla);
  if (vMin != null && vTasa != null && Math.abs(vMin - vTasa) > 15) {
    out.push(`En minutos crudos la variación es ${pct(vMin)}, distinta del ${pct(vTasa)} de la tasa: ` +
             `${ult.nombre} tiene ${f0(ult.horas)} h programadas contra ${f0(ant.horas)} de ${ant.nombre}. ` +
             `Manda la tasa — comparar minutos entre meses de distinto tamaño premia al mes más corto.`);
  }

  // 3. Contra el primer mes del rango
  if (M.length > 2) {
    const vPri = _pctVar(pri.tasaFalla, ult.tasaFalla);
    const pp = res.pruebas.vsPrimero, rrp = pp && pp.rr;
    out.push(`Contra ${pri.nombre}, el primer mes del filtro, la tasa va ${pct(vPri)}` +
             (rrp ? ` (RR ${rrp.rr.toFixed(2)}; IC95 ${rrp.lo.toFixed(2)}–${rrp.hi.toFixed(2)}${rrp.significativo ? '' : ', no concluyente'})` : '') + '.');
  }

  // 4. Composición del paro del último mes
  if (ult.min > 0) {
    const pctPlan = ult.planeado / ult.min * 100, pctDec = ult.decision / ult.min * 100;
    if (pctPlan >= 20) {
      out.push(`Ojo con la lectura del total: en ${ult.nombre} el ${pctPlan.toFixed(0)}% del paro es planeado ` +
               `(${f0(ult.planeado)} de ${f0(ult.min)} min), así que el paro total baja menos que el atacable.`);
    }
    if (pctDec >= 10) {
      out.push(`Además, ${pctDec.toFixed(0)}% del paro de ${ult.nombre} es orden de gerencia (${f0(ult.decision)} min): ` +
               `es una decisión de parar, no una falla, y no debe leerse como problema de mantenimiento.`);
    }
  }

  // 5. Máquinas: la que más mejora y la que más empeora
  const conDato = res.porMaquina.filter(m => m.varMesAnterior != null && isFinite(m.varMesAnterior));
  if (conDato.length > 1) {
    const mejor = conDato.slice().sort((a, b) => a.varMesAnterior - b.varMesAnterior)[0];
    const peor = conDato.slice().sort((a, b) => b.varMesAnterior - a.varMesAnterior)[0];
    if (mejor.varMesAnterior < -5) {
      out.push(`La que más mejoró es la máquina ${mejor.maq}: ${pct(mejor.varMesAnterior)} de ${ant.nombre} a ${ult.nombre} ` +
               `(${f0(mejor.porMes[ant.ym])} → ${f0(mejor.porMes[ult.ym])} min/100 h)` +
               (mejor.rr && mejor.rr.significativo ? ', con intervalo que excluye el 1,00' : ', aunque con pocos días el intervalo es ancho') + '.');
    }
    if (peor.varMesAnterior > 5) {
      out.push(`La que más se deterioró es la máquina ${peor.maq}: ${pct(peor.varMesAnterior)} ` +
               `(${f0(peor.porMes[ant.ym])} → ${f0(peor.porMes[ult.ym])} min/100 h). Es donde conviene mirar primero.`);
    }
  }

  // 6. Molde que concentra y molde que empeora
  // Las filas sin producto (máquina detenida sin orden asignada) se excluyen del
  // ranking: no son un molde y taparían al que sí lo es. Se avisan aparte.
  const moldesReales = res.porMolde.filter(x => x.clave !== '(sin producto)');
  const sinProducto = res.porMolde.find(x => x.clave === '(sin producto)');
  const totFalla = _sum(res.porMolde, x => x.total);
  if (moldesReales.length && totFalla > 0) {
    const top = moldesReales[0];
    out.push(`Por molde, ${top.clave} concentra ${(top.total / totFalla * 100).toFixed(0)}% del paro por fallas del período ` +
             `(${f0(top.total)} min en ${top.eventos} eventos).`);
  }
  if (sinProducto && totFalla > 0 && sinProducto.total / totFalla >= .1) {
    out.push(`${(sinProducto.total / totFalla * 100).toFixed(0)}% del paro (${f0(sinProducto.total)} min) está en filas sin producto ` +
             `asignado — típicamente una máquina detenida sin orden en curso. No es atribuible a ningún molde.`);
  }
  // El molde que va en contra se elige por AUMENTO ABSOLUTO, no por porcentaje:
  // pasar de 45 a 310 min es +589% y no significa nada al lado de un molde que
  // subió 2.000 min. El porcentaje se muestra, pero no ordena.
  if (ant && moldesReales.length) {
    const subiendo = moldesReales
      .map(x => ({ x, delta: (x.porMes[ult.ym] || 0) - (x.porMes[ant.ym] || 0) }))
      .filter(o => o.delta > 0 && (o.x.porMes[ult.ym] || 0) >= Math.max(300, totFalla * 0.02))
      .sort((a, b) => b.delta - a.delta)[0];
    if (subiendo) {
      out.push(`El molde que va en contra es ${subiendo.x.clave}: ${f0(subiendo.delta)} min más que en ${ant.nombre} ` +
               `(${f0(subiendo.x.porMes[ant.ym] || 0)} → ${f0(subiendo.x.porMes[ult.ym] || 0)} min, ${pct(subiendo.x.varMesAnterior)}).`);
    }
  }

  // 7. Causa dominante del último mes y concentración del Pareto
  const causasUlt = res.porRazon.map(x => ({ clave: x.clave, min: x.porMes[ult.ym] || 0 }))
                                .filter(x => x.min > 0).sort((a, b) => b.min - a.min);
  if (causasUlt.length) {
    const totUlt = _sum(causasUlt, x => x.min);
    let acc = 0, n80 = 0;
    for (const c of causasUlt) { acc += c.min; n80++; if (acc / totUlt >= .8) break; }
    out.push(`En ${ult.nombre} la causa principal es ${causasUlt[0].clave} con ${(causasUlt[0].min / totUlt * 100).toFixed(0)}% ` +
             `del paro por fallas, y hacen falta ${n80} causa${n80 === 1 ? '' : 's'} para llegar al 80% ` +
             `(${n80 <= 2 ? 'problema concentrado: un solo frente explica el mes' : 'paro difuso: no hay un único frente que resolver'}).`);
  }

  // 8. Advertencias de cobertura
  const sinHoras = res.porMaquina.filter(m => (m.horasPorMes[ult.ym] || 0) === 0 && m.total > 0);
  if (sinHoras.length) {
    out.push(`Aviso: la${sinHoras.length > 1 ? 's' : ''} máquina${sinHoras.length > 1 ? 's' : ''} ` +
             `${sinHoras.map(m => m.maq).join(', ')} no tiene${sinHoras.length > 1 ? 'n' : ''} horas programadas en ${ult.nombre} ` +
             `pero sí paro en meses anteriores: su salida del universo baja el total sin que nada haya mejorado.`);
  }
  if (ult.distrib && ult.distrib.n) {
    const pctCeros = ult.distrib.ceros / ult.distrib.n * 100;
    if (pctCeros >= 40) {
      out.push(`Distribución: ${pctCeros.toFixed(0)}% de las máquina-día de ${ult.nombre} cerraron sin un minuto de paro por fallas, ` +
               `y la mediana es ${f0(ult.distrib.mediana)} min contra un máximo de ${f0(ult.distrib.max)}. ` +
               `El promedio por sí solo describe mal este mes.`);
    }
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analizarParos, narrar, grupoParo, familiaParo, familiaMolde,
                     construirMaquinaDias, razonTasas, mannWhitney, nombreMes };
}
