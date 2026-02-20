const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const admin = require("firebase-admin");
require('dotenv').config();

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
  message: { success: false, message: "Demasiados intentos. Esperá 15 minutos." }
});

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentAppVersion = packageJson.version;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/api/version', (req, res) => {
  res.json({ version: currentAppVersion });
});

app.post("/check-password", loginLimiter, (req, res) => {
  const { password } = req.body;
  if (password === process.env.SENDER_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

let lastAlert = null;
let alertTimeout = null;

async function guardarAlertaFirebase(alerta) {
  try {
    const alertasRef = db.collection("alertas");
    await alertasRef.add({
      ...alerta,
      timestamp: new Date().toISOString() // <-- siempre ISO para compatibilidad
    });
    console.log("✅ Alerta guardada en Firestore");

    // Mantener máximo 20 alertas
    const snapshot = await alertasRef.orderBy("timestamp", "desc").get();
    if (snapshot.size > 20) {
      const excedentes = snapshot.docs.slice(20);
      const batch = db.batch();
      excedentes.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log("♻️ Alertas antiguas eliminadas");
    }
  } catch (e) {
    console.error("❌ Error al guardar en Firestore:", e);
  }
}

async function enviarWhatsApp(alerta) {
  try {
    const mensaje = `🚨 *NUEVA ALERTA* 🚨
Tipo: ${alerta.tipo.toUpperCase()}
Dirección: ${alerta.direccion}
Descripción: ${alerta.descripcion}
Despachado por: ${alerta.despachadoPor}
Contacto: ${alerta.contacto}
Hora: ${alerta.timestamp}`;

    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: process.env.WHATSAPP_NUMBER_DESTINO,
        type: "text",
        text: { body: mensaje },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Mensaje de WhatsApp enviado");
  } catch (error) {
    console.error("❌ Error al enviar WhatsApp:", error.response?.data || error.message);
  }
}

io.on("connection", async (socket) => {
  console.log("Nuevo visor conectado");

  // Enviar última alerta activa
  if (lastAlert) socket.emit("alert", lastAlert);

  // Enviar historial desde Firebase
  try {
    const snapshot = await db.collection("alertas").orderBy("timestamp", "desc").limit(20).get();
    const historial = snapshot.docs.map(doc => doc.data());
    socket.emit("history", historial);
  } catch (e) {
    console.error("❌ Error al cargar historial:", e);
  }

  socket.on("sendAlert", async (data) => {
    console.log("Nueva alerta recibida:", data);

    const now = new Date();
    const timestamp = now.toLocaleString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    lastAlert = { ...data, timestamp };

    // Guardar en Firebase (fuente única de verdad)
    await guardarAlertaFirebase(lastAlert);

    // Notificar a todos en tiempo real
    io.emit("alert", lastAlert);

    // Actualizar historial en todos los visores
    const snapshot = await db.collection("alertas").orderBy("timestamp", "desc").limit(20).get();
    const historial = snapshot.docs.map(doc => doc.data());
    io.emit("history", historial);

    enviarWhatsApp(lastAlert);

    if (alertTimeout) clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => {
      lastAlert = null;
      io.emit("clearAlert");
    }, 30 * 60 * 1000);
  });

  socket.on("clearAlertManual", () => {
    lastAlert = null;
    io.emit("clearAlert");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));



