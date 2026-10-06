// preload.js

const { contextBridge, shell } = require('electron');

// Exponemos una API global llamada 'electronAPI' al front-end
contextBridge.exposeInMainWorld('electronAPI', {
  // Abre en el navegador externo solo las descargas de nuestro repo (nunca cualquier URL o protocolo)
  openExternal: (url) => {
    if (typeof url === "string" && url.startsWith("https://github.com/GeronimoMariani/AlertasColonBA/")) {
      return shell.openExternal(url);
    }
  }
});
