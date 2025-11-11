const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
require('dotenv').config();
const axios = require("axios");


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/check-password", (req, res) => {
  const { password } = req.body;
  if (password === process.env.SENDER_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});


let lastAlert = null;
let alertTimeout = null;
let alertHistory = []; // 🔥 Guardamos historial de alertas

io.on("connection", (socket) => {
  console.log("Nuevo visor conectado");

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

        console.log("✅ Mensaje de WhatsApp enviado correctamente");
      } catch (error) {
        console.error("❌ Error al enviar mensaje de WhatsApp:", error.response?.data || error.message);
      }
    }

  // Enviar última alerta activa y el historial
  if (lastAlert) socket.emit("alert", lastAlert);
  socket.emit("history", alertHistory);

  socket.on("sendAlert", (data) => {
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
    
    enviarWhatsApp(lastAlert);

    // Guardar en historial
    alertHistory.unshift(lastAlert);
    if (alertHistory.length > 20) alertHistory.pop();

    // Enviar a todos los visores
    io.emit("alert", lastAlert);
    io.emit("history", alertHistory);

    // Limpiar automáticamente después de 30 minutos
    if (alertTimeout) clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => {
      lastAlert = null;
      io.emit("clearAlert");
    }, 10 * 60 * 1000);
  });

  socket.on("clearAlertManual", () => {
    lastAlert = null;
    io.emit("clearAlert");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));



