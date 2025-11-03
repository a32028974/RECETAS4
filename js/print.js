// /js/print.js — v2025-09-20b (Total final = ar+cr+otro - negativo, Seña, Saldo + Localidad)
(function () {
  // ===== Tamaños A4 =====
  const PAGE_W_MM = 210;
  const PAGE_H_MM = 297;
  const LEFT_W_MM = 145;   // panel principal
  const GUTTER_MM = 5;     // línea de corte
  const RIGHT_W_MM = 55;   // talón
  const BAR_W_MM = 55;
  const BAR_H_MM = 8;

  const UA = navigator.userAgent || '';
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(UA);
  const QR_SRC = new URL('img/qr.png', window.location.href).href;
  const LOGO_SRC = new URL('img/logo.png', window.location.href).href;

  // ===== Helpers =====
  const $ = (id) => document.getElementById(id);

  // texto de SELECT o INPUT
  const getSelText = (el) => {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return (o?.textContent || o?.value || '').trim();
    }
    return (el.value || '').trim();
  };

  // convierte "$ 20.000" o "20000" → número
  const toNumber = (v) => {
    const n = parseFloat(String(v ?? '')
      .replace(/[^\d.,-]/g, '')  // deja dígitos, coma, punto y signo
      .replace(/\./g, '')        // quita miles con punto
      .replace(',', '.'));       // coma → punto
    return isNaN(n) ? 0 : n;
  };

  // toma el value del input por id y lo convierte a número
  const numFrom = (id) => toNumber($(id)?.value);

  // formato dinero $ 12.345
  const money = (v) => {
    const n = Math.max(0, Math.round(toNumber(v)));
    return '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  };

  function parseDateLike(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const dd = +m[1], mm = +m[2], yyyy = m[3].length === 2 ? +('20' + m[3]) : +m[3];
      const d = new Date(yyyy, mm - 1, dd);
      return isNaN(d) ? null : d;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }
  function ddmmyyyy(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  // ===== Datos del form + cálculos del talón =====
  function collectForm() {
    // datos base
    const numero = getSelText($('numero_trabajo'));
    const retiraD = (() => {
      const d = parseDateLike(getSelText($('fecha_retira')));
      return d ? ddmmyyyy(d) : getSelText($('fecha_retira'));
    })();

    const obraLabel = getSelText($('obra_social'));     // texto del concepto negativo
    const otroLabel = getSelText($('otro_concepto'));   // texto del "otro"

    // montos crudos desde inputs
    const pAr   = numFrom('precio_armazon');
    const pCr   = numFrom('precio_cristal');
    const pOtro = numFrom('precio_otro');
    const pNeg  = numFrom('importe_obra_social');

    // seña: primero la oculta (#sena). Si está vacía, usa la visible (#seniaInput)
    let pSenia = numFrom('sena');
    if (!pSenia) pSenia = numFrom('seniaInput');

    // TOTAL FINAL del talón: ar + cr + otro - negativo
    const totalFinal = Math.max(0, pAr + pCr + pOtro - pNeg);
    // SALDO del talón: totalFinal - seña
    const saldoFinal = Math.max(0, totalFinal - pSenia);

    // flags para mostrar/ocultar filas
// Mostrar "Otro" si hay TEXTO o si hay IMPORTE (>0)
const showOtro = (otroLabel.trim().length > 0) || (pOtro > 0);
// Mostrar “Descuento” si HAY TEXTO o si hay importe
const showObra = (obraLabel.trim().length > 0) || (pNeg > 0);


    return {
      // visibles
      numero,
      fecha: getSelText($('fecha')),
      entrega: getSelText($('entrega-select')),
      retira: retiraD,
      dni: getSelText($('dni')),
      nombre: getSelText($('nombre')),
      tel: getSelText($('telefono')),
      localidad: getSelText($('localidad')),          // ← NUEVO
      cristal: getSelText($('cristal')),
      dr: getSelText($('dr')),
      dnp: getSelText($('dnp')),
      add: getSelText($('add')),
      distancia: getSelText($('distancia_focal')),
      n_armazon: getSelText($('numero_armazon')),
      det_armazon: getSelText($('armazon_detalle')),
      vendedor: getSelText($('vendedor')),
      forma_pago: getSelText($('forma_pago')),

      // labels y montos ya formateados
      obraLabel,
      otroLabel,
      precio_cristal: money(pCr),
      precio_armazon: money(pAr),
      precio_otro: money(pOtro),
      desc_obra: money(pNeg),

      // totales del talón (formateados)
      total: money(totalFinal),
      sena: money(pSenia),
      saldo: money(saldoFinal),

      // flags para condicionales
      showOtro,
      showObra,
    };
  }

  // ===== HTML =====
  function renderTicket(d) {
    const safe = (x) => (x || '').replace(/[<>]/g, s => ({ '<': '&lt;', '>': '&gt;' }[s]));
    const BRAND = '#110747';

    return `
<div class="sheet">
  <div class="canvas">
    <div class="left">
      <div class="hdr">
        <div class="brand">
          <div>
            <div class="title">Óptica Cristal</div>
            <div class="sub">San Miguel • Argentina</div>
          </div>
        </div>
        <div class="barwrap"><svg id="barcode"></svg></div>
        <div class="nro">
          <div class="lbl">Nº trabajo</div>
          <div class="val mono">${safe(d.numero)}</div>
        </div>
      </div>

      <div class="grid2">
        <div class="kv"><div class="k">Fecha</div><div class="v">${safe(d.fecha)}</div></div>
        <div class="kv"><div class="k">Entrega</div><div class="v">${safe(d.entrega)}</div></div>

        <div class="kv"><div class="k">Retira</div><div class="v">${safe(d.retira)}</div></div>
        <div class="kv"><div class="k">DNI</div><div class="v">${safe(d.dni)}</div></div>

        <div class="kv"><div class="k">Localidad</div><div class="v">${safe(d.localidad)}</div></div>
        <div class="kv"><div class="k">Teléfono</div><div class="v">${safe(d.tel)}</div></div>

        <div class="kv" style="grid-column:1/-1"><div class="k">Cliente</div><div class="v">${safe(d.nombre)}</div></div>
      </div>

      <div class="grades">
        <div class="box">
          <div class="box-t">Graduación</div>
          <table class="tbl">
            <thead><tr><th></th><th>ESF</th><th>CIL</th><th>EJE</th></tr></thead>
            <tbody>
              <tr><td>OD</td><td>${safe(getSelText($('od_esf')))}</td><td>${safe(getSelText($('od_cil')))}</td><td>${safe(getSelText($('od_eje')))}</td></tr>
              <tr><td>OI</td><td>${safe(getSelText($('oi_esf')))}</td><td>${safe(getSelText($('oi_cil')))}</td><td>${safe(getSelText($('oi_eje')))}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="box">
          <div class="box-t">Datos ópticos</div>
          <div class="kv"><div class="k">Distancia</div><div class="v">${safe(d.distancia)}</div></div>
          <div class="kv"><div class="k">DNP</div><div class="v">${safe(d.dnp)}</div></div>
          <div class="kv"><div class="k">ADD</div><div class="v">${safe(d.add)}</div></div>
          <div class="kv"><div class="k">Dr.</div><div class="v">${safe(d.dr)}</div></div>
        </div>
      </div>

      <div class="box">
        <div class="box-t">Productos</div>
        <div class="kv"><div class="k">Cristal</div><div class="v">${safe(d.cristal)} — <strong>${d.precio_cristal}</strong></div></div>
        ${d.showObra ? `
  <div class="kv">
    <div class="k">Descuento</div>
    <div class="v"><strong style="font-size:1.05em">${safe(d.obraLabel)} — ${d.desc_obra}</strong></div>
  </div>` : ''}

        <div class="kv"><div class="k">Armazón</div><div class="v">#${safe(d.n_armazon)} • ${safe(d.det_armazon)} — <strong>${d.precio_armazon}</strong></div></div>
        ${d.showOtro ? `
  <div class="kv">
    <div class="k">Otro</div>
    <div class="v"><strong style="font-size:1.05em">${safe(d.otroLabel)} — ${d.precio_otro}</strong></div>
  </div>` : ''}

      </div>

      <div class="totals">
        <div class="kv"><div class="k">Vendedor</div><div class="v vendedor">${safe(d.vendedor)}</div></div>
        <div class="kv"><div class="k">Forma pago</div><div class="v">${safe(d.forma_pago)}</div></div>
        <div class="total-line"><div>Total</div><div class="big">${d.total}</div></div>
        <div class="kv"><div class="k">Seña</div><div class="v">${d.sena}</div></div>
        <div class="kv"><div class="k">Saldo</div><div class="v">${d.saldo}</div></div>
      </div>
    </div>

    <div class="cut"></div>

    <div class="right">
      <div class="r-head">
        <img class="r-logo-img" src="${LOGO_SRC}?v=1" alt="Óptica Cristal">
        <div class="r-text">
          <div class="r-line">Av. Ricardo Balbín 1125</div>
          <div class="r-line">San Miguel</div>
          <div class="r-line">Cel/Whatsapp 11-5668-9919</div>
        </div>
      </div>

      <div class="r-kv"><div class="rk">Nº</div><div class="rv mono">${safe(d.numero)}</div></div>
      <div class="r-kv"><div class="rk">Cliente</div><div class="rv">${safe(d.nombre)}</div></div>
      <div class="r-kv"><div class="rk">Retira (aprox.)</div><div class="rv">${safe(d.retira)}</div></div>
      <div class="r-kv"><div class="rk">Total</div><div class="rv">${d.total}</div></div>
      <div class="r-kv"><div class="rk">Seña</div><div class="rv">${d.sena}</div></div>
      <div class="r-kv"><div class="rk">Saldo</div><div class="rv">${d.saldo}</div></div>

      <!-- QR -->
      <div class="r-qr">
        <img src="${QR_SRC}?v=2" alt="QR" style="width:34mm;height:34mm;object-fit:contain">
      </div>
    </div>
  </div>
</div>`;
  }

  // ===== CSS inline =====
  function commonCSS() {
    const BRAND = '#110747';
    return `
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin:0; padding:0; background:#fff; color:#111; font: 10.2pt/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .sheet { width:${PAGE_W_MM}mm; height:${PAGE_H_MM}mm; }
      .canvas { width:${PAGE_W_MM}mm; height:${PAGE_H_MM}mm; padding:8mm 6mm 6mm;
        display:grid; grid-template-columns:${LEFT_W_MM}mm ${GUTTER_MM}mm ${RIGHT_W_MM}mm; }
      .cut { width:${GUTTER_MM}mm; border-left:1px dashed #cfd6e4; }

      .hdr{ display:grid; grid-template-columns:1fr ${BAR_W_MM}mm 1fr; column-gap:3mm; align-items:start; margin-bottom:2mm; }
      .brand{ display:flex; gap:2mm; }
      .title{ font-weight:800; color:${BRAND}; }
      .sub{ color:#6b7280; font-size:8.5pt; margin-top:.2mm; }
      .barwrap{ width:${BAR_W_MM}mm; height:${BAR_H_MM}mm; display:flex; align-items:center; justify-content:center; }
      .barwrap svg{ width:${BAR_W_MM}mm; height:${BAR_H_MM}mm; }
      .nro{ justify-self:end; text-align:right; }
      .nro .lbl{ font-size:8pt; color:#6b7280; }
      .nro .val{ font-weight:800; }

      .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:0.8mm 3mm; }
      .kv{ display:grid; grid-template-columns:22mm 1fr; column-gap:1.8mm; align-items:baseline; }
      .kv .k{ color:#505a6b; font-size:8.5pt; } .kv .v{ font-weight:600; }

      .grades{ display:grid; grid-template-columns:1fr 1fr; gap:2.2mm; margin:2mm 0; }
      .box{ border:1px solid #d8dbe0; border-radius:1mm; overflow:hidden; }
      .box-t{ background:#f2f4f7; padding:.8mm 1.6mm; font-weight:700; font-size:9pt; color:${BRAND}; }
      .tbl{ width:100%; border-collapse:collapse; }
      .tbl th,.tbl td{ border-top:1px solid #e5e7eb; padding:.8mm 1.2mm; text-align:center; font-size:9pt; }

      .totals{ display:grid; grid-template-columns:1fr 1fr; gap:1mm 3mm; }
      .total-line{ grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cfd6e4; padding-top:1.4mm; margin-top:.6mm; }
      .total-line .big{ font-weight:800; }
      .vendedor{ color:#505a6b; }

      .right .r-head{ display:flex; flex-direction:column; align-items:flex-start; margin-bottom:2mm; }
      .r-logo-img{ width:35mm; height:auto; object-fit:contain; margin-bottom:1mm; }
      .r-line{ font-size:10pt; color:#505a6b; line-height:1.3; }

      .right .r-kv{ display:grid; grid-template-columns:22mm 1fr; gap:1.2mm; align-items:baseline; margin:.6mm 0; }
      .right .rk{ color:#505a6b; font-size:8.5pt; white-space:nowrap }
      .right .rv{ font-weight:700; }

      .right .r-qr{ margin-top:2mm; display:flex; justify-content:center; }
      .right .r-qr img{ width:34mm; height:34mm; object-fit:contain; }
    </style>`;
  }

  // ===== Print =====
  function printGeneric(htmlInner, numero) {
    const css = commonCSS();
    const win = IS_MOBILE ? window.open('', '_blank') : (() => {
      const ifr = document.createElement('iframe');
      Object.assign(ifr.style, { position:'fixed', right:'0', bottom:'0', width:'0', height:'0', border:'0', visibility:'hidden' });
      document.body.appendChild(ifr);
      return ifr.contentWindow;
    })();

    if (!win) { alert('Habilitá popups para imprimir'); return; }

    const doc = win.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">
      <link rel="preload" as="image" href="${QR_SRC}?v=2">
      <link rel="preload" as="image" href="${LOGO_SRC}?v=1">
      ${css}</head><body>${htmlInner}</body></html>`);
    doc.close();

    const render = async () => {
      try {
        const svg = doc.getElementById('barcode');
        if (win.JsBarcode && svg) {
          win.JsBarcode(svg, String(numero || ''), { format:'CODE128', displayValue:false, margin:0, height:40 });
        }
      } catch (_) {}

      // esperar imágenes (logo + QR)
      const imgs = Array.from(doc.images || []);
      await Promise.all(imgs.map(img => img.complete
        ? Promise.resolve()
        : new Promise(res => {
            img.addEventListener('load',  res, { once:true });
            img.addEventListener('error', res, { once:true });
          })
      ));

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      try { win.focus(); win.print(); } catch {}
    };

    if (win.JsBarcode) render();
    else {
      const s = doc.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
      s.onload = render;
      doc.head.appendChild(s);
    }
  }

  // ===== API pública =====
  window.__buildPrintArea = function () {
    const d = collectForm();
    const html = renderTicket(d);
    printGeneric(html, d.numero);
  };
})();
