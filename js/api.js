// js/api.js — v2025-11-06
// 1) ENDPOINT GENERAL (DNI, ARMAZÓN, HISTORIAL, guardar, updateJob, etc.)
export const API_URL  = "https://script.google.com/macros/s/AKfycbzagB_jZ7niXARSbnqCVfZp3e6X9oMxSlO-u-zJCfReguIe2cXf63uZFIpSSdBvMi86rA/exec";

// 2) ENDPOINT DE PACK/TELEGRAM (sigue igual)
export const PACK_URL = "https://script.google.com/macros/s/AKfycbyAc51qga-xnN3319jcVmAWwz7NTlNH-Lht3IwRIt8PT0MAy_ZKpcGJiohQZIFPfIONsA/exec";

// 3) ENDPOINT NUEVO (búsqueda por N° de trabajo) — "func editar receta"
export const EDIT_URL = "https://script.google.com/macros/s/AKfycbxeMizwM-t9z0Nbz6R01yvR8YPg_uthGESDaz2wEfIROnDDsKHTFGsSrb2VN-LKBYsh/exec";

// Helpers
export function withParams(base, params = {}) {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  return u.toString();
}

export async function apiGet(url) {
  const r = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    throw new Error(`HTTP ${r.status} – ${txt.slice(0,200)}`);
  }
  return r.json();
}
