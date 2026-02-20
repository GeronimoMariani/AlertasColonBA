console.log("registro.js cargado");
document.getElementById("registrarBtn").addEventListener("click", registrar);

async function registrar() {
  console.log("registrar ejecutado");
  const nombre = document.getElementById("nombreInput").value.trim();
  const apellido = document.getElementById("apellidoInput").value.trim();
  const mail = document.getElementById("mailInput").value.trim().toLowerCase();
  const password = document.getElementById("passwordInput").value;
  const confirm = document.getElementById("confirmInput").value;

  console.log("Datos:", { nombre, apellido, mail });

  if (!nombre || !apellido || !mail || !password || !confirm) {
    alert("Completá todos los campos.");
    return;
  }

  if (password !== confirm) {
    alert("Las contraseñas no coinciden.");
    return;
  }

  if (password.length < 6) {
    alert("La contraseña debe tener al menos 6 caracteres.");
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
      alert("✅ Solicitud enviada. Esperá que un administrador apruebe tu acceso.");
      window.location.href = "sender.html";
    } else {
      alert(`❌ ${data.message || "Error al registrar."}`);
    }
  } catch (e) {
    alert("Error al conectar con el servidor.");
  }
}