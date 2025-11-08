// server.js
// Servidor Express + Socket.IO para cuartel-alertas
// Requiere: express, cors, socket.io
// npm install express cors socket.io

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// TOKEN: configurá en Render/entorno: API_TOKEN=tu_token_seguro
const API_TOKEN = process.env.API_TOKEN || 'cuartel123';

// Estado actual y timeout para auto-limpieza
let currentAlert = null;
let clearTimeoutHandle = null;
const AUTO_CLEAR_MS = 30 * 60 * 1000; // 30 minutos

function scheduleAutoClear() {
  if (clearTimeoutHandle) clearTimeout(clearTimeoutHandle);
  clearTimeoutHandle = setTimeout(() => {
    currentAlert = null;
    io.emit('clear');
    console.log('⏲️ Alerta limpiada automáticamente tras 30 minutos');
    clearTimeoutHandle = null;
  }, AUTO_CLEAR_MS);
}

function clearAlertNow() {
  if (clearTimeoutHandle) {
    clearTimeout(clearTimeoutHandle);
    clearTimeoutHandle = null;
  }
  currentAlert = null;
  io.emit('clear');
}

// Endpoint para enviar siniestros desde el celular (externo)
app.post('/api/send', (req, res) => {
  const tokenHeader = req.headers['x-api-token'] || req.query.token;
  if (tokenHeader !== API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const msg = req.body || {};
  // Validaciones mínimas
  if (!msg.tipo) return res.status(400).json({ error: 'Falta campo "tipo"' });
  if (!msg.prioridad) msg.prioridad = 'Nada';
  msg.id = msg.id || 'siniestro-' + Date.now();
  msg.receivedAt = new Date().toISOString();

  // Guardar estado actual y emitir a visores
  currentAlert = msg;
  io.emit('siniestro', msg);
  console.log('📢 Emitido siniestro:', msg.tipo, '-', msg.prioridad, '-', msg.direccion || '');

  // Programar auto-clear a 30 minutos
  scheduleAutoClear();

  return res.json({ ok: true, sent: msg });
});

// Endpoint opcional para limpiar manualmente (por ejemplo desde admin)
app.post('/api/clear', (req, res) => {
  const tokenHeader = req.headers['x-api-token'] || req.query.token;
  if (tokenHeader !== API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  clearAlertNow();
  console.log('🧹 Alerta limpiada manualmente');
  return res.json({ ok: true });
});

// Cuando un visor se conecta le podemos enviar el estado actual (si existe)
io.on('connection', socket => {
  console.log('🔌 Visor conectado:', socket.id);
  if (currentAlert) {
    socket.emit('siniestro', currentAlert);
  }
  socket.on('disconnect', () => {
    console.log('❌ Visor desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚒 Servidor corriendo en puerto ${PORT}`));

