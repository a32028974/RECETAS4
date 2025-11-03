// numeroTrabajo.js – versión corregida
// Mantiene una función utilitaria SIN event listeners para evitar conflictos.
// El main.js nuevo ya genera el número al salir/cambiar el teléfono.

export function obtenerNumeroTrabajoDesdeTelefono(telefonoStr){
  const dig = (telefonoStr || '').replace(/\D+/g,'');
  if (dig.length < 4) return '';
  const ult4 = dig.slice(-4);
  const now  = new Date();
  const anio = now.getFullYear().toString().slice(-1);
  const mes  = String(now.getMonth()+1).padStart(2,'0');
  const dia  = String(now.getDate()).padStart(2,'0');
  const hora = String(now.getHours()).padStart(2,'0');
  return `${anio}${dia}${mes}${hora}${ult4}`;
}

// Para compatibilidad con tu llamado anterior (si existiera)
export function obtenerNumeroTrabajo(){
  const telInput = document.getElementById('telefono');
  const out = document.getElementById('numero_trabajo');
  if (!telInput || !out) return;
  out.value = obtenerNumeroTrabajoDesdeTelefono(telInput.value);
  if (!out.value) alert('Ingresá un teléfono válido (mínimo 4 dígitos).');
}
