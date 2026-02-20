const path = require("path");
const { app, BrowserWindow, Menu, ipcMain } = require("electron"); // Importamos Menu, ipcMain
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

// Opcional: Instalar 'electron-log' (npm install electron-log) para mejor depuración.
const log = require("electron-log");
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

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
      preload: path.join(__dirname, 'preload.js') // <-- Enlaza el preload script
    },
  });

  // Cargar la interfaz principal (servida por Express)
  mainWindow.loadURL("https://alertascolonba.onrender.com/");

  // mainWindow.webContents.openDevTools(); 
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Función para crear y establecer el menú personalizado (con info de versión)
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
                    enabled: false 
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 🚀 Iniciar el servidor Node (server.js)
function startServer() {
  // Asumimos que no necesitas ejecutar el server.js localmente si la URL de render.com está activa
  console.log("Usando URL remota: https://alertascolonba.onrender.com");
  // Si aún necesitas ejecutar el servidor local, descomenta las siguientes líneas:

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
  setupMenu();
  startServer();
  setTimeout(createWindow, 2000); 
  autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});


