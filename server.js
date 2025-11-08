const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Token de seguridad para enviar alertas
const API_TOKEN = process.env.API_TOKEN || 'bomberosba1956';

// Endpoint que recibe el siniestro desde el celular
app.post('/api/send', (req, res) => {
  const token = req.headers['x-api-token'] || req.query.token;
  if (token !== API_TOKEN) return res.status(401).json({ error: 'Token inválido' });

  const msg = req.body;
  if (!msg.tipo) return res.status(400).json({ error: 'Faltan datos' });

  msg.receivedAt = new Date().toISOString();
  io.emit('siniestro', msg);
  console.log('📢 Nuevo siniestro:', msg.tipo, '-', msg.direccion || '');
  res.json({ ok: true });
});

io.on('connection', socket => {
  console.log('🖥️ Nuevo visor conectado:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚒 Servidor corriendo en puerto ${PORT}`));
