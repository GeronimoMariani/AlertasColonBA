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
        const tipoFrecuente = Object.entries(conteoTipos).sort((a, b) => b[1] - a[1])[0];
        document.getElementById("tipoFrecuente").textContent = tipoFrecuente
            ? `${tipoFrecuente[0]} (${tipoFrecuente[1]})`
            : "—";

        // Alertas por mes
        const conteoMes = {};
        alertas.forEach(a => {
            const fecha = new Date(a.timestamp);
            const mes = fecha.toLocaleString("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
            conteoMes[mes] = (conteoMes[mes] || 0) + 1;
        });
        renderBarras("graficoMes", conteoMes);

        // Alertas por tipo
        renderBarras("graficoTipos", conteoTipos);

    } catch (error) {
        console.error(error);
    }
}

function renderBarras(containerId, datos) {
    const contenedor = document.getElementById(containerId);
    const max = Math.max(...Object.values(datos));

    contenedor.innerHTML = Object.entries(datos).map(([label, valor]) => `
        <div class="barra-row">
            <span class="barra-label">${label}</span>
            <div class="barra-wrap">
                <div class="barra" style="width: ${(valor / max) * 100}%"></div>
            </div>
            <span class="barra-valor">${valor}</span>
        </div>
    `).join("");
}

cargarEstadisticas();