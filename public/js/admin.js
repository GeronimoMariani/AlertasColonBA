const ADMIN_TOKEN_KEY = "adminToken";

function authHeaders() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  return { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cerrarSesionAdmin() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  document.getElementById("panelAdmin").style.display = "none";
  document.getElementById("loginAdmin").style.display = "flex";
  document.getElementById("adminUser").value = "";
  document.getElementById("adminPass").value = "";
}

// Si el servidor rechaza la sesión, vuelve al login. Devuelve true si hubo que salir.
function sesionRechazada(res) {
  if (res.status === 401 || res.status === 403) {
    showMessage("❌ Sesión expirada o sin permisos. Volvé a iniciar sesión.", "error");
    cerrarSesionAdmin();
    return true;
  }
  return false;
}

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
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
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

document.getElementById("cerrarSesionAdminBtn").addEventListener("click", cerrarSesionAdmin);

// Si ya estaba autenticado
window.addEventListener("load", () => {
  sessionStorage.removeItem("adminAuth"); // marca vieja, ya no se usa
  if (sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
    document.getElementById("loginAdmin").style.display = "none";
    document.getElementById("panelAdmin").style.display = "block";
    cargarUsuarios();
  }
});

async function cargarUsuarios() {
  try {
    const res = await fetch("/listar-usuarios", { headers: authHeaders() });
    if (sesionRechazada(res)) return;
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
  document.getElementById(`${containerId}Count`).textContent = usuarios.length;
  if (usuarios.length === 0) {
    contenedor.innerHTML = `<p class="vacio">No hay usuarios en esta categoría.</p>`;
    return;
  }

  contenedor.innerHTML = usuarios.map(u => {
    const id = escapeHtml(u.id);
    const rol = escapeHtml(u.rol);
    const iniciales = `${String(u.nombre ?? "").charAt(0)}${String(u.apellido ?? "").charAt(0)}`;
    return `
    <div class="usuario-card">
      <div class="avatar">${escapeHtml(iniciales)}</div>
      <div>
        <span class="nombre">${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}${u.rol === "admin" ? ` <span class="chip chip-steel">Admin</span>` : ""}</span>
        <span class="correo">${escapeHtml(u.usuario)}</span>
      </div>
      <div class="acciones">
        ${acciones.includes("aprobar") ? `<button class="btn-aprobar" data-accion="gestionar" data-usuario="${id}" data-estado="aprobado">Aprobar</button>` : ""}
        ${acciones.includes("rechazar") ? `<button class="btn-rechazar" data-accion="gestionar" data-usuario="${id}" data-estado="rechazado">Rechazar</button>` : ""}
        ${acciones.includes("cambiarRol") ? `<button class="btn-rol" data-accion="cambiarRol" data-usuario="${id}" data-rol="${rol}">${u.rol === "admin" ? "Quitar admin" : "Hacer admin"}</button>` : ""}
        ${acciones.includes("eliminar") ? `<button class="btn-eliminar" data-accion="eliminar" data-usuario="${id}">Eliminar</button>` : ""}
      </div>
    </div>`;
  }).join("");
}

// Los datos del usuario viajan en atributos data-* (nunca dentro de código JS inline),
// así un nombre de usuario malicioso no puede ejecutar código en el panel.
["pendientes", "aprobados", "rechazados"].forEach(containerId => {
  document.getElementById(containerId).addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    const { accion, usuario, estado, rol } = btn.dataset;
    if (accion === "gestionar") gestionar(usuario, estado);
    else if (accion === "cambiarRol") cambiarRol(usuario, rol);
    else if (accion === "eliminar") eliminar(usuario);
  });
});

async function gestionar(usuario, estado) {
  try {
    const res = await fetch("/gestionar-usuario", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ usuario, estado })
    });
    if (sesionRechazada(res)) return;
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
      headers: authHeaders(),
      body: JSON.stringify({ usuario, rol: nuevoRol })
    });
    if (sesionRechazada(res)) return;
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
    const res = await fetch(`/eliminar-usuario/${encodeURIComponent(usuario)}`, { method: "DELETE", headers: authHeaders() });
    if (sesionRechazada(res)) return;
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