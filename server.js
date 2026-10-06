require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ Falta la variable de entorno JWT_SECRET. Configurala en .env / Render");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://alertasbomberoscolonba.com.ar",
      "https://www.alertasbomberoscolonba.com.ar",
      "https://alertascolonba.onrender.com",
      process.env.DEV_URL,
      "http://localhost:3000"
    ].filter(Boolean),
    methods: ["GET", "POST"]
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
  message: { success: false, message: "Demasiados intentos. Esperá 15 minutos." }
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Demasiados pedidos. Esperá 15 minutos." }
});

const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Demasiadas solicitudes. Probá más tarde." }
});

const EMAIL_RE = /^[^\s@\/<>"'`]+@[^\s@\/<>"'`]+\.[^\s@\/<>"'`]+$/;

// Evita que un error no manejado tire abajo el servidor en medio de una emergencia
process.on("unhandledRejection", (e) => {
  console.error("❌ Promesa rechazada sin manejar:", e);
});

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentAppVersion = packageJson.version;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ─── Autenticación ──────────────────────────────────────────────────────────
function autenticar(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Sesión expirada. Volvé a iniciar sesión." });
  }
  try {
    req.usuario = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Sesión expirada. Volvé a iniciar sesión." });
  }
}

// Devuelve los datos del usuario solo si sigue existiendo y está aprobado.
// Así un usuario eliminado/rechazado pierde acceso aunque su token no haya vencido.
async function cargarUsuarioActivo(usuario) {
  if (typeof usuario !== "string" || !usuario) return null;
  const doc = await db.collection("usuarios").doc(usuario).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return data.estado === "aprobado" ? data : null;
}

async function requiereAdmin(req, res, next) {
  try {
    const actual = await cargarUsuarioActivo(req.usuario && req.usuario.usuario);
    if (!actual || actual.rol !== "admin") {
      return res.status(403).json({ success: false, message: "No tenés permisos de administrador" });
    }
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Error al verificar permisos" });
  }
}

// Para enviar/editar alertas. Si Firestore no responde, no se bloquea la alerta:
// se confía en el rol del token (que igual está firmado y vence a las 12 h).
async function verificarDespachador(payload) {
  if (!payload) {
    return { ok: false, code: "AUTH", message: "Sesión expirada. Volvé a iniciar sesión." };
  }
  let rol = payload.rol;
  try {
    const actual = await cargarUsuarioActivo(payload.usuario);
    if (!actual) return { ok: false, code: "AUTH", message: "Tu usuario ya no está habilitado." };
    rol = actual.rol;
  } catch (e) {
    console.error("⚠️ No se pudo verificar el usuario en Firestore, se usa el token:", e);
  }
  if (!["admin", "despachador"].includes(rol)) {
    return { ok: false, code: "PERM", message: "Sin permisos para enviar alertas" };
  }
  return { ok: true };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Texto de una alerta: sin etiquetas HTML ni caracteres de control, y con largo máximo.
// Recorta en vez de rechazar para no bloquear nunca una alerta real.
function limpiarCampo(valor, max) {
  return String(valor ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function limpiarAlerta(data) {
  return {
    tipo: limpiarCampo(data.tipo, 100),
    direccion: limpiarCampo(data.direccion, 300).toUpperCase(),
    descripcion: limpiarCampo(data.descripcion, 1000).toUpperCase(),
    despachadoPor: limpiarCampo(data.despachadoPor, 100),
    contacto: limpiarCampo(data.contacto, 100),
  };
}

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

let lastAlert = null;
let alertTimeout = null;

app.post("/registro-usuario", registroLimiter, async (req, res) => {
  const { usuario, password, nombre, apellido } = req.body;
  if (!usuario || !password || !nombre || !apellido) {
    return res.status(400).json({ success: false, message: "Faltan datos obligatorios" });
  }
  if ([usuario, password, nombre, apellido].some(v => typeof v !== "string")) {
    return res.status(400).json({ success: false, message: "Datos inválidos" });
  }
  if (usuario.length > 100 || !EMAIL_RE.test(usuario)) {
    return res.status(400).json({ success: false, message: "Mail inválido" });
  }
  if (nombre.length > 60 || apellido.length > 60) {
    return res.status(400).json({ success: false, message: "Nombre o apellido demasiado largo" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 6 caracteres" });
  }
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (doc.exists) return res.status(400).json({ success: false, message: "El usuario ya existe" });

    const hash = await bcrypt.hash(password, 10);
    await db.collection("usuarios").doc(usuario).set({
      usuario, nombre, apellido,
      password: hash,
      rol: "despachador",
      estado: "pendiente"
    });

    try {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.ADMIN_EMAIL,
        subject: "🔔 Nueva solicitud de acceso - Bomberos Colón BA",
        html: `
          <h2>Nueva solicitud de acceso</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(nombre)} ${escapeHtml(apellido)}</p>
          <p><strong>Mail:</strong> ${escapeHtml(usuario)}</p>
          <a href="${process.env.APP_URL}/admin.html">Ir al panel</a>
        `
      });
      console.log("✅ Mail de notificación enviado");
    } catch (mailError) {
      console.error("❌ Error al enviar mail:", mailError);
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Error al registrar usuario" });
  }
});

app.post("/login-usuario", loginLimiter, async (req, res) => {
  const { usuario, password } = req.body;
  if (typeof usuario !== "string" || typeof password !== "string" || !usuario || !password) {
    return res.status(400).json({ success: false, message: "Completá usuario y contraseña" });
  }
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (!doc.exists) return res.status(401).json({ success: false, message: "Usuario incorrecto" });
    const data = doc.data();
    if (data.estado !== "aprobado") return res.status(403).json({ success: false, message: "Usuario pendiente de aprobación" });
    const match = await bcrypt.compare(password, data.password);
    if (!match) return res.status(401).json({ success: false, message: "Contraseña incorrecta" });

    const token = jwt.sign({ usuario: data.usuario, rol: data.rol }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ success: true, usuario: data.usuario, rol: data.rol, token });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/listar-usuarios", autenticar, requiereAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection("usuarios").get();
    const usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), password: "***" }));
    res.json(usuarios);
  } catch (e) {
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

app.post("/gestionar-usuario", autenticar, requiereAdmin, async (req, res) => {
  const { usuario, estado } = req.body;
  if (typeof usuario !== "string" || !usuario) {
    return res.status(400).json({ success: false, message: "Usuario inválido" });
  }
  if (!["pendiente", "aprobado", "rechazado"].includes(estado)) {
    return res.status(400).json({ success: false, message: "Estado inválido" });
  }
  try {
    await db.collection("usuarios").doc(usuario).update({ estado });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al gestionar usuario" });
  }
});

app.post("/cambiar-rol", autenticar, requiereAdmin, async (req, res) => {
  const { usuario, rol } = req.body;
  if (typeof usuario !== "string" || !usuario) {
    return res.status(400).json({ success: false, message: "Usuario inválido" });
  }
  if (!["admin", "despachador"].includes(rol)) {
    return res.status(400).json({ success: false, message: "Rol inválido" });
  }
  try {
    await db.collection("usuarios").doc(usuario).update({ rol });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al cambiar rol" });
  }
});

app.delete("/eliminar-usuario/:usuario", autenticar, requiereAdmin, async (req, res) => {
  const { usuario } = req.params;
  if (usuario === req.usuario.usuario) {
    return res.status(400).json({ success: false, message: "No podés eliminar tu propia cuenta" });
  }
  try {
    await db.collection("usuarios").doc(usuario).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error al eliminar usuario" });
  }
});

app.get("/ultima-alerta", autenticar, (req, res) => {
  res.json(lastAlert || null);
});

app.post("/editar-alerta", autenticar, async (req, res) => {
  try {
    const permiso = await verificarDespachador(req.usuario);
    if (!permiso.ok) {
      return res.status(permiso.code === "AUTH" ? 401 : 403).json({ success: false, message: permiso.message });
    }
    if (!lastAlert) return res.status(400).json({ success: false, message: "No hay alerta activa" });
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Datos inválidos" });
    }

    const cambios = limpiarAlerta(req.body);
    if (!cambios.tipo || !cambios.direccion) {
      return res.status(400).json({ success: false, message: "Faltan el tipo o la dirección" });
    }

    lastAlert = { ...lastAlert, ...cambios };

    try {
      const snapshot = await db.collection("alertas").orderBy("timestamp", "desc").limit(1).get();
      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update(cambios);
      }
    } catch (e) {
      console.error("❌ Error al actualizar alerta:", e);
    }

    io.emit("alertActualizada", lastAlert);
    res.json({ success: true });
  } catch (e) {
    console.error("❌ Error al editar alerta:", e);
    res.status(500).json({ success: false, message: "Error del servidor al editar la alerta" });
  }
});

async function guardarAlertaFirebase(alerta) {
  try {
    await db.collection("alertas").add({
      ...alerta,
      timestamp: new Date().toISOString()
    });
    console.log("✅ Alerta guardada en Firestore");
  } catch (e) {
    console.error("❌ Error al guardar en Firestore:", e);
  }
}

// Escapa los caracteres especiales del modo Markdown de Telegram
function escapeMarkdown(str) {
  return String(str ?? "").replace(/([_*`\[])/g, "\\$1");
}

async function enviarTelegram(alerta) {
  if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("ℹ️ Telegram desactivado (faltan TELEGRAM_TOKEN / TELEGRAM_CHAT_ID)");
    return;
  }

  const mensaje = `🚨 *NUEVA ALERTA* 🚨
*Tipo:* ${escapeMarkdown(alerta.tipo.toUpperCase())}
*Dirección:* ${escapeMarkdown(alerta.direccion)}
*Descripción:* ${escapeMarkdown(alerta.descripcion || "—")}
*Despachado por:* ${escapeMarkdown(alerta.despachadoPor)}
*Contacto:* ${escapeMarkdown(alerta.contacto || "—")}
*Hora:* ${escapeMarkdown(alerta.timestamp)}`;

  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: "Markdown"
    });
    console.log("✅ Mensaje de Telegram enviado");
  } catch (error) {
    console.error("❌ Error al enviar Telegram:", error.response?.data || error.message);
  }
}

// Contador de visores conectados
let visoresConectados = 0;

// El token es opcional: los visores se conectan sin login, pero solo
// un usuario autenticado puede enviar alertas.
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      socket.usuario = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // token inválido o vencido: se conecta como visor, sin permisos de envío
    }
  }
  next();
});

io.on("connection", async (socket) => {

  socket.on("registrarVisor", () => {
    if (socket.esVisor) return;
    socket.esVisor = true;
    visoresConectados++;
    io.emit("visoresCount", visoresConectados);
    console.log(`📺 Visor conectado. Total: ${visoresConectados}`);
  });

  socket.on("disconnect", () => {
    if (socket.esVisor) {
      visoresConectados--;
      if (visoresConectados < 0) visoresConectados = 0;
      io.emit("visoresCount", visoresConectados);
      console.log(`📺 Visor desconectado. Total: ${visoresConectados}`);
    }
  });

  if (lastAlert) socket.emit("alertExistente", lastAlert);
  socket.emit("visoresCount", visoresConectados);

  try {
    const snapshot = await db.collection("alertas").orderBy("timestamp", "desc").limit(20).get();
    const historial = snapshot.docs.map(doc => doc.data());
    socket.emit("history", historial);
  } catch (e) {
    console.error("❌ Error al cargar historial:", e);
  }

  // El cliente recibe la respuesta por "callback" (ack) para saber si la alerta salió de verdad
  socket.on("sendAlert", async (data, callback) => {
    const responder = typeof callback === "function" ? callback : () => {};
    try {
      const permiso = await verificarDespachador(socket.usuario);
      if (!permiso.ok) return responder(permiso);

      if (!data || typeof data !== "object") {
        return responder({ ok: false, code: "INVALID", message: "Datos de alerta inválidos" });
      }
      const limpio = limpiarAlerta(data);
      if (!limpio.tipo || !limpio.direccion) {
        return responder({ ok: false, code: "INVALID", message: "Faltan el tipo o la dirección" });
      }

      const now = new Date();
      const timestamp = now.toLocaleString("es-AR", {
        hour: "2-digit", minute: "2-digit",
        day: "2-digit", month: "2-digit", year: "numeric",
        timeZone: "America/Argentina/Buenos_Aires",
      });

      lastAlert = { ...limpio, enviadoPor: socket.usuario.usuario, timestamp };
      await guardarAlertaFirebase(lastAlert);
      enviarTelegram(lastAlert);
      io.emit("alert", lastAlert);
      responder({ ok: true });

      if (alertTimeout) clearTimeout(alertTimeout);
      alertTimeout = setTimeout(() => {
        lastAlert = null;
        io.emit("clearAlert");
      }, 30 * 60 * 1000);
    } catch (e) {
      console.error("❌ Error al enviar alerta:", e);
      return responder({ ok: false, code: "ERROR", message: "Error del servidor al enviar la alerta" });
    }

    try {
      const snapshot = await db.collection("alertas").orderBy("timestamp", "desc").limit(20).get();
      const historial = snapshot.docs.map(doc => doc.data());
      io.emit("history", historial);
    } catch (e) {
      console.error("❌ Error al actualizar historial:", e);
    }
  });

  socket.on("clearAlertManual", () => {
    if (!socket.usuario || socket.usuario.rol !== "admin") return;
    lastAlert = null;
    io.emit("clearAlert");
  });
});

app.post("/solicitar-reset", resetLimiter, async (req, res) => {
  const { usuario } = req.body;
  if (typeof usuario !== "string" || !usuario) {
    return res.status(400).json({ success: false, message: "Ingresá tu mail" });
  }
  try {
    const doc = await db.collection("usuarios").doc(usuario).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    // Token aleatorio seguro, guardado en Firestore para que sobreviva a reinicios del servidor
    const token = crypto.randomBytes(32).toString("hex");
    await db.collection("reset_tokens").doc(token).set({
      usuario,
      expira: Date.now() + 30 * 60 * 1000
    });

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

app.post("/reset-password", resetLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== "string" || typeof password !== "string" || !token || !password) {
    return res.status(400).json({ success: false, message: "Faltan datos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "La contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const ref = db.collection("reset_tokens").doc(token);
    const doc = await ref.get();
    if (!doc.exists) return res.status(400).json({ success: false, message: "Token inválido" });
    const data = doc.data();
    if (Date.now() > data.expira) {
      await ref.delete();
      return res.status(400).json({ success: false, message: "El link expiró" });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.collection("usuarios").doc(data.usuario).update({ password: hash });
    await ref.delete();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Error al resetear contraseña" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
