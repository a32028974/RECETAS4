// /js/main.js — v2025-11-04 FINAL
// SIN PDF + SIN TELEGRAM + Mantiene número de trabajo, totales, fechas y graduaciones
// Nuevos: entrega y forma de pago obligatorias + persistencia vendedor/dto + select forma de pago

import './print.js?v=2025-10-04-ifr';
import { sanitizePrice, parseMoney } from './utils.js';
import { obtenerNumeroTrabajoDesdeTelefono } from './numeroTrabajo.js';
import { cargarFechaHoy } from './fechaHoy.js';
import { buscarNombrePorDNI } from './buscarNombre.js';
import { buscarArmazonPorNumero } from './buscarArmazon.js';
import { guardarTrabajo } from './guardar.js';
import { initPhotoPack } from './fotoPack.js';

const $ = (id) => document.getElementById(id);

/* ----------------- PROGRESO ----------------- */
const PROGRESS_STEPS = ['Validando datos', 'Guardando en planilla', 'Listo'];
function getOverlayHost(){ let h=$('spinner'); if(!h){h=document.createElement('div');h.id='spinner';document.body.appendChild(h);} h.classList.add('spinner');h.classList.remove('spinner-screen');return h; }
function createProgressPanel(){ const host=getOverlayHost(); if(!host.dataset.prevHTML) host.dataset.prevHTML=host.innerHTML;
  host.hidden=false; host.style.display='flex';
  host.innerHTML=`<div class="progress-panel"><div class="progress-title">Guardando…</div><ul class="progress-list">
  ${PROGRESS_STEPS.map((t,i)=>`<li data-status="${i===0?'run':'todo'}" data-step="${t}"><span class="icon"></span><span>${t}</span></li>`).join('')}</ul>
  <div class="progress-note">No cierres esta ventana.</div></div>`;
}
function hideProgressPanel(){ const host=getOverlayHost(); host.style.display='none'; host.hidden=true; if(host.dataset.prevHTML){host.innerHTML=host.dataset.prevHTML; delete host.dataset.prevHTML;} }
function progressAPI(){ createProgressPanel(); const lis=[...document.querySelectorAll('.progress-list li')]; let i=0,t=null;
  const status=(k,s)=>{if(lis[k]) lis[k].setAttribute('data-status',s);};
  const next=()=>{status(i,'done'); i=Math.min(i+1,lis.length-1); if(lis[i].dataset.status==='todo') status(i,'run'); };
  const auto=(ms=6000)=>{clearInterval(t); t=setInterval(()=>{if(i>=lis.length-1) return; next();},ms);};
  return { autoAdvance:auto, doneAndHide:(d=500)=>{lis.forEach((_,j)=>status(j,'done')); setTimeout(hideProgressPanel,d);}, fail:(m)=>{status(i,'error'); if(window.Swal) Swal.fire('Error',m||'No se pudo guardar','error');}}
}

/* ----------------- FECHAS ----------------- */
function parseFechaDDMMYY(str){ if(!str) return new Date(); const [d,m,a]=str.split(/[\/\-]/); return new Date(a.length===2?2000+ +a:+a,(+m||1)-1,+d||1); }
function fmtISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function sumarDias(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

/* ----------------- ENTREGA ----------------- */
function getDiasEntrega(sel){ const v=parseInt(sel?.value||'',10); if(!isNaN(v)) return v;
  const t=sel?.options[sel.selectedIndex]?.text?.toLowerCase()||''; if(t.includes('urgente'))return 3; if(t.includes('laboratorio'))return 15; if(t.includes('7'))return 7; if(t.includes('3'))return 3; if(t.includes('15'))return 15; return NaN; }
function recalcularFechaRetira(){ const enc=$('fecha'), out=$('fecha_retira'), sel=$('entrega-select'); if(!enc||!out||!sel)return;
  const d=getDiasEntrega(sel); if(isNaN(d)){out.value='';return;} out.value=fmtISO(sumarDias(parseFechaDDMMYY(enc.value),d)); }
function setupEntrega(){ const sel=$('entrega-select'); if(!sel)return;
  sel.insertAdjacentHTML('afterbegin','<option value="" selected disabled>Elegí una opción</option>');
  sel.required=true;
  sel.addEventListener('change',recalcularFechaRetira);
}

/* ----------------- N° TRABAJO ----------------- */
function generarNumeroTrabajo(){ const t=$('telefono'), o=$('numero_trabajo'); if(!t||!o)return;
  const v=obtenerNumeroTrabajoDesdeTelefono(t.value); if(v && !o.value.trim()) o.value=v; }
window.generarNumeroTrabajoDesdeTelefono=generarNumeroTrabajo;

/* ----------------- GRADUACIONES + EJE ----------------- */
function checkEje(cil,eje){ const c=parseFloat((cil?.value||'').replace(',','.')); const e=parseInt(eje?.value||'',10);
  const ok=(isNaN(c)||c===0)||(e>=0&&e<=180); eje.style.borderColor=ok?'#e5e7eb':'#ef4444'; return ok; }
function setupGraduaciones(){
  const fill=(id,max,step)=>{ const s=$(id); if(!s)return; s.innerHTML=''; const add=v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.appendChild(o);}
    for(let v=max;v>=step-1e-9;v-=step)add((v>0?'+':'')+v.toFixed(2)); add('0.00'); for(let v=-step;v>=-max-1e-9;v-=step)add((v>0?'+':'')+v.toFixed(2)); s.value='0.00'; };
  fill('od_esf',30,0.25); fill('oi_esf',30,0.25); fill('od_cil',8,0.25); fill('oi_cil',8,0.25);
}

/* ----------------- TOTALES ----------------- */
function setupCalculos(){
  const pc=$('precio_cristal'), pa=$('precio_armazon'), po=$('precio_otro'), os=$('importe_obra_social'), h=$('sena'), v=$('seniaInput'), t=$('total'), s=$('saldo');
  function upd(){ if(v&&h) h.value=v.value||'0'; const bruto=parseMoney(pc.value)+parseMoney(pa.value)+parseMoney(po.value);
    const saldo=Math.max(0, bruto - parseMoney(h.value) - parseMoney(os.value)); if(t) t.value=Math.max(0,bruto); if(s) s.value=saldo; }
  [pc,pa,po,os,h,v].forEach(el=>el?.addEventListener('input',()=>{sanitizePrice(el);upd();}));
  upd();
}

/* ----------------- FORMA DE PAGO (CONVERSIÓN A SELECT) ----------------- */
function setupFormaPago(){
  const opciones=['EFECTIVO','TARJETA 1P','TARJETA 3P','TARJETA 6P','TARJETA 12P','TRANSFERENCIA','MERCADO PAGO','OTRO'];
  let el=$('forma_pago'); if(!el)return;

  if(el.tagName!=='SELECT'){ const s=document.createElement('select'); s.id=el.id; s.name=el.name; s.className=el.className; el.replaceWith(s); el=s; }

  el.innerHTML=`<option value="" disabled selected>Elegí una opción</option>` + opciones.map(o=>`<option value="${o}">${o}</option>`).join('');
  el.required=true;
}

/* ----------------- PERSISTENCIA VENDEDOR ----------------- */
function persist(id,key){ const el=$(id); if(!el)return; const sv=localStorage.getItem(key); if(sv) el.value=sv;
  el.addEventListener('change',()=>localStorage.setItem(key,el.value||'')); }

/* ----------------- INIT ----------------- */
document.addEventListener('DOMContentLoaded',()=>{
  initPhotoPack();
  cargarFechaHoy();
  setupGraduaciones();
  setupCalculos();
  setupEntrega();
  setupFormaPago();

  persist('vendedor','OC_vendedor');
  persist('dto_vendedor','OC_dto_vendedor');

  const tel=$('telefono');
  tel?.addEventListener('input',generarNumeroTrabajo);
  tel?.addEventListener('blur',generarNumeroTrabajo);

  const dni=$('dni'), nom=$('nombre'), tel2=$('telefono'), ind=$('dni-loading');
  dni?.addEventListener('blur',()=>buscarNombrePorDNI(dni,nom,tel2,ind));
  dni?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();buscarNombrePorDNI(dni,nom,tel2,ind);}});

  const f=$('formulario');
  f?.addEventListener('submit',async(e)=>{
    e.preventDefault();

    if(!$('entrega-select').value) return Swal.fire('Falta completar','Elegí la modalidad de entrega','warning');
    if(!$('forma_pago').value) return Swal.fire('Falta completar','Elegí la forma de pago','warning');
    if(!checkEje($('od_cil'),$('od_eje'))) return;
    if(!checkEje($('oi_cil'),$('oi_eje'))) return;

    const p=progressAPI(); p.autoAdvance();
    try{ await guardarTrabajo({progress:p}); p.doneAndHide();
      await Swal.fire('Trabajo guardado','Se guardó correctamente','success');
    }catch(err){ p.fail(err?.message); }
  });

  $('btn-limpiar')?.addEventListener('click',()=>{f.reset(); cargarFechaHoy(); setupEntrega(); setupFormaPago();});
  $('btn-imprimir')?.addEventListener('click',()=>window.print());
});
