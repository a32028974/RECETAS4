// js/generarPack.js
// Genera el PDF (resumen + fotos) sin guardar la planilla.
import { PACK_URL } from './api.js';

const $ = (id) => document.getElementById(id);
const V = (id) => (document.getElementById(id)?.value ?? '').toString().trim();
const U = (v)  => (v ?? '').toString().trim().toUpperCase();

function entregaTxt() {
  // Leemos el SELECT unificado (#entrega-select)
  const sel = document.getElementById('entrega-select');
  const v = sel?.value || '7';
  if (v === '3')  return 'URGENTE';
  if (v === '15') return 'LABORATORIO';
  return 'STOCK';
}

function fotosBase64(){
  const a = Array.isArray(window.__FOTOS) ? window.__FOTOS : [];
  return a.map(d => (d.split(',')[1] || '').trim()).filter(Boolean);
}

function resumenPack(){
  const money = v => (v ? `$ ${v}` : '');
  return {
    'Fecha': V('fecha'),
    'Retira (estimada)': V('fecha_retira'),
    'N° trabajo': V('numero_trabajo'),
    'DNI': V('dni'),
    'Cliente': V('nombre'),
    'Teléfono': V('telefono'),
    'DR (oculista)': V('dr'),

    'Cristal': `${V('cristal')} ${money(V('precio_cristal'))}`,
    'Obra social': `${V('obra_social')} ${money(V('importe_obra_social'))}`,
    'Armazón': `${V('numero_armazon')} ${V('armazon_detalle')} ${money(V('precio_armazon'))}`,
    'Otro': `${V('otro_concepto')} ${money(V('precio_otro'))}`,

    'Distancia focal': V('distancia_focal'),

    'OD': `ESF ${V('od_esf')}  |  CIL ${V('od_cil')}  |  EJE ${V('od_eje')}`,
    'OI': `ESF ${V('oi_esf')}  |  CIL ${V('oi_cil')}  |  EJE ${V('oi_eje')}`,
    'DNP (OD/OI)': V('dnp'),
    'ADD': V('add'),

    'TOTAL': money(V('total')),
    'SEÑA':  money(V('sena')),
    'SALDO': money(V('saldo')),

    'Vendedor': V('vendedor'),
    'Forma de pago': V('forma_pago'),
    'Entrega': entregaTxt()
  };
}

async function generarPack(){
  const spinner = document.getElementById('spinner');
  try{
    if (spinner) spinner.hidden = false;

    if (!V('numero_trabajo')) throw new Error('Ingresá el número de trabajo');
    if (!V('dni'))            throw new Error('Ingresá el DNI');
    if (!V('nombre'))         throw new Error('Ingresá el nombre');

    const payload = {
      numero_trabajo: V('numero_trabajo'),
      dni: V('dni'),
      nombre: U(V('nombre')),
      resumen: resumenPack(),
      imagenesBase64: fotosBase64()
    };

    const res = await fetch(PACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ genPack: '1', payload: JSON.stringify(payload) })
    });

    const raw = await res.text();
    let ok=false, url='';
    try { const j = JSON.parse(raw); ok = !!j.ok; url = j.url || j.pdf || ''; } catch {}
    if (!ok || !url) throw new Error('No se pudo crear el PDF');

    const hidden = $('pack_url'); if (hidden) hidden.value = url;

    if (window.Swal) {
      await Swal.fire({
        title: 'PDF generado',
        html: `<a href="${url}" target="_blank" rel="noopener">Abrir PDF</a>`,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Imprimir',
        cancelButtonText: 'Cerrar'
      }).then(r=>{
        if (r.isConfirmed){
          const w = window.open(url, '_blank', 'noopener');
          if (!w) return;
          const tryPrint = ()=>{ try{ w.focus(); w.print(); }catch{} };
          w.onload = tryPrint; setTimeout(tryPrint, 1200);
        }
      });
    } else {
      if (confirm('PDF generado. ¿Abrir ahora?')) window.open(url, '_blank', 'noopener');
    }

  } catch(err){
    console.error(err);
    const msg = err?.message || 'Error inesperado';
    const p = document.getElementById('mensaje');
    if (p){ p.textContent = '❌ ' + msg; p.style.color = 'red'; }
    if (window.Swal) Swal.fire('Error', msg, 'error');
  } finally {
    if (spinner) spinner.hidden = true;
  }
}

// Soporta id nuevo/viejo
(function attach(){
  const btn = document.getElementById('btn-generar-pack') || document.getElementById('btnPack');
  if (btn) btn.addEventListener('click', generarPack);
})();
