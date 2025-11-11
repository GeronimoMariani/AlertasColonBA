const socket = io("http://localhost:3000/", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

const sirena = document.getElementById("sirena");
const container = document.getElementById("alertContainer");
const datetime = document.getElementById("datetime");
const statusEl = document.getElementById("status");

// --- Reproducir sirena ---
function playSirena() {
  sirena.pause();
  sirena.currentTime = 0;
  sirena.play().catch(() => {});
}

// --- Actualizar fecha y hora ---
function updateDateTime() {
  const now = new Date();
  const options = {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit"
  };
  const hora = now.toLocaleTimeString("es-AR", options);
  const fecha = now.toLocaleDateString("es-AR");
  datetime.textContent = `${fecha} — ${hora}`;
}
setInterval(updateDateTime, 1000);
updateDateTime();

// --- Recibir alertas ---
socket.on("alert", (data) => {
  playSirena();
  container.innerHTML = `
    <h1>${data.tipo.toUpperCase()}</h1>
    <h2>${data.direccion}</h2>
    <p>${data.descripcion || ""}</p>
    <p class="info">Despachado por: ${data.despachadoPor}</p>
    <p class="info">Contacto: ${data.contacto || "—"}</p>
    <p class="info">Hora: ${data.timestamp}</p>
  `;
});

// --- Limpiar alerta ---
socket.on("clearAlert", () => {
  container.innerHTML = `
    <div id="noAlertContainer">
      <img src="logo.png" alt="Logo Bomberos" />
      <h2>SIN ALERTAS ACTIVAS</h2>
    </div>
  `;
});

// --- Estado de conexión ---
socket.on("connect", () => {
  statusEl.textContent = "🟢 Conectado al servidor";
  statusEl.style.color = "#0f0";
});

socket.on("disconnect", () => {
  statusEl.textContent = "🔴 Sin conexión";
  statusEl.style.color = "#f00";
});
