'use strict';

/* ═══════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════ */
var GD = {
  ordenes:[], operarios:[], maquinasIny:[], maquinasTap:[],
  motivosParoIny:[], motivosParoTap:[], causasIny:[], causasTap:[],
  // Descripción de cada motivo de paro, en el MISMO orden que el motivo.
  descParoIny:[], descParoTap:[],
  // Materiales del molino: los mantiene el usuario en LISTAS col A. Las
  // opciones de OPDEF.MOLINO quedan solo como respaldo.
  materialesMolino:[],
  turnos:[], tapadoras:['5','6'], turnoSugerido:1, turnosValidos:[1],
  materialActivo:false
};

/* Bolsas de materia prima con su saldo. Se refresca al elegir orden y
   despues de cada registro. Sin conexion conserva la ultima lista. */
var MAT = { virgen:[], molido:[], cargado:false, error:'', ultimoError:'' };
var GS = {
  maq:null, orden:null, turno:1, esTap:false,
  horaInicio:null, prodCount:0, paroCount:0, confirmarCb:null,
  matUltId:null, matUltTxt:'', matRegistrado:false,
  // motivo de paro -> descripción, del tipo de máquina seleccionado
  paroDescMapa:{}
};

/* ═══════════════════════════════════════════════════════
   OPERACIONES ESPECIALES
═══════════════════════════════════════════════════════ */
var OPDEF = {
  MOLINO: {
    color:'#ea580c', icon:'⚙️', label:'MOLINO',
    backend:'registrarMolino',
    fields:[
      // Estas opciones son solo el RESPALDO. La lista viva la mantiene el
      // usuario en LISTAS col A y llega en data.materialesMolino; onData() la
      // reemplaza aquí mismo. Solo se usan si la hoja no trajo nada.
      //
      // El texto completo se guarda TAL CUAL en MOLINO!REFERENCIA — decisión
      // del usuario (2026-08-25). Para que eso NO parta en dos las bolsas de
      // molido del inventario, el backend normaliza la referencia a su familia
      // con _familiaMolido_() antes de armar el código de bolsa.
      // "REMOLIDO ALTA HDPE" es material ya reprocesado: familia propia, bolsa
      // aparte del HDPE molido de primera.
      {id:'mRef',  label:'Material',  type:'select',   req:true,
       options:['LLDPE (POLIETILENO BAJA)','HDPE (POLIETILENO ALTA)','PP (POLIPROPILENO)',
                'REMOLIDO ALTA HDPE','50 / 50 (Conjunto alta + baja)']},
      // El color define a qué bolsa de molido entra el material: el molido
      // natural y el pigmentado no son intercambiables. Sin color no se puede
      // saber cuánto molido usable hay, así que es obligatorio.
      // Texto libre por decisión del usuario: el operario escribe el color que
      // realmente molió, sin lista cerrada que lo obligue a mentir. El backend
      // normaliza a mayúsculas y sin dobles espacios para que "Natural" y
      // "NATURAL " caigan en la misma bolsa.
      {id:'mCol',  label:'Color del molido', type:'text', req:true},
      {id:'mKg',   label:'Kilos molidos',         type:'number',   req:true,  step:'0.01'},
      {id:'mBar',  label:'Kilos barradura',       type:'number',   req:false, step:'0.01'},
      {id:'mHH',   label:'Horas Trabajadas',          type:'number',   req:true,  step:'0.5'},
      {id:'mObs',  label:'Observaciones',         type:'textarea', req:false}
    ],
    collect:function(){ return { referencia:val('mRef'), color:val('mCol'), kilosMolidos:val('mKg'), kilosBarradura:val('mBar')||0, horasHombre:val('mHH'), observacion:val('mObs') }; },
    validate:function(){ return reqs(['mRef','mCol','mKg','mHH']); },
    summary:function(){ return [['Referencia',val('mRef')],['Color',val('mCol')],['Kg molidos',val('mKg')],['Kg barradura',val('mBar')||'0'],['H. Trabajadas',val('mHH')]]; }
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
/* Implementación del proyecto "Formulario Mejorado".
   Actualizada 2026-08-14: la implementación anterior (AKfycbyuOgZDlZ...) quedó
   pegada a una versión vieja del código y no reconocía las acciones sup*.
   Actualizada 2026-08-21: la anterior (AKfycbx1a7HdxU3o...) volvió a quedarse
   atrás — el proyecto tiene varias implementaciones y republicar la que no es
   deja el editor con el código nuevo y el web app con el viejo. Esta es la que
   quedó en la versión 49.
   CÓMO VERIFICAR SIN ESCRIBIR NADA:
     curl -sL "<esta URL>?action=version"   →   {"version":"molino-color-..."}
   Si responde HTML en vez de JSON, la implementación está vieja. */
var GAS_URL = 'https://script.google.com/macros/s/AKfycbzZP__GbWkWZIts_H2nh6vBRr_p1AIuBQ64sgq2K98jq2nMBkxFV96yUNOioc7WA5D5/exec';

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
    ['motParo',  'change', mostrarDescParo],
    ['btnCal',   'click',  registrarCalidad],
    ['btnMat',    'click',  registrarMaterial],
    ['btnMatUndo','click',  matDeshacer],
    ['matBolsaV', 'change', function(){ matPintarSaldo('V'); }],
    ['matBolsaM', 'change', function(){ matPintarSaldo('M'); }]
  ];
  evts.forEach(function(ev){
    var el=$(ev[0]);
    if(el) el.addEventListener(ev[1], ev[2]);
    else alert('Elemento no encontrado: '+ev[0]);
  });

  // Los +25 / +50 son varios botones iguales: se enganchan en bloque
  Array.prototype.forEach.call(document.querySelectorAll('.mat-add'), function(b){
    b.addEventListener('click', function(){
      var id=b.getAttribute('data-kg'), e=$(id);
      if(e) e.value = String(numV(id) + Number(b.getAttribute('data-n')));
    });
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
  GD.descParoIny    = data.descParoIny    || [];
  GD.descParoTap    = data.descParoTap    || [];
  GD.materialesMolino = data.materialesMolino || [];
  GD.causasIny      = data.causasIny      || [];
  GD.causasTap      = data.causasTap      || [];
  GD.turnos         = (data.config && data.config.turnos)    || [];
  GD.tapadoras      = (data.config && data.config.tapadoras) || ['5','6'];
  GD.materialActivo = !!(data.config && data.config.materialActivo);
  GD.turnoSugerido  = data.turnoServidor  || 1;
  GD.turnosValidos  = data.turnosValidos  || [1];

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

  // Materiales del molino desde LISTAS col A. buildOpPanel() ya dibujó el
  // select con la lista de respaldo, así que aquí se reemplaza. Si la hoja no
  // trajo nada, se deja el respaldo en vez de dejar el molino sin opciones.
  if(GD.materialesMolino.length) llenarSelect('mRef', GD.materialesMolino);

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
  // Si estábamos en el panel de supervisor, salir de él primero
  if(SUP.activo) supCerrarPanel();
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
  matMostrar(!esOp);

  llenarSelect('motParo', GS.esTap ? GD.motivosParoTap : GD.motivosParoIny);
  llenarSelect('calCausa', GS.esTap ? GD.causasTap : GD.causasIny);
  construirMapaDescParo();

  // Limpiar campos al cambiar máquina
  $('orden').value='';
  ['cavEstd','cicloEst','cavidades','cicloR','cantR','pesoC','observ','numCaja','tParo','calPeso'].forEach(function(id){
    var e=$(id); if(e) e.value='';
  });
  ['operario','operario2'].forEach(function(id){
    var e=$(id); if(e) e.selectedIndex=0;
  });
  mostrarDescParo();

  llenarOrdenes(maq, esOp);
  onOrdenChange();   // repinta el aviso y rehabilita los botones si aplica

  // Badge de estado
  cls('eoLabel','on',false); cls('eoLabel','off',true);
  $('eoLabel').textContent = esOp ? maq : 'SIN ORDEN';

  // Sincronizar resaltado de botones
  sincBotonesOp(maq);
}

/* ════════════════════════════════════════════════
   DESCRIPCIÓN DEL MOTIVO DE PARO
   ────────────────────────────────────────
   El motivo y su descripción llegan como dos arreglos alineados por
   posición (LISTAS: motivo en una columna, descripción en la de al lado).
   Se pasan a mapa por NOMBRE del motivo porque el <select> devuelve el
   texto, no el índice.

   Ojo con los motivos repetidos: LISTAS trae "DAÑO SISTEMA DE LUBRICACION
   MAQUINA" y "ENSAYOS MATERIA PRIMA" dos veces. Gana la PRIMERA aparición
   con descripción no vacía — así un duplicado sin descripción no borra la
   que sí existía.
════════════════════════════════════════════════ */
function construirMapaDescParo(){
  var motivos = GS.esTap ? GD.motivosParoTap : GD.motivosParoIny;
  var descs   = GS.esTap ? GD.descParoTap    : GD.descParoIny;
  var mapa = {};
  (motivos||[]).forEach(function(m, i){
    var k = String(m||'').trim();
    if(!k) return;
    var d = String((descs && descs[i]) || '').trim();
    if(!mapa[k] && d) mapa[k] = d;
  });
  GS.paroDescMapa = mapa;
}

/* Muestra la descripción del motivo elegido. Si el motivo no tiene
   descripción en LISTAS, el bloque se OCULTA — mejor nada que un recuadro
   parpadeando en vacío. */
function mostrarDescParo(){
  var caja=$('paroDesc'); if(!caja) return;
  var motivo = val('motParo');
  var d = motivo ? (GS.paroDescMapa[String(motivo).trim()] || '') : '';
  $('paroDescT').textContent = 'DESCRIPCIÓN PARO ' + (GS.esTap ? 'TAPADORA' : 'INYECTORA');
  $('paroDescX').textContent = d;
  cls('paroDesc','show', !!d);
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

  try { matAlCambiarOrden(); } catch(e){}

  show('ordI', !!o);
  show('pImgB', !!o);

  if(o){
    $('iPro').textContent = o.productName||'—';
    $('iCli').textContent = o.cliente||'—';
    $('iCol').textContent = o.color||'—';
    // Materia prima asignada + la familia requerida entre paréntesis cuando aportan
    // dato distinto (ej. "LH5420 · HDPE"). Antes este campo mostraba solo la familia.
    $('iMp').textContent  = o.mp
      ? (o.mpReq && o.mpReq !== o.mp ? o.mp+' · '+o.mpReq : o.mp)
      : (o.mpReq||'—');
    $('iLotM').textContent = o.loteMp||'—';
    $('iLot').textContent  = o.loteProd||'—';
    $('iCant').textContent = o.cantidadTotal ? nf(o.cantidadTotal) : '—';
    $('iEnt').textContent  = String(o.fechaEntrega||'').replace(/\s+00:00:00$/,'')||'—';
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

  pintarAvisoOrden(o);
}

/* ════════════════════════════════════════════════
   ORDEN CON DATOS INCOMPLETOS
   ────────────────────────────────────────
   En REGISTRO LIDER las columnas B-L son fórmulas que buscan la orden en la
   pestaña ORDENES. Cuando la orden sale de la lista de activos, la fórmula
   no la encuentra y esas columnas quedan EN BLANCO — pero la orden sigue en
   producción con su máquina y lote puestos a mano.

   Antes el formulario no decía nada y guardaba la caja sin cliente, sin
   producto y sin color. Ahora:
     ámbar → el backend lo recuperó del histórico; se puede seguir, pero
             queda a la vista de dónde salieron esos datos.
     rojo  → no hay de dónde recuperarlo: se BLOQUEA el registro. Frenar al
             operario cuesta menos que una fila que nadie puede identificar.
════════════════════════════════════════════════ */
var ORD_AV_ETIQUETAS = {
  producto:'producto', cliente:'cliente', color:'color',
  mp:'materia prima', loteMp:'lote de materia prima'
};

function pintarAvisoOrden(o){
  var av=$('ordAviso');
  if(!av) return;
  var rescatado = (o && o.rescatado) || [];
  var bloquea   = !!(o && o.incompleta);

  if(bloquea){
    av.className='ord-av bloqueo show';
    av.innerHTML='⛔ <b>Esta orden no tiene producto.</b> Salió de la lista de pedidos '
      + 'activos y no hay reportes anteriores de donde tomarlo. No se puede registrar: '
      + 'avísale al supervisor para que la reactive.';
  } else if(rescatado.length){
    av.className='ord-av rescate show';
    var nombres = rescatado.map(function(c){ return ORD_AV_ETIQUETAS[c]||c; });
    av.innerHTML='⚠️ Esta orden ya no está en la lista de pedidos activos. '
      + '<b>'+nombres.join(', ')+'</b> se tom'+(nombres.length>1?'aron':'ó')
      + ' del último reporte de esta misma orden. Verifica que esté'
      + (nombres.length>1?'n':'') + ' bien antes de registrar.';
  } else {
    av.className='ord-av';
    av.innerHTML='';
  }

  // Bloquear TODOS los registros que van contra la orden. El paro y la
  // calidad también escriben la orden, así que tampoco deben pasar.
  ['btnProd','btnParo','btnCal','btnMat'].forEach(function(id){
    var b=$(id); if(b) b.disabled = bloquea;
  });
}

/* Segunda barrera. Deshabilitar el botón no basta: cada envío lo vuelve a
   habilitar al terminar, y la cola offline puede reintentar. Esto se
   pregunta en el momento de registrar. */
function ordenUtilizable(){
  if(GS.orden && GS.orden.incompleta){
    toast('⛔ Esta orden no tiene producto — no se puede registrar','err');
    return false;
  }
  return true;
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
    color:o.color||'', mP:o.mp||'', familia:o.mpReq||'',
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
  if(!ordenUtilizable()) return;
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
        try{ matChequearRecordatorio(); }catch(ex2){}
        if(GS.orden){ GS.orden.cajasReportadas=datos.numCaja; $('numCaja').value=datos.numCaja+1; }
        ['pesoC','observ'].forEach(function(id){ $(id).value=''; });
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
  if(!ordenUtilizable()) return;
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
        mostrarDescParo();   // el motivo quedó vacío: el bloque se apaga
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
  if(!ordenUtilizable()) return;
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
      llenarOrdenes(GS.maq, false);          // redibuja solo el dropdown de órdenes
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
   SUPERVISOR — programación de pedidos en REGISTRO LIDER
   ─────────────────────────────────────────────────────
   Escribe la orden en la col. A y M/N/O/P/Q; el fin de
   producción (col. U) ELIMINA la fila. Todo pasa por el
   backend (Supervisor.gs), que valida la clave contra la
   Propiedad del Script FVLCO_SUPERVISOR_PW. La clave vive
   solo en memoria durante la sesión — nunca en disco ni en
   este archivo.
═══════════════════════════════════════════════════════ */
var SUP = { pw:null, activo:false, datos:null };

function supEsc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ════════════════════════════════════════════════
   DIAGNÓSTICO DE CONEXIÓN
   ────────────────────────────────────────
   El reclamo de planta: al entrar a la pestaña de supervisor no se sabe si
   hay conexión. El botón se quedaba en "VALIDANDO..." sin límite de tiempo
   y sin decir nada, porque:

     1. `fetch` no tiene timeout propio: una conexión mala cuelga la promesa
        para siempre y el botón queda congelado.
     2. `navigator.onLine` solo mira el cable/wifi. Con el router conectado
        pero sin salida a internet devuelve true, así que el chequeo previo
        pasaba y el error llegaba disfrazado de "Failed to fetch".
     3. Un Apps Script en frío tarda varios segundos: lento y caído se ven
        exactamente igual desde la interfaz.

   Ahora: corte por tiempo, prueba REAL contra el backend con la latencia
   medida, y un mensaje que dice qué hacer en vez de un código de error.
════════════════════════════════════════════════ */
var SUP_TIMEOUT_MS_   = 25000;   // acción del supervisor (Apps Script en frío)
var SUP_TIMEOUT_PING_ = 12000;   // prueba de conexión
var SUP_LENTO_MS_     = 3000;    // a partir de aquí se avisa "lenta"

/* fetch con corte por tiempo. AbortController existe en todo navegador que
   soporte esta PWA; el camino alterno es solo por si acaso — ahi la petición
   sigue viva en segundo plano, pero al menos la interfaz se destraba. */
function fetchTimeout(url, opts, ms){
  opts = opts || {};
  if(typeof AbortController === 'undefined'){
    return new Promise(function(res, rej){
      var listo=false;
      var t=setTimeout(function(){
        if(listo) return;
        var e=new Error('timeout'); e.name='AbortError'; rej(e);
      }, ms);
      fetch(url, opts).then(function(r){ listo=true; clearTimeout(t); res(r); },
                            function(e){ listo=true; clearTimeout(t); rej(e); });
    });
  }
  var ac=new AbortController();
  var t=setTimeout(function(){ ac.abort(); }, ms);
  opts.signal = ac.signal;
  return fetch(url, opts).then(function(r){ clearTimeout(t); return r; },
                              function(e){ clearTimeout(t); throw e; });
}

function supMs(ms){ return ms < 1000 ? (ms+' ms') : ((ms/1000).toFixed(1)+' s'); }

/* Pinta el mismo estado en el chip del modal y en el del panel. */
function supPintarConx(r){
  ['supConx','supConx2'].forEach(function(id){
    var e=$(id); if(!e) return;
    e.className = 'conx ' + (r.estado||'') + (id==='supConx' ? ' conx-modal' : ' conx-panel');
    var t=e.querySelector('.cx-t'); if(t) t.textContent = r.txt||'';
  });
}

function supTxtFalla(err, ms){
  if(err && err.name==='AbortError')
    return 'El servidor no respondió en ' + Math.round(SUP_TIMEOUT_PING_/1000) + ' s';
  if(!navigator.onLine) return 'Se cayó la red durante la prueba';
  return 'No se llega al servidor (' + supMs(ms) + ') — revisa el internet';
}

/* Prueba REAL: pide ?action=version, que no escribe nada ni necesita clave.
   Devuelve siempre un objeto (nunca rechaza) para que quien la llame decida. */
function supProbarConexion(){
  supPintarConx({ estado:'probando', txt:'Probando conexión…' });
  if(!navigator.onLine){
    var r0={ ok:false, estado:'mal', txt:'Sin red — este equipo no está conectado' };
    supPintarConx(r0); return Promise.resolve(r0);
  }
  var t0=Date.now();
  return fetchTimeout(GAS_URL+'?action=version&_='+t0, { cache:'no-store' }, SUP_TIMEOUT_PING_)
    .then(function(res){
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
    })
    .then(function(j){
      var ms=Date.now()-t0, lento = ms >= SUP_LENTO_MS_;
      var r={ ok:true, ms:ms, version:(j&&j.version)||'?', estado: lento?'lento':'ok',
              txt: (lento ? 'Conexión LENTA · ' : 'Conectado · ') + supMs(ms) };
      supPintarConx(r); return r;
    })
    .catch(function(err){
      var ms=Date.now()-t0;
      var r={ ok:false, ms:ms, estado:'mal', txt: supTxtFalla(err, ms) };
      supPintarConx(r); return r;
    });
}

/* Contador visible mientras se espera. Un botón congelado en "VALIDANDO..."
   no dice si sigue vivo; el número subiendo sí. Devuelve la función que
   restaura el botón. */
function supEsperando(btn, texto){
  if(!btn) return function(){};
  var t0=Date.now(), orig=btn.textContent;
  btn.disabled=true;
  btn.textContent=texto+' 0s';
  var iv=setInterval(function(){
    btn.textContent = texto+' '+Math.round((Date.now()-t0)/1000)+'s';
  }, 500);
  return function(){ clearInterval(iv); btn.disabled=false; btn.textContent=orig; };
}

/* La programación es estado compartido: no entra a la cola offline. */
function supPost(accion, datos){
  if(!SUP.pw) return Promise.reject(new Error('Sesión de supervisor cerrada. Vuelve a entrar.'));
  if(!navigator.onLine){
    supPintarConx({ estado:'mal', txt:'Sin red — este equipo no está conectado' });
    return Promise.reject(new Error('Sin red — la programación necesita internet. Revisa el wifi o el cable y vuelve a intentar.'));
  }
  var t0=Date.now();
  return fetchTimeout(GAS_URL, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion:accion, datos:merge(datos||{}, { pw:SUP.pw }) })
  }, SUP_TIMEOUT_MS_).then(function(res){
    if(!res.ok) throw new Error('El servidor respondió HTTP '+res.status+'. Reintenta en un minuto.');
    return res.json();
  }, function(err){
    // Falla de RED, no del negocio: aquí es donde antes quedaba colgado.
    // Se traduce a algo accionable y se repinta el chip para que se vea.
    supPintarConx({ estado:'mal', txt: supTxtFalla(err, Date.now()-t0) });
    if(err && err.name==='AbortError'){
      throw new Error('El servidor de Google no respondió en '+Math.round(SUP_TIMEOUT_MS_/1000)+
                      ' s. Casi siempre es el internet de la planta — toca "probar" y reintenta.');
    }
    throw new Error('No se pudo conectar con el servidor. Revisa el internet y toca "probar".');
  }).then(function(r){
    // Llegamos y volvimos: la conexión sirve, aunque el backend diga que no.
    var ms=Date.now()-t0, lento = ms >= SUP_LENTO_MS_;
    supPintarConx({ estado: lento?'lento':'ok',
                    txt: (lento ? 'Conexión LENTA · ' : 'Conectado · ')+supMs(ms) });
    return r;
  }).then(function(r){
    if(!r || r.status==='error'){
      var m = (r && r.message) || 'Error desconocido';
      if(m === 'CLAVE_INCORRECTA'){ SUP.pw = null; throw new Error('Clave incorrecta'); }
      // El backend no conoce las acciones sup*: este equipo guardó una versión
      // vieja de la app. No es problema de clave — hay que recargar.
      if(/no reconocida/i.test(m)){
        SUP.pw = null;
        throw new Error('Este equipo tiene guardada una versión vieja de la app. Cierra la página y vuelve a abrirla (en PC: Ctrl+Shift+R).');
      }
      throw new Error(m);
    }
    return r;
  });
}

/* ── Acceso ───────────────────────────────────────────── */
function abrirSupervisor(){
  if(SUP.pw){ supAbrirPanel(); supCargar(); return; }
  $('supPw').value='';
  show('supPwErr', false);
  cls('mSup','show',true);
  // Probar ANTES de que escriba la clave: si no hay conexión, que lo sepa ya
  // y no lo descubra por un "clave incorrecta" que no era la clave.
  supProbarConexion();
  setTimeout(function(){ var e=$('supPw'); if(e) e.focus(); }, 120);
}

function cerrarSupModal(){
  cls('mSup','show',false);
  $('supPw').value='';
  $('supPw').type='password';
  $('supPwEye').classList.remove('on');
}

/* Permite VER la clave escrita. Sin esto, un espacio de más metido por el
   teclado del celular es invisible y parece "clave incorrecta". */
function supVerClave(){
  var i=$('supPw'), b=$('supPwEye');
  var ver = i.type==='password';
  i.type = ver ? 'text' : 'password';
  b.classList[ver?'add':'remove']('on');
  i.focus();
}

function supEntrar(){
  // .trim(): los teclados de celular agregan un espacio al final y el campo
  // muestra puntos, así que el usuario no puede verlo ni corregirlo.
  var pw = $('supPw').value.trim();
  if(!pw){ show('supPwErr', true); $('supPwErr').textContent='Escribe la clave.'; return; }

  var restaurar = supEsperando($('supBtnEntrar'), 'VALIDANDO');
  show('supPwErr', false);
  SUP.pw = pw;

  supPost('supLogin', {}).then(function(){
    cerrarSupModal();
    supAbrirPanel();
    return supCargar();
  }).catch(function(err){
    SUP.pw = null;
    show('supPwErr', true);
    $('supPwErr').textContent = err.message;
  }).then(restaurar);
}

function supAbrirPanel(){
  SUP.activo = true;
  show('colsN', false);
  $('opPanel').className='op-panel';
  cls('supPanel','show',true);
  document.querySelectorAll('.opb[data-op]').forEach(function(b){ b.classList.remove('act'); });
  $('btnSup').classList.add('act');
  show('btnVolver', true);
  var lbl=$('eoLabel');
  if(lbl){ lbl.textContent='SUPERVISOR'; cls('eoLabel','on',true); cls('eoLabel','off',false); }
}

/* Solo cierra la vista; la sesión (SUP.pw) sigue viva hasta recargar. */
function supCerrarPanel(){
  SUP.activo = false;
  cls('supPanel','show',false);
  $('btnSup').classList.remove('act');
}

/* ── Datos ────────────────────────────────────────────── */
function supCargar(){
  $('supLista').innerHTML='<div class="hint" style="padding:8px">Cargando órdenes...</div>';
  return supPost('supDatos', {}).then(function(r){
    SUP.datos = r;
    supRender();
  }).catch(function(err){
    $('supLista').innerHTML='<div class="sup-warn">'+supEsc(err.message)
      + ' <button type="button" onclick="supCargar()" style="display:block;margin-top:6px;'
      + 'background:#f59e0b;color:#fff;border:none;border-radius:5px;padding:6px 10px;'
      + 'font-weight:800;font-size:11px;cursor:pointer">↻ REINTENTAR</button></div>';
    toast('❌ '+err.message,'err');
  });
}

function supRender(){
  var d = SUP.datos || {};
  var disp = d.disponibles || [], prog = d.programadas || [];

  // Dropdown de órdenes disponibles
  var sel=$('supOrden');
  sel.innerHTML = disp.length
    ? '<option value="">— Seleccione orden ('+disp.length+' disponibles) —</option>'
    : '<option value="">— No hay órdenes nuevas por programar —</option>';
  disp.forEach(function(o){
    var op=document.createElement('option');
    op.value=o.orden;
    op.textContent=o.orden+(o.producto ? ' · '+o.producto : '')+(o.cliente ? ' · '+o.cliente : '');
    sel.appendChild(op);
  });
  supOrdenChange();

  // Máquinas
  var ms=$('supMaq'), prev=ms.value;
  ms.innerHTML='<option value="">— Máquina —</option>';
  (d.maquinas||[]).forEach(function(m){
    var op=document.createElement('option'); op.value=m; op.textContent=m; ms.appendChild(op);
  });
  if(prev) ms.value=prev;

  // Sugerencias de materia prima ya usadas
  var dl=$('supMpList'); dl.innerHTML='';
  (d.mpUsadas||[]).forEach(function(m){
    var op=document.createElement('option'); op.value=m; dl.appendChild(op);
  });

  // Lista de programadas
  $('supCount').textContent = prog.length ? prog.length+' en producción' : '';
  if(!prog.length){
    $('supLista').innerHTML='<div class="hint" style="padding:8px">No hay órdenes en REGISTRO LIDER.</div>';
    return;
  }
  var html='';
  prog.forEach(function(p){
    var det=[];
    if(p.maquina)  det.push('Máq <b>'+supEsc(p.maquina)+'</b>');
    if(p.mp)       det.push('MP '+supEsc(p.mp));
    if(p.loteProd) det.push('Lote '+supEsc(p.loteProd));
    if(p.cantCaja) det.push(nf(p.cantCaja)+'/caja');
    // La col. S llega como float crudo (ej. 51.851851851851855) — se redondea
    var nCaj = parseFloat(String(p.cajas).replace(',','.'));
    if(!isNaN(nCaj) && nCaj > 0) det.push((Math.round(nCaj*10)/10)+' cajas');
    html += '<div class="sup-row">'
         +    '<div class="ix">'
         +      '<span class="o">'+supEsc(p.orden)+'<span style="font-weight:600;color:#9aa0a6;font-size:10px"> · fila '+p.fila+'</span></span>'
         +      '<span class="p">'+supEsc(p.producto || '(sin producto en ORDENES)')+'</span>'
         +      '<span class="m">'+det.join(' · ')+'</span>'
         +    '</div>'
         +    '<button class="sup-fin" onclick="supFin('+p.fila+',\''+supEsc(p.orden).replace(/'/g,'')+'\')">✔ FIN<br>PRODUCCIÓN</button>'
         +  '</div>';
  });
  $('supLista').innerHTML=html;
}

function supOrdenDisp(id){
  var out=null;
  ((SUP.datos||{}).disponibles||[]).forEach(function(x){ if(x.orden===id) out=x; });
  return out;
}

function supOrdenChange(){
  var o = supOrdenDisp(val('supOrden'));
  show('supInfo', !!o);
  if(!o) return;
  $('supIPro').textContent = o.producto || '—';
  $('supICli').textContent = o.cliente  || '—';
  $('supICol').textContent = o.color    || '—';
  $('supICan').textContent = o.cantidad ? nf(o.cantidad) : '—';
  $('supIMpr').textContent = o.mpReq ? (o.mpReq + (o.kgMp ? ' · '+o.kgMp+' kg' : '')) : '—';
  // La entrega llega como "28/07/2026 00:00:00" — se recorta la hora vacía
  var ent = String(o.entrega || '').replace(/\s+00:00:00$/, '');
  $('supIEst').textContent = [ent, o.estado].filter(Boolean).join(' · ') || '—';
}

/* ── Programar ────────────────────────────────────────── */
function supProgramar(){
  if(!reqs(['supOrden','supMp','supMaq','supCantCaja'])){
    toast('Completa los campos obligatorios','err'); return;
  }
  var d = {
    orden:    val('supOrden'),
    mp:       val('supMp'),
    loteMp:   val('supLoteMp'),
    loteProd: val('supLoteProd'),
    maquina:  val('supMaq'),
    cantCaja: numV('supCantCaja')
  };
  var o = supOrdenDisp(d.orden);

  mostrarConfirm([
    ['Orden (col. A)',            d.orden],
    ['Producto',                  (o && o.producto) || '—'],
    ['Cliente',                   (o && o.cliente)  || '—'],
    ['Materia prima (col. M)',    d.mp],
    ['Lote MP (col. N)',          d.loteMp  || '—'],
    ['Lote producción (col. O)',  d.loteProd || '—'],
    ['Máquina (col. P)',          d.maquina],
    ['Cant. por caja (col. Q)',   nf(d.cantCaja)]
  ], function(){
    var restaurar = supEsperando($('supBtnProg'), 'GUARDANDO');
    supPost('supProgramar', d).then(function(r){
      mostrarExito(r.message);
      ['supMp','supLoteMp','supLoteProd','supCantCaja'].forEach(function(id){ $(id).value=''; });
      $('supMaq').selectedIndex=0;
      limpiarErrores();
      return supCargar();
    }).catch(function(err){
      toast('❌ '+err.message,'err');
    }).then(restaurar);
  });
}

/* ── Fin de producción (col. U) → elimina la fila ──────── */
function supFin(fila, orden){
  var p=null;
  ((SUP.datos||{}).programadas||[]).forEach(function(x){ if(x.fila===fila) p=x; });

  mostrarConfirm([
    ['Orden',        orden],
    ['Producto',     (p && p.producto) || '—'],
    ['Máquina',      (p && p.maquina)  || '—'],
    ['Lote prod.',   (p && p.loteProd) || '—'],
    ['Fila',         String(fila)],
    ['⚠️ ATENCIÓN',  'Se ELIMINA la fila de REGISTRO LIDER. Es IRREVERSIBLE.']
  ], function(){
    toast('Marcando fin de producción...','warn');
    supPost('supFinProduccion', { fila:fila, orden:orden }).then(function(r){
      mostrarExito(r.message);
      return supCargar();
    }).catch(function(err){
      toast('❌ '+err.message,'err');
      supCargar();
    });
  });
}


/* ═══════════════════════════════════════════════════════
   MATERIAL A LA CANECA
   Diseño: docs/superpowers/specs/2026-08-21-inventario-mp-bolsa-enmienda.md §6

   Reglas que NO hay que romper:
   - El sistema NO le dice al operario cuánto tomar. El saldo se muestra
     como información, nunca como instrucción.
   - Todo en kilos. Los +25/+50 son atajos para bultos enteros, pero lo
     que viaja son kg.
   - El operario es la verdad: si tomó una referencia distinta a la de la
     orden, se avisa y se registra igual. Nunca se bloquea.
   - El id lo genera el cliente para que un reenvío de la cola offline no
     duplique: el backend descarta un id repetido.
   - La tarjeta solo aparece si el backend dice que el módulo está
     encendido (propiedad FVLCO_MATERIAL_ACTIVO del script).
═══════════════════════════════════════════════════════ */

function matMostrar(visible){
  var v = visible && GD.materialActivo;
  show('cardMat', v);
  var cols=$('colsN');
  if(cols) cols.classList[v?'add':'remove']('con-mat');
  /* NO se piden saldos aqui: al elegir maquina la carga inicial puede
     seguir corriendo (~9 s leyendo BD REPORTES PRODUCCION) y Apps Script
     serializa las ejecuciones del mismo usuario, asi que la peticion
     quedaria en cola. Se piden al elegir la orden — ver matAlCambiarOrden. */
  if(v) matLlenarBolsas();
}

/* Se llama al elegir orden. Elegir orden solo es posible cuando la carga
   inicial ya respondio, asi que aqui la cola de Apps Script esta libre. */
function matAlCambiarOrden(){
  if(!GD.materialActivo) return;
  if(MAT.cargado) matLlenarBolsas();   // ya hay saldos: solo repintar
  else matCargarSaldos();
}

/* Trae el saldo de cada bolsa. Sin conexión conserva la última lista y
   lo dice, en vez de mostrar ceros que no son. */
function matCargarSaldos(){
  if(!GD.materialActivo) return;
  fetch(GAS_URL + '?action=saldosMP')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(!d || d.status!=='success') throw new Error((d&&d.message)||'sin datos');
      MAT.virgen=d.virgen||[]; MAT.molido=d.molido||[];
      MAT.cargado=true; MAT.error='';
      matLlenarBolsas();
    })
    .catch(function(e){
      /* No tragarse la causa: sin esto es imposible saber si fallo la red
         o el pintado, y se depura a ciegas. */
      MAT.ultimoError = String((e && e.message) || e);
      try { console.warn('saldosMP fallo:', MAT.ultimoError); } catch(x){}
      MAT.error='saldo no disponible sin conexión';
      matLlenarBolsas();
    });
}

/* Llena los dos desplegables. Preselecciona la bolsa que coincide con la
   referencia de la orden, pero deja cambiarla: si se acabó el LH5420 y
   agarró otra cosa, tiene que poder decirlo. */
function matLlenarBolsas(){
  var o = GS.orden||{};
  var refOrden = String(o.mp||'').trim().toUpperCase();
  var famOrden = String(o.mpReq||'').trim().toUpperCase();

  var pinta = function(id, lista, coincide){
    var sel=$(id); if(!sel) return;
    sel.innerHTML='';
    if(!lista.length){
      var vac=document.createElement('option');
      vac.value=''; vac.textContent = MAT.cargado ? '— sin bolsas con saldo —' : '— sin cargar —';
      sel.appendChild(vac); return;
    }
    var nin=document.createElement('option');
    nin.value=''; nin.textContent='— ninguna —';
    sel.appendChild(nin);
    lista.forEach(function(b){
      var op=document.createElement('option');
      op.value=b.codigo;
      op.textContent=b.etiqueta+'  ('+nf(b.saldoKg)+' kg)';
      sel.appendChild(op);
    });
    for(var i=0;i<lista.length;i++){
      if(coincide(lista[i])){ sel.value=lista[i].codigo; break; }
    }
  };

  pinta('matBolsaV', MAT.virgen, function(b){
    return String(b.referencia||'').toUpperCase()===refOrden;
  });
  pinta('matBolsaM', MAT.molido, function(b){
    return String(b.familia||'').toUpperCase()===famOrden;
  });

  var pide=$('matPide');
  if(pide) pide.textContent = (o.mp||'—') + (o.mpReq ? ' ('+o.mpReq+')' : '');

  matPintarSaldo('V'); matPintarSaldo('M');
}

function matBolsa(tipo){
  var sel=$(tipo==='V'?'matBolsaV':'matBolsaM');
  if(!sel||!sel.value) return null;
  var lista = tipo==='V'?MAT.virgen:MAT.molido;
  for(var i=0;i<lista.length;i++) if(lista[i].codigo===sel.value) return lista[i];
  return null;
}

function matPintarSaldo(tipo){
  var div=$(tipo==='V'?'matSaldoV':'matSaldoM'); if(!div) return;
  if(MAT.error){ div.textContent=MAT.error; div.className='mat-saldo vacio'; return; }
  var b=matBolsa(tipo);
  if(!b){ div.textContent='—'; div.className='mat-saldo vacio'; return; }
  div.textContent='saldo '+nf(b.saldoKg)+' kg';
  div.className='mat-saldo';
}

function registrarMaterial(){
  limpiarErrores();
  var o=GS.orden||{};
  var useManual=$('ordenNL')&&$('ordenNL').checked;
  var ordId=useManual?val('ordenM'):val('orden');
  if(!ordId){ toast('Selecciona la orden antes de registrar material','warn'); return; }
  if(!reqs(['operario'])){ toast('Selecciona el operario','warn'); return; }

  var kgV=numV('matKgV'), kgM=numV('matKgM');
  if(kgV<=0 && kgM<=0){ toast('Escribe los kilos de virgen o de molido','warn'); return; }

  var bV=matBolsa('V'), bM=matBolsa('M');
  if(kgV>0 && !bV){ toast('Elige de qué bolsa de virgen tomaste','warn'); return; }
  if(kgM>0 && !bM){ toast('Elige de qué bolsa de molido tomaste','warn'); return; }

  /* Avisos suaves: informan y piden confirmación, nunca bloquean. */
  var avisos=[];
  if(bV && o.mp && String(bV.referencia||'').toUpperCase()!==String(o.mp).toUpperCase())
    avisos.push('La orden pide '+o.mp+' y estás echando '+bV.referencia+'.');
  if(bM && o.mpReq && String(bM.familia||'').toUpperCase()!==String(o.mpReq).toUpperCase())
    avisos.push('La orden es '+o.mpReq+' y el molido es '+bM.familia+'.');
  if(kgV+kgM>300)
    avisos.push('Son '+nf(kgV+kgM)+' kg de un solo golpe. La caneca es de ~150 kg.');
  if(bV && kgV>0 && bV.saldoKg>0 && kgV>bV.saldoKg)
    avisos.push('Estás sacando '+nf(kgV)+' kg y la bolsa tiene '+nf(bV.saldoKg)+' kg.');

  var base=datosBase();
  var datos=merge(base,{
    idRegistro:'m'+Date.now()+'-'+Math.floor(Math.random()*100000),
    caneca:base.maquina,
    orden:ordId,
    virgenReferencia: bV?bV.referencia:'',
    virgenFabricante: bV?bV.fabricante:'',
    virgenKg:kgV,
    molidoFamilia: bM?bM.familia:'',
    molidoColor:   bM?bM.color:'',
    molidoKg:kgM,
    observacion:val('matObs')
  });

  var enviar=function(){
    $('btnMat').disabled=true;
    llamarBackend('consumoMP', datos).then(function(r){
      $('btnMat').disabled=false;
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      try{
        var partes=[];
        if(kgV>0) partes.push(nf(kgV)+' kg virgen');
        if(kgM>0) partes.push(nf(kgM)+' kg molido');
        GS.matUltId=datos.idRegistro;
        GS.matUltTxt=partes.join(' + ');
        GS.matRegistrado=true;
        matPintarUltimo();
        ['matKgV','matKgM','matObs'].forEach(function(id){ var e=$(id); if(e) e.value=''; });
        cls('cardMat','mat-alerta',false);
        if(!(r&&r.offline)) matCargarSaldos();
      }catch(ex){}
      mostrarExito(r && r.offline
        ? '📴 Sin conexión — material guardado localmente. Se enviará al volver el internet.'
        : ((r&&r.message)||'Material registrado. ✅'));
    });
  };

  if(avisos.length){
    var res=avisos.map(function(a,i){ return ['Ojo '+(i+1), a]; });
    res.push(['Máquina',base.maquina]); res.push(['Orden',ordId]);
    res.push(['Virgen', kgV>0?nf(kgV)+' kg':'—']);
    res.push(['Molido', kgM>0?nf(kgM)+' kg':'—']);
    mostrarConfirm(res, enviar);
  } else {
    enviar();   // sin avisos no se pide confirmación: se registra varias veces por turno
  }
}

function matPintarUltimo(){
  var box=$('matUlt'), txt=$('matUltTxt');
  if(!box||!txt) return;
  if(!GS.matUltId){ box.className='mat-ult'; return; }
  var h=new Date();
  txt.textContent='Último: '+fmt2(h.getHours())+':'+fmt2(h.getMinutes())+' · '+GS.matUltTxt;
  box.className='mat-ult show';
}

/* Deshacer no borra: el backend escribe la contrapartida en negativo. */
function matDeshacer(){
  if(!GS.matUltId){ toast('No hay nada que deshacer','warn'); return; }
  var id=GS.matUltId;
  mostrarConfirm([['Deshacer', GS.matUltTxt],
                  ['Cómo','No se borra: se registra la devolución en negativo']], function(){
    var b=$('btnMatUndo'); if(b) b.disabled=true;
    llamarBackend('anularConsumoMP', { idRegistro:id }).then(function(r){
      if(b) b.disabled=false;
      if(r && r.status==='error'){ toast('❌ '+r.message,'err'); return; }
      GS.matUltId=null; GS.matUltTxt='';
      matPintarUltimo();
      matCargarSaldos();
      toast('Registro deshecho','ok');
    });
  });
}

/* Recordatorio. Esta PWA no lleva el avance del turno (el backend lo
   calcula pero el cliente no lo usa), asi que el disparador es lo que sí
   hay: varios reportes de producción sin haber registrado material.
   Resalta la tarjeta. No bloquea nada. */
function matChequearRecordatorio(){
  if(!GD.materialActivo || GS.matRegistrado) return;
  cls('cardMat','mat-alerta', GS.prodCount >= 3);
}

/* ── Enganches ────────────────────────────────────────── */
function supInit(){
  var e;
  e=$('supBtnEntrar'); if(e) e.addEventListener('click', supEntrar);
  e=$('supBtnProbar');  if(e) e.addEventListener('click', supProbarConexion);
  e=$('supBtnProbar2'); if(e) e.addEventListener('click', supProbarConexion);
  e=$('supBtnProg');   if(e) e.addEventListener('click', supProgramar);
  e=$('supOrden');     if(e) e.addEventListener('change', supOrdenChange);
  e=$('supPw');        if(e) e.addEventListener('keydown', function(ev){
    if(ev.key==='Enter'){ ev.preventDefault(); supEntrar(); }
  });
}

/* ═══════════════════════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', function(){
  init();
  supInit();
});
