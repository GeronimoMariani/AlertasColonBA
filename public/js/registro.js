document.getElementById("registrarBtn").addEventListener("click", registrar);

async function registrar() {
  const nombre = document.getElementById("nombreInput").value.trim();
  const apellido = document.getElementById("apellidoInput").value.trim();
  const mail = document.getElementById("mailInput").value.trim().toLowerCase();
  const password = document.getElementById("passwordInput").value;
  const confirm = document.getElementById("confirmInput").value;

  if (!nombre || !apellido || !mail || !password || !confirm) {
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
    const res = await fetch("/registro-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: mail, nombre, apellido, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showMessage("✅ Solicitud enviada. Esperá que un administrador apruebe tu acceso.", "success");
      setTimeout(() => window.location.href = "sender.html", 2500);
    } else {
      showMessage(`❌ ${data.message || "Error al registrar."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

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