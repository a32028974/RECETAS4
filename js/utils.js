// js/utils.js
// Helpers reutilizables y “fuente de verdad” única para dinero.

/** Limpia un <input> de dinero dejando solo dígitos (para $ AR). */
export function sanitizePrice(el) {
  if (!el) return;
  el.value = String(el.value || '').replace(/[^\d]/g, '');
}

/** Parsea un string/valor de dinero a número (admite -, .). */
export function parseMoney(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
