// /js/main.js — v2025-11-03 (progreso simplificado; sin PDF/Telegram)
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

// =================== Progreso ===================
// ANTES: incluía 'Generando PDF', 'Guardando link del PDF', 'Enviando por Telegram' (ver versión anterior). 
// AHORA: solo validación + guardado + listo.
const PROGRESS_STEPS = ['Validando datos','Guardando en planilla','Listo'];

function getOverlayHost() {
  let host = $('spinner');
  if (!host) { host = document.createElement('div'); host.id = 'spinner'; document.body.appendChild(host); }
  host.classList.add('spinner'); host.classList.remove('spinner-screen'); return host;
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
  let idx = 0; let timer = null;
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

// =================== Validación Distancia Focal ===================
// (tu lógica existente acá…)

document.addEventListener('DOMContentLoaded', () => {
  // Cámara + Galería
  initPhotoPack();

  // Fecha hoy + fecha que retira
  cargarFechaHoy();
  const entregaSel=$('entrega-select'); if(entregaSel) entregaSel.addEventListener('change',recalcularFechaRetiro);
  const fechaEnc=$('fecha'); if(fechaEnc){ fechaEnc.addEventListener('change',recalcularFechaRetiro); fechaEnc.addEventListener('blur',recalcularFechaRetiro); }
  recalcularFechaRetiro();

  // Graduaciones (mantengo tu set up de selects, ejes, etc.)
  setupGraduacionesSelects();

  // Totales
  setupCalculos();

  // Teléfono → Nº trabajo
  const tel=$('telefono');
  if(tel){ tel.addEventListener('blur',generarNumeroTrabajoDesdeTelefono); tel.addEventListener('change',generarNumeroTrabajoDesdeTelefono); tel.addEventListener('input',()=>{ tel.value=tel.value.replace(/[^0-9 +()-]/g,''); }); }

  // DNI → nombre/teléfono
  const dni=$('dni'), nombre=$('nombre'), telefono=$('telefono');
  if(dni){
    const indi=$('dni-loading');
    const doDNI=()=>buscarNombrePorDNI(dni,nombre,telefono,indi);
    dni.addEventListener('blur',doDNI);
    dni.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doDNI(); } if(e.key==='Tab'){ window.__dniGoNext=true; } });
    dni.addEventListener('input',()=>{ dni.value = dni.value.replace(/\D/g,''); });
  }

  // Nº armazón → detalle/precio
  const nAr=$('numero_armazon'), detAr=$('armazon_detalle'), prAr=$('precio_armazon');
  if(nAr){
    const doAr=async()=>{ await buscarArmazonPorNumero(nAr,detAr,prAr); if(prAr){ prAr.dispatchEvent(new Event('input',{bubbles:true})); } if(typeof window.__updateTotals==='function') window.__updateTotals(); };
    nAr.addEventListener('blur',doAr);
    nAr.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAr(); } });
    nAr.addEventListener('input',()=>{ nAr.value=nAr.value.toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9\-]/g,''); });
  }

  // Botones básicos
  const btnImp=$('btn-imprimir'); if(btnImp) btnImp.addEventListener('click',buildPrintArea);
  const btnClr=$('btn-limpiar'); if(btnClr) btnClr.addEventListener('click',limpiarFormulario);

  // Editar
  const btnEdit=$('btn-editar');
  if(btnEdit){
    btnEdit.addEventListener('click', async()=>{
      const nro=$('numero_trabajo')?.value.trim();
      if(!nro){ if(window.Swal) Swal.fire('Atención','Ingresá un número de trabajo','info'); return; }
      await cargarTrabajoAnterior(nro);
    });
  }

  // Guardar
  const form=$('formulario'); bloquearSubmitConEnter(form);
  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!validarDistanciaFocal()) return;
      if(!validarEjesRequeridos()) return;

      const progress=progressAPI(PROGRESS_STEPS);
      progress.autoAdvance(6000);

      try{
        await guardarTrabajo({ progress });
        progress.doneAndHide(500);

        if(window.Swal){
          await Swal.fire({
            icon:'success', title:'Trabajo guardado',
            html:`<div style="font-size:14px;line-height:1.4">
              Se guardó en la planilla.
            </div>`,
            showCancelButton:true,
            confirmButtonText:'Imprimir',
            cancelButtonText:'Cerrar'
          }).then(r=>{ if(r.isConfirmed) buildPrintArea(); });
        }
      }catch(err){
        console.error(err); progress.fail(err?.message || 'Error al guardar');
      }
    });
  }
});
