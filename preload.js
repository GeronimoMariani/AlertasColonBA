// preload.js

const { contextBridge, shell } = require('electron');

// Exponemos una API global llamada 'electronAPI' al front-end
contextBridge.exposeInMainWorld('electronAPI', {
  // Una función que abre URLs en el navegador externo usando la API shell de Electron
  openExternal: (url) => shell.openExternal(url)
});
