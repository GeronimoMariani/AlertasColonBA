const SERVER_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : "https://alertascolonba.onrender.com";

const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

let alertaActiva = false;

// Verificar si ya está autenticado al cargar la página
window.addEventListener("load", () => {
  const usuario = localStorage.getItem("usuarioLogueado");
  if (usuario) {
    mostrarPanel();
  }
});

function cerrarSesion() {
  localStorage.removeItem("usuarioLogueado");
  localStorage.removeItem("rolUsuario");
  document.getElementById("main").style.display = "none";
  document.getElementById("login").style.display = "flex";
  document.getElementById("login").style.flexDirection = "column";
  document.getElementById("login").style.alignItems = "center";
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
      mostrarPanel();
    } else {
      showMessage(`❌ ${data.message || "Error al iniciar sesión."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

document.getElementById("cerrarSesionBtn").addEventListener("click", cerrarSesion);

document.getElementById("alertForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const tipo = document.getElementById("tipo").value;
  const direccion = document.getElementById("direccion").value;

  document.getElementById("modalTexto").innerHTML = `
    <strong>Tipo:</strong> ${tipo}<br>
    <strong>Dirección:</strong> ${direccion}
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

  socket.emit("sendAlert", data);

  setTimeout(() => {
    btn.disabled = false;
    loading.style.display = "none";
    showMessage("✅ Alerta enviada correctamente", "success");
    document.getElementById("alertForm").reset();
    alertaActiva = true;
    document.getElementById("editarAlertaBtn").style.display = "block";
  }, 1000);
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
    const res = await fetch("/ultima-alerta");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
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

function showMessage(text, type = "info") {
  const msg = document.createElement("div");
  msg.textContent = text;
  msg.style.position = "fixed";
  msg.style.top = "20px";
  msg.style.left = "50%";
  msg.style.transform = "translateX(-50%)";
  msg.style.background = type === "success" ? "#28a745" : "#dc3545";
  msg.style.color = "#fff";
  msg.style.padding = "12px 20px";
  msg.style.borderRadius = "8px";
  msg.style.fontSize = "1rem";
  msg.style.zIndex = "9999";
  msg.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  msg.style.opacity = "0";
  msg.style.transition = "opacity 0.3s ease";
  document.body.appendChild(msg);
  setTimeout(() => (msg.style.opacity = "1"), 10);
  setTimeout(() => {
    msg.style.opacity = "0";
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
  if (el) el.textContent = `📺 Visores conectados: ${count}`;
});
