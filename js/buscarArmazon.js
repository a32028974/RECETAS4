// js/buscarArmazon.js
import { API_URL, withParams, apiGet } from './api.js';

/**
 * Arma un detalle legible combinando columnas disponibles:
 * MARCA + MODELO + ARMAZON + COLOR. Si no hay nada, usa 'detalle' del backend.
 */
function buildDetalle(item) {
  const partes = [
    (item.marca  || '').toString().trim(),
    (item.modelo || '').toString().trim(),
    (item.armazon|| '').toString().trim(),
    (item.color  || '').toString().trim(),
  ].filter(Boolean);

  const combo = partes.join(' ').replace(/\s+/g, ' ').trim();
  const fallback = (item.detalle || '').toString().trim();
  return combo || fallback;
}

function formatMoneyARS(numStr){
  const clean = String(numStr ?? '').replace(/[^\d]/g,'');
  if (!clean) return '$0';
  const n = parseInt(clean,10) || 0;
  return '$' + n.toLocaleString('es-AR');
}

/** Inyecta el CSS del modal (una sola vez) */
function ensureArmModalCSS(){
  if (document.getElementById('arm-modal-css')) return;
  const css = `
  /* --- Modal de armazón (SweetAlert) --- */
  .arm-modal { margin-top: 6px; }
  .arm-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    outline: none;
  }
  .arm-input:focus { border-color:#8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,.2); }
  .arm-sel {
    width: 100%;
    max-height: 340px;
    font: 13px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 4px;
  }
  .arm-sel option {
    padding: 6px 8px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .arm-sel option.is-sold { color: #b91c1c; }
  `;
  const tag = document.createElement('style');
  tag.id = 'arm-modal-css';
  tag.appendChild(document.createTextNode(css));
  document.head.appendChild(tag);
}

/**
 * Abre el modal de selección con buscador. Devuelve el item elegido o null.
 */
async function elegirArmazon(items){
  ensureArmModalCSS();

  const optionsHTML = items.map((o, i) => {
    const det = buildDetalle(o);
    const price = o.precio ? ` — ${formatMoneyARS(o.precio)}` : '';
    const state = o.estado ? ` — ${o.estado}` : '';
    const cls = (o.estado || '').toUpperCase().includes('VENDIDO') ? 'is-sold' : '';
    const txt = `${o.codigo}${det ? ' — ' + det : ''}${price}${state}`;
    return `<option value="${i}" class="${cls}">${txt}</option>`;
  }).join('');

  const { value: idx, isConfirmed, dismiss } = await Swal.fire({
    title: 'Elegí el armazón',
    width: 720,
    html: `
      <div class="arm-modal">
        <input id="arm-filter" class="arm-input" type="search"
               placeholder="Buscar por marca / modelo / código…" autocomplete="off" />
        <select id="arm-sel" class="arm-sel" size="12">${optionsHTML}</select>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Usar',
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      const root = Swal.getHtmlContainer() || document;
      const inp  = root.querySelector('#arm-filter');
      const sel  = root.querySelector('#arm-sel');

      // foco al buscador
      inp && inp.focus();

      // selección inicial = primer visible
      const first = [...sel.options].find(o => !o.hidden);
      if (first) sel.value = first.value;

      // filtrar en vivo
      const norm = s => (s||'').toString().toUpperCase();
      inp?.addEventListener('input', () => {
        const q = norm(inp.value);
        let firstVisible = null;
        [...sel.options].forEach(opt => {
          const hit = norm(opt.textContent).indexOf(q) !== -1;
          opt.hidden = q ? !hit : false;
          if (!firstVisible && hit) firstVisible = opt;
        });
        if (firstVisible) sel.value = firstVisible.value;
      });

      // Enter en input o select = confirmar
      const confirm = () => Swal.clickConfirm();
      inp?.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); confirm(); }});
      sel?.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); confirm(); }});

      // Doble click = confirmar
      sel?.addEventListener('dblclick', () => confirm());
    },
    preConfirm: () => {
      const root = Swal.getHtmlContainer() || document;
      const sel = root.querySelector('#arm-sel');
      return sel?.value ?? null;
    }
  });

  if (!isConfirmed || dismiss) return null;
  const i = parseInt(idx, 10);
  if (isNaN(i) || i < 0 || i >= items.length) return null;
  return items[i];
}

/**
 * Busca el armazón y completa detalle + precio.
 * - Acepta códigos alfanuméricos (RB1130, VO979, 13336, 13-336, etc.).
 * - Si hay varios resultados, muestra un selector para elegir (modal mejorado).
 * - Mantiene la firma: (nInput, detalleInput, precioInput)
 */
export async function buscarArmazonPorNumero(nInput, detalleInput, precioInput) {
  const raw  = String(nInput?.value || '').trim();
  const code = raw.toUpperCase().replace(/\s+/g, ''); // normalizamos pero NO quitamos letras

  // Limpiar si está vacío
  if (!code) {
    if (detalleInput) detalleInput.value = '';
    if (precioInput)  precioInput.value  = '';
    return;
  }

  const notFound = (c) => {
    if (detalleInput) detalleInput.value = '';
    if (precioInput)  {
      precioInput.value  = '';
      precioInput.dispatchEvent(new Event('input',  { bubbles:true }));
      precioInput.dispatchEvent(new Event('change', { bubbles:true }));
    }
    if (window.Swal) Swal.fire('No encontrado', `No se encontró el armazón "${c}".`, 'warning');
  };

  try {
    if (window.Swal) {
      Swal.fire({
        title: 'Buscando armazón…',
        text: `Código: ${code}`,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
      });
    }

    // Si hay letras o guión, buscamos exacto. Si es solo números, permitimos múltiples.
    const hasAlphaOrHyphen = /[A-Za-z-]/.test(code);
    const url = withParams(API_URL, {
      buscarArmazon: code,
      exacto: hasAlphaOrHyphen ? 1 : 0,
      multi:  hasAlphaOrHyphen ? 0 : 1
    });

    const res = await apiGet(url);
    if (window.Swal) Swal.close();

    let item = null;

    if (Array.isArray(res)) {
      if (res.length === 0) return notFound(code);
      if (res.length === 1) {
        item = res[0];
      } else if (window.Swal) {
        // varios resultados → modal con filtro + lista
        item = await elegirArmazon(res);
        if (!item) return; // canceló
      } else {
        item = res[0]; // fallback sin Swal
      }
    } else {
      item = res; // objeto único
    }

    if (!item) return notFound(code);

    // Completar campos
    const detalle = buildDetalle(item);
    const precioNum = (item.precio || '').toString().replace(/[^\d]/g, '');

    if (detalleInput) detalleInput.value = detalle;
    if (precioInput)  {
      precioInput.value  = precioNum;
      // Recalcular Total/Saldo inmediatamente
      precioInput.dispatchEvent(new Event('input',  { bubbles:true }));
      precioInput.dispatchEvent(new Event('change', { bubbles:true }));
    }

    // Normalizar el campo número con el código que devuelve el backend
    if (nInput && item.codigo) nInput.value = String(item.codigo).toUpperCase();

  } catch (err) {
    console.error('buscarArmazonPorNumero:', err);
    if (window.Swal) Swal.close();
    notFound(code);
  }
}
