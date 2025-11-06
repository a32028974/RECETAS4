// /js/main.js — v2025-11-05 EDIT MODE + ENTER-NEXT + AUDIT
// - SIN PDF/Telegram
// - Alta: usa guardarTrabajo() (tu flujo actual).
// - Edición: POST directo (action=updateJob) sin tocar guardar.js.
// - Enter salta al siguiente campo (no envía formulario).
// - Al editar no se regenera N° de trabajo; fechas sólo cambian si las cambiás vos.

import './print.js?v=2025-10-04-ifr';
import { sanitizePrice, parseMoney } from './utils.js';
import { obtenerNumeroTrabajoDesdeTelefono } from './numeroTrabajo.js';
import { cargarFechaHoy } from './fechaHoy.js';
import { buscarNombrePorDNI } from './buscarNombre.js';
import { buscarArmazonPorNumero } from './buscarArmazon.js';
import { guardarTrabajo } from './guardar.js';
import { initPhotoPack } from './fotoPack.js';
import { API_URL, EDIT_URL, withParams, apiGet } from './api.js';

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
function parseFechaDDMMYY(str){ if(!str) return new Date(); const [d,m,a]=String(str).split(/[\/\-]/); return new Date((a?.length===2?2000+ +a:+a)||new Date().getFullYear(),(+m||1)-1,(+d||1)); }
function fmtISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function sumarDias(d,n){ const x=new Date(d); x.setDate(x.getDate()+ (parseInt(n,10)||0)); return x; }

/* ----------------- ENTREGA ----------------- */
function getDiasEntrega(sel){ const v=parseInt(sel?.value||'',10); if(!isNaN(v)) return v;
  const t=sel?.options[sel.selectedIndex]?.text?.toLowerCase()||''; if(t.includes('urgente'))return 3; if(t.includes('laboratorio'))return 15; if(t.includes('7'))return 7; if(t.includes('3'))return 3; if(t.includes('15'))return 15; return NaN; }
function recalcularFechaRetira(){ const enc=$('fecha'), out=$('fecha_retira'), sel=$('entrega-select'); if(!enc||!out||!sel)return;
  const d=getDiasEntrega(sel); if(isNaN(d)){out.value='';return;} out.value=fmtISO(sumarDias(parseFechaDDMMYY(enc.value),d)); }
function setupEntrega(){ const sel=$('entrega-select'); if(!sel)return;
  if (![...sel.options].some(o=>o.value==='')) sel.insertAdjacentHTML('afterbegin','<option value="" selected disabled>Elegí una opción</option>');
  sel.required=true;
  sel.addEventListener('change',recalcularFechaRetira);
}

/* ----------------- N° TRABAJO ----------------- */
function generarNumeroTrabajo(){ const t=$('telefono'), o=$('numero_trabajo'); if(!t||!o)return;
  if (EDIT.active()) return; // en edición NO regenerar
  const v=obtenerNumeroTrabajoDesdeTelefono(t.value); if(v && !o.value.trim()) o.value=v; }
window.generarNumeroTrabajoDesdeTelefono=generarNumeroTrabajo;

/* ----------------- GRADUACIONES + EJE ----------------- */
function checkEje(cil,eje){ const c=parseFloat((cil?.value||'').replace(',','.')); const e=parseInt(eje?.value||'',10);
  const ok=(isNaN(c)||c===0)||(e>=0&&e<=180); if(eje) eje.style.borderColor=ok?'#e5e7eb':'#ef4444'; return ok; }
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

/* ----------------- FORMA DE PAGO (SELECT + DEBITO + OTRO con detalle) ----------------- */
function ensureOtroField(selectEl){
  let inp = $('forma_pago_otro');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'forma_pago_otro';
    inp.name = 'forma_pago_otro';
    inp.className = selectEl.className;
    inp.placeholder = 'Detalle de pago (si elegís OTRO)';
    inp.style.marginTop = '6px';
    selectEl.parentNode.insertBefore(inp, selectEl.nextSibling);
  }
  return inp;
}
function setupFormaPago(){
  const opciones=['EFECTIVO','DEBITO','TARJETA 1P','TARJETA 3P','TARJETA 6P','TARJETA 12P','TRANSFERENCIA','MERCADO PAGO','OTRO'];
  let el=$('forma_pago'); if(!el)return;
  if(el.tagName!=='SELECT'){ const s=document.createElement('select'); s.id=el.id; s.name=el.name; s.className=el.className; el.replaceWith(s); el=s; }
  el.innerHTML=`<option value="" disabled selected>Elegí una opción</option>` + opciones.map(o=>`<option value="${o}">${o}</option>`).join('');
  el.required=true;
  const inp = ensureOtroField(el);
  const syncOtroReq = ()=>{ const need = (el.value==='OTRO'); inp.required = need; inp.style.display = need ? '' : 'none'; if(!need) inp.value=''; };
  el.addEventListener('change', syncOtroReq); syncOtroReq();
}

/* ----------------- Persistencia vendedor/dto ----------------- */
function persist(id,key){ const el=$(id); if(!el)return; const sv=localStorage.getItem(key); if(sv!=null) el.value=sv;
  const save=()=>localStorage.setItem(key,el.value||''); el.addEventListener('change',save); el.addEventListener('blur',save); }

/* ----------------- ENTER → siguiente campo (no submit) ----------------- */
function setupEnterNext(form){
  if(!form) return;
  form.addEventListener('keydown', (e)=>{
    if(e.key!=='Enter') return;
    const t=e.target;
    const tag=(t?.tagName||'').toUpperCase();
    if(tag==='TEXTAREA') return; // permitimos Enter en textarea
    // si es botón submit, dejamos que siga (pero nuestro submit igual previene y maneja)
    if(tag==='BUTTON') return;
    e.preventDefault();
    // avanzar al siguiente control enfocables
    const focusables = [...form.querySelectorAll('input,select,textarea,button')].filter(el=>!el.disabled && el.offsetParent!==null && el.tabIndex!==-1);
    const idx = focusables.indexOf(t);
    if(idx>=0 && idx<focusables.length-1){ focusables[idx+1].focus(); }
  });
}

/* =================== MODO EDICIÓN =================== */
const EDIT = {
  get row(){ return $('edit_row')?.value || ''; },
  set row(v){ const el=$('edit_row'); if(el) el.value = v || ''; },
  on(){ const b=$('edit_badge'); if(b) b.style.display='inline-block'; const n=$('numero_trabajo'); if(n) { n.readOnly = true; n.classList.add('is-readonly'); } },
  off(){ const b=$('edit_badge'); if(b) b.style.display='none'; const n=$('numero_trabajo'); if(n) { n.readOnly = false; n.classList.remove('is-readonly'); } this.row=''; },
  active(){ return !!this.row; }
};

// Rellena el form a partir de un objeto simple {idCampo: valor}
function fillFormFields(map){
  if(!map) return;
  for(const [id,val] of Object.entries(map)){
    const el=$(id); if(!el) continue;
    if(el.tagName==='SELECT'){ // intentamos setear por value o por texto
      const v = String(val??'').trim();
      const opt = [...el.options].find(o=>o.value===v || o.textContent.trim()===v);
      if(opt) el.value = opt.value;
      else el.value = v; // fallback
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      el.value = String(val??'');
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  // recalcular retiro si hace falta
  recalcularFechaRetira();
}

// Busca por N° trabajo y carga la fila para editar
async function cargarParaEditar(){
  const nro = (document.getElementById('numero_trabajo')?.value || '').trim();
  if(!nro){ return Swal.fire('Falta número','Ingresá el N° de trabajo para editar','warning'); }

  try{
    Swal.fire({title:'Buscando…', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:()=>Swal.showLoading()});

    // Llama al GAS nuevo (func editar receta)
    const url  = withParams(EDIT_URL, { action:'getJobByNumber', nro, json:1, _:+Date.now() });
    const resp = await apiGet(url);

    if(!resp?.ok){
      Swal.close();
      return Swal.fire('Error', resp?.error || 'No se pudo consultar', 'error');
    }
    if(!resp.hits || resp.hits.length === 0){
      Swal.close();
      return Swal.fire('No encontrado', `No se encontró el N° ${nro}`, 'warning');
    }

    // Si escribiste "50511183839" y hay variantes, trae exacto si existe; sino muestra un selector
    let hit = null;
    if (resp.exact) {
      hit = resp.hits[0];
    } else if (resp.hits.length > 1) {
      // Elegir variante 50511183839-1, -2, etc.
      const { value: elegido } = await Swal.fire({
        title: 'Elegí el trabajo',
        input: 'select',
        inputOptions: Object.fromEntries(resp.hits.map(h => [h.nro, h.nro])),
        inputPlaceholder: 'Seleccioná…',
        showCancelButton: true,
        confirmButtonText: 'Cargar',
      });
      if (!elegido) { Swal.close(); return; }
      hit = resp.hits.find(h => h.nro === elegido);
    } else {
      hit = resp.hits[0];
    }

    if (!hit?.data){
      Swal.close();
      return Swal.fire('Error', 'Respuesta sin datos', 'error');
    }

    // ====== Mapeo de columnas -> IDs del formulario ======
    // Ajustá claves si alguno de tus IDs difiere.
    const FIELD_MAP = {
      'NUMERO TRABAJO': 'numero_trabajo',
      'DOCUMENTO': 'dni',
      'APELLIDO Y NOMBRE': 'apellido',       // si tu input se llama distinto, cambiá acá
      'TELEFONO': 'telefono',
      'LOCALIDAD': 'localidad',

      'N ANTEOJO': 'n_armazon',
      'DETALLE ARMAZON': 'detalle_armazon',
      'PRECIO ARMAZON': 'precio_armazon',

      'CRISTAL': 'tipo_cristal',
      'PRECIO CRISTAL': 'precio_cristal',

      'OTRO CONCEPTO': 'otro_concepto',
      'PRECIO OTRO': 'precio_otro',

      'ENTREGA': 'modalidad_entrega',        // o 'entrega' si ese es tu id
      'FORMA DE PAGO': 'forma_pago',
      'VENDEDOR': 'vendedor',

      'OD ESF': 'od_esf',
      'OD CIL': 'od_cil',
      'OD EJE': 'od_eje',
      'OI ESF': 'oi_esf',
      'OI CIL': 'oi_cil',
      'OI EJE': 'oi_eje',
      'DNP': 'dnp',
      'DISTANCIA FOCAL': 'distancia_focal',

      // fechas (si necesitás pre-cargar)
      'FECHA': 'fecha_encarga',
      'FECHA RETIRA': 'fecha_retira',

      // totales (si querés mostrarlos)
      'TOTAL': 'total',
      'SEÑA': 'sena',
      'SALDO': 'saldo',
    };

    // Transformar la fila del Sheet a { idInput: valor }
    const dataSheet = hit.data;
    const map = {};
    for (const [col, val] of Object.entries(dataSheet)) {
      const id = FIELD_MAP[col];
      if (id) map[id] = val;
    }

    // Cargar en el formulario
    fillFormFields(map);

    Swal.close();
    Swal.fire('Listo', `Cargado el N° ${hit.nro}`, 'success');

  } catch (err){
    console.error(err);
    Swal.close();
    Swal.fire('Error', err.message || String(err), 'error');
  }
}

function cancelarEdicion(){
  const f=$('formulario'); f?.reset();
  cargarFechaHoy(); setupEntrega(); setupFormaPago(); recalcularFechaRetira();
  EDIT.off();
}

/* Guardado de edición: POST directo (sin usar guardar.js) */
async function guardarEdicionDirecta({progress}={}){
  const nro = ($('numero_trabajo')?.value||'').trim();
  const row = EDIT.row;
  if(!row || !nro) throw new Error('Faltan datos de edición');

  // Confirmación
  const ok = await Swal.fire({
    icon:'question',
    title:'Actualizar trabajo',
    html:`Vas a <b>actualizar</b> el trabajo <b>${nro}</b> (fila ${row}). ¿Confirmás?`,
    showCancelButton:true,
    confirmButtonText:'Sí, actualizar',
    cancelButtonText:'Cancelar'
  }).then(r=>r.isConfirmed);
  if(!ok) return;

  // Auditoría
  const audit_by = ($('vendedor')?.value||localStorage.getItem('OC_vendedor')||'').toString().trim();
  const audit_ts = new Date().toISOString();

  // Campos a enviar (mantenemos tus ids)
  const campos = [
    'fecha','entrega','fecha_retira','dni','nombre','telefono','localidad',
    'cristal','precio_cristal','obra_social','importe_obra_social','numero_armazon',
    'armazon_detalle','precio_armazon','otro_concepto','precio_otro',
    'od_esf','od_cil','od_eje','oi_esf','oi_cil','oi_eje','dr','dnp','add',
    'distancia_focal','total','sena','saldo','vendedor','forma_pago','forma_pago_otro'
  ];
  const body = new URLSearchParams();
  body.set('action','updateJob');
  body.set('rowIndex', row);
  body.set('numero_trabajo', nro);
  for(const k of campos){
    const v = ($(k)?.value ?? '').toString().trim();
    body.set(k, v);
  }
  body.set('audit_by', audit_by);
  body.set('audit_ts', audit_ts);

  // POST
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body
  });
  const txt = await res.text();
  let j=null; try{ j=JSON.parse(txt); }catch{}
  if(!res.ok || !j?.ok){ throw new Error(j?.error || `No se pudo actualizar (HTTP ${res.status})`); }

  // Listo
  EDIT.off();
}

/* ----------------- INIT ----------------- */
document.addEventListener('DOMContentLoaded',()=>{
  initPhotoPack();
  cargarFechaHoy();
  setupGraduaciones();
  setupCalculos();
  setupEntrega();
  setupFormaPago();

  // Persistencias
  persist('vendedor','OC_vendedor');
  persist('dto_vendedor','OC_dto_vendedor');

  // Teléfono → N° trabajo (solo cuando NO estamos editando)
  const tel=$('telefono');
  tel?.addEventListener('input',generarNumeroTrabajo);
  tel?.addEventListener('blur',generarNumeroTrabajo);

  // DNI → nombre/teléfono
  const dni=$('dni'), nom=$('nombre'), tel2=$('telefono'), ind=$('dni-loading');
  dni?.addEventListener('blur',()=>buscarNombrePorDNI(dni,nom,tel2,ind));
  dni?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); window.__dniGoNext=true; buscarNombrePorDNI(dni,nom,tel2,ind);} });

  // Nº armazón → detalle y precio
  const nAr=$('numero_armazon'), detAr=$('armazon_detalle'), prAr=$('precio_armazon');
  if(nAr){
    const doAr=async()=>{ await buscarArmazonPorNumero(nAr,detAr,prAr); prAr?.dispatchEvent(new Event('input',{bubbles:true})); };
    nAr.addEventListener('blur',doAr);
    nAr.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAr(); } });
    nAr.addEventListener('input',()=>{ nAr.value=nAr.value.toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9\-]/g,''); });
  }

  // Botones varios
  $('btn-imprimir')?.addEventListener('click',()=>window.print());
  $('btn-limpiar')?.addEventListener('click',()=>cancelarEdicion());

  // EDITAR / CANCELAR EDICIÓN
  $('btn-editar')?.addEventListener('click',()=>cargarParaEditar());
  $('btn-cancelar-edit')?.addEventListener('click',()=>cancelarEdicion());

  // ENTER → next
  setupEnterNext($('formulario'));

  // Guardar
  const f=$('formulario');
  f?.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // Reglas obligatorias
    if(!$('entrega-select')?.value) return Swal.fire('Falta completar','Elegí la modalidad de entrega','warning');
    if(!$('forma_pago')?.value)     return Swal.fire('Falta completar','Elegí la forma de pago','warning');
    if(!checkEje($('od_cil'),$('od_eje'))) return;
    if(!checkEje($('oi_cil'),$('oi_eje'))) return;

    const p=progressAPI(); p.autoAdvance();

    try{
      if(EDIT.active()){
        await guardarEdicionDirecta({progress:p});
      }else{
        await guardarTrabajo({progress:p}); // alta normal (tu flujo)
      }
      p.doneAndHide();
      await Swal.fire('Listo','Se guardó correctamente','success');
    }catch(err){
      console.error(err);
      p.fail(err?.message || 'Error al guardar');
    }
  });
});
