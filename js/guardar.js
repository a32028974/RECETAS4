// /js/guardar.js — v2025-11-03 (solo guarda en planilla; sin PDF/Telegram)
// Requiere: api.js (API_URL, withParams, apiGet) y que print.js defina window.__buildPrintArea()

import { API_URL, withParams, apiGet } from "./api.js";

/* ====================== Helpers DOM/valores ====================== */
const $ = (id) => document.getElementById(id);
const V = (id) => (document.getElementById(id)?.value ?? "").toString().trim();
const U = (v) => (v ?? "").toString().trim().toUpperCase();

/* ====================== Networking helpers ====================== */
async function postForm(url, bodyParams, { timeoutMs = 30000, signal } = {}) {
  const body = bodyParams instanceof URLSearchParams ? bodyParams : new URLSearchParams(bodyParams || {});
  const toCtrl = new AbortController();
  const to = setTimeout(() => toCtrl.abort("timeout"), timeoutMs);

  // combinar señales: externa (signal) + timeout propio
  const combined = (signal && "any" in AbortSignal)
    ? AbortSignal.any([signal, toCtrl.signal])
    : (() => {
        if (!signal) return toCtrl.signal;
        const combo = new AbortController();
        const relay = (src) => src.addEventListener("abort", () => combo.abort(src.reason), { once: true });
        relay(signal); relay(toCtrl);
        return combo.signal;
      })();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: combined
    });
    const txt = await res.text();
    let data = null; try { data = JSON.parse(txt); } catch {}
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}: ${txt.slice(0,200)}`);
    return data ?? txt;
  } catch (e) {
    const msg = (e?.name === "AbortError" || e?.message === "timeout")
      ? "Tiempo de espera agotado (no respondió el servidor)"
      : /Failed to fetch|TypeError|NetworkError/i.test(String(e?.message || e))
        ? "No se pudo conectar al servidor (revisá la URL / permisos del Web App de Apps Script)"
        : e?.message || "Error de red";
    throw new Error(msg);
  } finally {
    clearTimeout(to);
  }
}

/* ====================== Otros helpers UI ====================== */
function setNumeroTrabajo(n) {
  const vis = $("numero_trabajo");
  if (vis) vis.value = (n ?? "").toString().trim();
  const hid = $("numero_trabajo_hidden");
  if (hid) hid.value = (n ?? "").toString().trim();
}
function syncNumeroTrabajoHidden() {
  const vis = $("numero_trabajo");
  const hid = $("numero_trabajo_hidden");
  if (vis && hid) hid.value = vis.value.trim();
}
function entregaLabel() {
  const sel = document.getElementById("entrega-select");
  return sel?.options[sel.selectedIndex]?.text || "Stock (7 días)";
}

/* ====== Normalizadores y utilidades para “rescate” post-timeout ====== */
function _normStr(v){ return (v ?? '').toString().trim().toUpperCase(); }
function money(v){ const s=(v??'').toString().replace(/[^\d.-]/g,''); return s||''; }

function _gv(K, keys){
  for (const k of keys) { if (K[k] != null && String(K[k]).trim() !== '') return K[k]; }
  return '';
}
function __buildKeyMap(row){ const K={}; Object.keys(row||{}).forEach(k=>K[k.trim().toUpperCase()]=row[k]); return K; }
function _extractNro(row){
  const K=__buildKeyMap(row);
  return _gv(K, ["NUMERO_TRABAJO","NRO","N_TRABAJO","NUMERO","TRABAJO","N°","N"]);
}

function _canonFromForm(){
  const K = {
    fecha: _normStr(V("fecha")),
    fecha_retira: _normStr(V("fecha_retira")),
    numero_trabajo: _normStr(V("numero_trabajo")),
    dni: _normStr(V("dni")),
    nombre: _normStr(V("nombre")),
    telefono: _normStr(V("telefono")),
    cristal: _normStr(V("cristal")),
    obra_social: _normStr(V("obra_social")),
    importe_obra_social: money(V("importe_obra_social")),
    otro_txt: _normStr(V("otro_concepto")),
    precio_otro: money(V("precio_otro")),
    precio_cristal: money(V("precio_cristal")),
    precio_armazon: money(V("precio_armazon")),
    armazon_num: _normStr(V("numero_armazon")),
    armazon_detalle: _normStr(V("armazon_detalle")),
    dist: _normStr(V("distancia_focal")),
    od_esf: _normStr(V("od_esf")),
    od_cil: _normStr(V("od_cil")),
    od_eje: _normStr(V("od_eje")),
    oi_esf: _normStr(V("oi_esf")),
    oi_cil: _normStr(V("oi_cil")),
    oi_eje: _normStr(V("oi_eje")),
    dnp: _normStr(V("dnp")),
    add: _normStr(V("add")),
    total: money(V("total")),
    sena: money(V("sena")),
    saldo: money(V("saldo")),
    vendedor: _normStr(V("vendedor")),
    forma_pago: _normStr(V("forma_pago")),
    entrega: _normStr(entregaLabel())
  };
  return K;
}
function _canonEquals(a,b){ for (const k of Object.keys(a)) if (a[k] !== b[k]) return false; return true; }

async function _queryHist(params){
  const u = withParams(API_URL, { histBuscar: params.histBuscar || '', limit: params.limit || 200 });
  const j = await apiGet(u);
  return Array.isArray(j?.rows) ? j.rows : [];
}
async function _findExactMatchForBase(base, canonNow){
  let rows = await _queryHist({ histBuscar: `@${base}`, limit: 200 });
  if (!rows.length) rows = await _queryHist({ histBuscar: base, limit: 200 });
  for (const r of rows){
    try{
      const nro = _extractNro(r);
      if (!nro || !(nro === base || nro.startsWith(base+"-"))) continue;
      const K=__buildKeyMap(r);
      const c = {
        fecha: _normStr(_gv(K, ["FECHA","FECHA_QUE_ENCARGA"])),
        fecha_retira: _normStr(_gv(K, ["FECHA_RETIRA","FECHA_QUE_RETIRA","RETIRA"])),
        numero_trabajo: _normStr(_gv(K, ["NUMERO_TRABAJO","NUMERO","NRO","N_TRABAJO"])),
        dni: _normStr(_gv(K, ["DOCUMENTO","DNI"])),
        nombre: _normStr(_gv(K, ["APELLIDO_Y_NOMBRE","APELLIDO_NOMBRE","CLIENTE","NOMBRE","NOMBRE_COMPLETO"])),
        telefono: _normStr(_gv(K, ["TELEFONO","CELULAR","CEL_WHATSAPP","TEL"])),
        cristal: _normStr(_gv(K, ["CRISTAL","TIPO_DE_CRISTAL","LENTE","TIPO_LENTE"])),
        obra_social: _normStr(_gv(K, ["OBRA_SOCIAL"])),
        importe_obra_social: money(_gv(K, ["DESCUENTA_OBRA_SOCIAL","PRECIO_OBRA_SOCIAL","IMPORTE_OBRA_SOCIAL"])),
        otro_txt: _normStr(_gv(K, ["OTRO_CONCEPTO","OTRO","TRATAMIENTO"])),
        precio_otro: money(_gv(K, ["PRECIO_OTRO","PRECIO_TRATAMIENTO"])),
        precio_cristal: money(_gv(K, ["PRECIO_CRISTAL","PRECIO_LENTE","PRECIO_CRISTALES"])),
        precio_armazon: money(_gv(K, ["PRECIO_ARMAZON","PRECIO_ANTEOJO","PRECIO_MARCO"])),
        armazon_num: _normStr(_gv(K, ["N_ARMAZON","NUM_ARMAZON","ARMAZON_NUMERO","NRO_ARMAZON"])),
        armazon_detalle: _normStr(_gv(K, ["DETALLE_ARMAZON","ARMAZON_DETALLE"])),
        dist: _normStr(_gv(K, ["DISTANCIA_FOCAL","DISTANCIA"])),
        od_esf: _normStr(_gv(K, ["OD_ESF","ESF_OD","OD_ESFERA"])),
        od_cil: _normStr(_gv(K, ["OD_CIL","CIL_OD","OD_CILINDRO"])),
        od_eje: _normStr(_gv(K, ["OD_EJE","EJE_OD"])),
        oi_esf: _normStr(_gv(K, ["OI_ESF","ESF_OI","OI_ESFERA"])),
        oi_cil: _normStr(_gv(K, ["OI_CIL","CIL_OI","OI_CILINDRO"])),
        oi_eje: _normStr(_gv(K, ["OI_EJE","EJE_OI"])),
        dnp: _normStr(_gv(K, ["DNP","DNP_OD_OI"])),
        add: _normStr(_gv(K, ["ADD"])),
        total: money(_gv(K, ["TOTAL","TOTAL_FINAL"])),
        sena: money(_gv(K, ["SEÑA","SENA"])),
        saldo: money(_gv(K, ["SALDO"]))
      };
      if (_canonEquals(c, canonNow)) return { row:r, numero:nro };
    }catch{}
  }
  return null;
}

/* ====================== Flujo principal ====================== */
export async function guardarTrabajo({ progress, signal } = {}) {
  const spinner = $("spinner");
  const setStep = (label, status = "done") => { try { progress?.mark?.(label, status); } catch {} };

  try {
    if (spinner) spinner.style.display = "block";
    syncNumeroTrabajoHidden();

    // Base para idempotencia/rescate
    const canonNow = _canonFromForm();
    const base = V("numero_trabajo") || "";
    let numeroFinal = base;

    // 1) Guardar en planilla
    setStep("Guardando en planilla", "run");

    const form = $("formulario");
    const fd = form ? new FormData(form) : new FormData();

    // Alias extra que entiende tu GAS
    const body = new URLSearchParams();
    for (const [k,v] of fd.entries()) body.set(k, (v ?? "").toString());
    const numAr = V("numero_armazon");
    const detAr = V("armazon_detalle");
    body.set("armazon", numAr || "");
    body.set("armazon_detalle", detAr);
    body.set("detalle_armazon", detAr);
    body.set("DETALLE ARMAZON", detAr);
    body.set("ARMAZON", detAr);

    const distFocal = (fd.get("distancia_focal") || "").toString().trim();
    const obraSoc   = (fd.get("obra_social") || "").toString().trim();
    const precioOS  = (fd.get("importe_obra_social") || "").toString().trim();
    body.set("distancia_focal", distFocal);
    body.set("obra_social", obraSoc);
    body.set("importe_obra_social", precioOS);
    body.set("DISTANCIA FOCAL", distFocal);
    body.set("OBRA SOCIAL", obraSoc);
    body.set("PRECIO OBRA SOCIAL", precioOS);
    body.set("- DESCUENTA OBRA SOCIAL", precioOS);

    // Fingerprint + nro_base
    const contentFp = JSON.stringify(canonNow);
    body.set("content_fp", contentFp);
    body.set("nro_base", base);

    try {
      const postJson = await postForm(API_URL, body, { signal, timeoutMs: 30000 });
      setStep("Guardando en planilla", "done");
      numeroFinal = (postJson && postJson.numero_trabajo)
        ? String(postJson.numero_trabajo).trim()
        : numeroFinal;
    } catch(e){
      // Rescue: si hubo timeout, buscamos si quedó grabado
      if (/espera|conectar|red/i.test(String(e.message))) {
        const rescue = await _findExactMatchForBase(base, canonNow);
        if (rescue) {
          numeroFinal = rescue.numero;
          setStep("Guardando en planilla", "done");
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    setNumeroTrabajo(numeroFinal);

    // 2) Confirmar + (opcional) imprimir — SIN PDF/Telegram
    try { progress?.doneAndHide?.(0); } catch {}
    if (spinner) spinner.style.display = "none";

    let imprimir = true;
    if (window.Swal) {
      const r = await Swal.fire({
        title: "Trabajo guardado",
        text: "¿Imprimir ahora?",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Imprimir",
        cancelButtonText: "Cerrar"
      });
      imprimir = r.isConfirmed;
    } else {
      imprimir = confirm("Trabajo guardado.\n¿Imprimir ahora?");
    }

    if (imprimir) {
      if (typeof window.__buildPrintArea === "function") window.__buildPrintArea();
      else window.print?.();
    }

    return { ok: true, numero_trabajo: numeroFinal };
  } catch (err) {
    try { progress?.fail?.(err?.message || "Error al guardar"); } catch {}
    if (window.Swal) Swal.fire("Error", err?.message || "Error inesperado", "error");
    throw err;
  } finally {
    if ($("spinner")) $("spinner").style.display = "none";
  }
}
