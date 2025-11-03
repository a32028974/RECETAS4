// /js/guardar.js — v2025-11-03 (igual que v2025-10-02, pero SIN PDF/Telegram)
// Requiere: api.js (API_URL, withParams, apiGet) y que print.js defina window.__buildPrintArea()

import { API_URL, withParams, apiGet } from "./api.js";

/* ====================== Helpers DOM/valores ====================== */
const $ = (id) => document.getElementById(id);
const V = (id) => (document.getElementById(id)?.value ?? "").toString().trim();
const U = (v) => (v ?? "").toString().trim().toUpperCase();

/* ====================== Networking helpers ====================== */
// fetch POST con timeout y (opcional) señal externa para cancelar
async function postForm(url, bodyParams, { timeoutMs = 30000, signal } = {}) {
  const body = bodyParams instanceof URLSearchParams ? bodyParams : new URLSearchParams(bodyParams || {});
  const toCtrl = new AbortController();
  const to = setTimeout(() => toCtrl.abort("timeout"), timeoutMs);

  // combinar señales: externa (signal) + timeout propio
  const combined = (signal && "any" in AbortSignal)
    ? AbortSignal.any([signal, toCtrl.signal])
    : (()=>{
        if (!signal) return toCtrl.signal;
        const combo = new AbortController();
        const relay = (src)=> src.addEventListener("abort", () => combo.abort(src.reason), { once:true });
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
// Estas dos funciones podían usarse para el payload del pack.
// Las dejo por compatibilidad aunque ya no se usan.
function fotosBase64() {
  const a = Array.isArray(window.__FOTOS) ? window.__FOTOS : [];
  return a.map((d) => (d.split(",")[1] || "").trim()).filter(Boolean);
}
function resumenPack() {
  const money = (v) => (v ? `$ ${v}` : "");
  return {
    "Fecha": V("fecha"),
    "Retira (estimada)": V("fecha_retira"),
    "N° trabajo": V("numero_trabajo"),
    "DNI": V("dni"),
    "Cliente": V("nombre"),
    "Teléfono": V("telefono"),
    "Localidad": V("localidad"),
    "DR (oculista)": V("dr"),
    "Cristal": `${V("cristal")} ${money(V("precio_cristal"))}`,
    "Obra social": `${V("obra_social")} ${money(V("importe_obra_social"))}`,
    "Armazón": `${V("numero_armazon")} ${V("armazon_detalle")} ${money(V("precio_armazon"))}`,
    "Otro": `${V("otro_concepto")} ${money(V("precio_otro"))}`,
    "Distancia focal": V("distancia_focal"),
    "OD": `ESF ${V("od_esf")}  |  CIL ${V("od_cil")}  |  EJE ${V("od_eje")}`,
    "OI": `ESF ${V("oi_esf")}  |  CIL ${V("oi_cil")}  |  EJE ${V("oi_eje")}`,
    "DNP (OD/OI)": V("dnp"),
    "ADD": V("add"),
    "TOTAL": money(V("total")),
    "SEÑA": money(V("sena")),
    "SALDO": money(V("saldo")),
    "Vendedor": V("vendedor"),
    "Forma de pago": V("forma_pago"),
    "Entrega": entregaLabel()
  };
}

/* ====================== NÚMERO ÚNICO: duplicados / sufijo ====================== */
// query “histBuscar” flexible (devuelve [] si falla)
async function _queryHist(params) {
  try {
    const url = withParams(API_URL, params);
    const data = await apiGet(url);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
// extrae un número de trabajo de un row
function _extractNro(row) {
  return String(
    row?.numero ?? row?.num ?? row?.nro ?? row?.n_trabajo ?? row?.NRO ?? row?.N ?? ""
  ).trim();
}
// toma “12345-2” -> { base:"12345", suf:2 }
function _splitBaseSuf(nro) {
  const m = String(nro || "").trim().match(/^(.+?)(?:-([0-9]+))?$/);
  return { base: (m?.[1] ?? "").trim(), suf: Number(m?.[2] ?? 0) || 0 };
}
// calcula el siguiente disponible: 12345, 12345-1, 12345-2, …
function _nextDisponible(base, listaUsados) {
  const usados = new Set(listaUsados);
  if (!usados.has(base)) return base;
  let i = 1;
  while (usados.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
// Busca números ya usados que empiecen con la base
async function _obtenerNumeroDisponible(nroDeseado) {
  const { base } = _splitBaseSuf(nroDeseado);
  // 1) búsqueda exacta por número usando @
  let rows = await _queryHist({ histBuscar: `@${base}`, limit: 200 });
  // 2) fallback si no trajo nada
  if (!rows.length) rows = await _queryHist({ histBuscar: base, limit: 200 });
  const usados = rows
    .map(_extractNro)
    .filter(n => n && (n === base || n.startsWith(base + "-")));
  const candidato = _nextDisponible(base, usados);
  return candidato;
}

/* ====================== Fingerprint / Canon para EXACT MATCH ====================== */
const _NK = (k) => String(k||'')
  .normalize("NFD").replace(/\p{Diacritic}/gu,"")
  .toUpperCase().replace(/[^A-Z0-9]+/g,"_")
  .replace(/^_|_$/g,"");

function _buildKeyMap(row){ const K={}; for(const [k,v] of Object.entries(row||{})) K[_NK(k)]=v; return K; }
function _gv(K, aliases){ for(const a of [].concat(aliases)){ const v=K[_NK(a)]; if(v!=null && v!=='') return v; } return ""; }

function _normStr(s){ return String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toUpperCase().trim(); }
function _normNum(s){ const n = Number(String(s||"").replace(/[^\d\.\-]/g,"")); return Number.isFinite(n) ? n : 0; }

// Canon del formulario (qué comparamos)
function _canonFromForm(){
  const _V = (id) => (document.getElementById(id)?.value ?? "").toString().trim();
  const money = (id)=> _normNum(_V(id));
  return {
    dni: _normStr(_V("dni")),
    nombre: _normStr(_V("nombre")),
    cristal: _normStr(_V("cristal")),
    n_armazon: _normStr(_V("numero_armazon")),
    armazon_detalle: _normStr(_V("armazon_detalle")),
    otro_txt: _normStr(_V("otro_concepto")),
    dist: _normStr(_V("distancia_focal")),
    od_esf: _normStr(_V("od_esf")), od_cil: _normStr(_V("od_cil")), od_eje: _normStr(_V("od_eje")),
    oi_esf: _normStr(_V("oi_esf")), oi_cil: _normStr(_V("oi_cil")), oi_eje: _normStr(_V("oi_eje")),
    dnp: _normStr(_V("dnp")), add: _normStr(_V("add")),
    total: money("total"), sena: money("sena"), saldo: money("saldo")
  };
}
// Canon desde una fila del historial (alias flexibles)
function _canonFromRow(row){
  const K = _buildKeyMap(row);
  const money = (aliases)=> _normNum(_gv(K, aliases));
  return {
    dni: _normStr(_gv(K, ["DNI","DOCUMENTO","DOC"])),
    nombre: _normStr(_gv(K, ["NOMBRE","CLIENTE","APELLIDO_NOMBRE","APELLIDO_Y_NOMBRE","APENOM"])),
    cristal: _normStr(_gv(K, ["CRISTAL"])),
    n_armazon: _normStr(_gv(K, ["NUMERO_ARMAZON","N_ARMAZON","NUM_ARMAZON","ARMAZON","ARMAZON_NUMERO","NRO_ARMAZON"])),
    armazon_detalle: _normStr(_gv(K, ["DETALLE_ARMAZON","ARMAZON_DETALLE"])),
    otro_txt: _normStr(_gv(K, ["OTRO","CONCEPTO_OTRO"])),
    dist: _normStr(_gv(K, ["DISTANCIA_FOCAL","DISTANCIA"])),
    od_esf: _normStr(_gv(K, ["OD_ESF","ESF_OD","OD_ESFERA"])),
    od_cil: _normStr(_gv(K, ["OD_CIL","CIL_OD","OD_CILINDRO"])),
    od_eje: _normStr(_gv(K, ["OD_EJE","EJE_OD"])),
    oi_esf: _normStr(_gv(K, ["OI_ESF","ESF_OI","OI_ESFERA"])),
    oi_cil: _normStr(_gv(K, ["OI_CIL","CIL_OI","OI_CILINDRO"])),
    oi_eje: _normStr(_gv(K, ["OI_EJE","EJE_OI"])),
    dnp: _normStr(_gv(K, ["DNP","DNP_OD_OI"])),
    add: _normStr(_gv(K, ["ADD"])),
    total: money(["TOTAL","TOTAL_FINAL"]),
    sena: money(["SEÑA","SENA"]),
    saldo: money(["SALDO"])
  };
}
function _canonEquals(a,b){ for (const k of Object.keys(a)) if (a[k] !== b[k]) return false; return true; }

async function _findExactMatchForBase(base, canonNow){
  // Buscar filas que empiecen con base o base-*
  let rows = await _queryHist({ histBuscar: `@${base}`, limit: 200 });
  if (!rows.length) rows = await _queryHist({ histBuscar: base, limit: 200 });
  for (const r of rows){
    try{
      const nro = _extractNro(r);
      if (!nro || !(nro === base || nro.startsWith(base+"-"))) continue;
      const c = _canonFromRow(r);
      if (_canonEquals(c, canonNow)) return { row:r, numero:nro };
    }catch{}
  }
  return null;
}

// Fingerprint (hash DJB2) para idempotencia server-side
function _djb2(str){
  let h = 5381;
  for (let i=0; i<str.length; i++) h = ((h<<5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8,"0");
}
function buildContentFingerprint(){
  const canon = _canonFromForm(); // normalizado/estable
  const s = JSON.stringify(canon);
  return "FP" + _djb2(s);
}

/* ====================== Flujo principal ====================== */
export async function guardarTrabajo({ progress, signal } = {}) {
  const spinner = $("spinner");
  const setStep = (label, status = "done") => { try { progress?.mark?.(label, status); } catch {} };

  try {
    if (spinner) spinner.style.display = "block";

    // Sincronizar hidden (si existe)
    syncNumeroTrabajoHidden();

    // Validaciones mínimas
    setStep("Validando datos", "run");
    const nroInput = V("numero_trabajo");
    if (!nroInput) throw new Error("Ingresá el número de trabajo");
    if (!V("dni")) throw new Error("Ingresá el DNI");
    if (!V("nombre")) throw new Error("Ingresá el nombre");
    setStep("Validando datos", "done");

    // ======== N° ÚNICO (client-side) ========
    setStep("Validando número", "run");
    let nroFinalCliente = nroInput;
    try {
      const sugerido = await _obtenerNumeroDisponible(nroInput);
      if (sugerido && sugerido !== nroInput) {
        nroFinalCliente = sugerido;
        setNumeroTrabajo(sugerido);
        if (window.Swal) {
          Swal.fire({
            toast:true, position:'top', timer:1600, showConfirmButton:false,
            icon:'info', title:`N° ocupado. Se usará ${sugerido}`
          });
        }
      }
    } catch { /* si falla, seguimos con el ingresado */ }
    setStep("Validando número", "done");

    // ==== DEDUPE PRE-GUARDADO ====
    const { base } = _splitBaseSuf(nroFinalCliente);
    const canonNow = _canonFromForm();

    let numeroFinal = null;
    const match = await _findExactMatchForBase(base, canonNow);
    if (match) {
      // Ya existe idéntico → usamos ese número y saltamos el POST
      numeroFinal = match.numero;
      setNumeroTrabajo(numeroFinal);
      setStep("Guardando en planilla", "done");
    }

    // ============ 1) Guardar en planilla (POST) ============
    const formEl = $("formulario");
    if (!formEl) throw new Error("Formulario no encontrado");
    setStep("Guardando en planilla", "run");

    const fd = new FormData(formEl);
    const body = new URLSearchParams(fd);

    // LOCALIDAD normalizada
    const loc = (fd.get("localidad") || "").toString().trim();
    body.set("localidad", loc);
    body.set("LOCALIDAD", loc);

    // Numero decidido del lado cliente
    body.set("numero_trabajo", nroFinalCliente);
    body.set("numero", nroFinalCliente); // alias común en GAS

    // ========= Armazón (número + detalle) =========
    const numAr = (fd.get("numero_armazon") || "").toString().trim();
    const detAr = (fd.get("armazon_detalle") || "").toString().trim();

    // Variantes que tu GAS entiende
    body.set("numero_armazon", numAr);
    body.set("n_armazon", numAr);
    body.set("num_armazon", numAr);
    body.set("nro_armazon", numAr);
    body.set("armazon_numero", numAr);
    body.set("NUMERO ARMAZON", numAr);

    // Compat viejo (ARMAZON = NÚMERO)
    body.set("armazon", numAr || "");

    // Detalle
    body.set("armazon_detalle", detAr);
    body.set("detalle_armazon", detAr);
    body.set("DETALLE ARMAZON", detAr);
    body.set("ARMAZON", detAr);

    // Alias DF / Obra Social
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

    // ===== Fingerprint para idempotencia server-side =====
    const contentFp = buildContentFingerprint();
    body.set("content_fp", contentFp);
    body.set("nro_base", base);

    try {
      if (!numeroFinal) {
        const postJson = await postForm(API_URL, body, { signal, timeoutMs: 30000 });
        setStep("Guardando en planilla", "done");
        numeroFinal = (postJson && postJson.numero_trabajo)
          ? String(postJson.numero_trabajo).trim()
          : nroFinalCliente;
      }
    } catch(e){
      // Si hubo timeout/error de red, chequeamos si igualmente se grabó una fila idéntica
      if (/espera|conectar|red/i.test(String(e.message))) {
        const rescue = await _findExactMatchForBase(base, canonNow);
        if (rescue) {
          numeroFinal = rescue.numero; // se guardó igual → seguimos
          setStep("Guardando en planilla", "done");
        } else {
          throw e; // no se creó nada → error real
        }
      } else {
        throw e;
      }
    }

    // Número definitivo a pantalla
    setNumeroTrabajo(numeroFinal);

    // ============ 2) Confirmar + imprimir (SIN PDF/Telegram) ============
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
      if (typeof window.__buildPrintArea === "function") {
        window.__buildPrintArea();
      } else {
        window.print?.();
      }
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
