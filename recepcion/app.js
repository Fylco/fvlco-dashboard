'use strict';
/* ═══════════════════════════════════════════════════════════════
   FYL · RECEPCIÓN DE MATERIA PRIMA
   Página aparte de la PWA de operarios: la usa la secretaría desde un
   escritorio. Backend: RecepcionMP.gs (acciones recepLogin / recepRegistrar).

   Diseño: docs/superpowers/specs/2026-08-20-inventario-mp-design.md §5.4
           docs/superpowers/specs/2026-08-21-inventario-mp-bolsa-enmienda.md §2

   Decisiones que NO hay que romper:
   - La clave NUNCA se guarda en disco: vive en sessionStorage y se pierde
     al cerrar la pestaña. El servidor la valida en cada llamada.
   - KG FACTURA y KG VERIFICADOS son dos campos distintos a propósito: su
     diferencia acumulada por proveedor es el faltante reclamable, que hoy
     no existe en ninguna parte.
   - El FABRICANTE va por línea, no en la cabecera: parte la bolsa de
     material. El PROVEEDOR va en la cabecera: no la parte.
   - El id lo genera el cliente para que un reenvío no duplique la factura.
   ═══════════════════════════════════════════════════════════════ */

var GAS_URL = 'https://script.google.com/macros/s/AKfycbwQuK-xVJ1KE8CHIf4sEdYyuePoTQ74VDcusSbBh1dUK6yvE_v0_r6QAcKZJ9YC1yma4w/exec';

var CAT = { proveedores: [], fabricantes: [], referencias: [], familias: [] };
var ENVIANDO = false;

function $(id) { return document.getElementById(id); }
function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
function num(v) { return parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0; }
function numId(id) { return num(val(id)); }
function nf(n) { return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 }); }

function toast(msg, tipo) {
  var t = $('toast');
  t.textContent = msg; t.className = tipo || 'ok'; t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.style.display = 'none'; }, 4000);
}

/* La clave solo en memoria de sesión: nunca en localStorage. */
function pw() { return sessionStorage.getItem('fvlco_recep_pw') || ''; }

function llamar(accion, datos) {
  datos = datos || {};
  datos.pw = pw();
  return fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ accion: accion, datos: datos }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.status === 'error') {
        if (String(d.message).indexOf('CLAVE_INCORRECTA') >= 0) {
          sessionStorage.removeItem('fvlco_recep_pw');
          mostrarLogin('La clave no es correcta o la sesión se cerró.');
          throw new Error('auth');
        }
        throw new Error(d.message);
      }
      return d;
    });
}

/* ── Login ──────────────────────────────────────────────────── */
function mostrarLogin(err) {
  $('login').classList.remove('oculto');
  var e = $('loginErr');
  if (err) { e.textContent = err; e.className = 'on'; } else { e.className = ''; }
  $('pw').value = ''; $('pw').focus();
}

function entrar() {
  var clave = val('pw');
  if (!clave) { mostrarLogin('Escribe la clave.'); return; }
  sessionStorage.setItem('fvlco_recep_pw', clave);
  $('btnEntrar').disabled = true;
  llamar('recepLogin', {})
    .then(function (d) {
      $('btnEntrar').disabled = false;
      guardarCatalogos(d);
      $('login').classList.add('oculto');
    })
    .catch(function (e) {
      $('btnEntrar').disabled = false;
      if (e.message !== 'auth') mostrarLogin('No se pudo entrar: ' + e.message);
    });
}

function guardarCatalogos(d) {
  CAT.proveedores = d.proveedores || [];
  CAT.fabricantes = d.fabricantes || [];
  CAT.referencias = d.referencias || [];
  CAT.familias    = d.familias || [];
  llenarDatalist('l-prov', CAT.proveedores);
  var u = $('ultimoDoc');
  if (u) u.textContent = d.ultimoDoc ? ('último: ' + d.ultimoDoc) : '';
  // Repintar las listas de las líneas que ya estén en pantalla
  Array.prototype.forEach.call(document.querySelectorAll('#lineas tr'), refrescarListas);
}

function llenarDatalist(id, valores) {
  var dl = $(id);
  if (!dl) return;
  dl.innerHTML = '';
  valores.forEach(function (v) {
    var o = document.createElement('option'); o.value = v; dl.appendChild(o);
  });
}

/* ── Líneas ─────────────────────────────────────────────────── */
var seqDatalist = 0;

function agregarLinea() {
  seqDatalist++;
  var n = seqDatalist;
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td class="idx"></td>' +
    '<td><select class="l-fam w-sel"></select></td>' +
    '<td><input class="l-ref w-sel" list="dl-ref-' + n + '" autocomplete="off" placeholder="Ej. LH5420">' +
      '<datalist id="dl-ref-' + n + '"></datalist></td>' +
    '<td><input class="l-fab w-sel" list="dl-fab-' + n + '" autocomplete="off" placeholder="Ej. PROPILCO">' +
      '<datalist id="dl-fab-' + n + '"></datalist></td>' +
    '<td><input class="l-lote w-lote" autocomplete="off" placeholder="Si no viene, se genera"></td>' +
    '<td><input class="l-bul w-num" type="number" min="0" step="1" placeholder="0"></td>' +
    '<td><input class="l-fac w-num" type="number" min="0" step="0.1" placeholder="0"></td>' +
    '<td><input class="l-ver w-num" type="number" min="0" step="0.1" placeholder="0"></td>' +
    '<td class="dif d-none" data-dif>—</td>' +
    '<td><button class="btn-x" type="button" title="Quitar" aria-label="Quitar línea">&times;</button></td>';
  $('lineas').appendChild(tr);

  refrescarListas(tr);

  tr.querySelector('.btn-x').addEventListener('click', function () {
    tr.parentNode.removeChild(tr);
    if (!$('lineas').children.length) agregarLinea();
    renumerar(); recalcular();
  });
  ['.l-bul', '.l-fac', '.l-ver'].forEach(function (s) {
    tr.querySelector(s).addEventListener('input', recalcular);
  });

  renumerar(); recalcular();
  return tr;
}

/* Los desplegables se alimentan de los maestros Y de lo ya registrado, así
   que el panel sirve aunque CATALOGO MP y PROVEEDORES MP estén vacíos. */
function refrescarListas(tr) {
  var fam = tr.querySelector('.l-fam');
  if (fam) {
    var actual = fam.value;
    fam.innerHTML = '<option value="">—</option>';
    CAT.familias.forEach(function (f) {
      var o = document.createElement('option'); o.value = f; o.textContent = f; fam.appendChild(o);
    });
    if (actual) fam.value = actual;
  }
  var ref = tr.querySelector('.l-ref'), fab = tr.querySelector('.l-fab');
  if (ref) llenarDatalist(ref.getAttribute('list'), CAT.referencias);
  if (fab) llenarDatalist(fab.getAttribute('list'), CAT.fabricantes);
}

function renumerar() {
  var filas = $('lineas').querySelectorAll('tr');
  for (var i = 0; i < filas.length; i++) filas[i].querySelector('.idx').textContent = i + 1;
}

function recalcular() {
  var filas = $('lineas').querySelectorAll('tr');
  var tB = 0, tF = 0, tV = 0, comparables = 0;

  for (var i = 0; i < filas.length; i++) {
    var r = filas[i];
    var b = num(r.querySelector('.l-bul').value);
    var f = num(r.querySelector('.l-fac').value);
    var v = num(r.querySelector('.l-ver').value);
    var celda = r.querySelector('[data-dif]');
    tB += b; tF += f; tV += v;

    if (f > 0 && v > 0) {
      comparables++;
      var d = v - f;
      celda.className = 'dif ' + (Math.abs(d) < 0.05 ? 'd-ok' : (d < 0 ? 'd-falta' : 'd-sobra'));
      celda.textContent = Math.abs(d) < 0.05 ? 'Exacto' : (d > 0 ? '+' : '') + nf(d) + ' kg';
    } else {
      celda.className = 'dif d-none'; celda.textContent = '—';
    }
  }

  $('t-lineas').textContent = filas.length;
  $('t-bultos').textContent = nf(tB);
  $('t-fact').innerHTML = nf(tF) + ' <span class="u">kg</span>';
  $('t-ver').innerHTML  = nf(tV) + ' <span class="u">kg</span>';

  var box = $('t-dif-box'), out = $('t-dif');
  if (!comparables) { box.className = 'tot idle'; out.innerHTML = '—'; return; }
  var dt = tV - tF, pct = tF > 0 ? (dt / tF) * 100 : 0;
  if (Math.abs(dt) < 0.05) { box.className = 'tot bien'; out.innerHTML = 'Exacto'; }
  else {
    box.className = 'tot mal';
    out.innerHTML = (dt > 0 ? '+' : '') + nf(dt) +
      ' <span class="u">kg · ' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%</span>';
  }
}

function leerLineas() {
  var out = [];
  Array.prototype.forEach.call($('lineas').querySelectorAll('tr'), function (r) {
    var ref = r.querySelector('.l-ref').value.trim();
    var ver = num(r.querySelector('.l-ver').value);
    if (!ref && !ver) return;                 // fila vacía: se ignora
    out.push({
      familia:       r.querySelector('.l-fam').value,
      referencia:    ref,
      fabricante:    r.querySelector('.l-fab').value.trim(),
      lote:          r.querySelector('.l-lote').value.trim(),
      bultos:        num(r.querySelector('.l-bul').value),
      kgFactura:     num(r.querySelector('.l-fac').value),
      kgVerificados: ver
    });
  });
  return out;
}

/* ── Guardar ────────────────────────────────────────────────── */
function guardar() {
  if (ENVIANDO) return;

  var faltan = [];
  if (!val('f-prov')) faltan.push('f-prov');
  if (!val('f-doc'))  faltan.push('f-doc');
  ['f-prov', 'f-doc'].forEach(function (id) {
    $(id).classList[faltan.indexOf(id) >= 0 ? 'add' : 'remove']('err');
  });
  if (faltan.length) { toast('Falta el proveedor o el número del documento', 'warn'); return; }

  var lineas = leerLineas();
  if (!lineas.length) { toast('Agrega al menos un material', 'warn'); return; }

  for (var i = 0; i < lineas.length; i++) {
    if (!lineas[i].referencia) { toast('Línea ' + (i + 1) + ': falta la referencia', 'warn'); return; }
    if (lineas[i].kgVerificados <= 0) {
      toast('Línea ' + (i + 1) + ': faltan los kilos verificados', 'warn'); return;
    }
  }

  var datos = {
    idRegistro: 'r' + Date.now() + '-' + Math.floor(Math.random() * 100000),
    fechaRecepcion: val('f-fecha'),
    proveedor: val('f-prov'),
    tipoDoc: val('f-tipo'),
    nDoc: val('f-doc'),
    recibidoPor: val('f-recibe'),
    verificadoPor: val('f-verifica'),
    observacion: val('f-obs'),
    valorTotal: numId('f-valor'),
    lineas: lineas
  };

  ENVIANDO = true;
  $('btnGuardar').disabled = true;
  llamar('recepRegistrar', datos)
    .then(function (d) {
      ENVIANDO = false; $('btnGuardar').disabled = false;
      pintarSiigo(datos, d);
      toast(d.message || 'Entrada registrada', d.faltanteKg < 0 ? 'warn' : 'ok');
      // Refrescar catálogos: lo que se acaba de digitar ya sirve de sugerencia
      llamar('recepCatalogos', {}).then(guardarCatalogos).catch(function () {});
    })
    .catch(function (e) {
      ENVIANDO = false; $('btnGuardar').disabled = false;
      if (e.message !== 'auth') toast('No se guardó: ' + e.message, 'err');
    });
}

/* ── Resumen para Siigo ─────────────────────────────────────── */
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function pintarSiigo(datos, resp) {
  var L = [];
  L.push('RECEPCION DE MATERIA PRIMA');
  L.push('------------------------------------------------------------');
  L.push('Fecha        : ' + (datos.fechaRecepcion || '-'));
  L.push('Proveedor    : ' + datos.proveedor);
  L.push('Documento    : ' + datos.tipoDoc + ' ' + datos.nDoc);
  if (datos.recibidoPor)   L.push('Recibido por : ' + datos.recibidoPor);
  if (datos.verificadoPor) L.push('Verificado   : ' + datos.verificadoPor);
  if (datos.valorTotal)    L.push('Valor total  : $' + nf(datos.valorTotal));
  L.push('');
  L.push(pad('REFERENCIA', 16) + pad('FABRICANTE', 14) + pad('LOTE', 14) +
         pad('BULTOS', 8) + pad('KG FACT', 10) + 'KG VERIF');
  L.push('------------------------------------------------------------');

  var tB = 0, tF = 0, tV = 0;
  datos.lineas.forEach(function (x) {
    tB += x.bultos; tF += x.kgFactura; tV += x.kgVerificados;
    L.push(pad(x.referencia, 16) + pad(x.fabricante || '-', 14) +
           pad(x.lote || '(generado)', 14) + pad(nf(x.bultos), 8) +
           pad(nf(x.kgFactura), 10) + nf(x.kgVerificados));
  });
  L.push('------------------------------------------------------------');
  L.push(pad('TOTAL', 44) + pad(nf(tB), 8) + pad(nf(tF), 10) + nf(tV));

  var d = tV - tF;
  if (tF > 0 && Math.abs(d) >= 0.05) {
    L.push('');
    L.push((d < 0 ? 'FALTANTE: ' : 'SOBRANTE: ') + nf(Math.abs(d)) + ' kg frente a la factura');
  }
  if (resp && resp.lotesGenerados) {
    L.push('');
    L.push('El sistema genero ' + resp.lotesGenerados + ' lote(s) porque el proveedor no los trajo.');
  }
  if (datos.observacion) { L.push(''); L.push('Observacion: ' + datos.observacion); }

  $('siigo-txt').textContent = L.join('\n');
  $('siigo').classList.add('on');
  $('siigo').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function copiar() {
  var txt = $('siigo-txt');
  var seleccionar = function () {
    var rng = document.createRange(); rng.selectNodeContents(txt);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
    toast('Seleccionado — presiona Ctrl+C', 'warn');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt.textContent)
      .then(function () { toast('Copiado', 'ok'); }, seleccionar);
  } else { seleccionar(); }
}

function limpiar() {
  ['f-doc', 'f-obs', 'f-valor'].forEach(function (id) { $(id).value = ''; });
  ['f-prov', 'f-doc'].forEach(function (id) { $(id).classList.remove('err'); });
  $('lineas').innerHTML = '';
  seqDatalist = 0;
  agregarLinea();
  $('siigo').classList.remove('on');
}

/* ── Arranque ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', function () {
  var hoy = new Date();
  $('f-fecha').value = hoy.getFullYear() + '-' +
    String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoy.getDate()).padStart(2, '0');

  $('btnEntrar').addEventListener('click', entrar);
  $('pw').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); entrar(); }
  });
  $('btnAgregar').addEventListener('click', agregarLinea);
  $('btnGuardar').addEventListener('click', guardar);
  $('btnLimpiar').addEventListener('click', limpiar);
  $('btnCopiar').addEventListener('click', copiar);

  agregarLinea();

  // Si la sesión sigue viva (F5), entra directo
  if (pw()) {
    llamar('recepLogin', {})
      .then(function (d) { guardarCatalogos(d); $('login').classList.add('oculto'); })
      .catch(function () {});
  }
});
