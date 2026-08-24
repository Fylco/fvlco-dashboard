// Pruebas de analisis-paros.js — se corren con: node analisis-paros.test.js
const A = require('./analisis-paros.js');
const { calcShiftHours } = require('./turnos.js');

let fallos = 0, corridas = 0;
function check(nombre, real, esperado) {
  corridas++;
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) { fallos++; console.log('FALLA ' + nombre + '\n   real=' + JSON.stringify(real) + '\n   esp.=' + JSON.stringify(esperado)); }
  else console.log('PASA  ' + nombre);
}
function checkQue(nombre, cond, detalle) {
  corridas++;
  if (cond) console.log('PASA  ' + nombre);
  else { fallos++; console.log('FALLA ' + nombre + (detalle ? '\n   ' + detalle : '')); }
}

// ── Taxonomía ────────────────────────────────────────────────────────────
check('PARO NO PROGRAMADO es decision', A.grupoParo('PARO NO PROGRAMADO'), 'decision');
check('PARO PROGRAMADO es planeado', A.grupoParo('PARO PROGRAMADO'), 'planeado');
check('MONTAJE MOLDE PROGRAMADO es planeado', A.grupoParo('MONTAJE MOLDE PROGRAMADO'), 'planeado');
check('DAÑO ELECTRICO es falla', A.grupoParo('DAÑO ELECTRICO MAQUINA'), 'falla');
check('MAQUINA CERRADA es averia, no decision', A.familiaParo('MAQUINA CERRADA'), 'Avería de máquina');
check('AJUSTE TAPADORA es Tapadora', A.familiaParo('AJUSTE TAPADORA'), 'Tapadora');
check('DAÑO MOLDE es Molde y cavidades', A.familiaParo('DAÑO MOLDE'), 'Molde y cavidades');
check('FALTANTE M.P. es Material', A.familiaParo('FALTANTE M.P.'), 'Material');
check('REEMPLAZO MAQUINAS es Personal (no Material)', A.familiaParo('REEMPLAZO MAQUINAS'), 'Personal');
check('razon vacia', A.familiaParo(''), 'Sin razón anotada');
check('familiaMolde quita cavidades', A.familiaMolde('VALVULA TERRA 15MM * 48'), 'VALVULA TERRA 15MM');
check('familiaMolde quita "24 CAV"', A.familiaMolde('VALVULA TERRA 15MM 24 CAV'), 'VALVULA TERRA 15MM');
check('familiaMolde sin producto', A.familiaMolde(''), '(sin producto)');

// ── Datos sintéticos ─────────────────────────────────────────────────────
// 2 máquinas × 2 meses. Turno 1 = 8 h por máquina-día.
// abril: maq 1 con 240 min de falla en 2 días (960 min prog) → 25 min/100h... se calcula abajo.
const fila = (fecha, maq, turno, paro, razon, prod, cant) => ({
  _fechaKey: fecha, _maq: maq, _turno: turno, _paro: paro, _prod: prod || 'TAPA TERRA 15MM',
  _cant: cant || 0, 'RAZON PARO': razon || '',
});
const rows = [
  // ABRIL — maq 1: 2 días, 8h c/u = 16 h; 240 min de falla
  fila('2026-04-01', '1', '1', 120, 'DAÑO MOLDE', 'VALVULA TERRA 15MM * 48'),
  fila('2026-04-02', '1', '1', 120, 'DAÑO MOLDE', 'VALVULA TERRA 15MM * 48'),
  // ABRIL — maq 2: 2 días, 16 h; 60 min de falla + 480 de planeado
  fila('2026-04-01', '2', '1', 60, 'AJUSTE TAPADORA', 'CONJUNTO TERRA 15MM'),
  fila('2026-04-02', '2', '1', 480, 'PARO PROGRAMADO', 'CONJUNTO TERRA 15MM'),
  // MAYO — maq 1: 2 días, 16 h; 60 min de falla (mejora)
  fila('2026-05-01', '1', '1', 30, 'DAÑO MOLDE', 'VALVULA TERRA 15MM * 32'),
  fila('2026-05-02', '1', '1', 30, 'DAÑO MOLDE', 'VALVULA TERRA 15MM * 32'),
  // MAYO — maq 2: 2 días, 16 h; 180 min de falla (empeora)
  fila('2026-05-01', '2', '1', 120, 'AJUSTE TAPADORA', 'CONJUNTO TERRA 15MM'),
  fila('2026-05-02', '2', '1', 60, 'PARO NO PROGRAMADO', 'CONJUNTO TERRA 15MM'),
];

const md = A.construirMaquinaDias(rows, calcShiftHours);
check('8 maquina-dias', md.length, 8);
check('cada maquina-dia tiene 8 h (turno 1)', [...new Set(md.map(x => x.horas))], [8]);

const r = A.analizarParos(rows, calcShiftHours, { iteraciones: 300 });

check('dos meses detectados', r.yms, ['2026-04', '2026-05']);
check('nombres de mes', r.meses.map(m => m.nombre), ['abril', 'mayo']);
check('horas abril', r.meses[0].horas, 32);
check('horas mayo', r.meses[1].horas, 32);
check('falla abril = 300 min', r.meses[0].falla, 300);
check('planeado abril = 480 min', r.meses[0].planeado, 480);
check('falla mayo = 180 min', r.meses[1].falla, 180);
check('decision mayo = 60 min', r.meses[1].decision, 60);
// tasa = min / horas * 100  →  abril 300/32*100 = 937,5
check('tasa de falla abril', Math.round(r.meses[0].tasaFalla * 10) / 10, 937.5);
check('tasa de falla mayo', Math.round(r.meses[1].tasaFalla * 10) / 10, 562.5);
check('variacion de la tasa abril→mayo', Math.round(r.variaciones[0].varTasa * 10) / 10, -40);

// El paro planeado NO entra en la tasa de falla
checkQue('planeado excluido de la tasa de falla',
  r.meses[0].tasaFalla < r.meses[0].tasa, 'tasa total debe ser mayor que la de falla en abril');

// Por máquina
const m1 = r.porMaquina.find(x => x.maq === '1');
const m2 = r.porMaquina.find(x => x.maq === '2');
check('maq 1 mejora 75%', Math.round(m1.varMesAnterior), -75);
check('maq 2 empeora 100%', Math.round(m2.varMesAnterior), 100);
check('minutos de maq 1 en abril', m1.minPorMes['2026-04'], 240);

// Por molde: las dos variantes de VALVULA TERRA se agrupan
const molde = r.porMolde.find(x => x.clave === 'VALVULA TERRA 15MM');
checkQue('las variantes * 48 y * 32 caen en el mismo molde', !!molde);
check('minutos del molde agrupado', molde.total, 300);

// Por razón: solo falla, sin planeado ni decisión
checkQue('PARO PROGRAMADO no aparece en razones de falla',
  !r.porRazon.some(x => x.clave === 'PARO PROGRAMADO'));
checkQue('PARO NO PROGRAMADO no aparece en razones de falla',
  !r.porRazon.some(x => x.clave === 'PARO NO PROGRAMADO'));

// Pruebas estadísticas
checkQue('hay razon de tasas vs mes anterior', !!(r.pruebas && r.pruebas.vsAnterior.rr));
checkQue('RR < 1 cuando la tasa baja', r.pruebas.vsAnterior.rr.rr < 1,
  'RR=' + (r.pruebas.vsAnterior.rr && r.pruebas.vsAnterior.rr.rr));
checkQue('Mann-Whitney devuelve p en [0,1]',
  r.pruebas.vsAnterior.mw.p >= 0 && r.pruebas.vsAnterior.mw.p <= 1);

// Narrativa
checkQue('la narrativa tiene frases', r.narrativa.length >= 3, JSON.stringify(r.narrativa));
checkQue('la narrativa nombra los dos meses',
  r.narrativa[0].includes('abril') && r.narrativa[0].includes('mayo'), r.narrativa[0]);
checkQue('la narrativa avisa de la orden de gerencia del ultimo mes',
  r.narrativa.some(t => t.includes('orden de gerencia')), JSON.stringify(r.narrativa));

// El aviso de paro planeado mira el ÚLTIMO mes del filtro, no el período:
// es una advertencia sobre cómo leer el total del mes que se está juzgando.
const conPlaneado = rows.concat([
  fila('2026-05-03', '1', '1', 480, 'PARO PROGRAMADO', 'TAPA TERRA 15MM'),
]);
const rPlan = A.analizarParos(conPlaneado, calcShiftHours, { iteraciones: 50 });
checkQue('avisa cuando el ultimo mes tiene mucho paro planeado',
  rPlan.narrativa.some(t => t.includes('paro es planeado')), JSON.stringify(rPlan.narrativa));
checkQue('no avisa de planeado cuando el ultimo mes no lo tiene',
  !r.narrativa.some(t => t.includes('paro es planeado')));
checkQue('la narrativa nombra la maquina que empeora',
  r.narrativa.some(t => t.includes('deterioró')), JSON.stringify(r.narrativa));

// Casos borde
const vacio = A.analizarParos([], calcShiftHours, { iteraciones: 50 });
check('sin filas: sin meses', vacio.meses.length, 0);
checkQue('sin filas: narrativa lo dice', vacio.narrativa[0].includes('No hay paros'));

const unMes = A.analizarParos(rows.filter(x => x._fechaKey.startsWith('2026-04')), calcShiftHours, { iteraciones: 50 });
check('un mes: sin variaciones', unMes.variaciones.length, 0);
checkQue('un mes: la narrativa avisa que no hay comparación',
  unMes.narrativa[0].includes('Sin un segundo mes'), unMes.narrativa[0]);
check('un mes: sin pruebas', unMes.pruebas, null);

// Determinismo: el bootstrap usa semilla fija, dos corridas dan lo mismo
const r2 = A.analizarParos(rows, calcShiftHours, { iteraciones: 300 });
check('bootstrap determinista', r2.pruebas.vsAnterior.rr.lo, r.pruebas.vsAnterior.rr.lo);


// ── Regresión: el ranking de molde no puede estar dominado por "(sin producto)"
// ni por un porcentaje enorme sobre una base ridícula.
const rowsMolde = [
  // abril
  // sin producto: se construye a mano porque fila() pone un producto por defecto
  { _fechaKey: '2026-04-01', _maq: '1', _turno: '1', _paro: 3000, _prod: '', _cant: 0,
    'RAZON PARO': 'DAÑO ELECTRICO MAQUINA' },
  fila('2026-04-01', '2', '1', 600, 'DAÑO MOLDE', 'CONJUNTO TERRA 15MM'),
  fila('2026-04-02', '2', '1', 45, 'DAÑO MOLDE', 'VALVULA LATERAL 38MM'),
  // mayo: conjunto sube 1.400 min; la valvula sube de 45 a 310 (+589% pero irrelevante)
  fila('2026-05-01', '2', '1', 2000, 'DAÑO MOLDE', 'CONJUNTO TERRA 15MM'),
  fila('2026-05-02', '2', '1', 310, 'DAÑO MOLDE', 'VALVULA LATERAL 38MM'),
];
const rM = A.analizarParos(rowsMolde, calcShiftHours, { iteraciones: 50 });
const fraseTop = rM.narrativa.find(t => t.startsWith('Por molde'));
checkQue('el molde que concentra no es "(sin producto)"',
  fraseTop && fraseTop.includes('CONJUNTO TERRA'), fraseTop);
checkQue('avisa aparte del paro sin producto asignado',
  rM.narrativa.some(t => t.includes('sin producto')), JSON.stringify(rM.narrativa));
const fraseSube = rM.narrativa.find(t => t.includes('va en contra'));
checkQue('el molde que empeora se elige por aumento absoluto, no por %',
  fraseSube && fraseSube.includes('CONJUNTO TERRA'), fraseSube);

console.log('\n' + (fallos === 0 ? 'TODAS PASAN (' + corridas + ')' : fallos + ' FALLAS de ' + corridas));
process.exit(fallos ? 1 : 0);
