const ADMIN_PASSWORD = sessionStorage.getItem("adminAuth");

// Login admin
document.getElementById("loginAdminBtn").addEventListener("click", async () => {
  const usuario = document.getElementById("adminUser").value.trim();
  const pass = document.getElementById("adminPass").value;

  try {
    const res = await fetch("/login-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password: pass })
    });

    const data = await res.json();

    if (res.ok && data.success && data.rol === "admin") {
      sessionStorage.setItem("adminAuth", "true");
      document.getElementById("loginAdmin").style.display = "none";
      document.getElementById("panelAdmin").style.display = "block";
      cargarUsuarios();
    } else if (res.ok && data.success && data.rol !== "admin") {
      showMessage("❌ No tenés permisos de administrador.", "error");
    } else {
      showMessage(`❌ ${data.message || "Error al iniciar sesión."}`, "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
});

document.getElementById("cerrarSesionAdminBtn").addEventListener("click", () => {
  sessionStorage.removeItem("adminAuth");
  document.getElementById("panelAdmin").style.display = "none";
  document.getElementById("loginAdmin").style.display = "flex";
  document.getElementById("adminUser").value = "";
  document.getElementById("adminPass").value = "";
});

// Si ya estaba autenticado
window.addEventListener("load", () => {
  if (sessionStorage.getItem("adminAuth") === "true") {
    document.getElementById("loginAdmin").style.display = "none";
    document.getElementById("panelAdmin").style.display = "block";
    cargarUsuarios();
  }
});

async function cargarUsuarios() {
  try {
    const res = await fetch("/listar-usuarios");
    const usuarios = await res.json();

    const pendientes = usuarios.filter(u => u.estado === "pendiente");
    const aprobados = usuarios.filter(u => u.estado === "aprobado");
    const rechazados = usuarios.filter(u => u.estado === "rechazado");

    renderSeccion("pendientes", pendientes, ["aprobar", "rechazar"]);
    renderSeccion("aprobados", aprobados, ["cambiarRol", "rechazar", "eliminar"]);
    renderSeccion("rechazados", rechazados, ["aprobar", "eliminar"]);
  } catch (e) {
    showMessage("Error al cargar usuarios.", "error");
  }
}

function renderSeccion(containerId, usuarios, acciones) {
  const contenedor = document.getElementById(containerId);
  if (usuarios.length === 0) {
    contenedor.innerHTML = `<p class="empty-msg">No hay usuarios en esta categoría.</p>`;
    return;
  }

  contenedor.innerHTML = usuarios.map(u => `
    <div class="usuario-card">
      <span class="nombre">👤 ${u.nombre} ${u.apellido} (${u.usuario}) — <em>${u.rol}</em></span>
      <div class="acciones">
        ${acciones.includes("aprobar") ? `<button class="btn-aprobar" onclick="gestionar('${u.id}', 'aprobado')">✅ Aprobar</button>` : ""}
        ${acciones.includes("rechazar") ? `<button class="btn-rechazar" onclick="gestionar('${u.id}', 'rechazado')">❌ Rechazar</button>` : ""}
        ${acciones.includes("cambiarRol") ? `<button class="btn-rol" onclick="cambiarRol('${u.id}', '${u.rol}')">${u.rol === "admin" ? "⬇️ Quitar admin" : "⬆️ Hacer admin"}</button>` : ""}
        ${acciones.includes("eliminar") ? `<button class="btn-eliminar" onclick="eliminar('${u.id}')">🗑 Eliminar</button>` : ""}
      </div>
    </div>
  `).join("");
}

async function gestionar(usuario, estado) {
  try {
    const res = await fetch("/gestionar-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, estado })
    });
    const data = await res.json();
    if (data.success) {
      showMessage("✅ Usuario actualizado correctamente.", "success");
      cargarUsuarios();
    } else {
      showMessage("Error al gestionar usuario.", "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

async function cambiarRol(usuario, rolActual) {
  const nuevoRol = rolActual === "admin" ? "despachador" : "admin";
  try {
    const res = await fetch("/cambiar-rol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, rol: nuevoRol })
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`✅ Rol cambiado a ${nuevoRol}.`, "success");
      cargarUsuarios();
    } else {
      showMessage("Error al cambiar rol.", "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

async function eliminar(usuario) {
  if (!confirm(`¿Seguro que querés eliminar al usuario "${usuario}"?`)) return;
  try {
    const res = await fetch(`/eliminar-usuario/${usuario}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showMessage("✅ Usuario eliminado.", "success");
      cargarUsuarios();
    } else {
      showMessage("Error al eliminar usuario.", "error");
    }
  } catch (e) {
    showMessage("Error al conectar con el servidor.", "error");
  }
}

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