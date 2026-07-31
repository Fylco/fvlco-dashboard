'use strict';

/* ═══════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════ */
var GD = {
  ordenes:[], operarios:[], maquinasIny:[], maquinasTap:[],
  motivosParoIny:[], motivosParoTap:[], causasIny:[], causasTap:[],
  turnos:[], tapadoras:['5','6'], turnoSugerido:1, turnosValidos:[1],
  tiempoTurno:{}
};
var GS = {
  maq:null, orden:null, turno:1, esTap:false,
  horaInicio:null, prodCount:0, paroCount:0, confirmarCb:null
};

/* ═══════════════════════════════════════════════════════
   OPERACIONES ESPECIALES
═══════════════════════════════════════════════════════ */
var OPDEF = {
  MOLINO: {
    color:'#ea580c', icon:'⚙️', label:'MOLINO',
    backend:'registrarMolino',
    fields:[
      {id:'mRef',  label:'Material',  type:'select',   req:true,
       options:['LLDPE','HDPE','PP','REMOLIDO HDPE','50 / 50']},
      {id:'mKg',   label:'Kilos molidos',         type:'number',   req:true,  step:'0.01'},
      {id:'mBar',  label:'Kilos barradura',       type:'number',   req:false, step:'0.01'},
      {id:'mHH',   label:'Horas Trabajadas',          type:'number',   req:true,  step:'0.5'},
      {id:'mObs',  label:'Observaciones',         type:'textarea', req:false}
    ],
    collect:function(){ return { referencia:val('mRef'), kilosMolidos:val('mKg'), kilosBarradura:val('mBar')||0, horasHombre:val('mHH'), observacion:val('mObs') }; },
    validate:function(){ return reqs(['mRef','mKg','mHH']); },
    summary:function(){ return [['Referencia',val('mRef')],['Kg molidos',val('mKg')],['Kg barradura',val('mBar')||'0'],['H. Trabajadas',val('mHH')]]; }
  },
  MANUALIDADES: {
    color:'#7c3aed', icon:'✋', label:'MANUALIDADES',
    backend:'registrarManualidades',
    fields:[
      {id:'mndOrden', label:'Orden de producción',  type:'text',     req:true},
      {id:'mndDesc',  label:'Descripción actividad', type:'text',     req:true},
      {id:'mndHH',    label:'Horas trabajadas',      type:'number',   req:true, step:'0.5'},
      {id:'mndObs',   label:'Observaciones',         type:'textarea', req:false}
    ],
    collect:function(){ return { orden:val('mndOrden'), descripcion:val('mndDesc'), horasTrabajadas:val('mndHH'), observacion:val('mndObs') }; },
    validate:function(){ return reqs(['mndOrden','mndDesc','mndHH']); },
    summary:function(){ return [['Orden',val('mndOrden')],['Actividad',val('mndDesc')],['Horas',val('mndHH')]]; }
  },
  REPROCESOS: {
    color:'#0b4ec0', icon:'🔄', label:'REPROCESOS',
    backend:'registrarReproceso',
    fields:[
      {id:'rpProd',  label:'Producto',  type:'select', req:true, options:[]},
      {id:'rpRev',   label:'Unidades revisadas',  type:'number',   req:true},
      {id:'rpNC',    label:'Unidades NC',         type:'number',   req:true},
      {id:'rpCausa', label:'Causa NC',            type:'text',     req:true},
      {id:'rpHH',    label:'Horas Trabajadas',        type:'number',   req:true, step:'0.5'},
      {id:'rpObs',   label:'Observaciones',       type:'textarea', req:false}
    ],
    collect:function(){ return { producto:val('rpProd'), unidadesRevisadas:val('rpRev'), unidadesNC:val('rpNC'), causaNC:val('rpCausa'), horasHombre:val('rpHH'), observacion:val('rpObs') }; },
    validate:function(){ return reqs(['rpProd','rpRev','rpNC','rpCausa','rpHH']); },
    summary:function(){ return [['Producto',val('rpProd')],['Revisadas',val('rpRev')],['NC',val('rpNC')],['Causa',val('rpCausa')],['H. Trabajadas',val('rpHH')]]; }
  }
};

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function $(id){ return document.getElementById(id); }
function val(id){ var e=$(id); return e ? e.value.trim() : ''; }
function numV(id){ return parseFloat((val(id)||'0').replace(',','.'))||0; }
function show(id, v){ var e=$(id); if(e) e.style.display = v ? '' : 'none'; }
function cls(id, c, on){ var e=$(id); if(e) e.classList[on?'add':'remove'](c); }
function fmt2(n){ return n<10?'0'+n:''+n; }
function nf(n){ return Number(n).toLocaleString('es-CO'); }

function merge(a, b){
  var r = {};
  for(var k in a) if(a.hasOwnProperty(k)) r[k]=a[k];
  for(var k in b) if(b.hasOwnProperty(k)) r[k]=b[k];
  return r;
}

function toast(msg, tipo){
  var t=$('toast'); t.textContent=msg;
  t.className=tipo||'ok'; t.style.display='block';
  clearTimeout(toast._t);
  toast._t=setTimeout(function(){ t.style.display='none'; }, 3400);
}

function reqs(ids){
  var ok=true;
  ids.forEach(function(id){
    var e=$(id); if(!e) return;
    if(!e.value.trim()){ e.classList.add('err-f'); ok=false; }
    else e.classList.remove('err-f');
  });
  return ok;
}

function limpiarErrores(){
  document.querySelectorAll('.err-f').forEach(function(e){ e.classList.remove('err-f'); });
}

/* ═══════════════════════════════════════════════════════
   PUENTE BACKEND — fetch() contra el Web App de Google Apps Script.
   GET  ?action=datos   → obtenerDatosIniciales()
   POST {accion, datos} → registrarProduccionWeb / registrarParadaWeb /
                           registrarCalidadWeb / registrarMolino /
                           registrarManualidades / registrarReproceso
═══════════════════════════════════════════════════════ */
var GAS_URL = 'https://script.google.com/macros/s/AKfycbyuOgZDlZEuBss5oxvg7a80hmBW1WMABpwm8B3SNBWnNuNaBvcHgtCCH9iCVxlCuBcZ7g/exec';

function obtenerDatosDesdeBackend(){
  return fetch(GAS_URL + '?action=datos').then(function(res){
    if(!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  });
}

/* Envía un registro al backend. Si no hay internet o la petición falla,
   lo guarda en la cola local (IndexedDB) y lo marca offline:true —
   el operario ve "guardado local" en vez de un error. */
function llamarBackend(accion, datos){
  function guardarLocal(){
    return encolar({ accion:accion, datos:datos, ts:Date.now() }).then(function(){
      actualizarBadgeOffline();
      return { status:'success', offline:true };
    });
  }
  if(!navigator.onLine) return guardarLocal();

  return fetch(GAS_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },   // evita preflight CORS (GAS no responde OPTIONS)
    body: JSON.stringify({ accion:accion, datos:datos })
  }).then(function(res){
    if(!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }).catch(function(){
    return guardarLocal();
  });
}

/* Sincroniza la cola local con el Sheet, uno por uno, en orden.
   Se detiene en el primer fallo (probablemente seguimos sin internet real).
   Usa Web Locks para que, con varias pestañas/ventanas de la misma máquina
   abiertas (una cola compartida por origen), SOLO UNA sincronice a la vez —
   evita que dos pestañas envíen el mismo registro pendiente duplicado. */
function sincronizarPendientes(){
  if(!navigator.locks){ return _sincronizarPendientesInterno_(); }
  return navigator.locks.request('fvl-sync-lock', {ifAvailable:true}, function(lock){
    if(!lock) return;  // otra pestaña ya está sincronizando ahora mismo
    return _sincronizarPendientesInterno_();
  });
}

function _sincronizarPendientesInterno_(){
  return obtenerPendientes().then(function(pendientes){
    if(!pendientes.length){ actualizarBadgeOffline(); return; }
    var i = 0;
    function siguiente(){
      if(i >= pendientes.length){
        toast('✅ '+pendientes.length+' registro(s) pendiente(s) sincronizado(s)','ok');
        actualizarBadgeOffline();
        return;
      }
      var p = pendientes[i];
      fetch(GAS_URL, {
        method:'POST',
        headers:{ 'Content-Type':'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion:p.accion, datos:p.datos })
      }).then(function(res){
        if(!res.ok) throw new Error('HTTP '+res.status);
        return res.json();
      }).then(function(){
        return eliminarDeCola(p.id);
      }).then(function(){
        i++; siguiente();
      }).catch(function(){
        actualizarBadgeOffline();   // se detiene — seguimos sin conexión real
      });
    }
    siguiente();
  });
}

function actualizarBadgeOffline(){
  obtenerPendientes().then(function(pendientes){
    var n = pendientes.length;
    cls('offlineBar','show', n>0 || !navigator.onLine);
    var badge = $('pendCount');
    if(badge) badge.textContent = n>0 ? ('· '+n+' pendiente'+(n===1?'':'s')) : '';
  });
}

window.addEventListener('online', function(){
  toast('✅ Conexión restablecida — sincronizando...','ok');
  sincronizarPendientes();
});
window.addEventListener('offline', function(){
  actualizarBadgeOffline();
  toast('📴 Sin conexión — los registros se guardarán en este dispositivo','warn');
});

/* ═══════════════════════════════════════════════════════
   CONSTRUIR PANEL DE OPERACIONES ESPECIALES
═══════════════════════════════════════════════════════ */
function buildOpPanel(){
  var html='';
  var names = ['MOLINO','MANUALIDADES','REPROCESOS'];
  names.forEach(function(name){
    var op=OPDEF[name];
    html += '<div class="op-sec" id="sec'+name+'">';
    // Card datos generales (turno + operario)
    html += '<div class="card"><div class="hd hd-gr">📋 DATOS GENERALES</div><div class="bd">';
    html += '<label>Turno <span class="req">*</span></label>';
    html += '<div class="seg" id="segT_'+name+'"></div>';
    html += '<div class="tal" id="tAl_'+name+'">⚠️ CORREGIR TURNO — no corresponde a la hora actual</div>';
    html += '<div class="fld"><label>Operario <span class="req">*</span></label><select id="opOp_'+name+'"></select></div>';
    html += '</div></div>';
    // Card campos de la operación
    html += '<div class="card"><div class="hd" style="background:'+op.color+'">'+op.icon+' '+op.label+'</div><div class="bd">';
    op.fields.forEach(function(f){
      html += '<div class="fld"><label>'+f.label+(f.req?' <span class="req">*</span>':'')+'</label>';
      if(f.type==='textarea'){
        html += '<textarea id="'+f.id+'"></textarea>';
      } else if(f.type==='select'){
        html += '<select id="'+f.id+'"><option value="">— Seleccione —</option>';
        (f.options||[]).forEach(function(opt){ html += '<option value="'+opt+'">'+opt+'</option>'; });
        html += '</select>';
      } else {
        html += '<input id="'+f.id+'" type="'+f.type+'"'+(f.step?' step="'+f.step+'"':'')+' min="0">';
      }
      html += '</div>';
    });
    html += '<button class="btn" style="background:'+op.color+';margin-top:auto" onclick="regOp(\''+name+'\')">▶ REGISTRAR '+name+'</button>';
    html += '</div></div>';
    html += '</div>';
  });
  $('opPanel').innerHTML = html;
}

/* ═══════════════════════════════════════════════════════
   INIT — carga inicial
═══════════════════════════════════════════════════════ */
function init(){
  try { buildOpPanel(); } catch(e){ alert('Error buildOpPanel: '+e.message); return; }

  var evts = [
    ['maquina',  'change', function(){ onMaqChange(); }],
    ['orden',    'change', onOrdenChange],
    ['ordenM',   'input',  onOrdenChange],
    ['ordenNL',  'change', onOrdenNL],
    ['btnProd',  'click',  registrarProd],
    ['btnParo',  'click',  registrarParo],
    ['btnCal',   'click',  registrarCalidad]
  ];
  evts.forEach(function(ev){
    var el=$(ev[0]);
    if(el) el.addEventListener(ev[1], ev[2]);
    else alert('Elemento no encontrado: '+ev[0]);
  });

  obtenerDatosDesdeBackend()
    .then(function(data){
      try{ onData(data); }
      catch(e){ alert('Error cargando datos: '+e.message); }
    })
    .catch(function(e){
      toast('❌ Error al cargar: '+e.message,'err');
      var lb=$('loadingBar');
      if(lb){
        lb.style.background='#7c2d12';
        lb.innerHTML='❌ No se pudo conectar — revisa tu internet y presiona <b>↻ Actualizar</b> arriba.';
      }
    });

  actualizarBadgeOffline();
  if(navigator.onLine) sincronizarPendientes();
}

function onData(data){
  GD.ordenes        = data.ordenes        || [];
  GD.operarios      = data.operarios      || [];
  GD.maquinasIny    = data.maquinasIny    || [];
  GD.maquinasTap    = data.maquinasTap    || [];
  GD.motivosParoIny = data.motivosParoIny || [];
  GD.motivosParoTap = data.motivosParoTap || [];
  GD.causasIny      = data.causasIny      || [];
  GD.causasTap      = data.causasTap      || [];
  GD.turnos         = (data.config && data.config.turnos)    || [];
  GD.tapadoras      = (data.config && data.config.tapadoras) || ['5','6'];
  GD.turnoSugerido  = data.turnoServidor  || 1;
  GD.turnosValidos  = data.turnosValidos  || [1];
  GD.tiempoTurno    = data.tiempoTurno    || {};

  // Calcular sugerido en tiempo real con el reloj del navegador
  var sugerido = calcTurnoSugerido();
  GD.turnoSugerido = sugerido;
  GS.turno = sugerido;

  construirMaquinas();
  $('maquina').disabled = false;
  show('loadingBar', false);
  construirOperarios($('operario'));
  construirOperarios($('operario2'));

  var names=['MOLINO','MANUALIDADES','REPROCESOS'];
  names.forEach(function(n){
    construirOperarios($('opOp_'+n));
    construirTurnos('segT_'+n, sugerido, []);
  });

  construirTurnos('segT', sugerido, []);

  // Hora de inicio del turno sugerido
  var t = GD.turnos.filter(function(x){ return x.id===sugerido; })[0];
  if(t){
    var now=new Date(), h=Math.floor(t.ini/60), m=t.ini%60;
    GS.horaInicio = new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m,0);
    if(GS.horaInicio > now) GS.horaInicio.setDate(GS.horaInicio.getDate()-1);
  } else {
    GS.horaInicio = new Date();
  }

  // Poblar dropdown de REPROCESOS con productos del PLAN REFERENCIAS
  var rpSel = document.getElementById('rpProd');
  if(rpSel && data.productosRef && data.productosRef.length){
    data.productosRef.forEach(function(p){
      var o=document.createElement('option');
      o.value = p.desc||p.cod;
      o.textContent = p.cod ? (p.cod+' · '+p.desc) : p.desc;
      rpSel.appendChild(o);
    });
  }

  // Seleccionar primera opcion valida en la lista de maquinas
  var maqSel = $('maquina');
  for(var i=0;i<maqSel.options.length;i++){
    if(!maqSel.options[i].disabled){ maqSel.selectedIndex=i; break; }
  }
  onMaqChange();
  iniciarReloj();
}

/* ═══════════════════════════════════════════════════════
   MÁQUINAS
═══════════════════════════════════════════════════════ */
function construirMaquinas(){
  var sel=$('maquina'); sel.innerHTML='';
  function sep(txt){ var o=document.createElement('option'); o.disabled=true; o.value=''; o.textContent='── '+txt+' ──'; sel.appendChild(o); }
  function add(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); }

  if(GD.maquinasIny.length){ sep('INYECTORAS'); GD.maquinasIny.forEach(add); }
  if(GD.maquinasTap.length){ sep('TAPADORAS');  GD.maquinasTap.forEach(add); }
  // Las ops especiales tienen sus propios botones — no van en este selector
}

/* ═══════════════════════════════════════════════════════
   OPERARIOS
═══════════════════════════════════════════════════════ */
function construirOperarios(sel){
  if(!sel) return;
  sel.innerHTML='<option value="">— Operario —</option>';
  GD.operarios.forEach(function(op){
    var o=document.createElement('option');
    o.value=op.id;
    o.textContent=op.id+' · '+op.name;
    sel.appendChild(o);
  });
}

/* ═══════════════════════════════════════════════════════
   BOTONES DE OPERACIONES ESPECIALES
═══════════════════════════════════════════════════════ */
function selOp(name){
  var maqSel=$('maquina');
  if(!name){
    // Volver: seleccionar primera máquina real disponible
    for(var i=0;i<maqSel.options.length;i++){
      if(!maqSel.options[i].disabled){ maqSel.selectedIndex=i; break; }
    }
    onMaqChange();
  } else {
    // Op especial: pasar nombre directo, sin tocar el selector
    onMaqChange(name);
  }
}

function sincBotonesOp(maqActual){
  var esOp = maqActual==='MOLINO'||maqActual==='MANUALIDADES'||maqActual==='REPROCESOS';
  document.querySelectorAll('.opb[data-op]').forEach(function(b){
    b.classList[b.dataset.op===maqActual ? 'add' : 'remove']('act');
  });
  show('btnVolver', esOp);
}

/* ═══════════════════════════════════════════════════════
   MÁQUINA CAMBIA
═══════════════════════════════════════════════════════ */
function onMaqChange(maqOverride){
  var maq=maqOverride||val('maquina'); GS.maq=maq;
  var esOp = maq==='MOLINO'||maq==='MANUALIDADES'||maq==='REPROCESOS';
  GS.esTap = GD.tapadoras.indexOf(maq)>=0;

  show('colsN', !esOp);
  var panel=$('opPanel');
  if(esOp){
    panel.className='op-panel show';
    var names=['MOLINO','MANUALIDADES','REPROCESOS'];
    names.forEach(function(n){ cls('sec'+n,'show', n===maq); });
  } else {
    panel.className='op-panel';
  }

  show('bxOp2', GS.esTap && !esOp);

  llenarSelect('motParo', GS.esTap ? GD.motivosParoTap : GD.motivosParoIny);
  llenarSelect('calCausa', GS.esTap ? GD.causasTap : GD.causasIny);

  // Limpiar campos al cambiar máquina
  $('orden').value='';
  ['cavEstd','cicloEst','cavidades','cicloR','cantR','pesoC','observ','numCaja','tParo','calPeso'].forEach(function(id){
    var e=$(id); if(e) e.value='';
  });
  ['operario','operario2'].forEach(function(id){
    var e=$(id); if(e) e.selectedIndex=0;
  });

  llenarOrdenes(maq, esOp);
  onOrdenChange();

  // Badge de estado
  cls('eoLabel','on',false); cls('eoLabel','off',true);
  $('eoLabel').textContent = esOp ? maq : 'SIN ORDEN';

  // Sincronizar resaltado de botones
  sincBotonesOp(maq);
  actualizarTiempoTurno();
}

function llenarSelect(id, arr){
  var sel=$(id); if(!sel) return;
  sel.innerHTML='<option value="">— Seleccione —</option>';
  arr.forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); });
}

function llenarOrdenes(maq, esOp){
  var sel=$('orden');
  sel.innerHTML='<option value="">— Seleccione orden —</option>';
  if(esOp) return;
  var maqTrim = String(maq||'').trim();
  var coincidentes = [];

  GD.ordenes.forEach(function(o){
    var oMaq = String(o.maquina||'').trim();
    if(oMaq && oMaq===maqTrim){
      coincidentes.push(o);
      var opt=document.createElement('option');
      opt.value=o.id;
      opt.textContent='Ord #'+o.id+' · '+o.productName;
      sel.appendChild(opt);
    }
  });
  if(coincidentes.length===1){
    sel.value=coincidentes[0].id;
  }
  toast(coincidentes.length===0
    ? 'Sin órdenes activas para máquina '+maqTrim
    : coincidentes.length+' orden(es) disponible(s) para máquina '+maqTrim, 'ok');
}

/* ═══════════════════════════════════════════════════════
   ORDEN CAMBIA
═══════════════════════════════════════════════════════ */
function onOrdenChange(){
  var useManual = $('ordenNL') && $('ordenNL').checked;
  var ordId = useManual ? val('ordenM') : val('orden');
  var o = GD.ordenes.filter(function(x){ return x.id===ordId; })[0]||null;
  GS.orden=o;

  show('ordI', !!o);
  show('pImgB', !!o);

  if(o){
    $('iPro').textContent = o.productName||'—';
    $('iCli').textContent = o.cliente||'—';
    $('iCol').textContent = [o.color,o.mp].filter(Boolean).join(' / ')||'—';
    $('iLot').textContent = [o.loteProd,o.loteMp].filter(Boolean).join(' / ')||'—';
    var cantCj = o.cantCaja||1;
    $('iACj').textContent = (o.cajasReportadas||0)+' / '+Math.ceil((o.cantidadTotal||0)/cantCj);
    $('iAUn').textContent  = nf(o.unidadesReportadas||0)+' / '+nf(o.cantidadTotal||0);
    $('iUlt').textContent  = o.lastReportTime||'—';

    $('cavEstd').value = o.cavidades||'';
    $('cicloEst').value = o.ciclo||'';
    if(!val('cavidades') && o.cavidades) $('cavidades').value = o.cavidades;
    if(!val('cicloR')    && o.ciclo)     $('cicloR').value    = o.ciclo;
    if(o.cantCaja) $('cantR').value = o.cantCaja;  // pre-llena cantidad estándar por caja (col Q)

    $('numCaja').value = (o.cajasReportadas||0)+1;
    cls('eoLabel','on',true); cls('eoLabel','off',false);
    $('eoLabel').textContent='✅ EN PROD.';
  } else {
    ['cavEstd','cicloEst'].forEach(function(id){ $(id).value=''; });
    cls('eoLabel','on',false); cls('eoLabel','off',true);
    $('eoLabel').textContent='SIN ORDEN';
  }
}

function onOrdenNL(){
  var checked=$('ordenNL').checked;
  show('orden', !checked);
  show('ordenM', checked);
  if(checked) $('ordenM').focus();
  onOrdenChange();
}

/* ═══════════════════════════════════════════════════════
   TURNOS — validación en tiempo real
═══════════════════════════════════════════════════════ */

/* Calcula qué turnos son válidos AHORA según el reloj del navegador,
   con 15 minutos de gracia al final de cada turno */
function calcTurnosValidos(){
  if(!GD.turnos||!GD.turnos.length) return GD.turnosValidos||[];
  var now=new Date(), m=now.getHours()*60+now.getMinutes(), GRACIA=15;
  return GD.turnos.filter(function(t){
    var wrap=t.ini>t.fin, finG=t.fin+GRACIA;
    if(wrap)        return m>=t.ini || m<finG;
    if(finG>=1440)  return m>=t.ini || m<(finG%1440);
    return m>=t.ini && m<finG;
  }).map(function(t){ return t.id; });
}

/* Turno sugerido ahora mismo: preferir 8h, si no cualquier válido */
function calcTurnoSugerido(){
  var validos=calcTurnosValidos();
  var ocho=GD.turnos.filter(function(t){ return t.horas===8 && validos.indexOf(t.id)>=0; });
  if(ocho.length) return ocho[0].id;
  return validos.length ? validos[0] : (GD.turnoSugerido||1);
}

function construirTurnos(containerId, sugerido, _validos){
  var cont=$(containerId); if(!cont) return;
  var validos=calcTurnosValidos();   // siempre real-time, ignoramos _validos
  cont.innerHTML='';
  GD.turnos.forEach(function(t){
    var btn=document.createElement('button');
    btn.type='button'; btn.dataset.id=t.id;
    btn.innerHTML=t.label+'<small>'+t.horas+'h</small>';
    if(validos.indexOf(t.id)>=0) btn.classList.add('ok');
    if(t.id===sugerido) btn.classList.add('act');
    btn.onclick=(function(tid,cid){ return function(){ selTurno(tid,cid); }; })(t.id, containerId);
    cont.appendChild(btn);
  });
}

/* Verifica si un turno cubre la hora actual SIN período de gracia (corte exacto) */
function turnoEsActual(id){
  if(!GD.turnos||!GD.turnos.length) return GD.turnosValidos.indexOf(id)>=0;
  var now=new Date(), m=now.getHours()*60+now.getMinutes();
  var t=GD.turnos.filter(function(x){ return x.id===id; })[0];
  if(!t) return false;
  var wrap=t.ini>t.fin;
  if(wrap) return m>=t.ini || m<t.fin;
  return m>=t.ini && m<t.fin;
}

function selTurno(id, containerId){
  var cont=$(containerId||'segT'); if(!cont) return;
  cont.querySelectorAll('button').forEach(function(b){ b.classList.remove('act'); });
  var btn=cont.querySelector('[data-id="'+id+'"]');
  if(btn) btn.classList.add('act');

  /* Validación estricta (sin gracia) — aplica a TODOS los selectores de turno */
  var invalido = !turnoEsActual(Number(id));
  if(invalido) toast('⚠️ T'+id+' no corresponde a la hora actual — verifique', 'warn');

  if(!containerId||containerId==='segT'){
    GS.turno=id;
    cls('tAl','show', invalido);
    actualizarTiempoTurno();
  } else {
    // Ops especiales: mostrar alerta dentro del mismo panel (tAl_MOLINO, etc.)
    var talOp = containerId.replace('segT_','tAl_');
    cls(talOp,'show', invalido);
  }
}

/* Refresca los bordes verdes y la alerta según la hora actual */
function refrescarBordeTurnos(){
  var validos=calcTurnosValidos();
  var cont=$('segT'); if(!cont) return;
  cont.querySelectorAll('button').forEach(function(b){
    var id=Number(b.dataset.id);
    b.classList[validos.indexOf(id)>=0?'add':'remove']('ok');
  });
  if(GS.turno) cls('tAl','show', !turnoEsActual(Number(GS.turno)));
}

function turnoActivo(containerId){
  var cont=$(containerId||'segT'); if(!cont) return GS.turno||GD.turnoSugerido;
  var act=cont.querySelector('button.act');
  return act ? Number(act.dataset.id) : (GS.turno||GD.turnoSugerido);
}

/* ═══════════════════════════════════════════════════════
   TIEMPO DE TURNO — producción (cavidades×ciclo) + paros,
   vs. objetivo del turno (8h/12h). Suma todas las órdenes/
   clientes reportados en esta máquina durante el turno.
═══════════════════════════════════════════════════════ */
function actualizarTiempoTurno(){
  var box=$('ttBox'); if(!box) return;
  var esOp = GS.maq==='MOLINO'||GS.maq==='MANUALIDADES'||GS.maq==='REPROCESOS';
  if(esOp || !GS.maq){ show('ttBox', false); return; }

  var turnoId = turnoActivo('segT');
  var t = GD.turnos.filter(function(x){ return x.id===turnoId; })[0];
  if(!t){ show('ttBox', false); return; }
  show('ttBox', true);

  var reg = (GD.tiempoTurno && GD.tiempoTurno[GS.maq+'_'+turnoId]) || { prodMin:0, paroMin:0, objetivoMin:t.horas*60 };
  var objetivo = reg.objetivoMin || (t.horas*60);
  var total = (reg.prodMin||0) + (reg.paroMin||0);
  var pct = Math.min(100, Math.round((total/objetivo)*100));
  var faltante = Math.max(0, objetivo-total);

  $('ttTurnoLbl').textContent = 'T'+t.id+' · '+t.horas+'h';
  $('ttTotal').textContent = Math.round(total)+' / '+objetivo+' min';
  var fill=$('ttFill'); fill.style.width=pct+'%';

  var msg=$('ttMsg');
  if(pct>=96){
    fill.style.background='#188038';
    msg.style.background='#e6f4ea'; msg.style.color='#188038';
    msg.textContent='✅ Turno cumplido ('+pct+'%).';
  } else if(faltante<=90){
    fill.style.background='#f9ab00';
    msg.style.background='#fff7ed'; msg.style.color='#92400e';
    msg.textContent='⚠️ Faltan '+Math.round(faltante)+' min para completar el turno ('+pct+'%).';
  } else {
    fill.style.background='#1a73e8';
    msg.style.background='#e8f0fe'; msg.style.color='#0b4ec0';
    msg.textContent='Turno en curso — '+pct+'% cumplido.';
  }
}

/* Suma localmente el aporte de un registro recién enviado, sin esperar
   al próximo fetch — se re-sincroniza con el valor real del Sheet en
   la siguiente carga (inicial, "Actualizar", o auto-refresh). */
function sumarLocalTiempoTurno(maquina, turnoId, prodMinDelta, paroMinDelta){
  var t = GD.turnos.filter(function(x){ return x.id===turnoId; })[0];
  var key = maquina+'_'+turnoId;
  if(!GD.tiempoTurno) GD.tiempoTurno = {};
  if(!GD.tiempoTurno[key]) GD.tiempoTurno[key] = { prodMin:0, paroMin:0, objetivoMin:(t?t.horas*60:480) };
  GD.tiempoTurno[key].prodMin += prodMinDelta||0;
  GD.tiempoTurno[key].paroMin += paroMinDelta||0;
}

/* ═══════════════════════════════════════════════════════
   MODAL CONFIRMACIÓN
═══════════════════════════════════════════════════════ */
function mostrarConfirm(filas, cb){
  var html='';
  filas.forEach(function(f){ html+='<div class="cr"><span>'+f[0]+'</span><b>'+(f[1]||'—')+'</b></div>'; });
  $('mConfC').innerHTML=html;
  $('btnCfOk').onclick=function(){ cConf(); cb && cb(); };
  cls('mConf','show',true);
}

function cConf(){ cls('mConf','show',false); }

function mostrarExito(msg){
  $('exitoM').textContent=msg||'Registro guardado.';
  cls('exitoOv','show',true);
  setTimeout(function(){ cls('exitoOv','show',false); }, 2500);
}

/* ═══════════════════════════════════════════════════════
   DATOS BASE (comunes a prod / paro / calidad)
═══════════════════════════════════════════════════════ */
function datosBase(){
  var o=GS.orden||{};
  var useManual=$('ordenNL')&&$('ordenNL').checked;
  var ordId=useManual?val('ordenM'):val('orden');
  var opSel=$('operario'), opIdx=opSel?opSel.selectedIndex:-1;
  var opNom=opIdx>0?opSel.options[opIdx].textContent:'';
  var op2Sel=$('operario2'), op2Nom='';
  if(GS.esTap&&op2Sel&&op2Sel.selectedIndex>0) op2Nom=op2Sel.options[op2Sel.selectedIndex].textContent;
  return {
    maquina:GS.maq, turno:turnoActivo('segT'),
    orden:ordId, producto:o.productName||'',
    color:o.color||'', mP:o.mp||'',
    loteProd:o.loteProd||'', loteMp:o.loteMp||'',
    cliente:o.cliente||'', cav:numV('cavEstd'), cicloEst:numV('cicloEst'),
    codOperario:val('operario'), operario:opNom, operario2:op2Nom,
    esTapadora:GS.esTap, fechaUltimoReporte:o.lastReportTime||''
  };
}

/* ═══════════════════════════════════════════════════════
   REGISTRAR PRODUCCIÓN
═══════════════════════════════════════════════════════ */
function registrarProd(){
  limpiarErrores();
  var camposOrd = $('ordenNL')&&$('ordenNL').checked ? ['ordenM'] : ['orden'];
  if(!reqs(camposOrd.concat(['operario','numCaja','cantR','cavidades','cicloR']))){
    toast('Complete los campos obligatorios (*)','warn'); return;
  }
  var base=datosBase();
  var datos=merge(base,{
    numCaja:numV('numCaja'), cantReportada:numV('cantR'),
    cavidades:numV('cavidades'), cicloReal:numV('cicloR'),
    pesoCaja:numV('pesoC'), observacion:val('observ')
  });
  mostrarConfirm([
    ['Máquina', datos.maquina],
    ['Orden',   datos.orden],
    ['Producto',datos.producto],
    ['Caja N°', datos.numCaja],
    ['Cantidad',nf(datos.cantReportada)],
    ['Cav. real',datos.cavidades],
    ['Ciclo real (s)',datos.cicloReal],
    ['Turno','T'+datos.turno],
    ['Operario',datos.operario]
  ], function(){
    $('btnProd').disabled=true;
    llamarBackend('produccion', datos).then(function(r){
      $('btnProd').disabled=false;
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      try{
        GS.prodCount++;
        if(GS.orden){ GS.orden.cajasReportadas=datos.numCaja; $('numCaja').value=datos.numCaja+1; }
        ['pesoC','observ'].forEach(function(id){ $(id).value=''; });
        if(datos.cavidades>0 && datos.cicloReal>0 && datos.cantReportada>0){
          sumarLocalTiempoTurno(datos.maquina, datos.turno, (datos.cantReportada/datos.cavidades)*datos.cicloReal/60, 0);
          actualizarTiempoTurno();
        }
      }catch(ex){}
      mostrarExito(r && r.offline
        ? '📴 Sin conexión — Caja '+datos.numCaja+' guardada localmente. Se enviará al volver el internet.'
        : ((r&&r.message)||'Caja '+datos.numCaja+' registrada. ✅'));
    });
  });
}

/* ═══════════════════════════════════════════════════════
   REGISTRAR PARO
═══════════════════════════════════════════════════════ */
function registrarParo(){
  limpiarErrores();
  if(!reqs(['motParo','tParo'])){ toast('Seleccione motivo y tiempo de paro','warn'); return; }
  var base=datosBase();
  var datos=merge(base,{ paro:val('motParo'), tiempoParo:numV('tParo'), obsParo:val('obsParo') });
  mostrarConfirm([
    ['Máquina', datos.maquina],
    ['Motivo',  datos.paro],
    ['Tiempo (min)',datos.tiempoParo],
    ['Turno',   'T'+datos.turno],
    ['Operario',datos.operario]
  ], function(){
    $('btnParo').disabled=true;
    llamarBackend('paro', datos).then(function(r){
      $('btnParo').disabled=false;
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      try{
        GS.paroCount++;
        ['tParo','obsParo','motParo'].forEach(function(id){ $(id).value=''; });
        if(datos.tiempoParo>0){
          sumarLocalTiempoTurno(datos.maquina, datos.turno, 0, datos.tiempoParo);
          actualizarTiempoTurno();
        }
      }catch(ex){}
      mostrarExito(r && r.offline
        ? '📴 Sin conexión — Paro guardado localmente. Se enviará al volver el internet.'
        : ((r&&r.message)||'Paro registrado. ✅'));
    });
  });
}

/* ═══════════════════════════════════════════════════════
   REGISTRAR CALIDAD
═══════════════════════════════════════════════════════ */
function registrarCalidad(){
  limpiarErrores();
  if(!reqs(['calCausa','calPeso'])){ toast('Complete causa y peso','warn'); return; }
  var base=datosBase();
  var datos=merge(base,{ registros:[{causa:val('calCausa'), peso:numV('calPeso')}] });
  mostrarConfirm([
    ['Máquina', datos.maquina],
    ['Causa',   val('calCausa')],
    ['Peso (kg)',val('calPeso')],
    ['Turno',   'T'+datos.turno],
    ['Operario',datos.operario]
  ], function(){
    $('btnCal').disabled=true;
    llamarBackend('calidad', datos).then(function(r){
      $('btnCal').disabled=false;
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      try{ ['calPeso','calCausa'].forEach(function(id){ $(id).value=''; }); }catch(ex){}
      mostrarExito(r && r.offline
        ? '📴 Sin conexión — Calidad guardada localmente. Se enviará al volver el internet.'
        : ((r&&r.message)||'Calidad registrada. ✅'));
    });
  });
}

/* ═══════════════════════════════════════════════════════
   OPERACIONES ESPECIALES — regOp
═══════════════════════════════════════════════════════ */
function regOp(name){
  limpiarErrores();
  var op=OPDEF[name]; if(!op) return;

  // Validar operario del panel
  var opSel=$('opOp_'+name);
  if(!opSel||!opSel.value){ if(opSel) opSel.classList.add('err-f'); toast('Seleccione un operario','warn'); return; }
  if(!op.validate()){ toast('Complete los campos obligatorios (*)','warn'); return; }

  var opNom=opSel.options[opSel.selectedIndex].textContent;
  var turnoId=turnoActivo('segT_'+name);
  var campos=op.collect();
  var datos=merge({ turno:turnoId, operario:opNom, codOperario:opSel.value }, campos);

  var resumen=[['Operación',op.label],['Turno','T'+turnoId],['Operario',opNom]].concat(op.summary());

  var ACCION_OP = { registrarMolino:'molino', registrarManualidades:'manualidades', registrarReproceso:'reproceso' };

  mostrarConfirm(resumen, function(){
    llamarBackend(ACCION_OP[op.backend], datos).then(function(r){
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      mostrarExito(r && r.offline
        ? '📴 Sin conexión — '+op.label+' guardado localmente. Se enviará al volver el internet.'
        : ((r&&r.message)||op.label+' registrado.'));
      op.fields.forEach(function(f){ var e=$(f.id); if(e) e.value=''; });
    });
  });
}

/* ═══════════════════════════════════════════════════════
   ACTUALIZAR — recarga órdenes y datos desde el Sheet
═══════════════════════════════════════════════════════ */
function recargarOrdenes(){
  var btn=document.querySelector('.btn-refresh');
  if(btn){btn.textContent='⏳ Cargando...';btn.disabled=true;}
  obtenerDatosDesdeBackend()
    .then(function(data){
      onData(data);
      if(btn){btn.textContent='↻ Actualizar';btn.disabled=false;}
    })
    .catch(function(e){
      alert('Error al actualizar: '+(e.message||e));
      if(btn){btn.textContent='↻ Actualizar';btn.disabled=false;}
    });
}

/* ═══════════════════════════════════════════════════════
   AUTO-REFRESH — actualiza solo órdenes cada 30 min
   sin tocar máquina, operario, turno ni campos llenados
═══════════════════════════════════════════════════════ */
function autoRefreshOrdenes(){
  if(GS.orden) return;   // operario con orden activa → no interrumpir
  obtenerDatosDesdeBackend()
    .then(function(data){
      if(!data || !data.ordenes) return;
      GD.ordenes = data.ordenes;             // actualiza solo el listado en memoria
      GD.tiempoTurno = data.tiempoTurno || GD.tiempoTurno;
      llenarOrdenes(GS.maq, false);          // redibuja solo el dropdown de órdenes
      actualizarTiempoTurno();
    })
    .catch(function(){});  // silencioso — reintenta en el próximo ciclo
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD — contadores de sesión (cajas y paros reportados)
═══════════════════════════════════════════════════════ */
function actualizarDash(){
  var eC=$('dCajas'), eP=$('dParos');
  if(eC) eC.textContent = GS.prodCount;
  if(eP) eP.textContent = GS.paroCount;
}

/* ═══════════════════════════════════════════════════════
   RELOJ — actualiza validez de turnos cada minuto
═══════════════════════════════════════════════════════ */
function iniciarReloj(){
  refrescarBordeTurnos();
  setInterval(refrescarBordeTurnos, 60000);
  setInterval(autoRefreshOrdenes, 30 * 60 * 1000);  // actualiza órdenes cada 30 min
  setInterval(function(){ if(navigator.onLine) sincronizarPendientes(); }, 60000);  // reintento de sync cada minuto
}

/* ═══════════════════════════════════════════════════════
   SERVICE WORKER — instala la app y permite abrir sin internet
═══════════════════════════════════════════════════════ */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){
      console.warn('No se pudo registrar el Service Worker:', e);
    });
  });
}

/* ═══════════════════════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', init);
