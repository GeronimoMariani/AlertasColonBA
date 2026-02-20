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

// Verificar si ya está autenticado al cargar la página
window.addEventListener("load", () => {
  const usuario = sessionStorage.getItem("usuarioLogueado");
  if (usuario) {
    mostrarPanel();
  }
});

function cerrarSesion() {
  sessionStorage.removeItem("usuarioLogueado");
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
}

document.getElementById("ingresarBtn").addEventListener("click", loginUsuario);

document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginUsuario();
});

async function loginUsuario() {
  const usuario = document.getElementById("usuarioInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  if (!usuario || !password) {
    alert("Completá usuario y contraseña.");
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
      sessionStorage.setItem("usuarioLogueado", data.usuario);
      mostrarPanel();
    } else {
      alert(`❌ ${data.message || "Error al iniciar sesión."}`);
    }
  } catch (e) {
    alert("Error al conectar con el servidor.");
  }
}

document.getElementById("cerrarSesionBtn").addEventListener("click", cerrarSesion);

document.getElementById("alertForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const btn = document.getElementById("sendBtn");
  const loading = document.getElementById("loading");
  btn.disabled = true;
  loading.style.display = "block";

  const usuarioLogueado = sessionStorage.getItem("usuarioLogueado");

  const data = {
    tipo: document.getElementById("tipo").value,
    direccion: document.getElementById("direccion").value,
    descripcion: document.getElementById("descripcion").value.toUpperCase(),
    despachadoPor: document.getElementById("despachadoPor").value,
    contacto: document.getElementById("contacto").value,
    enviadoPor: usuarioLogueado, // usuario de la cuenta, campo nuevo
  };

  socket.emit("sendAlert", data);

  setTimeout(() => {
    btn.disabled = false;
    loading.style.display = "none";
    showMessage("✅ Alerta enviada correctamente", "success");
    e.target.reset();
  }, 1000);
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
