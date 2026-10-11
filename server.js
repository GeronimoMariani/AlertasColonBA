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

// "bombero" solo recibe alertas en la app del celular; no puede enviarlas.
const ROLES = ["admin", "despachador", "bombero"];

// La app del celular recibe un token largo (para no pedir login seguido) pero
// limitado: con scope "app" solo sirve para las rutas /app/*.
const APP_TOKEN_SCOPE = "app";
const APP_TOKEN_DURACION = "180d";

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
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Un token de la app del celular no habilita el panel web ni la administración
    if (payload.scope === APP_TOKEN_SCOPE) throw new Error("token de app");
    req.usuario = payload;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Sesión expirada. Volvé a iniciar sesión." });
  }
}

// Para las rutas de la app del celular: token con scope "app" y usuario todavía aprobado.
async function autenticarApp(req, res, next) {
  const header = req.headers.authorization;
  let payload;
  try {
    if (!header || !header.startsWith("Bearer ")) throw new Error("sin token");
    payload = jwt.verify(header.slice(7), JWT_SECRET);
    if (payload.scope !== APP_TOKEN_SCOPE) throw new Error("token sin scope de app");
  } catch (e) {
    return res.status(401).json({ success: false, message: "Sesión expirada. Volvé a iniciar sesión." });
  }
  try {
    const actual = await cargarUsuarioActivo(payload.usuario);
    if (!actual) return res.status(401).json({ success: false, message: "Tu usuario ya no está habilitado." });
    req.usuario = payload;
    req.usuarioActivo = actual;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Error al verificar el usuario" });
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
  // La app del celular pide el rol "bombero" (solo recibir); la web, "despachador".
  // Igual queda pendiente hasta que un admin la apruebe.
  const rolPedido = req.body.rol === "bombero" ? "bombero" : "despachador";
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
      rol: rolPedido,
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
          <p><strong>Rol pedido:</strong> ${escapeHtml(rolPedido)}</p>
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

// Valida usuario y contraseña. Devuelve { data } si son correctos, o { status, message } si no.
async function validarCredenciales(usuario, password) {
  if (typeof usuario !== "string" || typeof password !== "string" || !usuario || !password) {
    return { status: 400, message: "Completá usuario y contraseña" };
  }
  const doc = await db.collection("usuarios").doc(usuario).get();
  if (!doc.exists) return { status: 401, message: "Usuario incorrecto" };
  const data = doc.data();
  if (data.estado !== "aprobado") return { status: 403, message: "Usuario pendiente de aprobación" };
  const match = await bcrypt.compare(password, data.password);
  if (!match) return { status: 401, message: "Contraseña incorrecta" };
  return { data };
}

app.post("/login-usuario", loginLimiter, async (req, res) => {
  try {
    const { data, status, message } = await validarCredenciales(req.body.usuario, req.body.password);
    if (!data) return res.status(status).json({ success: false, message });

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
  if (!ROLES.includes(rol)) {
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
      await db.collection("alertas").doc(lastAlert.id).update(cambios);
    } catch (e) {
      console.error("❌ Error al actualizar alerta:", e);
    }

    io.emit("alertActualizada", lastAlert);
    enviarPush(lastAlert, { actualizada: true });
    res.json({ success: true });
  } catch (e) {
    console.error("❌ Error al editar alerta:", e);
    res.status(500).json({ success: false, message: "Error del servidor al editar la alerta" });
  }
});

async function guardarAlertaFirebase(alerta) {
  try {
    await db.collection("alertas").doc(alerta.id).set({
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

// ─── Notificaciones push a la app del celular ───────────────────────────────
// Los nombres de canal/sonido tienen que coincidir con los que crea la app (app-movil).
const PUSH_CANAL_ALERTAS = "alertas_v1";
const PUSH_CANAL_ACTUALIZACIONES = "actualizaciones_v1";
const PUSH_SONIDO = "sirena";
// Activar solo cuando Apple apruebe el permiso de Critical Alerts para la app de iPhone
const IOS_ALERTAS_CRITICAS = process.env.IOS_CRITICAL_ALERTS === "true";
const PUSH_VIGENCIA_MS = 30 * 60 * 1000; // igual que la duración de la alerta activa

// Errores de FCM que indican que el token ya no sirve (app desinstalada, etc.)
const TOKENS_INVALIDOS = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
];

function idDispositivo(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function mensajePush(token, alerta, actualizada) {
  const titulo = actualizada
    ? `✏️ ALERTA ACTUALIZADA: ${alerta.tipo.toUpperCase()}`
    : `🚨 ${alerta.tipo.toUpperCase()}`;
  const cuerpo = alerta.descripcion ? `${alerta.direccion} — ${alerta.descripcion}` : alerta.direccion;

  let sonidoIos = actualizada ? "default" : `${PUSH_SONIDO}.wav`;
  if (!actualizada && IOS_ALERTAS_CRITICAS) {
    sonidoIos = { critical: true, name: `${PUSH_SONIDO}.wav`, volume: 1.0 };
  }

  return {
    token,
    notification: { title: titulo, body: cuerpo },
    data: { alertaId: alerta.id, evento: actualizada ? "actualizada" : "nueva" },
    android: {
      priority: "high",
      ttl: PUSH_VIGENCIA_MS,
      notification: {
        channelId: actualizada ? PUSH_CANAL_ACTUALIZACIONES : PUSH_CANAL_ALERTAS,
        sound: actualizada ? "default" : PUSH_SONIDO,
        tag: alerta.id, // la actualización reemplaza a la notificación original
        priority: "max",
        visibility: "public",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-expiration": String(Math.floor((Date.now() + PUSH_VIGENCIA_MS) / 1000)),
      },
      payload: {
        aps: {
          sound: sonidoIos,
          "interruption-level": !actualizada && IOS_ALERTAS_CRITICAS ? "critical" : "time-sensitive",
        },
      },
    },
  };
}

// Manda la alerta a todos los celulares registrados de usuarios aprobados.
// Nunca tira error: un problema acá no puede frenar el resto del despacho.
async function enviarPush(alerta, { actualizada = false } = {}) {
  try {
    const snapshot = await db.collection("dispositivos").get();
    let dispositivos = snapshot.docs.map(doc => ({ ref: doc.ref, ...doc.data() }));

    // Se descartan los de usuarios eliminados o rechazados. Si esta consulta falla,
    // se manda igual a todos: es preferible de más que de menos en una emergencia.
    try {
      const aprobados = await db.collection("usuarios").where("estado", "==", "aprobado").get();
      const habilitados = new Set(aprobados.docs.map(doc => doc.id));
      dispositivos = dispositivos.filter(d => habilitados.has(d.usuario));
    } catch (e) {
      console.error("⚠️ No se pudo filtrar usuarios aprobados, se envía a todos los dispositivos:", e);
    }

    if (dispositivos.length === 0) {
      console.log("ℹ️ No hay celulares registrados para push");
      return;
    }

    const resultados = await Promise.allSettled(
      dispositivos.map(d => admin.messaging().send(mensajePush(d.token, alerta, actualizada)))
    );

    let enviados = 0;
    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        enviados++;
        return;
      }
      const code = r.reason && r.reason.code;
      if (TOKENS_INVALIDOS.includes(code)) {
        dispositivos[i].ref.delete().catch(() => {});
      } else {
        console.error(`❌ Push fallido a ${dispositivos[i].usuario}:`, code || r.reason);
      }
    });
    console.log(`✅ Push enviado a ${enviados}/${dispositivos.length} celulares`);
  } catch (e) {
    console.error("❌ Error al enviar push:", e);
  }
}

// ─── Asistencia (Asisto / No asisto) de la alerta activa ────────────────────
// usuario → { nombre, respuesta: "asisto" | "no_asisto", hora }
let respuestas = new Map();

function resumenAsistencia() {
  const lista = [...respuestas.values()];
  return {
    alertaId: lastAlert ? lastAlert.id : null,
    asisten: lista.filter(r => r.respuesta === "asisto").map(({ nombre, hora }) => ({ nombre, hora })),
    noAsisten: lista.filter(r => r.respuesta === "no_asisto").map(({ nombre, hora }) => ({ nombre, hora })),
  };
}

function limpiarAlertaActiva() {
  lastAlert = null;
  respuestas = new Map();
  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = null;
  io.emit("clearAlert");
}

// Contador de visores conectados
let visoresConectados = 0;

// El token es opcional: los visores se conectan sin login, pero solo
// un usuario autenticado puede enviar alertas.
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      // El token de la app del celular no habilita a enviar alertas
      if (payload.scope !== APP_TOKEN_SCOPE) socket.usuario = payload;
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

  if (lastAlert) {
    socket.emit("alertExistente", lastAlert);
    socket.emit("asistencia", resumenAsistencia());
  }
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

      lastAlert = { id: crypto.randomUUID(), ...limpio, enviadoPor: socket.usuario.usuario, timestamp };
      respuestas = new Map();
      await guardarAlertaFirebase(lastAlert);
      enviarTelegram(lastAlert);
      enviarPush(lastAlert);
      io.emit("alert", lastAlert);
      io.emit("asistencia", resumenAsistencia());
      responder({ ok: true });

      if (alertTimeout) clearTimeout(alertTimeout);
      alertTimeout = setTimeout(limpiarAlertaActiva, 30 * 60 * 1000);
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
    limpiarAlertaActiva();
  });
});

// ─── Rutas de la app del celular ────────────────────────────────────────────
app.post("/app/login", loginLimiter, async (req, res) => {
  try {
    const { data, status, message } = await validarCredenciales(req.body.usuario, req.body.password);
    if (!data) return res.status(status).json({ success: false, message });

    const token = jwt.sign(
      { usuario: data.usuario, rol: data.rol, scope: APP_TOKEN_SCOPE },
      JWT_SECRET,
      { expiresIn: APP_TOKEN_DURACION }
    );
    res.json({ success: true, usuario: data.usuario, nombre: data.nombre, apellido: data.apellido, rol: data.rol, token });
  } catch (e) {
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// Registra (o actualiza) el token de push del celular del usuario
app.post("/app/dispositivo", autenticarApp, async (req, res) => {
  const { token, plataforma } = req.body;
  if (typeof token !== "string" || !token || token.length > 4096) {
    return res.status(400).json({ success: false, message: "Token de dispositivo inválido" });
  }
  if (!["android", "ios"].includes(plataforma)) {
    return res.status(400).json({ success: false, message: "Plataforma inválida" });
  }
  try {
    await db.collection("dispositivos").doc(idDispositivo(token)).set({
      token,
      plataforma,
      usuario: req.usuario.usuario,
      actualizado: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error("❌ Error al registrar dispositivo:", e);
    res.status(500).json({ success: false, message: "Error al registrar el celular" });
  }
});

// Al cerrar sesión en la app: el celular deja de recibir alertas
app.post("/app/dispositivo/baja", autenticarApp, async (req, res) => {
  const { token } = req.body;
  if (typeof token !== "string" || !token) {
    return res.status(400).json({ success: false, message: "Token de dispositivo inválido" });
  }
  try {
    const ref = db.collection("dispositivos").doc(idDispositivo(token));
    const doc = await ref.get();
    if (doc.exists && doc.data().usuario === req.usuario.usuario) await ref.delete();
    res.json({ success: true });
  } catch (e) {
    console.error("❌ Error al dar de baja dispositivo:", e);
    res.status(500).json({ success: false, message: "Error al dar de baja el celular" });
  }
});

app.get("/app/estado", autenticarApp, (req, res) => {
  const mia = respuestas.get(req.usuario.usuario);
  res.json({
    success: true,
    alerta: lastAlert,
    asistencia: lastAlert ? resumenAsistencia() : null,
    miRespuesta: mia ? mia.respuesta : null,
  });
});

app.post("/app/responder", autenticarApp, async (req, res) => {
  const { alertaId, respuesta } = req.body;
  if (!["asisto", "no_asisto"].includes(respuesta)) {
    return res.status(400).json({ success: false, message: "Respuesta inválida" });
  }
  if (!lastAlert || alertaId !== lastAlert.id) {
    return res.status(409).json({ success: false, message: "Esa alerta ya no está activa" });
  }

  const u = req.usuarioActivo;
  const registro = {
    nombre: `${u.nombre || ""} ${u.apellido || ""}`.trim() || u.usuario,
    respuesta,
    hora: new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
  respuestas.set(req.usuario.usuario, registro);
  io.emit("asistencia", resumenAsistencia());

  try {
    await db.collection("alertas").doc(alertaId).collection("respuestas").doc(req.usuario.usuario).set({
      ...registro,
      usuario: req.usuario.usuario,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("❌ Error al guardar respuesta:", e);
  }

  res.json({ success: true, miRespuesta: respuesta, asistencia: resumenAsistencia() });
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
