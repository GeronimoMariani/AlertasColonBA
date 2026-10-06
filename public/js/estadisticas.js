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

async function cargarEstadisticas() {
    try {
        const q = query(collection(db, "alertas"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        const alertas = snapshot.docs.map(doc => doc.data());

        // Total de alertas
        document.getElementById("totalAlertas").textContent = alertas.length;

        // Tipo más frecuente
        const conteoTipos = {};
        alertas.forEach(a => {
            conteoTipos[a.tipo] = (conteoTipos[a.tipo] || 0) + 1;
        });
        const tiposOrdenados = Object.entries(conteoTipos).sort((a, b) => b[1] - a[1]);
        const tipoFrecuente = tiposOrdenados[0];
        document.getElementById("tipoFrecuente").textContent = tipoFrecuente ? tipoFrecuente[0] : "—";
        document.getElementById("tipoFrecuenteDetalle").textContent = tipoFrecuente
            ? `${tipoFrecuente[1]} alertas · ${Math.round((tipoFrecuente[1] / alertas.length) * 100)}%`
            : "";

        // Alertas por mes (clave "AAAA-MM" en hora de Buenos Aires)
        const conteoMes = {};
        alertas.forEach(a => {
            const clave = claveMes(new Date(a.timestamp));
            conteoMes[clave] = (conteoMes[clave] || 0) + 1;
        });

        // Últimos 12 meses, incluyendo los que no tuvieron alertas
        const ahora = new Date();
        const claveActual = claveMes(ahora);
        const [anioActual, mesActual] = claveActual.split("-").map(Number);
        const meses = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(anioActual, mesActual - 1 - i, 1);
            const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            meses.push({
                clave,
                corto: d.toLocaleString("es-AR", { month: "short" }).replace(".", "").slice(0, 3),
                largo: d.toLocaleString("es-AR", { month: "long", year: "numeric" }),
                valor: conteoMes[clave] || 0,
            });
        }

        document.getElementById("alertasMes").textContent = conteoMes[claveActual] || 0;
        document.getElementById("mesActual").textContent = meses[meses.length - 1].largo;

        renderColumnas("graficoMes", meses, claveActual);

        // Alertas por tipo
        renderBarras("graficoTipos", Object.fromEntries(tiposOrdenados));

    } catch (error) {
        console.error(error);
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

function claveMes(fecha) {
    const partes = new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires"
    }).formatToParts(fecha);
    const anio = partes.find(p => p.type === "year").value;
    const mes = partes.find(p => p.type === "month").value;
    return `${anio}-${mes}`;
}

function renderColumnas(containerId, meses, claveActual) {
    const contenedor = document.getElementById(containerId);
    const max = Math.max(...meses.map(m => m.valor), 1);

    contenedor.innerHTML = `
        <div class="columnas">
            ${meses.map(m => `
                <div class="columna ${m.clave === claveActual ? "actual" : ""}"
                     style="height: ${(m.valor / max) * 100}%" title="${escapeHtml(m.largo)}: ${m.valor}">
                    <span>${m.valor}</span>
                </div>
            `).join("")}
        </div>
        <div class="columnas-labels">
            ${meses.map(m => `<span>${escapeHtml(m.corto)}</span>`).join("")}
        </div>
    `;
}

function renderBarras(containerId, datos) {
    const contenedor = document.getElementById(containerId);
    const max = Math.max(...Object.values(datos), 1);

    contenedor.innerHTML = Object.entries(datos).map(([label, valor]) => `
        <div class="barra-row">
            <span class="barra-label">${escapeHtml(label)}</span>
            <div class="barra-wrap">
                <div class="barra" style="width: ${(valor / max) * 100}%"></div>
            </div>
            <span class="barra-valor">${valor}</span>
        </div>
    `).join("");
}

cargarEstadisticas();