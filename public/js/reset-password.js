const params = new URLSearchParams(window.location.search);
const token = params.get("token");

if (!token) {
  showMessage("Link inválido.", "error");
  setTimeout(() => window.location.href = "sender.html", 2000);
}

document.getElementById("resetBtn").addEventListener("click", async () => {
  const password = document.getElementById("passwordInput").value;
  const confirm = document.getElementById("confirmInput").value;

  if (!password || !confirm) {
    showMessage("Completá todos los campos.", "error");
    return;
  }

  if (password !== confirm) {
    showMessage("Las contraseñas no coinciden.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }

  try {
    const res = await fetch("/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showMessage("✅ Contraseña actualizada correctamente.", "success");
      setTimeout(() => window.location.href = "sender.html", 2500);
    } else {
      showMessage(`❌ ${data.message || "Error al resetear."}`, "error");
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