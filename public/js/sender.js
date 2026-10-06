const SERVER_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : "https://alertascolonba.onrender.com";

const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  // Se lee en cada (re)conexión, así siempre viaja el token actual
  auth: (cb) => {
    const token = localStorage.getItem("loginToken");
    cb(token ? { token } : {});
  },
});

let alertaActiva = false;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Revisa la fecha de vencimiento del token (la validación real la hace el servidor)
function tokenVigente(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000 > Date.now();
  } catch (e) {
    return false;
  }
}

function authHeaders() {
  const token = localStorage.getItem("loginToken");
  return { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };
}

// Reconecta el socket para que el servidor tome el token nuevo (o su ausencia)
function reconectarSocket() {
  socket.disconnect();
  socket.connect();
}

function sesionVencida(mensaje) {
  showMessage(`❌ ${mensaje || "Tu sesión venció. Volvé a iniciar sesión."}`, "error");
  // El formulario no se borra: al volver a entrar se puede reenviar enseguida
  cerrarSesion();
}

// Verificar si ya está autenticado al cargar la página
window.addEventListener("load", () => {
  const usuario = localStorage.getItem("usuarioLogueado");
  const token = localStorage.getItem("loginToken");
  if (usuario && token && tokenVigente(token)) {
    mostrarPanel();
  } else if (usuario) {
    sesionVencida();
  }
});

function cerrarSesion() {
  localStorage.removeItem("usuarioLogueado");
  localStorage.removeItem("rolUsuario");
  localStorage.removeItem("loginToken");
  reconectarSocket();
  document.getElementById("main").style.display = "none";
  document.getElementById("login").style.display = "flex";
  document.getElementById("usuarioInput").value = "";
  document.getElementById("passwordInput").value = "";
}

function updateDateTime() {
  const now = new Date();
  const options = {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  };
  document.getElementById("datetime").textContent = now.toLocaleString("es-AR", options);
}

function mostrarPanel() {
  document.getElementById("login").style.display = "none";
  document.getElementById("main").style.display = "block";
  setInterval(updateDateTime, 1000);
  updateDateTime();

  const rol = localStorage.getItem("rolUsuario");
  const historialBtn = document.getElementById("verHistorialBtn");
  const estadisticasBtn = document.getElementById("verEstadisticasBtn");

  if (rol === "admin") {
    historialBtn.style.display = "inline-block";
    estadisticasBtn.style.display = "inline-block";
  } else {
    historialBtn.style.display = "none";
    estadisticasBtn.style.display = "none";
  }
}

document.getElementById("ingresarBtn").addEventListener("click", loginUsuario);

document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginUsuario();
});

async function loginUsuario() {
  const usuario = document.getElementById("usuarioInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  if (!usuario || !password) {
    showMessage("Completá usuario y contraseña.", "error");
    return;
  }

  try {
    const res = await fetch("/login-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      localStorage.setItem("usuarioLogueado", data.usuario);
      localStorage.setItem("rolUsuario", data.rol);
      localStorage.setItem("loginToken", data.token);
      reconectarSocket();
      mostrarPanel();
    } else {
      showMessage(`❌ ${data.message || "Error al iniciar sesión."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

document.getElementById("cerrarSesionBtn").addEventListener("click", cerrarSesion);

// --- Selector de tipo: los botones eligen el valor del select oculto #tipo ---
const tipoSelect = document.getElementById("tipo");
const tipoBtns = document.querySelectorAll(".tipo-btn");

function marcarTipo() {
  tipoBtns.forEach(b => {
    const activo = b.dataset.tipo === tipoSelect.value;
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-pressed", activo);
  });
}

tipoBtns.forEach(b => b.addEventListener("click", () => {
  tipoSelect.value = b.dataset.tipo;
  marcarTipo();
}));

// Al resetear el formulario el select vuelve al primer tipo; se actualizan los botones
document.getElementById("alertForm").addEventListener("reset", () => setTimeout(marcarTipo, 0));
marcarTipo();

document.getElementById("alertForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const tipo = document.getElementById("tipo").value;
  const direccion = document.getElementById("direccion").value;

  const despachadoPor = document.getElementById("despachadoPor").value;

  document.getElementById("modalTexto").innerHTML = `
    <dl class="kv">
      <dt>Tipo</dt><dd>${escapeHtml(tipo)}</dd>
      <dt>Dirección</dt><dd>${escapeHtml(direccion)}</dd>
      <dt>Despachado por</dt><dd>${escapeHtml(despachadoPor)}</dd>
    </dl>
  `;
  document.getElementById("modalConfirm").style.display = "flex";
});

document.getElementById("modalCancelar").addEventListener("click", () => {
  document.getElementById("modalConfirm").style.display = "none";
});

document.getElementById("modalConfirmar").addEventListener("click", () => {
  document.getElementById("modalConfirm").style.display = "none";

  const btn = document.getElementById("sendBtn");
  const loading = document.getElementById("loading");
  btn.disabled = true;
  loading.style.display = "block";

  const usuarioLogueado = localStorage.getItem("usuarioLogueado");

  const data = {
    tipo: document.getElementById("tipo").value,
    direccion: document.getElementById("direccion").value.toUpperCase(),
    descripcion: document.getElementById("descripcion").value.toUpperCase(),
    despachadoPor: document.getElementById("despachadoPor").value,
    contacto: document.getElementById("contacto").value,
    enviadoPor: usuarioLogueado,
  };

  // Se espera la confirmación real del servidor antes de avisar que salió
  socket.timeout(10000).emit("sendAlert", data, (err, resp) => {
    btn.disabled = false;
    loading.style.display = "none";

    if (err) {
      showMessage("⚠️ El servidor no confirmó la alerta. Revisá el visor antes de reenviar.", "error");
      return;
    }
    if (resp && resp.ok) {
      showMessage("✅ Alerta enviada correctamente", "success");
      document.getElementById("alertForm").reset();
      alertaActiva = true;
      document.getElementById("editarAlertaBtn").style.display = "block";
      return;
    }
    if (resp && resp.code === "AUTH") {
      sesionVencida(resp.message);
      return;
    }
    showMessage(`❌ ${(resp && resp.message) || "No se pudo enviar la alerta"}`, "error");
  });
});

// Escuchar cuando se limpia la alerta para ocultar el botón editar
socket.on("clearAlert", () => {
  alertaActiva = false;
  document.getElementById("editarAlertaBtn").style.display = "none";
});

// Escuchar alerta activa al conectarse
socket.on("alert", (data) => {
  alertaActiva = true;
  document.getElementById("editarAlertaBtn").style.display = "block";
});

// Botón editar
document.getElementById("editarAlertaBtn").addEventListener("click", async () => {
  try {
    const res = await fetch("/ultima-alerta", { headers: authHeaders() });
    if (res.status === 401) return sesionVencida();
    const data = await res.json();
    if (!data) return showMessage("No hay alerta activa.", "error");

    document.getElementById("editTipo").value = data.tipo;
    document.getElementById("editDireccion").value = data.direccion;
    document.getElementById("editDescripcion").value = data.descripcion || "";
    document.getElementById("editDespachadoPor").value = data.despachadoPor;
    document.getElementById("editContacto").value = data.contacto || "";

    document.getElementById("modalEditar").style.display = "flex";
  } catch (e) {
    showMessage("Error al cargar la alerta.", "error");
  }
});

document.getElementById("modalEditarCancelar").addEventListener("click", () => {
  document.getElementById("modalEditar").style.display = "none";
});

document.getElementById("modalEditarConfirmar").addEventListener("click", async () => {
  const body = {
    tipo: document.getElementById("editTipo").value,
    direccion: document.getElementById("editDireccion").value,
    descripcion: document.getElementById("editDescripcion").value.toUpperCase(),
    despachadoPor: document.getElementById("editDespachadoPor").value,
    contacto: document.getElementById("editContacto").value,
  };

  try {
    const res = await fetch("/editar-alerta", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (res.status === 401) {
      document.getElementById("modalEditar").style.display = "none";
      return sesionVencida(data.message);
    }
    if (data.success) {
      document.getElementById("modalEditar").style.display = "none";
      showMessage("✅ Alerta actualizada correctamente.", "success");
    } else {
      showMessage(`❌ ${data.message || "Error al editar."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
});

// El aspecto del aviso está en base.css (.toast)
function showMessage(text, type = "info") {
  const msg = document.createElement("div");
  msg.className = `toast toast-${type}`;
  msg.textContent = text;
  document.body.appendChild(msg);
  setTimeout(() => msg.classList.add("visible"), 10);
  setTimeout(() => {
    msg.classList.remove("visible");
    setTimeout(() => msg.remove(), 500);
  }, 4000);
}

document.getElementById("olvidéBtn").addEventListener("click", async () => {
  const usuario = prompt("Ingresá tu mail para recibir el link de reseteo:");

  if (!usuario) return;

  try {
    const res = await fetch("/solicitar-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario.trim().toLowerCase() })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showMessage("✅ Te enviamos un mail con el link para resetear tu contraseña.", "success");
    } else {
      showMessage(`❌ ${data.message || "Error al enviar el mail."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
});

socket.on("visoresCount", (count) => {
  const el = document.getElementById("visoresCount");
  if (el) el.textContent = `${count} visor${count !== 1 ? "es" : ""}`;
});
