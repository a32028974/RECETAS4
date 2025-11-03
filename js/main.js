// /js/main.js — v2025-11-03c
// Conserva: fechas (ISO en input date), N° por teléfono, graduaciones, totales, editar.
// Quita: pasos de PDF/Telegram del progreso.

import './print.js?v=2025-10-04-ifr';
import { sanitizePrice, parseMoney } from './utils.js';
import { obtenerNumeroTrabajoDesdeTelefono } from './numeroTrabajo.js';
import { cargarFechaHoy } from './fechaHoy.js';
import { buscarNombrePorDNI } from './buscarNombre.js';
import { buscarArmazonPorNumero } from './buscarArmazon.js';
import { guardarTrabajo } from './guardar.js';
import { initPhotoPack } from './fotoPack.js';
import { API_URL, withParams, apiGet } from './api.js';

const $ = (id) => document.getElementById(id);

/* =================== Progreso (sin PDF/Telegram) =================== */
const PROGRESS_STEPS = ['Validando datos', 'Guardando en planilla', 'Listo'];

function getOverlayHost() {
  let host = $('spinner');
  if (!host) { host = document.createElement('div'); host.id = 'spinner'; document.body.appendChild(host); }
  host.classList.add('spinner'); host.classList.remove('spinner-screen');
  return host;
}
function createProgressPanel(steps = PROGRESS_STEPS) {
  const host = getOverlayHost();
  if (!host.dataset.prevHTML) host.dataset.prevHTML = host.innerHTML;
  host.hidden = false; host.style.display = 'flex';
  host.innerHTML = `
    <div class="progress-panel" role="dialog" aria-label="Guardando">
      <div class="progress-title">Guardando…</div>
      <ul class="progress-list">
        ${steps.map((t,i)=>`<li data-status="${i===0?'run':'todo'}" data-step="${t}">
          <span class="icon"></span><span class="txt">${t}</span></li>`).join('')}
      </ul>
      <div class="progress-note">No cierres esta ventana.</div>
    </div>`;
  return host.querySelector('.progress-panel');
}
function hideProgressPanel() {
  const host = getOverlayHost();
  host.style.display = 'none'; host.hidden = true;
  if (host.dataset.prevHTML !== undefined) { host.innerHTML = host.dataset.prevHTML; delete host.dataset.prevHTML; }
  else host.innerHTML = '';
}
function progressAPI(steps = PROGRESS_STEPS) {
  createProgressPanel(steps);
  const lis = Array.from(document.querySelectorAll('.progress-list li'));
  let idx = 0, timer = null;
  const setStatus = (i, status) => { const li = lis[i]; if (li) li.setAttribute('data-status', status); };
  const next = () => { setStatus(idx,'done'); idx = Math.min(idx+1, lis.length-1); if (lis[idx].getAttribute('data-status')==='todo') setStatus(idx,'run'); };
  const mark = (textOrIndex, status='done') => {
    const i = typeof textOrIndex === 'number' ? textOrIndex : lis.findIndex(li => li.dataset.step === textOrIndex);
    if (i < 0) return; setStatus(i, status); if (status==='done' && i===idx) next();
  };
  const autoAdvance = (ms=6000) => { clearInterval(timer); timer = setInterval(()=>{ if (idx >= lis.length-1) { clearInterval(timer); return; } next(); }, ms); };
  const complete = () => { clearInterval(timer); for (let i=0;i<lis.length;i++) setStatus(i,'done'); };
  const fail = (msg) => { clearInterval(timer); setStatus(idx,'error'); if (window.Swal) Swal.fire('Error', msg || 'No se pudo guardar', 'error'); };
  const doneAndHide = (delay=800) => { complete(); setTimeout(hideProgressPanel, delay); };
  return { next, mark, autoAdvance, complete, fail, doneAndHide };
}

/* =================== Fechas (igual que antes) =================== */
// “Fecha que encarga” usa dd/mm/aa (lo setea fechaHoy.js).  :contentReference[oaicite:3]{index=3}
function parseFechaDDMMYY(str){
  if(!str) return new Date();
  const [d,m,a] = String(str).split(/[\/\-]/);
  const dd=+d||0, mm=+m||1;
  let yy=+a||0; if ((a||'').length===2) yy = 2000 + yy;
  return new Date(yy, mm-1, dd);
}
function fmtISO(d){ // para <input type="date">, evita warning del navegador  :contentReference[oaicite:4]{index=4}
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function sumarDias(base, dias){ const d=new Date(base.getTime()); d.setDate(d.getDate() + (parseInt(dias,10)||0)); return d; }
function recalcularFechaRetiro(){
  const enc=$('fecha'), out=$('fecha_retira'), sel=$('entrega-select'); if(!enc||!out||!sel) return;
  const base = parseFechaDDMMYY(enc.value || '');
  const dias = parseInt(sel.value,10)||0;
  out.value = fmtISO(sumarDias(base, dias));
}
window.recalcularFechaRetiro = recalcularFechaRetiro;

/* =================== Nº de trabajo (como antes) =================== */
// Usa tu generador de numeroTrabajo.js (deriva del teléfono).  :contentReference[oaicite:5]{index=5}
function generarNumeroTrabajoDesdeTelefono(){
  const tel=$('telefono'), out=$('numero_trabajo'); if(!tel||!out) return;
  out.value = obtenerNumeroTrabajoDesdeTelefono(tel.value);
}
window.generarNumeroTrabajoDesdeTelefono = generarNumeroTrabajoDesdeTelefono;

/* =================== Graduaciones (poblar/validar) =================== */
// Igual a tu v2025-09-30.
function clamp(n,min,max){ return Math.min(Math.max(n,min),max); }
function checkEjeRequerido(cilEl, ejeEl){
  const raw=(cilEl?.value ?? '').toString().replace(',', '.');
  const cil=(raw===''? NaN : parseFloat(raw));
  const eje=parseInt(ejeEl?.value||'',10);
  const requerido = !isNaN(cil) && cil !== 0;
  const ok = !requerido || (eje>=0 && eje<=180);
  if(ejeEl) ejeEl.style.borderColor = ok? '#e5e7eb' : '#ef4444';
  if(!(ok) && window.Swal){
    Swal.fire({icon:'warning',title:'Revisá los EJE',text:'Si hay CIL distinto de 0, el EJE debe estar entre 0 y 180.',timer:2200,showConfirmButton:false,toast:true,position:'top-end'});
  }
  return ok;
}
function setupGraduacionesSelects(){
  const $id=(x)=>document.getElementById(x);
  const addOpt=(sel,val,label)=>{ const o=document.createElement('option'); o.value=val; o.textContent=label??val; sel.appendChild(o); };
  const fmt=(v,sign)=>{ let txt=Math.abs(v)<1e-9?'0.00':v.toFixed(2); if(sign && v>0) txt='+'+txt; return txt; };
  const fillCentered=(sel,maxAbs,step,sign=false)=>{
    if(!sel||sel.tagName!=='SELECT') return;
    sel.innerHTML='';
    for(let v=maxAbs; v>=step-1e-9; v-=step){ const val=+v.toFixed(2); addOpt(sel,fmt(val,sign),fmt(val,sign)); }
    addOpt(sel,'0.00','0.00');
    for(let v=-step; v>=-maxAbs-1e-9; v-=step){ const val=+v.toFixed(2); addOpt(sel,fmt(val,sign),fmt(val,sign)); }
    sel.value='0.00';
  };
  fillCentered($id('od_esf'),30,0.25,true); fillCentered($id('oi_esf'),30,0.25,true);
  fillCentered($id('od_cil'),8,0.25,true);  fillCentered($id('oi_cil'),8,0.25,true);
  [['od_cil','od_eje'],['oi_cil','oi_eje']].forEach(([cilId,ejeId])=>{
    const cil=$id(cilId), eje=$id(ejeId); if(cil && eje) cil.addEventListener('change',()=>checkEjeRequerido(cil,eje));
  });
}
function resetGraduaciones(){
  ['od_esf','oi_esf','od_cil','oi_cil'].forEach(id=>{
    const sel=$(id); if(!sel) return;
    const candidatos=['0.00','+0.00','0']; let seteado=false;
    for(const v of candidatos){ if([...(sel.options)].some(o=>o.value===v)){ sel.value=v; seteado=true; break; } }
    if(!seteado){ const idx0=[...(sel.options)].findIndex(o=>/(^\+?0(\.0+)?$)/.test(o.value)); sel.selectedIndex = idx0>=0 ? idx0 : 0; }
  });
  ['od_eje','oi_eje'].forEach(id=>{ const inp=$(id); if(inp) inp.value=''; });
}

/* =================== Totales (idéntico a tu flujo) =================== */
function setupCalculos(){
  const pc=$('precio_cristal'), pa=$('precio_armazon'), po=$('precio_otro');
  const os=$('importe_obra_social');
  const senaHidden=$('sena');
  const senaVisible=$('seniaInput');
  const tot=$('total'), sal=$('saldo');

  function syncSenia(){ if(!senaVisible||!senaHidden) return; senaHidden.value = senaVisible.value || '0'; }
  function updateTotals(){
    syncSenia();
    const bruto = parseMoney(pc?.value)+parseMoney(pa?.value)+parseMoney(po?.value);
    const senia = parseMoney(senaHidden?.value);
    const desc  = parseMoney(os?.value);
    if (tot) tot.value = String(Math.max(0, bruto));
    const saldo = Math.max(0, bruto - senia - desc);
    if (sal) sal.value = String(saldo);
    if (typeof window.__updateTotals === 'function') window.__updateTotals();
  }
  window.__updateTotals = window.__updateTotals || updateTotals;

  [pc,pa,po,os,senaHidden,senaVisible].forEach(el=>{
    if(!el) return;
    el.addEventListener('input', ()=>{ sanitizePrice(el); updateTotals(); });
    el.addEventListener('change', updateTotals);
  });

  updateTotals();
}

/* =================== Impresión / Limpieza =================== */
let __PRINT_LOCK=false;
function buildPrintArea(){
  if(__PRINT_LOCK) return; __PRINT_LOCK=true;
  try{ if(typeof window.__buildPrintArea==='function'){ window.__buildPrintArea(); } }
  finally { setTimeout(()=>{ __PRINT_LOCK=false; },1200); }
}
function limpiarFormulario(){
  const form=$('formulario'); if(!form) return;
  form.reset(); resetGraduaciones(); cargarFechaHoy(); recalcularFechaRetiro();
  const gal=$('galeria-fotos'); if(gal) gal.innerHTML='';
  if (Array.isArray(window.__FOTOS)) window.__FOTOS.length = 0;
  if (typeof window.__updateTotals === 'function') window.__updateTotals();
}

/* =================== Buscar/Editar en historial (igual que v2025-09-30) =================== */
function __toDateObj(v){ if(v instanceof Date) return v; const s=String(v??'').trim(); if(!s) return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); if(m){ const dd=+m[1], mm=+m[2], yy=(m[3].length===2?2000+ +m[3]:+m[3]); const d=new Date(yy,mm-1,dd); return isNaN(d)?null:d; }
  const d=new Date(s); return isNaN(d)?null:d;
}
function __fmtDDMMYY(d){ const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); const yy=String(d.getFullYear()).slice(-2); return `${dd}/${mm}/${yy}`; }
function __fmtYYYYMMDD(d){ const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${mm}-${dd}`; }

const __normKey=(k)=>String(k||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
function __buildKeyMap(row){ const map={}; for(const [k,v] of Object.entries(row||{})) map[__normKey(k)]=v; return map; }
function __gv(K,...aliases){ for(const a of aliases){ const v=K[__normKey(a)]; if(v!=null && v!=='') return v; } return undefined; }
function __getNroFromRowK(K){ const v=__gv(K,'NUMERO_TRABAJO','NUMERO','NRO','N','N_TRABAJO','N__TRABAJO','NRO_TRABAJO','NRO_TRAB'); return String(v ?? '').trim(); }

async function __fetchHistByNro(nro){
  const searchParamSets=[
    { histBuscar:`@${nro}`,limit:200 },{ histBuscar:`${nro}`,limit:200 },
    { buscar:nro,limit:200 },{ numero:nro,limit:200 },{ nro:nro,limit:200 },{ histNro:nro,limit:200 },
  ];
  const sheetHints=[{},{sheet:'TRABAJOS WEB'},{hoja:'TRABAJOS WEB'},{tab:'TRABAJOS WEB'},{ws:'TRABAJOS WEB'}];
  for(const base of searchParamSets){
    for(const sh of sheetHints){
      try{
        const url=withParams(API_URL,{...base,...sh});
        const data=await apiGet(url);
        if(Array.isArray(data)&&data.length){
          const exact=data.find(r=>__getNroFromRowK(__buildKeyMap(r))===String(nro));
          return exact?[exact]:data;
        }
      }catch{}
    }
  }
  return [];
}

async function cargarTrabajoAnterior(nro){
  const data=await __fetchHistByNro(nro);
  if(!data.length){ if(window.Swal) Swal.fire('No encontrado',`No hay trabajo con N° ${nro}`,'warning'); return; }
  const t=data[0]||{}; const K=__buildKeyMap(t);

  const fechaCruda=__gv(K,'FECHA','FECHA_QUE_ENCARGA'); const dEnc=__toDateObj(fechaCruda); if(dEnc) { const el=$('fecha'); if(el) el.value=__fmtDDMMYY(dEnc); }
  const frCruda=__gv(K,'FECHA_RETIRA','FECHA_QUE_RETIRA','RETIRA'); const dRet=__toDateObj(frCruda); if(dRet){ const el=$('fecha_retira'); if(el) el.value=__fmtYYYYMMDD(dRet); }

  const set = (id,val)=>{ const el=$(id); if(!el) return; if(el.tagName==='SELECT'){ const opt=[...el.options].find(o=>o.value==val||o.textContent?.trim()==val||o.textContent?.includes(val)); if(opt) el.value=opt.value; } else { el.value=String(val??''); } el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); };

  set('numero_trabajo',__gv(K,'NUMERO_TRABAJO','NUMERO','NRO','N_TRABAJO'));
  set('dni',__gv(K,'DOCUMENTO','DNI'));
  set('nombre',__gv(K,'APELLIDO_Y_NOMBRE','APELLIDO_NOMBRE','CLIENTE','NOMBRE','NOMBRE_COMPLETO'));
  set('telefono',__gv(K,'TELEFONO','CELULAR','CEL_WHATSAPP','TEL'));
  set('cristal',__gv(K,'CRISTAL','TIPO_DE_CRISTAL','LENTE','TIPO_LENTE'));
  set('obra_social',__gv(K,'OBRA_SOCIAL'));
  set('importe_obra_social',__gv(K,'DESCUENTA_OBRA_SOCIAL','PRECIO_OBRA_SOCIAL','IMPORTE_OBRA_SOCIAL'));
  set('otro_concepto',__gv(K,'OTRO_CONCEPTO','OTRO','TRATAMIENTO'));
  set('precio_otro',__gv(K,'PRECIO_OTRO','PRECIO_TRATAMIENTO'));
  set('precio_cristal',__gv(K,'PRECIO_CRISTAL','PRECIO_LENTE','PRECIO_CRISTALES'));
  set('precio_armazon',__gv(K,'PRECIO_ARMAZON','PRECIO_ANTEOJO','PRECIO_MARCO'));
  set('total',__gv(K,'TOTAL'));
  set('sena',__gv(K,'SENA','SEÑA')); // oculta
  set('saldo',__gv(K,'SALDO'));
  set('vendedor',__gv(K,'VENDEDOR'));
  set('forma_pago',__gv(K,'FORMA_DE_PAGO','FORMA_PAGO'));
  set('distancia_focal',__gv(K,'DISTANCIA_FOCAL','DISTANCIA'));

  // Armazón: número + detalle
  const nArSheet=__gv(K,'NUMERO_ARMAZON','NRO_ARMAZON','N_ARMAZON','N_ANTEOJO','NUMERO_ANTEOJO','N_ANTEJO');
  const detSheet=__gv(K,'ARMAZON_DETALLE','DETALLE_ARMAZON','ARMAZON','DETALLE','MARCA_MODELO','MODELO','MARCA');
  if(nArSheet){ set('numero_armazon',nArSheet); }
  if(detSheet){ set('armazon_detalle',detSheet); }

  if (typeof window.__updateTotals === 'function') window.__updateTotals();
  if (typeof window.recalcularFechaRetiro === 'function') window.recalcularFechaRetiro();
  if (window.Swal) Swal.fire('Listo','Trabajo cargado para edición','success');
}
window.__cargarTrabajoAnterior = cargarTrabajoAnterior;

/* =================== Init =================== */
document.addEventListener('DOMContentLoaded', () => {
  initPhotoPack();                       // cámara/galería  :contentReference[oaicite:6]{index=6}
  cargarFechaHoy();                      // Fecha que encarga dd/mm/aa  :contentReference[oaicite:7]{index=7}
  setupGraduacionesSelects();
  setupCalculos();

  // Fecha que retira (estimada) → ISO si es <input type="date">
  const entregaSel=$('entrega-select'); if(entregaSel) entregaSel.addEventListener('change',recalcularFechaRetiro);
  const fechaEnc=$('fecha'); if(fechaEnc){ fechaEnc.addEventListener('change',recalcularFechaRetiro); fechaEnc.addEventListener('blur',recalcularFechaRetiro); }
  recalcularFechaRetiro();

  // Teléfono → número de trabajo (si está vacío)
  const tel=$('telefono');
  if(tel){
    const gen=()=>generarNumeroTrabajoDesdeTelefono();
    tel.addEventListener('blur',gen);
    tel.addEventListener('change',gen);
    tel.addEventListener('input',gen);
  }

  // DNI → nombre/teléfono
  const dni=$('dni'), nombre=$('nombre'), telefono=$('telefono');
  if(dni){
    const indi=$('dni-loading');
    const doDNI=()=>buscarNombrePorDNI(dni,nombre,telefono,indi);
    dni.addEventListener('blur',doDNI);
    dni.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doDNI(); } });
    dni.addEventListener('input',()=>{ dni.value = dni.value.replace(/\D/g,''); });
  }

  // Nº armazón → detalle y precio
  const nAr=$('numero_armazon'), detAr=$('armazon_detalle'), prAr=$('precio_armazon');
  if(nAr){
    const doAr=async()=>{
      await buscarArmazonPorNumero(nAr,detAr,prAr);
      if(prAr){ prAr.dispatchEvent(new Event('input',{bubbles:true})); }
      if(typeof window.__updateTotals==='function') window.__updateTotals();
    };
    nAr.addEventListener('blur',doAr);
    nAr.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAr(); } });
    nAr.addEventListener('input',()=>{ nAr.value=nAr.value.toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9\-]/g,''); });
  }

  // Botones
  const btnImp=$('btn-imprimir'); if(btnImp) btnImp.addEventListener('click',buildPrintArea);
  const btnClr=$('btn-limpiar');   if(btnClr) btnClr.addEventListener('click',limpiarFormulario);
  const btnEdit=$('btn-editar');   if(btnEdit) btnEdit.addEventListener('click', async()=>{
    const nro=$('numero_trabajo')?.value.trim();
    if(!nro){ if(window.Swal) Swal.fire('Atención','Ingresá un número de trabajo','info'); return; }
    await cargarTrabajoAnterior(nro);
  });

  // Guardar
  const form=$('formulario');
  if(form){
    // bloquear Enter para no disparar submit accidental (igual que tu flujo)  :contentReference[oaicite:8]{index=8}
    form.addEventListener('keydown',(e)=>{
      if (e.key !== 'Enter') return;
      const t=e.target, tag=(t?.tagName||'').toUpperCase(), type=(t?.type||'').toLowerCase();
      const esTextArea = tag==='TEXTAREA'; const enterPermitido = t?.dataset?.enterOk==='1';
      const esSubmitButton = (tag==='BUTTON' && type==='submit');
      if(!esTextArea && !enterPermitido && !esSubmitButton){ e.preventDefault(); }
    });

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();

      // Validación de EJE cuando hay CIL ≠ 0
      if(!checkEjeRequerido($('od_cil'),$('od_eje'))) return;
      if(!checkEjeRequerido($('oi_cil'),$('oi_eje'))) return;

      const progress=progressAPI(PROGRESS_STEPS);
      progress.autoAdvance(6000);

      try{
        await guardarTrabajo({ progress });        // solo guarda planilla (sin PDF/Telegram)  :contentReference[oaicite:9]{index=9}
        progress.doneAndHide(500);

        if(window.Swal){
          await Swal.fire({
            icon:'success', title:'Trabajo guardado',
            html:`<div style="font-size:14px;line-height:1.4">Se guardó en la planilla.</div>`,
            showCancelButton:true,
            confirmButtonText:'Imprimir',
            cancelButtonText:'Cerrar'
          }).then(r=>{ if(r.isConfirmed) buildPrintArea(); });
        }
      }catch(err){
        console.error(err);
        progress.fail(err?.message || 'Error al guardar');
      }
    });
  }
});
