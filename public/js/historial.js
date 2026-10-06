import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAuVQVoyQG_bSOhyb-cbs-UcQa4G6K8h6k",
    authDomain: "alertascolonba.firebaseapp.com",
    projectId: "alertascolonba",
    storageBucket: "alertascolonba.firebasestorage.app",
    messagingSenderId: "665310922522",
    appId: "1:665310922522:web:cf270348a2fe1beee30ea3",
    measurementId: "G-GCFSNGPXQS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const contenedor = document.getElementById("alertasContainer");
const resultadoCount = document.getElementById("resultadoCount");
let todasLasAlertas = [];

async function cargarAlertas() {
    try {
        const q = query(collection(db, "alertas"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            contenedor.innerHTML = `<p class="vacio">No hay alertas registradas.</p>`;
            return;
        }

        todasLasAlertas = querySnapshot.docs.map(doc => doc.data());
        renderAlertas(todasLasAlertas);
    } catch (error) {
        console.error(error);
        contenedor.innerHTML = `<p class="vacio">Error al cargar las alertas.</p>`;
    }
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Clase de color del borde según el tipo de siniestro (ver historial.css)
const CLASE_TIPO = {
    "Incendio": "t-incendio",
    "Forestal": "t-forestal",
    "Accidente Vehicular": "t-accidente",
    "Rescate": "t-rescate",
    "Materiales Peligrosos": "t-matpel",
};

function renderAlertas(alertas) {
    if (alertas.length === 0) {
        contenedor.innerHTML = `<p class="vacio">No hay alertas que coincidan con los filtros.</p>`;
        resultadoCount.textContent = "";
        return;
    }

    resultadoCount.textContent = `Mostrando ${alertas.length} alerta${alertas.length !== 1 ? "s" : ""}`;
    contenedor.innerHTML = "";

    alertas.forEach(data => {
        const card = document.createElement("div");
        card.className = `alert-card ${CLASE_TIPO[data.tipo] || ""}`;

        const timestampDate = new Date(data.timestamp?.toDate?.() || data.timestamp);
        const timeZone = "America/Argentina/Buenos_Aires";
        const hora = timestampDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
        const fecha = timestampDate.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone });

        card.innerHTML = `
            <i class="sev"></i>
            <div class="alert-time"><b>${hora}</b>${fecha}</div>
            <div class="alert-main">
                <h2>${escapeHtml(data.tipo)}</h2>
                <p>${escapeHtml(data.direccion)}${data.descripcion ? ` · ${escapeHtml(data.descripcion)}` : ""}</p>
                <div class="alert-meta">
                    <span><b>Despachó</b>${escapeHtml(data.despachadoPor)}</span>
                    <span><b>Contacto</b>${escapeHtml(data.contacto || "N/A")}</span>
                    ${data.enviadoPor ? `<span><b>Cuenta</b>${escapeHtml(data.enviadoPor)}</span>` : ""}
                </div>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

function filtrar() {
    const tipo = document.getElementById("filtroTipo").value;
    const despachadoPor = document.getElementById("filtroDespachadoPor").value;
    const fechaDesde = document.getElementById("filtroFechaDesde").value;
    const fechaHasta = document.getElementById("filtroFechaHasta").value;

    let filtradas = todasLasAlertas.filter(a => {
        const fecha = new Date(a.timestamp);

        if (tipo && a.tipo !== tipo) return false;
        if (despachadoPor && a.despachadoPor !== despachadoPor) return false;
        if (fechaDesde && fecha < new Date(fechaDesde)) return false;
        if (fechaHasta) {
            const hasta = new Date(fechaHasta);
            hasta.setHours(23, 59, 59);
            if (fecha > hasta) return false;
        }

        return true;
    });

    renderAlertas(filtradas);
}

function limpiar() {
    document.getElementById("filtroTipo").value = "";
    document.getElementById("filtroDespachadoPor").value = "";
    document.getElementById("filtroFechaDesde").value = "";
    document.getElementById("filtroFechaHasta").value = "";
    renderAlertas(todasLasAlertas);
}

document.getElementById("filtrarBtn").addEventListener("click", filtrar);
document.getElementById("limpiarBtn").addEventListener("click", limpiar);

cargarAlertas();

