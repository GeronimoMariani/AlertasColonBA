import { guardarAlertaFirebase } from "./firebase.js";

const socket = io("http://localhost:3000/", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

function updateDateTime() {
  const now = new Date();
  const options = { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" };
  const hora = now.toLocaleTimeString("es-AR", options);
  const fecha = now.toLocaleDateString("es-AR");
  document.getElementById("datetime").textContent = `${fecha} — ${hora}`;
}

// sender.js
document.getElementById("ingresarBtn").addEventListener("click", checkPassword);

function checkPassword() {
  const pass = document.getElementById("passwordInput").value;

  fetch("/check-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pass })
  })
    .then(res => {
      if (res.ok) {
        sessionStorage.setItem("authenticated", "true");
        document.getElementById("login").style.display = "none";
        document.getElementById("main").style.display = "block";
      } else {
        alert("Contraseña incorrecta");
      }
    })
    .catch(() => alert("Error al conectar con el servidor"));
}

document.getElementById("alertForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const btn = document.getElementById("sendBtn");
  const loading = document.getElementById("loading");
  btn.disabled = true;
  loading.style.display = "block";

  const data = {
    tipo: document.getElementById("tipo").value,
    direccion: document.getElementById("direccion").value,
    descripcion: document.getElementById("descripcion").value.toUpperCase(),
    despachadoPor: document.getElementById("despachadoPor").value,
    contacto: document.getElementById("contacto").value,
  };

  socket.emit("sendAlert", data);
  guardarAlertaFirebase(data);

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
