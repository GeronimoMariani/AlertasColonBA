const path = require("path");
const { app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

// 🧠 Auto-updater configuración
autoUpdater.autoDownload = true;

autoUpdater.on("update-available", () => {
  console.log("🚀 Nueva actualización disponible. Descargando...");
});

autoUpdater.on("update-downloaded", () => {
  console.log("✅ Actualización descargada. Instalando...");
  autoUpdater.quitAndInstall();
});

autoUpdater.on("error", (err) => {
  console.error("❌ Error en autoUpdater:", err);
});

// ⚙️ Crear ventana principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Cargar la interfaz principal
  mainWindow.loadURL("https://alertascolonba.onrender.com");

  // mainWindow.webContents.openDevTools(); // ← activar si querés depurar
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 🚀 Iniciar el servidor Node (server.js)
function startServer() {
  const serverPath = path.join(__dirname, "server.js");
  console.log("🟢 Iniciando servidor:", serverPath);

  serverProcess = spawn("node", [serverPath], {
    stdio: "inherit",
    shell: true,
  });

  serverProcess.on("close", (code) => {
    console.log(`🔴 Servidor finalizó con código: ${code}`);
  });
}

// 🔄 Cierre limpio del servidor al salir
app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// 🚀 Inicialización
app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 2000); // esperamos que el server arranque
  autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
