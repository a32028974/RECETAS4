// /RECETAS/js/fechaHoy.js
export function cargarFechaHoy() {
  const input = document.getElementById('fecha');
  if (!input) return;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);

  input.value = `${dd}/${mm}/${yy}`;
}
export default cargarFechaHoy;
