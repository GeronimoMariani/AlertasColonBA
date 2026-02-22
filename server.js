const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
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

app.get("/privacidad", (req, res) => {
  res.send(`
    <h1>Política de Privacidad</h1>
    <p>Este sistema es de uso exclusivo del Cuartel de Bomberos Voluntarios de Colón BA.</p>
    <p>Los datos recopilados (nombre, apellido, correo electrónico) se usan únicamente para autenticar a los despachadores autorizados.</p>
    <p>No se comparte información con terceros.</p>
  `);
});

app.get("/eliminar-datos", (req, res) => {
  res.send(`
    <h1>Eliminación de datos</h1>
    <p>Para solicitar la eliminación de tus datos del sistema de alertas del Cuartel de Bomberos Voluntarios de Colón BA, enviá un correo a info@bomberosdecolon.com.ar indicando tu nombre de usuario.</p>
    <p>Tu cuenta será eliminada en un plazo de 48 horas.</p>
  `);
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

// Registro de nuevo usuario (queda pendiente)
app.post("/registro-usuario", async (req, res) => {
  console.log("Body recibido:", req.body);
  const { usuario, password, nombre, apellido } = req.body;
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (doc.exists) return res.status(400).json({ success: false, message: "El usuario ya existe" });
    
    const hash = await bcrypt.hash(password, 10);
    await db.collection("usuarios").doc(usuario).set({
    usuario,
    nombre,
    apellido,
    password: hash,
    rol: "despachador",
    estado: "pendiente"
  });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al registrar usuario" });
  }
});

// Login de usuario despachador
app.post("/login-usuario", loginLimiter, async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (!doc.exists) return res.status(401).json({ success: false, message: "Usuario incorrecto" });
    const data = doc.data();
    if (data.estado !== "aprobado") return res.status(403).json({ success: false, message: "Usuario pendiente de aprobación" });
    const match = await bcrypt.compare(password, data.password);
    if (!match) return res.status(401).json({ success: false, message: "Contraseña incorrecta" });
    res.json({ success: true, usuario: data.usuario, rol: data.rol });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// Listar usuarios (para el panel admin)
app.get("/listar-usuarios", async (req, res) => {
  try {
    const snapshot = await db.collection("usuarios").get();
    const usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), password: "***" }));
    res.json(usuarios);
  } catch (e) {
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

// Aprobar o rechazar usuario
app.post("/gestionar-usuario", async (req, res) => {
  const { usuario, estado } = req.body; // estado: "aprobado" o "rechazado"
  try {
    await db.collection("usuarios").doc(usuario).update({ estado });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al gestionar usuario" });
  }
});

// Eliminar usuario
app.delete("/eliminar-usuario/:usuario", async (req, res) => {
  const { usuario } = req.params;
  try {
    await db.collection("usuarios").doc(usuario).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al eliminar usuario" });
  }
});

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
  const numeros = process.env.WHATSAPP_NUMEROS.split(",");
  
  const mensaje = `🚨 *NUEVA ALERTA* 🚨
Tipo: ${alerta.tipo.toUpperCase()}
Dirección: ${alerta.direccion}
Descripción: ${alerta.descripcion}
Despachado por: ${alerta.despachadoPor}
Contacto: ${alerta.contacto}
Hora: ${alerta.timestamp}`;

  for (const numero of numeros) {
    try {
      await axios.post(
        `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: numero.trim(),
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
      console.log(`✅ WhatsApp enviado a ${numero}`);
    } catch (error) {
      console.error(`❌ Error al enviar a ${numero}:`, error.response?.data || error.message);
    }
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

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Almacena tokens temporales de reseteo
const resetTokens = {};

// Solicitar reseteo de contraseña
app.post("/solicitar-reset", async (req, res) => {
  const { usuario } = req.body;
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    const token = Math.random().toString(36).substring(2, 15);
    resetTokens[token] = { usuario, expira: Date.now() + 30 * 60 * 1000 }; // 30 minutos

    const appUrl = process.env.NODE_ENV === "development" 
    ? "http://localhost:3000" 
    : process.env.APP_URL;
    const link = `${appUrl}/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: usuario,
      subject: "Reseteo de contraseña - Bomberos Colón BA",
      html: `
        <h2>Reseteo de contraseña</h2>
        <p>Hacé clic en el siguiente link para resetear tu contraseña. El link expira en 30 minutos.</p>
        <a href="${link}">${link}</a>
      `
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Error al enviar el mail" });
  }
});

// Resetear contraseña con token
app.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  const data = resetTokens[token];

  if (!data) return res.status(400).json({ success: false, message: "Token inválido" });
  if (Date.now() > data.expira) {
    delete resetTokens[token];
    return res.status(400).json({ success: false, message: "El link expiró" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.collection("usuarios").doc(data.usuario).update({ password: hash });
    delete resetTokens[token];
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al resetear contraseña" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));



