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

async function cargarAlertas() {
    try {
        const q = query(collection(db, "alertas"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            contenedor.innerHTML = "<p>No hay alertas registradas.</p>";
            return;
        }

        contenedor.innerHTML = "";
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const card = document.createElement("div");
            card.className = "alert-card";

            const timestampDate = new Date(data.timestamp?.toDate?.() || data.timestamp);
            const formattedDate = timestampDate.toLocaleString("es-AR", {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZone: "America/Argentina/Buenos_Aires"
            });

            card.innerHTML = `
                <div class="alert-header">
                    <span>🚨 ${data.tipo}</span>
                    <span>${formattedDate}</span>
                </div>
                <div class="alert-body">
                    <p><strong>Dirección:</strong> ${data.direccion}</p>
                    <p><strong>Descripción:</strong> ${data.descripcion}</p>
                    <p><strong>Despachado por:</strong> ${data.despachadoPor}</p>
                    <p><strong>Contacto:</strong> ${data.contacto || "N/A"}</p>
                    ${data.enviadoPor ? `<p><strong>Cuenta que envió:</strong> ${data.enviadoPor}</p>` : ""}
                </div>
            `;
            contenedor.appendChild(card);
        });
    } catch (error) {
        console.error(error);
        contenedor.innerHTML = "<p>Error al cargar las alertas.</p>";
    }
}

cargarAlertas();

