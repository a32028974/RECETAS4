// js/fotoPack.js
// ==============================
// Cámara + Galería (tablet/PC)
// ==============================

let stream = null;
const $  = (s) => document.querySelector(s);

// almacenamiento de fotos en memoria (dataURL "data:image/jpeg;base64,...")
window.__FOTOS = Array.isArray(window.__FOTOS) ? window.__FOTOS : [];

// helpers de compresión y render miniaturas
async function compressDataURL(dataURL, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      let newW = w, newH = h;

      if (Math.max(w, h) > maxSide) {
        if (w >= h) { newW = maxSide; newH = Math.round(h * (maxSide / w)); }
        else        { newH = maxSide; newW = Math.round(w * (maxSide / h)); }
      }

      const canvas = document.createElement("canvas");
      canvas.width = newW; canvas.height = newH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, newW, newH);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataURL); // si falla, devolvémos la original
    img.src = dataURL;
  });
}

function getGaleriaEl() {
  return document.getElementById("galeria-fotos") || document.querySelector(".galeria");
}

function renderGaleria() {
  const gal = getGaleriaEl();
  if (!gal) return;
  gal.innerHTML = "";
  (window.__FOTOS || []).forEach((dataURL, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "ph";
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = dataURL;
    img.alt = `Foto ${idx + 1}`;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    wrap.appendChild(img);

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Eliminar";
    Object.assign(del.style, {
      position: "absolute", top: "4px", right: "4px",
      width: "24px", height: "24px", borderRadius: "999px",
      border: "0", cursor: "pointer", background: "rgba(0,0,0,.65)", color: "#fff",
      lineHeight: "24px", textAlign: "center", fontSize: "16px"
    });
    del.onclick = () => { window.__FOTOS.splice(idx, 1); renderGaleria(); };
    wrap.appendChild(del);

    gal.appendChild(wrap);
  });
}

async function pushPhoto(dataURL) {
  const small = await compressDataURL(dataURL, 1280, 0.85);
  window.__FOTOS.push(small);
  renderGaleria();
}

function createGalleryInputIfMissing() {
  let input = document.getElementById("galeria-input");
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.id = "galeria-input";
    input.accept = "image/*";
    input.multiple = true;
    input.hidden = true;
    document.body.appendChild(input);
  }
  return input;
}

async function filesToPhotos(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    if (!/^image\//i.test(f.type)) continue;
    const durl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(f);
    });
    await pushPhoto(durl);
  }
}

// ==============================
// init principal
// ==============================
export function initPhotoPack() {
  const modal       = $("#cam-modal");
  const video       = $("#cam-video");
  const btnOpen     = $("#btn-foto");
  const btnTomar    = $("#cam-tomar");
  const btnUsar     = $("#cam-usar");
  const btnCancelar = $("#cam-cancelar");
  const canvas      = $("#cam-shot");
  const previewWrap = $("#cam-preview");
  const btnCloseX   = $("#cam-close-x");

  // galería
  const btnGaleria  = $("#btn-galeria");
  const inputGaleria= createGalleryInputIfMissing();

  // render inicial
  renderGaleria();

  // ========== GALERÍA ==========
  if (btnGaleria && inputGaleria) {
    btnGaleria.addEventListener("click", () => inputGaleria.click());
    inputGaleria.addEventListener("change", async () => {
      try { await filesToPhotos(inputGaleria.files); }
      finally { inputGaleria.value = ""; }
    });
  }

  // ========= CÁMARA =========
  if (!modal || !video || !btnOpen || !btnTomar || !btnUsar || !btnCancelar || !canvas || !previewWrap) {
    console.warn("Faltan elementos del modal de cámara. Solo funcionará la galería.");
    return;
  }

  function stopStream() {
    try { video.srcObject?.getTracks()?.forEach(t => t.stop()); } catch {}
    try { stream?.getTracks()?.forEach(t => t.stop()); } catch {}
    video.srcObject = null;
    stream = null;
  }
  function closeModal() {
    modal.setAttribute("hidden", "");
    document.body.classList.remove("cam-open");
    document.body.style.overflow = '';
    stopStream();
    btnUsar.disabled = true;
    previewWrap.style.display = "none";
  }

  async function openCamera() {
    try {
      stopStream();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = stream;
      await video.play();
      modal.removeAttribute("hidden");
      document.body.classList.add("cam-open");
      document.body.style.overflow = 'hidden'; // evita scroll del body bajo el modal
      btnUsar.disabled = true;
      previewWrap.style.display = "none";
    } catch (err) {
      console.error("getUserMedia error:", err);
      const f = document.createElement("input");
      f.type = "file"; f.accept = "image/*"; f.capture = "environment";
      f.onchange = async () => { await filesToPhotos(f.files); };
      f.click();
    }
  }

  window.__openCameraModal = openCamera;

  btnOpen.addEventListener("click", openCamera);
  btnCancelar.addEventListener("click", closeModal);
  if (btnCloseX) btnCloseX.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  btnTomar.addEventListener("click", () => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    previewWrap.style.display = "block";
    btnUsar.disabled = false;

    // Asegurá que la barra de acciones quede visible y el botón usable reciba foco:
    const actions = modal.querySelector('.cam-actions');
    if (actions) {
      try { actions.scrollIntoView({ behavior:'smooth', block:'end' }); } catch {}
    }
    try { btnUsar.focus({ preventScroll:false }); } catch {}
  });

  btnUsar.addEventListener("click", async () => {
    const dataURL = canvas.toDataURL("image/jpeg", 0.9);
    await pushPhoto(dataURL);
    closeModal();
  });

  const btnLimpiar = document.getElementById("btn-limpiar");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      window.__FOTOS.length = 0;
      renderGaleria();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hasAttribute("hidden")) closeModal();
  });
}
