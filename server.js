const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

let lastAlert = null;
let alertTimeout = null;

io.on("connection", (socket) => {
  console.log("Nuevo visor conectado");

  if (lastAlert) {
    socket.emit("alert", lastAlert);
  }

  socket.on("sendAlert", (data) => {
    console.log("Nueva alerta recibida:", data);

    lastAlert = {
      ...data,
      timestamp: new Date().toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    io.emit("alert", lastAlert);

    if (alertTimeout) clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => {
      lastAlert = null;
      io.emit("clearAlert");
    }, 30 * 60 * 1000); // 30 minutos
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));


