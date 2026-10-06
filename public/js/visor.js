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

const sirena = document.getElementById("sirena");
const actualizacionSonido = document.getElementById("actualizacion");
const container = document.getElementById("alertContainer");
const horaEl = document.getElementById("hora");
const fechaEl = document.getElementById("fecha");
const statusEl = document.getElementById("status");

// --- Reproducir sirena ---
function playSirena() {
  sirena.pause();
  sirena.currentTime = 0;
  sirena.play().catch(() => {});
}

// --- Reproducir sonido de actualización ---
function playActualizacion() {
  actualizacionSonido.pause();
  actualizacionSonido.currentTime = 0;
  actualizacionSonido.play().catch(() => {});
}

// --- Actualizar fecha y hora ---
function updateDateTime() {
  const now = new Date();
  const timeZone = "America/Argentina/Buenos_Aires";
  horaEl.textContent = now.toLocaleTimeString("es-AR", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  fechaEl.textContent = now.toLocaleDateString("es-AR", {
    timeZone, weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
}
setInterval(updateDateTime, 1000);
updateDateTime();

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAlerta(data, actualizada = false) {
  const estado = actualizada ? "actualizada" : "";
  container.innerHTML = `
    <div class="alarm-band ${estado}">
      <span>${actualizada ? "▲ Alerta actualizada" : "● Alerta activa"}</span>
      <span>Salida inmediata</span>
    </div>
    <div class="alert-body ${estado}">
      <div>
        <h1 class="alert-type">${escapeHtml(data.tipo)}</h1>
        <h2 class="alert-addr"><small>Dirección</small>${escapeHtml(data.direccion)}</h2>
        ${data.descripcion ? `<p class="alert-desc">${escapeHtml(data.descripcion)}</p>` : ""}
      </div>
      <dl class="alert-side">
        <div><dt>Despachado por</dt><dd>${escapeHtml(data.despachadoPor)}</dd></div>
        <div><dt>Contacto</dt><dd class="mono">${escapeHtml(data.contacto || "—")}</dd></div>
        <div><dt>Fecha y hora</dt><dd class="mono">${escapeHtml(data.timestamp)}</dd></div>
      </dl>
    </div>
  `;
}

// --- Recibir alerta nueva ---
socket.on("alert", (data) => {
  playSirena();
  renderAlerta(data, false);
});

// --- Recibir alerta actualizada ---
socket.on("alertActualizada", (data) => {
  playActualizacion();
  renderAlerta(data, true);
});

socket.on("alertExistente", (data) => {
  renderAlerta(data, false); // muestra la alerta sin reproducir sirena
});

// --- Limpiar alerta ---
socket.on("clearAlert", () => {
  container.innerHTML = `
    <div id="noAlertContainer">
      <img src="logo.png" alt="Logo Bomberos" />
      <h2>Sin alertas activas</h2>
      <p>En espera</p>
    </div>
  `;
});

// --- Estado de conexión ---
socket.on("connect", () => {
  socket.emit("registrarVisor");
  statusEl.textContent = "Conectado al servidor";
  statusEl.className = "conectado";
});

socket.on("disconnect", () => {
  statusEl.textContent = "Sin conexión";
  statusEl.className = "desconectado";
});
