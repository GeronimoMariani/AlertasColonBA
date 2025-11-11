import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } 
  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

export async function guardarAlertaFirebase(data) {
  try {
    await addDoc(collection(db, "alertas"), {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log("✅ Alerta guardada en Firestore");
  } catch (e) {
    console.error("Error al guardar alerta:", e);
  }
}

export function escucharHistorial() {
  const contenedor = document.getElementById("historial");
  const q = query(collection(db, "alertas"), orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    contenedor.innerHTML = "";
    snapshot.forEach((doc) => {
      const a = doc.data();
      const fecha = new Date(a.timestamp);
      const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const item = document.createElement("div");
      item.innerHTML = `<strong style="color:red;">${a.tipo.toUpperCase()}</strong> — ${a.direccion} (${hora})`;
      item.style.marginBottom = "6px";
      contenedor.appendChild(item);
    });
  });
}
