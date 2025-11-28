const path = require("path");
// Asegúrate de importar 'Menu' y 'app' aquí.
const { app, BrowserWindow, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");

// Opcional: Instalar 'electron-log' (npm install electron-log) para mejor depuración.
// const log = require("electron-log");

let mainWindow;
let serverProcess;

// Opcional: Configurar el logger
// autoUpdater.logger = log;
// autoUpdater.logger.transports.file.level = "info";

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

// Función para crear y establecer el menú personalizado
function setupMenu() {
    const template = [
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Verificar Actualizaciones',
                    click: () => {
                        autoUpdater.checkForUpdatesAndNotify();
                        console.log("Iniciando verificación manual de actualizaciones...");
                    }
                },
                { type: 'separator' },
                {
                    label: `Acerca de (v${app.getVersion()})`,
                    enabled: false // Muestra la versión actual en el menú pero desactiva el clic
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
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

// 🚀 Inicialización (Modificado para incluir setupMenu)
app.whenReady().then(() => {
  setupMenu(); // <-- Se llama aquí para crear el menú
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

