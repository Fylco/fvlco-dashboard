
// =======================================================
// URLS
// =======================================================
const SHEETS = {
  produccion:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vSN27DTnvERSvXgjF5QwKZdvUupeMN7U5yQGuFTy6HrA6pK5D5y0755mPs-2jWEDGnYb6URjgC5yVp5/pub?gid=503325164&single=true&output=csv',
  noConformes:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSN27DTnvERSvXgjF5QwKZdvUupeMN7U5yQGuFTy6HrA6pK5D5y0755mPs-2jWEDGnYb6URjgC5yVp5/pub?gid=579426498&single=true&output=csv',
  planRef:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vSN27DTnvERSvXgjF5QwKZdvUupeMN7U5yQGuFTy6HrA6pK5D5y0755mPs-2jWEDGnYb6URjgC5yVp5/pub?gid=9934746&single=true&output=csv',
  accid:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vSN27DTnvERSvXgjF5QwKZdvUupeMN7U5yQGuFTy6HrA6pK5D5y0755mPs-2jWEDGnYb6URjgC5yVp5/pub?gid=904371036&single=true&output=csv',
  ventas:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vSN27DTnvERSvXgjF5QwKZdvUupeMN7U5yQGuFTy6HrA6pK5D5y0755mPs-2jWEDGnYb6URjgC5yVp5/pub?gid=2006233736&single=true&output=csv',
};
const proxy = u => location.protocol === 'file:' ? 'https://corsproxy.io/?' + encodeURIComponent(u) : u;

// =======================================================
// PALETTE & CONSTANTS
// =======================================================
const PAL = ['#8B5CF6','#06B6D4','#3B82F6','#10B981','#F59E0B','#EF4444','#F97316','#EC4899','#A78BFA','#34D399'];
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_CAP = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// =======================================================
// STATE
// =======================================================
let DATA = { prod: [], nc: [], planRef: [], ventas: [], accid: [], ncByOrden: {} };
let CHARTS = {};
let SEL_DIAS      = new Set();
let SEL_RAZONES   = new Set();
let SEL_DIAS_PARO = new Set();
let SEL_CAUSAS    = new Set();
let SEL_DIAS_NC   = new Set();
// Tarifas por máquina (COP/hora) — editables por el usuario
let TARIFAS_MAQ = { 1:25000, 2:25000, 3:25000, 4:35000, 5:35000, 6:20000 };

// ── Multi-select días (global top bar)
function toggleDiaDD(e) {
  e.stopPropagation();
  const dd = document.getElementById('g-dia-dd');
  dd.classList.toggle('show');
  if (dd.classList.contains('show')) dd.onclick = e => e.stopPropagation();
}
function toggleDia(dia) {
  if (SEL_DIAS.has(dia)) SEL_DIAS.delete(dia); else SEL_DIAS.add(dia);
  updateDiaBtn();
  applyGlobalFilter();
}
function clearDias() {
  SEL_DIAS.clear();
  document.querySelectorAll('#g-dia-dd input[type=checkbox]').forEach(cb=>cb.checked=false);
  updateDiaBtn();
  applyGlobalFilter();
}
function updateDiaBtn() {
  const btn = document.getElementById('g-dia-btn');
  if (!btn) return;
  if (SEL_DIAS.size === 0) { btn.textContent='Todos los días ▾'; btn.classList.remove('active'); }
  else { btn.textContent=`${SEL_DIAS.size} día(s) ▾`; btn.classList.add('active'); }
}
function buildDiaDd(dias) {
  const dd = document.getElementById('g-dia-dd');
  if (!dd) return;
  dd.innerHTML = dias.map(d=>`
    <label class="ms-item">
      <input type="checkbox" onchange="toggleDia('${d}')" ${SEL_DIAS.has(d)?'checked':''}>
      Día ${d}
    </label>`).join('');
}

// ── Panel paros: días independientes
function toggleParoDiaDD(e) {
  e.stopPropagation();
  const dd = document.getElementById('paro-dia-dd');
  dd.classList.toggle('show');
  if (dd.classList.contains('show')) dd.onclick = e => e.stopPropagation();
}
function toggleParoDia(dia) {
  if (SEL_DIAS_PARO.has(dia)) SEL_DIAS_PARO.delete(dia); else SEL_DIAS_PARO.add(dia);
  updateParoDiaBtn();
}
function clearParoDias() {
  SEL_DIAS_PARO.clear();
  document.querySelectorAll('#paro-dia-dd input[type=checkbox]').forEach(cb=>cb.checked=false);
  updateParoDiaBtn();
  renderParos();
}
function updateParoDiaBtn() {
  const btn = document.getElementById('paro-dia-btn');
  if (!btn) return;
  if (SEL_DIAS_PARO.size===0) { btn.textContent='Todos los días ▾'; btn.classList.remove('active'); }
  else { btn.textContent=`${SEL_DIAS_PARO.size} día(s) ▾`; btn.classList.add('active'); }
}
function buildParoDiaDd(dias) {
  const dd = document.getElementById('paro-dia-dd');
  if (!dd) return;
  dd.innerHTML = dias.map(d=>`
    <label class="ms-item">
      <input type="checkbox" onchange="toggleParoDia('${d}')">
      Día ${d}
    </label>`).join('');
}

// ── Panel paros: razones
function toggleRazon(r) {
  if (SEL_RAZONES.has(r)) SEL_RAZONES.delete(r); else SEL_RAZONES.add(r);
}
function clearParoPanel() {
  SEL_RAZONES.clear(); SEL_DIAS_PARO.clear();
  document.getElementById('paro-fp-mes').value='';
  document.getElementById('paro-f-maq').value='';
  document.querySelectorAll('#paro-razones-list input,#paro-dia-dd input').forEach(cb=>cb.checked=false);
  updateParoDiaBtn();
  renderParos();
}
function syncParoMes() { renderParos(); }

// ── Panel NC: días independientes
function toggleNcDiaDD(e) {
  e.stopPropagation();
  const dd = document.getElementById('nc-dia-dd');
  dd.classList.toggle('show');
  if (dd.classList.contains('show')) dd.onclick = e => e.stopPropagation();
}
function toggleNcDia(dia) {
  if (SEL_DIAS_NC.has(dia)) SEL_DIAS_NC.delete(dia); else SEL_DIAS_NC.add(dia);
  const btn = document.getElementById('nc-dia-btn');
  if (btn) { btn.textContent = SEL_DIAS_NC.size===0?'Todos los días ▾':`${SEL_DIAS_NC.size} día(s) ▾`; btn.classList.toggle('active', SEL_DIAS_NC.size>0); }
}
function clearNcDias() {
  SEL_DIAS_NC.clear();
  document.querySelectorAll('#nc-dia-dd input').forEach(cb=>cb.checked=false);
  const btn=document.getElementById('nc-dia-btn'); if(btn){btn.textContent='Todos los días ▾';btn.classList.remove('active');}
  renderNC();
}
function toggleCausa(c) {
  if (SEL_CAUSAS.has(c)) SEL_CAUSAS.delete(c); else SEL_CAUSAS.add(c);
}
function clearNcPanel() {
  SEL_CAUSAS.clear(); SEL_DIAS_NC.clear();
  document.getElementById('nc-fp-mes').value='';
  document.getElementById('nc-f-maq').value='';
  document.querySelectorAll('#nc-causas-list input,#nc-dia-dd input').forEach(cb=>cb.checked=false);
  const btn=document.getElementById('nc-dia-btn'); if(btn){btn.textContent='Todos los días ▾';btn.classList.remove('active');}
  renderNC();
}
function buildNcDiaDd(dias) {
  const dd = document.getElementById('nc-dia-dd'); if(!dd) return;
  dd.innerHTML = dias.map(d=>`<label class="ms-item"><input type="checkbox" onchange="toggleNcDia('${d}')"> Día ${d}</label>`).join('');
}

// ── Cerrar dropdowns al hacer clic fuera
document.addEventListener('click', ()=>{
  document.querySelectorAll('.multi-sel-dropdown.show').forEach(d=>d.classList.remove('show'));
});

// =======================================================
// UTILS
// =======================================================
function pNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).replace(/\./g,'').replace(',','.').replace('%','').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function fmt(n, decimals=0) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1)+'K';
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function pct(n) { return n !== null && !isNaN(n) ? n.toFixed(1)+'%' : '—'; }
function avg(arr, key) {
  const v = arr.map(r => r[key]).filter(x => x !== null && x !== undefined && !isNaN(x) && x > 0);
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
}
function sum(arr, key) {
  return arr.map(r => r[key]).filter(x => x > 0 && !isNaN(x)).reduce((a,b)=>a+b,0);
}
function badge(v, t1=85, t2=65) {
  if (v === null) return '<span class="badge-yellow">—</span>';
  if (v >= t1) return `<span class="badge-green">${pct(v)}</span>`;
  if (v >= t2) return `<span class="badge-yellow">${pct(v)}</span>`;
  return `<span class="badge-red">${pct(v)}</span>`;
}
function destroyChart(id) { if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; } }

// =======================================================
// DATA LOADING
// =======================================================
async function fetchCSV(url) {
  const res = await fetch(proxy(url));
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return Papa.parse(await res.text(), { header: true, skipEmptyLines: true });
}

function normalizeProd(r) {
  const out = {};
  for (const k in r) out[k.trim()] = r[k];
  for (const k in out) {
    const v = out[k];
    if (typeof v === 'string' && v !== '') {
      const n = pNum(v);
      if (n !== null) out[k] = n;
    }
  }
  // normalize pct fields 0-1 → 0-100
  ['% RENDIMIENTO','% DISPONIBILIDAD','OEE FINAL','% CALIDAD'].forEach(f => {
    if (out[f] !== null && out[f] !== undefined && Math.abs(out[f]) <= 1.5) out[f] = out[f]*100;
  });
  out._mes   = typeof out['MES'] === 'string' ? out['MES'].toLowerCase() : out['MES'];
  out._maq   = out['MÁQUINA'] ?? out['MAQUINA'] ?? '';
  out._turno = out['TURNO'] ?? '';
  out._prod  = out['PRODUCTO'] ?? '';
  out._orden = out['ORDEN'] ?? '';
  out._cant  = pNum(out['CANT REPORTADA']) || 0;
  out._paro  = pNum(out['TIEMPO PARO MIN']) || 0;
  out._rend  = out['% RENDIMIENTO'];
  out._disp  = out['% DISPONIBILIDAD'];
  out._oee   = out['OEE FINAL'];
  return out;
}

function buildNcByOrden(ncRows) {
  const map = {};
  ncRows.forEach(r => {
    const orden = r['ORDEN'];
    const nc = pNum(r['CANTIDAD NC']);
    if (orden && nc > 0) map[orden] = (map[orden]||0) + nc;
  });
  return map;
}

function calcCalidad(rows) {
  const ordenes = [...new Set(rows.map(r => r._orden).filter(Boolean))];
  let tp=0, tn=0;
  ordenes.forEach(o => {
    const prod = rows.filter(r=>r._orden==o).reduce((s,r)=>s+r._cant,0);
    const nc   = Math.min(DATA.ncByOrden[o]||0, prod);
    tp += prod; tn += nc;
  });
  if (tp <= 0) return null;
  return Math.min(100, Math.max(0, ((tp-tn)/tp)*100));
}

function setProgress(p, msg) {
  document.getElementById('load-bar').style.width = p+'%';
  document.getElementById('load-msg').textContent = msg;
}

async function loadAll() {
  try {
    setProgress(10, 'Cargando Producción...');
    const prodParsed = await fetchCSV(SHEETS.produccion);
    DATA.prod = prodParsed.data.map(normalizeProd);

    setProgress(28, 'Cargando No Conformes...');
    const ncParsed = await fetchCSV(SHEETS.noConformes);
    DATA.nc = ncParsed.data;
    DATA.ncByOrden = buildNcByOrden(DATA.nc);

    setProgress(46, 'Cargando Plan Referencias...');
    const planParsed = await fetchCSV(SHEETS.planRef);
    DATA.planRef = planParsed.data;

    setProgress(64, 'Cargando Ventas y Compras...');
    const ventasParsed = await fetchCSV(SHEETS.ventas);
    DATA.ventas = ventasParsed.data;

    setProgress(82, 'Cargando Accidentalidad...');
    const accidParsed = await fetchCSV(SHEETS.accid);
    DATA.accid = accidParsed.data;

    setProgress(100, 'Listo');
    document.getElementById('last-update').textContent =
      `Actualizado: ${new Date().toLocaleString('es-CO')} · ${DATA.prod.length} registros`;

    populateAllFilters();
    renderAll();
    setTimeout(() => { document.getElementById('overlay').style.display='none'; }, 400);
  } catch(e) {
    document.getElementById('load-msg').textContent = '⚠️ Error: '+e.message;
    document.getElementById('load-bar').style.background='#EF4444';
  }
}

async function reloadAll() {
  document.getElementById('overlay').style.display='flex';
  setProgress(0, 'Recargando...');
  await loadAll();
}

// =======================================================
// FILTERS
// =======================================================
function fillSel(id, vals, label) {
  const s = document.getElementById(id); if (!s) return;
  s.innerHTML = `<option value="">Todo (${label})</option>` +
    vals.map(v=>`<option>${v}</option>`).join('');
}
function getVal(id) { const s=document.getElementById(id); return s?s.value:''; }
function clearFilters(prefix) {
  document.querySelectorAll(`[id^="${prefix}-f-"]`).forEach(s=>s.value='');
}

function populateAllFilters() {
  const meses = [...new Set(DATA.prod.map(r=>r._mes).filter(Boolean))];
  const maqs  = [...new Set(DATA.prod.map(r=>r._maq).filter(Boolean))].sort();
  const dias  = [...new Set(DATA.prod.map(r=>r['DIA']).filter(x=>x!==null&&x!==undefined&&x!==''))].sort((a,b)=>Number(a)-Number(b)).map(String);
  // Global top bar
  fillSel('g-mes', meses.map(cap), 'Mes');
  buildDiaDd(dias);
  // OEE section
  fillSel('oee-f-maq', maqs, 'Máquina');
  // Paros panel
  fillSel('paro-fp-mes', meses.map(cap), 'Mes');
  fillSel('paro-f-maq', maqs, 'Máquina');
  buildParoDiaDd(dias);
  // Razones de paro
  const razonMap = {};
  DATA.prod.filter(r=>r._paro>0).forEach(r=>{ const k=(r['RAZON PARO']||'').trim(); if(k) razonMap[k]=(razonMap[k]||0)+1; });
  const razones = Object.entries(razonMap).sort((a,b)=>b[1]-a[1]);
  const list = document.getElementById('paro-razones-list');
  if (list) list.innerHTML = razones.map(([r,cnt])=>`
    <label class="razon-item">
      <input type="checkbox" onchange="toggleRazon('${r.replace(/'/g,"\\'")}')">
      <span style="flex:1">${r||'Sin dato'}</span>
      <span class="razon-count">${cnt}</span>
    </label>`).join('');
  // NC & OTIF
  const ncMeses = [...new Set(DATA.nc.map(r=>(r['MES ']||r['MES']||'').trim()).filter(Boolean))];
  const ncMaq   = [...new Set(DATA.nc.map(r=>((r['MÁQUINA']??r['MAQUINA'])||'')).filter(Boolean))].sort();
  fillSel('nc-fp-mes', ncMeses.map(cap), 'Mes');
  fillSel('nc-f-maq', ncMaq, 'Máquina');
  buildNcDiaDd(dias);
  // Causas NC
  const causaMap = {};
  DATA.nc.forEach(r=>{ const k=(r['CAUSA']||'').trim(); if(k){ const v=pNum(r['CANTIDAD NC'])||0; causaMap[k]=(causaMap[k]||0)+v; }});
  const causas = Object.entries(causaMap).sort((a,b)=>b[1]-a[1]);
  const ncList = document.getElementById('nc-causas-list');
  if (ncList) ncList.innerHTML = causas.map(([c,v])=>`
    <label class="razon-item">
      <input type="checkbox" onchange="toggleCausa('${c.replace(/'/g,"\\'")}')">
      <span style="flex:1">${c}</span>
      <span class="razon-count">${fmt(v)}</span>
    </label>`).join('');
  const vCli = [...new Set(DATA.ventas.map(r=>(r['Nombre tercero']||'').trim()).filter(Boolean))].sort();
  fillSel('otif-f-cliente', vCli, 'Cliente');
}

function cap(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

function gMes() { return getVal('g-mes').toLowerCase(); }
function gDia() { return SEL_DIAS; } // Set

function filterProd() {
  const m = gMes(); const dias = gDia();
  const maq = getVal('oee-f-maq'); const t = getVal('oee-f-turno');
  return DATA.prod.filter(r =>
    (!m        || r._mes === m) &&
    (!dias.size || dias.has(String(r['DIA']||''))) &&
    (!maq      || String(r._maq) === maq) &&
    (!t        || String(r._turno) === t)
  );
}
function filterParo() {
  const m   = (getVal('paro-fp-mes')||getVal('g-mes')).toLowerCase();
  const maq = getVal('paro-f-maq');
  const dias = SEL_DIAS_PARO.size ? SEL_DIAS_PARO : SEL_DIAS;
  return DATA.prod.filter(r =>
    (!m        || r._mes === m) &&
    (!dias.size || dias.has(String(r['DIA']||''))) &&
    (!maq      || String(r._maq) === maq) &&
    (!SEL_RAZONES.size || SEL_RAZONES.has((r['RAZON PARO']||'').trim()))
  );
}
function filterNC() {
  const m   = (getVal('nc-fp-mes')||getVal('g-mes')).toLowerCase();
  const maq = getVal('nc-f-maq');
  // NC sheet has no DIA column — only use panel's own day filter (SEL_DIAS_NC)
  const dias = SEL_DIAS_NC;
  return DATA.nc.filter(r =>
    (!m    || (r['MES ']||r['MES']||'').trim().toLowerCase() === m) &&
    (!dias.size || dias.has(String(r['DIA']||r['DIA ']||''))) &&
    (!maq  || String(((r['MÁQUINA']??r['MAQUINA'])||'')) === maq) &&
    (!SEL_CAUSAS.size || SEL_CAUSAS.has((r['CAUSA']||'').trim()))
  );
}
function filterVentas() {
  const m = gMes(); const c = getVal('otif-f-cliente');
  return DATA.ventas.filter(r =>
    (!m || (r['MES ']||r['MES']||'').trim().toLowerCase() === m) &&
    (!c || (r['Nombre tercero']||'').trim() === c)
  );
}
function applyGlobalFilter() {
  const id = document.querySelector('.section.active')?.id?.replace('sec-','');
  const map = { resumen:renderResumen, oee:renderOEE, 'plan-mensual':renderPlanMensual,
    'plan-ref':renderPlanRef, noconf:renderNC, otif:renderOTIF, paros:renderParos, accid:renderAccid, costos:renderCostos };
  if (id && map[id]) map[id]();
}

// =======================================================
// CHART FACTORY
// =======================================================
function makeChart(id, type, labels, datasets, opts={}) {
  destroyChart(id);
  const ctx = document.getElementById(id); if(!ctx) return;
  CHARTS[id] = new Chart(ctx, {
    type, data:{labels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{labels:{color:'#9CA3AF',boxWidth:11,font:{size:10,family:'Poppins'}}}, tooltip:{mode:'index',intersect:false} },
      scales: type==='doughnut'||type==='pie' ? {} : {
        x:{ticks:{color:'#6B7280',font:{size:10}},grid:{color:'#1F2937'},...(opts.xScale||{})},
        y:{ticks:{color:'#6B7280',font:{size:10}},grid:{color:'#374151'},...(opts.yScale||{})}
      },
      indexAxis: opts.indexAxis,
      ...opts.extra
    }
  });
}
function makeGauge(id, val, color) {
  destroyChart(id);
  const ctx = document.getElementById(id); if(!ctx) return;
  const v = Math.min(100, Math.max(0, val||0));
  CHARTS[id] = new Chart(ctx, {
    type:'doughnut',
    data:{ datasets:[{ data:[v,100-v], backgroundColor:[color,'rgba(255,255,255,.06)'], borderWidth:0, circumference:180, rotation:270 }] },
    options:{ responsive:false, cutout:'72%', plugins:{legend:{display:false},tooltip:{enabled:false}} }
  });
}

// =======================================================
// RENDER FUNCTIONS
// =======================================================

// ── KPI card builder
function kpiCard(label, val, color, sub='', icon='') {
  return `<div class="kpi-card" style="border-top:3px solid ${color}">
    <div style="font-size:.65rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${icon?`<i class="${icon}" style="margin-right:4px"></i>`:''}${label}</div>
    <div style="font-size:1.8rem;font-weight:800;color:${color};line-height:1">${val}</div>
    <div style="font-size:.7rem;color:#4B5563;margin-top:5px">${sub}</div>
  </div>`;
}

// ── RESUMEN
function renderResumen() {
  const d    = filterProd();
  const vnts = filterVentas();
  const nc   = filterNC();
  const oee  = avg(d,'_oee');
  const rend = avg(d,'_rend');
  const disp = avg(d,'_disp');
  const cal  = calcCalidad(d);
  const otif = calcOTIF(vnts);
  const accDias = getAccDias();
  const mesLabel = getVal('g-mes') ? ` (${cap(getVal('g-mes'))})` : '';

  document.getElementById('resumen-kpis').innerHTML =
    kpiCard('OEE Final', pct(oee), oee>=85?'#10B981':oee>=65?'#F59E0B':'#EF4444','','fa-solid fa-circle-nodes') +
    kpiCard('Rendimiento', pct(rend),'#8B5CF6','','fa-solid fa-gauge-high') +
    kpiCard('Disponibilidad', pct(disp),'#06B6D4','','fa-solid fa-power-off') +
    kpiCard('Calidad', pct(cal),'#10B981','','fa-solid fa-star') +
    kpiCard('OTIF', pct(otif),'#3B82F6','Entregas a tiempo','fa-solid fa-truck-fast') +
    kpiCard('Días sin Accidente', accDias!==null?accDias:'—','#F59E0B','','fa-solid fa-helmet-safety') +
    kpiCard('Unidades Producidas', fmt(sum(d,'_cant')),'#A78BFA',`${d.length} registros${mesLabel}`,'fa-solid fa-industry') +
    kpiCard('Tiempo Paro', fmt(sum(d,'_paro'))+' min','#EF4444',`${(sum(d,'_paro')/60).toFixed(0)} horas`,'fa-solid fa-clock');

  // Mini chart: OEE por máquina
  const maqs = [...new Set(d.map(r=>r._maq).filter(Boolean))].sort();
  makeChart('r-oee-maq','bar', maqs.map(m=>'Maq '+m),
    [{label:'OEE %', data:maqs.map(m=>avg(d.filter(r=>r._maq==m),'_oee')), backgroundColor:PAL, borderRadius:5}]);

  // Mini chart: Plan vs Real mensual
  const planMes = calcPlanMensual();
  makeChart('r-plan-mes','bar', planMes.map(x=>cap(x.mes)),[
    {label:'Planeado', data:planMes.map(x=>x.plan), backgroundColor:'#8B5CF644', borderColor:'#8B5CF6', borderWidth:2},
    {label:'Real', data:planMes.map(x=>x.real), backgroundColor:'#06B6D444', borderColor:'#06B6D4', borderWidth:2}
  ]);

  // Mini chart: NC por causa (filtrado)
  const ncCausa = {};
  nc.forEach(r=>{ const k=r['CAUSA']||'Sin dato'; const v=pNum(r['CANTIDAD NC'])||0; if(v>0) ncCausa[k]=(ncCausa[k]||0)+v; });
  const topNC = Object.entries(ncCausa).sort((a,b)=>b[1]-a[1]).slice(0,6);
  makeChart('r-nc-causa','doughnut', topNC.map(x=>x[0].substring(0,25)),
    [{data:topNC.map(x=>x[1]), backgroundColor:PAL, borderWidth:0}]);

  // Mini chart: OTIF mensual (filtrado)
  const otifMes = calcOTIFMensual(vnts);
  makeChart('r-otif-mes','line', otifMes.map(x=>cap(x.mes)),
    [{label:'OTIF %', data:otifMes.map(x=>x.otif), borderColor:'#3B82F6', backgroundColor:'#3B82F622', tension:.4, fill:true, pointRadius:3}]);
}

// ── OEE
function renderOEE() {
  const d = filterProd();
  const oee  = avg(d,'_oee');
  const rend = avg(d,'_rend');
  const disp = avg(d,'_disp');
  const cal  = calcCalidad(d);

  // Gauge cards
  const gData = [
    {id:'g-oee', label:'OEE Final', val:oee, col:oee>=85?'#10B981':oee>=65?'#F59E0B':'#EF4444'},
    {id:'g-rend',label:'Rendimiento',val:rend,col:'#8B5CF6'},
    {id:'g-disp',label:'Disponibilidad',val:disp,col:'#06B6D4'},
    {id:'g-cal', label:'Calidad',val:cal,col:'#10B981'}
  ];
  document.getElementById('oee-gauges').innerHTML = gData.map(g=>`
    <div class="kpi-card" style="text-align:center">
      <div style="font-size:.65rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${g.label}</div>
      <div style="width:130px;height:75px;margin:0 auto;position:relative"><canvas id="${g.id}" width="130" height="75"></canvas></div>
      <div style="font-size:1.6rem;font-weight:800;color:${g.col};margin-top:4px">${pct(g.val)}</div>
    </div>`).join('');
  gData.forEach(g=>makeGauge(g.id,g.val,g.col));

  // Trend — aggregate by mes+dia to avoid thousands of points
  const avgArr = arr => { const v=arr.filter(x=>x>0&&x<=100); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const byDay = {};
  d.forEach(r => {
    const key = (r._mes||'')+'_'+(r['DIA']||'?');
    if (!byDay[key]) byDay[key] = {label: r['DIA']||'?', oee:[],rend:[],disp:[],calNumer:0,calDenom:0};
    if (r._oee  > 0 && r._oee  <= 100) byDay[key].oee.push(r._oee);
    if (r._rend > 0 && r._rend <= 100) byDay[key].rend.push(r._rend);
    if (r._disp > 0 && r._disp <= 100) byDay[key].disp.push(r._disp);
    const nc = Math.min(DATA.ncByOrden[r._orden]||0, r._cant);
    byDay[key].calNumer += (r._cant - nc);
    byDay[key].calDenom += r._cant;
  });
  const dayVals = Object.values(byDay);
  const tLabels = dayVals.map(x=>x.label);
  makeChart('oee-trend','line',tLabels,[
    {label:'OEE',          data:dayVals.map(x=>avgArr(x.oee)),  borderColor:'#10B981',fill:false,tension:.4,pointRadius:2,pointHoverRadius:5},
    {label:'Rendimiento',  data:dayVals.map(x=>avgArr(x.rend)), borderColor:'#8B5CF6',fill:false,tension:.4,pointRadius:2,pointHoverRadius:5},
    {label:'Disponibilidad',data:dayVals.map(x=>avgArr(x.disp)),borderColor:'#06B6D4',fill:false,tension:.4,pointRadius:2,pointHoverRadius:5},
    {label:'Calidad',      data:dayVals.map(x=>x.calDenom>0?Math.min(100,(x.calNumer/x.calDenom)*100):null),borderColor:'#F59E0B',fill:false,tension:.4,pointRadius:2,pointHoverRadius:5},
  ],{xScale:{ticks:{maxTicksLimit:15}},yScale:{min:0,max:100}});

  // OEE por maq
  const maqs = [...new Set(d.map(r=>r._maq).filter(Boolean))].sort();
  makeChart('oee-maq','bar',maqs.map(m=>'Maq '+m),
    [{label:'OEE %',data:maqs.map(m=>avg(d.filter(r=>r._maq==m),'_oee')),
      backgroundColor:maqs.map((_,i)=>PAL[i%PAL.length]+'bb'),borderRadius:5}]);

  // Table
  const rows = maqs.map(m=>{
    const s=d.filter(r=>r._maq==m);
    return `<tr>
      <td style="font-weight:600">Máq ${m}</td>
      <td>${s.length}</td>
      <td>${fmt(sum(s,'_cant'))}</td>
      <td>${badge(avg(s,'_oee'))}</td>
      <td>${badge(avg(s,'_rend'))}</td>
      <td>${badge(avg(s,'_disp'))}</td>
      <td>${badge(calcCalidad(s))}</td>
      <td style="color:#EF4444">${fmt(sum(s,'_paro'))} min</td>
    </tr>`;
  }).join('');
  document.getElementById('oee-tbl').innerHTML=`
    <thead><tr><th>Máquina</th><th>Reg.</th><th>Unidades</th><th>OEE</th><th>Rendimiento</th><th>Disponibilidad</th><th>Calidad</th><th>Paro</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

// ── PLAN MENSUAL
function calcPlanMensual() {
  const mesMap = {};
  DATA.planRef.forEach(row=>{
    const ref = row['REFERENCIA / PRODUCTO'];
    if (!ref || ref.trim()==='') return;
    MESES_CAP.forEach(m=>{
      const v = pNum(row[m]);
      if (v>0) mesMap[m] = (mesMap[m]||0) + v;
    });
  });
  return MESES_CAP.map(m=>({
    mes: m,
    plan: mesMap[m]||0,
    real: DATA.prod.filter(r=>r._mes===m.toLowerCase()).reduce((s,r)=>s+r._cant,0)
  })).filter(x=>x.plan>0||x.real>0);
}

function renderPlanMensual() {
  const data = calcPlanMensual();
  const labels = data.map(x=>x.mes);
  makeChart('pm-chart','bar',labels,[
    {label:'Planeado',data:data.map(x=>x.plan),backgroundColor:'#8B5CF644',borderColor:'#8B5CF6',borderWidth:2,borderRadius:4},
    {label:'Real',data:data.map(x=>x.real),backgroundColor:'#06B6D466',borderColor:'#06B6D4',borderWidth:2,borderRadius:4}
  ]);
  const rows = data.map(x=>{
    const cumpl = x.plan>0?(x.real/x.plan*100):null;
    return `<tr>
      <td style="font-weight:600">${x.mes}</td>
      <td>${fmt(x.plan)}</td>
      <td>${fmt(x.real)}</td>
      <td>${badge(cumpl,95,80)}</td>
      <td style="color:${x.real>=x.plan?'#10B981':'#EF4444'}">${x.real>=x.plan?'↑ Cumple':'↓ Pendiente'}</td>
    </tr>`;
  }).join('');
  document.getElementById('pm-tbl').innerHTML=`
    <thead><tr><th>Mes</th><th>Planeado</th><th>Real</th><th>Cumplimiento</th><th>Estado</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

// ── PLAN REFERENCIAS
function renderPlanRef() {
  const mesSel = getVal('pref-f-mes');
  const meses = mesSel ? [mesSel] : MESES_CAP;

  const refs = DATA.planRef.map(row=>{
    const ref = row['REFERENCIA / PRODUCTO'];
    if (!ref||!ref.trim()) return null;
    const plan = meses.reduce((s,m)=>s+(pNum(row[m])||0),0);
    const real = DATA.prod.filter(r=>r._prod===ref&&(!mesSel||r._mes===mesSel.toLowerCase()))
                          .reduce((s,r)=>s+r._cant,0);
    return {ref, plan, real};
  }).filter(Boolean).filter(x=>x.plan>0||x.real>0).sort((a,b)=>b.plan-a.plan).slice(0,15);

  makeChart('pref-chart','bar',refs.map(x=>x.ref.substring(0,30)),[
    {label:'Planeado',data:refs.map(x=>x.plan),backgroundColor:'#8B5CF644',borderColor:'#8B5CF6',borderWidth:2,borderRadius:3},
    {label:'Real',data:refs.map(x=>x.real),backgroundColor:'#06B6D466',borderColor:'#06B6D4',borderWidth:2,borderRadius:3}
  ]);

  const rows = refs.map(x=>{
    const c = x.plan>0?(x.real/x.plan*100):null;
    return `<tr>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.ref}</td>
      <td>${fmt(x.plan)}</td><td>${fmt(x.real)}</td>
      <td>${badge(c,95,80)}</td>
    </tr>`;
  }).join('');
  document.getElementById('pref-tbl').innerHTML=`
    <thead><tr><th>Referencia</th><th>Planeado</th><th>Real</th><th>Cumplimiento</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

// ── NO CONFORMES
function groupNC(col) {
  const m={};
  DATA.nc.forEach(r=>{ const k=r[col]||'Sin dato'; const v=pNum(r['CANTIDAD NC'])||0; if(v>0) m[k]=(m[k]||0)+v; });
  return m;
}
function renderNC() {
  const d = filterNC();
  const totalNC  = d.reduce((s,r)=>s+(pNum(r['CANTIDAD NC'])||0),0);
  const totalProd = sum(DATA.prod,'_cant');
  const pctNC = totalProd>0?(totalNC/totalProd*100):0;
  // Pitorro ratio
  const pitRows = d.filter(r=>(r['CAUSA']||'').toUpperCase().includes('PITORRO'));
  const kgPitorro= pitRows.reduce((s,r)=>s+(pNum(r['PESO TOTAL'])||0),0);
  const kgTotal  = d.reduce((s,r)=>s+(pNum(r['PESO TOTAL'])||0),0);
  const ratioPit = kgTotal>0?(kgPitorro/kgTotal*100):0;

  document.getElementById('nc-kpis').innerHTML=
    kpiCard('Total NC',fmt(totalNC),'#EF4444',`${d.length} registros`,'fa-solid fa-circle-xmark')+
    kpiCard('% NC / Producción',pct(pctNC),'#F59E0B','Meta < 2%','fa-solid fa-percent')+
    kpiCard('Pitorro (Rama) kg',fmt(kgPitorro,1),'#F97316',`${pct(ratioPit)} del total NC`,'fa-solid fa-code-branch')+
    kpiCard('Kg NC Total',fmt(kgTotal,1),'#8B5CF6','Kg no conformes','fa-solid fa-weight-hanging');

  // Pareto causas
  const causas = {};
  d.forEach(r=>{ const k=r['CAUSA']||'Sin dato'; const v=pNum(r['CANTIDAD NC'])||0; if(v>0) causas[k]=(causas[k]||0)+v; });
  const sorted = Object.entries(causas).sort((a,b)=>b[1]-a[1]).slice(0,8);
  makeChart('nc-causa','bar',sorted.map(x=>x[0].substring(0,25)),[
    {label:'Unid NC',data:sorted.map(x=>x[1]),backgroundColor:sorted.map((_,i)=>PAL[i%PAL.length]+'cc'),borderRadius:4}
  ],{indexAxis:'y'});

  // Por máquina
  const maqs={};
  d.forEach(r=>{ const k='Maq '+(r['MÁQUINA']||r['MAQUINA']||'?'); const v=pNum(r['CANTIDAD NC'])||0; if(v>0) maqs[k]=(maqs[k]||0)+v; });
  const mSorted=Object.entries(maqs).sort((a,b)=>b[1]-a[1]);
  makeChart('nc-maq','doughnut',mSorted.map(x=>x[0]),
    [{data:mSorted.map(x=>x[1]),backgroundColor:PAL,borderWidth:0}]);

  // Pitorro vs total por mes
  const pitMes={}; const totMes={};
  d.forEach(r=>{ const m=r['MES']||'?'; const v=pNum(r['PESO TOTAL'])||0;
    totMes[m]=(totMes[m]||0)+v;
    if((r['CAUSA']||'').toUpperCase().includes('PITORRO')) pitMes[m]=(pitMes[m]||0)+v; });
  const mKeys=Object.keys(totMes);
  makeChart('nc-pitorro','bar',mKeys,[
    {label:'Pitorro kg',data:mKeys.map(m=>pitMes[m]||0),backgroundColor:'#F9731688',borderRadius:4},
    {label:'Otros NC kg',data:mKeys.map(m=>(totMes[m]||0)-(pitMes[m]||0)),backgroundColor:'#EF444488',borderRadius:4}
  ],{extra:{scales:{x:{stacked:true},y:{stacked:true}}}});

  // NC por mes
  const ncMes={};
  d.forEach(r=>{ const m=r['MES']||'?'; const v=pNum(r['CANTIDAD NC'])||0; if(v>0) ncMes[m]=(ncMes[m]||0)+v; });
  const mKs=Object.keys(ncMes);
  makeChart('nc-mes','line',mKs,[
    {label:'Unid NC',data:mKs.map(m=>ncMes[m]),borderColor:'#EF4444',backgroundColor:'#EF444422',fill:true,tension:.4,pointRadius:3}
  ]);
}

// ── OTIF
function calcOTIF(rows) {
  const valid = rows.filter(r=>r['FECHA SOLICITADA']&&r['FECHA SOLICITADA'].trim()!=='');
  if(!valid.length) return null;
  const onTime = valid.filter(r=>{ const lt=pNum(r['LEAD TIME PEDIDOS ']); return lt!==null&&lt<=0; });
  return (onTime.length/valid.length)*100;
}
function calcOTIFMensual(rows) {
  const meses={};
  rows.forEach(r=>{
    const m=(r['MES ']||'').trim(); if(!m) return;
    if(!meses[m]) meses[m]={total:0,onTime:0};
    if(r['FECHA SOLICITADA']&&r['FECHA SOLICITADA'].trim()) {
      meses[m].total++;
      const lt=pNum(r['LEAD TIME PEDIDOS ']);
      if(lt!==null&&lt<=0) meses[m].onTime++;
    }
  });
  return Object.entries(meses).map(([mes,v])=>({mes, otif:v.total>0?(v.onTime/v.total*100):null, total:v.total, onTime:v.onTime}));
}
function renderOTIF() {
  const d = filterVentas();
  const otif    = calcOTIF(d);
  const valid   = d.filter(r=>r['FECHA SOLICITADA']&&r['FECHA SOLICITADA'].trim()!=='');
  const onTime  = valid.filter(r=>{const lt=pNum(r['LEAD TIME PEDIDOS ']);return lt!==null&&lt<=0;});
  const late    = valid.length - onTime.length;
  const totalUn = d.reduce((s,r)=>s+(pNum(r['Cantidad'])||0),0);

  document.getElementById('otif-kpis').innerHTML=
    kpiCard('OTIF',pct(otif),otif>=95?'#10B981':otif>=85?'#F59E0B':'#EF4444','Meta ≥ 95%','fa-solid fa-truck-fast')+
    kpiCard('Pedidos a Tiempo',onTime.length,'#10B981',`de ${valid.length} totales`,'fa-solid fa-check')+
    kpiCard('Pedidos Tarde',late,'#EF4444','Con retraso','fa-solid fa-clock')+
    kpiCard('Unidades Facturadas',fmt(totalUn),'#3B82F6','','fa-solid fa-file-invoice');

  // OTIF mensual
  const mesData = calcOTIFMensual(d);
  makeChart('otif-mes','bar',mesData.map(x=>cap(x.mes)),[
    {label:'OTIF %',data:mesData.map(x=>x.otif),backgroundColor:mesData.map(x=>(x.otif>=95?'#10B981':x.otif>=85?'#F59E0B':'#EF4444')+'aa'),borderRadius:5}
  ]);

  // Por cliente
  const cliMap={};
  d.forEach(r=>{ const c=r['Nombre tercero']||'?';
    if(!cliMap[c]) cliMap[c]={total:0,ok:0};
    if(r['FECHA SOLICITADA']&&r['FECHA SOLICITADA'].trim()){
      cliMap[c].total++;
      const lt=pNum(r['LEAD TIME PEDIDOS ']);
      if(lt!==null&&lt<=0) cliMap[c].ok++;
    }
  });
  const cliArr=Object.entries(cliMap).filter(([,v])=>v.total>0).sort((a,b)=>b[1].total-a[1].total).slice(0,10);
  makeChart('otif-cliente','bar',cliArr.map(x=>x[0].substring(0,20)),[
    {label:'A tiempo',data:cliArr.map(x=>x[1].ok),backgroundColor:'#10B98188',borderRadius:3},
    {label:'Tarde',data:cliArr.map(x=>x[1].total-x[1].ok),backgroundColor:'#EF444488',borderRadius:3}
  ],{extra:{scales:{x:{stacked:true},y:{stacked:true}}}});

  // Tabla detalle
  const prev=d.filter(r=>r['FECHA SOLICITADA']&&r['FECHA SOLICITADA'].trim()).slice(0,50);
  const rows=prev.map(r=>{
    const lt=pNum(r['LEAD TIME PEDIDOS ']);
    const ok=lt!==null&&lt<=0;
    return `<tr>
      <td>${r['Nombre tercero']||'—'}</td>
      <td>${r['Nombre']||'—'}</td>
      <td>${(r['MES ']||'').trim()}</td>
      <td>${r['FECHA SOLICITADA']||'—'}</td>
      <td>${r['FECHA REAL DESPACHO ']||'—'}</td>
      <td>${lt!==null?lt+'d':'—'}</td>
      <td>${ok?'<span class="badge-green">✓ Tiempo</span>':'<span class="badge-red">✗ Tarde</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('otif-tbl').innerHTML=`
    <thead><tr><th>Cliente</th><th>Producto</th><th>Mes</th><th>F. Solicitada</th><th>F. Despacho</th><th>Lead Time</th><th>Estado</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

// ── PAROS
function renderParos() {
  const d = filterParo();
  const withParo = d.filter(r=>r._paro>0);
  const totalMin = sum(d,'_paro');
  const maqs = [...new Set(d.map(r=>r._maq).filter(Boolean))].sort();

  document.getElementById('paro-kpis').innerHTML=
    kpiCard('Tiempo Total Paro',fmt(totalMin)+' min','#EF4444',`${(totalMin/60).toFixed(0)} horas`,'fa-solid fa-pause')+
    kpiCard('Eventos de Paro',withParo.length,'#F59E0B','Registros con paro','fa-solid fa-triangle-exclamation')+
    kpiCard('Paro Promedio',fmt(withParo.length?totalMin/withParo.length:0,1)+' min','#F97316','Por evento','fa-solid fa-hourglass')+
    kpiCard('Tiempo Procesado',fmt(sum(d,'TIEMPO CAJA MIN'))+' min','#8B5CF6','Total ciclos','fa-solid fa-industry');

  // Pareto por razón
  const razon={};
  d.forEach(r=>{ const k=r['RAZON PARO']||r['RAZÓN PARO']||'Sin dato'; const v=r._paro; if(v>0) razon[k]=(razon[k]||0)+v; });
  const rSorted=Object.entries(razon).sort((a,b)=>b[1]-a[1]).slice(0,10);
  makeChart('paro-pareto','bar',rSorted.map(x=>x[0].substring(0,30)),[
    {label:'Min',data:rSorted.map(x=>x[1]),backgroundColor:rSorted.map((_,i)=>PAL[i%PAL.length]+'cc'),borderRadius:4}
  ],{indexAxis:'y'});

  // Por máquina
  makeChart('paro-maq','bar',maqs.map(m=>'Maq '+m),[
    {label:'Min paro',data:maqs.map(m=>sum(d.filter(r=>r._maq==m),'_paro')),
     backgroundColor:'#EF444488',borderRadius:4}
  ]);

  // Por turno
  const turnos=[1,2,3,4,5];
  const tNames=['T1','T2','T3','T4','T5'];
  makeChart('paro-turno','doughnut',tNames,[
    {data:turnos.map(t=>sum(d.filter(r=>r._turno==t),'_paro')),backgroundColor:PAL,borderWidth:0}
  ]);

  // Tendencia por mes
  const mesParo={};
  d.forEach(r=>{ const m=r._mes||'?'; if(r._paro>0) mesParo[m]=(mesParo[m]||0)+r._paro; });
  const mKeys=Object.keys(mesParo);
  makeChart('paro-trend','line',mKeys.map(cap),[
    {label:'Min paro',data:mKeys.map(m=>mesParo[m]),borderColor:'#EF4444',backgroundColor:'#EF444422',fill:true,tension:.4,pointRadius:3}
  ]);

  // Tabla observaciones — solo filas con paro > 0
  const paroRows = d.filter(r=>r._paro>0).sort((a,b)=>(b._paro||0)-(a._paro||0));
  const obsRows = paroRows.map(r=>{
    const obs = String(r['OBS PARO']||'').trim();
    const razon = String(r['RAZON PARO']||r['RAZÓN PARO']||'—').trim();
    return `<tr>
      <td style="white-space:nowrap">${cap(r._mes||'—')} / Día ${r['DIA']||'—'}</td>
      <td>Máq ${r._maq||'—'}</td>
      <td>T${r._turno||'—'}</td>
      <td>${r._prod?r._prod.substring(0,30):'—'}</td>
      <td style="color:#F59E0B;font-weight:600">${razon}</td>
      <td style="text-align:right;color:#EF4444;font-weight:700">${r._paro} min</td>
      <td style="color:#9CA3AF;font-size:.7rem;max-width:220px">${obs||'<span style="color:#4B5563">Sin observación</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('paro-obs-tbl').innerHTML = `
    <thead><tr>
      <th>Fecha</th><th>Máquina</th><th>Turno</th><th>Producto</th>
      <th>Razón de Paro</th><th style="text-align:right">Tiempo</th><th>Observación</th>
    </tr></thead>
    <tbody>${obsRows||'<tr><td colspan="7" style="text-align:center;color:#4B5563;padding:20px">Sin registros de paro</td></tr>'}</tbody>`;
}

// ── ACCIDENTALIDAD
function getAccDias() {
  for (const row of DATA.accid) {
    const vals = Object.values(row);
    for (let i=0;i<vals.length;i++) {
      if (String(vals[i]||'').toUpperCase().includes('DIAS SIN') || String(vals[i]||'').toUpperCase().includes('DÍAS SIN')) {
        const n = pNum(vals[i+1]);
        if (n!==null) return n;
      }
    }
    for (let i=0;i<vals.length-1;i++) {
      const n=pNum(vals[i+1]);
      if(n!==null && n>30 && n<1000 && String(vals[i]||'').toUpperCase().includes('DIAS')) return n;
    }
  }
  // Try direct cell values
  for (const row of DATA.accid) {
    const rawVals = Object.values(row);
    const idx = rawVals.findIndex(v=>String(v||'').includes('54')||String(v||'')==='54');
    if (idx>-1) { const n=pNum(rawVals[idx]); if(n>0) return n; }
  }
  return null;
}
function renderAccid() {
  let totalPersonal=null, incap=null, fuerzaLaboral=null, diasSin=null;
  DATA.accid.forEach(row=>{
    const vals=Object.values(row).map(v=>String(v||''));
    vals.forEach((v,i)=>{
      const up=v.toUpperCase();
      if(up.includes('TOTAL PERSONAL')) { const n=pNum(vals[i+1]); if(n) totalPersonal=n; }
      if(up.includes('INCAPACITADO'))   { const n=pNum(vals[i+1]); if(n!==null) incap=n; }
      if(up.includes('FUERZA LABORAL')) { const n=pNum(vals[i+1]); if(n) fuerzaLaboral=n; }
      if(up.includes('DIAS SIN')||up.includes('DÍAS SIN')) { const n=pNum(vals[i+1]); if(n) diasSin=n; }
    });
  });
  if(!diasSin) diasSin=getAccDias();

  document.getElementById('accid-dias').textContent = diasSin!==null?diasSin:'—';
  document.getElementById('accid-kpis').innerHTML=
    kpiCard('Total Personal',totalPersonal??'—','#06B6D4','Fuerza laboral activa','fa-solid fa-users')+
    kpiCard('Incapacitados',incap??'—','#F59E0B','Con incapacidad','fa-solid fa-user-injured')+
    kpiCard('Índice Fuerza Laboral',fuerzaLaboral?fuerzaLaboral+'%':'—','#10B981','','fa-solid fa-chart-line')+
    kpiCard('Días sin Accidente',diasSin??'—','#8B5CF6','Sin eventos reportados','fa-solid fa-shield-halved');
}

// =======================================================
// COSTOS
// =======================================================
function fmtCOP(n) {
  if (n===null||isNaN(n)) return '—';
  const mon = getVal('costos-moneda')||'COP';
  const div = mon==='USD'?4000:1;
  const v = n/div;
  if(Math.abs(v)>=1e9) return `$${(v/1e9).toFixed(2)}B`;
  if(Math.abs(v)>=1e6) return `$${(v/1e6).toFixed(1)}M`;
  if(Math.abs(v)>=1e3) return `$${(v/1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function buildTarifasForm() {
  const maqs = [...new Set(DATA.prod.map(r=>r._maq).filter(Boolean))].sort();
  const el = document.getElementById('costos-tarifas-form');
  if (!el) return;
  el.innerHTML = maqs.map(m=>`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:.72rem;color:#9CA3AF;width:50px">Máq ${m}</span>
      <input type="number" value="${TARIFAS_MAQ[m]||25000}"
        onchange="TARIFAS_MAQ[${m}]=+this.value"
        style="flex:1;background:#0B0F19;border:1px solid #374151;border-radius:6px;padding:4px 8px;color:#EEEEEE;font-size:.73rem;outline:none;font-family:Poppins,sans-serif">
      <span style="font-size:.65rem;color:#4B5563">/h</span>
    </div>`).join('');
}

function renderCostos() {
  const d = filterProd();
  buildTarifasForm();

  // ── Tabla 1: Costo fabricación por producto
  const prodMap = {};
  d.forEach(r=>{
    const k = r._prod||'Sin dato';
    if (!prodMap[k]) prodMap[k]={unidades:0,minutos:0,paroMin:0,ordenes:new Set()};
    prodMap[k].unidades += r._cant||0;
    prodMap[k].minutos  += pNum(r['TIEMPO CAJA MIN'])||0;
    prodMap[k].paroMin  += r._paro||0;
    if(r._orden) prodMap[k].ordenes.add(r._orden);
  });
  const prodRows = Object.entries(prodMap)
    .map(([prod,v])=>{
      const maq = d.filter(r=>r._prod===prod).map(r=>r._maq);
      const tarifa = maq.length ? maq.reduce((a,m)=>(a+(TARIFAS_MAQ[m]||25000)),0)/maq.length : 25000;
      const costoFab = (v.minutos/60)*tarifa;
      const costoParo = (v.paroMin/60)*tarifa;
      return {prod,unidades:v.unidades,minutos:v.minutos,paroMin:v.paroMin,costoFab,costoParo,ordenes:v.ordenes.size,tarifa};
    })
    .sort((a,b)=>b.costoFab-a.costoFab).slice(0,20);

  document.getElementById('costos-prod-tbl').innerHTML=`
    <thead><tr>
      <th>Producto / Referencia</th><th>Órdenes</th><th style="text-align:right">Unidades</th>
      <th style="text-align:right">Tiempo Fab (h)</th><th style="text-align:right">Costo Fabricación</th>
      <th style="text-align:right">Costo Paros</th><th style="text-align:right">% Paro/Fab</th>
    </tr></thead>
    <tbody>${prodRows.map(r=>`<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.prod}</td>
      <td>${r.ordenes}</td>
      <td style="text-align:right">${fmt(r.unidades)}</td>
      <td style="text-align:right">${(r.minutos/60).toFixed(1)}</td>
      <td style="text-align:right;color:#10B981;font-weight:600">${fmtCOP(r.costoFab)}</td>
      <td style="text-align:right;color:#EF4444">${fmtCOP(r.costoParo)}</td>
      <td style="text-align:right">${r.minutos>0?badge(100-r.paroMin/r.minutos*100,95,85):badge(null)}</td>
    </tr>`).join('')}</tbody>`;

  // ── Tabla 2: Costo por máquina
  const maqList = [...new Set(d.map(r=>r._maq).filter(Boolean))].sort();
  const maqRows = maqList.map(m=>{
    const rows = d.filter(r=>r._maq==m);
    const minFab = rows.reduce((s,r)=>s+(pNum(r['TIEMPO CAJA MIN'])||0),0);
    const minParo = sum(rows,'_paro');
    const tarifa = TARIFAS_MAQ[m]||25000;
    const costoTotal = (minFab/60)*tarifa;
    const costoParo  = (minParo/60)*tarifa;
    const unidades   = sum(rows,'_cant');
    const costUnit   = unidades>0?costoTotal/unidades:0;
    return {m,minFab,minParo,tarifa,costoTotal,costoParo,unidades,costUnit};
  });

  const totalCosto = maqRows.reduce((s,r)=>s+r.costoTotal,0);
  const totalParo  = maqRows.reduce((s,r)=>s+r.costoParo,0);

  document.getElementById('costos-maq-tbl').innerHTML=`
    <thead><tr>
      <th>Máquina</th><th style="text-align:right">Tarifa/h</th>
      <th style="text-align:right">Horas Fab.</th><th style="text-align:right">Horas Paro</th>
      <th style="text-align:right">Costo Total</th><th style="text-align:right">Costo Paros</th>
      <th style="text-align:right">Unidades</th><th style="text-align:right">Costo/Unidad</th>
    </tr></thead>
    <tbody>
      ${maqRows.map(r=>`<tr>
        <td style="font-weight:600">Máq ${r.m}</td>
        <td style="text-align:right;color:#9CA3AF">${fmtCOP(r.tarifa)}</td>
        <td style="text-align:right">${(r.minFab/60).toFixed(1)} h</td>
        <td style="text-align:right;color:#EF4444">${(r.minParo/60).toFixed(1)} h</td>
        <td style="text-align:right;color:#10B981;font-weight:700">${fmtCOP(r.costoTotal)}</td>
        <td style="text-align:right;color:#EF4444;font-weight:600">${fmtCOP(r.costoParo)}</td>
        <td style="text-align:right">${fmt(r.unidades)}</td>
        <td style="text-align:right;color:#F59E0B">${fmtCOP(r.costUnit)}</td>
      </tr>`).join('')}
      <tr style="border-top:2px solid #374151;font-weight:700">
        <td>TOTAL</td><td></td><td></td><td></td>
        <td style="text-align:right;color:#10B981">${fmtCOP(totalCosto)}</td>
        <td style="text-align:right;color:#EF4444">${fmtCOP(totalParo)}</td>
        <td></td><td></td>
      </tr>
    </tbody>`;

  // ── Análisis ciclo: unidades teóricas vs reales
  const cicloRows = d.filter(r=>{
    const est = pNum(r['T. CICLO EST']); const real = pNum(r['T. CICLO REAL']||r['CICLO REAL']);
    return est>0 && real>0;
  });
  let totalUnidTeor=0, totalUnidReal=0, totalUnidPerd=0, totalCostoPerd=0;
  const cicloMaq = {};
  cicloRows.forEach(r=>{
    const est  = pNum(r['T. CICLO EST']);
    const real = pNum(r['T. CICLO REAL']||r['CICLO REAL']);
    const tMin = pNum(r['TIEMPO CAJA CON PAROS'])||pNum(r['TIEMPO CAJA MIN'])||0;
    const unidTeor = tMin>0&&est>0 ? Math.round((tMin*60)/est) : (pNum(r['PIEZAS ESPERADAS'])||0);
    const unidReal = r._cant||0;
    const perdidas = Math.max(0, unidTeor - unidReal);
    const tarifa   = TARIFAS_MAQ[r._maq]||25000;
    const costUnit = est>0 ? tarifa/3600*est : 0;
    const costoPerd= perdidas * costUnit;
    totalUnidTeor += unidTeor; totalUnidReal += unidReal;
    totalUnidPerd += perdidas; totalCostoPerd += costoPerd;
    const m = r._maq||'?';
    if(!cicloMaq[m]) cicloMaq[m]={teor:0,real:0,perd:0,costo:0};
    cicloMaq[m].teor+=unidTeor; cicloMaq[m].real+=unidReal;
    cicloMaq[m].perd+=perdidas; cicloMaq[m].costo+=costoPerd;
  });
  const efic = totalUnidTeor>0?totalUnidReal/totalUnidTeor*100:null;

  document.getElementById('costos-ciclo-kpis').innerHTML=
    kpiCard('Unidades Teóricas',fmt(totalUnidTeor),'#8B5CF6','Ciclo estándar','fa-solid fa-calculator')+
    kpiCard('Unidades Reales',fmt(totalUnidReal),'#06B6D4','Reportadas','fa-solid fa-industry')+
    kpiCard('Unidades Perdidas',fmt(totalUnidPerd),'#EF4444','Por ciclo lento','fa-solid fa-arrow-trend-down')+
    kpiCard('Costo Lucro Cesante',fmtCOP(totalCostoPerd),'#F59E0B',`Efic. ciclo: ${pct(efic)}`,'fa-solid fa-money-bill-trend-up');

  const cicloMaqArr = Object.entries(cicloMaq).sort((a,b)=>b[1].costo-a[1].costo);
  document.getElementById('costos-ciclo-tbl').innerHTML=`
    <thead><tr>
      <th>Máquina</th>
      <th style="text-align:right">Unid. Teóricas</th>
      <th style="text-align:right">Unid. Reales</th>
      <th style="text-align:right">Unid. Perdidas</th>
      <th style="text-align:right">Eficiencia Ciclo</th>
      <th style="text-align:right">Costo Lucro Cesante</th>
    </tr></thead>
    <tbody>${cicloMaqArr.map(([m,v])=>`<tr>
      <td style="font-weight:600">Máq ${m}</td>
      <td style="text-align:right">${fmt(v.teor)}</td>
      <td style="text-align:right">${fmt(v.real)}</td>
      <td style="text-align:right;color:#EF4444;font-weight:600">${fmt(v.perd)}</td>
      <td style="text-align:right">${badge(v.teor>0?v.real/v.teor*100:null,95,85)}</td>
      <td style="text-align:right;color:#F59E0B;font-weight:700">${fmtCOP(v.costo)}</td>
    </tr>`).join('')}</tbody>`;

  // KPIs resumen
  document.getElementById('costos-kpis').innerHTML=
    kpiCard('Costo Total Fabricación',fmtCOP(totalCosto),'#10B981',`${maqList.length} máquinas`,'fa-solid fa-factory')+
    kpiCard('Costo Total Paros',fmtCOP(totalParo),'#EF4444',`${pct(totalCosto>0?totalParo/totalCosto*100:null)} del total`,'fa-solid fa-circle-pause')+
    kpiCard('Lucro Cesante Ciclo',fmtCOP(totalCostoPerd),'#F59E0B','Ciclo real vs estándar','fa-solid fa-money-bill-trend-up')+
    kpiCard('Costo por Unidad Prom.',fmtCOP(totalUnidReal>0?totalCosto/totalUnidReal:null),'#8B5CF6','Promedio todas máquinas','fa-solid fa-tag');
}

// =======================================================
// RENDER ALL
// =======================================================
function renderAll() {
  renderResumen();
  renderOEE();
  renderPlanMensual();
  renderPlanRef();
  renderNC();
  renderOTIF();
  renderParos();
  renderAccid();
  renderCostos();
}

// =======================================================
// NAVIGATION
// =======================================================
const TITLES = {
  resumen:'Resumen General', oee:'OEE — Eficiencia Global',
  'plan-mensual':'Plan vs Real Mensual', 'plan-ref':'Plan vs Real Referencias',
  noconf:'No Conformes', otif:'OTIF — Entregas', paros:'Tiempos de Paro',
  accid:'Accidentalidad', costos:'Costos de Producción'
};
function showSection(id) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id)?.classList.add('active');
  document.querySelector(`[data-section="${id}"]`)?.classList.add('active');
  document.getElementById('page-title').textContent = TITLES[id]||id;
  if(window.innerWidth<=768) closeSidebar();
}
function toggleSidebar() {
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebar-overlay');
  if(window.innerWidth<=768) { sb.classList.toggle('open'); ov.classList.toggle('show'); }
  else { sb.classList.toggle('collapsed'); document.getElementById('main').classList.toggle('expanded'); }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// =======================================================
// INIT
// =======================================================
loadAll();

