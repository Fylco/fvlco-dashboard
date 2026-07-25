const assert = require('node:assert');
const { reconstruirAcumReal, datosInconsistentes, proyectarDiaCumplimiento,
  comparaRequeridoVsPedidos, comparaRequeridoVsPlan } = require('./programacion.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// ── reconstruirAcumReal ──────────────────────────────────────────────────
t('reconstruirAcumReal: suma corrida simple sin huecos', () => {
  const out = reconstruirAcumReal([10, 20, 30]);
  assert.deepStrictEqual(out.acum, [10, 30, 60]);
  assert.strictEqual(out.lastIdx, 2);
  assert.strictEqual(out.total, 60);
});

t('reconstruirAcumReal: huecos (null) no rompen la suma ni avanzan lastIdx', () => {
  const out = reconstruirAcumReal([10, null, 20]);
  assert.deepStrictEqual(out.acum, [10, 10, 30]);
  assert.strictEqual(out.lastIdx, 2); // el día 3 sí reportó, avanza
});

t('reconstruirAcumReal: huecos al final no avanzan lastIdx (no reportados aún)', () => {
  const out = reconstruirAcumReal([10, 20, null, null]);
  assert.deepStrictEqual(out.acum, [10, 30, 30, 30]);
  assert.strictEqual(out.lastIdx, 1); // días 3 y 4 aún no se reportan
});

t('reconstruirAcumReal: un 0 explícito SÍ avanza lastIdx (a diferencia del bug original)', () => {
  const out = reconstruirAcumReal([10, 0, null]);
  assert.strictEqual(out.lastIdx, 1); // el día 2 reportó "0", cuenta como dato
  assert.deepStrictEqual(out.acum, [10, 10, 10]);
});

t('reconstruirAcumReal: reproduce el caso real de "Tapa 15 mm terra" (julio 2026)', () => {
  // fila CANTIDAD REAL (MANUAL) tal cual viene del Sheet — incluye el hueco del
  // 19/07 y el "reinicio" de ACUM REAL que ocurre a partir del 20/07 en el Sheet
  // (pero aquí usamos la fila DIARIA, que nunca se rompió)
  const realDiario = [
    146000, 143000, 143123, 113000, 43000, 149000, 101400, 87000, 99500, 48000,
    0, 0, 0, 34000, 63000, 97500, 126000, 47400, null, 45350,
    137199, 98000, 122000, null, null, null, null, null, null, null, null,
  ];
  const out = reconstruirAcumReal(realDiario);
  assert.strictEqual(out.total, 1843472); // coincide con SUMA TOTAL REAL del Sheet
  assert.strictEqual(out.lastIdx, 22); // 23/07/2026, último día reportado
});

// ── datosInconsistentes ───────────────────────────────────────────────────
t('datosInconsistentes: coincide dentro de tolerancia → false', () => {
  assert.strictEqual(datosInconsistentes(1843472, 1843472), false);
  assert.strictEqual(datosInconsistentes(1843472, 1843470), false); // diferencia mínima
});

t('datosInconsistentes: diferencia grande → true', () => {
  assert.strictEqual(datosInconsistentes(402549, 1843472), true);
});

t('datosInconsistentes: ambos en cero → false (no hay nada que comparar)', () => {
  assert.strictEqual(datosInconsistentes(0, 0), false);
});

// ── proyectarDiaCumplimiento ──────────────────────────────────────────────
const fechasJulio = Array.from({ length: 31 }, (_, i) => `${i + 1}/07/2026`);

t('proyectarDiaCumplimiento: no alcanza en el mes', () => {
  const { acum, lastIdx } = reconstruirAcumReal([10000, 10000, 10000]); // ritmo bajo
  const out = proyectarDiaCumplimiento({ requerida: 10000000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'No alcanza en el mes');
});

t('proyectarDiaCumplimiento: ya cumplido, muestra el día en que se alcanzó', () => {
  const { acum, lastIdx } = reconstruirAcumReal([50000, 50000, 50000]);
  const out = proyectarDiaCumplimiento({ requerida: 90000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'Cumplido el 2/07/2026'); // acum[1] = 100000 >= 90000
});

t('proyectarDiaCumplimiento: sin producción registrada', () => {
  const { acum, lastIdx } = reconstruirAcumReal([null, null, null]);
  const out = proyectarDiaCumplimiento({ requerida: 90000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'Sin producción registrada');
});

t('proyectarDiaCumplimiento: proyecta una fecha dentro del mes cuando el ritmo alcanza', () => {
  // ritmo 50.000/día, faltan 100.000 tras el día 2 → cumple el día 4
  const { acum, lastIdx } = reconstruirAcumReal([50000, 50000]);
  const out = proyectarDiaCumplimiento({ requerida: 200000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, '4/07/2026');
});

// normalizador de prueba (mismo criterio que capNorm de capacidad.js, pero
// definido aquí para no acoplar este test a ese módulo): mayúsculas, tokens
// ordenados — tolera que las dos hojas nombren el producto en orden distinto.
const norm = s => (String(s || '').toUpperCase().match(/[A-Z0-9]+/g) || []).sort().join(' ');

// ── comparaRequeridoVsPedidos ─────────────────────────────────────────────
t('comparaRequeridoVsPedidos: pedidos superan el requerido más allá de la tolerancia → alerta', () => {
  const blocks = [{ producto: 'Valvula Terra 48', requerida: 680000 }];
  const pedidos = [{ producto: 'Terra Valvula 48', cant: 864000 }];
  const out = comparaRequeridoVsPedidos(blocks, pedidos, norm);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].producto, 'Valvula Terra 48');
  assert.strictEqual(out[0].requerido, 680000);
  assert.strictEqual(out[0].pedidos, 864000);
  assert.strictEqual(out[0].diferencia, 184000);
});

t('comparaRequeridoVsPedidos: pedidos dentro de tolerancia (5%) → sin alerta', () => {
  const blocks = [{ producto: 'Producto A', requerida: 100000 }];
  const pedidos = [{ producto: 'Producto A', cant: 103000 }]; // 3% de más, dentro de tolerancia
  const out = comparaRequeridoVsPedidos(blocks, pedidos, norm);
  assert.strictEqual(out.length, 0);
});

t('comparaRequeridoVsPedidos: pedidos por debajo del requerido → sin alerta (no es el riesgo que nos interesa)', () => {
  const blocks = [{ producto: 'Producto B', requerida: 500000 }];
  const pedidos = [{ producto: 'Producto B', cant: 200000 }];
  const out = comparaRequeridoVsPedidos(blocks, pedidos, norm);
  assert.strictEqual(out.length, 0);
});

t('comparaRequeridoVsPedidos: suma varios pedidos del mismo producto antes de comparar', () => {
  const blocks = [{ producto: 'Producto C', requerida: 100000 }];
  const pedidos = [{ producto: 'Producto C', cant: 60000 }, { producto: 'Producto C', cant: 60000 }];
  const out = comparaRequeridoVsPedidos(blocks, pedidos, norm);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].pedidos, 120000);
});

t('comparaRequeridoVsPedidos: producto de PROGRAMACIÓN sin ningún pedido asociado → sin alerta', () => {
  const blocks = [{ producto: 'Producto D', requerida: 50000 }];
  const out = comparaRequeridoVsPedidos(blocks, [], norm);
  assert.strictEqual(out.length, 0);
});

// ── comparaRequeridoVsPlan ────────────────────────────────────────────────
t('comparaRequeridoVsPlan: el plan produce de más frente al requerido → alerta plan_de_mas', () => {
  const out = comparaRequeridoVsPlan([{ producto: 'Producto E', requerida: 680000, totalPlaneada: 771120 }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tipo, 'plan_de_mas');
  assert.strictEqual(out[0].diferencia, 91120);
});

t('comparaRequeridoVsPlan: el plan nunca llega al requerido → alerta plan_de_menos', () => {
  const out = comparaRequeridoVsPlan([{ producto: 'Producto F', requerida: 1000000, totalPlaneada: 685440 }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tipo, 'plan_de_menos');
  assert.strictEqual(out[0].diferencia, -314560);
});

t('comparaRequeridoVsPlan: requerido en cero pero con plan activo → alerta sin_requerido', () => {
  const out = comparaRequeridoVsPlan([{ producto: 'Producto G', requerida: 0, totalPlaneada: 108050 }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tipo, 'sin_requerido');
  assert.strictEqual(out[0].plan, 108050);
});

t('comparaRequeridoVsPlan: diferencia dentro de tolerancia → sin alerta', () => {
  const out = comparaRequeridoVsPlan([{ producto: 'Producto H', requerida: 2620000, totalPlaneada: 2577920 }]); // -1.6%
  assert.strictEqual(out.length, 0);
});

t('comparaRequeridoVsPlan: requerido y plan ambos en cero → sin alerta', () => {
  const out = comparaRequeridoVsPlan([{ producto: 'Producto I', requerida: 0, totalPlaneada: 0 }]);
  assert.strictEqual(out.length, 0);
});

console.log(`\n${passed} pruebas OK`);
