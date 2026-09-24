const assert = require('node:assert');
const {
  retEntero, retFechaISO, retFechaDMY,
  validarRetenido, retenidoAntiguo, retenidoAFilaNC, retenidosAFilasNC,
  retClaveOrden, saldosRetenidos, ordenesParaMoler
} = require('./retenidos.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

const BASE = {
  orden: '1317', maquina: '6', turno: '3', operario: '7 · JUAN CAMILO USMA',
  cantidad: '4000', fechaProd: '2026-09-20', fechaRev: '2026-09-22',
  motivo: 'producto Rechazado'
};
const HOY = '2026-09-22';

// ── retEntero ──────────────────────────────────────────────────────
t('entero simple', () => assert.strictEqual(retEntero('4095'), 4095));
t('numero nativo', () => assert.strictEqual(retEntero(4095), 4095));
t('punto de miles del locale ES', () => assert.strictEqual(retEntero('13.600'), 13600));
t('dos grupos de miles', () => assert.strictEqual(retEntero('1.234.567'), 1234567));

// Un decimal NO se convierte en silencio: "1,5" piezas no existe, y
// aceptarlo como 15 metia un error de 10x en el indicador.
t('decimal con coma es invalido', () => assert.ok(Number.isNaN(retEntero('1,5'))));
t('decimal con punto es invalido', () => assert.ok(Number.isNaN(retEntero('12.34'))));
t('negativo es invalido', () => assert.ok(Number.isNaN(retEntero('-5'))));
t('texto es invalido', () => assert.ok(Number.isNaN(retEntero('cuatro mil'))));
t('vacio es invalido', () => assert.ok(Number.isNaN(retEntero(''))));

// ── retFechaISO / retFechaDMY ──────────────────────────────────────
t('ISO del input type=date', () => assert.strictEqual(retFechaISO('2026-09-20'), '2026-09-20'));
t('DD/MM/YYYY del sheet', () => assert.strictEqual(retFechaISO('5/9/2026'), '2026-09-05'));
t('DD-MM-YYYY', () => assert.strictEqual(retFechaISO('20-9-2026'), '2026-09-20'));
t('objeto Date', () => assert.strictEqual(retFechaISO(new Date(2026, 8, 20)), '2026-09-20'));
t('mes 13 es invalido', () => assert.strictEqual(retFechaISO('20/13/2026'), ''));
t('basura es invalida', () => assert.strictEqual(retFechaISO('ayer'), ''));
t('vacio es invalido', () => assert.strictEqual(retFechaISO(''), ''));
t('ISO a DMY sin ceros a la izquierda', () => assert.strictEqual(retFechaDMY('2026-09-05'), '5/9/2026'));

// ── validarRetenido ────────────────────────────────────────────────
t('fila completa no tiene errores', () => {
  assert.deepStrictEqual(validarRetenido(BASE, HOY), []);
});

const falta = (campo, valor, textoEsperado) => {
  const d = Object.assign({}, BASE); d[campo] = valor;
  const e = validarRetenido(d, HOY);
  assert.ok(e.some(x => x.includes(textoEsperado)), campo + ' → ' + JSON.stringify(e));
};
t('sin orden', () => falta('orden', '', 'orden'));
t('sin maquina', () => falta('maquina', '  ', 'máquina'));
t('sin operario', () => falta('operario', '', 'operario'));
t('sin motivo', () => falta('motivo', '', 'motivo'));
t('turno 0', () => falta('turno', '0', 'turno'));
t('turno 6', () => falta('turno', '6', 'turno'));
t('cantidad cero', () => falta('cantidad', '0', 'cantidad'));
t('cantidad negativa', () => falta('cantidad', '-10', 'cantidad'));
t('cantidad decimal', () => falta('cantidad', '1,5', 'cantidad'));
t('cantidad vacia', () => falta('cantidad', '', 'cantidad'));
t('fecha de produccion invalida', () => falta('fechaProd', 'ayer', 'producción no es válida'));
t('fecha de revision invalida', () => falta('fechaRev', '', 'revisión no es válida'));

t('fecha de produccion futura', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-30', fechaRev: '2026-09-30' });
  assert.ok(validarRetenido(d, HOY).some(x => x.includes('producción no puede ser futura')));
});
t('produccion posterior a revision', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-22', fechaRev: '2026-09-20' });
  assert.ok(validarRetenido(d, HOY).some(x => x.includes('posterior a la de revisión')));
});
// Producción de un fin de semana reportada el lunes: es el caso normal, no un error.
t('produccion de hace tres dias es valida', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-19' });
  assert.deepStrictEqual(validarRetenido(d, HOY), []);
});
// Decisión del usuario: los TRES motivos restan igual. Ninguno se filtra.
t('los tres motivos pasan igual', () => {
  ['Seleccionar', 'producto Rechazado', 'Derogacion por varíacion'].forEach(m => {
    assert.deepStrictEqual(validarRetenido(Object.assign({}, BASE, { motivo: m }), HOY), []);
  });
});

// ── retenidoAntiguo ────────────────────────────────────────────────
t('de ayer no es antiguo', () => assert.strictEqual(retenidoAntiguo('2026-09-21', HOY), false));
t('de hace 40 dias es antiguo', () => assert.strictEqual(retenidoAntiguo('2026-08-13', HOY), true));
t('fecha invalida no es antiguo', () => assert.strictEqual(retenidoAntiguo('', HOY), false));

// ── retenidoAFilaNC ────────────────────────────────────────────────
const FILA = {
  'FECHA PRODUCCION': '2026-09-20', 'FECHA REVISION': '2026-09-22',
  'ORDEN': '1317', 'MAQUINA': '6', 'TURNO': '3', 'OPERARIO': '7 · JUAN CAMILO USMA',
  'PRODUCTO': 'CONJUNTO TERRA 15MM', 'COLOR': 'BLANCO',
  'CANTIDAD RETENIDA': '4000', 'MOTIVO RECHAZO': 'producto Rechazado',
  'OBSERVACION': 'lote de la noche', 'REGISTRADO': '22/9/2026 8:15:00'
};

t('la cantidad retenida llega como CANTIDAD NC', () => {
  assert.strictEqual(retenidoAFilaNC(FILA)['CANTIDAD NC'], 4000);
});
t('el motivo llega como CAUSA', () => {
  assert.strictEqual(retenidoAFilaNC(FILA)['CAUSA'], 'producto Rechazado');
});
// La fecha que pesa es la de PRODUCCION. Si aqui se colara la de revision,
// el indicador bajaria el dia equivocado y nadie lo notaria.
t('las dos fechas de la fila NC son la de PRODUCCION', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['FECHA Y HORA'], '20/9/2026');
  assert.strictEqual(f['FECHAS SEGUN TURNO DE TRABAJO'], '20/9/2026');
});
t('maquina, turno, orden y producto se conservan', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['MÁQUINA'], '6');
  assert.strictEqual(f['TURNO'], '3');
  assert.strictEqual(f['ORDEN'], '1317');
  assert.strictEqual(f['PRODUCTO'], 'CONJUNTO TERRA 15MM');
  assert.strictEqual(f['COLOR'], 'BLANCO');
  assert.strictEqual(f['OPERARIO1'], '7 · JUAN CAMILO USMA');
});
// Una fila a medio llenar no debe ensuciar el Pareto con un cero.
t('cantidad cero no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC(Object.assign({}, FILA, { 'CANTIDAD RETENIDA': '0' })), null);
});
t('sin fecha de produccion no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC(Object.assign({}, FILA, { 'FECHA PRODUCCION': '' })), null);
});
t('fila vacia no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC({}), null);
});
t('retenidosAFilasNC descarta las nulas', () => {
  const out = retenidosAFilasNC([FILA, {}, Object.assign({}, FILA, { 'CANTIDAD RETENIDA': '' })]);
  assert.strictEqual(out.length, 1);
});
t('lista vacia o undefined devuelve lista vacia', () => {
  assert.deepStrictEqual(retenidosAFilasNC([]), []);
  assert.deepStrictEqual(retenidosAFilasNC(undefined), []);
});

// El tablero lee r['MES'] CRUDO en tres sitios (filtro de No Conformes,
// acumulado por maquina del Resumen Diario, grafico "NC por mes"), no el
// campo derivado _mes. Sin esta columna el retenido desaparece de esas
// vistas en cuanto se filtra el tablero a un mes concreto.
t('la fila de septiembre trae MES en septiembre', () => {
  const f = retenidoAFilaNC(FILA); // FECHA PRODUCCION: 2026-09-20
  assert.strictEqual(f['MES'], 'septiembre');
});
// El mes sale de la fecha de PRODUCCION, no de la de revision: aqui
// producen el 30/8 y revisan el 2/9, y debe pesar agosto.
t('el mes sale de la fecha de produccion, no de la de revision', () => {
  const f = retenidoAFilaNC(Object.assign({}, FILA, {
    'FECHA PRODUCCION': '2026-08-30', 'FECHA REVISION': '2026-09-02'
  }));
  assert.strictEqual(f['MES'], 'agosto');
});
// mesMatch y el grafico de NC por mes comparan en minuscula.
t('el mes va en minuscula', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['MES'], f['MES'].toLowerCase());
});

// ── La fila sintetica tiene que servirle a resolveFechaTurnoRaw ────
// Es lo unico que garantiza que el retenido caiga en el DIA correcto, y hay
// dos caminos distintos: turnos 1/2/4 y turnos 3/5 (que cruzan medianoche).
const { resolveFechaTurnoRaw } = require('../turnos.js');
t('turno 4 (no cruza medianoche) resuelve al dia de produccion', () => {
  const f = retenidoAFilaNC(Object.assign({}, FILA, { 'TURNO': '4' }));
  assert.strictEqual(resolveFechaTurnoRaw(f), '20/9/2026');
});
t('turno 3 (cruza medianoche) resuelve al dia de produccion', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(resolveFechaTurnoRaw(f), '20/9/2026');
});

// ── Llaves toleradas (mismo criterio que _calNorm_ de Calidad.gs) ─────
// _calVerificarEncabezados_ acepta una hoja con "FECHA PRODUCCIÓN" (tilde) o
// "FECHA PRODUCCION " (espacio final) porque compara con esa tolerancia. Si
// retenidoAFilaNC leyera con llave EXACTA, esas filas devolverian null en
// silencio: el retenido queda guardado y nunca resta del indicador. Estas
// pruebas son justo el caso que motivo el arreglo.
const { _retNormClave_ } = require('./retenidos.js');
t('normaliza llave con tilde', () => assert.strictEqual(_retNormClave_('FECHA PRODUCCIÓN'), 'FECHA PRODUCCION'));
t('normaliza llave con espacio final', () => assert.strictEqual(_retNormClave_('FECHA PRODUCCION '), 'FECHA PRODUCCION'));
t('normaliza llave en minuscula', () => assert.strictEqual(_retNormClave_('fecha produccion'), 'FECHA PRODUCCION'));

t('la fila con encabezado tildado SI produce fila NC', () => {
  const filaTilde = Object.assign({}, FILA);
  delete filaTilde['FECHA PRODUCCION'];
  filaTilde['FECHA PRODUCCIÓN'] = '2026-09-20';
  const f = retenidoAFilaNC(filaTilde);
  assert.notStrictEqual(f, null);
  assert.strictEqual(f['FECHA Y HORA'], '20/9/2026');
});
t('la fila con encabezado con espacio final SI produce fila NC', () => {
  const filaEsp = Object.assign({}, FILA);
  delete filaEsp['CANTIDAD RETENIDA'];
  filaEsp['CANTIDAD RETENIDA '] = '4000';
  const f = retenidoAFilaNC(filaEsp);
  assert.notStrictEqual(f, null);
  assert.strictEqual(f['CANTIDAD NC'], 4000);
});
t('la fila con encabezado en minuscula SI produce fila NC', () => {
  const filaMin = {};
  Object.keys(FILA).forEach(k => { filaMin[k.toLowerCase()] = FILA[k]; });
  const f = retenidoAFilaNC(filaMin);
  assert.notStrictEqual(f, null);
  assert.strictEqual(f['CANTIDAD NC'], 4000);
  assert.strictEqual(f['CAUSA'], 'producto Rechazado');
});

// ── saldosRetenidos ────────────────────────────────────────────────
// Lo que el operario ve al buscar una orden en REPROCESOS: cuánto retuvo
// calidad de esa orden y todavía no ha pasado por revisión.
const R = (orden, cant, motivo) => ({
  'ORDEN': orden, 'CANTIDAD RETENIDA': cant, 'MOTIVO RECHAZO': motivo || 'Seleccionar'
});
const P = (orden, revisadas) => ({ 'ORDEN': orden, 'UNIDADES REVISADAS': revisadas });

t('una retencion sin reprocesos deja el saldo completo', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317', '4000')], []), { '1317': 4000 });
});

t('dos retenciones de la misma orden se suman', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000'), R('1317','500')], []), { '1317': 4500 });
});

// Procesar en dos tandas es normal: el operario alcanza lo que alcanza en
// su turno. La segunda vez tiene que ver lo que falta, no el total.
t('reprocesada a medias deja el saldo parcial', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], [P('1317','1500')]), { '1317': 2500 });
});

t('reprocesada completa desaparece', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], [P('1317','4000')]), {});
});

// Nunca un saldo negativo: si revisó de mas, la orden simplemente no aparece.
t('reprocesada de mas no deja saldo negativo', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], [P('1317','9000')]), {});
});

// El descuento va por UNIDADES REVISADAS, no por las que salieron malas:
// lo que consume la retencion es haberla pasado por revision.
t('descuenta por revisadas, no por las malas', () => {
  const rep = [{ 'ORDEN':'1317', 'UNIDADES REVISADAS':'4000', 'UNIDADES NC':'400' }];
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], rep), {});
});

// "producto Rechazado" se va al molino y no se escoge; la derogacion se
// libero. Ninguno de los dos genera trabajo pendiente de reproceso.
t('solo el motivo Seleccionar genera saldo', () => {
  const ret = [R('1317','4000','producto Rechazado'), R('1360','900','Derogacion por varíacion'), R('1400','50')];
  assert.deepStrictEqual(saldosRetenidos(ret, []), { '1400': 50 });
});

t('el motivo se compara sin tildes ni mayusculas', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','80','  seleccionar ')], []), { '1317': 80 });
});

// La orden se digita a mano en varios sitios: si no se normaliza, "1317" y
// " 1317" quedan como dos ordenes distintas y el saldo nunca baja.
t('la orden se agrupa sin espacios ni mayusculas', () => {
  assert.deepStrictEqual(saldosRetenidos([R(' 1317 ','4000')], [P('1317','1000')]), { '1317': 3000 });
});

t('el punto de miles del locale ES se entiende', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','13.600')], [P('1317','600')]), { '1317': 13000 });
});

// Un reproceso sin orden es el caso de hoy: material suelto sin identificar.
// No puede descontar de ninguna retencion.
t('un reproceso sin orden no descuenta de nadie', () => {
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], [P('', '500'), P('   ','700')]), { '1317': 4000 });
});

t('una retencion sin orden o sin cantidad se ignora', () => {
  assert.deepStrictEqual(saldosRetenidos([R('','4000'), R('1317',''), R('1317','0')], []), {});
});

t('unidades revisadas vacias o basura no rompen la cuenta', () => {
  const rep = [P('1317',''), P('1317','ninguna'), P('1317','1000')];
  assert.deepStrictEqual(saldosRetenidos([R('1317','4000')], rep), { '1317': 3000 });
});

// Los encabezados de estas hojas se editan a mano y llegan con tildes y
// espacios de sobra. La misma trampa que ya se arreglo en retenidoAFilaNC.
t('llaves con tilde, espacio y minuscula se leen igual', () => {
  const ret = [{ 'orden':'1317', 'Cantidad Retenida ':'4000', 'MOTIVO RECHAZO':'Seleccionar' }];
  const rep = [{ 'Orden':'1317', 'UNIDADES REVISADAS ':'1000' }];
  assert.deepStrictEqual(saldosRetenidos(ret, rep), { '1317': 3000 });
});

t('listas vacias o undefined devuelven objeto vacio', () => {
  assert.deepStrictEqual(saldosRetenidos([], []), {});
  assert.deepStrictEqual(saldosRetenidos(undefined, undefined), {});
});

t('retClaveOrden normaliza', () => {
  assert.strictEqual(retClaveOrden(' 1317 '), '1317');
  assert.strictEqual(retClaveOrden(1317), '1317');
  assert.strictEqual(retClaveOrden(''), '');
  assert.strictEqual(retClaveOrden(null), '');
});

// ── ordenesParaMoler ───────────────────────────────────────────────
// Lo que el molino ofrece: retenciones de "producto Rechazado" que todavia
// nadie ha molido. No es aritmetica sino un interruptor: la retencion esta
// en unidades y el molino reporta kilos, asi que no se pueden restar.
const RM = (orden, cant, motivo) => ({
  'ORDEN': orden, 'CANTIDAD RETENIDA': cant, 'MOTIVO RECHAZO': motivo || 'producto Rechazado'
});
const M = (ordenRetenida) => ({ 'ORDEN RETENIDA': ordenRetenida });

t('una retencion para moler sin moliendas aparece con sus unidades', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600')], []), { '1307': 3600 });
});

// El interruptor: basta una molienda que la nombre para darla por resuelta.
t('con una molienda que la nombra, desaparece', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600')], [M('1307')]), {});
});

t('una molienda de OTRA orden no la resuelve', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600')], [M('1360')]), { '1307': 3600 });
});

// Lo de "Seleccionar" se escoge, no se muele: ofrecerlo invitaria a moler
// producto que habia que rescatar.
t('Seleccionar y Derogacion nunca se ofrecen para moler', () => {
  const ret = [RM('1317','4000','Seleccionar'), RM('1360','900','Derogacion por varíacion'), RM('1307','50')];
  assert.deepStrictEqual(ordenesParaMoler(ret, []), { '1307': 50 });
});

t('dos retenciones de la misma orden se suman en una entrada', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600'), RM('1307','400')], []), { '1307': 4000 });
});

// Y si una de las dos ya se molio, la orden entera queda resuelta: el
// interruptor no distingue cuanto se molio, solo que se molio.
t('una molienda resuelve la orden completa, aunque tenga varias retenciones', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600'), RM('1307','400')], [M('1307')]), {});
});

t('la orden para moler se agrupa sin espacios ni mayusculas en los dos lados', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM(' 1307 ','3600')], [M('1307')]), {});
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600')], [M('  1307')]), {});
});

t('una molienda sin ORDEN RETENIDA no resuelve nada', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','3600')], [M(''), M('   '), {}]), { '1307': 3600 });
});

t('el punto de miles del locale ES se entiende al moler', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('1307','13.600')], []), { '1307': 13600 });
});

t('retenciones para moler sin orden o sin cantidad se ignoran', () => {
  assert.deepStrictEqual(ordenesParaMoler([RM('','3600'), RM('1307',''), RM('1307','0')], []), {});
});

// Los encabezados de estas hojas se editan a mano y llegan con tildes y
// espacios de sobra, en las dos hojas.
t('llaves con tilde y espacio se leen igual al moler', () => {
  const ret = [{ 'orden':'1307', 'Cantidad Retenida ':'3600', 'motivo rechazo':'producto Rechazado' }];
  assert.deepStrictEqual(ordenesParaMoler(ret, []), { '1307': 3600 });
  assert.deepStrictEqual(ordenesParaMoler(ret, [{ 'Orden Retenida ':'1307' }]), {});
});

t('listas vacias o undefined al moler devuelven objeto vacio', () => {
  assert.deepStrictEqual(ordenesParaMoler([], []), {});
  assert.deepStrictEqual(ordenesParaMoler(undefined, undefined), {});
});


console.log('\n' + passed + ' pruebas OK');
