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
      alert("❌ No tenés permisos de administrador.");
    } else {
      alert(`❌ ${data.message || "Error al iniciar sesión."}`);
    }
  } catch (e) {
    alert("Error al conectar con el servidor.");
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
    renderSeccion("aprobados", aprobados, ["rechazar", "eliminar"]);
    renderSeccion("rechazados", rechazados, ["aprobar", "eliminar"]);
  } catch (e) {
    alert("Error al cargar usuarios.");
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
      <span class="nombre">👤 ${u.nombre} ${u.apellido} (${u.usuario})</span>
      <div class="acciones">
        ${acciones.includes("aprobar") ? `<button class="btn-aprobar" onclick="gestionar('${u.id}', 'aprobado')">✅ Aprobar</button>` : ""}
        ${acciones.includes("rechazar") ? `<button class="btn-rechazar" onclick="gestionar('${u.id}', 'rechazado')">❌ Rechazar</button>` : ""}
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
    if (data.success) cargarUsuarios();
    else alert("Error al gestionar usuario.");
  } catch (e) {
    alert("Error al conectar con el servidor.");
  }
}

async function eliminar(usuario) {
  if (!confirm(`¿Seguro que querés eliminar al usuario "${usuario}"?`)) return;
  try {
    const res = await fetch(`/eliminar-usuario/${usuario}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) cargarUsuarios();
    else alert("Error al eliminar usuario.");
  } catch (e) {
    alert("Error al conectar con el servidor.");
  }
}